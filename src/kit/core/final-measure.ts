// gooseworks-final-measure/1 (fix-forward contract section 1): the kit measures the finished
// bytes before upload, for early feedback. The server runs the same checks on the uploaded bytes
// and stays the authority; the thresholds below are the shared ones and must not drift from it.
//
// Measured here: digital silence, tone-only "music", unplanned silence, planned pause and freeze
// limits, frozen picture, repeated shots and silence under a speaking face. The two word checks
// need the server's own transcript of the final, so the kit marks them not_applicable.
import { spawn } from 'child_process';
import type { AssemblyTimeline } from './assembly-timeline';
import { childEnv } from './toolchain';

export const FINAL_MEASURE_FORMAT = 'gooseworks-final-measure/1' as const;

/** The shared thresholds, the same numbers the server and the harness use. */
export const FINAL_MEASURE_THRESHOLDS = {
  /** digital_silence: whole-track peak below this (dBFS). */
  digital_silence_peak_dbfs: -60,
  /** digital_silence: a run of samples that are exactly zero longer than this. */
  digital_zero_run_ms: 1000,
  /** tone_only: share of spectral energy held by the narrow peaks. */
  tone_energy_share: 0.8,
  tone_max_peaks: 3,
  /** tone_only: the same peaks must hold for more than this share of the duration. */
  tone_steady_share: 0.5,
  tone_fft_size: 4096,
  tone_window_ms: 500,
  tone_peak_half_width_bins: 2,
  /** unplanned_silence and speech_over_silent_face: quieter than this, in 100 ms RMS windows. */
  quiet_dbfs: -45,
  quiet_window_ms: 100,
  unplanned_silence_ms: 1000,
  speech_gap_in_sentence_ms: 600,
  planned_pause_max_ms: 1500,
  planned_pause_total_share: 0.1,
  /** frozen_picture: ffmpeg freezedetect noise, and the run length it reports. */
  freeze_noise: 0.003,
  freeze_min_ms: 1000,
  frozen_total_share: 0.4,
  planned_freeze_max_ms: 1500,
  repeated_shot_min_ms: 1000,
  repeated_shot_max_hamming: 6,
  first_last_words: 3,
  first_last_window_ms: 4000,
  silent_face_ms: 300,
} as const;

export const FINAL_MEASURE_CHECKS = [
  'digital_silence',
  'tone_only',
  'unplanned_silence',
  'speech_gap_in_sentence',
  'planned_pause_too_long',
  'frozen_picture',
  'planned_freeze_too_long',
  'repeated_shot',
  'first_last_words',
  'speech_over_silent_face',
] as const;
export type FinalMeasureCheckId = (typeof FINAL_MEASURE_CHECKS)[number];

export type Interval = [number, number];

export interface FinalMeasureCheck {
  id: FinalMeasureCheckId;
  result: 'pass' | 'fail' | 'not_applicable';
  detail: string;
  intervals_ms: Interval[];
}

export interface FinalMeasure {
  format: typeof FINAL_MEASURE_FORMAT;
  output_sha256: string;
  measured_duration_ms: number;
  checks: FinalMeasureCheck[];
  thresholds: typeof FINAL_MEASURE_THRESHOLDS;
}

/** What the decoded sound shows. */
export interface AudioFacts {
  peak_dbfs: number;
  /** Runs of exactly-zero samples longer than the digital-zero limit. */
  zero_runs_ms: Interval[];
  /** Every run of 100 ms windows quieter than the quiet threshold. */
  quiet_runs_ms: Interval[];
  /** Windows where a few steady narrow peaks hold the energy, and the share of the duration they cover. */
  tone_runs_ms: Interval[];
  tone_share: number;
}

export interface MeasuredShot {
  id: string;
  start_ms: number;
  end_ms: number;
  /** 64-bit dHash of the middle frame; null when the frame could not be read. */
  hash: bigint | null;
  intent?: string;
}

const T = FINAL_MEASURE_THRESHOLDS;
/** At most this many time ranges are kept per check, so the record stays small in the upload manifest. */
const MAX_INTERVALS = 50;
const dbfs = (amplitude: number) => (amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity);

/** In-place radix-2 FFT of a power-of-two length. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

/** Adjacent or overlapping intervals as one. */
function merge(intervals: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/** What is left of `interval` once every `cover` (widened by `slack` ms) is taken out of it. */
export function uncovered(interval: Interval, covers: Interval[], slack = T.quiet_window_ms): Interval[] {
  let left: Interval[] = [interval];
  for (const [cs, ce] of covers) {
    const s = cs - slack;
    const e = ce + slack;
    left = left.flatMap(([a, b]): Interval[] => (e <= a || s >= b ? [[a, b]] : [...(s > a ? [[a, s] as Interval] : []), ...(e < b ? [[e, b] as Interval] : [])]));
  }
  return left.filter(([a, b]) => b > a);
}

/** Peak, exact-zero runs, quiet runs and steady tones of mono samples in -1..1. */
export function analyseAudio(samples: Float32Array, rate: number): AudioFacts {
  const toMs = (sample: number) => Math.round((sample / rate) * 1000);
  let peak = 0;
  const zero_runs_ms: Interval[] = [];
  let zeroFrom = -1;
  for (let i = 0; i <= samples.length; i++) {
    const v = i < samples.length ? samples[i] : NaN;
    if (Math.abs(v) > peak) peak = Math.abs(v);
    if (v === 0) {
      if (zeroFrom < 0) zeroFrom = i;
    } else if (zeroFrom >= 0) {
      if (toMs(i - zeroFrom) > T.digital_zero_run_ms) zero_runs_ms.push([toMs(zeroFrom), toMs(i)]);
      zeroFrom = -1;
    }
  }

  const quiet_runs_ms: Interval[] = [];
  const windowSamples = Math.max(1, Math.round((rate * T.quiet_window_ms) / 1000));
  for (let start = 0; start < samples.length; start += windowSamples) {
    const end = Math.min(samples.length, start + windowSamples);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    if (dbfs(Math.sqrt(sum / (end - start))) < T.quiet_dbfs) quiet_runs_ms.push([toMs(start), toMs(end)]);
  }

  // Tone: a 4096-point Hann FFT per 0.5 s window; the top peaks (±2 bins each) and their energy share.
  const n = T.tone_fft_size;
  const hop = Math.round((rate * T.tone_window_ms) / 1000);
  const hann = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const windows: Array<{ start: number; end: number; peaks: number[] | null }> = [];
  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(samples.length, start + hop);
    const from = Math.max(0, Math.min(start + Math.floor((hop - n) / 2), samples.length - n));
    if (samples.length < n) {
      windows.push({ start, end, peaks: null });
      continue;
    }
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    let energy = 0;
    for (let i = 0; i < n; i++) {
      re[i] = samples[from + i] * hann[i];
      energy += samples[from + i] * samples[from + i];
    }
    // A window with no sound to speak of holds no tone: silence is the other checks' business.
    if (dbfs(Math.sqrt(energy / n)) < T.digital_silence_peak_dbfs) {
      windows.push({ start, end, peaks: null });
      continue;
    }
    fft(re, im);
    const power = new Float64Array(n / 2);
    let total = 0;
    for (let k = 1; k < n / 2; k++) {
      power[k] = re[k] * re[k] + im[k] * im[k];
      total += power[k];
    }
    const peaks: number[] = [];
    let held = 0;
    for (let p = 0; p < T.tone_max_peaks && total > 0; p++) {
      let best = 1;
      for (let k = 2; k < n / 2; k++) if (power[k] > power[best]) best = k;
      if (power[best] <= 0) break;
      for (let k = Math.max(1, best - T.tone_peak_half_width_bins); k <= Math.min(n / 2 - 1, best + T.tone_peak_half_width_bins); k++) {
        held += power[k];
        power[k] = 0;
      }
      peaks.push(best);
    }
    windows.push({ start, end, peaks: total > 0 && held / total > T.tone_energy_share ? peaks : null });
  }
  // The steady tone: the peak shared (±2 bins) by the most tonal windows.
  let steady: typeof windows = [];
  for (const candidate of windows) {
    if (!candidate.peaks) continue;
    const anchor = candidate.peaks[0];
    const holding = windows.filter((w) => w.peaks?.some((k) => Math.abs(k - anchor) <= T.tone_peak_half_width_bins));
    if (holding.length > steady.length) steady = holding;
  }
  const tone_share = samples.length ? steady.reduce((sum, w) => sum + (w.end - w.start), 0) / samples.length : 0;
  return { peak_dbfs: dbfs(peak), zero_runs_ms, quiet_runs_ms: merge(quiet_runs_ms), tone_runs_ms: merge(steady.map((w) => [toMs(w.start), toMs(w.end)] as Interval)), tone_share };
}

/** A 64-bit difference hash of a 9×8 grey picture (row by row): 1 where a pixel is brighter than its right neighbour. */
export function dHash(grey: Uint8Array): bigint {
  if (grey.length !== 72) throw new Error('dHash needs a 9x8 grey picture');
  let hash = 0n;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) hash = (hash << 1n) | (grey[row * 9 + col] > grey[row * 9 + col + 1] ? 1n : 0n);
  return hash;
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}`;
const ranges = (intervals: Interval[]) => intervals.slice(0, 6).map(([a, b]) => `${seconds(a)}–${seconds(b)} s`).join(', ') + (intervals.length > 6 ? ` and ${intervals.length - 6} more` : '');

/** The checks from what was measured. Pure: the measuring itself is `measureFinal`. */
export function finalMeasureChecks(input: {
  durationMs: number;
  /** null when the final has no audio track. */
  audio: AudioFacts | null;
  freezes: Interval[];
  shots: MeasuredShot[] | null;
  timeline: AssemblyTimeline | null;
}): FinalMeasureCheck[] {
  const { durationMs, audio, timeline } = input;
  const check = (id: FinalMeasureCheckId, fails: Interval[] | boolean, detail: string, passDetail = 'Within limits.'): FinalMeasureCheck => {
    const failed = Array.isArray(fails) ? fails.length > 0 : fails;
    return { id, result: failed ? 'fail' : 'pass', detail: failed ? detail : passDetail, intervals_ms: Array.isArray(fails) ? fails.slice(0, MAX_INTERVALS) : [] };
  };
  const na = (id: FinalMeasureCheckId, detail: string): FinalMeasureCheck => ({ id, result: 'not_applicable', detail, intervals_ms: [] });
  const silentByPlan = !!timeline && timeline.speech_mode === 'none' && timeline.soundtrack_modes.includes('intentional_silence');
  const pauses = (timeline?.pauses ?? []).map((p) => [p.start_ms, p.end_ms] as Interval);
  const freezesPlanned = (timeline?.visual_overrides ?? []).filter((v) => v.kind === 'freeze').map((v) => [v.start_ms, v.end_ms] as Interval);
  const allowedPauses = pauses.filter(([a, b]) => b - a <= T.planned_pause_max_ms);
  const allowedFreezes = freezesPlanned.filter(([a, b]) => b - a <= T.planned_freeze_max_ms);
  const checks: FinalMeasureCheck[] = [];

  if (silentByPlan) checks.push(na('digital_silence', 'The approved plan is a silent video (intentional_silence).'));
  else if (!audio) checks.push(check('digital_silence', [[0, durationMs]], 'The final has no sound track.'));
  else {
    const fails = audio.peak_dbfs < T.digital_silence_peak_dbfs ? [[0, durationMs] as Interval] : audio.zero_runs_ms;
    checks.push(check('digital_silence', fails, audio.peak_dbfs < T.digital_silence_peak_dbfs ? `The whole sound track peaks at ${audio.peak_dbfs === -Infinity ? 'silence' : `${audio.peak_dbfs.toFixed(0)} dBFS`}, below ${T.digital_silence_peak_dbfs} dBFS.` : `Digital silence (exact zero samples) longer than ${seconds(T.digital_zero_run_ms)} s at ${ranges(fails)}.`));
  }

  if (silentByPlan) checks.push(na('tone_only', 'The approved plan is a silent video (intentional_silence).'));
  else if (!audio) checks.push(na('tone_only', 'The final has no sound track.'));
  else checks.push(check('tone_only', audio.tone_share > T.tone_steady_share ? audio.tone_runs_ms : [], `The sound is a steady tone, not music or speech: ${T.tone_max_peaks} or fewer narrow frequencies hold over ${Math.round(T.tone_energy_share * 100)}% of the energy for ${Math.round(audio.tone_share * 100)}% of the video, at ${ranges(audio.tone_runs_ms)}.`));

  if (silentByPlan) checks.push(na('unplanned_silence', 'The approved plan is a silent video (intentional_silence).'));
  else if (!audio) checks.push(check('unplanned_silence', [[0, durationMs]], 'The final has no sound track.'));
  else {
    const fails = audio.quiet_runs_ms.flatMap((run) => uncovered(run, allowedPauses)).filter(([a, b]) => b - a > T.unplanned_silence_ms);
    checks.push(check('unplanned_silence', fails, `Silence (quieter than ${T.quiet_dbfs} dBFS) longer than ${seconds(T.unplanned_silence_ms)} s that no planned pause of ${seconds(T.planned_pause_max_ms)} s or less covers, at ${ranges(fails)}.`));
  }

  checks.push(na('speech_gap_in_sentence', 'Measured by the server from its own transcript of the final.'));

  {
    const long = pauses.filter(([a, b]) => b - a > T.planned_pause_max_ms);
    const total = merge(pauses).reduce((sum, [a, b]) => sum + (b - a), 0);
    const tooMuch = durationMs > 0 && total > durationMs * T.planned_pause_total_share;
    checks.push(check('planned_pause_too_long', long.length ? long : tooMuch ? merge(pauses) : [],
      long.length ? `A planned pause is longer than ${seconds(T.planned_pause_max_ms)} s at ${ranges(long)}.` : `Planned pauses add up to ${seconds(total)} s, more than ${Math.round(T.planned_pause_total_share * 100)}% of the video.`,
      pauses.length ? 'Within limits.' : 'No planned pauses.'));
  }

  {
    const frozenTotal = merge(input.freezes).reduce((sum, [a, b]) => sum + (b - a), 0);
    const still = durationMs > 0 && frozenTotal > durationMs * T.frozen_total_share;
    const fails = input.freezes.flatMap((run) => uncovered(run, allowedFreezes)).filter(([a, b]) => b - a > T.freeze_min_ms);
    checks.push(check('frozen_picture', still ? merge(input.freezes) : fails,
      still ? `The picture is frozen for ${Math.round((frozenTotal / durationMs) * 100)}% of the video (over ${Math.round(T.frozen_total_share * 100)}%): it plays as a still image.` : `The picture is frozen for more than ${seconds(T.freeze_min_ms)} s, with no planned freeze of ${seconds(T.planned_freeze_max_ms)} s or less covering it, at ${ranges(fails)}.`));
  }

  {
    const long = freezesPlanned.filter(([a, b]) => b - a > T.planned_freeze_max_ms);
    checks.push(check('planned_freeze_too_long', long, `A planned freeze is longer than ${seconds(T.planned_freeze_max_ms)} s at ${ranges(long)}.`, freezesPlanned.length ? 'Within limits.' : 'No planned freezes.'));
  }

  if (!input.shots) checks.push(na('repeated_shot', 'The final has no shot list to compare.'));
  else {
    const shots = [...input.shots].sort((a, b) => a.start_ms - b.start_ms);
    const repeats: Interval[] = [];
    const named: string[] = [];
    for (let i = 0; i < shots.length; i++) for (let j = i + 2; j < shots.length; j++) {
      const a = shots[i];
      const b = shots[j];
      if (a.end_ms - a.start_ms <= T.repeated_shot_min_ms || b.end_ms - b.start_ms <= T.repeated_shot_min_ms || a.hash === null || b.hash === null) continue;
      if (typeof b.intent === 'string' && b.intent.trim().toLowerCase().startsWith('callback:')) continue;
      if (hamming(a.hash, b.hash) <= T.repeated_shot_max_hamming) {
        repeats.push([b.start_ms, b.end_ms]);
        named.push(`${b.id} repeats ${a.id}`);
      }
    }
    const fails = merge(repeats);
    checks.push(check('repeated_shot', fails, `A shot is shown again later: ${named.slice(0, 4).join('; ')}${named.length > 4 ? ` and ${named.length - 4} more` : ''} (${ranges(fails)}). Use a different shot, or mark a deliberate repeat with intent "callback: …".`));
  }

  checks.push(na('first_last_words', 'Measured by the server from its own transcript of the final.'));

  if (!timeline) checks.push(na('speech_over_silent_face', 'No source-linked timeline marks a speaking face.'));
  else if (!audio && timeline.segments.some((s) => s.depicts_speech)) checks.push(check('speech_over_silent_face', timeline.segments.filter((s) => s.depicts_speech).map((s) => [s.start_ms, s.end_ms] as Interval), 'A speaking face plays with no sound track.'));
  else {
    const fails: Interval[] = [];
    for (const segment of timeline.segments.filter((s) => s.depicts_speech))
      for (const [a, b] of audio?.quiet_runs_ms ?? []) {
        const start = Math.max(a, segment.start_ms);
        const end = Math.min(b, segment.end_ms);
        if (end - start > T.silent_face_ms) fails.push([start, end]);
      }
    checks.push(check('speech_over_silent_face', merge(fails), `Silence longer than ${seconds(T.silent_face_ms)} s while a face is shown speaking, at ${ranges(merge(fails))}.`, timeline.segments.some((s) => s.depicts_speech) ? 'Within limits.' : 'No speaking face in the timeline.'));
  }
  return checks;
}

/** The failed checks, in plain words with their time ranges; empty when everything passed. */
export function finalMeasureFailures(measure: FinalMeasure): string[] {
  return measure.checks.filter((c) => c.result === 'fail').map((c) => `${c.id.replace(/_/g, ' ')}: ${c.detail}`);
}

/** Collects one ffmpeg run's stdout (up to `limit` bytes) and stderr text; rejects on a failed exit. */
function runFfmpeg(ffmpeg: string, args: string[], signal: AbortSignal, limit: number, timeoutMs: number): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(), signal });
    const out: Buffer[] = [];
    let size = 0;
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      if (size < limit) out.push(chunk.subarray(0, limit - size));
      size += chunk.length;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 2_000_000) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr });
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/** Mono samples at this rate are enough for every sound check. */
const MEASURE_RATE = 16_000;
/** The longest final the line takes is 180 s; a little more is decoded so a long tail still shows. */
const MAX_AUDIO_S = 200;
const TOOL_MS = 120_000;

/** The shots to compare: the timeline's segments, else the kit timeline's scenes. */
export function shotsOf(timeline: AssemblyTimeline | null, scenes: Array<{ id: string; start_s: number; end_s: number }>): Array<Omit<MeasuredShot, 'hash'>> | null {
  if (timeline?.segments.length) return timeline.segments.map((s) => ({ id: s.id, start_ms: s.start_ms, end_ms: s.end_ms, ...(s.intent ? { intent: s.intent } : {}) }));
  if (scenes.length) return scenes.map((s) => ({ id: s.id, start_ms: Math.round(s.start_s * 1000), end_ms: Math.round(s.end_s * 1000) }));
  return null;
}

/**
 * Measures the final with the kit's ffmpeg: one decode of the sound, one freezedetect pass, and
 * one tiny frame per long shot. Throws when a tool fails, so a missing measurement is never a pass.
 */
export async function measureFinal(opts: {
  ffmpeg: string;
  file: string;
  outputSha256: string;
  durationMs: number;
  hasAudio: boolean;
  timeline: AssemblyTimeline | null;
  scenes: Array<{ id: string; start_s: number; end_s: number }>;
  signal: AbortSignal;
}): Promise<FinalMeasure> {
  let audio: AudioFacts | null = null;
  if (opts.hasAudio) {
    const { stdout } = await runFfmpeg(opts.ffmpeg, ['-nostdin', '-v', 'error', '-i', opts.file, '-vn', '-ac', '1', '-ar', String(MEASURE_RATE), '-f', 'f32le', 'pipe:1'], opts.signal, MAX_AUDIO_S * MEASURE_RATE * 4, TOOL_MS);
    const aligned = Buffer.from(stdout.subarray(0, stdout.length - (stdout.length % 4)));
    audio = analyseAudio(new Float32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4), MEASURE_RATE);
  }
  const { stderr } = await runFfmpeg(opts.ffmpeg, ['-nostdin', '-hide_banner', '-i', opts.file, '-an', '-vf', `freezedetect=n=${T.freeze_noise}:d=${T.freeze_min_ms / 1000}`, '-f', 'null', '-'], opts.signal, 0, TOOL_MS);
  const freezes: Interval[] = [];
  let opened: number | null = null;
  for (const match of stderr.matchAll(/freeze_(start|end):\s*([0-9.]+)/g)) {
    const at = Math.min(opts.durationMs, Math.round(Number(match[2]) * 1000));
    if (match[1] === 'start') opened = at;
    else if (opened !== null) {
      freezes.push([opened, at]);
      opened = null;
    }
  }
  if (opened !== null) freezes.push([opened, opts.durationMs]);
  const listed = shotsOf(opts.timeline, opts.scenes);
  let shots: MeasuredShot[] | null = null;
  if (listed) {
    shots = [];
    for (const shot of listed) {
      let hash: bigint | null = null;
      if (shot.end_ms - shot.start_ms > T.repeated_shot_min_ms) {
        const at = ((shot.start_ms + shot.end_ms) / 2000).toFixed(3);
        const { stdout } = await runFfmpeg(opts.ffmpeg, ['-nostdin', '-v', 'error', '-ss', at, '-i', opts.file, '-frames:v', '1', '-vf', 'scale=9:8:flags=area,format=gray', '-f', 'rawvideo', 'pipe:1'], opts.signal, 72, 20_000).catch(() => ({ stdout: Buffer.alloc(0) }));
        hash = stdout.length === 72 ? dHash(new Uint8Array(stdout)) : null;
      }
      shots.push({ ...shot, hash });
    }
  }
  return {
    format: FINAL_MEASURE_FORMAT,
    output_sha256: opts.outputSha256,
    measured_duration_ms: opts.durationMs,
    checks: finalMeasureChecks({ durationMs: opts.durationMs, audio, freezes, shots, timeline: opts.timeline }),
    thresholds: FINAL_MEASURE_THRESHOLDS,
  };
}
