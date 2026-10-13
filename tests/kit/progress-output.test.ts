// What the person running `video make` sees: which video it is making, then
// one plain line as each row of the card starts, counts on and ends; and each
// run's own log, so support can read what one run did.
import { readdirSync, readFileSync } from 'fs';
import * as path from 'path';
import { runLayout } from '../../src/kit/core/paths';
import { startLine } from '../../src/kit/core/run';
import { getVersion } from '../../src/version';
import { MODEL, VIDEO, fakeLine, runMake, tempHome, testParts } from './harness';

const video = { name: 'Spring launch', brand: 'Brand', organization: 'Brand team', environment: 'staging' };

describe('the lines printed while a video is made', () => {
  it('start with the video and follow the card’s rows', async () => {
    const printed: string[] = [];
    const result = await runMake({ home: tempHome(), line: fakeLine({ video }), printed });
    expect(result.status).toBe('done');
    expect(printed).toEqual([
      'Making “Spring launch” for Brand on GooseWorks staging.',
      '▸ Creating the video clips',
      '✓ Creating the video clips',
      '▸ Mixing the sound',
      '✓ Mixing the sound',
      '▸ Checking it once before delivering',
      '✓ Checking it once before delivering',
    ]);
  });

  it('name the video the line sent inside its hand-over', async () => {
    const printed: string[] = [];
    await runMake({ home: tempHome(), line: fakeLine({ handOver: (handed: any) => ({ ...handed, video }) }), printed });
    expect(printed[0]).toBe('Making “Spring launch” for Brand on GooseWorks staging.');
  });

  it('show a new count on a row at most once every 5 seconds', async () => {
    let clock = Date.UTC(2026, 9, 13, 12);
    const printed: string[] = [];
    const order = (ctx: any, n: number) =>
      ctx.line.order({ piece: `scene-${n}`, provider: 'fal', path: MODEL, body: { text: `line ${n}` }, results: [{ pointer: '/file_url', name: `scene-${n}.mp4`, media: 'video' }] });
    const parts = testParts({
      clipRun: (async (_inputs: unknown, ctx: any) => {
        ctx.progress({ total: 2 });
        clock += 6_000;
        await order(ctx, 1);
        await order(ctx, 2);
        await import('fs').then((fs) => fs.writeFileSync(path.join(ctx.workDir, 'cut.mp4'), 'cut'));
        return { video: await ctx.file('cut.mp4', 'video'), timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } };
      }) as any,
    });
    await runMake({ home: tempHome(), line: fakeLine(), parts, printed, now: () => new Date(clock) });
    expect(printed.filter((l) => l.includes('video clips'))).toEqual(['▸ Creating the video clips', '▸ Creating the video clips (1 of 2)', '✓ Creating the video clips']);
  });

  it('name the video plainly when the line doesn’t say which it is', () => {
    expect(startLine(undefined, 'production')).toBe('Making your video on GooseWorks production.');
    expect(startLine({ name: 'Spring launch', brand: null }, 'local')).toBe('Making “Spring launch” on GooseWorks local.');
  });

  it('end with where the run’s log is when the video wasn’t made', async () => {
    const home = tempHome();
    const printed: string[] = [];
    const parts = testParts({ clipRun: (async (_inputs: unknown, ctx: any) => { throw ctx.error('bad_input', 'no scenes'); }) as any });
    expect((await runMake({ home, line: fakeLine(), parts, printed })).status).toBe('failed');
    const runs = path.join(runLayout(home, VIDEO).runs);
    const [file] = readdirSync(runs);
    expect(printed[printed.length - 1]).toBe(`If you contact support, share this file: ${path.join(runs, file)}`);
  });

  it('leave out the log when the person stopped the video on the card', async () => {
    const printed: string[] = [];
    const stopped = { error: { code: 'video_stopped', error: 'The customer stopped this video.', fix: 'Wait for their Continue.', next: 'stop', say: 'You stopped this video.' } };
    const line = fakeLine({ progress: () => new Response(JSON.stringify(stopped), { status: 409 }) });
    expect((await runMake({ home: tempHome(), line, printed })).status).toBe('stopped');
    expect(printed.join('\n')).not.toMatch(/contact support/);
  });

  it('name the log when the video was stopped without saying it was the person', async () => {
    const printed: string[] = [];
    const line = fakeLine({ progress: () => new Response(JSON.stringify({ stage: 'stopped', credits: { used: 0, cap: 1000 }, report_within_seconds: 60 }), { status: 200 }) });
    expect((await runMake({ home: tempHome(), line, printed })).status).toBe('stopped');
    expect(printed.join('\n')).toMatch(/contact support/);
  });
});

describe('each run’s log', () => {
  it('is its own file, noted in the video’s index, and every entry names its run and package version', async () => {
    const home = tempHome();
    await runMake({ home, line: fakeLine({ upload: 'fail' }) });
    await runMake({ home, line: fakeLine() });

    const layout = runLayout(home, VIDEO);
    const files = readdirSync(layout.runs).sort();
    expect(files).toHaveLength(2);
    const index = readFileSync(layout.log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(index.map((e) => [e.message, e.fields.file, e.fields.quote_id])).toEqual(files.map((f) => ['run started', `runs/${f}`, 'q_1']));

    for (const file of files) {
      const entries = readFileSync(path.join(layout.runs, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(entries.length).toBeGreaterThan(3);
      for (const entry of entries) {
        expect(entry.run).toBe(file.replace(/\.ndjson$/, ''));
        expect(entry.package_version).toBe(getVersion());
      }
    }
  });
});
