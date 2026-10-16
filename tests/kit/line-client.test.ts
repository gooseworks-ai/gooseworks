// Rules on the line client: its secrets never show in a dump of it, and a
// download stops as soon as it goes past its limit.
import { inspect } from 'util';
import { LineError, lineWords, VideoLine } from '../../src/kit/line/client';

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

  it('asks for access with the login before any setup, and turns a wrong account into a sign_in refusal', async () => {
    const seen: Array<{ url: string; method?: string; auth?: string }> = [];
    const replies = [
      new Response(JSON.stringify({ ok: true, account: { email: 'a@example.com', workspace_name: 'Kiss Cafe' } }), { status: 200 }),
      new Response(
        JSON.stringify({
          error: {
            code: 'wrong_account',
            error: 'This computer is signed in to GooseWorks as b@example.com, but this video belongs to another account.',
            fix: 'Sign in on this computer with the account you use in your chat, then run the same command again.',
            next: 'sign_in',
            details: { signed_in_as: 'b@example.com' },
          },
        }),
        { status: 403 },
      ),
    ];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method, auth: (init.headers as Record<string, string>).Authorization });
      return replies.shift()!;
    }) as unknown as typeof fetch;
    const line = new VideoLine({ apiBase: 'https://api.test', deviceId: '11111111-2222-4333-8444-555555555555', login: LOGIN, fetch: fetchImpl, sleep: async () => undefined });

    await expect(line.access('vid_1')).resolves.toEqual({ ok: true, account: { email: 'a@example.com', workspace_name: 'Kiss Cafe' } });
    expect(seen[0]).toEqual({ url: 'https://api.test/v1/video-line/vid_1/access', method: 'GET', auth: `Bearer ${LOGIN}` });

    const refused = await line.access('vid_1').catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(LineError);
    expect(refused).toMatchObject({ code: 'wrong_account', next: 'sign_in', status: 403, details: { signed_in_as: 'b@example.com' } });
    expect(seen).toHaveLength(2);
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

  describe('a refusal’s words for the person', () => {
    const refusing = (error: Record<string, unknown> | string, status = 409) =>
      new VideoLine({
        apiBase: 'https://api.test',
        deviceId: '11111111-2222-4333-8444-555555555555',
        login: LOGIN,
        fetch: (async () => new Response(typeof error === 'string' ? error : JSON.stringify({ error }), { status })) as unknown as typeof fetch,
        sleep: async () => undefined,
        maxRetries: 0,
      });
    const refusal = async (line: VideoLine) => {
      try {
        await line.reportDevice({} as never);
      } catch (error) {
        return error as LineError;
      }
      throw new Error('not refused');
    };

    it('are the server’s sentence for them, never the fix written for the AI', async () => {
      const error = await refusal(refusing({ code: 'video_stopped', error: 'This video was stopped.', fix: 'Tell them what is kept and how they can carry on.', say: 'You stopped this video. What was made so far is kept.', next: 'stop' }));
      expect(lineWords(error)).toBe('You stopped this video. What was made so far is kept.');
    });

    it('are the error and its fix when the server wrote no sentence for them', async () => {
      const error = await refusal(refusing({ code: 'not_signed_in', error: 'This computer isn’t signed in to GooseWorks.', fix: 'Sign in again, then run the check again.', next: 'stop' }));
      expect(lineWords(error)).toBe('This computer isn’t signed in to GooseWorks. Sign in again, then run the check again.');
    });

    it('keep the kit’s own advice when the kit wrote the refusal', async () => {
      const error = await refusal(refusing('<html>bad gateway</html>', 502));
      expect(lineWords(error)).toBe('The line refused the call (HTTP 502). Try again in a minute.');
    });
  });
});
