// Rules on piece keys: a piece the provider finished is never ordered under a
// new key; a busy answer joins only this same piece with these same inputs;
// and a failed piece is retried only when the line says retry.
import { fakeLine, MODEL, runMake, tempHome, testParts } from './harness';

const failedWith = (code: string, next: string) => (req: any) => ({
  status: 200,
  json: {
    piece_key: req.piece_key,
    idempotency_key: req.idempotency_key,
    status: 'failed',
    replayed: false,
    piece_credits: 0,
    credits: { used: 0, cap: 1000 },
    failure: { code, error: 'The maker failed.', fix: 'Try again later.', next },
  },
});

const busy = (key: string, next: string) => ({
  status: 409,
  json: { error: { code: 'piece_busy', error: 'Another attempt is running.', fix: '', next, retry_after_seconds: 1, details: { idempotency_key: key } } },
});

const keysOf = (line: ReturnType<typeof fakeLine>, piece: string) => line.pieces.filter((p) => p.piece_key === piece).map((p) => p.idempotency_key as string);

describe('a made piece is never ordered under a new key', () => {
  it('asks again with the same key when its download fails', async () => {
    const line = fakeLine({ download: (url, n) => (n === 0 ? new Response('gone', { status: 404 }) : undefined) });
    expect((await runMake({ home: tempHome(), line })).status).toBe('done');
    const keys = keysOf(line, 'clips.scene-1');
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/:1$/);
  });

  it('keeps the same key when every download of a made piece fails, even on the step’s retry', async () => {
    const line = fakeLine({ download: (url) => (url.pathname.includes('scene-1') ? new Response('gone', { status: 404 }) : undefined) });
    expect((await runMake({ home: tempHome(), line })).status).toBe('failed');
    expect(new Set(keysOf(line, 'clips.scene-1')).size).toBe(1);
  });
});

describe('a busy piece', () => {
  it('never takes over a running key for other inputs', async () => {
    const other = `clips.scene-1:${'0'.repeat(64)}:1`;
    const line = fakeLine({ piece: (req, n) => (n === 0 ? busy(other, 'retry') : undefined) });
    expect((await runMake({ home: tempHome(), line })).status).toBe('done');
    expect(line.pieces.map((p) => p.idempotency_key)).not.toContain(other);
  });

  it('joins the running attempt of this same piece', async () => {
    let running = '';
    const line = fakeLine({
      piece: (req, n) => {
        if (n !== 0) return undefined;
        running = req.idempotency_key.replace(/:1$/, ':2');
        return busy(running, 'retry');
      },
    });
    expect((await runMake({ home: tempHome(), line })).status).toBe('done');
    expect(keysOf(line, 'clips.scene-1')).toEqual([running.replace(/:2$/, ':1'), running]);
  });

  it('stops when the line says stop, without asking again', async () => {
    const line = fakeLine({ piece: (req) => busy(req.idempotency_key.replace(/:1$/, ':2'), 'stop') });
    expect((await runMake({ home: tempHome(), line })).status).toBe('stopped');
    expect(line.pieces).toHaveLength(1);
  });
});

describe('a failed piece follows the line’s next step', () => {
  it.each(['stop', 'update_kit', 'change_request'])('is not ordered again when next is %s', async (next) => {
    const line = fakeLine({ piece: failedWith('provider_failed', next) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).not.toBe('done');
    expect(line.pieces).toHaveLength(1);
  });
});

describe('a resumed piece the line said to stop on', () => {
  it('stops again on the saved answer, sending nothing', async () => {
    const home = tempHome();
    const first = fakeLine({ piece: failedWith('provider_failed', 'stop') });
    expect((await runMake({ home, line: first })).status).toBe('stopped');

    const again = fakeLine();
    expect((await runMake({ home, line: again })).status).toBe('stopped');
    expect(keysOf(again, 'clips.scene-1')).toHaveLength(0);
  });
});

describe('a free provider failure', () => {
  const freeFailure = (req: any) => ({
    status: 200,
    json: {
      piece_key: req.piece_key,
      idempotency_key: req.idempotency_key,
      status: 'failed',
      replayed: false,
      piece_credits: 0,
      credits: { used: 0, cap: 1000 },
      failure: { code: 'provider_failed', error: 'The maker couldn’t finish one part.', fix: 'Try once more with a new attempt. Nothing was charged.', next: 'retry', details: { transient: true, charged: false } },
    },
  });

  it('after two attempts is retried on the next run with key :3', async () => {
    const home = tempHome();
    const first = fakeLine({ piece: freeFailure });
    const result = await runMake({ home, line: first });
    expect(result.status).toBe('failed');
    expect(result.message).toBe('The maker couldn’t finish one part. Try once more with a new attempt. Nothing was charged.');
    expect(keysOf(first, 'clips.scene-1').map((k) => k.slice(-2))).toEqual([':1', ':2']);
    const reported = first.seen.filter((s) => s.url.endsWith('/progress')).map((s) => s.body.failure).filter(Boolean);
    expect(reported).toEqual([{ step: 'clips', code: 'tool_failed', detail: result.message }]);

    const again = fakeLine();
    expect((await runMake({ home, line: again })).status).toBe('done');
    expect(keysOf(again, 'clips.scene-1').map((k) => k.slice(-2))).toEqual([':3']);
  });

  it('makes at most two new keys in one run, and two more on the next', async () => {
    const home = tempHome();
    const first = fakeLine({ piece: freeFailure });
    await runMake({ home, line: first });
    const second = fakeLine({ piece: freeFailure });
    expect((await runMake({ home, line: second })).status).toBe('failed');
    expect(keysOf(second, 'clips.scene-1').map((k) => k.slice(-2))).toEqual([':3', ':4']);
  });

  it('is never ordered a third time in one run, however often the part asks', async () => {
    const line = fakeLine({ piece: freeFailure });
    const parts = testParts({
      clip: { retry: { transient: 0 } },
      clipRun: (async (_inputs: unknown, ctx: any) => {
        for (let i = 0; i < 3; i++) {
          await ctx.line.order({ piece: 'scene-1', provider: 'fal', path: MODEL, body: { text: 'First line' }, results: [{ pointer: '/file_url', name: 'scene-1.mp4', media: 'video' }] }).catch(() => undefined);
        }
        throw ctx.error('provider_failed', 'no clip');
      }) as any,
    });
    await runMake({ home: tempHome(), line, parts });
    expect(keysOf(line, 'clips.scene-1').map((k) => k.slice(-2))).toEqual([':1', ':2']);
  });

  it('still ends the piece for good once a charged failure used both attempts', async () => {
    const home = tempHome();
    const charged = (req: any) => {
      const reply = freeFailure(req);
      reply.json.failure.details = { transient: true, charged: true };
      return reply;
    };
    await runMake({ home, line: fakeLine({ piece: charged }) });
    const again = fakeLine();
    expect((await runMake({ home, line: again })).status).toBe('failed');
    expect(keysOf(again, 'clips.scene-1')).toHaveLength(0);
  });
});

it('joins a running later attempt of this same piece', async () => {
  let running = '';
  const line = fakeLine({
    piece: (req, n) => {
      if (n !== 0) return undefined;
      running = req.idempotency_key.replace(/:1$/, ':3');
      return busy(running, 'retry');
    },
  });
  expect((await runMake({ home: tempHome(), line })).status).toBe('done');
  expect(keysOf(line, 'clips.scene-1')).toEqual([running.replace(/:3$/, ':1'), running]);
});
