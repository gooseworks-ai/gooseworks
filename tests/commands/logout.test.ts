jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
  clearCredentials: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  banner: jest.fn(),
  step: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  example: jest.fn(),
  spinner: jest.fn().mockReturnValue({ stop: jest.fn() }),
  done: jest.fn(),
}));

jest.mock('../../src/agents/claude-mcp', () => ({
  removeClaudeMcp: jest.fn().mockReturnValue([]),
  otherGooseworksMcpEntries: jest.fn().mockReturnValue([]),
}));

jest.mock('../../src/auth/device-flow', () => ({
  clearPendingDeviceLogin: jest.fn(),
}));

jest.mock('../../src/auth/revoke', () => ({
  revokeKey: jest.fn(),
}));

import { getCredentials, clearCredentials } from '../../src/auth/credentials';
import * as loggerModule from '../../src/utils/logger';
import { otherGooseworksMcpEntries, removeClaudeMcp } from '../../src/agents/claude-mcp';
import { logoutCommand } from '../../src/commands/logout';
import { clearPendingDeviceLogin } from '../../src/auth/device-flow';
import { revokeKey } from '../../src/auth/revoke';
import { selectEnvironment } from '../../src/environment';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;
const mockClearCredentials = clearCredentials as jest.MockedFunction<typeof clearCredentials>;
const mockRemoveClaudeMcp = removeClaudeMcp as jest.MockedFunction<typeof removeClaudeMcp>;
const mockOtherEntries = otherGooseworksMcpEntries as jest.MockedFunction<typeof otherGooseworksMcpEntries>;
const mockRevokeKey = revokeKey as jest.MockedFunction<typeof revokeKey>;

const creds = { api_key: 'cal_test', email: 'u@example.com', agent_id: 'agent-1', api_base: 'https://api.gooseworks.ai' };
const said = () => [
  ...(loggerModule.success as jest.Mock).mock.calls,
  ...(loggerModule.info as jest.Mock).mock.calls,
  ...(loggerModule.warn as jest.Mock).mock.calls,
].map((call) => String(call[0]));
const logout = () => logoutCommand.parseAsync(['node', 'test']);

describe('logout command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectEnvironment('production');
    mockRemoveClaudeMcp.mockReturnValue([]);
    mockOtherEntries.mockReturnValue([]);
    mockRevokeKey.mockResolvedValue('cancelled');
  });
  afterEach(() => selectEnvironment('production'));

  it('still removes its own Claude Code connection when not logged in', async () => {
    mockGetCredentials.mockReturnValue(null);
    mockRemoveClaudeMcp.mockReturnValue(['gooseworks']);

    await logout();

    expect(loggerModule.info).toHaveBeenCalledWith('Not currently logged in.');
    expect(mockClearCredentials).not.toHaveBeenCalled();
    expect(mockRemoveClaudeMcp).toHaveBeenCalled();
    expect(said()).toContain('Removed the GooseWorks connection from Claude Code.');
    expect(mockRevokeKey).not.toHaveBeenCalled();
    // An unfinished `login --device --no-wait` is dropped even with no account.
    expect(clearPendingDeviceLogin).toHaveBeenCalled();
  });

  it('cancels the saved key, clears it, and says only what it did', async () => {
    mockGetCredentials.mockReturnValue(creds);
    mockRemoveClaudeMcp.mockReturnValue(['gooseworks']);

    await logout();

    expect(mockRevokeKey).toHaveBeenCalledWith(creds);
    expect(mockClearCredentials).toHaveBeenCalled();
    expect(clearPendingDeviceLogin).toHaveBeenCalled();
    expect(said()).toEqual([
      'Signed out of GooseWorks (was u@example.com).',
      'Its key was cancelled, so any copy of it stops working too.',
      'Removed the GooseWorks connection from Claude Code.',
    ]);
  });

  it('says nothing about Claude Code when there was nothing of its own to remove', async () => {
    mockGetCredentials.mockReturnValue(creds);

    await logout();

    expect(mockRemoveClaudeMcp).toHaveBeenCalled();
    expect(said().some((line) => /Claude Code/.test(line))).toBe(false);
  });

  it('mentions connections set up by hand without touching them', async () => {
    mockGetCredentials.mockReturnValue(creds);
    mockOtherEntries.mockReturnValue(['gooseworks-staging']);

    await logout();

    expect(said()).toContain('Claude Code also has other GooseWorks connections that were set up by hand; remove them in Claude Code if you no longer need them.');
  });

  it('on staging never touches or mentions Claude Code', async () => {
    selectEnvironment('staging');
    mockGetCredentials.mockReturnValue({ ...creds, api_base: 'https://api.staging.gooseworks.ai' });

    await logout();

    expect(mockRemoveClaudeMcp).not.toHaveBeenCalled();
    expect(mockOtherEntries).not.toHaveBeenCalled();
    expect(said().some((line) => /Claude Code|MCP/.test(line))).toBe(false);
  });

  it('still clears the key when GooseWorks cannot be reached to cancel it', async () => {
    mockGetCredentials.mockReturnValue(creds);
    mockRevokeKey.mockResolvedValue('unreachable');

    await logout();

    expect(mockClearCredentials).toHaveBeenCalled();
    expect(loggerModule.warn).toHaveBeenCalledWith('Could not reach GooseWorks to cancel the old key; it was only removed from this computer.');
  });

  it('says nothing about cancelling on a server that cannot cancel keys yet', async () => {
    mockGetCredentials.mockReturnValue(creds);
    mockRevokeKey.mockResolvedValue('unsupported');

    await logout();

    expect(mockClearCredentials).toHaveBeenCalled();
    expect(loggerModule.warn).not.toHaveBeenCalled();
    expect(said().some((line) => /cancel/i.test(line))).toBe(false);
  });

  it('clears a saved sign-in that no longer matches this environment', async () => {
    mockGetCredentials.mockImplementation(() => {
      throw new Error('api connection does not match --env production. Sign in to that environment again.');
    });

    await logout();

    expect(mockRevokeKey).not.toHaveBeenCalled();
    expect(mockClearCredentials).toHaveBeenCalled();
    expect(loggerModule.success).toHaveBeenCalledWith('Cleared a saved GooseWorks sign-in that did not match this environment.');
  });
});
