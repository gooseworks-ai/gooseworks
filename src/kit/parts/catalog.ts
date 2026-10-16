// The published list the loader reads from goose-skills (part-interface.md section 6):
//
//   parts/withdrawn.json  { withdrawn: [{ id, version, reason }] }
//
// It can change at any time, unlike the frozen version folders, so it is read
// fresh for every run. A list that cannot be read stops the video: a part is
// never run without knowing whether it was withdrawn. The published index is
// not read: the video's lock already holds every file's hash, and the index is
// served from a cache that can lag behind it.
import type { ModelNeed } from '../part-interface';

export const MAX_WITHDRAWN_BYTES = 1024 * 1024;

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export class CatalogError extends Error {}

export const partKey = (id: string, version: string): string => `${id}@${version}`;

const SHA256 = /^[a-f0-9]{64}$/;
const PART_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FILE_PATH = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

export function isPartId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && PART_ID.test(value);
}

/** A relative path inside a version folder: no absolute paths, no `.` or `..` segments. */
export function isSafeFilePath(value: string): boolean {
  if (value.length === 0 || value.length > 255 || !FILE_PATH.test(value)) return false;
  return value.split('/').every((segment) => segment !== '.' && segment !== '..');
}

/** A `{path: sha256}` map that is safe to write to disk, or null. */
export function fileHashes(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 1000) return null;
  const folded = new Set<string>();
  const out: Record<string, string> = {};
  for (const [file, hash] of entries) {
    if (!isSafeFilePath(file) || typeof hash !== 'string' || !SHA256.test(hash)) return null;
    // Two names that differ only in case are one file on a Mac.
    const lower = file.toLowerCase();
    if (folded.has(lower)) return null;
    folded.add(lower);
    out[file] = hash;
  }
  // A path that is also another path's folder ("assets/data" and
  // "assets/data/a.mjs") cannot be stored; case is folded as above.
  for (const lower of folded) {
    const segments = lower.split('/');
    for (let i = 1; i < segments.length; i++) if (folded.has(segments.slice(0, i).join('/'))) return null;
  }
  return out;
}

export function modelList(value: unknown): ModelNeed[] | null {
  if (!Array.isArray(value)) return null;
  const out: ModelNeed[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { provider, model } = item as { provider?: unknown; model?: unknown };
    if (typeof provider !== 'string' || typeof model !== 'string' || !provider || !model) return null;
    out.push({ provider, model } as ModelNeed);
  }
  return out;
}

/** The same models, in any order. */
export function sameModels(a: readonly ModelNeed[], b: readonly ModelNeed[]): boolean {
  const key = (list: readonly ModelNeed[]) => list.map((m) => `${m.provider}\u0000${m.model}`).sort().join('\u0001');
  return a.length === b.length && key(a) === key(b);
}

export function parseWithdrawn(raw: unknown): Set<string> {
  const body = raw as { withdrawn?: unknown };
  if (!body || typeof body !== 'object' || !Array.isArray(body.withdrawn)) {
    throw new CatalogError('The list of withdrawn parts is not in a shape this kit reads.');
  }
  const withdrawn = new Set<string>();
  for (const item of body.withdrawn as unknown[]) {
    const entry = item as { id?: unknown; version?: unknown } | null;
    if (!entry || typeof entry.id !== 'string' || typeof entry.version !== 'string') {
      throw new CatalogError('The list of withdrawn parts has an entry this kit cannot read.');
    }
    withdrawn.add(partKey(entry.id, entry.version));
  }
  return withdrawn;
}

/** GETs `url` with a timeout and a byte limit. Throws CatalogError with plain words. */
export async function fetchBytes(
  fetchImpl: FetchLike,
  url: string,
  opts: { maxBytes: number; timeoutMs: number; signal?: AbortSignal; what: string },
): Promise<Buffer> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: controller.signal });
    } catch {
      throw new CatalogError(`Could not download ${opts.what}. Check the connection and run the same command again.`);
    }
    if (!response.ok) {
      throw new CatalogError(`Could not download ${opts.what} (${response.status}).`);
    }
    const declared = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > opts.maxBytes) {
      throw new CatalogError(`${opts.what} is larger than a part may be.`);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    if (!reader) {
      const whole = Buffer.from(await response.arrayBuffer());
      if (whole.length > opts.maxBytes) throw new CatalogError(`${opts.what} is larger than a part may be.`);
      return whole;
    }
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > opts.maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new CatalogError(`${opts.what} is larger than a part may be.`);
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      throw new CatalogError(`Could not download ${opts.what}. Check the connection and run the same command again.`);
    }
    return Buffer.concat(chunks, size);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

function parseJson(bytes: Buffer, what: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new CatalogError(`${what} is not valid JSON.`);
  }
}

/** Reads `<rawBase>/parts/withdrawn.json`: `${id}@${version}` of every withdrawn version. */
export async function fetchWithdrawn(fetchImpl: FetchLike, rawBase: string, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<Set<string>> {
  const bytes = await fetchBytes(fetchImpl, `${rawBase}/parts/withdrawn.json`, { ...opts, maxBytes: MAX_WITHDRAWN_BYTES, what: 'the list of withdrawn parts' });
  return parseWithdrawn(parseJson(bytes, 'The list of withdrawn parts'));
}
