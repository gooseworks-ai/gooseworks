// gooseworks-final-measure/1 (fix-forward contract section 1): the kit measures the finished
// bytes before upload, for early feedback. The server runs the same checks on the uploaded bytes
// and stays the authority; the thresholds below are the shared ones and must not drift from it.
//
// Measured here: digital silence, tone-only "music", unplanned silence, planned pause and freeze
// limits, frozen picture, repeated shots and silence under a speaking face. The two word checks
// need the server's own transcript of the final, so the kit marks them not_applicable.
//
// Calibration (15 Oct, from real reference ads): silence and frozen picture may run up to 1.5 s at
// the start and 3.0 s at the end, an unplanned mid-video freeze may last 2.0 s, the tone check
// looks at 80 Hz-8 kHz only, and the still-image share follows the reference when it is known.
import { spawn } from 'child_process';
import type { AssemblyTimeline } from './assembly-timeline';
import { childEnv } from './toolchain';

export const FINAL_MEASURE_FORMAT = 'gooseworks-final-measure/1' as const;

/**
 * The shared thresholds, with the same names and numbers as the harness (goose-studio
 * final_measure.py THRESHOLDS) and the server, so every final_measure record reads alike.
 */
export const FINAL_MEASURE_THRESHOLDS = {
  digital_silence_peak_dbfs: -60,
  digital_zero_run_s: 1.0,
  tone_fft_size: 4096,
  tone_window_s: 0.5,
  tone_peak_halfwidth_bins: 2,
  tone_max_peaks: 3,
  tone_peak_energy_share: 0.8,
  tone_steady_share: 0.5,
  /** Calibration: the tone check analyses this band only, so a steady sub-bass line is not a "tone". */
  tone_min_hz: 80,
  tone_max_hz: 8000,
  quiet_dbfs: -45,
  quiet_window_ms: 100,
  unplanned_silence_s: 1.0,
  /** Calibration: silence or a frozen picture that sits inside the first 1.5 s or the last 3.0 s is allowed. */
  start_allowance_ms: 1500,
  end_allowance_ms: 3000,
  speech_gap_in_sentence_s: 0.6,
  max_pause_ms: 1500,
  max_pause_share: 0.1,
  freeze_noise: 0.003,
  freeze_min_s: 1.0,
  /** Calibration: an unplanned frozen run mid-video fails only past this length. */
  unplanned_freeze_s: 2.0,
  max_frozen_share: 0.4,
  /** Calibration: with a measured reference, the frozen share may reach max(40%, reference share + 15 points). */
  reference_frozen_margin: 0.15,
  max_freeze_ms: 1500,
  /** Amendment: a planned freeze that ends the video (the closing hold) may last this long. */
  max_end_card_freeze_ms: 3000,
  repeated_shot_min_s: 1.0,
  repeated_shot_max_hamming: 6,
  scene_cut_threshold: 0.4,
  edge_words: 3,
  edge_window_s: 4.0,
  silent_face_s: 0.3,
} as const;

/** The longest a planned freeze may last: 3.0 s when it holds the last shot to the end, else 1.5 s. */
export function maxFreezeMs(freeze: { end_ms: number }, durationMs: number): number {
  return freeze.end_ms === durationMs ? FINAL_MEASURE_THRESHOLDS.max_end_card_freeze_ms : FINAL_MEASURE_THRESHOLDS.max_freeze_ms;
}

/** The share of the video the picture may be frozen: 40%, or the reference's share plus 15 points when that is known. */
export function maxFrozenShare(referenceFrozenShare?: number | null): number {
  const T = FINAL_MEASURE_THRESHOLDS;
  return typeof referenceFrozenShare === 'number' && Number.isFinite(referenceFrozenShare) ? Math.max(T.max_frozen_share, referenceFrozenShare + T.reference_frozen_margin) : T.max_frozen_share;
}

/**
 * How much of a run lies outside the opening 1.5 s and the closing 3.0 s, in ms. Silence or a held
 * picture inside those is allowed, so only this remainder is held to a check's length limit: a 4.4 s
 * closing freeze leaves 1.4 s, while a 7 s silent tail leaves 4 s.
 */
export function pastEdges([start, end]: [number, number], durationMs: number): number {
  const T = FINAL_MEASURE_THRESHOLDS;
  return Math.max(0, Math.min(end, durationMs - T.end_allowance_ms) - Math.max(start, T.start_allowance_ms));
}

/** An approved silent video: no speech and intentional_silence as the only soundtrack. */
export function silentByPlan(timeline: { speech_mode?: unknown; soundtrack_modes?: unknown } | null | undefined): boolean {
  return !!timeline && timeline.speech_mode === 'none' && Array.isArray(timeline.soundtrack_modes) && timeline.soundtrack_modes.length === 1 && timeline.soundtrack_modes[0] === 'intentional_silence';
}

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
  /** Runs of exactly-zero samples longer than digital_zero_run_s. */
  zero_runs_ms: Interval[];
  /** One flag per 100 ms window from the start: true when its RMS is quieter than quiet_dbfs. */
  quiet: boolean[];
  /** Share of the 0.5 s windows held by one steady narrow tone, and that tone's frequency. */
  tone_share: number;
  tone_hz: number | null;
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
/** The intent prefix that marks a deliberate repeated shot (case-sensitive, as in the harness). */
const CALLBACK = 'callback:';
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

/** True when the interval sits inside one allowed interval, with 100 ms of slack (the harness's `covered`). */
export function covered([start, end]: Interval, allowed: Interval[], slackMs = 100): boolean {
  return allowed.some(([a, b]) => a - slackMs <= start && end <= b + slackMs);
}

/** Every run of true flags on a grid of `stepMs` longer than `minimumMs`, in ms. */
function runs(flags: boolean[], stepMs: number, minimumMs: number): Interval[] {
  const found: Interval[] = [];
  let opened = -1;
  for (let i = 0; i <= flags.length; i++) {
    const flag = i < flags.length && flags[i];
    if (flag && opened < 0) opened = i;
    else if (!flag && opened >= 0) {
      if ((i - opened) * stepMs > minimumMs + 1e-6) found.push([opened * stepMs, i * stepMs]);
      opened = -1;
    }
  }
  return found;
}

/** Peak, exact-zero runs, quiet windows and the steady-tone share of mono samples in -1..1. */
export function analyseAudio(samples: Float32Array, rate: number): AudioFacts {
  let peak = 0;
  const zero_runs_ms: Interval[] = [];
  let zeroFrom = -1;
  for (let i = 0; i <= samples.length; i++) {
    const v = i < samples.length ? samples[i] : NaN;
    if (Math.abs(v) > peak) peak = Math.abs(v);
    if (v === 0) {
      if (zeroFrom < 0) zeroFrom = i;
    } else if (zeroFrom >= 0) {
      if ((i - zeroFrom) / rate > T.digital_zero_run_s + 1e-9) zero_runs_ms.push([Math.round((zeroFrom / rate) * 1000), Math.round((i / rate) * 1000)]);
      zeroFrom = -1;
    }
  }

  const quiet: boolean[] = [];
  const windowSamples = Math.max(1, Math.round((rate * T.quiet_window_ms) / 1000));
  for (let start = 0; start < samples.length; start += windowSamples) {
    const end = Math.min(samples.length, start + windowSamples);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    quiet.push(dbfs(Math.sqrt(sum / (end - start))) < T.quiet_dbfs);
  }

  // Tone: a Hann FFT of 4096 samples every 0.5 s, 80 Hz-8 kHz only. A window is tonal when its top 3
  // peaks (±2 bins) hold over 80% of that band's energy; the tone is steady when one peak (±2 bins)
  // holds over half the windows.
  const n = T.tone_fft_size;
  const stride = Math.max(1, Math.round(rate * T.tone_window_s));
  const hann = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const floor = 10 ** ((2 * T.digital_silence_peak_dbfs) / 20) * n;
  const lowBin = Math.max(2, Math.ceil((T.tone_min_hz * n) / rate));
  const highBin = Math.min(n / 2, Math.floor((T.tone_max_hz * n) / rate));
  const windows: Array<number | null> = [];
  for (let start = 0; start + n <= samples.length; start += stride) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = samples[start + i] * hann[i];
    fft(re, im);
    const power = new Float64Array(n / 2 + 1);
    let total = 0;
    for (let k = lowBin; k <= highBin; k++) {
      power[k] = re[k] * re[k] + im[k] * im[k];
      total += power[k];
    }
    if (total <= floor) {
      windows.push(null);
      continue;
    }
    let held = 0;
    let dominant: number | null = null;
    for (let p = 0; p < T.tone_max_peaks; p++) {
      let top = 0;
      for (let k = 1; k < power.length; k++) if (power[k] > power[top]) top = k;
      if (power[top] <= 0) break;
      dominant ??= top;
      for (let k = Math.max(0, top - T.tone_peak_halfwidth_bins); k <= Math.min(power.length - 1, top + T.tone_peak_halfwidth_bins); k++) {
        held += power[k];
        power[k] = 0;
      }
    }
    windows.push(held / total > T.tone_peak_energy_share ? dominant : null);
  }
  const bins = windows.filter((b): b is number => b !== null);
  let tone_share = 0;
  let tone_hz: number | null = null;
  if (bins.length) {
    const near = (bin: number) => bins.filter((other) => Math.abs(bin - other) <= T.tone_peak_halfwidth_bins).length;
    const mode = bins.reduce((best, bin) => (near(bin) > near(best) ? bin : best), bins[0]);
    tone_share = near(mode) / windows.length;
    tone_hz = Math.round((mode * rate) / n);
  }
  return { peak_dbfs: dbfs(peak), zero_runs_ms, quiet, tone_share, tone_hz };
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

const sentence = (parts: string[]) => (parts.length ? `${parts.join('; ').replace(/^./, (c) => c.toUpperCase())}.` : '');
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}`;
const ranges = (intervals: Interval[]) => intervals.slice(0, 6).map(([a, b]) => `${seconds(a)}–${seconds(b)} s`).join(', ') + (intervals.length > 6 ? ` and ${intervals.length - 6} more` : '');

/**
 * The checks from what was measured, as the harness's final_measure.py decides them, plus the
 * 15 Oct amendments (an approved silent video, the closing hold, no word timings) and the
 * calibration (opening and closing allowance, 2.0 s mid-video freezes, the reference's still-image
 * share). Pure: the measuring itself is `measureFinal`.
 */
export function finalMeasureChecks(input: {
  durationMs: number;
  /** null when the final has no audio track. */
  audio: AudioFacts | null;
  freezes: Interval[];
  shots: MeasuredShot[] | null;
  timeline: AssemblyTimeline | null;
  /** The reference ad's measured frozen share (0..1), when known; otherwise the 40% cap applies. */
  referenceFrozenShare?: number | null;
}): FinalMeasureCheck[] {
  const { durationMs: d, audio, timeline } = input;
  const result = (id: FinalMeasureCheckId, failed: boolean, detail: string, intervals: Interval[] = []): FinalMeasureCheck =>
    ({ id, result: failed ? 'fail' : 'pass', detail, intervals_ms: intervals.slice(0, MAX_INTERVALS) });
  const na = (id: FinalMeasureCheckId, detail: string): FinalMeasureCheck => ({ id, result: 'not_applicable', detail, intervals_ms: [] });
  const silent = silentByPlan(timeline);
  const pauses = (timeline?.pauses ?? []).map((p) => ({ ...p, span: [p.start_ms, p.end_ms] as Interval }));
  const allowedPauses = pauses.filter((p) => p.scope === 'all_audio' && p.end_ms - p.start_ms <= T.max_pause_ms).map((p) => p.span);
  const planned = (timeline?.visual_overrides ?? []).filter((v) => v.kind === 'freeze');
  const allowedFreezes = planned.filter((v) => v.end_ms - v.start_ms <= maxFreezeMs(v, timeline!.duration_ms)).map((v) => [v.start_ms, v.end_ms] as Interval);
  const step = T.quiet_window_ms;
  const quiet = audio ? audio.quiet : Array.from({ length: Math.max(1, Math.ceil(d / step)) }, () => true);
  const checks = new Map<FinalMeasureCheckId, FinalMeasureCheck>();
  const add = (c: FinalMeasureCheck) => checks.set(c.id, c);
  /** True when the part of a run outside the opening and closing allowance is longer than `limitMs`. */
  const tooLong = (r: Interval, limitMs: number) => pastEdges(r, d) > limitMs + 1e-6;
  const allowance = `outside the first ${seconds(T.start_allowance_ms)} s and last ${seconds(T.end_allowance_ms)} s`;
  const silentNote = 'The approved plan is a silent video (speech none, intentional_silence).';

  // Sound.
  if (silent) add(na('digital_silence', silentNote));
  else if (!audio) add(result('digital_silence', true, 'The final has no sound track.', [[0, d]]));
  else if (audio.peak_dbfs < T.digital_silence_peak_dbfs) add(result('digital_silence', true, `The whole sound track peaks at ${Number.isFinite(audio.peak_dbfs) ? `${audio.peak_dbfs.toFixed(1)} dBFS` : 'digital silence'}, below ${T.digital_silence_peak_dbfs} dBFS.`, [[0, d]]));
  else if (audio.zero_runs_ms.some((r) => tooLong(r, T.digital_zero_run_s * 1000))) {
    const zeros = audio.zero_runs_ms.filter((r) => tooLong(r, T.digital_zero_run_s * 1000));
    add(result('digital_silence', true, `Digital silence (exact zero samples) longer than ${T.digital_zero_run_s} s ${allowance} at ${ranges(zeros)}.`, zeros));
  }
  else add(result('digital_silence', false, `Peak ${audio.peak_dbfs.toFixed(1)} dBFS; no exact-zero run over ${T.digital_zero_run_s} s ${allowance}.`));

  if (!audio) add(na('tone_only', 'The final has no sound track.'));
  else if (audio.tone_share > T.tone_steady_share) add(result('tone_only', true, `A steady tone near ${audio.tone_hz} Hz holds ${Math.round(audio.tone_share * 100)}% of the sound track; a sine bed or drone is not music.`, [[0, d]]));
  else add(result('tone_only', false, `Steady tonal windows ${Math.round(audio.tone_share * 100)}%.`));

  if (silent) add(na('unplanned_silence', silentNote));
  else {
    const unplanned = runs(quiet, step, T.unplanned_silence_s * 1000).map(([a, b]) => [a, Math.min(b, d)] as Interval).filter((r) => tooLong(r, T.unplanned_silence_s * 1000) && !covered(r, allowedPauses));
    add(unplanned.length
      ? result('unplanned_silence', true, `Silence (quieter than ${T.quiet_dbfs} dBFS) longer than ${T.unplanned_silence_s} s ${allowance}, with no planned all-audio pause of ${seconds(T.max_pause_ms)} s or less around it, at ${ranges(unplanned)}.`, unplanned)
      : result('unplanned_silence', false, 'No unplanned silence over the limit.'));
  }

  // Words: the kit has no word timings of these exact bytes; the server transcribes and decides.
  const words = timeline && timeline.speech_mode !== 'none' ? 'No word timings for these exact bytes; GooseWorks measures this from its own transcript of the final.' : 'No speech planned.';
  add(na('speech_gap_in_sentence', words));
  add(na('first_last_words', words));

  // Timeline plans.
  if (!timeline) {
    add(na('planned_pause_too_long', 'No source-linked timeline.'));
    add(na('planned_freeze_too_long', 'No source-linked timeline.'));
  } else {
    const long = pauses.filter((p) => p.end_ms - p.start_ms > T.max_pause_ms).map((p) => p.span);
    const total = merge(pauses.map((p) => p.span)).reduce((sum, [a, b]) => sum + (b - a), 0);
    const detail = [...(long.length ? [`a planned pause is longer than ${seconds(T.max_pause_ms)} s at ${ranges(long)}`] : []), ...(total > T.max_pause_share * d ? [`planned pauses add up to ${seconds(total)} s, over ${Math.round(T.max_pause_share * 100)}% of the video`] : [])];
    add(result('planned_pause_too_long', detail.length > 0, detail.length ? sentence(detail) : 'Planned pauses within the caps.', long));
    const longFreezes = planned.filter((v) => v.end_ms - v.start_ms > maxFreezeMs(v, timeline.duration_ms)).map((v) => [v.start_ms, v.end_ms] as Interval);
    add(result('planned_freeze_too_long', longFreezes.length > 0, longFreezes.length ? `A planned freeze is longer than ${seconds(T.max_freeze_ms)} s (${seconds(T.max_end_card_freeze_ms)} s for a closing hold) at ${ranges(longFreezes)}.` : 'Planned freezes within the cap.', longFreezes));
  }

  // Picture.
  {
    const unplanned = input.freezes.filter((f) => tooLong(f, T.unplanned_freeze_s * 1000) && !covered(f, allowedFreezes));
    const share = d > 0 ? input.freezes.reduce((sum, [a, b]) => sum + (b - a), 0) / d : 0;
    const maxShare = maxFrozenShare(input.referenceFrozenShare);
    const shareNote = maxShare > T.max_frozen_share ? `, over the ${Math.round(maxShare * 100)}% the reference allows` : '';
    const detail = [...(unplanned.length ? [`the picture is frozen for more than ${T.unplanned_freeze_s} s ${allowance}, with no planned freeze around it, at ${ranges(unplanned)}`] : []), ...(share > maxShare + 1e-9 ? [`the picture is frozen ${Math.round(share * 100)}% of the time${shareNote} (a still-image ad)`] : [])];
    add(result('frozen_picture', detail.length > 0, detail.length ? sentence(detail) : 'No unplanned frozen picture.', unplanned.length ? unplanned : detail.length ? input.freezes : []));
  }

  if (!input.shots) add(na('repeated_shot', 'The final has no shots to compare.'));
  else {
    const shots = [...input.shots].sort((a, b) => a.start_ms - b.start_ms);
    const repeats: Interval[] = [];
    const named: string[] = [];
    for (let j = 0; j < shots.length; j++) for (let i = 0; i < j - 1; i++) {
      const a = shots[i];
      const b = shots[j];
      if (a.hash === null || b.hash === null || hamming(a.hash, b.hash) > T.repeated_shot_max_hamming) continue;
      if (typeof b.intent === 'string' && b.intent.startsWith(CALLBACK)) continue;
      repeats.push([a.start_ms, a.end_ms], [b.start_ms, b.end_ms]);
      named.push(`${b.id} repeats ${a.id}`);
    }
    add(repeats.length
      ? result('repeated_shot', true, `A shot is shown again later: ${named.slice(0, 4).join('; ')}${named.length > 4 ? ` and ${named.length - 4} more` : ''} (${ranges(repeats)}). Use new coverage, or mark a deliberate repeat with intent "${CALLBACK} <reason>".`, repeats)
      : result('repeated_shot', false, `No repeated shots (${shots.length} shots).`));
  }

  if (!timeline?.segments.length) add(na('speech_over_silent_face', 'No source-linked timeline marks a speaking face.'));
  else {
    const found: Interval[] = [];
    for (const segment of timeline.segments.filter((s) => s.depicts_speech)) {
      const flags = quiet.filter((_, i) => segment.start_ms <= i * step && (i + 1) * step <= segment.end_ms + 1e-6);
      const offset = Math.ceil(segment.start_ms / step - 1e-9) * step;
      found.push(...runs(flags, step, T.silent_face_s * 1000).map(([a, b]) => [offset + a, offset + b] as Interval));
    }
    add(found.length ? result('speech_over_silent_face', true, `Silence longer than ${T.silent_face_s} s while a face is shown speaking, at ${ranges(found)}.`, found) : result('speech_over_silent_face', false, 'Speaking faces have sound.'));
  }
  return FINAL_MEASURE_CHECKS.map((id) => checks.get(id)!);
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
      if (stderr.length < 4_000_000) stderr += chunk.toString('utf8');
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

/** `start: X` / `end: Y` pairs from an ffmpeg filter log, in ms; an open start runs to the end. */
function logIntervals(log: string, startKey: string, endKey: string, durationMs: number): Interval[] {
  const out: Interval[] = [];
  let opened: number | null = null;
  const pattern = new RegExp(`(${startKey}|${endKey}):\\s*([0-9.]+)`, 'g');
  for (const match of log.matchAll(pattern)) {
    const at = Math.min(durationMs, Math.round(Number(match[2]) * 1000));
    if (match[1] === startKey) opened = at;
    else if (opened !== null) {
      out.push([opened, at]);
      opened = null;
    }
  }
  if (opened !== null) out.push([opened, durationMs]);
  return out;
}

/** Mono samples at this rate are enough for every sound check. */
const MEASURE_RATE = 16_000;
/** The longest final the line takes is 180 s; a little more is decoded so a long tail still shows. */
const MAX_AUDIO_S = 200;
const TOOL_MS = 600_000;

/**
 * Measures the final with the kit's ffmpeg: one decode of the sound, one freezedetect pass, a
 * scene-cut pass when no timeline names the shots, and one tiny frame per long shot. Throws when a
 * tool fails, so a missing measurement is never a pass.
 */
export async function measureFinal(opts: {
  ffmpeg: string;
  file: string;
  outputSha256: string;
  durationMs: number;
  hasAudio: boolean;
  timeline: AssemblyTimeline | null;
  /** The reference ad's measured frozen share (0..1), when the caller has it. */
  referenceFrozenShare?: number | null;
  signal: AbortSignal;
}): Promise<FinalMeasure> {
  const d = opts.durationMs;
  let audio: AudioFacts | null = null;
  if (opts.hasAudio) {
    const { stdout } = await runFfmpeg(opts.ffmpeg, ['-nostdin', '-v', 'error', '-i', opts.file, '-vn', '-ac', '1', '-ar', String(MEASURE_RATE), '-f', 'f32le', 'pipe:1'], opts.signal, MAX_AUDIO_S * MEASURE_RATE * 4, TOOL_MS);
    const aligned = Buffer.from(stdout.subarray(0, stdout.length - (stdout.length % 4)));
    audio = analyseAudio(new Float32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4), MEASURE_RATE);
  }
  const frozen = await runFfmpeg(opts.ffmpeg, ['-nostdin', '-hide_banner', '-i', opts.file, '-map', '0:v:0', '-vf', `freezedetect=n=${T.freeze_noise}:d=${T.freeze_min_s}`, '-f', 'null', '-'], opts.signal, 0, TOOL_MS);
  const freezes = logIntervals(frozen.stderr, 'lavfi.freezedetect.freeze_start', 'lavfi.freezedetect.freeze_end', d);
  let listed: Array<Omit<MeasuredShot, 'hash'>>;
  if (opts.timeline?.segments.length) listed = opts.timeline.segments.map((s) => ({ id: s.id, start_ms: s.start_ms, end_ms: s.end_ms, ...(s.intent ? { intent: s.intent } : {}) }));
  else {
    const scenes = await runFfmpeg(opts.ffmpeg, ['-nostdin', '-hide_banner', '-i', opts.file, '-map', '0:v:0', '-vf', `select='gt(scene,${T.scene_cut_threshold})',showinfo`, '-f', 'null', '-'], opts.signal, 0, TOOL_MS);
    const cuts = [...new Set([...scenes.stderr.matchAll(/pts_time:\s*([0-9.]+)/g)].map((m) => Math.round(Number(m[1]) * 1000)).filter((at) => at > 0 && at < d))].sort((a, b) => a - b);
    const edges = [0, ...cuts, d];
    listed = edges.slice(1).map((end, i) => ({ id: `shot-${i + 1}`, start_ms: edges[i], end_ms: end }));
  }
  const shots: MeasuredShot[] = [];
  for (const shot of listed) {
    let hash: bigint | null = null;
    if (shot.end_ms - shot.start_ms > T.repeated_shot_min_s * 1000) {
      const at = ((shot.start_ms + shot.end_ms) / 2000).toFixed(3);
      const { stdout } = await runFfmpeg(opts.ffmpeg, ['-nostdin', '-v', 'error', '-ss', at, '-i', opts.file, '-frames:v', '1', '-vf', 'scale=9:8:flags=area,format=gray', '-f', 'rawvideo', 'pipe:1'], opts.signal, 72, 60_000);
      hash = stdout.length === 72 ? dHash(new Uint8Array(stdout)) : null;
    }
    shots.push({ ...shot, hash });
  }
  return {
    format: FINAL_MEASURE_FORMAT,
    output_sha256: opts.outputSha256,
    measured_duration_ms: d,
    checks: finalMeasureChecks({ durationMs: d, audio, freezes, shots, timeline: opts.timeline, referenceFrozenShare: opts.referenceFrozenShare }),
    thresholds: FINAL_MEASURE_THRESHOLDS,
  };
}
