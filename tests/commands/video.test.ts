// Rules for `gooseworks video make <id>` before anything slow runs: the kit
// talks to its own address, says who it is signed in as, and when the video
// belongs to another account it signs in with the account chooser (bound to
// the video) and asks once more, instead of sending the customer elsewhere.
jest.mock('../../src/commands/login', () => ({
  signIn: jest.fn(),
  syncMcpRegistration: jest.fn(),
}));
jest.mock('../../src/kit/core/run', () => ({ makeVideo: jest.fn() }));
jest.mock('../../src/kit/core/check', () => ({ checkComputer: jest.fn() }));
jest.mock('../../src/kit/core/host', () => ({ defaultHost: () => ({}) }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Command } from 'commander';
import { saveCredentials } from '../../src/auth/credentials';
import { selectEnvironment } from '../../src/environment';
import { signIn, syncMcpRegistration } from '../../src/commands/login';
import { makeVideo } from '../../src/kit/core/run';
import { videoCommand } from '../../src/commands/video';
import { startStubApi, type StubApi } from '../auth/stub-api';

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;
const mockMakeVideo = makeVideo as jest.MockedFunction<typeof makeVideo>;

const VIDEO = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const ACCESS = `/v1/video-line/${VIDEO}/access`;
const allowed = { status: 200, body: { ok: true, account: { email: 'anna@example.com', workspace_name: 'Anna and Sarah' } } };
const wrongAccount = {
  status: 403,
  body: {
    error: {
      code: 'wrong_account',
      error: 'This computer is signed in to GooseWorks as sam@example.com, but this video belongs to another account.',
      fix: 'Sign in on this computer with the account you use in your chat, then run the same command again.',
      next: 'sign_in',
      details: { signed_in_as: 'sam@example.com' },
    },
  },
};

let api: StubApi;
let home: string;
let logSpy: jest.SpyInstance;
const saved = { home: process.env.GOOSEWORKS_USER_HOME, base: process.env.GOOSEWORKS_API_BASE, ci: process.env.CI };
const tty = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY };

const printed = () => logSpy.mock.calls.map((call) => String(call[0]));
const authOf = (n: number) => api.calls(ACCESS)[n]?.headers.authorization;

function save(apiBase: string, key: string, email: string) {
  saveCredentials({ api_key: key, email, agent_id: 'agent-1', api_base: apiBase });
}

function attended(on: boolean) {
  Object.defineProperty(process.stdin, 'isTTY', { value: on, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: on, configurable: true });
}

async function make() {
  // A fresh parent each time, so commander's parsed state never carries over.
  const program = new Command().exitOverride();
  program.addCommand(videoCommand);
  await program.parseAsync(['node', 'gooseworks', 'video', 'make', VIDEO]);
}

beforeAll(async () => { api = await startStubApi(); });
afterAll(async () => { await api.close(); });

beforeEach(() => {
  jest.clearAllMocks();
  selectEnvironment('production');
  api.reset();
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-video-'));
  process.env.GOOSEWORKS_USER_HOME = home;
  process.env.GOOSEWORKS_API_BASE = api.base;
  delete process.env.CI;
  process.exitCode = undefined;
  attended(true);
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockMakeVideo.mockResolvedValue({ status: 'done', message: 'Your video is ready.' } as Awaited<ReturnType<typeof makeVideo>>);
});

afterEach(() => {
  logSpy.mockRestore();
  attended(false);
  Object.defineProperty(process.stdin, 'isTTY', { value: tty.stdin, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: tty.stdout, configurable: true });
  for (const [name, value] of [['GOOSEWORKS_USER_HOME', saved.home], ['GOOSEWORKS_API_BASE', saved.base], ['CI', saved.ci]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  process.exitCode = undefined;
  fs.rmSync(home, { recursive: true, force: true });
});

describe('video make, before setup', () => {
  it('reuses a login saved for its own address and says who it is signed in as', async () => {
    save(api.base, 'cal_anna', 'anna@example.com');
    api.replies[ACCESS] = [allowed];

    await make();

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(authOf(0)).toBe('Bearer cal_anna');
    expect(printed()).toContain('Signed in to GooseWorks as anna@example.com.');
    expect(mockMakeVideo).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('talks to GOOSEWORKS_API_BASE, not a login saved for another address, and signs in there', async () => {
    save('http://localhost:5999', 'cal_local', 'dev@example.com');
    mockSignIn.mockImplementation(async (apiBase) => {
      save(apiBase, 'cal_anna', 'anna@example.com');
      return { status: 'done', result: { api_key: 'cal_anna', email: 'anna@example.com', agent_id: 'agent-1' } };
    });
    api.replies[ACCESS] = [allowed];

    await make();

    expect(mockSignIn).toHaveBeenCalledWith(api.base, undefined, {});
    expect(authOf(0)).toBe('Bearer cal_anna');
    expect(api.requests.every((r) => r.headers.authorization !== 'Bearer cal_local')).toBe(true);
    expect(mockMakeVideo).toHaveBeenCalledTimes(1);
  });

  it('signs in with the account chooser bound to the video when it is the wrong account, then carries on', async () => {
    save(api.base, 'cal_sam', 'sam@example.com');
    mockSignIn.mockImplementation(async (apiBase) => {
      save(apiBase, 'cal_anna', 'anna@example.com');
      return { status: 'done', result: { api_key: 'cal_anna', email: 'anna@example.com', agent_id: 'agent-1' } };
    });
    api.replies[ACCESS] = [wrongAccount, allowed];

    await make();

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith(api.base, undefined, { chooseAccount: true, videoId: VIDEO });
    expect(authOf(0)).toBe('Bearer cal_sam');
    expect(authOf(1)).toBe('Bearer cal_anna');
    expect(printed().join('\n')).toContain('This computer is signed in as sam@example.com; signing in with the account from your chat');
    expect(printed()).toContain('This computer now uses GooseWorks as anna@example.com instead of sam@example.com.');
    expect(syncMcpRegistration).toHaveBeenCalled();
    expect(mockMakeVideo).toHaveBeenCalledTimes(1);
    // The refusal is kept in the video's own log, for looking into later.
    const log = fs.readFileSync(path.join(home, '.gooseworks', 'videos', VIDEO, 'log.ndjson'), 'utf8');
    expect(log).toContain('"code":"wrong_account"');
    expect(log).not.toContain('cal_sam');
  });

  it('asks only once: a second refusal after signing in stops with the line’s words', async () => {
    save(api.base, 'cal_sam', 'sam@example.com');
    mockSignIn.mockImplementation(async (apiBase) => {
      save(apiBase, 'cal_sam2', 'sam@example.com');
      return { status: 'done', result: { api_key: 'cal_sam2', email: 'sam@example.com', agent_id: 'agent-1' } };
    });
    api.replies[ACCESS] = [wrongAccount, wrongAccount];

    await make();

    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(api.calls(ACCESS)).toHaveLength(2);
    expect(mockMakeVideo).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('unattended, prints the sign-in link and stops without waiting', async () => {
    attended(false);
    save(api.base, 'cal_sam', 'sam@example.com');
    mockSignIn.mockResolvedValue({ status: 'pending' });
    api.replies[ACCESS] = [wrongAccount];

    await make();

    expect(mockSignIn).toHaveBeenCalledWith(api.base, undefined, { wait: false, chooseAccount: true, videoId: VIDEO });
    expect(printed()).toContain('Approve the sign-in at the link above, then run the same command again.');
    expect(mockMakeVideo).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('signs in again without the chooser when the saved sign-in has expired', async () => {
    save(api.base, 'cal_old', 'anna@example.com');
    mockSignIn.mockImplementation(async (apiBase) => {
      save(apiBase, 'cal_anna', 'anna@example.com');
      return { status: 'done', result: { api_key: 'cal_anna', email: 'anna@example.com', agent_id: 'agent-1' } };
    });
    api.replies[ACCESS] = [
      { status: 401, body: { error: { code: 'not_signed_in', error: 'This computer isn’t signed in to GooseWorks.', fix: 'Run the same command again; it signs this computer in first.', next: 'sign_in' } } },
      allowed,
    ];

    await make();

    expect(mockSignIn).toHaveBeenCalledWith(api.base, undefined, { chooseAccount: false, videoId: VIDEO });
    expect(mockMakeVideo).toHaveBeenCalledTimes(1);
  });

  it('carries on when the server predates the access check', async () => {
    save(api.base, 'cal_anna', 'anna@example.com');
    api.replies[ACCESS] = [{ status: 404, body: { status: 'error', message: 'Not found' } }];

    await make();

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockMakeVideo).toHaveBeenCalledTimes(1);
  });
});
