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
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import * as path from 'path';
import type { FakeTake } from './fake-takes';
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
  /** Actual part-planned native dialogue windows; present only in the local fake runner. */
  fakeTake?: (call: PieceCall) => Promise<FakeTake | null>;
  /** Current completed native take identities; excludes sidecars from superseded inputs. */
  fakeTakeKeys?: () => string[];
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

/**
 * A call's path with one leading slash and no trailing one. A query string is
 * kept, so an ElevenLabs path with one matches no call kind and is refused, as
 * the line refuses it (its paths are exact; the line always takes the default
 * output format).
 */
const plainPath = (p: string) => `/${p.replace(/^\/+|\/+$/g, '')}`;

/** The line's song rules (gooseworks-app services/video-line/providers.ts songPlanMs, W0-13). */
const SONG_PROMPT_ONLY_FIELDS = ['music_length_ms', 'prompt', 'force_instrumental', 'generation_mode'] as const;
const SONG_SECTION_MS = { min: 3_000, max: 120_000 };
const SONG_MAX_SECTIONS = 30;

/**
 * Why the line would refuse this `/v1/music/detailed` call before any spend, or
 * null. Mirrors the line exactly, so a part that passes here passes there: no
 * query on the path (the line always takes the default mp3_44100_128), none of
 * the prompt-only fields beside the plan, and 1 to 30 `composition_plan.sections`
 * each with a whole-number `duration_ms` from 3000 to 120000.
 */
export function songProblem(call: PieceCall): string | null {
  if (call.path.includes('?')) return 'Send /v1/music/detailed with no query. The line always asks for the default output format, mp3_44100_128.';
  const b = call.body ?? {};
  const sent = SONG_PROMPT_ONLY_FIELDS.filter((f) => b[f] !== undefined && b[f] !== null);
  if (sent.length) return `A song is priced by body.composition_plan, so ${sent.join(', ')} can't be sent with it. Set each section's duration_ms instead.`;
  const sections = (b.composition_plan as { sections?: unknown } | null | undefined)?.sections;
  if (!Array.isArray(sections) || !sections.length || sections.length > SONG_MAX_SECTIONS) return `A song needs body.composition_plan.sections, 1 to ${SONG_MAX_SECTIONS} of them.`;
  for (const section of sections) {
    const ms = (section as { duration_ms?: unknown } | null)?.duration_ms;
    if (typeof ms !== 'number' || !Number.isInteger(ms) || ms < SONG_SECTION_MS.min || ms > SONG_SECTION_MS.max) {
      return `Each song section needs a whole-number duration_ms from ${SONG_SECTION_MS.min} to ${SONG_SECTION_MS.max}.`;
    }
  }
  return null;
}

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
 * USD at list price, or null when this runner has no price for the call (then
 * real mode refuses it). ElevenLabs rates are the app's own
 * (gooseworks-app routes/lib/media-proxy-cost.ts: TTS $0.10 per 1k characters,
 * music $0.15 per minute), which styles' cost.high_usd is built from. fal rates
 * here are a fallback for when fal's live list price can't be read or its unit
 * can't be counted from the request (RealProvider.estimate prefers the live one).
 */
export function usdEstimate(call: PieceCall, hostedSeconds: (ref: unknown) => number | null = () => null): number | null {
  const kind = callKind(call);
  const model = modelOf(call).toLowerCase();
  const b = call.body;
  switch (kind) {
    case 'tts':
    case 'tts_timestamps': {
      const chars = typeof b.text === 'string' ? b.text.length : 0;
      return Math.max(0.0001, (chars / 1000) * 0.1);
    }
    case 'music': {
      const ms = num(b.music_length_ms) ?? 30_000;
      return (ms / 60_000) * 0.15;
    }
    case 'song': {
      // Priced by the plan's section lengths, as the line does (songProblem refuses anything else first).
      const plan = b.composition_plan as { sections?: Array<{ duration_ms?: number }> } | undefined;
      const ms = (plan?.sections ?? []).reduce((a, s) => a + (num(s.duration_ms) ?? 0), 0) || 60_000;
      return (ms / 60_000) * 0.15;
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

async function fakeVideo(call: PieceCall, ctx: ProviderContext, seconds: number, audio: string | null | 'tone', take?: FakeTake | null): Promise<{ file: string; w: number; h: number }> {
  const { w, h } = await videoSize(call.body, ctx);
  const file = path.join(ctx.workDir, nameFor(ctx, 'mp4'));
  const d = Math.max(0.5, seconds);
  // Coarse keyed grain stays distinct after the checker's 64px measurement resize.
  const vf = ['scale=64:64', `noise=alls=60:allf=u:all_seed=${seedFor(ctx)}`, `scale=${w}:${h}:flags=neighbor`, 'format=yuv420p', drawtext(ctx.tools, modelOf(call), 'h*0.40', Math.max(18, Math.round(w / 26))), drawtext(ctx.tools, ctx.piece_key, 'h*0.50', Math.max(16, Math.round(w / 30)))].filter(Boolean).join(',');
  const args = ['-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:r=24:d=${d.toFixed(3)}`];
  if (audio === 'tone') {
    const chunks = take ? takeChunks(take) : null;
    const gates = chunks?.map((c) => `between(t,${c.timestamp[0]},${c.timestamp[1]})`).join('+');
    const src = take ? `aevalsrc='0.006*sin(2*PI*97*t)+0.18*sin(2*PI*330*t)*min(1,${gates || '0'})':s=48000:d=${d.toFixed(3)}` : `sine=f=330:sample_rate=48000:d=${d.toFixed(3)}`;
    args.push('-f', 'lavfi', '-i', src);
  }
  else if (audio) args.push('-i', audio);
  args.push('-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '24');
  if (audio) args.push('-map', '0:v:0', '-map', '1:a:0', '-af', take ? 'anull' : 'volume=0.3', '-c:a', 'aac', '-ar', '48000', '-ac', '2');
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

/** fal's `File` object, in the key order fal's replies use: {url, content_type, file_name, file_size}. */
function falFile(ctx: ProviderContext, file: string, mime: string) {
  return { url: ctx.publish(file), content_type: mime, file_name: path.basename(file), file_size: statSync(file).size };
}

/** A whole-number seed derived from the piece, so a stand-in's seed is stable across runs. */
const seedFor = (ctx: ProviderContext) => parseInt(createHash('sha256').update(ctx.idempotency_key).digest('hex').slice(0, 7), 16);

/**
 * fal's video reply for a model, exactly as its schema returns it (MASTER-PLAN
 * §4.8; contracts/replies, W0-62): every model gives `video`; Seedance adds
 * `seed`; MiniMax H3 adds `seed`, `timings` and `expanded_prompt`. Kling, Veo
 * and veed give `video` alone.
 */
export function falVideoReply(model: string, video: Record<string, unknown>, seed: number): Record<string, unknown> {
  const m = model.toLowerCase();
  if (m.startsWith('minimax/h3')) return { video, seed, timings: null, expanded_prompt: null };
  if (m.startsWith('bytedance/seedance')) return { video, seed };
  return { video };
}

/**
 * fal's image reply for a model: nano-banana adds `description`; gpt-image-2
 * gives `images` alone. Other image models keep this runner's older shape
 * (`images` and `seed`), which nothing in the contract checks yet.
 */
export function falImageReply(model: string, images: Array<Record<string, unknown>>, seed: number): Record<string, unknown> {
  const m = model.toLowerCase();
  if (m.startsWith('fal-ai/nano-banana')) return { images, description: '' };
  if (m.startsWith('openai/gpt-image')) return { images };
  return { images, seed };
}

/** Seconds of speech the fake voice takes for `text`. */
export const TTS_SECONDS_PER_CHAR = 0.065;

/** Words stay inside the actual beat; silent beats have no speech. */
export function takeChunks(take: FakeTake) {
  return take.beats.flatMap((b) => {
    const margin = Math.min(0.25, (b.end - b.start) / 4);
    return b.line ? spreadChunks([b.line], b.start + margin, b.end - margin) : [];
  });
}

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
        const problem = songProblem(call);
        if (problem) return { kind: 'failed', code: 'provider_rejected', message: problem, next: 'stop' };
        const plan = b.composition_plan as { sections: Array<{ section_name?: string; duration_ms: number; lines?: string[] }> };
        const sections = plan.sections;
        const totalMs = sections.reduce((a, s) => a + s.duration_ms, 0);
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
        // Audible: in a song style the song is the only sound, and the check fails `sound` on a silent track.
        const file = await fakeAudio(ctx, totalMs / 1000, 'tone');
        return {
          kind: 'done',
          json: {
            composition_plan: plan,
            song_metadata: { title: 'Stand-in song', description: 'try-style fake', genres: ['stand-in'], languages: ['en'], is_explicit: false },
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
        // fal Whisper's word chunks carry a leading space, and `text` is them joined.
        // Sidecars survive a resume that replays earlier video pieces without invoking this provider.
        const active = new Set(ctx.fakeTakeKeys?.() || []);
        const takes = readdirSync(ctx.workDir).filter((f) => f.endsWith('.fake-take.json')).map((f) => JSON.parse(readFileSync(path.join(ctx.workDir, f), 'utf8')) as { idempotency_key: string; take: FakeTake }).filter((s) => active.has(s.idempotency_key)).map((s) => s.take).sort((a, b) => a.offset - b.offset);
        const native = takes.flatMap((take) => takeChunks(take).map((c) => ({ ...c, timestamp: c.timestamp.map((t) => +(t + take.offset).toFixed(3)) as [number, number] })));
        const sameLines = native.map((c) => c.text).join(' ') === ctx.planLines.join(' ');
        const timed = sameLines && native.length ? native : spreadChunks(ctx.planLines, Math.min(0.1, seconds / 10), Math.max(0, seconds - 0.1));
        const chunks = timed.map((c) => ({ timestamp: c.timestamp, text: ` ${c.text}` }));
        return { kind: 'done', json: { text: chunks.map((c) => c.text).join(''), chunks, inferred_languages: ['en'], diarization_segments: [] } };
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
          images.push({ ...falFile(ctx, made.file, made.mime), width: made.w, height: made.h });
        }
        return { kind: 'done', json: falImageReply(modelOf(call), images, seedFor(ctx)) };
      }
      case 'lipsync': {
        const audio = firstHosted(b.audio_url, ctx);
        if (!audio) return { kind: 'failed', code: 'provider_rejected', message: 'lipsync needs audio_url.', next: 'stop' };
        const seconds = (await probe(ctx.tools, audio.path)).duration_s;
        const made = await fakeVideo(call, ctx, seconds, audio.path);
        return { kind: 'done', json: falVideoReply(modelOf(call), falFile(ctx, made.file, 'video/mp4'), seedFor(ctx)) };
      }
      case 'video': {
        const model = modelOf(call).toLowerCase();
        const seconds = videoSeconds(b) ?? (model.includes('veo') ? 8 : 5);
        const take = model.includes('seedance') && ctx.fakeTake ? await ctx.fakeTake(call) : null;
        const made = await fakeVideo(call, ctx, seconds, videoHasAudio(model, b) ? 'tone' : null, take);
        if (take && videoHasAudio(model, b)) writeFileSync(path.join(ctx.workDir, nameFor(ctx, 'fake-take.json')), JSON.stringify({ idempotency_key: ctx.idempotency_key, take }));
        return { kind: 'done', json: falVideoReply(modelOf(call), falFile(ctx, made.file, 'video/mp4'), num(b.seed) ?? seedFor(ctx)) };
      }
      default:
        return { kind: 'refused', code: 'no_stand_in', message: `try-style has no stand-in for ${call.provider} ${plainPath(call.path)}; add one in scripts/try-style/providers.ts and its README row.` };
    }
  }
}

// ---------------------------------------------------------------------------
// Spend ledger
// ---------------------------------------------------------------------------

/** One ledger line (MASTER-PLAN §4.11). Never a key, a header or a signed link. */
export interface SpendLine {
  ts: string;
  run_id: string;
  style_id: string;
  style_sha: string;
  step: string;
  piece_key: string;
  provider: string;
  model: string;
  est_usd: number;
  event: 'reserve' | 'done' | 'failed';
  /** On a `failed` line: false when the provider refused at submit, so the reserve is released. */
  billed?: boolean;
  reason?: string;
}

/** A ledger nobody can read safely: real mode refuses to spend against it. */
export class LedgerError extends Error {}

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * The night's spend ledger: one JSON line per event. A `reserve` line is
 * written (under a lock shared by every runner) before a paid call is sent,
 * and a `done` or `failed` line after. The total counts every reserve, so a
 * crash mid-call leaves its reserve counted. Older lines that carry
 * `usd_estimate` (this runner's first format) count at that value.
 */
export class SpendLedger {
  constructor(readonly file: string) {}

  private lines(): Array<Record<string, unknown>> {
    if (!existsSync(this.file)) return [];
    const out: Array<Record<string, unknown>> = [];
    readFileSync(this.file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!line.trim()) return;
        let r: unknown;
        try {
          r = JSON.parse(line);
        } catch {
          throw new LedgerError(`The spend ledger ${this.file} has an unreadable line ${i + 1}; fix it by hand before spending.`);
        }
        if (!r || typeof r !== 'object' || Array.isArray(r)) throw new LedgerError(`The spend ledger ${this.file} line ${i + 1} is not an object.`);
        const o = r as Record<string, unknown>;
        const usd = 'event' in o ? o.est_usd : o.usd_estimate;
        if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) throw new LedgerError(`The spend ledger ${this.file} line ${i + 1} has no usable amount.`);
        out.push(o);
      });
    return out;
  }

  /** USD the ledger holds: every reserve, less reserves released by an unbilled failure. */
  total(): number {
    let sum = 0;
    for (const o of this.lines()) {
      if (!('event' in o)) sum += o.usd_estimate as number;
      else if (o.event === 'reserve') sum += o.est_usd as number;
      else if (o.event === 'failed' && o.billed === false) sum -= o.est_usd as number;
    }
    return Math.max(0, sum);
  }

  /** Whether an earlier run already sent (or reserved) a paid call for this style. */
  hasRealRun(styleId: string): boolean {
    return this.lines().some((o) =>
      'event' in o ? o.style_id === styleId && o.event === 'reserve' : typeof o.run === 'string' && o.run.split(':')[0] === styleId && o.status !== 'refused',
    );
  }

  /** Runs `fn` while holding the ledger's lock file (shared with every other runner). */
  locked<T>(fn: () => T): T {
    const lock = `${this.file}.lock`;
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        closeSync(openSync(lock, 'wx'));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          if (Date.now() - statSync(lock).mtimeMs > 30_000) unlinkSync(lock); // left by a crash
        } catch {
          // gone already
        }
        if (Date.now() > deadline) throw new LedgerError(`The spend ledger lock ${lock} stayed taken for 15 s.`);
        sleepSync(25);
      }
    }
    try {
      return fn();
    } finally {
      try {
        unlinkSync(lock);
      } catch {
        // gone already
      }
    }
  }

  add(line: SpendLine): void {
    appendFileSync(this.file, `${JSON.stringify(line)}\n`);
  }

  /**
   * Checks the night cap (and, with `firstRunOnly`, that no other run already
   * reserved for this style) and writes the reserve, as one step under the lock.
   */
  reserve(line: SpendLine, nightCapUsd: number, firstRunOnly = false): { ok: true } | { ok: false; night: number; otherRun?: string } {
    return this.locked(() => {
      const lines = this.lines();
      const night = this.total();
      if (firstRunOnly) {
        const other = lines.find((o) =>
          'event' in o ? o.event === 'reserve' && o.style_id === line.style_id && o.run_id !== line.run_id : typeof o.run === 'string' && o.run.split(':')[0] === line.style_id && o.status !== 'refused',
        );
        if (other) return { ok: false as const, night, otherRun: String(other.run_id ?? other.run) };
      }
      if (night + line.est_usd > nightCapUsd + 1e-9) return { ok: false as const, night };
      this.add(line);
      return { ok: true as const };
    });
  }
}

// ---------------------------------------------------------------------------
// Real provider
// ---------------------------------------------------------------------------

export interface RealOptions {
  /** USD this run may spend, at the runner's estimates. */
  capUsd: number;
  /** USD the whole ledger may reach. */
  nightCapUsd: number;
  ledger: SpendLedger;
  run_id: string;
  style_id: string;
  style_sha: string;
  reason?: string;
  /** The two keys, read by the runner from --env-file (or the environment). Never passed on. */
  keys: { fal?: string; elevenlabs?: string };
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Longest wait for one fal job. */
  maxWaitMs?: number;
}

const FAL_QUEUE = 'https://queue.fal.run';
/** fal's storage API (the one @fal-ai/client's storage.upload uses). */
const FAL_STORAGE_INITIATE = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
/** fal's client switches to a multipart upload above 90 MB; this runner does not. */
const FAL_STORAGE_MAX_BYTES = 90 * 1024 * 1024;
/** Float slack in cap comparisons, so a call priced exactly at a cap passes. */
const CENT_FRACTION = 1e-9;
const FAL_PRICES = 'https://api.fal.ai/v1/models/pricing';
const ELEVENLABS = 'https://api.elevenlabs.io';

/** True only for an https link on exactly fal's queue origin (never a look-alike host). */
export function isFalQueueUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.origin === FAL_QUEUE && u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

const isHttps = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};

/** A link on this computer (the local line's own links): fal can't fetch it. */
const LOCAL_LINK = /^https?:\/\/(127\.\d+\.\d+\.\d+|localhost|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i;

/** A fal payload that can't be sent as it is (a local link, or a file fal storage would not take). */
export class PayloadError extends Error {}

// ---------------------------------------------------------------------------
// ElevenLabs /v1/music/detailed: a multipart/mixed reply
// ---------------------------------------------------------------------------

export interface MimePart {
  /** Header names lower-cased. */
  headers: Record<string, string>;
  body: Buffer;
}

/** The boundary from a Content-Type header, quoted or bare (the line's multipartBoundary). */
function multipartBoundary(contentType: string): string | null {
  const match = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  return boundary && boundary.length <= 200 ? boundary : null;
}

/** Where a part's headers end: the first blank line (CRLF or LF), or the part's start when it has none. */
function headerEnd(segment: Buffer): { at: number; size: number } | null {
  if (segment[0] === 0x0a) return { at: 0, size: 1 };
  if (segment[0] === 0x0d && segment[1] === 0x0a) return { at: 0, size: 2 };
  const crlf = segment.indexOf('\r\n\r\n');
  const lf = segment.indexOf('\n\n');
  if (crlf === -1 && lf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) return { at: crlf, size: 4 };
  return { at: lf, size: 2 };
}

/**
 * The parts of a multipart body, in order, or null when it isn't one. A port of
 * the line's reader (gooseworks-app services/video-line/multipart.ts, W0-13), so
 * real mode accepts exactly the replies production accepts: the boundary comes
 * from the Content-Type, or from the body's first line when the header has none;
 * CRLF and LF line ends both parse; binary safe.
 */
export function parseMultipart(contentType: string, body: Buffer): MimePart[] | null {
  let boundary = multipartBoundary(contentType);
  if (!boundary && body.subarray(0, 2).toString('latin1') === '--') {
    const eol = body.indexOf('\n');
    const first = body.subarray(2, eol === -1 ? Math.min(body.length, 202) : eol).toString('latin1').trim();
    boundary = first && first.length <= 200 ? first : null;
  }
  if (!boundary) return null;
  const dash = Buffer.from(`--${boundary}`, 'latin1');
  const delimiter = Buffer.from(`\n--${boundary}`, 'latin1');
  // The first delimiter may open the body; every later one follows a line break.
  let start = body.subarray(0, dash.length).equals(dash) ? 0 : body.indexOf(delimiter);
  if (start === -1) return null;
  if (start > 0) start += 1;
  const parts: MimePart[] = [];
  let cursor = start + dash.length;
  for (;;) {
    if (body.subarray(cursor, cursor + 2).toString('latin1') === '--') return parts; // the close delimiter
    const eol = body.indexOf('\n', cursor);
    if (eol === -1) return null;
    const contentStart = eol + 1;
    const next = body.indexOf(delimiter, contentStart);
    if (next === -1) return null;
    // The line break before the next delimiter belongs to the delimiter.
    const contentEnd = next > contentStart && body[next - 1] === 0x0d ? next - 1 : next;
    const segment = body.subarray(contentStart, contentEnd);
    const end = headerEnd(segment);
    const headers: Record<string, string> = {};
    if (end) {
      for (const line of segment.subarray(0, end.at).toString('latin1').split(/\r?\n/)) {
        const colon = line.indexOf(':');
        if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      }
    }
    parts.push({ headers, body: Buffer.from(end ? segment.subarray(end.at + end.size) : segment) });
    cursor = next + delimiter.length;
  }
}

/** The line's audio extensions (services/video-line/providers.ts AUDIO_EXT). */
const AUDIO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
};

/**
 * A `/v1/music/detailed` reply as the line hands it on (MASTER-PLAN §4.8; the
 * line's songReply): the `application/json` (or `+json`) part verbatim as
 * `json`, and the `audio/*` part as the file, with its type as sent. Parts are
 * found by their Content-Type, not their order. Null when either part is
 * missing or the JSON part doesn't parse.
 */
export function songReply(contentType: string, body: Buffer): { json: unknown; audio: { bytes: Buffer; mime: string; ext: string } } | null {
  const parts = parseMultipart(contentType, body);
  if (!parts) return null;
  const typeOf = (p: MimePart) => (p.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  const jsonPart = parts.find((p) => typeOf(p) === 'application/json' || typeOf(p).endsWith('+json'));
  const audioPart = parts.find((p) => typeOf(p).startsWith('audio/'));
  if (!jsonPart || !audioPart || !audioPart.body.length) return null;
  let json: unknown;
  try {
    json = JSON.parse(jsonPart.body.toString('utf8'));
  } catch {
    return null;
  }
  const mime = typeOf(audioPart);
  return { json, audio: { bytes: audioPart.body, mime, ext: AUDIO_EXT[mime] ?? (mime.slice('audio/'.length).replace(/[^a-z0-9]/g, '') || 'bin') } };
}

/** Every https link in a provider's JSON, swapped for a local mirror link. */
function mirrored(value: unknown, ctx: ProviderContext): unknown {
  if (typeof value === 'string' && /^https:\/\//i.test(value)) return ctx.mirror(value);
  if (Array.isArray(value)) return value.map((v) => mirrored(v, ctx));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mirrored(v, ctx)]));
  return value;
}

/**
 * Units a fal price is quoted in, read from the request; null when this
 * runner can't tell (then only the runner's own table prices the call).
 */
export function falUnits(unit: string, call: PieceCall, audioSeconds: number | null): number | null {
  const u = unit.trim().toLowerCase();
  const kind = callKind(call);
  if (u === 'images' || u === 'image') return num(call.body.num_images) ?? 1;
  if (u === 'videos' || u === 'video' || u === 'requests' || u === 'request') return 1;
  if (u === 'seconds' || u === 'second') {
    if (kind === 'lipsync') return audioSeconds;
    if (kind === 'video') return videoSeconds(call.body) ?? (modelOf(call).includes('veo') ? 8 : 10);
  }
  return null;
}

export class RealProvider implements Provider {
  readonly mode = 'real' as const;
  private spent = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly prices = new Map<string, Promise<{ unit_price: number; unit: string } | null>>();
  /** sha256 → the fal storage link of a hosted file already uploaded this run. */
  private readonly falUploads = new Map<string, Promise<string>>();

  constructor(private readonly opts: RealOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** USD this run has sent so far, at the runner's estimates. */
  get runSpentUsd(): number {
    return this.spent;
  }

  private key(provider: string): string | null {
    const value = provider === 'fal' ? this.opts.keys.fal : provider === 'elevenlabs' ? this.opts.keys.elevenlabs : undefined;
    return value && value.trim() ? value.trim() : null;
  }

  /** fal's live list price for an endpoint (a free GET), or null when it can't be read. */
  private livePrice(endpoint: string, key: string) {
    if (!this.prices.has(endpoint)) {
      this.prices.set(
        endpoint,
        (async () => {
          const res = await this.fetchImpl(`${FAL_PRICES}?endpoint_id=${encodeURIComponent(endpoint)}`, { headers: { Authorization: `Key ${key}` } });
          if (!res.ok) return null;
          const body = (await res.json()) as { prices?: Array<{ endpoint_id?: string; unit_price?: unknown; unit?: unknown; currency?: unknown }> };
          const p = body.prices?.find((x) => x.endpoint_id === endpoint);
          if (!p || typeof p.unit_price !== 'number' || !Number.isFinite(p.unit_price) || typeof p.unit !== 'string' || (p.currency && p.currency !== 'USD')) return null;
          return { unit_price: p.unit_price, unit: p.unit };
        })().catch(() => null),
      );
    }
    return this.prices.get(endpoint)!;
  }

  /**
   * The estimate for a call: for fal, the live list price times the units read
   * from the request (MASTER-PLAN §4.11); the runner's own table when that can't
   * be read or counted, and for ElevenLabs. Null when neither can price it.
   */
  async estimate(call: PieceCall, ctx: ProviderContext, key: string): Promise<number | null> {
    const kind = callKind(call);
    let audioSeconds: number | null = null;
    if (kind === 'lipsync') {
      const f = firstHosted(call.body.audio_url, ctx);
      audioSeconds = f ? (await probe(ctx.tools, f.path)).duration_s : null;
      if (audioSeconds == null) return null;
    }
    const table = usdEstimate(call, () => audioSeconds);
    let live: number | null = null;
    if (call.provider === 'fal') {
      const price = await this.livePrice(plainPath(call.path).slice(1), key);
      const units = price ? falUnits(price.unit, call, audioSeconds) : null;
      if (price && units != null) live = price.unit_price * units;
    }
    return live ?? table;
  }

  private line(call: PieceCall, ctx: ProviderContext, usd: number, event: SpendLine['event'], extra: Partial<SpendLine> = {}): SpendLine {
    return {
      ts: new Date().toISOString(),
      run_id: this.opts.run_id,
      style_id: this.opts.style_id,
      style_sha: this.opts.style_sha,
      step: ctx.piece_key.split('.')[0] ?? '',
      piece_key: ctx.piece_key,
      provider: call.provider,
      model: modelOf(call),
      est_usd: +usd.toFixed(4),
      event,
      ...(this.opts.reason ? { reason: this.opts.reason } : {}),
      ...extra,
    };
  }

  async order(call: PieceCall, ctx: ProviderContext): Promise<ProviderAnswer> {
    const kind = callKind(call);
    if (kind === 'unknown') return { kind: 'refused', code: 'not_allowed', message: `try-style does not forward ${call.provider} ${plainPath(call.path)}.` };
    // A song the line would refuse is refused here before anything is reserved or sent, as the stand-in does (MASTER-PLAN §4.8).
    if (kind === 'song') {
      const problem = songProblem(call);
      if (problem) return { kind: 'failed', code: 'provider_rejected', message: problem, next: 'stop' };
    }
    const key = this.key(call.provider);
    if (!key) return { kind: 'refused', code: 'no_key', message: `${call.provider === 'fal' ? 'FAL_KEY (FAL_API_KEY in --env-file)' : 'ELEVENLABS_API_KEY'} was not given.` };
    const usd = await this.estimate(call, ctx, key);
    if (usd == null) return { kind: 'refused', code: 'price_unknown', message: `try-style has no price for ${modelOf(call)}, so it will not send it. Add one to usdEstimate.` };
    const overCap = () => this.spent + usd > this.opts.capUsd + CENT_FRACTION;
    const capRefusal = (): ProviderAnswer => ({ kind: 'refused', code: 'over_run_cap', message: `This call (~$${usd.toFixed(3)}) would take the run past its cap of $${this.opts.capUsd}.` });
    if (overCap()) return capRefusal();
    // Files a fal payload names go to fal storage first (free; fal can't fetch this computer's links).
    let body = call.body;
    if (call.provider === 'fal') {
      try {
        body = (await this.falPayload(call.body, ctx, key)) as Record<string, unknown>;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : 'unknown error';
        if (error instanceof PayloadError) return { kind: 'refused', code: 'payload_not_sendable', message };
        return { kind: 'failed', code: 'provider_failed', message: `A file could not be put in fal storage: ${message}`, next: 'retry' };
      }
      if (overCap()) return capRefusal(); // another piece of this run spent while the files went up
    }
    // The run cap is taken before the ledger lock, so two pieces of this run can't both pass it.
    this.spent += usd;
    let reserved: ReturnType<SpendLedger['reserve']>;
    try {
      reserved = this.opts.ledger.reserve(this.line(call, ctx, usd, 'reserve'), this.opts.nightCapUsd, !this.opts.reason);
    } catch (error) {
      this.spent -= usd;
      return { kind: 'refused', code: 'ledger_unusable', message: error instanceof Error ? error.message : 'The spend ledger could not be written.' };
    }
    if (!reserved.ok && reserved.otherRun) {
      this.spent -= usd;
      return { kind: 'refused', code: 'second_real_run', message: `Another run (${reserved.otherRun}) already spent on ${this.opts.style_id}; a second real run needs --reason.` };
    }
    if (!reserved.ok) {
      this.spent -= usd;
      return { kind: 'refused', code: 'over_night_cap', message: `This call (~$${usd.toFixed(3)}) would take the night's spend ($${reserved.night.toFixed(2)}) past $${this.opts.nightCapUsd}.` };
    }

    let answer: ProviderAnswer;
    try {
      answer = call.provider === 'fal' ? await this.fal(call, body, ctx, key) : await this.elevenlabs(call, ctx, key);
    } catch (error) {
      answer = { kind: 'failed', code: 'provider_failed', message: `The call could not be completed: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}`, next: 'stop' };
    }
    // A refusal at submit (4xx) was not billed; anything else stays counted at its estimate.
    const billed = !(answer.kind === 'failed' && answer.code === 'provider_rejected');
    if (!billed) this.spent -= usd;
    try {
      this.opts.ledger.add(this.line(call, ctx, usd, answer.kind === 'done' ? 'done' : 'failed', answer.kind === 'done' ? {} : { billed }));
    } catch {
      // The reserve is already counted; a missing closing line only over-counts.
    }
    return answer.kind === 'done' ? { ...answer, usd } : answer;
  }

  /**
   * Puts one hosted file in fal storage and returns its fal link, the way
   * @fal-ai/client's storage.upload does: POST the name and type to fal's
   * storage API (with the key), then PUT the bytes to the signed upload link it
   * returns (without the key). Each file goes up once per run.
   */
  private hostOnFal(file: HostedFile, key: string): Promise<string> {
    const id = file.sha256 || createHash('sha256').update(readFileSync(file.path)).digest('hex');
    if (!this.falUploads.has(id)) {
      const upload = (async () => {
        const bytes = readFileSync(file.path);
        if (bytes.length > FAL_STORAGE_MAX_BYTES) throw new PayloadError(`A ${Math.round(bytes.length / 1e6)} MB file is too big for this runner's fal storage upload (90 MB at most).`);
        const init = await this.fetchImpl(FAL_STORAGE_INITIATE, {
          method: 'POST',
          headers: { Authorization: `Key ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ content_type: file.mime, file_name: path.basename(file.path) }),
        });
        if (!init.ok) throw new Error(`fal storage answered ${init.status}`);
        const slot = (await init.json().catch(() => null)) as { upload_url?: unknown; file_url?: unknown } | null;
        if (!isHttps(slot?.upload_url) || !isHttps(slot?.file_url)) throw new Error('fal storage gave no https upload link');
        // The signed link carries its own permission: the key is never sent to it.
        const put = await this.fetchImpl(slot.upload_url, { method: 'PUT', headers: { 'content-type': file.mime }, body: bytes });
        if (!put.ok) throw new Error(`the fal storage upload answered ${put.status}`);
        return slot.file_url;
      })();
      // A failed upload is not kept, so the kit's retry tries again.
      upload.catch(() => this.falUploads.delete(id));
      this.falUploads.set(id, upload);
    }
    return this.falUploads.get(id)!;
  }

  /** The payload with each `gooseworks-file:<id>` swapped for its fal storage link. Refuses links on this computer. */
  private async falPayload(value: unknown, ctx: ProviderContext, key: string): Promise<unknown> {
    if (typeof value === 'string') {
      if (HOSTED.test(value)) {
        const f = ctx.hosted(value);
        if (!f) throw new PayloadError(`The payload names ${value}, which this run never hosted.`);
        return this.hostOnFal(f, key);
      }
      if (LOCAL_LINK.test(value)) throw new PayloadError('The payload names a link on this computer, which fal cannot fetch; a part must send files as file refs.');
      return value;
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const v of value) out.push(await this.falPayload(v, ctx, key));
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = await this.falPayload(v, ctx, key);
      return out;
    }
    return value;
  }

  private async fal(call: PieceCall, body: Record<string, unknown>, ctx: ProviderContext, key: string): Promise<ProviderAnswer> {
    const endpoint = plainPath(call.path).slice(1);
    const headers = { Authorization: `Key ${key}`, 'content-type': 'application/json' };
    const submit = await this.fetchImpl(`${FAL_QUEUE}/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!submit.ok) {
      const text = (await submit.text().catch(() => '')).slice(0, 300);
      const rejected = [400, 404, 413, 415, 422].includes(submit.status);
      return { kind: 'failed', code: rejected ? 'provider_rejected' : 'provider_failed', message: `fal answered ${submit.status}: ${text}`, next: rejected ? 'stop' : 'retry' };
    }
    const job = (await submit.json()) as { request_id?: string; status_url?: string; response_url?: string };
    // The key is only ever sent to fal's own queue origin.
    if (!isFalQueueUrl(job.status_url) || !isFalQueueUrl(job.response_url)) {
      return { kind: 'failed', code: 'provider_failed', message: 'fal gave no job to follow on its own queue address.', next: 'stop' };
    }
    const deadline = Date.now() + (this.opts.maxWaitMs ?? 20 * 60_000);
    for (;;) {
      if (Date.now() > deadline) return { kind: 'failed', code: 'provider_failed', message: 'fal did not finish in time.', next: 'stop' };
      await this.sleep(3000);
      const status = await this.fetchImpl(job.status_url, { headers: { Authorization: `Key ${key}` } }).catch(() => null);
      if (!status?.ok) continue;
      const s = ((await status.json().catch(() => null)) as { status?: string } | null)?.status;
      if (s === 'COMPLETED') break;
      // Any other named state but waiting or working is the end of the job.
      if (typeof s === 'string' && s !== 'IN_QUEUE' && s !== 'IN_PROGRESS') return { kind: 'failed', code: 'provider_failed', message: `fal ended the job as ${s.slice(0, 40)}.`, next: 'stop' };
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
    if (p === '/v1/music/detailed') {
      // multipart/mixed: the JSON part verbatim, and the audio part as the file.
      const song = songReply(res.headers.get('content-type') ?? '', Buffer.from(await res.arrayBuffer()));
      if (!song) return { kind: 'failed', code: 'provider_failed', message: 'ElevenLabs sent a song reply without a JSON part and an audio part.', next: 'stop' };
      const songFile = path.join(ctx.workDir, nameFor(ctx, song.audio.ext));
      writeFileSync(songFile, song.audio.bytes);
      return { kind: 'done', json: song.json, file: { path: songFile, mime: song.audio.mime } };
    }
    const file = path.join(ctx.workDir, nameFor(ctx, 'mp3'));
    // with-timestamps: the audio arrives as base64 inside the JSON; the line keeps the rest as json.
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
