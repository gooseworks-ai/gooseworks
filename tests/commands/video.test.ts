// Rules for `gooseworks video make <id>` before anything slow runs: the kit
// talks to its own address, says who it is signed in as, and when the video
// belongs to another account it signs in with the account chooser (bound to
// the video) and asks once more, instead of sending the customer elsewhere.
jest.mock('../../src/commands/login', () => ({
  signIn: jest.fn(),
  syncMcpRegistration: jest.fn(),
}));
jest.mock('../../src/kit/core/run', () => ({ makeVideo: jest.fn() }));
jest.mock('../../src/kit/core/check', () => ({ checkComputer: jest.fn().mockResolvedValue({ status: 'ready' }) }));
jest.mock('../../src/kit/core/host', () => ({ defaultHost: () => ({}) }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
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

async function check() {
  const program = new Command().exitOverride();
  program.addCommand(videoCommand);
  await program.parseAsync(['node', 'gooseworks', 'video', 'check']);
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
  // `video make` may end the process once the run is over (after flushing output); here the runner must keep going.
  jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  for (const stream of [process.stdout, process.stderr]) {
    jest.spyOn(stream, 'write').mockImplementation(((...args: unknown[]) => {
      const done = args.find((arg) => typeof arg === 'function') as (() => void) | undefined;
      done?.();
      return true;
    }) as never);
  }
  mockMakeVideo.mockResolvedValue({ status: 'done', message: 'Your video is ready.' } as Awaited<ReturnType<typeof makeVideo>>);
});

afterEach(() => {
  logSpy.mockRestore();
  jest.restoreAllMocks();
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

    // The first sign-in is already bound to the video, so the page only gives a key to an account that can make it.
    expect(mockSignIn).toHaveBeenCalledWith(api.base, undefined, { videoId: VIDEO });
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
    expect(process.exitCode).toBe(6);
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
    expect(process.exitCode).toBe(6);
  });

  it('signs in again without the chooser when the saved sign-in has expired', async () => {
    save(api.base, 'cal_old', 'anna@example.com');
    mockSignIn.mockImplementation(async (apiBase) => {
      save(apiBase, 'cal_anna', 'anna@example.com');
      return { status: 'done', result: { api_key: 'cal_anna', email: 'anna@example.com', agent_id: 'agent-1' } };
    });
    api.replies[ACCESS] = [
      { status: 401, body: { error: { code: 'not_signed_in', error: 'This computer isn’t signed in to GooseWorks.', fix: 'Sign in to GooseWorks on this computer, then run the same command again.', next: 'sign_in' } } },
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

describe('video check', () => {
  it('signs in with no video, since it checks the computer for every video', async () => {
    mockSignIn.mockImplementation(async (apiBase) => {
      save(apiBase, 'cal_anna', 'anna@example.com');
      return { status: 'done', result: { api_key: 'cal_anna', email: 'anna@example.com', agent_id: 'agent-1' } };
    });

    await check();

    expect(mockSignIn).toHaveBeenCalledWith(api.base, undefined, {});
    expect(printed()).toContain('Signed in to GooseWorks as anna@example.com.');
  });
});

async function video(...args: string[]) {
  const program = new Command().exitOverride();
  program.addCommand(videoCommand);
  await program.parseAsync(['node', 'gooseworks', 'video', ...args]);
}

/** What went to stdout as whole lines (the --json events). */
const stdoutLines = () =>
  (process.stdout.write as unknown as jest.Mock).mock.calls
    .map((call) => String(call[0]))
    .join('')
    .split('\n')
    .filter(Boolean);

describe('what video make leaves for whoever runs it', () => {
  const runFolder = () => path.join(home, '.gooseworks', 'videos', VIDEO);

  it('with --json, ends on a JSON result line and exits with the outcome’s stable code', async () => {
    save(api.base, 'cal_anna', 'anna@example.com');
    api.replies[ACCESS] = [allowed];
    mockMakeVideo.mockResolvedValue({ status: 'failed', message: 'One clip didn’t come back in time.', code: 'provider_slow' } as Awaited<ReturnType<typeof makeVideo>>);

    await video('make', VIDEO, '--json');
    // The subcommand keeps parsed option values; a real process parses once.
    videoCommand.commands.find((command) => command.name() === 'make')!.setOptionValue('json', undefined);

    const lines = stdoutLines().map((line) => JSON.parse(line));
    expect(lines[lines.length - 1]).toMatchObject({ event: 'result', video_id: VIDEO, status: 'failed', outcome: 'run_again', exit_code: 4, code: 'provider_slow', message: 'One clip didn’t come back in time.' });
    expect(lines.slice(0, -1).every((line) => line.event === 'say')).toBe(true);
    expect(process.exitCode).toBe(4);
    expect(JSON.parse(fs.readFileSync(path.join(runFolder(), 'last-result.json'), 'utf8'))).toMatchObject({ outcome: 'run_again', exit_code: 4 });
  });

  it('prints the frame sheet after a finished video’s words, and video status reads how it ended', async () => {
    save(api.base, 'cal_anna', 'anna@example.com');
    api.replies[ACCESS] = [allowed];
    mockMakeVideo.mockResolvedValue({ status: 'done', message: 'Your video is ready.', final: '/f/final.mp4', contact_sheet: '/f/contact-sheet.png', warnings: ['The voice reads too fast.'] } as Awaited<ReturnType<typeof makeVideo>>);

    await video('make', VIDEO);

    expect(printed().slice(-3)).toEqual(['Your video is ready.', 'Our check noted: The voice reads too fast.', 'Look over its frames before you share it: /f/contact-sheet.png']);
    expect(process.exitCode).toBeUndefined();
    logSpy.mockClear();
    await video('status', VIDEO, '--json');
    videoCommand.commands.find((command) => command.name() === 'status')!.setOptionValue('json', undefined);
    expect(JSON.parse(printed()[0])).toMatchObject({ event: 'status', video_id: VIDEO, state: 'done', exit_code: 0, contact_sheet: '/f/contact-sheet.png', warnings: ['The voice reads too fast.'] });
  });

  it('video status says when a video has not been made here', async () => {
    await video('status', VIDEO);
    expect(printed()).toEqual(['This video hasn’t been made on this computer yet.']);
  });

  it('video verify names the final and its frame sheet, with what to look for', async () => {
    await video('verify', VIDEO);
    expect(printed()).toEqual(['This video hasn’t been finished on this computer, so there is nothing to look at yet.']);
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    logSpy.mockClear();
    const final = path.join(runFolder(), 'final');
    fs.mkdirSync(final, { recursive: true });
    fs.writeFileSync(path.join(final, 'final.mp4'), 'video');
    fs.writeFileSync(path.join(final, 'contact-sheet.png'), 'png');
    // A final left by an earlier run is not shown while the last run ended otherwise.
    const result = path.join(runFolder(), 'last-result.json');
    fs.writeFileSync(result, JSON.stringify({ event: 'result', video_id: VIDEO, status: 'failed', outcome: 'failed', exit_code: 1, message: 'no', ended_at: new Date().toISOString() }));
    await video('verify', VIDEO);
    expect(printed()).toEqual(['This video hasn’t been finished on this computer, so there is nothing to look at yet.']);
    process.exitCode = undefined;
    logSpy.mockClear();
    fs.writeFileSync(result, JSON.stringify({ event: 'result', video_id: VIDEO, status: 'done', outcome: 'done', exit_code: 0, message: 'ok', final: path.join(final, 'final.mp4'), ended_at: new Date().toISOString() }));
    fs.writeFileSync(
      path.join(final, 'eyes.json'),
      JSON.stringify({ output_sha256: createHash('sha256').update(fs.readFileSync(path.join(final, 'final.mp4'))).digest('hex'), contact_sheet: path.join(final, 'contact-sheet.png'), tiles: [], warnings: [{ check: 'product_visible', message: '“Tin” may not show clearly in the video.' }], look_for: [] }),
    );
    await video('verify', VIDEO);
    const said = printed();
    expect(said[0]).toBe(`The finished video: ${path.join(final, 'final.mp4')}`);
    expect(said[1]).toContain(path.join(final, 'contact-sheet.png'));
    expect(said).toContain('- The product shows, facing the camera, where the plan puts it.');
    expect(said[said.length - 1]).toBe('Our check noted: “Tin” may not show clearly in the video.');
    expect(process.exitCode).toBeUndefined();
  });

  it('video log prints the newest run log', async () => {
    const runs = path.join(runFolder(), 'runs');
    fs.mkdirSync(runs, { recursive: true });
    fs.writeFileSync(path.join(runs, '20261001T000000.000Z-q_1.ndjson'), '{"old":1}\n');
    fs.writeFileSync(path.join(runs, '20261002T000000.000Z-q_1.ndjson'), '{"a":1}\n{"b":2}\n');

    await video('log', VIDEO, '--lines', '1');
    expect(printed()).toEqual(['{"b":2}']);
  });
});
