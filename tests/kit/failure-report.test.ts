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

// check-layer 1.1.2's verdict: a failed check carries no message; its words are in `reasons[]`.
const checkLayerVerdict = (reasons: unknown[]) => ({
  verdict: {
    pass: false,
    checks: [
      { code: 'plays', status: 'pass' },
      { code: 'length', status: 'fail', found: '9.2 seconds', expected: '15 to 30 seconds' },
      { code: 'size', status: 'pass', found: '1080x1920' },
      { code: 'sound', status: 'pass', found: '-14.0 LUFS' },
      { code: 'captions', status: 'not_applicable' },
      { code: 'black_frames', status: 'fail', found: 0.8 },
      { code: 'frozen_frames', status: 'pass' },
      { code: 'end_card', status: 'pass' },
      { code: 'flag:text_legible', status: 'not_applicable', found: 'needs eyes; not checked by machine' },
      { code: 'speech_matches_script', status: 'not_applicable' },
    ],
    reasons,
  },
});

it('reports a check-layer failure with the words from its reasons', async () => {
  const line = fakeLine();
  const verdict = checkLayerVerdict([
    { check: 'length', message: 'The video is too short.', expected: '15 to 30 seconds', found: '9.2 seconds' },
    { check: 'black_frames', message: 'Black frames from 2.1 to 2.9 seconds.', expected: 'no black stretch over 0.3 s', found: '0.8' },
  ]);
  const parts = testParts({ checkRun: (async () => verdict) as any });
  const result = await runMake({ home: tempHome(), line, parts });
  expect(result.status).toBe('failed');
  expect(failures(line)).toEqual([{ step: 'layer-check', code: 'check_failed', detail: 'The video is too short.' }]);
});

it('takes the first reason when none names the failed check, through the same filter', async () => {
  const words = async (reasons: unknown[]) => {
    const line = fakeLine();
    const parts = testParts({ checkRun: (async () => checkLayerVerdict(reasons)) as any });
    await runMake({ home: tempHome(), line, parts });
    return failures(line)[0]?.detail;
  };
  expect(await words([{ check: 'end_card', message: '' }, { check: 'end_card', message: 'The end card is missing.' }])).toBe('The end card is missing.');
  expect(await words([{ check: 'length', message: 'Read /Users/someone/.gooseworks/videos/vid_1/final/final.mp4 (check-layer@1.1.2)' }])).toBe('The video didn’t pass the final check.');
  expect(await words([])).toBe('The video didn’t pass the final check.');
});

it('keeps a final check’s tool output, paths and ids off the card and in the log', async () => {
  const home = tempHome();
  const line = fakeLine();
  const message = '[aac @ 0x7f8a1c004a00] Invalid data in /Users/someone/.gooseworks/videos/vid_1/layers/sound/out/out.mp4 (layer-sound)';
  const parts = testParts({ checkRun: (async () => ({ verdict: { pass: false, checks: [{ code: 'sound', status: 'fail', message }] } })) as any });
  const result = await runMake({ home, line, parts });
  expect(result.status).toBe('failed');
  expect(failures(line)).toEqual([{ step: 'layer-check', code: 'check_failed', detail: 'The video didn’t pass the final check.' }]);
  expect(readFileSync(runLayout(home, VIDEO).log, 'utf8')).toContain('0x7f8a1c004a00');
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

describe('a provider failure', () => {
  const providerFailed = (req: any) => ({
    status: 200,
    json: {
      piece_key: req.piece_key,
      idempotency_key: req.idempotency_key,
      status: 'failed',
      replayed: false,
      piece_credits: 0,
      credits: { used: 0, cap: 1000 },
      failure: { code: 'provider_failed', error: 'The provider didn’t take the job (429).', fix: 'Try once more with a new attempt. Nothing was charged.', next: 'retry' },
    },
  });

  it('keeps the video in Making while its piece has an attempt left, and the next run makes it', async () => {
    const home = tempHome();
    const line = fakeLine({ piece: providerFailed });
    const result = await runMake({ home, line, parts: testParts({ clip: { retry: { transient: 0 } } }) });
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/Try once more/);
    expect(failures(line)).toEqual([{ step: 'clips', code: 'tool_failed', detail: result.message }]);

    const again = fakeLine();
    expect((await runMake({ home, line: again, parts: testParts({ clip: { retry: { transient: 0 } } }) })).status).toBe('done');
    expect(again.pieces[0].idempotency_key).toMatch(/:2$/);
  });

  it('ends the video once its piece failed twice, without saying to run again', async () => {
    const home = tempHome();
    const line = fakeLine({ piece: providerFailed });
    const result = await runMake({ home, line });
    expect(line.pieces).toHaveLength(2);
    expect(result.message).not.toMatch(/once more|same command/i);
    expect(failures(line)).toEqual([{ step: 'clips', code: 'provider_failed', detail: result.message }]);

    const again = fakeLine();
    const rerun = await runMake({ home, line: again });
    expect(again.pieces).toHaveLength(0);
    expect(failures(again)).toEqual([{ step: 'clips', code: 'provider_failed', detail: result.message }]);
    expect(rerun.message).toBe(result.message);
  });
});

it('reports an error outside any step as one a new run may get past, in safe words', async () => {
  const home = tempHome();
  const base = fakeLine();
  // The style manifest's download fails after the package view came back.
  const line = { ...base, fetch: (async (input: any, init: any) => (new URL(String(input)).pathname === '/pkg/manifest' ? new Response('gone', { status: 404 }) : base.fetch(input, init))) as typeof fetch };
  const result = await runMake({ home, line });
  expect(result).toEqual({ status: 'failed', message: 'This video could not be made right now. Run the same command again; what was made so far is kept.' });
  expect(failures(base)).toEqual([{ step: 'style', code: 'tool_failed', detail: result.message }]);
  expect(readFileSync(runLayout(home, VIDEO).log, 'utf8')).toMatch(/HTTP 404/);
});
