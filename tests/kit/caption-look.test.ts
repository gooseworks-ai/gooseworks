// Rule: a style's caption look (traits.caption_look) reaches every layer as
// expect.caption_look, copied as written. Styles without one hand over the
// same expectation as before, so the captions layer keeps its default look.
import { rmSync } from 'fs';
import { expectationOf } from '../../src/kit/core/run';
import type { ApprovedPlan } from '../../src/kit/line/types';
import type { LoadedStyle } from '../../src/kit/core/style';
import { fakeLine, plan, runMake, style, tempHome, testParts } from './harness';

const look = { preset: 'karaoke', max_words: 5, y: 0.74, highlight_color: '#FFD400', highlight: ['brand'] };

function styleWith(traits: Record<string, unknown>): LoadedStyle['style'] {
  return { ...style, traits: { ...style.traits, ...traits } } as unknown as LoadedStyle['style'];
}

const approved = plan() as unknown as ApprovedPlan;

describe('the caption look in the expectation', () => {
  it('copies traits.caption_look into expect.caption_look', () => {
    const expectation = expectationOf(styleWith({ captions: true, caption_look: look }), approved);
    expect(expectation.caption_look).toEqual(look);
    expect(expectation.captions).toBe(true);
  });

  it('hands over a copy, not the style file’s own object', () => {
    const traits = { caption_look: { ...look, highlight: ['brand'] } };
    const expectation = expectationOf(styleWith(traits), approved);
    expectation.caption_look!.highlight!.push('cta');
    expect(traits.caption_look.highlight).toEqual(['brand']);
  });

  it('leaves the expectation unchanged for a style with no caption look', () => {
    const expectation = expectationOf(styleWith({}), approved);
    expect(expectation).not.toHaveProperty('caption_look');
    expect(Object.keys(expectation).sort()).toEqual(
      ['aspect', 'captions', 'duration_s', 'end_card', 'height', 'layers', 'qc_flags', 'script', 'speech', 'width'],
    );
  });

  it('names the style’s layer switches, so the check layer knows whether the sound layer ran', () => {
    const quiet = { ...style, layers: { brand: false, captions: true, sound: false, check: true } } as unknown as LoadedStyle['style'];
    expect(expectationOf(quiet, approved).layers).toEqual({ brand: false, captions: true, sound: false, check: true });
  });

  it.each([
    ['null', null],
    ['a string', 'karaoke'],
    ['an array', [look]],
    ['a number', 3],
  ])('ignores a caption look that is %s', (_what, value) => {
    expect(expectationOf(styleWith({ caption_look: value }), approved)).not.toHaveProperty('caption_look');
  });

  it('passes an unknown preset through for the layer to fall back on', () => {
    const odd = { preset: 'neon-wave', max_words: 3 };
    expect(expectationOf(styleWith({ caption_look: odd }), approved).caption_look).toEqual(odd);
  });

  it('reaches the layers in a made video', async () => {
    const seen: unknown[] = [];
    const parts = testParts({
      checkRun: (async (inputs: { expect: unknown }) => {
        seen.push(inputs.expect);
        return { verdict: { pass: true, checks: [] } };
      }) as never,
    });
    const line = fakeLine({ style: { ...style, traits: { ...style.traits, caption_look: look } } });
    const home = tempHome();
    try {
      const result = await runMake({ home, line, parts });
      expect(result.status).toBe('done');
      expect(seen).toHaveLength(1);
      expect((seen[0] as { caption_look?: unknown }).caption_look).toEqual(look);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
