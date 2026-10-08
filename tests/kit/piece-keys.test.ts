// Rules on piece keys: a piece the provider finished is never ordered under a
// new key; a busy answer joins only this same piece with these same inputs;
// and a failed piece is retried only when the line says retry.
import { fakeLine, runMake, tempHome } from './harness';

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
  it('is asked again under its own key, never ordered as a new attempt', async () => {
    const home = tempHome();
    const first = fakeLine({ piece: failedWith('provider_failed', 'stop') });
    expect((await runMake({ home, line: first })).status).toBe('stopped');

    const again = fakeLine();
    await runMake({ home, line: again });
    const keys = keysOf(again, 'clips.scene-1');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.endsWith(':1'))).toBe(true);
  });
});
