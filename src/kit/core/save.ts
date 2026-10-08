// Saving and resuming (part-interface.md section 8). Every write is a temp file
// + fsync + rename in the same folder, so a crash leaves the old file or the
// new one, never half of one. Nothing secret is written: a write that holds a
// token, a login or a signed link is refused.
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { mkdir, open, readFile, rename, unlink } from 'fs/promises';
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
}

/**
 * Takes run.lock. A lock left by a process that is gone on this computer is
 * taken over, so "run the same command again" works after a crash; a live one,
 * or one from another computer sharing the folder, is refused.
 */
export async function takeRunLock(layout: RunLayout, now: Date): Promise<() => Promise<void>> {
  await mkdir(layout.root, { recursive: true, mode: 0o700 });
  const mine: LockFile = { pid: process.pid, host: os.hostname(), started_at: now.toISOString() };
  for (let tries = 0; tries < 3; tries++) {
    try {
      const handle = await open(layout.lock, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(mine) + '\n');
        await handle.sync();
      } finally {
        await handle.close();
      }
      return async () => {
        const held = await readJson<LockFile>(layout.lock);
        if (held && held.pid === mine.pid && held.host === mine.host) await unlink(layout.lock).catch(() => undefined);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const held = await readJson<LockFile>(layout.lock);
      if (held && held.host !== mine.host) throw new Error('This video is being made on another computer that shares this folder.');
      if (held && processAlive(held.pid)) throw new Error('This video is already being made in another window on this computer.');
      await unlink(layout.lock).catch(() => undefined);
    }
  }
  throw new Error('Could not take this video’s run lock.');
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
