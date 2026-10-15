// Rule (fix-forward contract section 7): a source-linked timeline uses whole milliseconds and
// pixels, may crop and scale a picture within limits, caps planned pauses and freezes, and shows
// a source moment twice only as a declared callback. Local paths never reach the server.
import { ASSEMBLY_FORMAT, assemblyTimelineRevision, normalizeAssemblyTimeline, portableTimeline } from '../../src/kit/core/assembly-timeline';

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

  it('takes a whole-pixel crop and an even scale up to 1.5x', () => {
    expect(framed({ crop: { x: 0, y: 120, w: 1080, h: 1680 }, scale_x: 1.25, scale_y: 1.24 })).toEqual([]);
    expect(framed({ scale_x: 1.5, scale_y: 1.5 })).toEqual([]);
  });

  it('refuses uneven stretch over 2% and upscaling over 1.5x', () => {
    expect(framed({ scale_x: 1, scale_y: 1.05 })[0]).toMatch(/uneven stretch \(scale_x 1 vs scale_y 1.05\) distorts the picture by more than 2%/);
    expect(framed({ scale_x: 1.47, scale_y: 1 })[0]).toMatch(/uneven stretch/);
    expect(framed({ scale_x: 2, scale_y: 2 })[0]).toMatch(/upscaling by 2x is over the 1.5x limit/);
    expect(framed({ scale_x: 1.2 })[0]).toMatch(/scale_x and scale_y go together/);
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

  it('caps each pause and freeze at 1.5 s', () => {
    expect(issues({ duration_ms: 20_000, segments: [segment('s1', 0, 20_000)], audio_cues: [{ ...timeline().audio_cues[0], source: { ...timeline().audio_cues[0].source, out_ms: 20_000 }, end_ms: 20_000 }], pauses: [{ start_ms: 1000, end_ms: 2600, scope: 'all_audio', reason: 'beat' }] })).toEqual(['pause 1000–2600ms is longer than 1500ms']);
    expect(issues({ duration_ms: 20_000, segments: [segment('s1', 0, 20_000)], audio_cues: [{ ...timeline().audio_cues[0], source: { ...timeline().audio_cues[0].source, out_ms: 20_000 }, end_ms: 20_000 }], visual_overrides: [freeze(1000, 2600)] })).toEqual(['freeze 1000–2600ms is longer than 1500ms']);
  });

  it('caps all pauses together, and all freezes together, at 10% of the video', () => {
    expect(issues({ pauses: [{ start_ms: 0, end_ms: 200, scope: 'speech', reason: 'a' }, { start_ms: 1000, end_ms: 1100, scope: 'speech', reason: 'b' }] })).toEqual([]);
    expect(issues({ pauses: [{ start_ms: 0, end_ms: 200, scope: 'speech', reason: 'a' }, { start_ms: 1000, end_ms: 1200, scope: 'speech', reason: 'b' }] })).toEqual(['planned pauses add up to 400ms, more than 10% of the 3000ms video']);
    expect(issues({ visual_overrides: [freeze(0, 400)] })).toEqual(['planned freezes add up to 400ms, more than 10% of the 3000ms video']);
  });
});

describe('repeated source moments', () => {
  const other = { asset_id: 'b-roll', sha256: H('d'), in_ms: 0, out_ms: 1000, speed: 1 };

  it('refuses the same source moment shown again unless it is a declared callback', () => {
    const repeat: Array<Record<string, unknown>> = [segment('s1', 0, 1000, picture(0, 1000)), segment('s2', 1000, 2000, other), segment('s3', 2000, 3000, picture(500, 1500))];
    expect(issues({ segments: repeat })).toEqual([`s3: shows s1's source moment again; use another moment, or mark a deliberate repeat with intent "callback: <why>"`]);
    repeat[2] = { ...repeat[2], intent: 'Callback: the opening line lands again' };
    expect(issues({ segments: repeat })).toEqual([]);
  });

  it('lets one take continue across cuts', () => {
    expect(issues({ segments: [segment('s1', 0, 1000, picture(0, 1000)), segment('s2', 1000, 2000, other), segment('s3', 2000, 3000, picture(1000, 2000))] })).toEqual([]);
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
