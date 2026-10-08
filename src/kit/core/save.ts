// Saving and resuming (part-interface.md section 8). Every write is a temp file
// + fsync + rename in the same folder, so a crash leaves the old file or the
// new one, never half of one. Nothing secret is written: a write that holds a
// token, a login or a signed link is refused.
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { link, mkdir, open, readFile, rename, stat, unlink } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { RunRecord, StepRecord } from '../part-interface';
import { holdsSecret } from './secrets';
import { stepFolder, type RunLayout } from './paths';

export async function atomicWrite(target: string, data: string | Buffer): Promise<void> {
  if (typeof data === 'string' && holdsSecret(data)) throw new Error('Refused to save a secret to the video folder.');
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.pending`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, target);
    const dir = await open(path.dirname(target), 'r');
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}

export async function writeJson(target: string, value: unknown): Promise<void> {
  await atomicWrite(target, JSON.stringify(value, null, 2) + '\n');
}

export async function readJson<T>(target: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(target, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Creates `target` holding `data` only when it does not exist yet. The bytes
 * go to a temp file first and are hard-linked into place, so nobody ever
 * reads the file half-written. False when the file already exists.
 */
export async function createExclusive(target: string, data: string): Promise<boolean> {
  if (holdsSecret(data)) throw new Error('Refused to save a secret to the video folder.');
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.pending`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temp, target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

interface LockFile {
  pid: number;
  host: string;
  started_at: string;
  /** This holder's own mark, so a release never removes another holder's lock. */
  holder: string;
}

/** A lock nobody can read is treated as held until it is this old. */
const UNREADABLE_LOCK_MS = 60_000;
/** A stale-lock recovery that takes longer than this was left by a crash. */
const RECOVERY_MS = 30_000;

type LockState = { state: 'free' } | { state: 'live' } | { state: 'elsewhere' } | { state: 'stale'; raw: string };

async function lockState(file: string, host: string): Promise<LockState> {
  let raw: string;
  let mtime: number;
  try {
    raw = await readFile(file, 'utf8');
    mtime = (await stat(file)).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'free' };
    throw error;
  }
  let held: LockFile | null = null;
  try {
    held = JSON.parse(raw) as LockFile;
  } catch {
    held = null;
  }
  if (!held || typeof held.pid !== 'number' || typeof held.host !== 'string') {
    return Date.now() - mtime > UNREADABLE_LOCK_MS ? { state: 'stale', raw } : { state: 'live' };
  }
  if (held.host !== host) return { state: 'elsewhere' };
  return processAlive(held.pid) ? { state: 'live' } : { state: 'stale', raw };
}

/**
 * Takes run.lock. A lock left by a process that is gone on this computer is
 * taken over, so "run the same command again" works after a crash; a live one,
 * or one from another computer sharing the folder, is refused. Taking over a
 * stale lock happens under a second, short-lived lock, so two runs that both
 * find it stale never both take it.
 */
export async function takeRunLock(layout: RunLayout, now: Date): Promise<() => Promise<void>> {
  await mkdir(layout.root, { recursive: true, mode: 0o700 });
  const mine: LockFile = { pid: process.pid, host: os.hostname(), started_at: now.toISOString(), holder: randomUUID() };
  const guard = `${layout.lock}.recover`;
  for (let tries = 0; tries < 50; tries++) {
    if (await createExclusive(layout.lock, JSON.stringify(mine) + '\n')) {
      return async () => {
        const held = await readJson<LockFile>(layout.lock);
        if (held && held.holder === mine.holder) await unlink(layout.lock).catch(() => undefined);
      };
    }
    const found = await lockState(layout.lock, mine.host);
    if (found.state === 'free') continue;
    if (found.state === 'elsewhere') throw new Error('This video is being made on another computer that shares this folder.');
    if (found.state === 'live') throw new Error('This video is already being made in another window on this computer.');
    if (!(await createExclusive(guard, JSON.stringify(mine)))) {
      const since = await stat(guard).then((s) => Date.now() - s.mtimeMs).catch(() => 0);
      if (since > RECOVERY_MS) await unlink(guard).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }
    try {
      // Under the guard, remove the lock only if it is still the same stale one.
      const again = await lockState(layout.lock, mine.host);
      if (again.state === 'stale' && again.raw === found.raw) await unlink(layout.lock).catch(() => undefined);
    } finally {
      await unlink(guard).catch(() => undefined);
    }
  }
  throw new Error('This video is already being made in another window on this computer.');
}

/** The run folder's records: run.json, each step's record.json and the upload stages. */
export class RunStore {
  constructor(readonly layout: RunLayout) {}

  readRun(): Promise<RunRecord | null> {
    return readJson<RunRecord>(this.layout.run);
  }

  writeRun(record: RunRecord): Promise<void> {
    return writeJson(this.layout.run, record);
  }

  stepDir(stepId: string): string {
    return stepFolder(this.layout, stepId);
  }

  readStep(stepId: string): Promise<StepRecord | null> {
    return readJson<StepRecord>(path.join(this.stepDir(stepId), 'record.json'));
  }

  writeStep(record: StepRecord): Promise<void> {
    return writeJson(path.join(this.stepDir(record.step), 'record.json'), record);
  }

  readUpload<T>(): Promise<T | null> {
    return readJson<T>(this.layout.upload);
  }

  writeUpload(value: unknown): Promise<void> {
    return writeJson(this.layout.upload, value);
  }
}

export function removeFolder(target: string): void {
  fs.rmSync(target, { recursive: true, force: true });
}
