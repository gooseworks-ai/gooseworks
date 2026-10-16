// An edited step (gooseworks-app video-line/patch.ts holds the server's side).
//
// When a step's own code is wrong, `video step <id> <step> --edit` takes the exact part version the
// video's lock gives that step out into <run>/patches/<step>/, next to an untouched copy and a record
// of every file's locked hash. `video make <id> --patched <step>` then sends the edit with the
// hand-over (which files changed, from which hash to which, and a bounded unified diff), loads the
// edited copy for that step only, and names the edit in the upload. Everything else is checked
// against the lock as always. The server keeps the edit on the run, refuses any paid piece an edited
// part did not already order for this video, and keeps the edit on the finished version.
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { PartRef, PartsLock } from '../part-interface';
import type { PartLoader } from '../parts/loader';
import { canonicalHash } from './canonical';
import { unifiedDiff } from './diff';
import { KitStop } from './errors';
import { lockedRef } from './lock';
import { runLayout, type RunLayout } from './paths';
import { readJson, writeJson } from './save';

/** The server's step id rule. */
const STEP_ID = /^[a-z0-9][a-z0-9_-]{0,59}$/;
/** The paths an edit may change: the server's FILE_PATH (gooseworks-app video-line/patch.ts). */
const PATCH_FILE_PATH = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}(\/[A-Za-z0-9_][A-Za-z0-9._-]{0,99}){0,7}$/;
/** All steps' diffs together (the server's MAX_PATCH_DIFF_CHARS). */
export const MAX_PATCH_DIFF_CHARS = 48 * 1024;
export const MAX_PATCHED_STEPS = 4;
export const MAX_PATCHED_FILES = 20;

export interface PatchedFile {
  path: string;
  original_sha256: string;
  patched_sha256: string;
}

export interface PatchStep {
  step: string;
  part: PartRef;
  files: PatchedFile[];
  diff: string;
  /** sha256 of the whole diff, which may have been cut to fit. */
  diff_sha256: string;
  diff_truncated: boolean;
}

/** What the hand-over carries; the server checks it against the lock it hands over. */
export interface KitPatch {
  patch: 1;
  /** canonicalHash of the steps without their diff text. */
  sha256: string;
  steps: PatchStep[];
}

/** What `video step --edit` writes next to the copy: the part and every file's locked hash. */
interface TakeOutRecord {
  take_out: 1;
  step: string;
  part: PartRef;
  files: Record<string, string>;
  taken_at: string;
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function patchSha256(steps: PatchStep[]): string {
  return canonicalHash(steps.map(({ diff: _diff, ...rest }) => rest));
}

/** One step's own fingerprint in its step hash, so an edited step and every step after it run again. */
export function stepPatchHash(step: PatchStep): string {
  return canonicalHash({ part: step.part, files: step.files });
}

/** Where a step's edit lives. */
export function patchFolders(layout: RunLayout, step: string): { code: string; original: string; record: string } {
  if (!STEP_ID.test(step)) throw new KitStop(`"${step}" is not a step name.`, 'refused');
  return {
    code: path.join(layout.patches, step),
    original: path.join(layout.patches, `${step}.original`),
    record: path.join(layout.patches, `${step}.json`),
  };
}

/** The part a step runs, from the lock (layers) or the style kept from the last run (timeline steps). */
async function stepPart(layout: RunLayout, lock: PartsLock, step: string): Promise<PartRef> {
  let ref: PartRef | undefined;
  let names: string[] = Object.keys(lock.layers ?? {}).map((slot) => `layer-${slot}`);
  if (step.startsWith('layer-')) {
    ref = (lock.layers as Record<string, PartRef | undefined>)[step.slice('layer-'.length)];
  } else {
    const style = await readJson<{ timeline?: Array<{ id: string; part: PartRef }> }>(path.join(layout.style, 'style.json')).catch(() => null);
    const timeline = Array.isArray(style?.timeline) ? style!.timeline : [];
    names = [...timeline.map((s) => s.id), ...names];
    const pin = timeline.find((s) => s.id === step)?.part;
    ref = pin && lockedRef(pin, lock);
  }
  if (!ref || typeof ref.id !== 'string' || typeof ref.version !== 'string') {
    throw new KitStop(`This video has no step "${step}". Its steps: ${names.join(', ')}.`, 'refused');
  }
  if (lock.parts[ref.id]?.version !== ref.version) {
    throw new KitStop(`Step "${step}" runs ${ref.id} ${ref.version}, which is not in this video’s parts list. Make the video once, then take the step out again.`, 'refused');
  }
  return { id: ref.id, version: ref.version };
}

/** Every file below `dir` by its path with `/`, refusing links. */
async function filesIn(dir: string): Promise<Map<string, Buffer>> {
  const found = new Map<string, Buffer>();
  const walk = async (rel: string): Promise<void> => {
    for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) found.set(child, await fs.readFile(path.join(dir, ...child.split('/'))));
      else throw new KitStop(`${path.join(dir, child)} is a link or a special file; a part’s copy may hold plain files only.`, 'refused');
    }
  };
  await walk('');
  return found;
}

async function copyFiles(files: Map<string, Buffer>, dir: string, mode: number): Promise<void> {
  for (const [file, bytes] of files) {
    const target = path.join(dir, ...file.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fs.writeFile(target, bytes, { mode, flag: 'wx' });
  }
}

/** Whether the untouched copy holds exactly the locked files. */
async function originalIntact(dir: string, locked: Record<string, string>): Promise<boolean> {
  const original = await filesIn(dir).catch(() => null);
  if (!original || original.size !== Object.keys(locked).length) return false;
  return Object.entries(locked).every(([file, hash]) => original.has(file) && sha256(original.get(file)!) === hash);
}

/** The longest start of `text` whose JSON string form fits in `maxBytes` of UTF-8, cut on a character edge. */
function fitDiff(text: string, maxBytes: number): string {
  const fits = (t: string) => Buffer.byteLength(JSON.stringify(t), 'utf8') <= maxBytes;
  if (fits(text)) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(text.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  let end = lo;
  // Never end on the first half of a surrogate pair.
  if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(0, end);
}

export interface TakenOut {
  dir: string;
  part: PartRef;
  /** The copy was already there, edits and all. */
  kept: boolean;
  /** Where an older copy for another version was moved. */
  movedAside: string | null;
}

/**
 * `video step <id> <step> --edit`: the step's locked part, checked against the lock like any load,
 * copied into <run>/patches/<step>/ to edit. A copy of the same part version is kept as it is.
 */
export async function takeOutStep(input: { home: string; videoId: string; step: string; env: NodeJS.ProcessEnv; loader: PartLoader; now?: () => Date }): Promise<TakenOut> {
  const layout = runLayout(input.home, input.videoId);
  const folders = patchFolders(layout, input.step);
  const lock = await readJson<PartsLock>(layout.partsLock).catch(() => null);
  if (!lock?.parts) throw new KitStop('This video has not been made on this computer yet. Run video make for it first, then take the step out.', 'refused');
  const part = await stepPart(layout, lock, input.step);
  const locked = lock.parts[part.id].files;

  const record = await readJson<TakeOutRecord>(folders.record).catch(() => null);
  const same = record?.part.id === part.id && record.part.version === part.version && canonicalHash(record.files) === canonicalHash(locked);
  const lockedFiles = async (): Promise<Map<string, Buffer>> => {
    const loaded = await input.loader.load({ ref: part, lock, dev: false, home: input.home, env: input.env, signal: new AbortController().signal });
    const files = new Map<string, Buffer>();
    for (const file of Object.keys(locked)) {
      const bytes = await fs.readFile(path.join(loaded.dir, ...file.split('/')));
      if (sha256(bytes) !== locked[file]) throw new KitStop(`${part.id} ${part.version} changed on this computer while it was copied. Run the same command again.`, 'stop');
      files.set(file, bytes);
    }
    return files;
  };
  if (same && (await fs.stat(folders.code).catch(() => null))) {
    // The edits stay; a damaged untouched copy is made again from the locked part, so the edit can be read.
    if (!(await originalIntact(folders.original, locked))) {
      await fs.rm(folders.original, { recursive: true, force: true });
      await copyFiles(await lockedFiles(), folders.original, 0o444);
    }
    return { dir: folders.code, part, kept: true, movedAside: null };
  }

  let movedAside: string | null = null;
  if (await fs.lstat(folders.code).catch(() => null)) {
    // An edit of another version is never deleted: it moves aside for the agent to compare.
    movedAside = `${folders.code}.replaced-${(input.now?.() ?? new Date()).toISOString().replace(/[-:.]/g, '')}`;
    await fs.rename(folders.code, movedAside);
  }
  await fs.rm(folders.original, { recursive: true, force: true });
  await fs.rm(folders.record, { force: true });

  const files = await lockedFiles();
  await copyFiles(files, folders.original, 0o444);
  await copyFiles(files, folders.code, 0o600);
  await writeJson(folders.record, { take_out: 1, step: input.step, part, files: locked, taken_at: (input.now?.() ?? new Date()).toISOString() } satisfies TakeOutRecord);
  return { dir: folders.code, part, kept: false, movedAside };
}

/** The edit of each named step, read from its folder and checked against its untouched copy. */
export async function readPatch(layout: RunLayout, steps: string[]): Promise<KitPatch> {
  const unique = [...new Set(steps)];
  if (!unique.length) throw new KitStop('Name the steps to make the video with, e.g. --patched cut.', 'refused');
  if (unique.length > MAX_PATCHED_STEPS) throw new KitStop(`A video can be made with at most ${MAX_PATCHED_STEPS} edited steps.`, 'refused');
  const read: Array<Omit<PatchStep, 'diff' | 'diff_sha256' | 'diff_truncated'> & { fullDiff: string }> = [];
  for (const step of unique) {
    const folders = patchFolders(layout, step);
    const record = await readJson<TakeOutRecord>(folders.record).catch(() => null);
    if (!record || record.step !== step || !record.files) {
      throw new KitStop(`Step "${step}" has not been taken out. Run video step ${path.basename(layout.root)} ${step} --edit first.`, 'refused');
    }
    const original = await filesIn(folders.original).catch((error: unknown) => {
      if (error instanceof KitStop) throw error;
      return new Map<string, Buffer>();
    });
    const code = await filesIn(folders.code).catch((error: unknown) => {
      if (error instanceof KitStop) throw error;
      throw new KitStop(`The copy of step "${step}" is missing. Take it out again with video step --edit.`, 'refused');
    });
    const locked = Object.keys(record.files);
    if (original.size !== locked.length || locked.some((file) => !original.has(file) || sha256(original.get(file)!) !== record.files[file])) {
      throw new KitStop(`The untouched copy of step "${step}" changed. Take it out again with video step --edit.`, 'refused');
    }
    const extra = [...code.keys()].filter((file) => !(file in record.files));
    if (extra.length) throw new KitStop(`Step "${step}" may only change the part’s own files; remove ${extra.join(', ')}.`, 'refused');
    const missing = locked.filter((file) => !code.has(file));
    if (missing.length) throw new KitStop(`Step "${step}" is missing ${missing.join(', ')}; put the files back.`, 'refused');
    const files: PatchedFile[] = [];
    const diffs: string[] = [];
    for (const file of locked.sort()) {
      const patched = sha256(code.get(file)!);
      if (patched === record.files[file]) continue;
      // part.json holds the models and limits the customer's price was made from.
      if (file === 'part.json') throw new KitStop(`Step "${step}" changed part.json, which can’t change; edit the code only.`, 'refused');
      if (!PATCH_FILE_PATH.test(file)) throw new KitStop(`Step "${step}" changed ${file}, a file the line takes no edit of (its path is too long or starts with "." or "-"); edit the code in another file.`, 'refused');
      files.push({ path: file, original_sha256: record.files[file], patched_sha256: patched });
      diffs.push(unifiedDiff(file, original.get(file)!, code.get(file)!));
    }
    if (!files.length) throw new KitStop(`Nothing changed in step "${step}".`, 'refused');
    if (files.length > MAX_PATCHED_FILES) throw new KitStop(`Step "${step}" changed ${files.length} files; an edit may change at most ${MAX_PATCHED_FILES}.`, 'refused');
    read.push({ step, part: record.part, files, fullDiff: diffs.join('') });
  }
  // Each step's diff is cut to its share, so every edit is on the record.
  const share = Math.floor(MAX_PATCH_DIFF_CHARS / read.length);
  // The share is in bytes as the request carries them (UTF-8, JSON-escaped), which the server's body limit counts.
  const out: PatchStep[] = read.map(({ fullDiff, ...step }) => {
    const diff = fitDiff(fullDiff, share);
    return { ...step, diff, diff_sha256: sha256(Buffer.from(fullDiff, 'utf8')), diff_truncated: diff.length < fullDiff.length };
  });
  return { patch: 1, sha256: patchSha256(out), steps: out };
}

/** Why the lock this hand-over gave can't take the edit (the server checks the same), or null. */
export function patchLockProblem(patch: KitPatch, lock: PartsLock): string | null {
  for (const step of patch.steps) {
    const locked = lock.parts[step.part.id];
    if (!locked || locked.version !== step.part.version) return `Step "${step.step}" now runs another version of its part. Take it out again with video step --edit and redo the edit.`;
    if (step.files.some((file) => locked.files[file.path] !== file.original_sha256)) return `Step "${step.step}" was taken out from other files than this video now uses. Take it out again with video step --edit and redo the edit.`;
  }
  return null;
}

/** Every file hash the edited copy of a step must have: the lock's, with the edited files' new hashes. */
export function patchedFiles(step: PatchStep, lock: PartsLock): Record<string, string> {
  const files = { ...lock.parts[step.part.id].files };
  for (const file of step.files) files[file.path] = file.patched_sha256;
  return files;
}
