// Loads one part version for the kit core (part-interface.md section 6).
//
// Published parts are frozen version folders in goose-skills:
// `<raw base>/parts/<id>/<version>/` holds part.json, part.mjs and assets. The
// video's PartsLock, handed over by our server at the yes, is the trust
// anchor: every file's sha256 must match it on every load, and the part's
// models and kit range must match both the lock and the published index.
// A version that is withdrawn, missing from the index or out of this kit's
// range is refused. Nothing is imported until every check has passed, so a
// refused part never runs and nothing is spent.
//
// Each verified copy is a folder of its own, keyed by the part and the exact
// file hashes the lock gives it: <home>/kit/parts/<id>/<version>/<key>/. It is
// written in a temporary folder and renamed into place whole, never changed
// afterwards, and re-hashed on every load; a copy that no longer matches, or
// holds a file the lock does not list, is replaced. So two runs with
// different locks never share a folder, and a part only ever sees the files
// its lock vouches for. No link is followed below the kit home.
//
// GOOSE_KIT_PARTS_DIR (a local goose-skills checkout) loads parts from disk
// without the lock's hashes, for building parts during the sprint. It works
// only against staging or a local server and marks the part `source: "dev"`.
import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { LockedPart, ModelNeed, PartManifest, PartRef, PartRun, PartsLock } from '../part-interface';
import { apiEnvironment, kitApiBase, KIT_DEV_ENV } from '../env';
import { gooseSkillsSource } from '../../skills/installer';
import {
  CatalogError,
  fetchBytes,
  fetchCatalog,
  fileHashes,
  isPartId,
  modelList,
  partKey,
  parseWithdrawn,
  sameFiles,
  sameModels,
  type FetchLike,
  type PartsCatalog,
} from './catalog';
import { isExactVersion, satisfiesKitRange } from './semver';

/** part-interface.md section 4, rule 7. */
export const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
export const MAX_FOLDER_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

export type PartLoadCode =
  | 'not_locked'
  | 'withdrawn'
  | 'not_published'
  | 'hash_mismatch'
  | 'index_mismatch'
  | 'manifest_mismatch'
  | 'kit_range'
  | 'too_large'
  | 'unreachable'
  | 'dev_refused'
  | 'bad_cache'
  | 'bad_part';

/** A part that must not run. The message is plain and names the part; nothing was spent. */
export class PartLoadError extends Error {
  constructor(
    readonly code: PartLoadCode,
    message: string,
  ) {
    super(message);
    this.name = 'PartLoadError';
  }
}

export interface LoadedPart {
  manifest: PartManifest;
  /** The part's read-only version folder (ctx.part.dir). */
  dir: string;
  run: PartRun;
  source: 'published' | 'dev';
}

/** What the core passes for each part (the core's PartLoader.load). */
export interface PartLoadRequest {
  ref: PartRef;
  /** The video's lock. Required unless `dev`. */
  lock: PartsLock | null;
  /** Load from GOOSE_KIT_PARTS_DIR instead of the published folders. */
  dev: boolean;
  /** The kit home (~/.gooseworks, or GOOSE_KIT_HOME). */
  home: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
}

export interface PartLoaderOptions {
  /** This kit's version, checked against each part's kit range. */
  kitVersion: string;
  fetch?: FetchLike;
  /** Imports a verified part.mjs by file URL. */
  importModule?: (url: string) => Promise<unknown>;
  timeoutMs?: number;
}

export interface PartLoader {
  load(request: PartLoadRequest): Promise<LoadedPart>;
}

// Kept out of the TypeScript output so it stays a real ES import under CommonJS.
const nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<unknown>;

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const named = (ref: PartRef): string => `Part ${ref.id} ${ref.version}`;

function checkRef(ref: PartRef): void {
  if (!ref || !isPartId(ref.id) || !isExactVersion(ref.version)) {
    throw new PartLoadError('bad_part', 'This video names a part this kit cannot read.');
  }
}

/** The lock's entry for `ref`, checked for shape. */
function lockedEntry(ref: PartRef, lock: PartsLock | null): { files: Record<string, string>; models: ModelNeed[]; kit: string } {
  const entry = lock?.parts?.[ref.id] as LockedPart | undefined;
  if (!lock || !entry || entry.version !== ref.version) {
    throw new PartLoadError('not_locked', `${named(ref)} is not in this video’s parts list, so it can’t run.`);
  }
  const files = fileHashes(entry.files);
  const models = modelList(entry.models);
  if (!files || !models || typeof entry.kit !== 'string' || !files['part.json'] || !files['part.mjs']) {
    throw new PartLoadError('not_locked', `This video’s parts list has an entry for ${ref.id} that this kit cannot read.`);
  }
  return { files, models, kit: entry.kit };
}

function checkKit(ref: PartRef, range: string, kitVersion: string): void {
  if (!satisfiesKitRange(kitVersion, range)) {
    throw new PartLoadError('kit_range', `${named(ref)} runs on kit ${range}; this kit is ${kitVersion}.`);
  }
}

/** The manifest must be the part the lock names, with the same files, models and kit range. */
function checkManifest(ref: PartRef, bytes: Buffer, expect: { files?: Record<string, string>; models?: ModelNeed[]; kit?: string }): PartManifest {
  let manifest: PartManifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8')) as PartManifest;
  } catch {
    throw new PartLoadError('bad_part', `${named(ref)} has a part.json this kit cannot read.`);
  }
  const mismatch = (what: string) => new PartLoadError('manifest_mismatch', `${named(ref)} does not match this video’s parts list (${what}).`);
  if (!manifest || typeof manifest !== 'object') throw mismatch('part.json');
  if (manifest.id !== ref.id || manifest.version !== ref.version) throw mismatch('name or version');
  if (manifest.runtime !== 'node' || manifest.entry !== 'part.mjs') throw mismatch('entry');
  const models = modelList(manifest.needs?.models);
  if (!models) throw mismatch('models');
  if (expect.models && !sameModels(models, expect.models)) throw mismatch('models');
  if (expect.kit !== undefined && manifest.kit !== expect.kit) throw mismatch('kit range');
  if (expect.files) {
    if (!Array.isArray(manifest.files)) throw mismatch('files');
    const listed = new Set<string>([...manifest.files, 'part.json']);
    const locked = Object.keys(expect.files);
    if (listed.size !== locked.length || !locked.every((file) => listed.has(file))) throw mismatch('files');
  }
  return manifest;
}

function exportedRun(ref: PartRef, mod: unknown): PartRun {
  const run = (mod as { run?: unknown } | null)?.run;
  if (typeof run !== 'function') throw new PartLoadError('bad_part', `${named(ref)} has no run function.`);
  return run as PartRun;
}

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

/**
 * `base`/`segments…` as real folders, made when missing. A link or a file in
 * the way is refused, so nothing is ever written outside the kit home.
 */
async function realFolder(base: string, segments: string[]): Promise<string> {
  let dir = base;
  for (const segment of segments) {
    dir = path.join(dir, segment);
    let stat = await fs.lstat(dir).catch((error) => (isMissing(error) ? null : Promise.reject(error)));
    if (!stat) {
      await fs.mkdir(dir, { mode: 0o700 }).catch((error) => ((error as NodeJS.ErrnoException).code === 'EEXIST' ? undefined : Promise.reject(error)));
      stat = await fs.lstat(dir);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new PartLoadError('bad_cache', `${dir} is not a plain folder, so the kit will not store parts through it. Move it away and run the same command again.`);
    }
  }
  return dir;
}

/**
 * The files of a stored copy, each checked against its hash, or null when the
 * copy is missing, holds anything the lock does not list, holds a link, or
 * has a file that does not match.
 */
async function readCopy(dir: string, files: Record<string, string>): Promise<Map<string, Buffer> | null> {
  const top = await fs.lstat(dir).catch(() => null);
  if (!top || !top.isDirectory()) return null;
  const wantDirs = new Set<string>();
  for (const file of Object.keys(files)) {
    const segments = file.split('/');
    for (let i = 1; i < segments.length; i++) wantDirs.add(segments.slice(0, i).join('/'));
  }
  const seen = new Map<string, Buffer>();
  let total = 0;
  const walk = async (rel: string): Promise<boolean> => {
    for (const entry of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!wantDirs.has(child) || !(await walk(child))) return false;
      } else if (entry.isFile() && Object.prototype.hasOwnProperty.call(files, child)) {
        const full = path.join(dir, ...child.split('/'));
        const stat = await fs.lstat(full);
        total += stat.size;
        if (total > MAX_FOLDER_BYTES || (child === 'part.mjs' && stat.size > MAX_ENTRY_BYTES)) return false;
        const bytes = await fs.readFile(full);
        if (sha256(bytes) !== files[child]) return false;
        seen.set(child, bytes);
      } else {
        return false;
      }
    }
    return true;
  };
  if (!(await walk(''))) return null;
  return seen.size === Object.keys(files).length ? seen : null;
}

/** The copy's folder name: the part, its version and every locked file hash. */
function copyKey(ref: PartRef, files: Record<string, string>): string {
  const listed = Object.keys(files).sort().map((file) => [file, files[file]]);
  return sha256(Buffer.from(JSON.stringify([ref.id, ref.version, listed]))).slice(0, 32);
}

export function createPartLoader(options: PartLoaderOptions): PartLoader {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const importModule = options.importModule ?? nativeImport;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // The lists are read once per run of the kit, from the origin the first load used.
  const catalogs = new Map<string, Promise<PartsCatalog>>();

  function catalogFor(rawBase: string, signal: AbortSignal): Promise<PartsCatalog> {
    let pending = catalogs.get(rawBase);
    if (!pending) {
      pending = fetchCatalog(fetchImpl, rawBase, { timeoutMs, signal });
      // A failed read is not kept: the next load tries again.
      pending.catch(() => catalogs.delete(rawBase));
      catalogs.set(rawBase, pending);
    }
    return pending;
  }

  async function loadPublished(request: PartLoadRequest): Promise<LoadedPart> {
    const { ref } = request;
    const locked = lockedEntry(ref, request.lock);
    checkKit(ref, locked.kit, options.kitVersion);

    let source;
    try {
      source = gooseSkillsSource(request.env);
    } catch (error) {
      throw new PartLoadError('unreachable', (error as Error).message);
    }
    let catalog: PartsCatalog;
    try {
      catalog = await catalogFor(source.rawBase, request.signal);
    } catch (error) {
      throw new PartLoadError('unreachable', error instanceof CatalogError ? error.message : 'Could not read the published parts list.');
    }
    if (catalog.withdrawn.has(partKey(ref.id, ref.version))) {
      throw new PartLoadError('withdrawn', `${named(ref)} was withdrawn, so this video can’t use it. The video needs a new plan.`);
    }
    const published = catalog.index.get(partKey(ref.id, ref.version));
    if (!published) {
      throw new PartLoadError('not_published', `${named(ref)} is not in the published parts list.`);
    }
    if (!sameFiles(published.files, locked.files) || !sameModels(published.models, locked.models) || published.kit !== locked.kit) {
      throw new PartLoadError('index_mismatch', `${named(ref)} in this video’s parts list does not match the published part.`);
    }

    await fs.mkdir(request.home, { recursive: true, mode: 0o700 });
    const home = await fs.realpath(request.home);
    const versionDir = await realFolder(home, ['kit', 'parts', ref.id, ref.version]);
    const tmpRoot = await realFolder(home, ['kit', 'parts', '.tmp']);
    const dir = path.join(versionDir, copyKey(ref, locked.files));

    let verified = await readCopy(dir, locked.files);
    if (!verified) {
      // Download and check every file in memory, then publish the copy whole.
      const downloaded = new Map<string, Buffer>();
      let total = 0;
      for (const file of Object.keys(locked.files).sort()) {
        const limit = file === 'part.mjs' ? Math.min(MAX_ENTRY_BYTES, MAX_FOLDER_BYTES - total) : MAX_FOLDER_BYTES - total;
        if (limit <= 0) throw new PartLoadError('too_large', `${named(ref)} is larger than a part may be.`);
        const url = `${source.rawBase}/parts/${ref.id}/${ref.version}/${file.split('/').map(encodeURIComponent).join('/')}`;
        let bytes: Buffer;
        try {
          bytes = await fetchBytes(fetchImpl, url, { maxBytes: limit, timeoutMs, signal: request.signal, what: `${ref.id} ${ref.version} ${file}` });
        } catch (error) {
          const tooLarge = error instanceof CatalogError && /larger than a part may be/.test(error.message);
          throw new PartLoadError(tooLarge ? 'too_large' : 'unreachable', error instanceof CatalogError ? error.message : `Could not download ${ref.id} ${ref.version}.`);
        }
        if (sha256(bytes) !== locked.files[file]) {
          throw new PartLoadError('hash_mismatch', `${named(ref)} does not match this video’s parts list (${file}), so it can’t run.`);
        }
        total += bytes.length;
        downloaded.set(file, bytes);
      }
      const staging = await fs.mkdtemp(path.join(tmpRoot, `${ref.id}-${ref.version}-`));
      try {
        for (const [file, bytes] of downloaded) {
          const target = path.join(staging, ...file.split('/'));
          await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
          await fs.writeFile(target, bytes, { mode: 0o600, flag: 'wx' });
        }
        // A damaged copy is moved aside first; a folder cannot be renamed over another.
        if (await fs.lstat(dir).catch(() => null)) {
          const stale = path.join(tmpRoot, `stale-${randomBytes(6).toString('hex')}`);
          await fs.rename(dir, stale).catch(() => undefined);
          await fs.rm(stale, { recursive: true, force: true });
        }
        await fs.rename(staging, dir).catch((error) => {
          // Another run published the same copy first; it is checked below.
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        });
      } finally {
        await fs.rm(staging, { recursive: true, force: true });
      }
      verified = await readCopy(dir, locked.files);
      if (!verified) {
        throw new PartLoadError('hash_mismatch', `${named(ref)} changed on this computer while it was being stored. Run the same command again.`);
      }
    }

    const manifest = checkManifest(ref, verified.get('part.json')!, locked);
    const entry = path.join(dir, 'part.mjs');
    // The folder is keyed by the lock's hashes and the address by the entry's,
    // so Node's module cache can only hand back these exact bytes.
    const mod = await importModule(`${pathToFileURL(entry).href}?sha256=${locked.files['part.mjs']}`);
    return { manifest, dir, run: exportedRun(ref, mod), source: 'published' };
  }

  async function loadDev(request: PartLoadRequest): Promise<LoadedPart> {
    const { ref } = request;
    if (apiEnvironment(kitApiBase(request.env)) === 'production') {
      throw new PartLoadError('dev_refused', `${KIT_DEV_ENV.partsDir} works only against staging or a local server.`);
    }
    const root = request.env[KIT_DEV_ENV.partsDir];
    if (!root) throw new PartLoadError('dev_refused', `${KIT_DEV_ENV.partsDir} is not set.`);
    // A goose-skills checkout keeps parts under parts/; a bare parts folder works too.
    const bases = [path.resolve(root, 'parts'), path.resolve(root)];
    let base: string | null = null;
    for (const candidate of bases) {
      if (await fs.stat(path.join(candidate, ref.id, ref.version, 'part.json')).catch(() => null)) {
        base = candidate;
        break;
      }
    }
    if (!base) throw new PartLoadError('not_published', `${named(ref)} is not in ${KIT_DEV_ENV.partsDir}.`);
    const withdrawnFile = path.join(base, 'withdrawn.json');
    const withdrawnBytes = await fs.readFile(withdrawnFile).catch(() => null);
    if (withdrawnBytes) {
      let withdrawn: Set<string>;
      try {
        withdrawn = parseWithdrawn(JSON.parse(withdrawnBytes.toString('utf8')));
      } catch {
        throw new PartLoadError('unreachable', `${withdrawnFile} is not a list this kit reads.`);
      }
      if (withdrawn.has(partKey(ref.id, ref.version))) {
        throw new PartLoadError('withdrawn', `${named(ref)} was withdrawn, so this video can’t use it.`);
      }
    }
    const dir = await fs.realpath(path.join(base, ref.id, ref.version));
    const manifest = checkManifest(ref, await fs.readFile(path.join(dir, 'part.json')), {});
    checkKit(ref, manifest.kit, options.kitVersion);
    const entry = path.join(dir, 'part.mjs');
    const bytes = await fs.readFile(entry).catch(() => null);
    if (!bytes) throw new PartLoadError('bad_part', `${named(ref)} has no part.mjs.`);
    const mod = await importModule(`${pathToFileURL(entry).href}?sha256=${sha256(bytes)}`);
    return { manifest, dir, run: exportedRun(ref, mod), source: 'dev' };
  }

  return {
    async load(request) {
      checkRef(request.ref);
      if (request.signal.aborted) throw new PartLoadError('unreachable', 'The video was stopped before its parts loaded.');
      return request.dev ? loadDev(request) : loadPublished(request);
    },
  };
}

/** One part by id and exact version, checked against the video's lock. */
export function loadPart(
  id: string,
  version: string,
  lock: PartsLock | null,
  options: PartLoaderOptions & { home: string; env?: NodeJS.ProcessEnv; dev?: boolean; signal?: AbortSignal },
): Promise<LoadedPart> {
  return createPartLoader(options).load({
    ref: { id, version },
    lock,
    dev: options.dev ?? false,
    home: options.home,
    env: options.env ?? process.env,
    signal: options.signal ?? new AbortController().signal,
  });
}
