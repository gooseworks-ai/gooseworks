// Rules on the line token: it never reaches the output, the log or the save
// folder, never goes to another host, and a worker's run sends its id on
// every line call.
import { readdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import { API, fakeLine, runMake, tempHome } from './harness';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const WORKER_ID = '6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b:2:run_abc123';

describe('the line token stays in memory', () => {
  it('is never printed, logged or saved, even when the line repeats it', async () => {
    const home = tempHome();
    const printed: string[] = [];
    const line = fakeLine({
      piece: (req, n) =>
        n === 1
          ? {
              status: 409,
              json: { error: { code: 'video_stopped', error: `Stopped for token vl1_q_1.4102444800.handedsignature0123456789 at ${API}/x?X-Amz-Signature=zz`, fix: 'Press Continue.', next: 'stop' } },
            }
          : undefined,
    });
    const result = await runMake({ home, line, printed });
    expect(result.status).toBe('stopped');

    const saved = filesUnder(home);
    expect(saved.some((f) => f.endsWith('log.ndjson'))).toBe(true);
    expect(saved.some((f) => f.endsWith('run.json'))).toBe(true);
    for (const file of saved) {
      const text = readFileSync(file).toString('latin1');
      expect(text).not.toContain(line.token);
      expect(text).not.toContain('cal_testlogin0123456789abcdef');
      expect(text).not.toMatch(/X-Amz-Signature=(?!\[redacted\])/);
    }
    const out = [...printed, result.message].join('\n');
    expect(out).not.toContain(line.token);
    expect(out).not.toContain('handedsignature');
  });

  it('goes only to our API, never to storage or a provider’s files', async () => {
    const line = fakeLine();
    expect((await runMake({ home: tempHome(), line })).status).toBe('done');
    const elsewhere = line.seen.filter((s) => !s.url.startsWith(API));
    expect(elsewhere.length).toBeGreaterThan(0);
    for (const call of elsewhere) {
      expect(call.headers.authorization).toBeUndefined();
      expect(JSON.stringify(call.headers)).not.toContain(line.token);
    }
  });
});

describe('a worker run', () => {
  it('signs with its line token and sends its id on every line call', async () => {
    const line = fakeLine({ token: 'vl1_q_1.4102444800.workersignature0123456789' });
    const result = await runMake({ home: tempHome(), line, worker: { token: line.token, id: WORKER_ID } });
    expect(result.status).toBe('done');

    const lineCalls = line.seen.filter((s) => s.url.startsWith(`${API}/v1/video-line/`));
    expect(lineCalls.map((c) => new URL(c.url).pathname.split('/').pop())).toEqual(expect.arrayContaining(['device', 'pieces', 'progress', 'upload', 'done']));
    for (const call of lineCalls) expect(call.headers['x-gooseworks-worker']).toBe(WORKER_ID);

    const handOver = lineCalls.find((c) => c.url.endsWith('/device'))!;
    expect(handOver.headers.authorization).toBe(`Bearer ${line.token}`);
    expect(handOver.body.device.kind).toBe('worker');
  });

  it('sends no worker id from a customer’s computer', async () => {
    const line = fakeLine();
    await runMake({ home: tempHome(), line });
    const handOver = line.seen.find((c) => c.url.endsWith('/device'))!;
    expect(handOver.body.device.kind).toBe('computer');
    expect(line.seen.every((c) => c.headers['x-gooseworks-worker'] === undefined)).toBe(true);
  });
});
