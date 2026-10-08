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

/**
 * Every key this video sent for one piece, and how it ended, saved before the
 * call goes out. A key whose piece is running or done is asked again, never
 * replaced, so a finished paid piece is never ordered under a new key; only a
 * provider failure earns the one new attempt.
 */
interface OrderState {
  inputs_hash: string;
  piece_key: string;
  attempts: Array<{ attempt: number; key: string; outcome: 'sent' | 'done' | 'failed'; failure?: LineErrorBody }>;
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

  async readOrder(hash: string): Promise<OrderState | null> {
    const saved = await readJson<OrderState>(path.join(this.dir(hash), 'order.json'));
    return saved && saved.inputs_hash === hash && Array.isArray(saved.attempts) ? saved : null;
  }

  async saveOrder(state: OrderState): Promise<void> {
    await writeJson(path.join(this.dir(state.inputs_hash), 'order.json'), state);
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

function stopFor(body: { code: string; error: string; fix: string; next: string }): KitStop {
  const message = [body.error, body.fix].filter(Boolean).join(' ');
  if (body.next === 'update_kit') return new KitStop(message, 'update_kit', body.code);
  if (body.next === 'change_request') return new KitStop(message, 'change_request', body.code);
  return new KitStop(message, 'stop', body.code);
}

function lineStop(error: LineError): KitStop {
  return stopFor({ code: error.code, error: error.message, fix: error.fix, next: error.next });
}

/** A failed piece, by the line's next step: only a provider failure the line says to retry is retried. */
function failureFor(failure: LineErrorBody): Error {
  if (failure.next === 'retry' && failure.code !== 'provider_rejected') return new PieceFailure('provider_failed', failure);
  if (failure.next === 'stop' && failure.code === 'provider_rejected') return new PieceFailure('provider_rejected', failure);
  return stopFor(failure);
}

const waitSeconds = (s: number | undefined, fallback: number) => Math.min(Math.max(s ?? fallback, 1), 60) * 1000;

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
    const keyFor = (attempt: number) => `${piece_key}:${inputs_hash}:${attempt}`;

    // A piece this video already has is never ordered again.
    const cached = await ctx.cache.lookup(inputs_hash, order.results);
    const state: OrderState = (await ctx.cache.readOrder(inputs_hash)) ?? { inputs_hash, piece_key, attempts: [] };
    const last = state.attempts[state.attempts.length - 1];
    if (cached) {
      const files: Record<string, FileRef> = {};
      for (const r of order.results) files[r.name] = await placeResult(ctx, inputs_hash, cached.files[r.pointer].sha256, r.name, r.media);
      const attempt = (last?.attempt ?? 1) as 1 | 2;
      await ctx.onPiece({ piece: order.piece, piece_key, inputs_hash, idempotency_key: last?.key ?? keyFor(1), attempt, reused: true });
      return { json: (cached.json ?? null) as JsonValue, files, reused: true };
    }

    // The key: the last one again while its piece may be running or is done; a
    // new attempt only after a provider failure, and only one.
    let current: OrderState['attempts'][number];
    if (last && last.outcome !== 'failed') current = last;
    else if (last && last.attempt >= 2) throw failureFor(last.failure ?? { code: 'provider_failed', error: 'This piece failed twice.', fix: '', next: 'stop' });
    else {
      current = { attempt: last ? last.attempt + 1 : 1, key: keyFor(last ? last.attempt + 1 : 1), outcome: 'sent' };
      state.attempts.push(current);
    }

    if (ctx.signal.aborted) throw new PartError('stopped');
    const body = (await hostPayload(order.body, ctx)) as Record<string, unknown>;
    const ask = async (): Promise<PieceAnswer> => {
      await ctx.cache.saveOrder(state);
      let busy = 0;
      for (;;) {
        let answer: PieceAnswer;
        const request: PieceRequest = { idempotency_key: current.key, piece_key, part: { id: ctx.part.id, version: ctx.part.version }, inputs_hash, call: { provider: order.provider, path: order.path, body } };
        try {
          answer = await ctx.line.orderPiece(ctx.videoId, request, ctx.signal);
        } catch (error) {
          if (ctx.signal.aborted) throw new PartError('stopped');
          if (!(error instanceof LineError)) throw error;
          if (error.code !== 'piece_busy' || error.next !== 'retry' || ++busy > 30) throw lineStop(error);
          // Join the running attempt only when it is this same piece with these same inputs.
          const running = error.details?.idempotency_key;
          const prefix = `${piece_key}:${inputs_hash}:`;
          const runningAttempt = typeof running === 'string' && running.startsWith(prefix) ? running.slice(prefix.length) : null;
          const match = runningAttempt === '1' || runningAttempt === '2';
          if (match && running !== current.key) {
            current = { attempt: Number(runningAttempt), key: running as string, outcome: 'sent' };
            state.attempts.push(current);
            await ctx.cache.saveOrder(state);
          }
          await ctx.sleep(waitSeconds(error.retryAfterSeconds, 10), ctx.signal);
          continue;
        }
        if (answer.status !== 'running') return answer;
        ctx.onWait();
        await ctx.sleep(waitSeconds(answer.retry_after_seconds, 10), ctx.signal);
      }
    };

    let answer = await ask();
    if (answer.status === 'failed') {
      const failure = answer.failure ?? { code: 'provider_failed', error: 'This piece failed.', fix: '', next: 'retry' as const };
      current.outcome = 'failed';
      current.failure = { code: failure.code, error: failure.error, fix: failure.fix, next: failure.next };
      await ctx.cache.saveOrder(state);
      throw failureFor(failure);
    }
    current.outcome = 'done';
    await ctx.cache.saveOrder(state);

    // The piece is made and paid for. A failed download asks the line again
    // under the same key (a replay, free) for fresh links; it never orders anew.
    let record: CachedPiece = { inputs_hash, json: null, files: {} };
    const files: Record<string, FileRef> = {};
    for (let round = 0; ; round++) {
      const result = { json: answer.result?.json, file_url: answer.result?.file_url };
      record = { inputs_hash, json: withoutSignedLinks(result.json ?? null), files: {} };
      try {
        for (const r of order.results) {
          const url = pointerValue(result, r.pointer);
          if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new PartError('output_invalid', `the piece's answer has no file at ${r.pointer}`);
          const data = await ctx.line.download(url, MAX_RESULT_BYTES, ctx.signal);
          const sha = await ctx.cache.saveFile(inputs_hash, data);
          record.files[r.pointer] = { sha256: sha, bytes: data.length, mime: mimeOf(r.name), media: r.media };
          files[r.name] = await placeResult(ctx, inputs_hash, sha, r.name, r.media);
        }
        break;
      } catch (error) {
        if (ctx.signal.aborted) throw new PartError('stopped');
        if (error instanceof PartError && error.code === 'output_invalid') throw error;
        if (round >= 1) throw new PartError('tool_failed', `a made piece could not be downloaded: ${error instanceof Error ? error.message : String(error)}`);
        answer = await ask();
        if (answer.status !== 'done') throw new PartError('tool_failed', 'a made piece is no longer available to download');
      }
    }
    await ctx.cache.saveRecord(record);
    await ctx.onPiece({
      piece: order.piece,
      piece_key,
      inputs_hash,
      idempotency_key: current.key,
      attempt: current.attempt as 1 | 2,
      reused: answer.replayed,
      credits: answer.piece_credits,
    });
    return { json: record.json as JsonValue, files, reused: answer.replayed };
  };
}

