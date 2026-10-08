// Test fixtures for the kit core: an in-memory private line, a style package
// served from it, and small parts. Nothing here ships.
import { createHash } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { canonicalHash, canonicalJson } from '../../src/kit/core/canonical';
import type { KitHost, LoadedPart } from '../../src/kit/core/host';
import { KitLog } from '../../src/kit/core/log';
import { makeVideo, type MakeResult } from '../../src/kit/core/run';
import type { Toolchain } from '../../src/kit/core/toolchain';
import { VideoLine } from '../../src/kit/line/client';
import type { PartContext, PartManifest } from '../../src/kit/part-interface';

export const API = 'https://api.test';
export const VIDEO = 'vid_1';
export const MODEL = 'test-model/clip';

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

export interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

export type PieceReply = { status: number; json: unknown };

export interface LineScript {
  /** Answer for one /pieces call; default: done with a file. */
  piece?: (request: any, n: number) => PieceReply | undefined;
  /** The token the hand-over gives. */
  token?: string;
  lock?: (lock: any) => any;
  upload?: 'pass' | 'fail';
  /** Answer for one download of a made piece's file; default: the file. */
  download?: (url: URL, n: number) => Response | undefined;
}

export const style = {
  id: 'test-style',
  version: '1.0.0',
  traits: { needs_browser: false, speech: 'none', captions: false, end_card: false, qc_flags: [] },
  duration: { min_seconds: 1, max_seconds: 60 },
  aspects: ['9:16'],
  timeline: [{ id: 'clips', part: { id: 'clip-maker', version: '1.0.0' }, inputs: { scenes: { from: 'plan.scenes' } } }],
  layers: { brand: false, captions: false, sound: true, check: true },
  assets: { fonts: [], frames: [] },
};

const layerSet = {
  brand: { id: 'brand-layer', version: '1.0.0' },
  captions: { id: 'captions-layer', version: '1.0.0' },
  sound: { id: 'sound-layer', version: '1.0.0' },
  check: { id: 'check-layer', version: '1.0.0' },
};

export function plan() {
  return {
    project_id: VIDEO,
    quote_id: 'q_1',
    revision: 1,
    style_id: style.id,
    style_version: style.version,
    style_hash: canonicalHash(style),
    brain_digest: {},
    brand: { name: 'Brand', logo: null, colors: {}, fonts: {}, pronunciations: [], cta: null },
    layers: layerSet,
    body: {
      aspect: '9:16',
      scenes: [
        { id: 's1', line: 'First line', on_screen: null, picture: null },
        { id: 's2', line: 'Second line', on_screen: null, picture: null },
      ],
      products: [],
      voice: null,
      music: null,
      cast: [],
      answers: {},
      footage: [],
    },
  };
}

export function partsLock() {
  const free = { files: {}, models: [], kit: '>=1.0.0 <2.0.0', version: '1.0.0' };
  return {
    lock: 1,
    interface: 1,
    video_id: VIDEO,
    style: { id: style.id, version: style.version },
    kit_min: '1.0.0',
    parts: {
      'clip-maker': { version: '1.0.0', files: {}, models: [{ provider: 'fal', model: MODEL }], kit: '>=1.0.0' },
      'brand-layer': free,
      'captions-layer': free,
      'sound-layer': free,
      'check-layer': free,
    },
    layers: layerSet,
  };
}

/** The style package as the API serves it: a view, its manifest, and the files. */
function stylePackage() {
  const styleBytes = Buffer.from(JSON.stringify(style));
  const files = [{ path: 'style.json', sha256: sha(styleBytes), bytes: styleBytes.length }];
  const manifest = Buffer.from(canonicalJson({ style_id: style.id, version: style.version, files }));
  const view = {
    package_id: `${style.id}@${style.version}`,
    url: `${API}/pkg/manifest`,
    sha256: sha(manifest),
    content_sha256: canonicalHash(files),
    files: files.map((f) => ({ ...f, url: `${API}/pkg/style.json` })),
    expires_at: null,
  };
  return { view, manifest, styleBytes };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** An in-memory private line that records every request. */
export function fakeLine(script: LineScript = {}) {
  const seen: Seen[] = [];
  const pieces: any[] = [];
  const pkg = stylePackage();
  const token = script.token ?? 'vl1_q_1.4102444800.handedsignature0123456789';
  let pieceCount = 0;
  let downloadCount = 0;
  const fetchImpl = (async (input: any, init: any = {}) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    seen.push({ url, method: init.method ?? 'GET', headers, body });
    const u = new URL(url);
    if (u.origin === 'https://store.test') return new Response(null, { status: 200 });
    if (u.origin === 'https://files.test') return script.download?.(u, downloadCount++) ?? new Response(Buffer.from(`clip ${u.pathname}`), { status: 200 });
    if (u.pathname === '/pkg/view') return json(200, { package: pkg.view });
    if (u.pathname === '/pkg/manifest') return new Response(pkg.manifest, { status: 200 });
    if (u.pathname === '/pkg/style.json') return new Response(pkg.styleBytes, { status: 200 });
    const p = u.pathname.replace(`/v1/video-line/${VIDEO}`, '');
    if (p === '/device') {
      const lock = script.lock ? script.lock(partsLock()) : partsLock();
      return json(200, {
        device_id: body.device.device_id,
        saved_at: new Date().toISOString(),
        kit: { ok: true, min_version: '1.0.0', latest_version: '1.0.0' },
        styles: { ready: 1, total: 1 },
        line: {
          token,
          project_id: VIDEO,
          quote_id: 'q_1',
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          lease: '00000000-0000-4000-8000-000000000001',
          stage: 'making',
          credits: { used: 0, cap: 1000 },
          plan: plan(),
          parts_lock: lock,
          style_package: { style_id: style.id, version: style.version, style_hash: canonicalHash(style), url: `${API}/pkg/view`, sha256: pkg.view.sha256 },
        },
      });
    }
    if (p === '/pieces') {
      pieces.push(body);
      const reply = script.piece?.(body, pieceCount++);
      if (reply) return json(reply.status, reply.json);
      return json(200, {
        piece_key: body.piece_key,
        idempotency_key: body.idempotency_key,
        status: 'done',
        replayed: false,
        piece_credits: 10,
        credits: { used: 10, cap: 1000 },
        result: { json: { ok: true }, file_url: `https://files.test/${body.piece_key}.mp4?X-Amz-Signature=abc` },
      });
    }
    if (p === '/progress') return json(200, { stage: 'making', credits: { used: 0, cap: 1000 }, report_within_seconds: 60 });
    if (p === '/upload') return json(200, { upload_id: 'up_1', attempt: 1, put: { url: 'https://store.test/up_1?X-Amz-Signature=s', headers: { 'x-amz-checksum-sha256': 'x' } }, expires_at: '' });
    if (p === '/upload/up_1/done') {
      const pass = (script.upload ?? 'pass') === 'pass';
      return json(200, { upload_id: 'up_1', attempt: 1, result: pass ? 'pass' : 'fail', reasons: [], fixes_left: 0, stage: pass ? 'done' : 'failed', fee_credits: 0, credits: { used: 0, cap: 1000 } });
    }
    return json(404, { error: { code: 'not_found', error: 'No such route.', fix: '', next: 'stop' } });
  }) as typeof fetch;
  return { fetch: fetchImpl, seen, pieces, token };
}

const fileSchema = (media: string) => ({ type: 'object', 'x-kit-file': { media } });

function manifest(id: string, extra: Partial<PartManifest>): PartManifest {
  return {
    interface: 1,
    id,
    version: '1.0.0',
    kind: 'compose',
    title: id,
    summary: id,
    runtime: 'node',
    entry: 'part.mjs',
    files: ['part.mjs'],
    kit: '>=1.0.0',
    needs: { browser: false, ffmpeg: false, network: false, models: [] },
    inputs: { type: 'object', additionalProperties: false, properties: {} },
    outputs: { type: 'object', additionalProperties: false, properties: {} },
    cost: { basis: 'free' },
    determinism: 'pure',
    timing: { typical_s: 1, timeout_s: 60 },
    ...extra,
  } as PartManifest;
}

const layerInputs = {
  type: 'object',
  additionalProperties: false,
  required: ['video', 'timeline'],
  properties: { video: fileSchema('video'), timeline: { type: 'object' }, brand: { type: 'object' }, expect: { type: 'object' }, words: fileSchema('json') },
};

/** The test parts: a paid clip maker that orders one piece per scene, and pass-through layers. */
export function testParts(overrides: { clip?: Partial<PartManifest> } = {}): Record<string, LoadedPart> {
  const clipMaker: LoadedPart = {
    source: 'published',
    dir: '/parts/clip-maker/1.0.0',
    manifest: manifest('clip-maker', {
      kind: 'generate_video',
      determinism: 'provider',
      needs: { browser: false, ffmpeg: false, network: true, models: [{ provider: 'fal', model: MODEL }] },
      inputs: { type: 'object', additionalProperties: false, required: ['scenes'], properties: { scenes: { type: 'array' } } },
      outputs: { type: 'object', additionalProperties: false, required: ['video', 'timeline'], properties: { video: fileSchema('video'), timeline: { type: 'object' } } },
      ...overrides.clip,
    }),
    run: async (inputs: any, ctx: PartContext) => {
      const parts: Buffer[] = [];
      for (const [i, scene] of (inputs.scenes as Array<{ line: string }>).entries()) {
        const got = await ctx.line!.order({ piece: `scene-${i + 1}`, provider: 'fal', path: MODEL, body: { text: scene.line }, results: [{ pointer: '/file_url', name: `scene-${i + 1}.mp4`, media: 'video' }] });
        parts.push(Buffer.from(got.files[`scene-${i + 1}.mp4`].sha256));
      }
      writeFileSync(path.join(ctx.workDir, 'cut.mp4'), Buffer.concat(parts));
      return { video: await ctx.file('cut.mp4', 'video'), timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } };
    },
  };
  const passLayer = (id: string, slot: 'brand' | 'captions' | 'sound', kind: PartManifest['kind']): LoadedPart => ({
    source: 'published',
    dir: `/parts/${id}/1.0.0`,
    manifest: manifest(id, { kind, layer: slot, inputs: layerInputs, outputs: { type: 'object', additionalProperties: false, required: ['video', 'timeline'], properties: { video: fileSchema('video'), timeline: { type: 'object' } } } }),
    run: async (inputs: any, ctx: PartContext) => {
      writeFileSync(path.join(ctx.workDir, 'out.mp4'), Buffer.concat([Buffer.from(slot), Buffer.from(inputs.video.sha256)]));
      return { video: await ctx.file('out.mp4', 'video'), timeline: inputs.timeline };
    },
  });
  return {
    'clip-maker': clipMaker,
    'brand-layer': passLayer('brand-layer', 'brand', 'compose'),
    'captions-layer': passLayer('captions-layer', 'captions', 'caption'),
    'sound-layer': passLayer('sound-layer', 'sound', 'mix'),
    'check-layer': {
      source: 'published',
      dir: '/parts/check-layer/1.0.0',
      manifest: manifest('check-layer', { kind: 'check', layer: 'check', inputs: layerInputs, outputs: { type: 'object', additionalProperties: false, required: ['verdict'], properties: { verdict: { type: 'object' } } } }),
      run: async () => ({ verdict: { pass: true, checks: [] } }),
    },
  };
}

export function testHost(parts: Record<string, LoadedPart>, loads: string[] = []): KitHost {
  return {
    browser: {
      check: async () => ({ ok: false, version: null, bundled: false }),
      provider: () => {
        throw new Error('no browser in tests');
      },
    },
    loader: {
      load: async ({ ref }) => {
        loads.push(`${ref.id}@${ref.version}`);
        const part = parts[ref.id];
        if (!part || part.manifest.version !== ref.version) throw new Error(`no part ${ref.id}`);
        return part;
      },
    },
  };
}

export const tools: Toolchain = {
  ffmpeg: { path: '/no/ffmpeg', report: { ok: true, version: 'test', bundled: true }, filters: [], encoders: [] },
  ffprobe: { path: '/no/ffprobe', report: { ok: true, version: 'test', bundled: true } },
};

export function tempHome(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'c1-kit-'));
}

export interface RunOptions {
  home: string;
  line: ReturnType<typeof fakeLine>;
  parts?: Record<string, LoadedPart>;
  loads?: string[];
  worker?: { token: string; id: string };
  printed?: string[];
}

export async function runMake(opts: RunOptions): Promise<MakeResult> {
  const client = new VideoLine({
    apiBase: API,
    deviceId: '11111111-2222-4333-8444-555555555555',
    fetch: opts.line.fetch,
    sleep: async () => undefined,
    ...(opts.worker ? { lineToken: opts.worker.token, workerId: opts.worker.id } : { login: 'cal_testlogin0123456789abcdef' }),
  });
  const printed = opts.printed ?? [];
  return makeVideo(VIDEO, {
    home: opts.home,
    env: {},
    line: client,
    host: testHost(opts.parts ?? testParts(), opts.loads),
    log: new KitLog((text) => printed.push(text), (text) => client.redact(text)),
    environment: 'staging',
    tools,
    sleep: async () => undefined,
    heartbeatMs: 3_600_000,
  });
}

/** Calls to exactly this line route, e.g. "/upload" (the slot) apart from "/upload/up_1/done". */
export const lineRoute = (seen: Seen[], route: string) => seen.filter((s) => new URL(s.url).pathname === `/v1/video-line/${VIDEO}${route}`);

export const lineCalls = (seen: Seen[], route: string) => seen.filter((s) => s.url.startsWith(`${API}/v1/video-line/`) && s.url.includes(route));
