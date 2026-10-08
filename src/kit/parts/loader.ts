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
// Files are cached under <home>/kit/parts/<id>/<version>/ and re-hashed on
// every load; a cached file that no longer matches is downloaded again, and a
// file the lock does not list is removed from the folder, so a part can only
// ever see the files the lock vouches for.
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

async function readIfRegular(file: string): Promise<Buffer | null> {
  const stat = await fs.lstat(file).catch(() => null);
  if (!stat) return null;
  if (!stat.isFile()) {
    await fs.rm(file, { recursive: true, force: true });
    return null;
  }
  return fs.readFile(file);
}

/** Every path under `dir` that is not a locked file is removed, links included. */
async function removeStrays(dir: string, keep: Set<string>, rel = ''): Promise<void> {
  const entries = await fs.readdir(path.join(dir, rel), { withFileTypes: true });
  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(dir, child);
    if (entry.isDirectory()) {
      const prefix = `${child}/`;
      if ([...keep].some((file) => file.startsWith(prefix))) await removeStrays(dir, keep, child);
      else await fs.rm(full, { recursive: true, force: true });
    } else if (!entry.isFile() || !keep.has(child)) {
      await fs.rm(full, { recursive: true, force: true });
    }
  }
}

/** A real folder at `dir` (an existing link is replaced), private to this user. */
async function ensureFolder(dir: string): Promise<void> {
  const stat = await fs.lstat(dir).catch(() => null);
  if (stat && !stat.isDirectory()) await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
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

    const partsRoot = path.join(request.home, 'kit', 'parts');
    const dir = path.join(partsRoot, ref.id, ref.version);
    const tmpRoot = path.join(partsRoot, '.tmp');
    await ensureFolder(path.join(partsRoot, ref.id));
    await ensureFolder(dir);

    // Verify every file before anything is imported. The two files the core
    // reads are kept as the bytes that were hashed.
    let total = 0;
    const verified = new Map<string, Buffer>();
    for (const file of Object.keys(locked.files).sort()) {
      const want = locked.files[file];
      const target = path.join(dir, ...file.split('/'));
      let bytes = await readIfRegular(target);
      if (bytes && sha256(bytes) !== want) {
        await fs.rm(target, { force: true });
        bytes = null;
      }
      if (!bytes) {
        const remaining = MAX_FOLDER_BYTES - total;
        const limit = file === 'part.mjs' ? Math.min(MAX_ENTRY_BYTES, remaining) : remaining;
        const url = `${source.rawBase}/parts/${ref.id}/${ref.version}/${file.split('/').map(encodeURIComponent).join('/')}`;
        try {
          bytes = await fetchBytes(fetchImpl, url, { maxBytes: limit, timeoutMs, signal: request.signal, what: `${ref.id} ${ref.version} ${file}` });
        } catch (error) {
          throw new PartLoadError('unreachable', error instanceof CatalogError ? error.message : `Could not download ${ref.id} ${ref.version}.`);
        }
        if (sha256(bytes) !== want) {
          throw new PartLoadError('hash_mismatch', `${named(ref)} does not match this video’s parts list (${file}), so it can’t run.`);
        }
        await ensureFolder(tmpRoot);
        const tmp = path.join(tmpRoot, `${ref.id}-${ref.version}-${randomBytes(6).toString('hex')}`);
        await fs.writeFile(tmp, bytes, { mode: 0o600 });
        await ensureFolder(path.dirname(target));
        await fs.rename(tmp, target);
      }
      total += bytes.length;
      if (total > MAX_FOLDER_BYTES || (file === 'part.mjs' && bytes.length > MAX_ENTRY_BYTES)) {
        throw new PartLoadError('too_large', `${named(ref)} is larger than a part may be.`);
      }
      if (file === 'part.json' || file === 'part.mjs') verified.set(file, bytes);
    }
    await removeStrays(dir, new Set(Object.keys(locked.files)));

    const manifest = checkManifest(ref, verified.get('part.json')!, locked);
    const entry = path.join(dir, 'part.mjs');
    // The hash in the address ties Node's module cache to these exact bytes.
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
