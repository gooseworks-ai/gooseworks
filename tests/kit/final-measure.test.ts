// Rule (fix-forward contract section 1): the kit measures the exact final before upload with the
// shared gooseworks-final-measure/1 thresholds: digital silence, tone-only sound, unplanned
// silence, pause and freeze limits, frozen picture, repeated shots and a silent speaking face.
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ASSEMBLY_FORMAT, type AssemblyTimeline } from '../../src/kit/core/assembly-timeline';
import { FINAL_MEASURE_CHECKS, FINAL_MEASURE_THRESHOLDS, analyseAudio, covered, dHash, finalMeasureChecks, finalMeasureFailures, hamming, maxFreezeMs, maxFrozenShare, measureFinal, pastEdges, type AudioFacts, type MeasuredShot } from '../../src/kit/core/final-measure';

const RATE = 16_000;
const H = (c: string) => c.repeat(64);

/** Seconds of samples from a generator. */
const samples = (seconds: number, at: (t: number, i: number) => number) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => at(i / RATE, i));
/** Deterministic noise in -amp..amp. */
function noise(amp: number) {
  let x = 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 0xffffffff - 0.5) * 2 * amp;
  };
}
const concat = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

function timeline(overrides: Partial<AssemblyTimeline> = {}): AssemblyTimeline {
  return {
    format: ASSEMBLY_FORMAT,
    creative_contract_revision: H('c'),
    duration_ms: 10_000,
    speech_mode: 'narration',
    soundtrack_modes: ['music'],
    segments: [{ id: 'seg-1', scene_id: 's1', start_ms: 0, end_ms: 10_000, video: { asset_id: 'p', sha256: H('a'), in_ms: 0, out_ms: 10_000, speed: 1 }, speech_mode: 'narration', depicts_speech: false, native_audio: 'muted' }],
    audio_cues: [],
    pauses: [],
    required_cue_ids: [],
    ...overrides,
  };
}

/** 100 ms quiet flags for `ms` of sound, quiet inside the given ranges. */
const quietFlags = (ms: number, ...quiet: Array<[number, number]>) => Array.from({ length: Math.ceil(ms / 100) }, (_, i) => quiet.some(([a, b]) => i * 100 >= a && (i + 1) * 100 <= b));
const loud: AudioFacts = { peak_dbfs: -3, zero_runs_ms: [], quiet: quietFlags(10_000), tone_share: 0, tone_hz: null };
const byId = (checks: ReturnType<typeof finalMeasureChecks>, id: string) => checks.find((c) => c.id === id)!;
const run = (input: Partial<Parameters<typeof finalMeasureChecks>[0]> = {}) => finalMeasureChecks({ durationMs: 10_000, audio: loud, freezes: [], shots: null, timeline: timeline(), ...input });
const pause = (start: number, end: number, scope: 'speech' | 'all_audio' = 'all_audio') => ({ start_ms: start, end_ms: end, scope, reason: 'beat' });
const freeze = (start: number, end: number) => ({ start_ms: start, end_ms: end, kind: 'freeze' as const, reason: 'hold on the product', source: { asset_id: 'p', sha256: H('a'), in_ms: 0, out_ms: 1000, speed: 1 }, scene_id: 's1', source_kind: 'image' as const });

it('reports every check of the format once, in its order', () => {
  expect(run().map((c) => c.id)).toEqual([...FINAL_MEASURE_CHECKS]);
  expect(run().filter((c) => c.result === 'fail')).toEqual([]);
});

it('marks the word checks not applicable without word timings of these bytes', () => {
  for (const id of ['speech_gap_in_sentence', 'first_last_words']) {
    expect(byId(run(), id)).toMatchObject({ result: 'not_applicable', detail: expect.stringContaining('No word timings') });
    expect(byId(run({ timeline: timeline({ speech_mode: 'none' }) }), id).detail).toBe('No speech planned.');
  }
});

describe('sound', () => {
  it('passes noise-like sound and finds a steady tone, a chord and silence', () => {
    const n = noise(0.3);
    expect(analyseAudio(samples(4, () => n()), RATE)).toMatchObject({ zero_runs_ms: [], tone_share: 0 });
    expect(analyseAudio(samples(4, () => n()), RATE).quiet.every((q) => !q)).toBe(true);
    const sine = analyseAudio(samples(4, (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t)), RATE);
    expect(sine.tone_share).toBeGreaterThan(0.9);
    expect(sine.tone_hz).toBeGreaterThan(430);
    expect(sine.tone_hz).toBeLessThan(450);
    const chord = analyseAudio(samples(4, (t) => 0.2 * (Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t) + Math.sin(2 * Math.PI * 392 * t))), RATE);
    expect(chord.tone_share).toBeGreaterThan(0.9);
    const quiet = analyseAudio(samples(4, () => 0.001), RATE);
    expect(quiet.peak_dbfs).toBeLessThan(-59);
    expect(quiet.quiet.every(Boolean)).toBe(true);
  });

  it('finds an exact-zero gap longer than 1 s inside noise', () => {
    const n = noise(0.3);
    const audio = analyseAudio(concat(samples(2, () => n()), new Float32Array(1.5 * RATE), samples(5, () => n())), RATE);
    expect(audio.zero_runs_ms).toEqual([[2000, 3500]]);
    const checks = run({ audio, durationMs: 8500 });
    expect(byId(checks, 'digital_silence')).toMatchObject({ result: 'fail', intervals_ms: [[2000, 3500]] });
    expect(byId(checks, 'digital_silence').detail).toContain('2.0–3.5 s');
    expect(byId(checks, 'unplanned_silence')).toMatchObject({ result: 'fail', intervals_ms: [[2000, 3500]] });
  });

  it('fails a whole track below -60 dBFS, a missing track, and a steady tone', () => {
    expect(byId(run({ audio: { ...loud, peak_dbfs: -70 } }), 'digital_silence')).toMatchObject({ result: 'fail', intervals_ms: [[0, 10_000]] });
    expect(byId(run({ audio: null }), 'digital_silence').detail).toBe('The final has no sound track.');
    expect(byId(run({ audio: null }), 'tone_only').result).toBe('not_applicable');
    expect(byId(run({ audio: null }), 'unplanned_silence')).toMatchObject({ result: 'fail', intervals_ms: [[0, 10_000]] });
    expect(byId(run({ audio: { ...loud, tone_share: 0.8, tone_hz: 440 } }), 'tone_only')).toMatchObject({ result: 'fail', intervals_ms: [[0, 10_000]], detail: expect.stringContaining('near 440 Hz') });
    expect(byId(run({ audio: { ...loud, tone_share: 0.4, tone_hz: 440 } }), 'tone_only').result).toBe('pass');
  });

  it('allows silence inside the first 1.5 s and the last 3.0 s, and no more (calibration)', () => {
    const at = (...quiet: Array<[number, number]>) => byId(run({ audio: { ...loud, quiet: quietFlags(10_000, ...quiet) } }), 'unplanned_silence');
    expect(at([0, 1500]).result).toBe('pass');
    expect(at([7000, 10_000]).result).toBe('pass');
    expect(at([7500, 9500]).result).toBe('pass');
    // A long silent tail (a real defect in one reference) still fails.
    expect(at([3000, 10_000])).toMatchObject({ result: 'fail', intervals_ms: [[3000, 10_000]] });
    const n = noise(0.3);
    const tail = analyseAudio(concat(samples(3, () => n()), new Float32Array(2 * RATE)), RATE);
    expect(byId(run({ audio: tail, durationMs: 5000 }), 'digital_silence').result).toBe('pass');
    const longTail = analyseAudio(concat(samples(3, () => n()), new Float32Array(5 * RATE)), RATE);
    expect(byId(run({ audio: longTail, durationMs: 8000 }), 'digital_silence')).toMatchObject({ result: 'fail', intervals_ms: [[3000, 8000]] });
    // Only the part past the allowance counts: 0-2.4 s leaves 0.9 s, 0-2.6 s leaves 1.1 s.
    expect(at([0, 2400]).result).toBe('pass');
    expect(at([0, 2600])).toMatchObject({ result: 'fail', intervals_ms: [[0, 2600]] });
    expect(pastEdges([0, 1500], 10_000)).toBe(0);
    expect(pastEdges([6000, 10_000], 10_000)).toBe(1000);
  });

  it('ignores a steady sub-bass line under real sound, but still finds a mid-range drone (80 Hz-8 kHz)', () => {
    const n = noise(0.05);
    const bass = analyseAudio(samples(4, (t) => 0.5 * Math.sin(2 * Math.PI * 47 * t) + n()), RATE);
    expect(bass.tone_share).toBe(0);
    const drone = analyseAudio(samples(4, (t) => 0.5 * Math.sin(2 * Math.PI * 220 * t) + n()), RATE);
    expect(drone.tone_share).toBeGreaterThan(0.9);
  });

  it('lets one all-audio pause of 1.5 s or less hold a silence, never a longer or a speech-only one', () => {
    const audio = { ...loud, quiet: quietFlags(10_000, [3000, 4300]) };
    expect(byId(run({ audio }), 'unplanned_silence')).toMatchObject({ result: 'fail', intervals_ms: [[3000, 4300]] });
    expect(byId(run({ audio, timeline: timeline({ pauses: [pause(3000, 4300)] }) }), 'unplanned_silence').result).toBe('pass');
    expect(byId(run({ audio, timeline: timeline({ pauses: [pause(3000, 4300, 'speech')] }) }), 'unplanned_silence').result).toBe('fail');
    const long = run({ audio: { ...loud, quiet: quietFlags(10_000, [3000, 5000]) }, timeline: timeline({ pauses: [pause(3000, 5000)] }) });
    expect(byId(long, 'unplanned_silence').result).toBe('fail');
    expect(byId(long, 'planned_pause_too_long')).toMatchObject({ result: 'fail', intervals_ms: [[3000, 5000]] });
  });

  it('caps all planned pauses together at 10% of the video', () => {
    // Three 300 ms pauses are 9% of 10 s; a fourth makes 12%.
    const pauses = [1000, 3000, 5000].map((start) => pause(start, start + 300, 'speech'));
    expect(byId(run({ timeline: timeline({ pauses }) }), 'planned_pause_too_long').result).toBe('pass');
    expect(byId(run({ timeline: timeline({ pauses: [...pauses, pause(7000, 7300, 'speech')] }) }), 'planned_pause_too_long')).toMatchObject({ result: 'fail', detail: expect.stringMatching(/^Planned pauses add up to .* over 10% of the video\.$/) });
    expect(byId(run({ timeline: null }), 'planned_pause_too_long').result).toBe('not_applicable');
  });

  it('an approved silent video skips the silence checks, but a tone still fails', () => {
    const silent = timeline({ speech_mode: 'none', soundtrack_modes: ['intentional_silence'] });
    const checks = run({ audio: { ...loud, peak_dbfs: -Infinity, quiet: quietFlags(10_000, [0, 10_000]) }, timeline: silent });
    expect(byId(checks, 'digital_silence').result).toBe('not_applicable');
    expect(byId(checks, 'unplanned_silence').result).toBe('not_applicable');
    expect(byId(checks, 'tone_only').result).toBe('pass');
    expect(byId(run({ audio: { ...loud, tone_share: 0.9, tone_hz: 60 }, timeline: silent }), 'tone_only').result).toBe('fail');
    // Silence with any other plan still fails.
    expect(byId(run({ audio: { ...loud, peak_dbfs: -Infinity } }), 'digital_silence').result).toBe('fail');
  });

  it('fails silence over 0.3 s while a face is shown speaking', () => {
    const speaking = timeline({ segments: [{ ...timeline().segments[0], end_ms: 4000, video: { ...timeline().segments[0].video, out_ms: 4000 }, depicts_speech: true, speech_mode: 'native_dialogue', native_audio: 'preserve' }, { ...timeline().segments[0], id: 'seg-2', start_ms: 4000, video: { ...timeline().segments[0].video, out_ms: 6000 } }] });
    expect(byId(run({ timeline: speaking, audio: { ...loud, quiet: quietFlags(10_000, [1000, 1300], [3800, 4600]) } }), 'speech_over_silent_face').result).toBe('pass');
    expect(byId(run({ timeline: speaking, audio: { ...loud, quiet: quietFlags(10_000, [1000, 1400]) } }), 'speech_over_silent_face')).toMatchObject({ result: 'fail', intervals_ms: [[1000, 1400]] });
    expect(byId(run({ timeline: null }), 'speech_over_silent_face').result).toBe('not_applicable');
  });
});

describe('picture', () => {
  it('allows an unplanned mid-video freeze of 2.0 s, and a planned freeze of 1.5 s or less holds a longer one', () => {
    expect(byId(run({ freezes: [[2000, 4000]] }), 'frozen_picture').result).toBe('pass');
    expect(byId(run({ freezes: [[2000, 4500]] }), 'frozen_picture')).toMatchObject({ result: 'fail', intervals_ms: [[2000, 4500]] });
    expect(byId(run({ freezes: [[2000, 4500]] }), 'frozen_picture').detail).toContain('frozen for more than 2 s outside the first 1.5 s and last 3.0 s');
    // Opening and closing allowance, no timeline needed.
    expect(byId(run({ freezes: [[7000, 10_000]], timeline: null }), 'frozen_picture').result).toBe('pass');
    // A 4.4 s closing freeze leaves 1.4 s past the allowance; a 5.5 s one leaves 2.5 s.
    expect(byId(run({ durationMs: 20_000, freezes: [[15_600, 20_000]], timeline: null }), 'frozen_picture').result).toBe('pass');
    expect(byId(run({ durationMs: 20_000, freezes: [[14_500, 20_000]], timeline: null }), 'frozen_picture')).toMatchObject({ result: 'fail', intervals_ms: [[14_500, 20_000]] });
    const long = run({ freezes: [[2000, 4200]], timeline: timeline({ visual_overrides: [freeze(2000, 4200)] }) });
    expect(byId(long, 'frozen_picture').result).toBe('fail');
    expect(byId(long, 'planned_freeze_too_long')).toMatchObject({ result: 'fail', intervals_ms: [[2000, 4200]] });
  });

  it('lets a closing hold last up to 3.0 s, and no longer', () => {
    const endCard = run({ freezes: [[7200, 10_000]], timeline: timeline({ visual_overrides: [freeze(7200, 10_000)] }) });
    expect(byId(endCard, 'planned_freeze_too_long').result).toBe('pass');
    expect(byId(endCard, 'frozen_picture').result).toBe('pass');
    const tooLong = run({ freezes: [[6500, 10_000]], timeline: timeline({ visual_overrides: [freeze(6500, 10_000)] }) });
    expect(byId(tooLong, 'planned_freeze_too_long').result).toBe('fail');
    // Only 0.5 s of it lies before the closing allowance, so the measured freeze itself is allowed.
    expect(byId(tooLong, 'frozen_picture').result).toBe('pass');
    expect(maxFreezeMs({ end_ms: 10_000 }, 10_000)).toBe(3000);
    expect(maxFreezeMs({ end_ms: 9000 }, 10_000)).toBe(1500);
  });

  it('fails a picture frozen for over 40% of the video, or over the reference share plus 15 points', () => {
    const stills: Array<[number, number]> = [[0, 1500], [2000, 3500], [4000, 5500], [6000, 7500], [8000, 9500]];
    expect(byId(run({ freezes: [[0, 2500], [3000, 5000]] }), 'frozen_picture').detail).toContain('a still-image ad');
    // 75% frozen in 1.5 s stills cut to the beat: fails alone, passes next to a 65% still-photo reference.
    expect(byId(run({ freezes: stills }), 'frozen_picture')).toMatchObject({ result: 'fail', detail: expect.stringContaining('frozen 75% of the time (a still-image ad)') });
    expect(byId(run({ freezes: stills, referenceFrozenShare: 0.65 }), 'frozen_picture').result).toBe('pass');
    expect(byId(run({ freezes: stills, referenceFrozenShare: 0.5 }), 'frozen_picture').detail).toContain('over the 65% the reference allows');
    expect(maxFrozenShare(0.1)).toBe(0.4);
    expect(maxFrozenShare(0.65)).toBeCloseTo(0.8);
    expect(maxFrozenShare(null)).toBe(0.4);
  });

  it('fails a shot shown again later unless it is marked as a callback', () => {
    const hash = 0xf0f0f0f0f0f0f0f0n;
    const shots = (intent?: string): MeasuredShot[] => [
      { id: 'a', start_ms: 0, end_ms: 2000, hash },
      { id: 'b', start_ms: 2000, end_ms: 4000, hash: ~hash & 0xffffffffffffffffn },
      { id: 'c', start_ms: 4000, end_ms: 6000, hash: hash ^ 0b111n, ...(intent ? { intent } : {}) },
    ];
    expect(byId(run({ shots: shots() }), 'repeated_shot')).toMatchObject({ result: 'fail', intervals_ms: [[0, 2000], [4000, 6000]] });
    expect(byId(run({ shots: shots() }), 'repeated_shot').detail).toContain('c repeats a');
    expect(byId(run({ shots: shots('callback: back to the opening shot') }), 'repeated_shot').result).toBe('pass');
    // The prefix is case-sensitive, as in the harness.
    expect(byId(run({ shots: shots('Callback: back to the opening shot') }), 'repeated_shot').result).toBe('fail');
    // Next to each other is a continuing shot, not a repeat; a shot with no hash is never compared.
    expect(byId(run({ shots: [{ id: 'a', start_ms: 0, end_ms: 2000, hash }, { id: 'b', start_ms: 2000, end_ms: 4000, hash }] }), 'repeated_shot').result).toBe('pass');
    expect(byId(run({ shots: [{ ...shots()[0], hash: null }, shots()[1], shots()[2]] }), 'repeated_shot').result).toBe('pass');
  });

  it('hashes a 9x8 picture by its left-to-right brightness steps', () => {
    const ramp = Uint8Array.from({ length: 72 }, (_, i) => (i % 9) * 20);
    expect(dHash(ramp)).toBe(0n);
    expect(dHash(Uint8Array.from(ramp).reverse())).toBe(0xffffffffffffffffn);
    expect(hamming(0b1011n, 0b0001n)).toBe(2);
    expect(() => dHash(new Uint8Array(10))).toThrow();
  });
});

it('holds a run only inside one allowed interval, with 100 ms of slack', () => {
  expect(covered([1000, 3000], [[1050, 2950]])).toBe(true);
  expect(covered([1000, 3000], [[1000, 2000], [2000, 3000]])).toBe(false);
  expect(covered([1000, 3000], [[1200, 3000]])).toBe(false);
});

it('keeps the harness threshold names and the contract numbers', () => {
  expect(FINAL_MEASURE_THRESHOLDS).toEqual({
    digital_silence_peak_dbfs: -60, digital_zero_run_s: 1.0,
    tone_fft_size: 4096, tone_window_s: 0.5, tone_peak_halfwidth_bins: 2, tone_max_peaks: 3, tone_peak_energy_share: 0.8, tone_steady_share: 0.5,
    tone_min_hz: 80, tone_max_hz: 8000,
    quiet_dbfs: -45, quiet_window_ms: 100, unplanned_silence_s: 1.0, start_allowance_ms: 1500, end_allowance_ms: 3000, speech_gap_in_sentence_s: 0.6,
    max_pause_ms: 1500, max_pause_share: 0.1,
    freeze_noise: 0.003, freeze_min_s: 1.0, unplanned_freeze_s: 2.0, max_frozen_share: 0.4, reference_frozen_margin: 0.15, max_freeze_ms: 1500, max_end_card_freeze_ms: 3000,
    repeated_shot_min_s: 1.0, repeated_shot_max_hamming: 6, scene_cut_threshold: 0.4,
    edge_words: 3, edge_window_s: 4.0, silent_face_s: 0.3,
  });
});

const ffmpeg = process.env.TEST_FFMPEG || 'ffmpeg';
const withFfmpeg = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 ? it : it.skip;

function encode(args: string[]) {
  const result = spawnSync(ffmpeg, ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'fixture could not be encoded');
}

withFfmpeg('measures a real file: moving picture with noise passes, a still card over a sine tone fails', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'final-measure-'));
  try {
    const good = path.join(dir, 'good.mp4');
    encode(['-f', 'lavfi', '-i', 'testsrc2=s=160x288:r=30:d=3', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.3:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', good]);
    const measured = await measureFinal({ ffmpeg, file: good, outputSha256: H('a'), durationMs: 3000, hasAudio: true, timeline: null, signal: new AbortController().signal });
    expect(finalMeasureFailures(measured)).toEqual([]);
    expect(measured).toMatchObject({ format: 'gooseworks-final-measure/1', output_sha256: H('a'), measured_duration_ms: 3000, thresholds: FINAL_MEASURE_THRESHOLDS });

    const bad = path.join(dir, 'bad.mp4');
    encode(['-f', 'lavfi', '-i', 'color=c=blue:s=160x288:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', bad]);
    const still = await measureFinal({ ffmpeg, file: bad, outputSha256: H('b'), durationMs: 3000, hasAudio: true, timeline: null, signal: new AbortController().signal });
    const failed = still.checks.filter((c) => c.result === 'fail').map((c) => c.id);
    expect(failed).toEqual(['tone_only', 'frozen_picture']);
    expect(finalMeasureFailures(still)[1]).toMatch(/^frozen picture: The picture is frozen 100% of the time \(a still-image ad\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
