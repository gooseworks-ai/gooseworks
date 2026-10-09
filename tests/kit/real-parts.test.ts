// Rule checked against S2's published part manifests (fixtures copied from
// goose-skills parts/<id>/1.0.0/part.json): a part may order the models its
// lock lists, written as in needs.models (with or without a leading slash),
// and nothing else.
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import type { ModelNeed, PartContext } from '../../src/kit/part-interface';
import { fakeLine, runMake, tempHome, testParts } from './harness';

const real = (id: string): ModelNeed[] =>
  JSON.parse(readFileSync(path.join(__dirname, '..', 'fixtures', 'kit-s2', `${id}.part.json`), 'utf8')).needs.models;

const cut = async (ctx: PartContext) => {
  writeFileSync(path.join(ctx.workDir, 'cut.mp4'), 'cut');
  return { video: await ctx.file('cut.mp4', 'video'), timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } };
};

describe('S2’s published parts', () => {
  const cases = ['creator-h3', 'video-seedance-2', 'image-nano-banana', 'captions-layer'].flatMap((id) => [
    [id, ''],
    [id, '/'],
  ]);
  it.each(cases)('%s may order its locked models, written as in part.json with "%s" in front', async (id, lead) => {
    const models = real(id);
    const line = fakeLine({ lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], models } } }) });
    const parts = testParts({
      clip: { needs: { browser: false, ffmpeg: false, network: true, models } },
      clipRun: (async (_inputs: unknown, ctx: PartContext) => {
        // As the published part.mjs files call it: the model id as in needs.models (or with a leading slash).
        for (const [i, m] of models.entries()) {
          await ctx.line!.order({ piece: `take-${i + 1}`, provider: m.provider, path: `${lead}${m.model}`, body: { prompt_text: `take ${i + 1}` }, results: [{ pointer: '/file_url', name: `take-${i + 1}.mp4`, media: 'video' }] });
        }
        return cut(ctx);
      }) as never,
    });
    expect((await runMake({ home: tempHome(), line, parts })).status).toBe('done');
    // The path goes to the line exactly as the part wrote it.
    expect(line.pieces.map((p) => p.call.path)).toEqual(models.map((m) => `${lead}${m.model}`));
  });

  it('still refuses a model the lock does not list', async () => {
    const models = real('creator-h3');
    const line = fakeLine({ lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], models } } }) });
    const parts = testParts({
      clip: { needs: { browser: false, ffmpeg: false, network: true, models } },
      clipRun: (async (_inputs: unknown, ctx: PartContext) => {
        await ctx.line!.order({ piece: 'take-1', provider: 'fal', path: `/${models[0].model}-turbo`, body: {}, results: [{ pointer: '/file_url', name: 'take-1.mp4', media: 'video' }] });
        return cut(ctx);
      }) as never,
    });
    expect((await runMake({ home: tempHome(), line, parts })).status).toBe('failed');
    expect(line.pieces).toHaveLength(0);
  });
});
