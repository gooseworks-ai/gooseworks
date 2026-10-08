// Rules on trust: the kit makes only the style approved for the video, uses
// only the files its package vouches for, orders one paid piece once however
// a part names it, sends only the bytes the check passed, and starts no part
// once the video is stopped.
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import { canonicalHash } from '../../src/kit/core/canonical';
import type { PartContext } from '../../src/kit/part-interface';
import { fakeLine, lineCalls, lineRoute, MODEL, runMake, style, tempHome, testParts, VIDEO } from './harness';

const spent = (line: ReturnType<typeof fakeLine>) => [...lineCalls(line.seen, '/pieces'), ...lineCalls(line.seen, '/upload')];

describe('the approved style', () => {
  it('refuses a package whose style is not the one the plan approved', async () => {
    const changed = { ...style, layers: { ...style.layers, sound: false } };
    const line = fakeLine({
      style: changed,
      handOver: (handed) => ({ ...handed, plan: { ...handed.plan, style_hash: canonicalHash(style) } }),
    });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('failed');
    expect(spent(line)).toHaveLength(0);
  });

  it('refuses a listed asset the verified package does not carry, even when a copy is on disk', async () => {
    const withAsset = { ...style, assets: { fonts: [], frames: ['frames/card.html'] } };
    const home = tempHome();
    const cached = path.join(home, 'videos', VIDEO, 'style', 'frames');
    mkdirSync(cached, { recursive: true });
    writeFileSync(path.join(cached, 'card.html'), '<p>left over</p>');
    const line = fakeLine({ style: withAsset });
    const result = await runMake({ home, line });
    expect(result.status).toBe('failed');
    expect(spent(line)).toHaveLength(0);
  });
});

describe('one paid piece', () => {
  it('is ordered once when a part asks for it twice at once under two names', async () => {
    const parts = testParts({
      clipRun: (async (_inputs: unknown, ctx: PartContext) => {
        const ask = (piece: string) => ctx.line!.order({ piece, provider: 'fal', path: MODEL, body: { text: 'same' }, results: [{ pointer: '/file_url', name: `${piece}.mp4`, media: 'video' }] });
        const [a] = await Promise.all([ask('take-a'), ask('take-b')]);
        writeFileSync(path.join(ctx.workDir, 'cut.mp4'), Buffer.from(a.files['take-a.mp4'].sha256));
        return { video: await ctx.file('cut.mp4', 'video'), timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } };
      }) as never,
    });
    const line = fakeLine();
    expect((await runMake({ home: tempHome(), line, parts })).status).toBe('done');
    expect(line.pieces).toHaveLength(1);
  });
});

describe('the upload', () => {
  it('refuses to send a video that changed after its check', async () => {
    const parts = testParts({
      checkRun: (async (inputs: { video: { path: string } }) => {
        writeFileSync(inputs.video.path, 'swapped after the check');
        return { verdict: { pass: true, checks: [] } };
      }) as never,
    });
    const line = fakeLine();
    const result = await runMake({ home: tempHome(), line, parts });
    expect(result.status).toBe('failed');
    expect(lineRoute(line.seen, '/upload')).toHaveLength(0);
  });
});

describe('a stopped video', () => {
  it('starts no part once it is stopped while the step is being saved', async () => {
    const home = tempHome();
    const stop = new AbortController();
    const stepOut = path.join(home, 'videos', VIDEO, 'steps', 'clips', 'out');
    let started = 0;
    const parts = testParts({
      clipRun: (() => {
        started++;
        return new Promise(() => undefined);
      }) as never,
    });
    const now = () => {
      if (existsSync(stepOut) && !stop.signal.aborted) stop.abort();
      return new Date();
    };
    const result = await runMake({ home, line: fakeLine(), parts, now, signal: stop.signal });
    expect(result.status).toBe('stopped');
    expect(started).toBe(0);
  }, 10_000);
});
