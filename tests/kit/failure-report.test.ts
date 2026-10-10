// When the kit gives up, the line hears why once, in plain words: the step, a
// code and words for the card, never a part id, a log or a path.
import { existsSync, readFileSync } from 'fs';
import { runLayout } from '../../src/kit/core/paths';
import { PartLoadError } from '../../src/kit/parts/loader';
import { VIDEO, fakeLine, lineRoute, runMake, style, tempHome, testHost, testParts } from './harness';

const failures = (line: ReturnType<typeof fakeLine>) => lineRoute(line.seen, '/progress').map((s) => s.body.failure).filter(Boolean);

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

it('reports a withdrawn part without naming it', async () => {
  const line = fakeLine();
  const parts = testParts();
  const host = testHost(parts);
  const load = host.loader.load;
  host.loader.load = async (request) => {
    if (request.ref.id === 'sound-layer') throw new PartLoadError('withdrawn', 'Part sound-layer 1.0.0 was withdrawn, so this video can’t use it.');
    return load(request);
  };
  const result = await runMake({ home: tempHome(), line, host });
  expect(result.status).toBe('failed');
  expect(result.message).not.toMatch(/sound-layer/);
  expect(failures(line)).toEqual([{ step: 'layer-sound', code: 'withdrawn', detail: result.message }]);
});

it('reports a failed step with its code and plain words, not its detail', async () => {
  const line = fakeLine();
  const parts = testParts({
    clipRun: (async (_inputs: unknown, ctx: any) => {
      throw ctx.error('output_invalid', 'ffmpeg exited 1 reading /Users/someone/.gooseworks/kit/videos/vid_1/cut.mp4');
    }) as any,
  });
  const result = await runMake({ home: tempHome(), line, parts });
  expect(result.status).toBe('failed');
  expect(result.message).toBe('This video can’t be made from this plan. Change the plan, then make it again.');
  expect(failures(line)).toEqual([{ step: 'clips', code: 'output_invalid', detail: result.message }]);
});

it('reports a failed final check with the check’s own words', async () => {
  const line = fakeLine();
  const parts = testParts({ checkRun: (async () => ({ verdict: { pass: false, checks: [{ code: 'sound', status: 'fail', message: 'The video has no sound.' }] } })) as any });
  const result = await runMake({ home: tempHome(), line, parts });
  expect(result.status).toBe('failed');
  expect(failures(line)).toEqual([{ step: 'layer-check', code: 'check_failed', detail: 'The video has no sound.' }]);
});

it('sends the report again without the reason to a line that refuses the field', async () => {
  const refused: unknown[] = [];
  const line = fakeLine({
    progress: (body) => {
      if (!body.failure) return undefined;
      refused.push(body.failure);
      return json(400, { error: { code: 'unknown_fields', error: 'The request has fields this line doesn’t take.', fix: 'Remove failure.', next: 'change_request', details: { fields: ['failure'] } } });
    },
  });
  const parts = testParts({ clipRun: (async (_inputs: unknown, ctx: any) => { throw ctx.error('bad_input', 'no scenes'); }) as any });
  const result = await runMake({ home: tempHome(), line, parts });
  expect(result.status).toBe('failed');
  expect(result.message).not.toMatch(/Remove/);
  expect(refused).toHaveLength(1);
  const reports = lineRoute(line.seen, '/progress');
  const last = reports[reports.length - 1].body;
  expect(last.failure).toBeUndefined();
  expect(last.steps.some((s: { state: string }) => s.state === 'failed')).toBe(true);
});

it('reports a broken style package in plain words and keeps the file name in the log', async () => {
  const home = tempHome();
  const line = fakeLine({ style: { ...style, assets: { fonts: ['fonts/brand-bold.ttf'], frames: [] } } });
  const result = await runMake({ home, line });
  expect(result.status).toBe('failed');
  expect(result.message).toBe('The style package is missing a file it needs.');
  expect(failures(line)).toEqual([{ step: 'style', code: 'change_request', detail: result.message }]);
  expect(readFileSync(runLayout(home, VIDEO).log, 'utf8')).toMatch(/fonts\/brand-bold\.ttf/);
});

it('waits for the report that says why before it ends, even behind a slow report', async () => {
  const delivered: unknown[] = [];
  const line = fakeLine({
    // Every report is slow, so the failure queues behind one already on its way.
    progress: ((body: any) =>
      new Promise((resolve) =>
        setTimeout(() => {
          if (body.failure) delivered.push(body.failure);
          resolve(json(200, { stage: 'making', credits: { used: 0, cap: 1000 }, report_within_seconds: 60 }));
        }, 150),
      )) as any,
  });
  const parts = testParts({ clipRun: (async (_inputs: unknown, ctx: any) => { throw ctx.error('bad_input', 'no scenes'); }) as any });
  const result = await runMake({ home: tempHome(), line, parts });
  expect(result.status).toBe('failed');
  expect(delivered).toEqual([{ step: 'clips', code: 'bad_input', detail: result.message }]);
});

it('sends the report without the reason to an old line after the run’s own signal was aborted', async () => {
  const base = fakeLine({
    // A non-retry refusal of a piece stops the run, which aborts its own signal before the report goes.
    piece: () => ({ status: 409, json: { error: { code: 'plan_changed', error: 'This video’s plan changed.', fix: 'Ask for a new yes.', next: 'change_request' } } }),
    progress: (body) =>
      body.failure ? json(400, { error: { code: 'unknown_fields', error: 'The request has fields this line doesn’t take.', fix: 'Remove failure.', next: 'change_request', details: { fields: ['failure'] } } }) : undefined,
  });
  const line = {
    ...base,
    fetch: (async (input: any, init: any = {}) => {
      if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      return base.fetch(input, init);
    }) as typeof fetch,
  };
  const result = await runMake({ home: tempHome(), line });
  expect(result.status).toBe('failed');
  const reports = lineRoute(base.seen, '/progress');
  const refusedAt = reports.findIndex((r) => r.body.failure);
  expect(refusedAt).toBeGreaterThanOrEqual(0);
  expect(reports.slice(refusedAt + 1).some((r) => !r.body.failure)).toBe(true);
});

describe('a failure report the line never took', () => {
  const unreachable = () => json(503, { error: { code: 'line_unavailable', error: 'The line could not be reached.', fix: 'Try again in a minute.', next: 'retry' } });
  const badInput = () => testParts({ clipRun: (async (_inputs: unknown, ctx: any) => { throw ctx.error('bad_input', 'no scenes'); }) as any });

  it('is kept in the run folder, then sent first by the next run, which ends on it', async () => {
    const home = tempHome();
    const first = await runMake({ home, line: fakeLine({ progress: (body) => (body.failure ? unreachable() : undefined) }), parts: badInput() });
    expect(first.status).toBe('failed');
    const pendingFile = runLayout(home, VIDEO).pendingReport;
    const pending = JSON.parse(readFileSync(pendingFile, 'utf8'));
    expect(pending.failure).toEqual({ step: 'clips', code: 'bad_input', detail: first.message });

    const line = fakeLine();
    const again = await runMake({ home, line });
    expect(again).toEqual({ status: 'failed', message: first.message });
    expect(lineRoute(line.seen, '/progress')[0].body.failure).toEqual(pending.failure);
    expect(line.pieces).toHaveLength(0);
    expect(existsSync(pendingFile)).toBe(false);
  });

  it('is dropped when the next run can carry on past it', async () => {
    const home = tempHome();
    const timedOut = testParts({ clipRun: (async (_inputs: unknown, ctx: any) => { throw ctx.error('timeout', 'slow'); }) as any });
    const first = await runMake({ home, line: fakeLine({ progress: (body) => (body.failure ? unreachable() : undefined) }), parts: timedOut });
    expect(first.status).toBe('failed');
    expect(JSON.parse(readFileSync(runLayout(home, VIDEO).pendingReport, 'utf8')).failure.code).toBe('timeout');

    const line = fakeLine();
    const again = await runMake({ home, line });
    expect(again.status).toBe('done');
    expect(failures(line)).toEqual([]);
    expect(existsSync(runLayout(home, VIDEO).pendingReport)).toBe(false);
  });

  it('is dropped when the plan changed since', async () => {
    const home = tempHome();
    await runMake({ home, line: fakeLine({ progress: (body) => (body.failure ? unreachable() : undefined) }), parts: badInput() });
    const line = fakeLine({ planBody: (body) => ({ ...body, scenes: body.scenes.slice(0, 1) }) });
    const again = await runMake({ home, line });
    expect(again.status).toBe('done');
    expect(failures(line)).toEqual([]);
  });
});
