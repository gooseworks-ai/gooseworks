// When the kit gives up, the line hears why once, in plain words: the step, a
// code and words for the card, never a part id, a log or a path.
import { PartLoadError } from '../../src/kit/parts/loader';
import { fakeLine, lineRoute, runMake, tempHome, testHost, testParts } from './harness';

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
