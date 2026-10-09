// Folder helpers for the parts cache that never follow a link.
//
// The cache lives below the kit home, and other runs of the kit (in other
// processes) use it at the same time. These helpers make sure nothing is
// written or deleted through a link, and that only one run at a time
// publishes a given copy.
import { promises as fs, type Stats } from 'fs';
import * as os from 'os';
import * as path from 'path';

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
const lstatOrNull = (target: string): Promise<Stats | null> => fs.lstat(target).catch((error) => (isMissing(error) ? null : Promise.reject(error)));

/** A path that is in the way of the cache: a link, or a file where a folder belongs. */
export class NotAFolder extends Error {
  constructor(readonly at: string) {
    super(`${at} is not a plain folder`);
  }
}

/**
 * `base`/`segments…` as plain folders, made when missing (private to this
 * user). A link or a file in the way throws NotAFolder.
 */
export async function realFolder(base: string, segments: string[]): Promise<string> {
  let dir = base;
  for (const segment of segments) {
    dir = path.join(dir, segment);
    let stat = await lstatOrNull(dir);
    if (!stat) {
      await fs.mkdir(dir, { mode: 0o700 }).catch((error) => ((error as NodeJS.ErrnoException).code === 'EEXIST' ? undefined : Promise.reject(error)));
      stat = await fs.lstat(dir);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new NotAFolder(dir);
  }
  return dir;
}

async function sameFolder(target: string, seen: Stats): Promise<boolean> {
  const now = await lstatOrNull(target);
  return !!now && now.isDirectory() && !now.isSymbolicLink() && now.ino === seen.ino && now.dev === seen.dev;
}

export interface RemoveHooks {
  /** Called after a folder is looked at and before it is listed (tests use it to swap the folder). */
  beforeList?: (dir: string) => Promise<void>;
}

/**
 * Deletes `target` without following links. A link is removed itself, never
 * what it points to. Before every step inside a folder the folder is checked
 * again: if it was swapped for a link (or anything else), its listing belongs
 * to some other folder, so nothing more is deleted there.
 */
export async function removeTree(target: string, hooks: RemoveHooks = {}): Promise<void> {
  const seen = await lstatOrNull(target).catch(() => null);
  if (!seen) return;
  if (seen.isSymbolicLink() || !seen.isDirectory()) {
    await fs.unlink(target).catch(() => undefined);
    return;
  }
  await hooks.beforeList?.(target);
  let names: string[];
  try {
    names = await fs.readdir(target);
  } catch {
    return;
  }
  for (const name of names) {
    if (!(await sameFolder(target, seen))) return;
    await removeTree(path.join(target, name), hooks);
  }
  if (await sameFolder(target, seen)) await fs.rmdir(target).catch(() => undefined);
}

/** A lock older than this is from a run that died without cleaning up. */
const LOCK_STALE_MS = 10 * 60_000;
/** A lock this young may still be getting its contents written. */
const LOCK_WRITE_GRACE_MS = 30_000;
const LOCK_POLL_MS = 100;

function processGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

async function lockIsStale(file: string): Promise<boolean> {
  const stat = await lstatOrNull(file);
  if (!stat) return false;
  const age = Date.now() - stat.mtimeMs;
  let holder: { pid?: unknown; host?: unknown } | null = null;
  try {
    holder = JSON.parse(await fs.readFile(file, 'utf8')) as { pid?: unknown; host?: unknown };
  } catch {
    return age > LOCK_WRITE_GRACE_MS;
  }
  if (age > LOCK_STALE_MS) return true;
  return holder?.host === os.hostname() && typeof holder.pid === 'number' && processGone(holder.pid);
}

export class LockTimeout extends Error {}

/**
 * Runs `fn` while holding `<dir>/<name>.lock`, which other processes respect
 * too. A lock left by a run that died is taken over.
 */
export async function withFolderLock<T>(dir: string, name: string, opts: { timeoutMs: number; signal?: AbortSignal }, fn: () => Promise<T>): Promise<T> {
  const file = path.join(dir, `${name}.lock`);
  const deadline = Date.now() + opts.timeoutMs;
  for (;;) {
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), at: new Date().toISOString() }));
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await lockIsStale(file)) {
        // Only one waiter wins the rename; the others find the lock gone and try again.
        const aside = `${file}.${process.pid}.${Date.now()}.stale`;
        if (await fs.rename(file, aside).then(() => true, () => false)) await fs.unlink(aside).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline || opts.signal?.aborted) throw new LockTimeout(`${file} is held by another run`);
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.unlink(file).catch(() => undefined);
  }
}
