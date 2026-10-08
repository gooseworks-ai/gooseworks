// Paid pieces: the only paid path (ctx.line.order). The core names the piece,
// hashes it before hosting any file, keys it as the line requires, serves a
// piece it already has from pieces/<inputs_hash>/, hosts the payload's files,
// asks again while the line says running, and downloads the results.
import { copyFile, mkdir, readFile } from 'fs/promises';
import * as path from 'path';
import type { FileRef, JsonValue, MediaKind, ModelNeed, PartRef, PayloadValue, PieceOrder, PieceResult } from '../part-interface';
import { LineError, type Sleep, type VideoLine } from '../line/client';
import { HOSTABLE_TYPES, type HostableType, type LineErrorBody, type PieceAnswer, type PieceRequest } from '../line/types';
import { isFileRef, pieceHash, sha256Hex } from './canonical';
import { KitStop, PartError } from './errors';
import { fileRef, intact, mimeOf, type Probe } from './files';
import { isInside } from './paths';
import { atomicWrite, readJson, writeJson } from './save';
import { withoutSignedLinks } from './secrets';

const PIECE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const RESULT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MAX_RESULT_BYTES = 500 * 1024 * 1024;

/** A piece the line refused or failed: final, or worth one new attempt. The line's words travel with it. */
export class PieceFailure extends PartError {
  constructor(code: 'provider_rejected' | 'provider_failed', readonly line: LineErrorBody) {
    super(code, line.error);
  }
}

interface CachedPiece {
  inputs_hash: string;
  json: unknown;
  files: Record<string, { sha256: string; bytes: number; mime: string; media: MediaKind }>;
}

/** pieces/<inputs_hash>/: downloaded paid results, reused by any re-run. */
export class PieceCache {
  constructor(private readonly root: string) {}

  private dir(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('bad piece hash');
    return path.join(this.root, hash);
  }

  /** The saved piece when it holds every result asked for, intact. */
  async lookup(hash: string, results: PieceOrder['results']): Promise<CachedPiece | null> {
    const saved = await readJson<CachedPiece>(path.join(this.dir(hash), 'piece.json'));
    if (!saved || saved.inputs_hash !== hash) return null;
    for (const r of results) {
      const f = saved.files[r.pointer];
      if (!f) return null;
      const file = path.join(this.dir(hash), f.sha256);
      if (!(await intact({ kind: 'file', path: file, sha256: f.sha256, bytes: f.bytes, media: f.media, mime: f.mime }))) return null;
    }
    return saved;
  }

  fileOf(hash: string, sha256: string): string {
    return path.join(this.dir(hash), sha256);
  }

  async saveFile(hash: string, data: Buffer): Promise<string> {
    const sha = sha256Hex(data);
    await atomicWrite(this.fileOf(hash, sha), data);
    return sha;
  }

  async saveRecord(record: CachedPiece): Promise<void> {
    await writeJson(path.join(this.dir(record.inputs_hash), 'piece.json'), record);
  }
}

function pointerValue(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return undefined;
  let node = root;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node) ? node[Number(key)] : (node as Record<string, unknown>)[key];
  }
  return node;
}

function topStrings(body: PayloadValue): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body) || isFileRef(body)) return [];
  return Object.values(body).filter((v): v is string => typeof v === 'string');
}

/** What one step's ctx.line needs from the core. */
export interface PieceLine {
  line: VideoLine;
  videoId: string;
  stepId: string;
  part: PartRef;
  attempt: 1 | 2;
  /** The models this part may order: the lock's entry (or the manifest's, for dev parts). */
  models: ModelNeed[];
  workDir: string;
  runRoot: string;
  cache: PieceCache;
  signal: AbortSignal;
  sleep: Sleep;
  probe?: Probe;
  /** Hosted files by sha256, shared by the whole run. */
  hosted: Map<string, string>;
  /** Called after every piece, with the piece's record, once its files are saved. */
  onPiece: (record: { piece: string; piece_key: string; inputs_hash: string; idempotency_key: string; attempt: 1 | 2; reused: boolean; credits?: number }) => Promise<void>;
  /** Called while a piece is still running at the provider. */
  onWait: () => void;
  register: (ref: FileRef) => void;
}

function lineStop(error: LineError): KitStop {
  const message = [error.message, error.fix].filter(Boolean).join(' ');
  if (error.next === 'update_kit') return new KitStop(message, 'update_kit', error.code);
  if (error.next === 'change_request') return new KitStop(message, 'change_request', error.code);
  return new KitStop(message, 'stop', error.code);
}

async function hostPayload(value: PayloadValue, ctx: PieceLine): Promise<unknown> {
  if (isFileRef(value)) {
    const known = ctx.hosted.get(value.sha256);
    if (known) return known;
    if (!(HOSTABLE_TYPES as readonly string[]).includes(value.mime)) throw new PartError('bad_input', `a ${value.mime} file can't be sent to a provider`);
    if (!isInside(ctx.runRoot, value.path)) throw new PartError('bad_input', 'a file outside this video was named in a payload');
    const data = await readFile(value.path);
    if (sha256Hex(data) !== value.sha256 || data.length !== value.bytes) throw new PartError('bad_input', 'a file changed after it was made');
    const base = path.basename(value.path).replace(/[^A-Za-z0-9._-]/g, '_').slice(-120) || `${value.sha256.slice(0, 16)}.bin`;
    try {
      const ref = await ctx.line.hostFile(ctx.videoId, { sha256: value.sha256, bytes: value.bytes, content_type: value.mime as HostableType, filename: base }, data, ctx.signal);
      ctx.hosted.set(value.sha256, ref);
      return ref;
    } catch (error) {
      if (error instanceof LineError) throw lineStop(error);
      throw error;
    }
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) out.push(await hostPayload(item, ctx));
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await hostPayload(v as PayloadValue, ctx);
    return out;
  }
  return value;
}

async function placeResult(ctx: PieceLine, hash: string, sha: string, name: string, media: MediaKind): Promise<FileRef> {
  const target = path.join(ctx.workDir, name);
  await mkdir(ctx.workDir, { recursive: true, mode: 0o700 });
  await copyFile(ctx.cache.fileOf(hash, sha), target);
  const ref = await fileRef(target, media, ctx.probe);
  if (ref.sha256 !== sha) throw new PartError('tool_failed', 'a saved piece changed on disk');
  ctx.register(ref);
  return ref;
}

/** ctx.line.order for one step run. */
export function pieceOrderer(ctx: PieceLine): (order: PieceOrder) => Promise<PieceResult> {
  return async (order) => {
    if (ctx.signal.aborted) throw new PartError('stopped');
    if (!order || typeof order.piece !== 'string' || !PIECE.test(order.piece)) throw new PartError('bad_input', 'a piece needs a short lowercase name');
    if (typeof order.path !== 'string' || !order.path || order.path.length > 300) throw new PartError('bad_input', 'a piece needs a provider path');
    const allowed = ctx.models.filter((m) => m.provider === order.provider);
    if (!allowed.length) throw new PartError('bad_input', `this part may not order from ${String(order.provider)}`);
    if (!allowed.some((m) => m.model === order.path || topStrings(order.body).includes(m.model))) {
      throw new PartError('bad_input', 'a piece must name one of its part’s models, as its path or in its payload');
    }
    if (!order.body || typeof order.body !== 'object' || Array.isArray(order.body) || isFileRef(order.body)) throw new PartError('bad_input', 'a piece payload must be an object');
    if (!Array.isArray(order.results) || order.results.some((r) => !r || !RESULT_NAME.test(r.name) || typeof r.pointer !== 'string' || !r.pointer.startsWith('/'))) {
      throw new PartError('bad_input', 'a piece names its result files badly');
    }

    const inputs_hash = pieceHash({ part: ctx.part, provider: order.provider, path: order.path, body: order.body });
    const piece_key = `${ctx.stepId}.${order.piece}`;
    const idempotency_key = `${piece_key}:${inputs_hash}:${ctx.attempt}`;

    // A piece this video already has is never ordered again.
    const cached = await ctx.cache.lookup(inputs_hash, order.results);
    if (cached) {
      const files: Record<string, FileRef> = {};
      for (const r of order.results) files[r.name] = await placeResult(ctx, inputs_hash, cached.files[r.pointer].sha256, r.name, r.media);
      await ctx.onPiece({ piece: order.piece, piece_key, inputs_hash, idempotency_key, attempt: ctx.attempt, reused: true });
      return { json: (cached.json ?? null) as JsonValue, files, reused: true };
    }

    if (ctx.signal.aborted) throw new PartError('stopped');
    const body = (await hostPayload(order.body, ctx)) as Record<string, unknown>;
    let request: PieceRequest = { idempotency_key, piece_key, part: { id: ctx.part.id, version: ctx.part.version }, inputs_hash, call: { provider: order.provider, path: order.path, body } };
    let answer: PieceAnswer;
    for (;;) {
      try {
        answer = await ctx.line.orderPiece(ctx.videoId, request, ctx.signal);
      } catch (error) {
        if (ctx.signal.aborted) throw new PartError('stopped');
        if (error instanceof LineError) {
          const running = error.details?.idempotency_key;
          if (error.code === 'piece_busy' && typeof running === 'string' && running && running !== request.idempotency_key) {
            request = { ...request, idempotency_key: running };
            await ctx.sleep(Math.min(Math.max(error.retryAfterSeconds ?? 10, 1), 60) * 1000, ctx.signal);
            continue;
          }
          throw lineStop(error);
        }
        throw error;
      }
      if (answer.status !== 'running') break;
      ctx.onWait();
      await ctx.sleep(Math.min(Math.max(answer.retry_after_seconds ?? 10, 1), 60) * 1000, ctx.signal);
    }

    if (answer.status === 'failed') {
      const failure = answer.failure ?? { code: 'provider_failed', error: 'This piece failed.', fix: '', next: 'retry' as const };
      throw new PieceFailure(failure.code === 'provider_rejected' ? 'provider_rejected' : 'provider_failed', failure);
    }

    const result = { json: answer.result?.json, file_url: answer.result?.file_url };
    const record: CachedPiece = { inputs_hash, json: withoutSignedLinks(result.json ?? null), files: {} };
    const files: Record<string, FileRef> = {};
    for (const r of order.results) {
      const url = pointerValue(result, r.pointer);
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new PartError('output_invalid', `the piece's answer has no file at ${r.pointer}`);
      const data = await ctx.line.download(url, MAX_RESULT_BYTES, ctx.signal);
      const sha = await ctx.cache.saveFile(inputs_hash, data);
      record.files[r.pointer] = { sha256: sha, bytes: data.length, mime: mimeOf(r.name), media: r.media };
      files[r.name] = await placeResult(ctx, inputs_hash, sha, r.name, r.media);
    }
    await ctx.cache.saveRecord(record);
    await ctx.onPiece({
      piece: order.piece,
      piece_key,
      inputs_hash,
      idempotency_key: request.idempotency_key,
      attempt: ctx.attempt,
      reused: answer.replayed,
      credits: answer.piece_credits,
    });
    return { json: record.json as JsonValue, files, reused: answer.replayed };
  };
}

