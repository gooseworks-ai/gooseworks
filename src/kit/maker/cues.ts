// html-frames 1.2.0 sound cues. A frame page marks UI sounds with
// kit.cue(name, at_s, {gain, max_s}) before it is ready; the maker lays each
// one from the part's bundled bank (assets/sfx/<name>.wav) at the start of the
// first frame drawn at or after its time, mixes them in Node (sample-exact,
// the same bytes every run), keeps the peak under -1 dBFS and encodes the mix
// as the video's AAC track. Over a video with sound, that sound is the bed the
// cues are mixed into. A page with no cues keeps the silent video. Bundled
// into the part.
import type { KitTools } from '../part-interface';

/** The bundled UI sounds, as assets/sfx/<name>.wav in the part's folder. */
export const CUE_SOUNDS = ['tick', 'tap', 'pop', 'chime', 'whoosh', 'swoosh', 'notify', 'click'] as const;

export type CueSound = (typeof CUE_SOUNDS)[number];

/** Sample rate of the bank and of the mix. */
export const CUE_RATE = 48_000;

/** The mix never peaks above this (-1 dBFS); a louder mix is turned down as a whole. */
export const CUE_CEILING = 0.891;

/** A cue cut short by max_s fades out over this long, so the cut does not click. */
const CUT_FADE_S = 0.005;

/** A sample this quiet or quieter counts as silence when the bank's leading silence is stripped. */
const SILENCE = 1 / 2048;

/** One cue as the page marked it. */
export interface Cue {
  sound: CueSound;
  at_s: number;
  gain: number;
  max_s: number | null;
}

/** One cue as it was laid: the frame and sample it starts on. */
export interface PlacedCue extends Cue {
  frame: number;
  sample: number;
}

function isSound(value: unknown): value is CueSound {
  return typeof value === 'string' && (CUE_SOUNDS as readonly string[]).includes(value);
}

/** The cues in the page's start report. The page runtime already refused bad ones; this keeps only well-formed entries. */
export function cuesOf(report: unknown): Cue[] {
  const raw = report && typeof report === 'object' ? (report as { cues?: unknown }).cues : undefined;
  if (!Array.isArray(raw)) return [];
  const cues: Cue[] = [];
  for (const item of raw.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const { sound, at_s, gain, max_s } = item as Record<string, unknown>;
    if (!isSound(sound) || typeof at_s !== 'number' || !Number.isFinite(at_s) || at_s < 0) continue;
    cues.push({
      sound,
      at_s,
      gain: typeof gain === 'number' && Number.isFinite(gain) && gain >= 0 && gain <= 4 ? gain : 1,
      max_s: typeof max_s === 'number' && Number.isFinite(max_s) && max_s > 0 && max_s <= 10 ? max_s : null,
    });
  }
  return cues;
}

/** PCM audio: one Float32Array per channel, samples in -1..1. */
export interface Pcm {
  rate: number;
  channels: Float32Array[];
}

/** Reads a 16-bit PCM WAV file (any chunk order; extra chunks skipped). */
export function readWav(data: Uint8Array): Pcm | null {
  if (data.length < 12) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = (at: number) => String.fromCharCode(data[at], data[at + 1], data[at + 2], data[at + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let format: { channels: number; rate: number; bits: number; code: number } | null = null;
  let body: { at: number; size: number } | null = null;
  for (let at = 12; at + 8 <= data.length; ) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ' && size >= 16) {
      format = { code: view.getUint16(at + 8, true), channels: view.getUint16(at + 10, true), rate: view.getUint32(at + 12, true), bits: view.getUint16(at + 22, true) };
    } else if (id === 'data') {
      body = { at: at + 8, size: Math.min(size, data.length - at - 8) };
    }
    at += 8 + size + (size % 2);
  }
  // 1 = PCM; 0xfffe = WAVE_FORMAT_EXTENSIBLE, which ffmpeg writes for some layouts (still 16-bit PCM here).
  if (!format || !body || (format.code !== 1 && format.code !== 0xfffe) || format.bits !== 16 || format.channels < 1 || format.channels > 2) return null;
  const frames = Math.floor(body.size / (2 * format.channels));
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < format.channels; c++) channels[c][i] = view.getInt16(body.at + (i * format.channels + c) * 2, true) / 32768;
  }
  return { rate: format.rate, channels };
}

/** A bank sound as one channel, its leading silence stripped. */
export function bankSound(pcm: Pcm): Float32Array {
  const length = pcm.channels[0].length;
  const mono = new Float32Array(length);
  for (const channel of pcm.channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / pcm.channels.length;
  let start = 0;
  while (start < length && Math.abs(mono[start]) <= SILENCE) start++;
  return mono.subarray(start);
}

/** The sample a frame starts on. */
export function frameSample(frame: number, fps: number): number {
  return Math.round((frame * CUE_RATE) / fps);
}

/**
 * Lays every cue at the start of the first frame drawn at or after its time, on top of `bed`
 * (stereo, at CUE_RATE) or silence, `frames / fps` seconds long. A cue is cut
 * at max_s (with a short fade) and at the end of the video. When the mix would
 * peak above CUE_CEILING it is turned down as a whole.
 */
export function mixCues(opts: {
  cues: Cue[];
  bank: ReadonlyMap<CueSound, Float32Array>;
  fps: number;
  frames: number;
  bed?: Float32Array[] | null;
}): { channels: [Float32Array, Float32Array]; placed: PlacedCue[]; gain: number } {
  const length = frameSample(opts.frames, opts.fps);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  if (opts.bed && opts.bed.length) {
    const l = opts.bed[0];
    const r = opts.bed[1] ?? opts.bed[0];
    left.set(l.subarray(0, Math.min(length, l.length)));
    right.set(r.subarray(0, Math.min(length, r.length)));
  }
  const placed: PlacedCue[] = [];
  const fade = Math.max(1, Math.round(CUT_FADE_S * CUE_RATE));
  for (const cue of opts.cues) {
    const sound = opts.bank.get(cue.sound);
    if (!sound || !sound.length) continue;
    // The first frame drawn at or after at_s: where a change the page makes at at_s first shows.
    // A little slack keeps a time written as a frame's start (0.1 at 30 fps) on that frame.
    const frame = Math.min(opts.frames - 1, Math.max(0, Math.ceil(cue.at_s * opts.fps - 1e-6)));
    const sample = frameSample(frame, opts.fps);
    let take = Math.min(sound.length, length - sample);
    const cut = cue.max_s !== null && Math.round(cue.max_s * CUE_RATE) < take;
    if (cut) take = Math.round(cue.max_s! * CUE_RATE);
    for (let i = 0; i < take; i++) {
      const tail = take - i;
      const v = sound[i] * cue.gain * (cut && tail <= fade ? tail / fade : 1);
      left[sample + i] += v;
      right[sample + i] += v;
    }
    placed.push({ ...cue, frame, sample });
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const gain = peak > CUE_CEILING ? CUE_CEILING / peak : 1;
  if (gain !== 1) {
    for (let i = 0; i < length; i++) {
      left[i] *= gain;
      right[i] *= gain;
    }
  }
  return { channels: [left, right], placed, gain };
}

/** 16-bit PCM WAV bytes (no dither, so the same samples give the same bytes). */
export function wavBytes(channels: Float32Array[], rate: number = CUE_RATE): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const count = channels.length;
  const size = frames * count * 2;
  const data = new Uint8Array(44 + size);
  const view = new DataView(data.buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < 4; i++) data[at + i] = text.charCodeAt(i);
  };
  put(0, 'RIFF');
  view.setUint32(4, 36 + size, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  put(36, 'data');
  view.setUint32(40, size, true);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(44 + (i * count + c) * 2, Math.round(v * 32767), true);
    }
  }
  return data;
}

/** The sound of the video drawn over, as 16-bit stereo PCM at CUE_RATE, as long as the picture. */
export function bedArgs(opts: { under: string; seconds: number; out: string }): string[] {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-i', opts.under,
    '-map', '0:a:0', '-vn',
    '-t', opts.seconds.toFixed(6),
    '-ac', '2', '-ar', String(CUE_RATE),
    '-c:a', 'pcm_s16le',
    '-fflags', '+bitexact', '-flags', '+bitexact', '-map_metadata', '-1',
    opts.out,
  ];
}

/** The finished picture (copied as it is) with the cue mix as its AAC track. */
export function muxArgs(opts: { tools: Pick<KitTools, 'encodeArgs'>; picture: string; audio: string; seconds: number; out: string }): string[] {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-i', opts.picture,
    '-i', opts.audio,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy',
    ...opts.tools.encodeArgs('aac'),
    '-ac', '2',
    '-t', opts.seconds.toFixed(6),
    '-movflags', '+faststart',
    opts.out,
  ];
}
