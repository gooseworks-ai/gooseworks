jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));
jest.mock('../../src/auth/oauth-server', () => ({
  runOAuthFlow: jest.fn(),
}));
jest.mock('../../src/auth/device-flow', () => {
  const actual = jest.requireActual('../../src/auth/device-flow');
  return {
    DeviceFlowUnavailableError: actual.DeviceFlowUnavailableError,
    runDeviceFlow: jest.fn(),
    readPendingDeviceLogin: jest.fn(),
  };
});
jest.mock('../../src/auth/login-mode', () => ({
  chooseLoginMode: jest.fn(),
}));
jest.mock('../../src/auth/paste-login', () => ({
  pasteLogin: jest.fn(),
}));
jest.mock('../../src/auth/attribution', () => ({
  recordAttributionRef: jest.fn().mockResolvedValue({ recorded: false }),
}));
jest.mock('../../src/skills/installer', () => ({
  getInstalledSkills: jest.fn().mockReturnValue([]),
  installManagedEntrySkills: jest.fn().mockReturnValue([]),
}));
jest.mock('../../src/skills/master-skill', () => ({
  getEntrySkills: jest.fn().mockReturnValue([]),
}));
jest.mock('../../src/commands/skills', () => ({
  readEntryFreshnessReport: jest.fn().mockResolvedValue({ cli: 'current' }),
  reportEntrySkillFreshness: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/agents/claude', () => ({ configureClaude: jest.fn() }));
jest.mock('../../src/agents/claude-mcp', () => ({ configureClaudeMcp: jest.fn().mockReturnValue(false) }));
jest.mock('../../src/agents/detect', () => ({ isAgentInstalled: jest.fn().mockReturnValue(false) }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  example: jest.fn(),
}));

import { getCredentials } from '../../src/auth/credentials';
import { runOAuthFlow } from '../../src/auth/oauth-server';
import { DeviceFlowUnavailableError, readPendingDeviceLogin, runDeviceFlow, type PendingDeviceLogin } from '../../src/auth/device-flow';
import { chooseLoginMode } from '../../src/auth/login-mode';
import { pasteLogin } from '../../src/auth/paste-login';
import * as logger from '../../src/utils/logger';
import { configureClaudeMcp } from '../../src/agents/claude-mcp';
import { isAgentInstalled } from '../../src/agents/detect';
import { createLoginCommand, ensureLoggedIn } from '../../src/commands/login';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;
const mockRunOAuthFlow = runOAuthFlow as jest.MockedFunction<typeof runOAuthFlow>;
const mockRunDeviceFlow = runDeviceFlow as jest.MockedFunction<typeof runDeviceFlow>;
const mockReadPending = readPendingDeviceLogin as jest.MockedFunction<typeof readPendingDeviceLogin>;
const mockChooseLoginMode = chooseLoginMode as jest.MockedFunction<typeof chooseLoginMode>;
const mockPasteLogin = pasteLogin as jest.MockedFunction<typeof pasteLogin>;

const API = 'https://api.gooseworks.ai';
const result = { api_key: 'cal_new', email: 'user@example.com', agent_id: 'agent-1' };
const creds = { ...result, api_base: API };
const pending: PendingDeviceLogin = {
  device_code: 'device-code',
  user_code: 'WDJB-MJHT',
  link: 'https://make.gooseworks.ai/link?code=WDJB-MJHT',
  api_base: API,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  interval: 3,
};
const AFTER_APPROVE = 'After you approve, run this command again (without --no-wait) to finish.';

const login = (...args: string[]) => createLoginCommand().parseAsync(['node', 'test', ...args]);

describe('login command', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCredentials.mockReturnValue(null);
    mockReadPending.mockReturnValue(null);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit called'); });
  });
  afterEach(() => exitSpy.mockRestore());

  it('falls back to the browser when an auto-chosen device sign-in is not on the server', async () => {
    mockChooseLoginMode.mockReturnValue({ mode: 'device', reason: 'SSH session' });
    mockRunDeviceFlow.mockRejectedValue(new DeviceFlowUnavailableError());
    mockRunOAuthFlow.mockResolvedValue(result);

    await login();

    expect(logger.warn).toHaveBeenCalledWith("Device sign-in isn't available on this server yet; using browser sign-in.");
    expect(mockRunOAuthFlow).toHaveBeenCalledWith(API, undefined);
    expect(logger.success).toHaveBeenCalledWith('Logged in as user@example.com');
  });

  it('does not fall back when --device was asked for explicitly', async () => {
    mockChooseLoginMode.mockReturnValue({ mode: 'device', reason: '--device' });
    mockRunDeviceFlow.mockRejectedValue(new DeviceFlowUnavailableError());

    await expect(login('--device')).rejects.toThrow('process.exit called');

    expect(mockRunOAuthFlow).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("Device sign-in isn't available on this server yet. Run gooseworks login --browser instead.");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('with --no-wait prints the follow-up line and exits 0 without finishing', async () => {
    mockChooseLoginMode.mockReturnValue({ mode: 'device', reason: '--no-wait' });
    mockRunDeviceFlow.mockResolvedValue({ status: 'pending', pending });

    await login('--device', '--no-wait', '--ref', 'K7M2QX9P');

    expect(mockChooseLoginMode).toHaveBeenCalledWith(expect.objectContaining({ device: true, noWait: true }));
    expect(mockRunDeviceFlow).toHaveBeenCalledWith(API, { ref: 'K7M2QX9P', wait: false });
    expect(logger.info).toHaveBeenCalledWith(AFTER_APPROVE);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.success).not.toHaveBeenCalled();
  });

  it('waits by default and runs the usual post-login steps when device sign-in completes', async () => {
    mockChooseLoginMode.mockReturnValue({ mode: 'device', reason: '--device' });
    mockRunDeviceFlow.mockResolvedValue({ status: 'done', result });

    await login('--device');

    expect(mockRunDeviceFlow).toHaveBeenCalledWith(API, { ref: undefined, wait: true });
    expect(logger.success).toHaveBeenCalledWith('Logged in as user@example.com');
    expect(logger.info).not.toHaveBeenCalledWith(AFTER_APPROVE);
  });

  it('uses the browser flow when the mode says browser', async () => {
    mockChooseLoginMode.mockReturnValue({ mode: 'browser', reason: 'default' });
    mockRunOAuthFlow.mockResolvedValue(result);

    await login('--browser');

    expect(mockChooseLoginMode).toHaveBeenCalledWith(expect.objectContaining({ browser: true, noWait: false }));
    expect(mockRunDeviceFlow).not.toHaveBeenCalled();
    expect(mockRunOAuthFlow).toHaveBeenCalled();
  });

  it('keeps an existing login instead of starting device sign-in', async () => {
    mockGetCredentials.mockReturnValue(creds);

    await login('--device', '--no-wait');

    expect(logger.success).toHaveBeenCalledWith('Already logged in as user@example.com');
    expect(mockRunDeviceFlow).not.toHaveBeenCalled();
  });

  it('--paste hands the value (or none) to pasteLogin and finishes the login', async () => {
    mockGetCredentials.mockReturnValue(creds);
    mockPasteLogin.mockResolvedValue(result);

    await login('--paste', 'cal_pasted');
    expect(mockPasteLogin).toHaveBeenCalledWith('cal_pasted', API);
    expect(logger.success).toHaveBeenCalledWith('Logged in as user@example.com');

    await login('--paste');
    expect(mockPasteLogin).toHaveBeenLastCalledWith(undefined, API);
    expect(mockRunDeviceFlow).not.toHaveBeenCalled();
    expect(mockRunOAuthFlow).not.toHaveBeenCalled();
  });

  it('ensureLoggedIn resumes a pending device sign-in on a desktop (how install --skills-only finishes)', async () => {
    const { chooseLoginMode: realChoose } = jest.requireActual('../../src/auth/login-mode');
    mockChooseLoginMode.mockImplementation((opts) => realChoose(opts, {}, 'darwin', () => false, () => ''));
    mockReadPending.mockReturnValue(pending);
    mockRunDeviceFlow.mockResolvedValue({ status: 'done', result });
    mockGetCredentials.mockReturnValueOnce(null).mockReturnValue(creds);

    await expect(ensureLoggedIn(API)).resolves.toEqual(creds);

    expect(mockReadPending).toHaveBeenCalledWith(API);
    expect(mockRunDeviceFlow).toHaveBeenCalledWith(API, { ref: undefined, wait: true });
    expect(mockRunOAuthFlow).not.toHaveBeenCalled();
  });
  it('re-points the MCP only where Claude Code is installed, so a cloud sandbox never gets ~/.claude.json', async () => {
    mockGetCredentials.mockReturnValue(null);
    mockChooseLoginMode.mockReturnValue({ mode: 'device', reason: '--device' });
    mockReadPending.mockReturnValue(null);
    mockRunDeviceFlow.mockResolvedValue({ status: 'done', result });
    (isAgentInstalled as jest.Mock).mockReturnValue(false);
    await login('--device');
    expect(configureClaudeMcp).not.toHaveBeenCalled();
    (isAgentInstalled as jest.Mock).mockReturnValue(true);
    await login('--device');
    expect(configureClaudeMcp).toHaveBeenCalledTimes(1);
    (isAgentInstalled as jest.Mock).mockReturnValue(false);
  });
  it.each([['--device'], ['--no-wait']])('refuses --browser together with %s', async (flag) => {
    mockGetCredentials.mockReturnValue(null);
    // Without the guard these would sign in happily.
    mockChooseLoginMode.mockReturnValue({ mode: 'device', reason: flag });
    mockReadPending.mockReturnValue(null);
    mockRunDeviceFlow.mockResolvedValue({ status: 'done', result });
    mockRunOAuthFlow.mockResolvedValue(result);
    await expect(login('--browser', flag)).rejects.toThrow('process.exit called');
    expect(logger.error).toHaveBeenCalledWith('--browser signs in on this computer; it cannot be combined with --device or --no-wait.');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRunDeviceFlow).not.toHaveBeenCalled();
    expect(mockRunOAuthFlow).not.toHaveBeenCalled();
  });
});
