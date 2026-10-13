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
import { KitStop, lineStop as stopOnLine, PartError } from './errors';
import { fileRef, intact, mimeOf, type Probe } from './files';
import { isInside } from './paths';
import { atomicWrite, readJson, writeJson } from './save';
import { withoutSignedLinks } from './secrets';

const PIECE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const RESULT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const MAX_RESULT_BYTES = 500 * 1024 * 1024;

/** A piece the line refused or failed: final, or worth one new attempt. The line's words travel with it. */
export class PieceFailure extends PartError {
  constructor(code: 'provider_rejected' | 'provider_failed', readonly line: LineErrorBody, readonly attempt = 1) {
    super(code, line.error);
  }

  /**
   * A charged provider failure whose piece has used both its attempts: no later run may order it
   * again. A failure the line says was free never spends the piece; the next run tries it anew.
   */
  get spent(): boolean {
    return this.code === 'provider_failed' && this.attempt >= 2 && this.line.details?.charged !== false;
  }
}

/** A piece the maker failed twice: the journal never lets a later run order it again. */
export const FAILED_TWICE = 'One part of this video failed at its maker twice, so the video stopped there. Ask for a fix to make it again.';

/**
 * Every key this video sent for one piece, and how it ended, saved before the
 * call goes out. A key whose piece is running or done is asked again, never
 * replaced, so a finished paid piece is never ordered under a new key; only a
 * provider failure earns a new attempt. A charged failure earns one in all;
 * a free one earns one again on every run, up to NEW_ATTEMPTS_PER_RUN.
 */
interface OrderState {
  inputs_hash: string;
  piece_key: string;
  /** `run` names the run that made the key (keys from kits before it have none). */
  attempts: Array<{ attempt: number; key: string; outcome: 'sent' | 'done' | 'failed'; failure?: LineErrorBody; run?: string }>;
}

/** New keys one run may make for one piece: its first try and the step's one retry. */
const NEW_ATTEMPTS_PER_RUN = 2;

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

/**
 * A model id or provider path as the lock and the line compare it: no leading
 * slash, the first segment (the model's owner) in lower case. Everything else
 * must match exactly.
 */
function modelKey(value: string): string {
  const trimmed = value.trim().replace(/^\/+/, '');
  const slash = trimmed.indexOf('/');
  return slash < 0 ? trimmed.toLowerCase() : `${trimmed.slice(0, slash).toLowerCase()}${trimmed.slice(slash)}`;
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
  /** This run's name in the order journal: a free failure's new attempts are counted per run. */
  runId: string;
  workDir: string;
  runRoot: string;
  cache: PieceCache;
  signal: AbortSignal;
  sleep: Sleep;
  probe?: Probe;
  /** Hosted files by sha256, shared by the whole run. */
  hosted: Map<string, string>;
  /** One order at a time per piece hash, shared by the whole run. */
  locks: Map<string, Promise<void>>;
  /** Called after every piece, with the piece's record, once its files are saved. */
  onPiece: (record: { piece: string; piece_key: string; inputs_hash: string; idempotency_key: string; attempt: number; reused: boolean; credits?: number }) => Promise<void>;
  /** Called while a piece is still running at the provider. */
  onWait: () => void;
  /** The pieces this step is waiting on at the line right now, by inputs hash: left in place when the step is cut short. */
  waiting?: Set<string>;
  /** Pieces the customer had remade as they were (the plan's takes), by piece key: each is ordered under its take. */
  takes?: Record<string, number>;
}

/** The server's sentence for the person, else its error and fix. */
function stopFor(body: { code: string; error: string; fix?: string; say?: string; next: string }): KitStop {
  const message = body.say?.trim() || [body.error, body.fix].filter(Boolean).join(' ');
  return stopOnLine(message, body.next, body.code);
}

function lineStop(error: LineError): KitStop {
  return stopFor({ code: error.code, error: error.message, fix: error.fix, say: error.say, next: error.next });
}

/** A failed piece, by the line's next step: only a provider failure the line says to retry is retried. */
function failureFor(failure: LineErrorBody, attempt: number): Error {
  if (failure.next === 'retry' && failure.code !== 'provider_rejected') return new PieceFailure('provider_failed', failure, attempt);
  if (failure.next === 'stop' && failure.code === 'provider_rejected') return new PieceFailure('provider_rejected', failure, attempt);
  return stopFor(failure);
}

/** A failure as the journal keeps it: the line's words, its next step, and whether it was charged. */
function savedFailure(failure: LineErrorBody): LineErrorBody {
  const charged = failure.details?.charged;
  return {
    code: failure.code,
    error: failure.error,
    fix: failure.fix,
    next: failure.next,
    ...(failure.say ? { say: failure.say } : {}),
    ...(typeof charged === 'boolean' ? { details: { charged } } : {}),
  };
}

const waitSeconds = (s: number | undefined, fallback: number) => Math.min(Math.max(s ?? fallback, 1), 60) * 1000;

/**
 * A line call that waits out every "retry" refusal (the line busy or briefly away) until the step's
 * own deadline ends the wait; only a refusal that says otherwise ends the run.
 */
async function untilDeadline<T>(ctx: PieceLine, key: string, call: () => Promise<T>): Promise<T> {
  try {
    for (;;) {
      try {
        return await call();
      } catch (error) {
        if (ctx.signal.aborted) throw new PartError('stopped');
        if (!(error instanceof LineError) || error.next !== 'retry') throw error;
        // Waiting on the line: a deadline that ends here is ours, not this computer's.
        ctx.waiting?.add(key);
        await ctx.sleep(waitSeconds(error.retryAfterSeconds, 10), ctx.signal);
      }
    }
  } finally {
    ctx.waiting?.delete(key);
  }
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
      const ref = await untilDeadline(ctx, `file:${value.sha256}`, () => ctx.line.hostFile(ctx.videoId, { sha256: value.sha256, bytes: value.bytes, content_type: value.mime as HostableType, filename: base }, data, ctx.signal));
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
  return ref;
}

/** Runs `work` alone for this key: calls with the same key wait their turn. */
async function alone<T>(locks: Map<string, Promise<void>>, key: string, work: () => Promise<T>): Promise<T> {
  const before = locks.get(key) ?? Promise.resolve();
  let done!: () => void;
  const mine = new Promise<void>((resolve) => (done = resolve));
  const tail = before.then(() => mine);
  locks.set(key, tail);
  await before;
  try {
    return await work();
  } finally {
    done();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

/** ctx.line.order for one step run. */
export function pieceOrderer(ctx: PieceLine): (order: PieceOrder) => Promise<PieceResult> {
  return async (order) => {
    if (ctx.signal.aborted) throw new PartError('stopped');
    if (!order || typeof order.piece !== 'string' || !PIECE.test(order.piece)) throw new PartError('bad_input', 'a piece needs a short lowercase name');
    if (typeof order.path !== 'string' || !order.path || order.path.length > 300) throw new PartError('bad_input', 'a piece needs a provider path');
    const allowed = ctx.models.filter((m) => m.provider === order.provider);
    if (!allowed.length) throw new PartError('bad_input', `this part may not order from ${String(order.provider)}`);
    const named = [order.path, ...topStrings(order.body)].map(modelKey);
    if (!allowed.some((m) => named.includes(modelKey(m.model)))) {
      throw new PartError('bad_input', 'a piece must name one of its part’s models, as its path or in its payload');
    }
    if (!order.body || typeof order.body !== 'object' || Array.isArray(order.body) || isFileRef(order.body)) throw new PartError('bad_input', 'a piece payload must be an object');
    if (!Array.isArray(order.results) || order.results.some((r) => !r || !RESULT_NAME.test(r.name) || typeof r.pointer !== 'string' || !r.pointer.startsWith('/'))) {
      throw new PartError('bad_input', 'a piece names its result files badly');
    }

    const plain = pieceHash({ part: ctx.part, provider: order.provider, path: order.path, body: order.body });
    const take = ctx.takes?.[`${ctx.stepId}.${order.piece}`];
    // A remade piece is a new piece: its own cache, journal and key, so neither this computer nor the line serves the earlier take.
    const inputs_hash = take ? sha256Hex(`${plain}:take:${take}`) : plain;
    // Two calls for the same piece (even under two names) take turns, so the
    // second finds the first's result instead of ordering it again.
    return alone(ctx.locks, inputs_hash, async () => {
      // The journal names the paid piece by the first name it was ordered under.
      const state: OrderState = (await ctx.cache.readOrder(inputs_hash)) ?? { inputs_hash, piece_key: `${ctx.stepId}.${order.piece}`, attempts: [] };
      const piece_key = state.piece_key;
      const keyFor = (attempt: number) => `${piece_key}:${inputs_hash}:${attempt}`;
      const last = state.attempts[state.attempts.length - 1];

      // A piece this video already has is never ordered again.
      const cached = await ctx.cache.lookup(inputs_hash, order.results);
      if (cached) {
        const files: Record<string, FileRef> = {};
        for (const r of order.results) files[r.name] = await placeResult(ctx, inputs_hash, cached.files[r.pointer].sha256, r.name, r.media);
        await ctx.onPiece({ piece: order.piece, piece_key, inputs_hash, idempotency_key: last?.key ?? keyFor(1), attempt: last?.attempt ?? 1, reused: true });
        return { json: (cached.json ?? null) as JsonValue, files, reused: true };
      }

      // The key: the last one again while its piece may be running or is done.
      // A saved failure is acted on as the line said, before anything is sent:
      // only a failure the line said to retry earns a new attempt.
      let current: OrderState['attempts'][number];
      if (last?.outcome === 'failed') {
        const saved = last.failure ?? { code: 'provider_failed', error: 'This piece failed.', fix: '', next: 'retry' as const };
        if (saved.next !== 'retry' || saved.code === 'provider_rejected') throw failureFor(saved, last.attempt);
        const free = saved.details?.charged === false;
        // A charged piece's line says to try once more, which no run can do now.
        if (!free && last.attempt >= 2) throw new KitStop(FAILED_TWICE, 'failed', 'provider_failed');
        // A free failure is tried anew on a later run, never more than twice in this one.
        if (state.attempts.filter((a) => a.run === ctx.runId).length >= NEW_ATTEMPTS_PER_RUN) throw failureFor(saved, last.attempt);
        current = { attempt: last.attempt + 1, key: keyFor(last.attempt + 1), outcome: 'sent', run: ctx.runId };
        state.attempts.push(current);
      } else if (last) {
        current = last;
      } else {
        current = { attempt: 1, key: keyFor(1), outcome: 'sent', run: ctx.runId };
        state.attempts.push(current);
      }

      if (ctx.signal.aborted) throw new PartError('stopped');
      const body = (await hostPayload(order.body, ctx)) as Record<string, unknown>;
      const ask = async (): Promise<PieceAnswer> => {
        await ctx.cache.saveOrder(state);
        for (;;) {
          let answer: PieceAnswer;
          const request: PieceRequest = { idempotency_key: current.key, piece_key, part: { id: ctx.part.id, version: ctx.part.version }, inputs_hash, call: { provider: order.provider, path: order.path, body } };
          try {
            answer = await ctx.line.orderPiece(ctx.videoId, request, ctx.signal);
            // An answer that lands as the step is cut short ends the wait here, so the step's retry can ask.
            if (ctx.signal.aborted) throw new PartError('stopped');
          } catch (error) {
            if (ctx.signal.aborted) throw new PartError('stopped');
            if (!(error instanceof LineError) || error.next !== 'retry') {
              ctx.waiting?.delete(inputs_hash);
              throw error instanceof LineError ? lineStop(error) : error;
            }
            // The line said retry: the step's deadline, not a count, ends the wait.
            if (error.code !== 'piece_busy') {
              ctx.waiting?.add(inputs_hash);
              await ctx.sleep(waitSeconds(error.retryAfterSeconds, 10), ctx.signal);
              continue;
            }
            ctx.waiting?.add(inputs_hash);
            // Join the running attempt only when it is this same piece with these same inputs.
            const running = error.details?.idempotency_key;
            const prefix = `${piece_key}:${inputs_hash}:`;
            const runningAttempt = typeof running === 'string' && running.startsWith(prefix) ? running.slice(prefix.length) : null;
            const match = !!runningAttempt && /^[1-9]\d{0,3}$/.test(runningAttempt);
            if (match && running !== current.key) {
              current = { attempt: Number(runningAttempt), key: running as string, outcome: 'sent' };
              state.attempts.push(current);
              await ctx.cache.saveOrder(state);
            }
            await ctx.sleep(waitSeconds(error.retryAfterSeconds, 10), ctx.signal);
            continue;
          }
          if (answer.status !== 'running') {
            ctx.waiting?.delete(inputs_hash);
            return answer;
          }
          ctx.waiting?.add(inputs_hash);
          ctx.onWait();
          await ctx.sleep(waitSeconds(answer.retry_after_seconds, 10), ctx.signal);
        }
      };

      let answer = await ask();
      if (answer.status === 'failed') {
        const failure = answer.failure ?? { code: 'provider_failed', error: 'This piece failed.', fix: '', next: 'retry' as const };
        current.outcome = 'failed';
        current.failure = savedFailure(failure);
        await ctx.cache.saveOrder(state);
        throw failureFor(failure, current.attempt);
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
        attempt: current.attempt,
        reused: answer.replayed,
        credits: answer.piece_credits,
      });
      return { json: record.json as JsonValue, files, reused: answer.replayed };
    });
  };
}

