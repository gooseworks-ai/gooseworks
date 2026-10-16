// When the kit gives up, the line hears why once, in plain words: the step, a
// code and words for the card, never a part id, a log or a path.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { resultRecord } from '../../src/kit/core/outcome';
import { runLayout } from '../../src/kit/core/paths';
import { TAKE_FIT_WORDS } from '../../src/kit/core/run';
import { PartLoadError } from '../../src/kit/parts/loader';
import { VIDEO, fakeLine, lineRoute, runLogs, runMake, style, tempHome, testHost, testParts } from './harness';

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
  expect(failures(line)).toEqual([{ step: 'clips', code: 'output_invalid', detail: result.message, from_part: true }]);
});

describe('a part’s refusal of the plan', () => {
  const refusing = (code: string, detail: string, thrown = false) =>
    testParts({
      clipRun: (async (_inputs: unknown, ctx: any) => {
        if (thrown) throw Object.assign(new Error(detail), { code, detail });
        throw ctx.error(code, detail);
      }) as any,
    });

  it('reaches the card and the person in the part’s own words', async () => {
    const line = fakeLine();
    const parts = refusing('bad_input', '"LAZY SUNDAY AT HOME" is too long for a row label; shorten the moment before the arrow.');
    const result = await runMake({ home: tempHome(), line, parts });
    expect(result).toMatchObject({
      status: 'failed',
      message: '"LAZY SUNDAY AT HOME" is too long for a row label; shorten the moment before the arrow. Change the plan, then make it again.',
    });
    expect(failures(line)).toEqual([{ step: 'clips', code: 'bad_input', detail: result.message, from_part: true }]);
  });

  it('keeps a part’s numbers and finishes its sentence', async () => {
    const line = fakeLine();
    const result = await runMake({ home: tempHome(), line, parts: refusing('output_invalid', 'Would run 58.2 s, style allows 15–45 s, 9 photos', true) });
    expect(result.message).toBe('Would run 58.2 s, style allows 15–45 s, 9 photos. Change the plan, then make it again.');
    expect(failures(line)).toEqual([{ step: 'clips', code: 'output_invalid', detail: result.message, from_part: true }]);
  });

  it('keeps a refusal’s path, file name and ids off the card and in the log', async () => {
    const home = tempHome();
    const line = fakeLine();
    const detail = 'The logo can’t be read. Tried /Users/someone/.gooseworks/videos/vid_1/plan/logo.png for clips.';
    const result = await runMake({ home, line, parts: refusing('bad_input', detail) });
    expect(result.message).toBe('The logo can’t be read. Change the plan, then make it again.');
    expect(failures(line)).toEqual([{ step: 'clips', code: 'bad_input', detail: result.message, from_part: true }]);
    expect(runLogs(home)).toContain('logo.png');

    const pathOnly = fakeLine();
    const generic = await runMake({ home: tempHome(), line: pathOnly, parts: refusing('bad_input', 'missing /Users/someone/.gooseworks/videos/vid_1/plan/logo.png') });
    expect(generic.message).toBe('This video can’t be made from this plan. Change the plan, then make it again.');
  });

  it.each([
    ['a relative path', 'The logo is missing from assets/logo.', 'assets/logo'],
    ['a backslash path', 'The logo is missing from assets\\logo.', 'logo'],
    ['a file name', 'The logo in logo.heic can’t be read.', 'logo.heic'],
    ['a bare tool diagnostic', 'Invalid data found when processing input', 'Invalid data found'],
    ['a tool diagnostic with its own sentence', 'Conversion failed!', 'Conversion failed'],
    ['a missing file', 'No such file or directory', 'No such file'],
    ['a field path', 'scenes.0.line is too long.', 'scenes.0.line'],
    ['a step id that reads as a word', 'Step clips refused the label.', 'Step clips refused'],
  ])('gives the generic words for a refusal with %s and keeps it in the log', async (_kind, detail, logged) => {
    const home = tempHome();
    const line = fakeLine();
    const result = await runMake({ home, line, parts: refusing('bad_input', detail) });
    expect(result.message).toBe('This video can’t be made from this plan. Change the plan, then make it again.');
    expect(failures(line)).toEqual([{ step: 'clips', code: 'bad_input', detail: result.message, from_part: true }]);
    expect(runLogs(home)).toContain(logged);
  });

  describe('at the card’s 200-character cap', () => {
    const FIX = ' Change the plan, then make it again.';
    const GENERIC = 'This video can’t be made from this plan. Change the plan, then make it again.';
    // Plain words of exactly `n` characters, ending in `end`.
    const refusal = (n: number, end = '') => `${'The row label is far too long for the card '.repeat(10).slice(0, n - end.length - 1)}x${end}`;
    const make = async (detail: string) => {
      const line = fakeLine();
      const result = await runMake({ home: tempHome(), line, parts: refusing('bad_input', detail) });
      expect(failures(line)).toEqual([{ step: 'clips', code: 'bad_input', detail: result.message, from_part: true }]);
      return result.message!;
    };

    it('fits a refusal with no full stop that ends at exactly 200', async () => {
      const said = refusal(200 - FIX.length - 1);
      const message = await make(said);
      expect(message).toBe(`${said}.${FIX}`);
      expect(message).toHaveLength(200);
    });

    it('gives the generic words when the added full stop would make 201', async () => {
      expect(await make(refusal(200 - FIX.length))).toBe(GENERIC);
    });

    it('fits a refusal with its own full stop that ends at exactly 200', async () => {
      const said = refusal(200 - FIX.length, '.');
      const message = await make(said);
      expect(message).toBe(`${said}${FIX}`);
      expect(message).toHaveLength(200);
    });

    it('gives the generic words for a refusal one character over', async () => {
      expect(await make(refusal(200 - FIX.length + 1, '.'))).toBe(GENERIC);
    });
  });

  it('gives the generic words for the core’s own refusal and for a tool failure', async () => {
    const line = fakeLine();
    const parts = testParts({ clipRun: (async () => ({ clips: 'not files' })) as any });
    const result = await runMake({ home: tempHome(), line, parts });
    expect(result.message).toBe('This video can’t be made from this plan. Change the plan, then make it again.');
    // The kit's own check refused the outputs, so the line must not blame the plan.
    expect(failures(line)).toEqual([{ step: 'clips', code: 'output_invalid', detail: result.message, from_part: false }]);

    const failing = fakeLine();
    const tool = await runMake({ home: tempHome(), line: failing, parts: testParts({ clip: { retry: { transient: 0 } }, clipRun: (async (_i: unknown, ctx: any) => { throw ctx.error('tool_failed', 'The encoder ran out of room.'); }) as any }) });
    expect(tool.message).toBe('Part of this video could not be made. Run the same command again; what was made so far is kept.');
    expect(failures(failing)).toEqual([{ step: 'clips', code: 'tool_failed', detail: tool.message }]);
  });
});

it('reports a failed final check with the check’s own words', async () => {
  const line = fakeLine();
  const parts = testParts({ checkRun: (async () => ({ verdict: { pass: false, checks: [{ code: 'sound', status: 'fail', message: 'The video has no sound.' }] } })) as any });
  const result = await runMake({ home: tempHome(), line, parts });
  expect(result.status).toBe('failed');
  expect(failures(line)).toEqual([{ step: 'layer-check', code: 'check_failed', detail: 'The video has no sound.' }]);
  expect(result.message).toBe('The video has no sound. The video didn’t pass the final check, so it wasn’t sent. Nothing more will be charged for it.');
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
  expect(runLogs(home)).toContain('0x7f8a1c004a00');
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
  expect(runLogs(home)).toMatch(/fonts\/brand-bold\.ttf/);
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
  expect(delivered).toEqual([{ step: 'clips', code: 'bad_input', detail: result.message, from_part: true }]);
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

describe('a refusal from a part that lines a made clip up with the plan', () => {
  const unreachable = () => json(503, { error: { code: 'line_unavailable', error: 'The line could not be reached.', fix: 'Try again in a minute.', next: 'retry' } });
  /** The test style with its clip step run by `id`, a part that only fits a made clip to the plan. */
  const takeFit = (id: string, run: (ctx: any) => unknown) => {
    const parts = testParts({ clipRun: (async (_inputs: unknown, ctx: any) => run(ctx)) as any });
    const clip = parts['clip-maker'];
    const { 'clip-maker': _old, ...rest } = parts;
    return {
      parts: { ...rest, [id]: { ...clip, dir: `/parts/${id}/1.0.0`, manifest: { ...clip.manifest, id } } },
      script: {
        style: { ...style, timeline: [{ ...style.timeline[0], part: { id, version: '1.0.0' } }] },
        lock: (lock: any) => {
          const { 'clip-maker': entry, ...others } = lock.parts;
          return { ...lock, parts: { ...others, [id]: entry } };
        },
      },
    };
  };

  it.each([
    ['speech-recut', 'bad_input'],
    ['transcribe-whisper', 'output_invalid'],
  ])('from %s (%s) is ours: the same command carries on', async (id, code) => {
    const made = takeFit(id, (ctx) => {
      throw ctx.error(code, 'A repeated question kept the take from lining up with the plan.');
    });
    const line = fakeLine(made.script);
    const result = await runMake({ home: tempHome(), line, parts: made.parts });
    expect(result).toMatchObject({ status: 'failed', message: TAKE_FIT_WORDS, code, next: 'retry' });
    expect(result.message).not.toMatch(/Change the plan/);
    // The code goes up as it is, so the line's own take-fit rule blames its side.
    expect(failures(line)).toEqual([{ step: 'clips', code, detail: TAKE_FIT_WORDS, from_part: true }]);
    expect(resultRecord(VIDEO, result)).toMatchObject({ outcome: 'run_again', exit_code: 4 });
  });

  it('ends stopped, not run again, when the line answers the report by stopping the video', async () => {
    const made = takeFit('speech-recut', (ctx) => {
      throw ctx.error('bad_input', 'no line matched');
    });
    // The line's repeated-fault rule stops the video; its answer comes after the step has already given up.
    const stopped = (body: any) => (body.failure ? (new Promise((done) => setTimeout(() => done(json(200, { stage: 'stopped', credits: { used: 0, cap: 1000 } })), 50)) as any) : undefined);
    const result = await runMake({ home: tempHome(), line: fakeLine({ ...made.script, progress: stopped }), parts: made.parts });
    expect(result.status).toBe('stopped');
    expect(result.next).toBeUndefined();
    expect(result.message).not.toBe(TAKE_FIT_WORDS);
    const record = resultRecord(VIDEO, result);
    expect(record.outcome).not.toBe('run_again');
    expect(record.exit_code).not.toBe(4);
  });

  it('leaves the same refusal from any other part on the plan', async () => {
    const made = takeFit('clip-cutter', (ctx) => {
      throw ctx.error('bad_input', 'no scenes');
    });
    const result = await runMake({ home: tempHome(), line: fakeLine(made.script), parts: made.parts });
    expect(result.message).toMatch(/Change the plan, then make it again\.$/);
    expect(result.next).toBeUndefined();
    expect(resultRecord(VIDEO, result)).toMatchObject({ outcome: 'failed', exit_code: 1 });
  });

  it('is not replayed by the next run when the line never took it', async () => {
    const home = tempHome();
    let refuse = true;
    const made = takeFit('speech-recut', (ctx) => {
      if (refuse) throw ctx.error('bad_input', 'no line matched');
      writeFileSync(path.join(ctx.workDir, 'cut.mp4'), 'cut');
      return ctx.file('cut.mp4', 'video').then((video: unknown) => ({ video, timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } }));
    });
    const first = await runMake({ home, line: fakeLine({ ...made.script, progress: (body) => (body.failure ? unreachable() : undefined) }), parts: made.parts });
    expect(first.message).toBe(TAKE_FIT_WORDS);
    expect(JSON.parse(readFileSync(runLayout(home, VIDEO).pendingReport, 'utf8')).resumable).toBe(true);

    refuse = false;
    const line = fakeLine(made.script);
    const again = await runMake({ home, line, parts: made.parts });
    expect(again.status).toBe('done');
    expect(failures(line)).toEqual([]);
    expect(existsSync(runLayout(home, VIDEO).pendingReport)).toBe(false);
  });
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
    expect(pending.failure).toEqual({ step: 'clips', code: 'bad_input', detail: first.message, from_part: true });

    const line = fakeLine();
    const again = await runMake({ home, line });
    expect(again).toMatchObject({ status: 'failed', message: first.message });
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
    expect(result.message).toBe('The provider didn’t take the job (429). Try once more with a new attempt. Nothing was charged.');
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
  expect(result).toMatchObject({ code: 'tool_failed', status: 'failed', message: 'This video could not be made right now. Run the same command again; what was made so far is kept.' });
  expect(failures(base)).toEqual([{ step: 'style', code: 'tool_failed', detail: result.message }]);
  expect(runLogs(home)).toMatch(/HTTP 404/);
});

describe('when the run ends', () => {
  const badInput = () => testParts({ clipRun: (async (_inputs: unknown, ctx: any) => { throw ctx.error('bad_input', 'no scenes'); }) as any });
  /** A line whose reports answer after `ms` (never, when left out), unless the call is given up first. */
  const slowReports = (script: Parameters<typeof fakeLine>[0] = {}, ms?: number) => {
    const base = fakeLine(script);
    const fetch = (async (input: any, init: any = {}) => {
      if (!String(input).endsWith('/progress')) return base.fetch(input, init);
      return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        if (ms !== undefined) setTimeout(() => resolve(base.fetch(input, init)), ms);
        else base.seen.push({ url: String(input), method: 'POST', headers: {}, body: JSON.parse(init.body) });
      });
    }) as typeof globalThis.fetch;
    return { ...base, fetch };
  };

  it('ends within the last word’s deadline when the line can’t be reached, and keeps the failure for the next run', async () => {
    const home = tempHome();
    const line = slowReports();
    const started = Date.now();
    const result = await runMake({ home, line, parts: badInput(), heartbeatMs: 20, lastWordMs: 300 });
    expect(result.status).toBe('failed');
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(JSON.parse(readFileSync(runLayout(home, VIDEO).pendingReport, 'utf8')).failure).toEqual({ step: 'clips', code: 'bad_input', detail: result.message, from_part: true });
  });

  it('sends no report after the one that says why', async () => {
    const line = fakeLine({
      progress: (() => new Promise((resolve) => setTimeout(() => resolve(json(200, { stage: 'making', credits: { used: 0, cap: 1000 }, report_within_seconds: 60 })), 15))) as any,
    });
    const result = await runMake({ home: tempHome(), line, parts: badInput(), heartbeatMs: 5 });
    expect(result.status).toBe('failed');
    const reports = lineRoute(line.seen, '/progress');
    const at = reports.findIndex((r) => r.body.failure);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(reports.slice(at + 1)).toEqual([]);
  });

  it('sends no heartbeat after the result', async () => {
    const line = fakeLine();
    expect((await runMake({ home: tempHome(), line, heartbeatMs: 5 })).status).toBe('done');
    const sent = lineRoute(line.seen, '/progress').length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(lineRoute(line.seen, '/progress')).toHaveLength(sent);
  });

  it('does not log a report the stop cut short as one that failed', async () => {
    const home = tempHome();
    const line = slowReports({ piece: () => ({ status: 409, json: { error: { code: 'video_stopped', error: 'This video was stopped.', fix: 'Press Continue on the card.', next: 'stop' } } }) }, 50);
    expect((await runMake({ home, line })).status).toBe('stopped');
    expect(runLogs(home)).not.toMatch(/progress could not be sent/);
  });
});

describe('the line’s refusal of a piece', () => {
  const stopped = (say?: string) =>
    fakeLine({
      piece: () => ({ status: 409, json: { error: { code: 'video_stopped', error: 'This video was stopped.', fix: 'Tell them what is kept and how they can carry on.', ...(say ? { say } : {}), next: 'stop' } } }),
    });

  it('reaches the person as the server’s sentence for them, without the fix written for the AI', async () => {
    const printed: string[] = [];
    const result = await runMake({ home: tempHome(), line: stopped('You stopped this video. What was made so far is kept.'), printed });
    expect(result).toMatchObject({ status: 'stopped', message: 'You stopped this video. What was made so far is kept.' });
    expect(printed.join('\n')).not.toMatch(/Tell them/);
  });

  it('reaches the person as the error and its fix when the server wrote no sentence for them', async () => {
    const line = fakeLine({
      piece: () => ({ status: 409, json: { error: { code: 'making_elsewhere', error: 'This video is being made somewhere else.', fix: 'If that run has stopped, run the make command again on this computer.', next: 'stop' } } }),
    });
    const result = await runMake({ home: tempHome(), line });
    expect(result).toMatchObject({ status: 'stopped', message: 'This video is being made somewhere else. If that run has stopped, run the make command again on this computer.' });
  });
});

describe('a step that runs out of time', () => {
  const quick = { timing: { typical_s: 1, timeout_s: 0.2 } };

  it('while a piece is still being made at the maker is reported as the maker’s delay, which a new run can get past', async () => {
    const base = fakeLine({
      piece: (req) => ({ status: 200, json: { piece_key: req.piece_key, idempotency_key: req.idempotency_key, status: 'running', replayed: false, piece_credits: 0, credits: { used: 0, cap: 1000 }, retry_after_seconds: 1 } }),
    });
    const line = {
      ...base,
      fetch: (async (input: any, init: any) => {
        if (String(input).endsWith('/pieces')) await new Promise((resolve) => setTimeout(resolve, 10));
        return base.fetch(input, init);
      }) as typeof fetch,
    };
    const result = await runMake({ home: tempHome(), line, parts: testParts({ clip: quick }) });
    expect(result).toMatchObject({ code: 'provider_slow', status: 'failed', message: 'One of the clips we ordered for this video didn’t come back in time. Run the same command again; what was made so far is kept.' });
    expect(failures(base)).toEqual([{ step: 'clips', code: 'provider_slow', detail: result.message }]);
  });

  it('on its own work is reported as a plain timeout', async () => {
    const line = fakeLine();
    const parts = testParts({ clip: quick, clipRun: (async (_inputs: unknown, ctx: any) => new Promise((_resolve, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('cut short'))))) as any });
    const result = await runMake({ home: tempHome(), line, parts });
    expect(failures(line)).toEqual([{ step: 'clips', code: 'timeout', detail: result.message }]);
  });
});

describe('a stop the line must hear', () => {
  it('on Ctrl-C is reported as stopped here, with no support file', async () => {
    const stop = new AbortController();
    const printed: string[] = [];
    const parts = testParts({
      clipRun: (() => {
        setTimeout(() => stop.abort(), 5);
        return new Promise(() => undefined);
      }) as never,
    });
    const line = fakeLine();
    const result = await runMake({ home: tempHome(), line, parts, printed, signal: stop.signal });
    expect(result.status).toBe('stopped');
    expect(failures(line)).toEqual([{ step: 'clips', code: 'stopped_here', detail: result.message }]);
    expect(printed.join('\n')).not.toMatch(/contact support/);
  }, 10_000);

  it('when a part can’t be downloaded is reported as this computer’s trouble, with the support file', async () => {
    const line = fakeLine();
    const printed: string[] = [];
    const host = testHost(testParts());
    const load = host.loader.load;
    host.loader.load = async (request) => {
      if (request.ref.id === 'sound-layer') throw new PartLoadError('unreachable', 'could not reach the parts store');
      return load(request);
    };
    const result = await runMake({ home: tempHome(), line, host, printed });
    expect(result.status).toBe('stopped');
    expect(result.message).not.toMatch(/spent|charged/);
    expect(failures(line)).toEqual([{ step: 'layer-sound', code: 'tool_failed', detail: result.message }]);
    expect(printed.join('\n')).toMatch(/contact support/);
  });

  it('when the line lost a piece is reported with its code, so the line hears it was ours', async () => {
    const lost = { error: { code: 'piece_lost', error: 'We couldn’t get this piece back.', fix: 'Ask for a fix on the card to make it again.', next: 'stop' } };
    const line = fakeLine({ piece: () => ({ status: 409, json: lost }) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('stopped');
    expect(failures(line)).toEqual([{ step: 'clips', code: 'piece_lost', detail: result.message }]);
  });

  it('is not sent for a plan that changed under the run', async () => {
    const stale = { error: { code: 'quote_not_current', error: 'This plan is no longer the approved one.', fix: 'Run the make command again.', next: 'stop' } };
    const line = fakeLine({ piece: () => ({ status: 409, json: stale }) });
    expect((await runMake({ home: tempHome(), line })).status).toBe('stopped');
    expect(failures(line)).toEqual([]);
  });

  it('keeps the line’s sign-in step through a piece refusal and an upload refusal, for exit code 6', async () => {
    const signIn = { error: { code: 'wrong_account', error: 'This computer is signed in to another account.', fix: 'Sign in again.', next: 'sign_in' } };
    const byPiece = await runMake({ home: tempHome(), line: fakeLine({ piece: () => ({ status: 403, json: signIn }) }) });
    expect(byPiece).toMatchObject({ status: 'stopped', code: 'wrong_account', next: 'sign_in' });
    const byUpload = await runMake({ home: tempHome(), line: fakeLine({ uploadDone: () => json(403, signIn) }) });
    expect(byUpload).toMatchObject({ status: 'stopped', code: 'wrong_account', next: 'sign_in' });
  });

  it('when our check fails with a fix left the kit can’t make is reported as a failed check', async () => {
    const failed = { upload_id: 'up_1', attempt: 1, result: 'fail', reasons: [{ check: 'mystery', message: 'The video is too dark.' }], fixes_left: 1, stage: 'making', fee_credits: 0, credits: { used: 0, cap: 1000 } };
    const line = fakeLine({ uploadDone: () => json(200, failed) });
    const home = tempHome();
    const result = await runMake({ home, line });
    expect(result.status).toBe('failed');
    expect(failures(line)).toEqual([{ step: 'final-check', code: 'check_failed', detail: 'The video is too dark.' }]);
    // The failed candidate never takes the final's place.
    const finalDir = runLayout(home, VIDEO).final;
    expect(existsSync(`${finalDir}/final.mp4`)).toBe(false);
    expect(existsSync(`${finalDir}/final.candidate.mp4`)).toBe(true);
  });
});
