// Rule: `video check` says which account it reported for, and a sign-in the
// line no longer takes is replaced once, by itself, instead of asking for a step.
import { checkComputer } from '../../src/kit/core/check';
import { LineError, type VideoLine } from '../../src/kit/line/client';
import type { DeviceAnswer } from '../../src/kit/line/types';
import type { KitHost } from '../../src/kit/core/host';
import type { Toolchain } from '../../src/kit/core/toolchain';
import { tempHome } from './harness';

const tool = { path: '/bin/tool', report: { ok: true, version: '7.0', bundled: true } };
const tools: Toolchain = { ffmpeg: tool, ffprobe: tool };
const host = { browser: { check: async () => ({ ok: true, version: '1', bundled: true }) } } as unknown as KitHost;

const answer = (account?: DeviceAnswer['account']): DeviceAnswer => ({
  device_id: 'd',
  saved_at: '',
  kit: { ok: true, min_version: '0.1.0', latest_version: '0.1.0' },
  styles: { ready: 12, total: 14 },
  ...(account ? { account } : {}),
});

function fakeLine(reportDevice: () => Promise<DeviceAnswer>): VideoLine {
  return { isWorker: false, hasLogin: true, reportDevice, download: async () => Buffer.alloc(0) } as unknown as VideoLine;
}

describe('video check', () => {
  it('names the account and workspace the report was saved for', async () => {
    const said: string[] = [];
    const result = await checkComputer({
      home: tempHome(),
      env: {},
      line: fakeLine(async () => answer({ email: 'anna@example.com', workspace_name: 'Anna and Sarah' })),
      host,
      tools,
      say: (line) => said.push(line),
    });
    expect(result).toMatchObject({ ready: 12, total: 14 });
    expect(said.at(-1)).toMatch(/12 styles of 14, signed in as anna@example\.com \(Anna and Sarah\)\.$/);
  });

  it('signs in again once when the saved sign-in has expired, then reports with the new one', async () => {
    const expired = new LineError(
      { code: 'not_signed_in', error: 'This computer isn’t signed in to GooseWorks.', fix: 'Sign in to GooseWorks on this computer, then run the same command again.', next: 'sign_in' },
      401,
    );
    const signInAgain = jest.fn(async () => fakeLine(async () => answer({ email: 'anna@example.com', workspace_name: 'Anna and Sarah' })));
    const said: string[] = [];
    const result = await checkComputer({
      home: tempHome(),
      env: {},
      line: fakeLine(async () => Promise.reject(expired)),
      host,
      tools,
      say: (line) => said.push(line),
      signInAgain,
    });
    expect(signInAgain).toHaveBeenCalledTimes(1);
    expect(result.status).not.toBe('update_kit');
    expect(said.at(-1)).toContain('signed in as anna@example.com');
  });
});
