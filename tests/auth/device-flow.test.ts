import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FRONTEND_URL } from '../../src/config';
import { profileRoot, selectEnvironment } from '../../src/environment';
import {
  DENIED_MESSAGE,
  DeviceFlowUnavailableError,
  DeviceLoginStoppedError,
  APPROVAL_GRACE_MS,
  EXPIRED_MESSAGE,
  readPendingDeviceLogin,
  runDeviceFlow,
  type PendingDeviceLogin,
} from '../../src/auth/device-flow';
import { startStubApi, type StubApi } from './stub-api';

const START = '/api/cli/device/start';
const POLL = '/api/cli/device/poll';
const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const now = () => NOW;

const startOk = {
  status: 200,
  body: {
    status: 'success',
    data: {
      device_code: 'device-code-abc',
      user_code: 'WDJB-MJHT',
      verification_url: 'https://make.gooseworks.ai/link',
      verification_url_complete: 'https://make.gooseworks.ai/link?code=WDJB-MJHT',
      expires_in: 600,
      interval: 3,
    },
  },
};
const pending = (interval = 3) => ({ status: 200, body: { status: 'pending', interval } });
const success = (overrides: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    status: 'success',
    data: {
      token: 'cal_device_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      scope_type: 'user',
      default_agent_id: 'agent-123',
      api_base: null,
      mcp_server_url: 'http://localhost:6200',
      is_new_user: false,
      starter_credits_granted: 0,
      credits: 100,
      ...overrides,
    },
  },
});

let api: StubApi;
let home: string;
let logSpy: jest.SpyInstance;
const savedHome = process.env.GOOSEWORKS_USER_HOME;

const pendingPath = () => path.join(profileRoot(), 'pending-login.json');
const credentialsPath = () => path.join(profileRoot(), 'credentials.json');
const mode = (file: string) => fs.statSync(file).mode & 0o777;
/** Console output with colours stripped, one trimmed line per entry. */
const printed = () => logSpy.mock.calls
  .map((call) => String(call[0]))
  .join('\n')
  .replace(/\u001b\[[0-9;]*m/g, '')
  .split('\n')
  .map((line) => line.trim());

function recordingSleep() {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => { sleeps.push(ms); } };
}

beforeAll(async () => { api = await startStubApi(); });
afterAll(async () => { await api.close(); });

beforeEach(() => {
  selectEnvironment('production');
  api.reset();
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-device-'));
  process.env.GOOSEWORKS_USER_HOME = home;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
  selectEnvironment('production');
  if (savedHome === undefined) delete process.env.GOOSEWORKS_USER_HOME;
  else process.env.GOOSEWORKS_USER_HOME = savedHome;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('auth/device-flow', () => {
  it('prints the link and code, polls until approval, saves the key (0600) and removes the pending file', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [pending(), pending(), success()];
    const { sleeps, sleep } = recordingSleep();

    const outcome = await runDeviceFlow(api.base, { sleep, now });

    expect(printed()).toEqual([
      '→ Sign in to GooseWorks from any device:',
      `${FRONTEND_URL}/link?code=WDJB-MJHT`,
      '→ Code: WDJB-MJHT (expires in 10 minutes)',
    ]);
    expect(outcome).toEqual({
      status: 'done',
      result: {
        api_key: 'cal_device_token',
        email: 'user@example.com',
        agent_id: 'agent-123',
        scope_type: 'user',
        default_agent_id: 'agent-123',
        mcp_server_url: 'http://localhost:6200',
      },
    });
    expect(api.calls(START)).toHaveLength(1);
    expect(api.calls(START)[0].body).toEqual({ scope_type: 'user' });
    expect(api.calls(POLL)).toHaveLength(3);
    for (const call of api.calls(POLL)) expect(call.body).toEqual({ device_code: 'device-code-abc' });
    for (const call of api.requests) expect(call.headers.authorization).toBeUndefined();
    expect(sleeps).toEqual([3000, 3000]);

    const saved = JSON.parse(fs.readFileSync(credentialsPath(), 'utf-8'));
    expect(saved).toEqual({
      api_key: 'cal_device_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      api_base: api.base,
      scope_type: 'user',
      default_agent_id: 'agent-123',
      mcp_server_url: 'http://localhost:6200',
    });
    expect(mode(credentialsPath())).toBe(0o600);
    expect(fs.existsSync(pendingPath())).toBe(false);
  });

  it('adopts the interval a slow_down reply asks for', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [{ status: 200, body: { status: 'slow_down', interval: 5 } }, success()];
    const { sleeps, sleep } = recordingSleep();

    await runDeviceFlow(api.base, { sleep, now });

    expect(sleeps).toEqual([5000]);
  });

  it('keeps polling through server errors until it gets an answer', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [{ status: 502, body: { status: 'error' } }, pending(), success()];
    const { sleeps, sleep } = recordingSleep();

    const outcome = await runDeviceFlow(api.base, { sleep, now });

    expect(outcome.status).toBe('done');
    expect(api.calls(POLL)).toHaveLength(3);
    expect(sleeps).toEqual([3000, 3000]);
  });

  it('stops with the expired message and clears the pending file when the code expires', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [pending(), { status: 200, body: { status: 'expired' } }];
    const { sleep } = recordingSleep();

    await expect(runDeviceFlow(api.base, { sleep, now })).rejects.toThrow(EXPIRED_MESSAGE);
    expect(fs.existsSync(pendingPath())).toBe(false);
    expect(fs.existsSync(credentialsPath())).toBe(false);
  });

  it('treats an unknown code (404) as expired', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [{ status: 404, body: { status: 'error', message: 'Unknown sign-in request' } }];
    const { sleep } = recordingSleep();

    await expect(runDeviceFlow(api.base, { sleep, now })).rejects.toThrow(EXPIRED_MESSAGE);
    expect(fs.existsSync(pendingPath())).toBe(false);
  });

  it('stops polling once expiry plus the approval grace passes, even if the server keeps saying pending', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [pending(), pending()];
    let clock = NOW;
    const sleep = async () => { clock += APPROVAL_GRACE_MS + 601_000; };

    await expect(runDeviceFlow(api.base, { sleep, now: () => clock })).rejects.toThrow(EXPIRED_MESSAGE);
    expect(api.calls(POLL)).toHaveLength(2);
    expect(fs.existsSync(pendingPath())).toBe(false);
  });

  it('still collects a key approved near the deadline after the code\'s own expiry (the server extends it)', async () => {
    api.replies[START] = [startOk];
    await runDeviceFlow(api.base, { wait: false, now });
    const late = () => NOW + 14 * 60_000;
    api.replies[POLL] = [success()];
    const { sleep } = recordingSleep();

    const outcome = await runDeviceFlow(api.base, { sleep, now: late });

    expect(outcome.status).toBe('done');
    expect(api.calls(START)).toHaveLength(1);
    expect(fs.existsSync(credentialsPath())).toBe(true);
  });

  it('with wait:false checks a saved code first: collects it, or replaces one that was canceled', async () => {
    api.replies[START] = [startOk];
    await runDeviceFlow(api.base, { wait: false, now });
    api.replies[POLL] = [success()];
    expect((await runDeviceFlow(api.base, { wait: false, now })).status).toBe('done');
    expect(fs.existsSync(credentialsPath())).toBe(true);

    fs.rmSync(credentialsPath());
    api.replies[START] = [startOk, { status: 200, body: { status: 'success', data: { device_code: 'device-code-new', user_code: 'BCDF-GHJK', expires_in: 600, interval: 3 } } }];
    await runDeviceFlow(api.base, { wait: false, now });
    api.replies[POLL] = [{ status: 200, body: { status: 'denied' } }];
    logSpy.mockClear();
    const fresh = await runDeviceFlow(api.base, { wait: false, now });
    expect(fresh.status === 'pending' && fresh.pending.user_code).toBe('BCDF-GHJK');
    expect(printed()).toContain('→ Sign in to GooseWorks from any device:');
    expect(printed()).not.toContain('→ Still waiting for you to approve:');
  });

  it('retries a rate-limited start, then gives the link', async () => {
    api.replies[START] = [{ status: 429, body: { status: 'error' } }, startOk];
    const { sleep, sleeps } = recordingSleep();

    const outcome = await runDeviceFlow(api.base, { wait: false, now, sleep });

    expect(outcome.status).toBe('pending');
    expect(api.calls(START)).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it('reports a denied sign-in and clears the pending file', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [{ status: 200, body: { status: 'denied' } }];
    const { sleep } = recordingSleep();

    await expect(runDeviceFlow(api.base, { sleep, now })).rejects.toThrow(DENIED_MESSAGE);
    expect(fs.existsSync(pendingPath())).toBe(false);
  });

  it('fails fast on a rejected poll (400) instead of polling until expiry', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [{ status: 400, body: { status: 'error' } }];
    const { sleep } = recordingSleep();

    await expect(runDeviceFlow(api.base, { sleep, now })).rejects.toThrow(/status 400/);
    expect(api.calls(POLL)).toHaveLength(1);
  });

  it('throws DeviceFlowUnavailableError when the server predates device sign-in', async () => {
    api.replies[START] = [{ status: 404, body: { status: 'error' } }];

    await expect(runDeviceFlow(api.base, { now })).rejects.toBeInstanceOf(DeviceFlowUnavailableError);
    expect(fs.existsSync(pendingPath())).toBe(false);
    expect(api.calls(POLL)).toHaveLength(0);
  });

  it('with wait:false saves the pending sign-in (0600) and never polls', async () => {
    api.replies[START] = [startOk];

    const outcome = await runDeviceFlow(api.base, { wait: false, now });

    expect(outcome.status).toBe('pending');
    expect(api.calls(POLL)).toHaveLength(0);
    expect(mode(pendingPath())).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(pendingPath(), 'utf-8'))).toEqual({
      device_code: 'device-code-abc',
      user_code: 'WDJB-MJHT',
      link: `${FRONTEND_URL}/link?code=WDJB-MJHT`,
      api_base: api.base,
      expires_at: new Date(NOW + 600_000).toISOString(),
      interval: 3,
    });
    expect(printed()).toContain(`${FRONTEND_URL}/link?code=WDJB-MJHT`);
  });

  it('resumes a pending sign-in without starting a new one and says it is still waiting', async () => {
    api.replies[START] = [startOk];
    await runDeviceFlow(api.base, { wait: false, now });
    logSpy.mockClear();

    api.replies[POLL] = [success()];
    const { sleep } = recordingSleep();
    const outcome = await runDeviceFlow(api.base, { sleep, now });

    expect(outcome.status).toBe('done');
    expect(api.calls(START)).toHaveLength(1);
    expect(api.calls(POLL)[0].body).toEqual({ device_code: 'device-code-abc' });
    expect(printed()).toEqual([
      '→ Still waiting for you to approve:',
      `${FRONTEND_URL}/link?code=WDJB-MJHT`,
      '→ Code: WDJB-MJHT (expires in 10 minutes)',
    ]);
  });

  it('ignores a pending sign-in saved for another API base, or one that expired or is broken', async () => {
    const other: PendingDeviceLogin = {
      device_code: 'other-code',
      user_code: 'BCDF-GHJK',
      link: `${FRONTEND_URL}/link?code=BCDF-GHJK`,
      api_base: 'http://127.0.0.1:1',
      expires_at: new Date(NOW + 600_000).toISOString(),
      interval: 3,
    };
    fs.mkdirSync(profileRoot(), { recursive: true });
    fs.writeFileSync(pendingPath(), JSON.stringify(other));
    expect(readPendingDeviceLogin(other.api_base, now)).not.toBeNull();
    expect(readPendingDeviceLogin(api.base, now)).toBeNull();
    // Kept through the approval grace (the server may have extended it), then dropped.
    expect(readPendingDeviceLogin(other.api_base, () => NOW + 600_001)).not.toBeNull();
    expect(readPendingDeviceLogin(other.api_base, () => NOW + 600_000 + APPROVAL_GRACE_MS + 1)).toBeNull();

    api.replies[START] = [startOk];
    await runDeviceFlow(api.base, { wait: false, now });
    expect(api.calls(START)).toHaveLength(1);
    expect(readPendingDeviceLogin(api.base, now)?.device_code).toBe('device-code-abc');

    fs.writeFileSync(pendingPath(), '{not json');
    expect(readPendingDeviceLogin(api.base, now)).toBeNull();
  });

  it('refuses a staging sign-in that does not confirm the staging API', async () => {
    selectEnvironment('staging');
    api.replies[START] = [startOk];
    api.replies[POLL] = [success({ api_base: 'https://api.gooseworks.ai' })];
    const { sleep } = recordingSleep();

    await expect(runDeviceFlow(api.base, { sleep, now })).rejects.toThrow(/did not confirm the staging API/);
    expect(fs.existsSync(credentialsPath())).toBe(false);
    expect(fs.existsSync(pendingPath())).toBe(false);
  });

  it('carries --ref onto the link as creator_ref', async () => {
    api.replies[START] = [startOk];

    const outcome = await runDeviceFlow(api.base, { ref: 'K7M2 QX9P', wait: false, now });

    const link = `${FRONTEND_URL}/link?code=WDJB-MJHT&creator_ref=K7M2%20QX9P`;
    expect(outcome.status === 'pending' && outcome.pending.link).toBe(link);
    expect(printed()).toContain(link);
  });

  it('stops waiting on SIGINT and keeps the pending file so a rerun resumes', async () => {
    api.replies[START] = [startOk];
    api.replies[POLL] = [pending()];
    const listenersBefore = process.listenerCount('SIGINT');
    const sleep = (_ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
      signal?.addEventListener('abort', () => resolve(), { once: true });
    });

    const flow = runDeviceFlow(api.base, { sleep, now });
    for (let i = 0; i < 100 && api.calls(POLL).length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 5));
    (process as NodeJS.EventEmitter).emit('SIGINT');

    await expect(flow).rejects.toBeInstanceOf(DeviceLoginStoppedError);
    expect(fs.existsSync(pendingPath())).toBe(true);
    expect(process.listenerCount('SIGINT')).toBe(listenersBefore);
  });

  it('builds the production link on make.gooseworks.ai', () => {
    const saved = process.env.GOOSEWORKS_FRONTEND_URL;
    delete process.env.GOOSEWORKS_FRONTEND_URL;
    try {
      jest.isolateModules(() => {
        const { deviceLink } = require('../../src/auth/device-flow');
        expect(deviceLink('WDJB-MJHT')).toBe('https://make.gooseworks.ai/link?code=WDJB-MJHT');
      });
    } finally {
      if (saved !== undefined) process.env.GOOSEWORKS_FRONTEND_URL = saved;
    }
  });
});
