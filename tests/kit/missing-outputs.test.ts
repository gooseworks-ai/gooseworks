// Rule: an input bound to a step output that never came (a music step that
// made no audio) is left out of the next part's inputs, never passed as
// undefined; it stops the video only when that part's schema requires it.
import { writeFileSync } from 'fs';
import * as path from 'path';
import type { LoadedPart } from '../../src/kit/core/host';
import type { PartContext } from '../../src/kit/part-interface';
import { fakeLine, fileSchema, manifest, runMake, style, tempHome, testParts } from './harness';

const free = { files: {}, models: [], kit: '>=1.0.0', version: '1.0.0' };
const withSteps = {
  ...style,
  timeline: [
    ...style.timeline,
    { id: 'music', part: { id: 'music-maker', version: '1.0.0' }, inputs: {} },
    { id: 'mix', part: { id: 'mixer', version: '1.0.0' }, inputs: { video: { from: 'step.clips.video' }, music: { from: 'step.music.audio' }, tracks: [{ from: 'step.music.audio' }, { from: 'step.clips.video' }] } },
  ],
};

function partsWith(required: string[], seen: Array<Record<string, unknown>>): Record<string, LoadedPart> {
  const music: LoadedPart = {
    source: 'published',
    dir: '/parts/music-maker/1.0.0',
    manifest: manifest('music-maker', { kind: 'compose', outputs: { type: 'object', additionalProperties: false, properties: { audio: fileSchema('audio') } } }),
    // No mood, no music: the step makes no audio.
    run: (async () => ({})) as never,
  };
  const mixer: LoadedPart = {
    source: 'published',
    dir: '/parts/mixer/1.0.0',
    manifest: manifest('mixer', {
      kind: 'mix',
      inputs: { type: 'object', additionalProperties: false, required, properties: { video: fileSchema('video'), music: fileSchema('audio'), tracks: { type: 'array', items: { type: 'object' } } } },
      outputs: { type: 'object', additionalProperties: false, required: ['video'], properties: { video: fileSchema('video') } },
    }),
    run: (async (inputs: Record<string, unknown>, ctx: PartContext) => {
      seen.push(inputs);
      writeFileSync(path.join(ctx.workDir, 'mixed.mp4'), 'mixed');
      return { video: await ctx.file('mixed.mp4', 'video') };
    }) as never,
  };
  return { ...testParts(), 'music-maker': music, mixer };
}

const line = () =>
  fakeLine({ style: withSteps, lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'music-maker': free, mixer: free } }) });

describe('an input bound to an output that never came', () => {
  it('is left out of the next part’s inputs', async () => {
    const seen: Array<Record<string, unknown>> = [];
    expect((await runMake({ home: tempHome(), line: line(), parts: partsWith(['video'], seen) })).status).toBe('done');
    expect(seen).toHaveLength(1);
    expect('music' in seen[0]).toBe(false);
    expect((seen[0].tracks as unknown[]).length).toBe(1);
  });

  it('stops the video before that part runs when its schema requires it', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const made = line();
    const result = await runMake({ home: tempHome(), line: made, parts: partsWith(['video', 'music'], seen) });
    expect(result.status).toBe('failed');
    expect(seen).toHaveLength(0);
    expect(made.seen.filter((s) => s.url.includes('/upload'))).toHaveLength(0);
  });
});
