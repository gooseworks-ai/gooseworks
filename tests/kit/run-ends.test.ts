/**
 * Every run ends, and ends on time: a run past its ceiling stops as one the same command carries on,
 * a run whose part won't let go ends the process once the last word's deadline has passed, a line
 * that says "retry" is waited out inside the step's time, and the final check's warnings go up with
 * the video.
 */
import { CEILING_WORDS, type MakeResult } from '../../src/kit/core/run';
import { outcomeOf } from '../../src/kit/core/outcome';
import { fakeLine, lineRoute, runMake, tempHome, testParts } from './harness';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A clip step that waits until it is told to stop. */
const waitsForStop = (async (_inputs: unknown, ctx: any) => new Promise((_resolve, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('cut short'))))) as any;

it('stops a run past its ceiling as one the same command carries on', async () => {
  const line = fakeLine();
  const result = await runMake({ home: tempHome(), line, parts: testParts({ clipRun: waitsForStop }), ceilingMs: 100 });
  expect(result).toMatchObject({ status: 'failed', code: 'timeout', message: CEILING_WORDS });
  expect(outcomeOf(result)).toBe('run_again');
  expect(lineRoute(line.seen, '/progress').map((s) => s.body.failure).filter(Boolean)).toEqual([expect.objectContaining({ code: 'timeout' })]);
});

it('ends on its ceiling even when a part won’t let go of its step, without needing the forced end', async () => {
  const ended: MakeResult[] = [];
  // Never settles, even when told to stop.
  const stuck = (async () => new Promise(() => undefined)) as any;
  const result = await runMake({ home: tempHome(), line: fakeLine(), parts: testParts({ clipRun: stuck }), ceilingMs: 50, lastWordMs: 10, forceEnd: (r) => ended.push(r) });
  expect(result).toMatchObject({ status: 'failed', code: 'timeout', message: CEILING_WORDS });
  expect(ended).toEqual([]);
});

it('waits out the line’s "retry" for a piece inside the step’s time instead of ending the run', async () => {
  const line = fakeLine({
    piece: (_req, n) => (n === 0 ? { status: 503, json: { error: { code: 'line_unavailable', error: 'The line is busy.', fix: 'Try again in a moment.', next: 'retry', retry_after_seconds: 1 } } } : undefined),
  });
  const result = await runMake({ home: tempHome(), line });
  expect(result.status).toBe('done');
  expect(lineRoute(line.seen, '/pieces').length).toBeGreaterThan(1);
});

it('sends what the final check noted without failing the video with the upload', async () => {
  const line = fakeLine();
  const checkRun = (async () => ({
    verdict: {
      pass: true,
      checks: [
        { code: 'flag:read_rate', status: 'warn', message: 'The voice reads too fast: 3.40 words a second.' },
        { code: 'plays', status: 'pass' },
      ],
    },
  })) as any;
  const result = await runMake({ home: tempHome(), line, parts: testParts({ checkRun }) });
  expect(result.status).toBe('done');
  expect(lineRoute(line.seen, '/upload')[0].body.manifest.check_warnings).toEqual(expect.arrayContaining([{ check: 'flag:read_rate', message: 'The voice reads too fast: 3.40 words a second.' }]));
});

void json;
