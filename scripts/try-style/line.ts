import { fakeTakeFor, fakeTakeKeysFor } from './fake-takes';
// An in-process private line for try-style, modelled on tests/kit/harness.ts
// fakeLine. It answers the routes the kit calls (device hand-over, pieces,
// hosted files, progress, upload) on a reserved local origin that nothing
// listens on, serves the plan's files and the stand-ins from disk, and refuses
// every other address: nothing leaves this computer through it except, in
// real mode, the result links a provider itself returned.
import { createHash, randomUUID } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import * as path from 'path';
import { styleHash } from '../../src/kit/core/style';
import { HOSTED_FILE_PREFIX } from '../../src/kit/line/types';
import type { HostedFile, PieceCall, Provider, ProviderAnswer, ProviderContext } from './providers';
import type { Ffmpeg } from './media';

/** A reserved local origin: the kit treats it as a local server; nothing listens there. */
export const API = 'http://127.0.0.1:47999';
const PREFIX = '/v1/video-line/';

export interface PieceLog {
  time: string;
  piece_key: string;
  idempotency_key: string;
  provider: string;
  path: string;
  model: string;
  mode: 'fake' | 'real';
  status: 'done' | 'failed' | 'refused' | 'running';
  usd_estimate?: number;
  note?: string;
}

export interface TryLineOptions {
  videoId: string;
  style: Record<string, unknown>;
  /** The hand-over's plan, without its hashes and ids (added here). */
  body: Record<string, unknown>;
  brand: Record<string, unknown>;
  layers: Record<string, { id: string; version: string }>;
  /** sha256 → local path for every FrozenFile in the plan and brand (served at /f/<sha>). */
  planFiles: Map<string, string>;
  /** file_id → a brand file the line already hosts (the plan's LineFiles). */
  lineFiles?: Map<string, { path: string; mime: string; sha256: string; bytes: number }>;
  provider: Provider;
  tools: Ffmpeg;
  /** Folder for stand-ins, hosted files and the uploaded video. */
  workDir: string;
  /** pieces.jsonl */
  pieceLog: string;
  /** Local kit records and part sources, used only to ground fake native take timing. */
  fakeRun?: { runRoot: string; partsDir: string };
  /** Called for every refused address, so the run can say so. */
  onRefused?: (url: string) => void;
  /** Real fetch for mirrored provider results (real mode only). */
  realFetch?: typeof fetch;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const lineError = (status: number, code: string, error: string, next: 'retry' | 'stop' | 'change_request' = 'stop', extra: Record<string, unknown> = {}) =>
  json(status, { error: { code, error, fix: '', next, ...extra } });

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function atomicWrite(file: string, text: string) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

function bodyOf(init: RequestInit | undefined): any {
  if (!init?.body) return undefined;
  if (typeof init.body === 'string') return JSON.parse(init.body);
  return init.body;
}

function bufferOf(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === 'string') return Buffer.from(body);
  throw new Error('unreadable upload body');
}

/** Every non-empty spoken line of the plan, in order. */
function planLines(body: Record<string, unknown>): string[] {
  const scenes = Array.isArray(body.scenes) ? (body.scenes as Array<{ line?: unknown }>) : [];
  return scenes.map((s) => (typeof s?.line === 'string' ? s.line.trim() : '')).filter(Boolean);
}

export function tryLine(opts: TryLineOptions) {
  const hash = styleHash(opts.style);
  const style = opts.style as { id: string; version: string };
  const plan = {
    project_id: opts.videoId,
    quote_id: 'q_try',
    revision: 1,
    style_id: style.id,
    style_version: style.version,
    style_hash: hash,
    brain_digest: {},
    brand: opts.brand,
    layers: opts.layers,
    body: opts.body,
  };
  const hostedDir = path.join(opts.workDir, 'hosted');
  const outDir = path.join(opts.workDir, 'pieces');
  mkdirSync(hostedDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const answersDir = path.join(opts.workDir, 'answers');
  mkdirSync(answersDir, { recursive: true });
  const hosted = new Map<string, HostedFile & { done: boolean }>();
  for (const [id, f] of opts.lineFiles ?? []) hosted.set(id, { ...f, done: true });
  // Links handed out are kept on disk, so a resumed run (a new process) still serves them.
  const servedFile = path.join(opts.workDir, 'served.json');
  const mirrorsFile = path.join(opts.workDir, 'mirrors.json');
  const loadMap = (file: string) => new Map<string, string>(existsSync(file) ? Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : []);
  const saveMap = (file: string, map: Map<string, string>) => atomicWrite(file, JSON.stringify(Object.fromEntries(map)));
  const served = loadMap(servedFile); // /out/<name> → local path
  const mirrors = loadMap(mirrorsFile); // /mirror/<id> → remote https link
  const jobs = new Map<string, Promise<ProviderAnswer>>();
  const settled = new Map<string, ProviderAnswer>();
  const lines = planLines(opts.body);
  // The uploaded video is kept on disk too: a resumed run may confirm an upload an earlier process sent.
  const uploadFile = path.join(opts.workDir, 'uploaded.mp4');
  let upload: { bytes: Buffer | null; result: 'pass' } = { bytes: existsSync(uploadFile) ? readFileSync(uploadFile) : null, result: 'pass' };
  const refused: string[] = [];

  const log = (entry: PieceLog) => appendFileSync(opts.pieceLog, `${JSON.stringify(entry)}\n`);
  const publish = (file: string) => {
    const name = `${sha(Buffer.from(path.resolve(file))).slice(0, 12)}-${path.basename(file)}`;
    if (served.get(name) !== file) {
      served.set(name, file);
      saveMap(servedFile, served);
    }
    return `${API}/out/${encodeURIComponent(name)}`;
  };
  const mirror = (remote: string) => {
    const id = sha(Buffer.from(remote)).slice(0, 24);
    if (mirrors.get(id) !== remote) {
      mirrors.set(id, remote);
      saveMap(mirrorsFile, mirrors);
    }
    return `${API}/mirror/${id}`;
  };
  /** A finished answer is kept by inputs_hash, so a resumed run never orders the same piece again. */
  const answerFile = (request: any) => {
    const id = typeof request?.inputs_hash === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(request.inputs_hash) ? request.inputs_hash : sha(Buffer.from(String(request?.idempotency_key)));
    return path.join(answersDir, `${id}.json`);
  };

  const handOver = (deviceId: string) => ({
    device_id: deviceId,
    saved_at: new Date().toISOString(),
    kit: { ok: true, min_version: '1.0.0', latest_version: '1.0.0' },
    styles: { ready: 1, total: 1 },
    line: {
      token: `vl1_try.${Math.floor(Date.now() / 1000) + 86_400}.trystyle0123456789abcdef`,
      lease: randomUUID(),
      project_id: opts.videoId,
      quote_id: plan.quote_id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      stage: 'making',
      credits: { used: 0, cap: 1_000_000 },
      plan,
      parts_lock: null,
      // Never fetched: GOOSE_KIT_STYLES_DIR reads the style from disk, checked against this hash.
      style_package: { style_id: style.id, version: style.version, style_hash: hash, url: `${API}/pkg/view`, sha256: '0'.repeat(64) },
    },
  });

  async function piece(request: any): Promise<Response> {
    const call: PieceCall = request?.call;
    const key: string = request?.idempotency_key;
    if (!call || typeof key !== 'string') return lineError(400, 'invalid_input', 'A piece needs a call and a key.');
    const model = typeof call.body?.model_id === 'string' && call.provider === 'elevenlabs' ? (call.body.model_id as string) : call.path;
    const base = { piece_key: request.piece_key, idempotency_key: key, provider: call.provider, path: call.path, model, mode: opts.provider.mode };
    if (!jobs.has(key) && !settled.has(key)) {
      const saved = answerFile(request);
      if (existsSync(saved)) {
        settled.set(key, JSON.parse(readFileSync(saved, 'utf8')) as ProviderAnswer);
        log({ time: new Date().toISOString(), ...base, status: 'done', note: 'replayed from an earlier run' });
      }
    }
    if (!jobs.has(key) && !settled.has(key)) {
      const ctx: ProviderContext = {
        piece_key: request.piece_key,
        idempotency_key: key,
        hosted: (ref) => {
          const f = hosted.get(ref.slice(HOSTED_FILE_PREFIX.length));
          return f && f.done ? f : null;
        },
        planLines: lines,
        ...(opts.provider.mode === 'fake' && opts.fakeRun ? { fakeTake: (call: PieceCall) => fakeTakeFor(opts.fakeRun!.runRoot, opts.fakeRun!.partsDir, request.piece_key, call), fakeTakeKeys: () => fakeTakeKeysFor(opts.fakeRun!.runRoot) } : {}),
        workDir: outDir,
        publish,
        mirror,
        tools: opts.tools,
      };
      const job = opts.provider.order(call, ctx).catch(
        (error: unknown): ProviderAnswer => ({ kind: 'failed', code: 'provider_failed', message: error instanceof Error ? error.message.slice(0, 300) : 'stand-in failed', next: 'stop' }),
      );
      jobs.set(key, job);
      void job.then((a) => {
        settled.set(key, a);
        if (a.kind === 'done') {
          try {
            atomicWrite(answerFile(request), JSON.stringify(a));
          } catch {
            // the answer still serves this run
          }
        }
        log({ time: new Date().toISOString(), ...base, status: a.kind, ...(a.kind === 'done' && a.usd !== undefined ? { usd_estimate: +a.usd.toFixed(4) } : {}), ...(a.kind !== 'done' ? { note: a.message.slice(0, 300) } : {}) });
      });
      // A fake answer is ready at once; give it a moment before saying "running".
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([job, new Promise((r) => (timer = setTimeout(r, opts.provider.mode === 'fake' ? 60_000 : 2_000)))]);
      clearTimeout(timer);
    }
    const answer = settled.get(key);
    if (!answer) {
      return json(200, { piece_key: request.piece_key, idempotency_key: key, status: 'running', replayed: false, piece_credits: 0, credits: { used: 0, cap: 1_000_000 }, retry_after_seconds: 5 });
    }
    if (answer.kind === 'refused') return lineError(402, answer.code, answer.message, 'stop');
    if (answer.kind === 'failed') {
      return json(200, {
        piece_key: request.piece_key,
        idempotency_key: key,
        status: 'failed',
        replayed: false,
        piece_credits: 0,
        credits: { used: 0, cap: 1_000_000 },
        failure: { code: answer.code, error: answer.message, fix: '', next: answer.next },
      });
    }
    const credits = answer.usd ? 200 + Math.ceil(answer.usd * 120) : 0;
    return json(200, {
      piece_key: request.piece_key,
      idempotency_key: key,
      status: 'done',
      replayed: false,
      piece_credits: credits,
      credits: { used: credits, cap: 1_000_000 },
      result: {
        ...(answer.json !== undefined ? { json: answer.json } : {}),
        ...(answer.file ? { file_url: publish(answer.file.path) } : {}),
      },
    });
  }

  const fetchImpl = (async (input: any, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init.method ?? 'GET').toUpperCase();
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new TypeError(`try-style refused a malformed address`);
    }
    if (u.origin !== API) {
      refused.push(url);
      opts.onRefused?.(url);
      throw new TypeError(`try-style refused ${u.origin}: only its own local line is reachable`);
    }
    const p = decodeURIComponent(u.pathname);
    if (method === 'GET' && p.startsWith('/f/')) {
      const file = opts.planFiles.get(p.slice(3));
      return file ? new Response(readFileSync(file), { status: 200 }) : new Response(null, { status: 404 });
    }
    if (method === 'GET' && p.startsWith('/out/')) {
      const file = served.get(p.slice(5));
      return file ? new Response(readFileSync(file), { status: 200 }) : new Response(null, { status: 404 });
    }
    if (method === 'GET' && p.startsWith('/mirror/')) {
      const remote = mirrors.get(p.slice(8));
      if (!remote || !opts.realFetch) return new Response(null, { status: 404 });
      return opts.realFetch(remote, { method: 'GET', signal: init.signal });
    }
    if (method === 'PUT' && p.startsWith('/store/')) {
      const id = p.slice(7);
      const entry = hosted.get(id);
      if (!entry) return new Response(null, { status: 404 });
      const data = bufferOf(init.body);
      writeFileSync(entry.path, data);
      entry.bytes = data.length;
      entry.sha256 = sha(data);
      return new Response(null, { status: 200 });
    }
    if (method === 'GET' && p.startsWith('/store/')) {
      const entry = hosted.get(p.slice(7));
      return entry?.done ? new Response(readFileSync(entry.path), { status: 200 }) : new Response(null, { status: 404 });
    }
    if (method === 'PUT' && p === '/upload-slot/up_1') {
      upload = { bytes: bufferOf(init.body), result: 'pass' };
      writeFileSync(uploadFile, upload.bytes!);
      return new Response(null, { status: 200 });
    }
    if (!p.startsWith(`${PREFIX}${opts.videoId}/`)) return lineError(404, 'not_found', 'No such route.');
    const route = p.slice(`${PREFIX}${opts.videoId}`.length);
    const body = bodyOf(init);
    if (route === '/device' && method === 'POST') return json(200, handOver(body?.device?.device_id ?? 'try-device'));
    if (route === '/pieces' && method === 'POST') return piece(body);
    if (route === '/progress' && method === 'POST') return json(200, { stage: 'making', credits: { used: 0, cap: 1_000_000 }, report_within_seconds: 60 });
    if (route === '/files' && method === 'POST') {
      const id = `f${hosted.size + 1}`;
      const ext = String(body?.filename ?? '').split('.').pop() || 'bin';
      hosted.set(id, { path: path.join(hostedDir, `${id}.${ext}`), mime: String(body?.content_type ?? 'application/octet-stream'), bytes: 0, sha256: '', done: false });
      return json(200, { file_id: id, put: { url: `${API}/store/${id}`, headers: {} }, expires_at: new Date(Date.now() + 600_000).toISOString() });
    }
    const done = /^\/files\/([A-Za-z0-9_-]+)\/done$/.exec(route);
    if (done && method === 'POST') {
      const entry = hosted.get(done[1]);
      if (!entry || !entry.sha256) return lineError(409, 'file_mismatch', 'Nothing was stored in that slot.');
      entry.done = true;
      return json(200, { file_id: done[1], ref: `${HOSTED_FILE_PREFIX}${done[1]}`, sha256: entry.sha256 });
    }
    const link = /^\/files\/([A-Za-z0-9_-]+)$/.exec(route);
    if (link && method === 'GET') return json(200, { file_id: link[1], url: `${API}/store/${link[1]}`, expires_at: '' });
    if (route === '/upload' && method === 'POST') {
      return json(200, { upload_id: 'up_1', attempt: 1, put: { url: `${API}/upload-slot/up_1`, headers: {} }, expires_at: new Date(Date.now() + 600_000).toISOString() });
    }
    if (route === '/upload/up_1/done' && method === 'POST') {
      if (!upload.bytes) return lineError(409, 'file_mismatch', 'Nothing was uploaded.');
      return json(200, { upload_id: 'up_1', attempt: 1, result: 'pass', reasons: [], fixes_left: 0, stage: 'done', fee_credits: 0, credits: { used: 0, cap: 1_000_000 } });
    }
    return lineError(404, 'not_found', 'No such route.');
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    plan,
    refused,
    uploaded: () => upload.bytes,
    /** Waits for every provider job still running (so the ledger is complete before exit). */
    settle: async () => {
      await Promise.allSettled([...jobs.values()]);
    },
  };
}
