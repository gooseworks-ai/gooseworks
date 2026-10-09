// Rule: every file the frozen plan names (here a scene image the line hosts)
// is downloaded and checked against its size and hash before anything is
// spent; one that fails stops the run, and one that passes reaches the part
// as a file.
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import * as path from 'path';
import type { FileRef, PartContext } from '../../src/kit/part-interface';
import { fakeLine, lineCalls, MODEL, runMake, tempHome, testParts } from './harness';

const bytes = Buffer.from('clip /hosted/f1');
const lineFile = (sha256: string) => ({ file_id: 'f1', ref: 'gooseworks-file:f1', sha256, bytes: bytes.length, mime: 'image/png' });
const withImage = (sha256: string) => (body: any) => ({ ...body, scenes: [{ ...body.scenes[0], image: lineFile(sha256) }, body.scenes[1]] });

describe('files the plan names', () => {
  it('stops the run before any spend when a hosted file does not match the plan', async () => {
    const line = fakeLine({ planBody: withImage('0'.repeat(64)) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/does not match/);
    expect([...lineCalls(line.seen, '/pieces'), ...lineCalls(line.seen, '/upload')]).toHaveLength(0);
  });

  it('hands a checked hosted file to the part as a file, named in payloads as the line knows it', async () => {
    let seen: FileRef | undefined;
    const parts = testParts({
      clipRun: (async (inputs: { scenes: Array<{ image?: FileRef }> }, ctx: PartContext) => {
        seen = inputs.scenes[0].image;
        await ctx.line!.order({ piece: 'scene-1', provider: 'fal', path: MODEL, body: { image: seen! }, results: [{ pointer: '/file_url', name: 'scene-1.mp4', media: 'video' }] });
        writeFileSync(path.join(ctx.workDir, 'cut.mp4'), 'cut');
        return { video: await ctx.file('cut.mp4', 'video'), timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } };
      }) as never,
    });
    const line = fakeLine({ planBody: withImage(createHash('sha256').update(bytes).digest('hex')) });
    expect((await runMake({ home: tempHome(), line, parts })).status).toBe('done');
    expect(seen?.kind).toBe('file');
    expect(seen?.media).toBe('image');
    expect(line.pieces[0].call.body.image).toBe('gooseworks-file:f1');
    expect(lineCalls(line.seen, '/files')).toHaveLength(1);
  });
});
