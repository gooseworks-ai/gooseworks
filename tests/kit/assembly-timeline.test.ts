// Rule (fix-forward contract section 7): a source-linked timeline uses whole milliseconds and
// pixels, may crop and scale a picture within limits, caps planned pauses and freezes, and shows
// a source moment twice only as a declared callback. Local paths never reach the server.
import { ASSEMBLY_FORMAT, MAX_ZOOM, assemblyTimelineRevision, cropZoom, normalizeAssemblyTimeline, portableTimeline } from '../../src/kit/core/assembly-timeline';

const H = (c: string) => c.repeat(64);
const picture = (in_ms: number, out_ms: number, extra: Record<string, unknown> = {}) => ({ asset_id: 'take', sha256: H('a'), in_ms, out_ms, speed: 1, ...extra });
const segment = (id: string, start: number, end: number, video = picture(start, end), extra: Record<string, unknown> = {}) => ({ id, scene_id: id, start_ms: start, end_ms: end, video, speech_mode: 'none', depicts_speech: false, native_audio: 'muted', ...extra });

function timeline(overrides: Record<string, unknown> = {}) {
  return {
    format: ASSEMBLY_FORMAT,
    creative_contract_revision: H('c'),
    duration_ms: 3000,
    speech_mode: 'none',
    soundtrack_modes: ['music'],
    segments: [segment('s1', 0, 3000)],
    audio_cues: [{ id: 'bed', role: 'music', source: { asset_id: 'music', sha256: H('b'), in_ms: 0, out_ms: 3000, speed: 1 }, start_ms: 0, end_ms: 3000, gain_db: 0, loop: false }],
    pauses: [],
    required_cue_ids: [],
    ...overrides,
  };
}
const issues = (overrides: Record<string, unknown>) => normalizeAssemblyTimeline(timeline(overrides)).issues;

it('the fixture is complete', () => {
  expect(normalizeAssemblyTimeline(timeline())).toMatchObject({ status: 'complete', issues: [] });
});

describe('whole units', () => {
  it('refuses fractional milliseconds and pixels, naming where', () => {
    expect(issues({ duration_ms: 3000.5 })).toEqual(['duration_ms must be a whole number of milliseconds (got 3000.5)']);
    expect(issues({ segments: [segment('s1', 0, 3000, picture(0.25, 3000.25))] })).toEqual([
      'segments[0].video.in_ms must be a whole number of milliseconds (got 0.25)',
      'segments[0].video.out_ms must be a whole number of milliseconds (got 3000.25)',
    ]);
    expect(issues({ segments: [segment('s1', 0, 3000, picture(0, 3000, { crop: { x: 0, y: 10.5, w: 100, h: 100 } }))] })).toEqual(['segments[0].video.crop.y must be a whole number of pixels (got 10.5)']);
  });
});

describe('crop and scale', () => {
  const framed = (extra: Record<string, unknown>) => issues({ segments: [segment('s1', 0, 3000, picture(0, 3000, extra))] });

  it('takes a whole-pixel crop and even scaling, including plain resolution upscaling', () => {
    expect(framed({ crop: { x: 0, y: 120, w: 1080, h: 1680 }, scale_x: 1.25, scale_y: 1.24 })).toEqual([]);
    // H3's 432x768 output scaled to 1080x1920 is 2.5x resolution, not zoom.
    expect(framed({ scale_x: 2.5, scale_y: 2.5 })).toEqual([]);
  });

  it('refuses uneven stretch over 2%', () => {
    expect(framed({ scale_x: 1, scale_y: 1.05 })[0]).toMatch(/uneven stretch \(scale_x 1 vs scale_y 1.05\) distorts the picture by more than 2%/);
    expect(framed({ scale_x: 1.47, scale_y: 1 })[0]).toMatch(/uneven stretch/);
    expect(framed({ scale_x: 1.2 })[0]).toMatch(/scale_x and scale_y go together/);
  });

  it('measures zoom as the crop fit-scale over the whole frame fit-scale, so resolution is not zoom', () => {
    const frame = { width: 1080, height: 1920 };
    expect(cropZoom({ w: 432, h: 768 }, { width: 432, height: 768 }, frame)).toBeCloseTo(1, 9);
    expect(cropZoom({ w: 288, h: 512 }, { width: 432, height: 768 }, frame)).toBeCloseTo(1.5, 9);
    expect(cropZoom({ w: 216, h: 384 }, { width: 432, height: 768 }, frame)).toBeGreaterThan(MAX_ZOOM);
    // A 16:9 source filling a 9:16 frame: cropping it to the frame's shape is no zoom.
    expect(cropZoom({ w: 608, h: 1080 }, { width: 1920, height: 1080 }, frame)).toBeCloseTo(1, 2);
  });

  it('refuses a malformed crop and a crop on sound', () => {
    expect(framed({ crop: { x: 0, y: 0, w: 0, h: 100 } })[0]).toMatch(/crop needs whole source pixels/);
    expect(framed({ crop: { x: 0, y: 0, w: 100, h: 100, rotate: 90 } })[0]).toMatch(/crop needs whole source pixels/);
    const cue = timeline().audio_cues[0];
    expect(issues({ audio_cues: [{ ...cue, source: { ...cue.source, crop: { x: 0, y: 0, w: 10, h: 10 } } }] })[0]).toMatch(/bed: crop and scale apply to picture sources only/);
  });
});

describe('pause and freeze caps', () => {
  const freeze = (start: number, end: number) => ({ start_ms: start, end_ms: end, kind: 'freeze', reason: 'hold', source: picture(0, 1000), scene_id: 's1', source_kind: 'video' });

  it('caps each pause and mid-video freeze at 1.5 s', () => {
    expect(issues({ duration_ms: 20_000, segments: [segment('s1', 0, 20_000)], audio_cues: [{ ...timeline().audio_cues[0], source: { ...timeline().audio_cues[0].source, out_ms: 20_000 }, end_ms: 20_000 }], pauses: [{ start_ms: 1000, end_ms: 2600, scope: 'all_audio', reason: 'beat' }] })).toEqual(['pause 1000–2600ms is longer than 1500ms']);
    expect(issues({ duration_ms: 20_000, segments: [segment('s1', 0, 20_000)], audio_cues: [{ ...timeline().audio_cues[0], source: { ...timeline().audio_cues[0].source, out_ms: 20_000 }, end_ms: 20_000 }], visual_overrides: [freeze(1000, 2600)] })).toEqual(['freeze 1000–2600ms is longer than 1500ms']);
  });

  it('caps all pauses together at 10% of the video', () => {
    expect(issues({ pauses: [{ start_ms: 0, end_ms: 200, scope: 'speech', reason: 'a' }, { start_ms: 1000, end_ms: 1100, scope: 'speech', reason: 'b' }] })).toEqual([]);
    expect(issues({ pauses: [{ start_ms: 0, end_ms: 200, scope: 'speech', reason: 'a' }, { start_ms: 1000, end_ms: 1200, scope: 'speech', reason: 'b' }] })).toEqual(['planned pauses add up to 400ms, more than 10% of the 3000ms video']);
  });

  it('lets the end-card hold (a freeze ending the video) last up to 3.0 s', () => {
    const long = { duration_ms: 20_000, segments: [segment('s1', 0, 20_000)], audio_cues: [{ ...timeline().audio_cues[0], source: { ...timeline().audio_cues[0].source, out_ms: 20_000 }, end_ms: 20_000 }] };
    expect(issues({ ...long, visual_overrides: [freeze(17_000, 20_000)] })).toEqual([]);
    expect(issues({ ...long, visual_overrides: [freeze(16_900, 20_000)] })).toEqual(['freeze 16900–20000ms is longer than 3000ms (the closing-hold limit)']);
    expect(issues({ ...long, visual_overrides: [freeze(16_000, 18_000)] })).toEqual(['freeze 16000–18000ms is longer than 1500ms']);
  });
});

describe('repeated source moments', () => {
  const other = { asset_id: 'b-roll', sha256: H('d'), in_ms: 0, out_ms: 1000, speed: 1 };

  const long = (segments: unknown[]) => ({ duration_ms: 6000, segments, audio_cues: [{ ...timeline().audio_cues[0], source: { ...timeline().audio_cues[0].source, out_ms: 6000 }, end_ms: 6000 }] });
  const b = { ...other, out_ms: 2000 };

  it('refuses the same source moment shown again later unless it is a declared callback', () => {
    const repeat: Array<Record<string, unknown>> = [segment('s1', 0, 2000, picture(0, 2000)), segment('s2', 2000, 4000, b), segment('s3', 4000, 6000, picture(500, 2500))];
    expect(issues(long(repeat))).toEqual([`s3: shows s1's source moment again; use another moment, or mark a deliberate repeat with intent "callback: <why>"`]);
    // The prefix is case-sensitive, as in the harness.
    repeat[2] = { ...repeat[2], intent: 'Callback: the opening line lands again' };
    expect(issues(long(repeat))).toHaveLength(1);
    repeat[2] = { ...repeat[2], intent: 'callback: the opening line lands again' };
    expect(issues(long(repeat))).toEqual([]);
  });

  it('lets one take continue across cuts, and never compares the next segment or a short one', () => {
    expect(issues(long([segment('s1', 0, 2000, picture(0, 2000)), segment('s2', 2000, 4000, b), segment('s3', 4000, 6000, picture(2000, 4000))]))).toEqual([]);
    expect(issues({ segments: [segment('s1', 0, 1000, picture(0, 1000)), segment('s2', 1000, 2000, other), segment('s3', 2000, 3000, picture(500, 1500))] })).toEqual([]);
  });
});

describe('speech coverage', () => {
  it('needs speech only over segments that plan it: a music-only end card needs none', () => {
    const voice = { asset_id: 'vo', sha256: H('e'), in_ms: 0, out_ms: 2000, speed: 1 };
    const spoken = {
      speech_mode: 'narration', soundtrack_modes: ['music'],
      segments: [segment('talk', 0, 2000, picture(0, 2000), { speech_mode: 'narration' }), segment('card', 2000, 3000, { asset_id: 'card', sha256: H('d'), in_ms: 0, out_ms: 1000, speed: 1 })],
      audio_cues: [...timeline().audio_cues, { id: 'vo', role: 'narration', source: voice, start_ms: 0, end_ms: 2000, gain_db: 0, loop: false }],
    };
    expect(issues(spoken)).toEqual([]);
    const short = { ...spoken, audio_cues: [...timeline().audio_cues, { id: 'vo', role: 'narration', source: { ...voice, out_ms: 1500 }, start_ms: 0, end_ms: 1500, gain_db: 0, loop: false }] };
    expect(issues(short)).toEqual(['unplanned speech gap 1500–2000ms in talk (music cannot substitute for speech intent)']);
  });
});

it('keeps local paths out of the portable timeline without changing its revision', () => {
  const withPath = normalizeAssemblyTimeline(timeline({ segments: [segment('s1', 0, 3000, picture(0, 3000, { path: '/Users/someone/take.mp4' }))] }));
  const without = normalizeAssemblyTimeline(timeline());
  expect(withPath.status).toBe('complete');
  expect(JSON.stringify(portableTimeline(withPath.timeline))).not.toContain('/Users/someone');
  expect(withPath.revision).toBe(without.revision);
  expect(assemblyTimelineRevision(portableTimeline(withPath.timeline!))).toBe(without.revision);
});
