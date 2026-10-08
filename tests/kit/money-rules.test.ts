// Rules on spend: nothing is ordered for a part the video's lock does not
// pin, or that this kit can't run; a failed piece gets exactly one new attempt.
import { fakeLine, lineCalls, MODEL, runMake, tempHome } from './harness';

const spent = (line: ReturnType<typeof fakeLine>) => [...lineCalls(line.seen, '/pieces'), ...lineCalls(line.seen, '/files'), ...lineCalls(line.seen, '/upload')];

describe('a part outside the lock is refused before any spend', () => {
  it('refuses a style step whose part is not in the lock', async () => {
    const line = fakeLine({ lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': undefined } }) });
    const loads: string[] = [];
    const result = await runMake({ home: tempHome(), line, loads });
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/not in this video’s parts list/);
    expect(spent(line)).toHaveLength(0);
    expect(loads).toHaveLength(0);
  });

  it('refuses a locked part pinned at another version', async () => {
    const line = fakeLine({ lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], version: '1.0.1' } } }) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('failed');
    expect(spent(line)).toHaveLength(0);
  });

  it('refuses a part whose kit range leaves this kit out (MV-37)', async () => {
    const line = fakeLine({ lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], kit: '>=2.0.0' } } }) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('update_kit');
    expect(spent(line)).toHaveLength(0);
  });

  it('refuses a paid part the lock allows no models', async () => {
    const line = fakeLine({ lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], models: [] } } }) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('failed');
    expect(spent(line)).toHaveLength(0);
  });

  it('refuses a piece for a model the lock does not list', async () => {
    const line = fakeLine({ lock: (lock) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], models: [{ provider: 'fal', model: 'other/model' }] } } }) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('failed');
    expect(spent(line)).toHaveLength(0);
  });
});

describe('a failed piece is retried once', () => {
  const failed = (code: 'provider_failed' | 'provider_rejected') => (req: any) => ({
    status: 200,
    json: {
      piece_key: req.piece_key,
      idempotency_key: req.idempotency_key,
      status: 'failed',
      replayed: false,
      piece_credits: 0,
      credits: { used: 0, cap: 1000 },
      failure: { code, error: 'The maker failed.', fix: 'Try again.', next: code === 'provider_failed' ? 'retry' : 'stop' },
    },
  });

  it('orders the piece again once, as attempt 2 with a new key', async () => {
    const fail = failed('provider_failed');
    const line = fakeLine({ piece: (req, n) => (n === 0 ? fail(req) : undefined) });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('done');
    const keys = line.pieces.filter((p) => p.piece_key === 'clips.scene-1').map((p) => p.idempotency_key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^clips\.scene-1:[a-f0-9]{64}:1$/);
    expect(keys[1]).toBe(keys[0].replace(/:1$/, ':2'));
    expect(line.pieces[0].call.path).toBe(MODEL);
  });

  it('stops after the second failure, with no third order', async () => {
    const line = fakeLine({ piece: failed('provider_failed') });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('failed');
    expect(line.pieces).toHaveLength(2);
    expect(lineCalls(line.seen, '/upload')).toHaveLength(0);
  });

  it('never orders a refused piece again', async () => {
    const line = fakeLine({ piece: failed('provider_rejected') });
    const result = await runMake({ home: tempHome(), line });
    expect(result.status).toBe('failed');
    expect(line.pieces).toHaveLength(1);
  });
});
