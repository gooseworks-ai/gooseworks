// Rule: a step's scratch folder sits inside its own folder, so a part can
// register a scratch file the way S2's creator-h3 part does
// (ctx.file(`${ctx.tmpDir.slice(ctx.workDir.length + 1)}/t1-voice.wav`)).
import { writeFileSync } from 'fs';
import * as path from 'path';
import type { PartContext } from '../../src/kit/part-interface';
import { fakeLine, runMake, tempHome, testParts } from './harness';

const cut = async (ctx: PartContext) => {
  writeFileSync(path.join(ctx.workDir, 'cut.mp4'), 'cut');
  return { video: await ctx.file('cut.mp4', 'video'), timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } };
};

describe('a step’s scratch folder', () => {
  it('can register a scratch file the way creator-h3 does', async () => {
    let voice: { path: string } | undefined;
    const parts = testParts({
      clipRun: (async (_inputs: unknown, ctx: PartContext) => {
        writeFileSync(path.join(ctx.tmpDir, 't1-voice.wav'), 'voice');
        voice = await ctx.file(`${ctx.tmpDir.slice(ctx.workDir.length + 1)}/t1-voice.wav`, 'audio');
        return cut(ctx);
      }) as never,
    });
    expect((await runMake({ home: tempHome(), line: fakeLine(), parts })).status).toBe('done');
    expect(voice?.path.endsWith(path.join('.tmp', 't1-voice.wav'))).toBe(true);
  });
});
