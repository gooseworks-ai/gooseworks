// Rules on the line client: its secrets never show in a dump of it, and a
// download stops as soon as it goes past its limit.
import { inspect } from 'util';
import { VideoLine } from '../../src/kit/line/client';

const LOGIN = 'cal_secretlogin0123456789abcdef';
const TOKEN = 'vl1_q_1.4102444800.secretsignature0123456789';

describe('the line client', () => {
  it('shows no login or token when printed or turned into JSON', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ device_id: 'd', saved_at: '', kit: { ok: true, min_version: '1.0.0', latest_version: '1.0.0' }, styles: { ready: 0, total: 0 }, line: { token: TOKEN, lease: '00000000-0000-4000-8000-000000000001', project_id: 'vid_1' } }), { status: 200 })) as unknown as typeof fetch;
    const line = new VideoLine({ apiBase: 'https://api.test', deviceId: '11111111-2222-4333-8444-555555555555', login: LOGIN, fetch: fetchImpl });
    await line.handOver('vid_1', {} as never);
    for (const dump of [JSON.stringify(line), inspect(line, { depth: 5, showHidden: true }), JSON.stringify(Object.entries(line))]) {
      expect(dump).not.toContain(LOGIN);
      expect(dump).not.toContain(TOKEN);
    }
  });

  it('stops a download that goes past its limit, without reading the rest', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        if (pulled > 64 * 1024 * 1024) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const fetchImpl = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    const line = new VideoLine({ apiBase: 'https://api.test', deviceId: '11111111-2222-4333-8444-555555555555', fetch: fetchImpl, sleep: async () => undefined });
    await expect(line.download('https://files.test/big.mp4', 256 * 1024)).rejects.toThrow(/larger than/);
    expect(pulled).toBeLessThan(2 * 1024 * 1024);
  });
});
