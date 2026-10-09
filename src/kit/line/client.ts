// The kit's client for the private line (private-line.md, version 3).
//
// - The line token lives only in this object's private fields: it is never
//   returned, printed, logged or written. `redact` scrubs it from any text.
// - Token calls carry the token, the device id and the hand-over's lease. A
//   worker's kit also sends GOOSEWORKS_KIT_WORKER_ID, unchanged, on every call.
// - Files go to storage with exactly the headers the line returned, never with
//   the token. Downloads carry no sign-in, except our own API's links.
// - An answer whose `next` is retry is asked again after retry_after_seconds;
//   every other refusal is thrown as a LineError for the core to act on.
import { redact } from '../core/secrets';
import {
  DEVICE_HEADER,
  HOSTED_FILE_PREFIX,
  LEASE_HEADER,
  LINE_PREFIX,
  WORKER_HEADER,
  type DeviceAnswer,
  type DeviceReport,
  type HostableType,
  type LineErrorBody,
  type LineNext,
  type PieceAnswer,
  type PieceRequest,
  type ProgressAnswer,
  type ProgressRequest,
  type Slot,
  type UploadCheck,
  type UploadRequest,
  type UploadSlot,
} from './types';

export class LineError extends Error {
  readonly code: string;
  readonly next: LineNext;
  readonly fix: string;
  readonly retryAfterSeconds?: number;
  readonly details?: Record<string, unknown>;
  constructor(body: LineErrorBody, readonly status: number) {
    super(body.error || 'The private line refused the call.');
    this.name = 'LineError';
    this.code = body.code;
    this.next = body.next;
    this.fix = body.fix ?? '';
    this.retryAfterSeconds = body.retry_after_seconds;
    this.details = body.details;
  }
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

/** Reads a body up to `maxBytes`, stopping the transfer as soon as it would go past. */
async function readBounded(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('A file to download is larger than the kit allows.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export const sleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('stopped'));
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('stopped'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/** A signal that aborts when any of these does, or after `timeoutMs`. */
export function linkedSignal(signals: Array<AbortSignal | undefined>, timeoutMs?: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) controller.abort(s.reason);
    const on = () => controller.abort(s.reason);
    s.addEventListener('abort', on, { once: true });
    cleanups.push(() => s.removeEventListener('abort', on));
  }
  if (timeoutMs) {
    const timer = setTimeout(() => controller.abort(new Error('timed out')), timeoutMs);
    cleanups.push(() => clearTimeout(timer));
  }
  return { signal: controller.signal, done: () => cleanups.forEach((c) => c()) };
}

export interface LineOptions {
  apiBase: string;
  deviceId: string;
  /** GOOSEWORKS_KIT_WORKER_ID, sent back unchanged on every line call. */
  workerId?: string;
  /** The CLI login (a customer's computer). */
  login?: string;
  /** The video's line token (a worker, which has no login). */
  lineToken?: string;
  fetch?: typeof fetch;
  sleep?: Sleep;
  /** Asks again at most this many times when the line says retry. */
  maxRetries?: number;
}

type Auth = 'login' | 'token' | 'hand-over';

const MINUTE = 60_000;

export class VideoLine {
  // Secrets live only in private fields: never enumerable, never in JSON or a dump.
  readonly #login: string | null;
  #token: string | null;
  #lease: string | null = null;
  readonly deviceId: string;
  readonly workerId: string | undefined;
  private readonly origin: string;
  private readonly fetchImpl: typeof fetch;
  private readonly wait: Sleep;
  private readonly maxRetries: number;

  constructor(opts: LineOptions) {
    const base = new URL(opts.apiBase);
    if (base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('The API address must be an origin.');
    this.origin = base.origin;
    this.#login = opts.login || null;
    this.#token = opts.lineToken || null;
    this.deviceId = opts.deviceId;
    this.workerId = opts.workerId;
    this.fetchImpl = opts.fetch ?? fetch;
    this.wait = opts.sleep ?? sleep;
    this.maxRetries = opts.maxRetries ?? 6;
  }

  get isWorker(): boolean {
    return !this.#login && !!this.#token;
  }

  get hasLogin(): boolean {
    return !!this.#login;
  }

  /** Text with this line's token and login, and anything shaped like a secret, removed. */
  redact(text: string): string {
    return redact(text, [this.#token, this.#login, this.#lease]);
  }

  /** (a) `gooseworks video check` on a customer's computer: the kit's login only. */
  reportDevice(report: DeviceReport): Promise<DeviceAnswer> {
    if (!this.#login) throw new Error('Sign in first: the device report needs the GooseWorks login.');
    return this.call<DeviceAnswer>(`${LINE_PREFIX}/device`, { device: report }, 'login', MINUTE);
  }

  /**
   * (a) The hand-over at the start of `video make <id>`. A customer's computer
   * signs with the login of the person who said yes; a worker with the line
   * token. The answer's token and lease stay in this object.
   */
  async handOver(projectId: string, report: DeviceReport): Promise<DeviceAnswer> {
    const answer = await this.call<DeviceAnswer & { line?: { token?: string; lease?: string } }>(
      `${LINE_PREFIX}/${encodeURIComponent(projectId)}/device`,
      { device: report },
      'hand-over',
      MINUTE,
    );
    if (answer.line) {
      const { token, lease, ...line } = answer.line;
      if (typeof token !== 'string' || !token || typeof lease !== 'string' || !lease) throw new Error('The hand-over came back without its token.');
      this.#token = token;
      this.#lease = lease;
      return { ...answer, line };
    }
    return answer;
  }

  /** (b) One paid piece. `piece_busy` and every non-retry refusal are thrown. */
  orderPiece(projectId: string, request: PieceRequest, signal?: AbortSignal): Promise<PieceAnswer> {
    return this.call<PieceAnswer>(`${LINE_PREFIX}/${encodeURIComponent(projectId)}/pieces`, request, 'token', 3 * MINUTE, signal);
  }

  /** (c) Progress, which is also the sign of life. */
  progress(projectId: string, request: ProgressRequest, signal?: AbortSignal): Promise<ProgressAnswer> {
    return this.call<ProgressAnswer>(`${LINE_PREFIX}/${encodeURIComponent(projectId)}/progress`, request, 'token', MINUTE, signal);
  }

  /** Hosts a local file a provider must fetch; returns the payload's `gooseworks-file:<id>` name. */
  async hostFile(
    projectId: string,
    file: { sha256: string; bytes: number; content_type: HostableType; filename: string },
    data: Buffer,
    signal?: AbortSignal,
  ): Promise<string> {
    const slot = await this.call<Slot & { file_id: string }>(`${LINE_PREFIX}/${encodeURIComponent(projectId)}/files`, file, 'token', MINUTE, signal);
    await this.put(slot.put, data, signal);
    const done = await this.call<{ file_id: string; ref: string; sha256: string }>(
      `${LINE_PREFIX}/${encodeURIComponent(projectId)}/files/${encodeURIComponent(slot.file_id)}/done`,
      undefined,
      'token',
      2 * MINUTE,
      signal,
    );
    if (done.sha256 !== file.sha256 || !done.ref.startsWith(HOSTED_FILE_PREFIX)) throw new Error('The line hosted a different file.');
    return done.ref;
  }

  /** A fresh short-lived link to a file the line hosts for this video (a plan's image or footage). */
  async hostedFileLink(projectId: string, fileId: string, signal?: AbortSignal): Promise<string> {
    const answer = await this.call<{ url?: unknown }>(`${LINE_PREFIX}/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`, undefined, 'token', MINUTE, signal, 'GET');
    if (typeof answer.url !== 'string' || !/^https?:\/\//i.test(answer.url)) throw new Error('The line sent no link for a plan file.');
    return answer.url;
  }

  /** (d) A slot for the finished file. */
  openUpload(projectId: string, request: UploadRequest, signal?: AbortSignal): Promise<UploadSlot> {
    return this.call<UploadSlot>(`${LINE_PREFIX}/${encodeURIComponent(projectId)}/upload`, request, 'token', MINUTE, signal);
  }

  /** (d) The file is in its slot: our server checks it. Safe to repeat. */
  finishUpload(projectId: string, uploadId: string, signal?: AbortSignal): Promise<UploadCheck> {
    return this.call<UploadCheck>(
      `${LINE_PREFIX}/${encodeURIComponent(projectId)}/upload/${encodeURIComponent(uploadId)}/done`,
      undefined,
      'token',
      6 * MINUTE,
      signal,
    );
  }

  /** PUTs bytes to a slot with exactly the headers the line returned. Never the token. */
  async put(slot: Slot['put'], data: Buffer, signal?: AbortSignal): Promise<void> {
    if (!/^https?:\/\//i.test(slot.url)) throw new Error('The line returned an upload slot that is not a link.');
    for (let attempt = 0; ; attempt++) {
      const link = linkedSignal([signal], 10 * MINUTE);
      try {
        const res = await this.fetchImpl(slot.url, { method: 'PUT', headers: { ...slot.headers }, body: data, signal: link.signal });
        if (res.ok) return;
        if (res.status < 500 || attempt >= 2) throw new Error(`The file could not be stored (HTTP ${res.status}).`);
      } catch (error) {
        if (signal?.aborted || attempt >= 2) throw error;
      } finally {
        link.done();
      }
      await this.wait(2000 * (attempt + 1), signal);
    }
  }

  /**
   * Downloads a file. Only a link on our own API origin is signed in (the
   * style package), with this video's line token once it is handed over;
   * a provider's or storage link gets no sign-in at all.
   */
  async download(url: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
    const target = new URL(url);
    if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))) {
      throw new Error('Refused to download a file over a plain link.');
    }
    const headers: Record<string, string> = {};
    if (target.origin === this.origin) {
      const auth = this.#token ?? this.#login;
      if (auth) headers.Authorization = `Bearer ${auth}`;
      if (this.workerId) headers[WORKER_HEADER] = this.workerId;
    }
    for (let attempt = 0; ; attempt++) {
      const link = linkedSignal([signal], 10 * MINUTE);
      try {
        const res = await this.fetchImpl(target.toString(), { method: 'GET', headers, signal: link.signal });
        if (!res.ok) {
          await res.body?.cancel().catch(() => undefined);
          if (res.status < 500 || attempt >= 2) throw new Error(`A file could not be downloaded (HTTP ${res.status}).`);
        } else {
          const declared = Number(res.headers.get('content-length') ?? '0');
          if (declared > maxBytes) {
            await res.body?.cancel().catch(() => undefined);
            throw new Error('A file to download is larger than the kit allows.');
          }
          return await readBounded(res, maxBytes);
        }
      } catch (error) {
        if (signal?.aborted || attempt >= 2 || /larger than|HTTP 4/.test(String((error as Error)?.message))) throw error;
      } finally {
        link.done();
      }
      await this.wait(2000 * (attempt + 1), signal);
    }
  }

  private headers(auth: Auth, json: boolean): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json', [DEVICE_HEADER]: this.deviceId };
    if (json) headers['Content-Type'] = 'application/json';
    const bearer = auth === 'login' ? this.#login : auth === 'token' ? this.#token : (this.#login ?? this.#token);
    if (!bearer) throw new Error(auth === 'token' ? 'This video has not been handed over to this computer.' : 'Sign in first.');
    headers.Authorization = `Bearer ${bearer}`;
    if (auth === 'token' && this.#lease) headers[LEASE_HEADER] = this.#lease;
    if (this.workerId) headers[WORKER_HEADER] = this.workerId;
    return headers;
  }

  private async call<T>(pathname: string, body: unknown, auth: Auth, timeoutMs: number, signal?: AbortSignal, method: 'POST' | 'GET' = 'POST'): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = this.headers(auth, payload !== undefined);
    for (let attempt = 0; ; attempt++) {
      const link = linkedSignal([signal], timeoutMs);
      let refusal: LineError;
      try {
        const res = await this.fetchImpl(`${this.origin}${pathname}`, {
          method,
          headers,
          body: payload,
          signal: link.signal,
        });
        const text = await res.text();
        if (res.ok) {
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new LineError({ code: 'internal_error', error: 'The line sent an answer the kit could not read.', fix: 'Try again in a minute.', next: 'retry' }, res.status);
          }
        }
        refusal = new LineError(this.errorBody(text, res.status), res.status);
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        refusal =
          error instanceof LineError
            ? error
            : new LineError({ code: 'line_unavailable', error: 'The line could not be reached.', fix: 'Check the internet connection, then run the same command again.', next: 'retry' }, 0);
      } finally {
        link.done();
      }
      if (refusal.next !== 'retry' || refusal.code === 'piece_busy' || attempt >= this.maxRetries) throw refusal;
      const seconds = Math.min(Math.max(refusal.retryAfterSeconds ?? 5, 1), 120);
      await this.wait(seconds * 1000, signal);
    }
  }

  private errorBody(text: string, status: number): LineErrorBody {
    try {
      const parsed = JSON.parse(text) as { error?: LineErrorBody };
      const e = parsed.error;
      if (e && typeof e.code === 'string' && typeof e.next === 'string') {
        return { ...e, error: this.redact(String(e.error ?? '')), fix: this.redact(String(e.fix ?? '')) };
      }
    } catch {
      // Fall through to a plain refusal.
    }
    const retry = status === 429 || status >= 500 || status === 0;
    return {
      code: retry ? 'line_unavailable' : 'invalid_input',
      error: `The line refused the call (HTTP ${status}).`,
      fix: retry ? 'Try again in a minute.' : 'Update GooseWorks, then run the same command again.',
      next: retry ? 'retry' : 'change_request',
    };
  }
}
