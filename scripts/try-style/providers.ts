// The paid calls a try-style run makes, answered two ways:
//
//   fake (default)  every call answered locally with a labelled stand-in of the
//                   right shape, size, length and timing. No network, no keys.
//   real            every call forwarded to the real provider (fal queue API with
//                   FAL_KEY, ElevenLabs with ELEVENLABS_API_KEY), priced before it
//                   is sent, refused over the run cap or the night cap, and logged
//                   to the spend ledger. Keys are read from the environment only and
//                   never printed or written.
//
// The answer shapes match what the private line hands the kit (gooseworks-app
// services/video-line/providers.ts): fal answers are the fal result JSON with no
// file; ElevenLabs answers are a file (file_url) plus, for /with-timestamps, the
// reply JSON without audio_base64. Parts read them through results[].pointer
// against { json, file_url }. README.md in this folder has the table.
import { createHash } from 'crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { brightFor, drawtext, even, ff, probe, type Ffmpeg } from './media';

export interface PieceCall {
  provider: string;
  path: string;
  body: Record<string, unknown>;
}

/** A file a part handed the line to host (a payload's `gooseworks-file:<id>`). */
export interface HostedFile {
  path: string;
  mime: string;
  bytes: number;
  sha256: string;
}

export interface ProviderContext {
  piece_key: string;
  idempotency_key: string;
  /** The file a `gooseworks-file:<id>` string names, or null. */
  hosted: (ref: string) => HostedFile | null;
  /** Every non-empty spoken line in the plan, in order (the fake Whisper "hears" these). */
  planLines: string[];
  /** A folder this piece may write its stand-ins into. */
  workDir: string;
  /** Serves a local file through the fake line; returns its link. */
  publish: (file: string) => string;
  /** Serves a provider's own result link through the fake line (real mode); returns the local link. */
  mirror: (remote: string) => string;
  tools: Ffmpeg;
}

export type ProviderAnswer =
  | { kind: 'done'; json?: unknown; file?: { path: string; mime: string }; usd?: number }
  /** The provider failed or refused: `next: retry` earns the kit's one new attempt. */
  | { kind: 'failed'; code: 'provider_failed' | 'provider_rejected'; message: string; next: 'retry' | 'stop' }
  /** This runner refuses the call before anything is sent (no price, over a cap, no key). */
  | { kind: 'refused'; code: string; message: string };

export interface Provider {
  mode: 'fake' | 'real';
  order(call: PieceCall, ctx: ProviderContext): Promise<ProviderAnswer>;
}

// ---------------------------------------------------------------------------
// What a call is
// ---------------------------------------------------------------------------

export type CallKind =
  | 'tts_timestamps'
  | 'tts'
  | 'music'
  | 'song'
  | 'sfx'
  | 'whisper'
  | 'cutout'
  | 'lipsync'
  | 'video'
  | 'image'
  | 'unknown';

const plainPath = (p: string) => `/${p.replace(/^\/+|\/+$/g, '')}`;

export function callKind(call: PieceCall): CallKind {
  const p = plainPath(call.path);
  if (call.provider === 'elevenlabs') {
    if (/^\/v1\/text-to-speech\/[^/]+\/with-timestamps$/.test(p)) return 'tts_timestamps';
    if (/^\/v1\/text-to-speech\/[^/]+$/.test(p)) return 'tts';
    if (p === '/v1/music') return 'music';
    if (p === '/v1/music/detailed') return 'song';
    if (p === '/v1/sound-generation') return 'sfx';
    return 'unknown';
  }
  if (call.provider === 'fal') {
    const m = p.slice(1).toLowerCase();
    if (/^fal-ai\/(whisper|wizper)\b/.test(m)) return 'whisper';
    if (m.includes('birefnet')) return 'cutout';
    if (m.startsWith('veed/fabric') || m.includes('lipsync') || m.includes('lip-sync')) return 'lipsync';
    if (/(seedance|kling|veo|minimax\/h3|hailuo|\/wan|video)/.test(m)) return 'video';
    if (/(nano-banana|gpt-image|flux|imagen|seedream|image)/.test(m)) return 'image';
  }
  return 'unknown';
}

/** The model a call names: its path for fal, `model_id` (else the path) for ElevenLabs. */
export function modelOf(call: PieceCall): string {
  if (call.provider === 'elevenlabs') return typeof call.body.model_id === 'string' ? call.body.model_id : plainPath(call.path);
  return plainPath(call.path).slice(1);
}

// ---------------------------------------------------------------------------
// Prices (real mode): a conservative list price per call, before it is sent.
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /^(\d+(?:\.\d+)?)\s*s?$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
};

/** Seconds a video call asks for, when it says. */
function videoSeconds(body: Record<string, unknown>): number | null {
  return num(body.duration) ?? num(body.duration_seconds) ?? num(body.num_seconds) ?? null;
}

/**
 * USD at a deliberately high list price, or null when this runner has no
 * price for the call (then real mode refuses it). Rates were read from the
 * providers' public price pages and the plans' audits; each is rounded up.
 */
export function usdEstimate(call: PieceCall, hostedSeconds: (ref: unknown) => number | null = () => null): number | null {
  const kind = callKind(call);
  const model = modelOf(call).toLowerCase();
  const b = call.body;
  switch (kind) {
    case 'tts':
    case 'tts_timestamps': {
      const chars = typeof b.text === 'string' ? b.text.length : 0;
      return Math.max(0.001, (chars / 1000) * 0.3);
    }
    case 'music': {
      const ms = num(b.music_length_ms) ?? 30_000;
      return (ms / 60_000) * 1.0;
    }
    case 'song': {
      const plan = b.composition_plan as { sections?: Array<{ duration_ms?: number }> } | undefined;
      const ms = (plan?.sections ?? []).reduce((a, s) => a + (num(s.duration_ms) ?? 0), 0) || num(b.music_length_ms) || 60_000;
      return (ms / 60_000) * 1.0;
    }
    case 'sfx':
      return (num(b.duration_seconds) ?? 5) * 0.012;
    case 'whisper':
      return 0.02;
    case 'cutout':
      return 0.01;
    case 'image': {
      const n = num(b.num_images) ?? 1;
      if (model.includes('gpt-image')) return 0.25 * n;
      if (model.includes('nano-banana')) return 0.04 * n;
      return null;
    }
    case 'lipsync': {
      const seconds = hostedSeconds(b.audio_url) ?? 30;
      return seconds * 0.15;
    }
    case 'video': {
      const s = videoSeconds(b) ?? (model.includes('veo') ? 8 : 10);
      if (model.includes('seedance')) return s * (/1080/.test(String(b.resolution ?? '1080p')) ? 0.7 : 0.35);
      if (model.includes('kling')) return s * 0.15;
      if (model.includes('veo')) return s * 0.75;
      if (model.includes('minimax/h3')) return s * 0.4;
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Fake provider
// ---------------------------------------------------------------------------

const HOSTED = /^gooseworks-file:[A-Za-z0-9_-]+$/;

function firstHosted(value: unknown, ctx: ProviderContext): HostedFile | null {
  if (typeof value === 'string' && HOSTED.test(value)) return ctx.hosted(value);
  if (Array.isArray(value)) for (const v of value) {
    const f = firstHosted(v, ctx);
    if (f) return f;
  }
  return null;
}

const ASPECT = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;

/** Pixel size for an image call: size "WxH", image_size {width,height} or preset, aspect_ratio, else square. */
function imageSize(b: Record<string, unknown>): { w: number; h: number } {
  const size = typeof b.size === 'string' ? /^(\d+)x(\d+)$/.exec(b.size) : null;
  if (size) return { w: even(+size[1]), h: even(+size[2]) };
  const is = b.image_size;
  if (is && typeof is === 'object' && num((is as any).width) && num((is as any).height)) return { w: even(num((is as any).width)!), h: even(num((is as any).height)!) };
  const presets: Record<string, [number, number]> = {
    square_hd: [1024, 1024],
    square: [512, 512],
    portrait_4_3: [768, 1024],
    portrait_16_9: [576, 1024],
    landscape_4_3: [1024, 768],
    landscape_16_9: [1024, 576],
  };
  if (typeof is === 'string' && presets[is]) return { w: presets[is][0], h: presets[is][1] };
  const ar = typeof b.aspect_ratio === 'string' ? ASPECT.exec(b.aspect_ratio) : null;
  if (ar) {
    const [a, c] = [+ar[1], +ar[2]];
    return a >= c ? { w: 1344, h: even((1344 * c) / a) } : { w: even((1344 * a) / c), h: 1344 };
  }
  return { w: 1024, h: 1024 };
}

const SHORT_SIDE: Record<string, number> = { '360p': 360, '480p': 480, '540p': 540, '720p': 720, '768p': 768, '1080p': 1080 };

/** Pixel size for a video call: resolution + aspect_ratio, else the first image's shape, else 720x1280. */
async function videoSize(b: Record<string, unknown>, ctx: ProviderContext): Promise<{ w: number; h: number }> {
  const short = SHORT_SIDE[String(b.resolution ?? '').toLowerCase()] ?? 720;
  const ar = typeof b.aspect_ratio === 'string' ? ASPECT.exec(b.aspect_ratio) : null;
  if (ar) {
    const [a, c] = [+ar[1], +ar[2]];
    return a >= c ? { w: even((short * a) / c), h: short } : { w: short, h: even((short * c) / a) };
  }
  const img = firstHosted(b.image_url ?? b.start_image_url ?? b.reference_image_urls ?? b.image_urls, ctx);
  if (img && img.mime.startsWith('image/')) {
    const p = await probe(ctx.tools, img.path).catch(() => null);
    if (p?.width && p?.height) {
      return p.width >= p.height ? { w: even((short * p.width) / p.height), h: short } : { w: short, h: even((short * p.height) / p.width) };
    }
  }
  return { w: 720, h: 1280 };
}

/** Whether a video model's answer carries sound: what the call asks, else the model's default. */
function videoHasAudio(model: string, b: Record<string, unknown>): boolean {
  if (typeof b.generate_audio === 'boolean') return b.generate_audio;
  if (model.includes('minimax/h3') || model.includes('veo')) return true;
  if (model.includes('seedance')) return true;
  return false;
}

const nameFor = (ctx: ProviderContext, ext: string, n = 0) =>
  `${ctx.piece_key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60)}-${createHash('sha256').update(ctx.idempotency_key).digest('hex').slice(0, 8)}${n ? `-${n}` : ''}.${ext}`;

async function fakeImage(call: PieceCall, ctx: ProviderContext, n: number): Promise<{ file: string; w: number; h: number; mime: string }> {
  const { w, h } = imageSize(call.body);
  const prompt = String(call.body.prompt ?? '').slice(0, 60);
  const fmt = String(call.body.output_format ?? 'png').toLowerCase();
  const ext = fmt === 'jpeg' || fmt === 'jpg' ? 'jpg' : fmt === 'webp' ? 'webp' : 'png';
  const file = path.join(ctx.workDir, nameFor(ctx, ext, n));
  const label = `${modelOf(call)}  ${ctx.piece_key}`;
  const filters = [
    'noise=alls=45:allf=u',
    `drawgrid=w=${Math.round(w / 8)}:h=${Math.round(h / 12)}:t=3:c=white@0.6`,
    drawtext(ctx.tools, prompt || 'stand-in image', 'h*0.42', Math.max(18, Math.round(w / 28))),
    drawtext(ctx.tools, label, 'h*0.55', Math.max(14, Math.round(w / 40))),
  ].filter(Boolean);
  await ff(ctx.tools, ['-f', 'lavfi', '-i', `color=c=${brightFor(prompt + ctx.piece_key)}:s=${w}x${h}`, '-vf', filters.join(','), '-frames:v', '1', file]);
  return { file, w, h, mime: ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp' };
}

async function fakeVideo(call: PieceCall, ctx: ProviderContext, seconds: number, audio: string | null | 'tone'): Promise<{ file: string; w: number; h: number }> {
  const { w, h } = await videoSize(call.body, ctx);
  const file = path.join(ctx.workDir, nameFor(ctx, 'mp4'));
  const d = Math.max(0.5, seconds);
  const vf = ['format=yuv420p', drawtext(ctx.tools, modelOf(call), 'h*0.40', Math.max(18, Math.round(w / 26))), drawtext(ctx.tools, ctx.piece_key, 'h*0.50', Math.max(16, Math.round(w / 30)))].filter(Boolean).join(',');
  const args = ['-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:r=24:d=${d.toFixed(3)}`];
  if (audio === 'tone') args.push('-f', 'lavfi', '-i', `sine=f=330:sample_rate=48000:d=${d.toFixed(3)}`);
  else if (audio) args.push('-i', audio);
  args.push('-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '24');
  if (audio) args.push('-map', '0:v:0', '-map', '1:a:0', '-af', 'volume=0.3', '-c:a', 'aac', '-ar', '48000', '-ac', '2');
  args.push('-t', d.toFixed(3), '-movflags', '+faststart', file);
  await ff(ctx.tools, args);
  return { file, w, h };
}

/** A quiet tone (speech stand-in), silence, or a click at the start, as mp3. */
async function fakeAudio(ctx: ProviderContext, seconds: number, sound: 'tone' | 'silence' | 'click'): Promise<string> {
  const file = path.join(ctx.workDir, nameFor(ctx, 'mp3'));
  const d = Math.max(0.1, seconds).toFixed(3);
  const src =
    sound === 'tone'
      ? `sine=f=220:sample_rate=44100:d=${d}`
      : sound === 'click'
        ? `aevalsrc='if(lt(t,0.02),0.8*sin(2*PI*2000*t),0)':s=44100:d=${d}`
        : `anullsrc=r=44100:cl=mono:d=${d}`;
  const args = ['-f', 'lavfi', '-i', src];
  if (sound === 'silence') args.push('-t', d);
  if (sound === 'tone') args.push('-af', 'volume=0.25');
  args.push('-c:a', 'libmp3lame', '-b:a', '128k', file);
  await ff(ctx.tools, args);
  return file;
}

/** Even character timings over `seconds`, as ElevenLabs' alignment block. */
export function evenAlignment(text: string, seconds: number) {
  const chars = [...text];
  const step = chars.length ? seconds / chars.length : 0;
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => +(i * step).toFixed(3)),
    character_end_times_seconds: chars.map((_, i) => +((i + 1) * step).toFixed(3)),
  };
}

/** The given lines' words spread evenly over [start, end], as fal Whisper's word chunks. */
export function spreadChunks(lines: string[], start: number, end: number) {
  const words = lines.flatMap((l) => l.split(/\s+/).filter(Boolean));
  const step = words.length ? (end - start) / words.length : 0;
  return words.map((text, i) => ({ text, timestamp: [+(start + i * step).toFixed(3), +(start + (i + 0.85) * step).toFixed(3)] as [number, number] }));
}

/** Seconds of speech the fake voice takes for `text`. */
export const TTS_SECONDS_PER_CHAR = 0.065;

export class FakeProvider implements Provider {
  readonly mode = 'fake' as const;

  async order(call: PieceCall, ctx: ProviderContext): Promise<ProviderAnswer> {
    const b = call.body;
    const kind = callKind(call);
    switch (kind) {
      case 'tts':
      case 'tts_timestamps': {
        const text = String(b.text ?? '');
        if (!text.trim()) return { kind: 'failed', code: 'provider_rejected', message: 'ElevenLabs refuses empty text.', next: 'stop' };
        const seconds = Math.max(0.3, text.length * TTS_SECONDS_PER_CHAR);
        const file = await fakeAudio(ctx, seconds, 'tone');
        if (kind === 'tts') return { kind: 'done', file: { path: file, mime: 'audio/mpeg' } };
        const alignment = evenAlignment(text, seconds);
        return { kind: 'done', json: { alignment, normalized_alignment: alignment }, file: { path: file, mime: 'audio/mpeg' } };
      }
      case 'music': {
        const seconds = (num(b.music_length_ms) ?? 30_000) / 1000;
        return { kind: 'done', file: { path: await fakeAudio(ctx, seconds, 'silence'), mime: 'audio/mpeg' } };
      }
      case 'song': {
        const plan = (b.composition_plan ?? null) as { sections?: Array<{ section_name?: string; duration_ms?: number; lines?: string[] }> } | null;
        if (plan && b.music_length_ms !== undefined) return { kind: 'failed', code: 'provider_rejected', message: 'music_length_ms is refused together with a composition_plan.', next: 'stop' };
        const sections = plan?.sections ?? [];
        const totalMs = sections.reduce((a, s) => a + (num(s.duration_ms) ?? 0), 0) || num(b.music_length_ms) || 30_000;
        const words: Array<{ word: string; start_ms: number; end_ms: number }> = [];
        let at = 0;
        for (const s of sections) {
          const ms = num(s.duration_ms) ?? 0;
          const sw = (s.lines ?? []).flatMap((l) => String(l).split(/\s+/).filter(Boolean));
          // Words sit in the middle 80% of their section.
          const lead = ms * 0.1;
          const step = sw.length ? (ms * 0.8) / sw.length : 0;
          sw.forEach((word, i) => words.push({ word, start_ms: Math.round(at + lead + i * step), end_ms: Math.round(at + lead + (i + 0.85) * step) }));
          at += ms;
        }
        const file = await fakeAudio(ctx, totalMs / 1000, 'silence');
        return {
          kind: 'done',
          json: {
            composition_plan: plan,
            song_metadata: { title: 'Stand-in song', description: 'try-style fake', genres: [], languages: ['en'], is_explicit: false },
            words_timestamps: words,
          },
          file: { path: file, mime: 'audio/mpeg' },
        };
      }
      case 'sfx': {
        const seconds = num(b.duration_seconds) ?? 1;
        return { kind: 'done', file: { path: await fakeAudio(ctx, seconds, 'click'), mime: 'audio/mpeg' } };
      }
      case 'whisper': {
        const audio = firstHosted(b.audio_url, ctx);
        if (!audio) return { kind: 'failed', code: 'provider_rejected', message: 'Whisper needs audio_url.', next: 'stop' };
        const seconds = (await probe(ctx.tools, audio.path)).duration_s;
        const chunks = spreadChunks(ctx.planLines, Math.min(0.1, seconds / 10), Math.max(0, seconds - 0.1));
        return { kind: 'done', json: { text: chunks.map((c) => c.text).join(' '), chunks, inferred_languages: ['en'], diarization_segments: [] } };
      }
      case 'cutout': {
        const img = firstHosted(b.image_url, ctx);
        if (!img) return { kind: 'failed', code: 'provider_rejected', message: 'birefnet needs image_url.', next: 'stop' };
        const file = path.join(ctx.workDir, nameFor(ctx, 'png'));
        await ff(ctx.tools, ['-i', img.path, '-vf', "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-W/2,Y-H/2),min(W,H)*0.45),255,0)'", '-frames:v', '1', file]);
        const p = await probe(ctx.tools, file);
        return { kind: 'done', json: { image: { url: ctx.publish(file), width: p.width, height: p.height, content_type: 'image/png', file_name: path.basename(file) } } };
      }
      case 'image': {
        const n = Math.min(4, Math.max(1, num(b.num_images) ?? 1));
        const images = [];
        for (let i = 0; i < n; i++) {
          const made = await fakeImage(call, ctx, i);
          images.push({ url: ctx.publish(made.file), width: made.w, height: made.h, content_type: made.mime, file_name: path.basename(made.file) });
        }
        return { kind: 'done', json: { images, description: '', seed: 1 } };
      }
      case 'lipsync': {
        const audio = firstHosted(b.audio_url, ctx);
        if (!audio) return { kind: 'failed', code: 'provider_rejected', message: 'lipsync needs audio_url.', next: 'stop' };
        const seconds = (await probe(ctx.tools, audio.path)).duration_s;
        const made = await fakeVideo(call, ctx, seconds, audio.path);
        return { kind: 'done', json: { video: { url: ctx.publish(made.file), content_type: 'video/mp4', file_name: path.basename(made.file), width: made.w, height: made.h } } };
      }
      case 'video': {
        const model = modelOf(call).toLowerCase();
        const seconds = videoSeconds(b) ?? (model.includes('veo') ? 8 : 5);
        const made = await fakeVideo(call, ctx, seconds, videoHasAudio(model, b) ? 'tone' : null);
        return { kind: 'done', json: { video: { url: ctx.publish(made.file), content_type: 'video/mp4', file_name: path.basename(made.file), width: made.w, height: made.h }, seed: num(b.seed) ?? 1 } };
      }
      default:
        return { kind: 'refused', code: 'no_stand_in', message: `try-style has no stand-in for ${call.provider} ${plainPath(call.path)}; add one in scripts/try-style/providers.ts and its README row.` };
    }
  }
}

// ---------------------------------------------------------------------------
// Real provider
// ---------------------------------------------------------------------------

export interface SpendRecord {
  time: string;
  piece: string;
  model: string;
  usd_estimate: number;
  status: 'done' | 'failed' | 'unknown' | 'refused';
  provider?: string;
  run?: string;
  note?: string;
}

/** The night's spend ledger: one JSON line per paid call. */
export class SpendLedger {
  constructor(readonly file: string) {}

  total(): number {
    if (!existsSync(this.file)) return 0;
    let sum = 0;
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line) as { usd_estimate?: unknown };
        if (typeof r.usd_estimate === 'number' && Number.isFinite(r.usd_estimate)) sum += r.usd_estimate;
      } catch {
        // A line another writer broke counts as nothing; it is never rewritten.
      }
    }
    return sum;
  }

  add(record: SpendRecord): void {
    appendFileSync(this.file, `${JSON.stringify(record)}\n`);
  }
}

export interface RealOptions {
  /** USD this run may spend, at the runner's list prices. */
  capUsd: number;
  /** USD the whole ledger may reach. */
  nightCapUsd: number;
  ledger: SpendLedger;
  /** A short name for this run in the ledger. */
  run: string;
  env: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Longest wait for one fal job. */
  maxWaitMs?: number;
}

const FAL_QUEUE = 'https://queue.fal.run';
const ELEVENLABS = 'https://api.elevenlabs.io';

/** A hosted file as a data URI, which fal accepts for any file input. */
function dataUri(file: HostedFile): string {
  return `data:${file.mime};base64,${readFileSync(file.path).toString('base64')}`;
}

function withDataUris(value: unknown, ctx: ProviderContext): unknown {
  if (typeof value === 'string' && HOSTED.test(value)) {
    const f = ctx.hosted(value);
    if (!f) throw new Error(`no hosted file ${value}`);
    return dataUri(f);
  }
  if (Array.isArray(value)) return value.map((v) => withDataUris(v, ctx));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withDataUris(v, ctx)]));
  return value;
}

/** Every https link in a provider's JSON, swapped for a local mirror link. */
function mirrored(value: unknown, ctx: ProviderContext): unknown {
  if (typeof value === 'string' && /^https:\/\//i.test(value)) return ctx.mirror(value);
  if (Array.isArray(value)) return value.map((v) => mirrored(v, ctx));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mirrored(v, ctx)]));
  return value;
}

export class RealProvider implements Provider {
  readonly mode = 'real' as const;
  private spent = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: RealOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** USD this run has sent so far, at list price. */
  get runSpentUsd(): number {
    return this.spent;
  }

  private key(provider: string): string | null {
    const value = provider === 'fal' ? this.opts.env.FAL_KEY : provider === 'elevenlabs' ? this.opts.env.ELEVENLABS_API_KEY : undefined;
    return value && value.trim() ? value.trim() : null;
  }

  private refuse(call: PieceCall, ctx: ProviderContext, code: string, message: string): ProviderAnswer {
    this.opts.ledger.add({ time: new Date().toISOString(), piece: ctx.piece_key, model: modelOf(call), usd_estimate: 0, status: 'refused', provider: call.provider, run: this.opts.run, note: code });
    return { kind: 'refused', code, message };
  }

  async order(call: PieceCall, ctx: ProviderContext): Promise<ProviderAnswer> {
    const kind = callKind(call);
    if (kind === 'unknown') return this.refuse(call, ctx, 'not_allowed', `try-style does not forward ${call.provider} ${plainPath(call.path)}.`);
    // Its multipart reply is not parsed here, and the line does not carry it yet (GOOSE-4015 W0-13).
    if (kind === 'song') return this.refuse(call, ctx, 'not_allowed', 'try-style does not forward /v1/music/detailed in real mode yet.');
    const hostedSeconds = (ref: unknown) => {
      const f = firstHosted(ref, ctx);
      return f ? Math.max(1, f.bytes / 16_000) : null; // a rough upper bound; the real length is probed below when it matters
    };
    let usd = usdEstimate(call, hostedSeconds);
    if (kind === 'lipsync') {
      const f = firstHosted(call.body.audio_url, ctx);
      if (f) usd = (await probe(ctx.tools, f.path)).duration_s * 0.15;
    }
    if (usd == null) return this.refuse(call, ctx, 'price_unknown', `try-style has no price for ${modelOf(call)}, so it will not send it. Add one to usdEstimate.`);
    if (this.spent + usd > this.opts.capUsd) {
      return this.refuse(call, ctx, 'over_run_cap', `This call (~$${usd.toFixed(3)}) would take the run past its cap of $${this.opts.capUsd}.`);
    }
    const night = this.opts.ledger.total();
    if (night + usd > this.opts.nightCapUsd) {
      return this.refuse(call, ctx, 'over_night_cap', `This call (~$${usd.toFixed(3)}) would take the night's spend ($${night.toFixed(2)}) past $${this.opts.nightCapUsd}.`);
    }
    const key = this.key(call.provider);
    if (!key) return this.refuse(call, ctx, 'no_key', `${call.provider === 'fal' ? 'FAL_KEY' : 'ELEVENLABS_API_KEY'} is not set in this shell.`);

    this.spent += usd;
    let answer: ProviderAnswer;
    try {
      answer = call.provider === 'fal' ? await this.fal(call, ctx, key) : await this.elevenlabs(call, ctx, key);
    } catch (error) {
      answer = { kind: 'failed', code: 'provider_failed', message: `The call could not be completed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}`, next: 'stop' };
    }
    // A refusal at submit (4xx) was not billed; anything else counts at its estimate.
    const billed = !(answer.kind === 'failed' && answer.code === 'provider_rejected');
    if (!billed) this.spent -= usd;
    this.opts.ledger.add({
      time: new Date().toISOString(),
      piece: ctx.piece_key,
      model: modelOf(call),
      usd_estimate: billed ? +usd.toFixed(4) : 0,
      status: answer.kind === 'done' ? 'done' : answer.kind === 'failed' ? 'failed' : 'unknown',
      provider: call.provider,
      run: this.opts.run,
    });
    return answer.kind === 'done' ? { ...answer, usd } : answer;
  }

  private async fal(call: PieceCall, ctx: ProviderContext, key: string): Promise<ProviderAnswer> {
    const endpoint = plainPath(call.path).slice(1);
    const headers = { Authorization: `Key ${key}`, 'content-type': 'application/json' };
    const submit = await this.fetchImpl(`${FAL_QUEUE}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(withDataUris(call.body, ctx)) });
    if (!submit.ok) {
      const text = (await submit.text().catch(() => '')).slice(0, 300);
      const rejected = [400, 404, 413, 415, 422].includes(submit.status);
      return { kind: 'failed', code: rejected ? 'provider_rejected' : 'provider_failed', message: `fal answered ${submit.status}: ${text}`, next: rejected ? 'stop' : 'retry' };
    }
    const job = (await submit.json()) as { request_id?: string; status_url?: string; response_url?: string };
    if (!job.status_url || !job.response_url || !job.status_url.startsWith(FAL_QUEUE) || !job.response_url.startsWith(FAL_QUEUE)) {
      return { kind: 'failed', code: 'provider_failed', message: 'fal gave no job to follow.', next: 'stop' };
    }
    const deadline = Date.now() + (this.opts.maxWaitMs ?? 20 * 60_000);
    for (;;) {
      if (Date.now() > deadline) return { kind: 'failed', code: 'provider_failed', message: 'fal did not finish in time.', next: 'stop' };
      await this.sleep(3000);
      const status = await this.fetchImpl(job.status_url, { headers: { Authorization: `Key ${key}` } }).catch(() => null);
      if (!status?.ok) continue;
      const s = ((await status.json().catch(() => null)) as { status?: string } | null)?.status;
      if (s === 'COMPLETED') break;
    }
    const result = await this.fetchImpl(job.response_url, { headers: { Authorization: `Key ${key}` } });
    if (!result.ok) {
      const text = (await result.text().catch(() => '')).slice(0, 300);
      return { kind: 'failed', code: 'provider_failed', message: `fal result ${result.status}: ${text}`, next: 'stop' };
    }
    return { kind: 'done', json: mirrored(await result.json(), ctx) };
  }

  private async elevenlabs(call: PieceCall, ctx: ProviderContext, key: string): Promise<ProviderAnswer> {
    const p = plainPath(call.path);
    const res = await this.fetchImpl(`${ELEVENLABS}${p}`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(call.body) });
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      const rejected = [400, 404, 413, 415, 422].includes(res.status);
      return { kind: 'failed', code: rejected ? 'provider_rejected' : 'provider_failed', message: `ElevenLabs answered ${res.status}: ${text}`, next: rejected ? 'stop' : 'retry' };
    }
    const file = path.join(ctx.workDir, nameFor(ctx, 'mp3'));
    if (p.endsWith('/with-timestamps')) {
      const parsed = (await res.json()) as Record<string, unknown>;
      if (typeof parsed.audio_base64 !== 'string') return { kind: 'failed', code: 'provider_failed', message: 'ElevenLabs sent no audio.', next: 'stop' };
      const { audio_base64, ...rest } = parsed;
      writeFileSync(file, Buffer.from(audio_base64 as string, 'base64'));
      return { kind: 'done', json: rest, file: { path: file, mime: 'audio/mpeg' } };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) return { kind: 'failed', code: 'provider_failed', message: 'ElevenLabs sent no audio.', next: 'stop' };
    writeFileSync(file, bytes);
    return { kind: 'done', file: { path: file, mime: 'audio/mpeg' } };
  }
}
