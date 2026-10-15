// Rule (fix-forward contract section 2): the exact-final content review says honestly how it
// perceived the video (listened | measured, watched | measured), names every field it doesn't
// know, and lets the upload go on only with P2 issues open. A measured review leans on passing
// final measurements of the same bytes.
import { ASSEMBLY_FORMAT, CONTENT_DIMENSIONS, finalContentReviewProblems, normalizeAssemblyTimeline, reviewCapabilities, type FinalMeasureSummary } from '../../src/kit/core/assembly-timeline';

const H = (c: string) => c.repeat(64);
const OUTPUT = H('f');

function timeline(overrides: Record<string, unknown> = {}) {
  return {
    format: ASSEMBLY_FORMAT,
    creative_contract_revision: H('c'),
    duration_ms: 2000,
    speech_mode: 'none',
    soundtrack_modes: ['music'],
    segments: [{ id: 'seg-1', scene_id: 's1', start_ms: 0, end_ms: 2000, video: { asset_id: 'picture', sha256: H('a'), in_ms: 0, out_ms: 2000, speed: 1 }, speech_mode: 'none', depicts_speech: false, native_audio: 'muted' }],
    audio_cues: [{ id: 'bed', role: 'music', source: { asset_id: 'music', sha256: H('b'), in_ms: 0, out_ms: 2000, speed: 1 }, start_ms: 0, end_ms: 2000, gain_db: 0, loop: false }],
    pauses: [],
    required_cue_ids: [],
    ...overrides,
  };
}

const assembly = normalizeAssemblyTimeline(timeline());

function review(overrides: Record<string, unknown> = {}) {
  return {
    output_sha256: OUTPUT,
    timeline_revision: assembly.revision,
    creative_contract_revision: H('c'),
    reviewer: 'Akhil',
    verdict: 'approved',
    capabilities: { audio: 'listened', motion: 'watched' },
    coverage: [{ start_ms: 0, end_ms: 2000 }],
    unresolved_issues: [],
    dimensions: Object.fromEntries(CONTENT_DIMENSIONS.map((name) => [name, { status: ['lip_sync', 'voice_performance', 'pronunciation'].includes(name) ? 'not_applicable' : 'pass', note: 'Watched and listened end to end.' }])),
    ...overrides,
  };
}

const passingMeasure: FinalMeasureSummary = { output_sha256: OUTPUT, checks: [{ id: 'digital_silence', result: 'pass' }, { id: 'speech_gap_in_sentence', result: 'not_applicable' }] };
const problems = (r: unknown, measure?: FinalMeasureSummary | null) => finalContentReviewProblems(r, OUTPUT, assembly, 2000, measure);

it('the fixture timeline is complete', () => {
  expect(assembly).toMatchObject({ status: 'complete', issues: [] });
});

describe('capabilities', () => {
  it('passes a listened and watched review with nothing open', () => {
    expect(problems(review())).toEqual([]);
  });

  it('still reads the old booleans for one release: true is listened/watched', () => {
    expect(reviewCapabilities({ audio_perception: true, motion_perception: true })).toEqual({ audio: 'listened', motion: 'watched', problems: [] });
    expect(problems(review({ capabilities: { audio_perception: true, motion_perception: true } }))).toEqual([]);
  });

  it('refuses an old false, naming which sense was missing', () => {
    const found = problems(review({ capabilities: { audio_perception: false, motion_perception: true } }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/capabilities\.audio_perception is false: the sound was not reviewed/);
  });

  it('refuses an unknown perception, a missing one, and both shapes for one sense', () => {
    expect(reviewCapabilities({ audio: 'heard', motion: 'watched' }).problems).toEqual(['capabilities.audio must be listened or measured']);
    expect(reviewCapabilities({ audio: 'listened' }).problems).toEqual(['capabilities.motion is missing: record watched or measured']);
    expect(reviewCapabilities({ audio: 'listened', audio_perception: true, motion: 'watched' }).problems).toEqual(['capabilities has both audio and audio_perception; keep only audio']);
    expect(reviewCapabilities(undefined).problems).toHaveLength(1);
  });

  it('accepts a measured review only with passing final measurements of the same bytes', () => {
    const measured = review({ capabilities: { audio: 'measured', motion: 'watched' } });
    expect(problems(measured)).toEqual([expect.stringContaining('A measured review needs passing final measurements')]);
    expect(problems(measured, passingMeasure)).toEqual([]);
    expect(problems(measured, { ...passingMeasure, output_sha256: H('e') })).toHaveLength(1);
    expect(problems(measured, { ...passingMeasure, checks: [{ id: 'frozen_picture', result: 'fail' }] })).toHaveLength(1);
    expect(problems(measured, { ...passingMeasure, checks: [] })).toHaveLength(1);
  });
});

describe('unresolved issues', () => {
  it('lets P2 through in any case', () => {
    expect(problems(review({ unresolved_issues: [{ severity: 'P2', message: 'Logo a touch small' }, { severity: 'p2', message: 'Music could be warmer' }] }))).toEqual([]);
  });

  it.each([
    ['P0', 'Unresolved P0 issue: Product is the wrong colour'],
    ['p1', 'Unresolved P1 issue: Product is the wrong colour'],
    ['Blocker', 'Unresolved blocker issue: Product is the wrong colour'],
    ['urgent', 'Unresolved issue with unknown severity "urgent" (counts as P1): Product is the wrong colour'],
  ])('blocks severity %s and names it', (severity, expected) => {
    expect(problems(review({ unresolved_issues: [{ severity, message: 'Product is the wrong colour' }] }))).toEqual([expected]);
  });

  it('blocks an issue without a message or severity, and a list that is not a list', () => {
    expect(problems(review({ unresolved_issues: [{ severity: 'P2' }] }))).toEqual(['unresolved_issues[0] needs a severity (P0, P1 or P2) and a message; it counts as P1 until then']);
    expect(problems(review({ unresolved_issues: [{ message: 'Joins click' }] }))).toEqual(['Unresolved issue with unknown severity null (counts as P1): Joins click']);
    expect(problems(review({ unresolved_issues: null }))).toEqual(['unresolved_issues must be a list (an empty list when nothing is open)']);
  });

  it('names at most ten and counts the rest', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ severity: 'P1', message: `issue ${i + 1}` }));
    const found = problems(review({ unresolved_issues: many }));
    expect(found).toHaveLength(11);
    expect(found[10]).toBe('3 more unresolved issues block the upload');
  });
});

describe('unknown fields', () => {
  it('names each extra key by its path', () => {
    const extra = review({
      notes: 'looks fine',
      capabilities: { audio: 'listened', motion: 'watched', confidence: 0.9 },
      coverage: [{ start_ms: 0, end_ms: 2000, speed: 1 }],
      unresolved_issues: [{ severity: 'P2', message: 'ok', owner: 'me' }],
      dimensions: { ...review().dimensions, lip_sync: { status: 'not_applicable', note: 'No face', score: 5 }, vibe: { status: 'pass', note: 'good' } },
    });
    const found = problems(extra);
    for (const field of ['notes', 'capabilities.confidence', 'coverage[0].speed', 'unresolved_issues[0].owner', 'dimensions.vibe', 'dimensions.lip_sync.score']) {
      expect(found).toContain(`content_review has an unknown field "${field}". Remove it, then resume`);
    }
    expect(found).toHaveLength(6);
  });
});

it('still binds the review to the exact bytes, timeline and approved intent', () => {
  expect(finalContentReviewProblems(review(), H('e'), assembly, 2000)).toContain('Content review belongs to different final, timeline or approved intent bytes');
  expect(problems(review({ timeline_revision: H('d') }))).toContain('Content review belongs to different final, timeline or approved intent bytes');
  expect(problems(review({ coverage: [{ start_ms: 0, end_ms: 1500 }] }))).toEqual(['Playback and listening must cover the complete 2000ms final (only 1ms total timestamp rounding is allowed)']);
});
