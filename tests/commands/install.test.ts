import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');
jest.mock('open', () => jest.fn().mockResolvedValue(undefined));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

// Mock the auth modules
jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  clearCredentials: jest.fn(),
  getApiKey: jest.fn(),
  getApiBase: jest.fn().mockReturnValue('https://app.gooseworks.ai'),
}));

jest.mock('../../src/auth/oauth-server', () => ({
  runOAuthFlow: jest.fn(),
}));

jest.mock('../../src/skills/installer', () => ({
  installMasterSkill: jest.fn(),
  removeAllSkills: jest.fn(),
  getInstalledSkills: jest.fn().mockReturnValue([]),
}));

jest.mock('../../src/skills/master-skill', () => ({
  getMasterSkillContent: jest.fn().mockReturnValue('# GooseWorks Master Skill'),
}));

jest.mock('../../src/agents/claude', () => ({
  configureClaude: jest.fn(),
}));

jest.mock('../../src/agents/cursor', () => ({
  configureCursor: jest.fn(),
}));

jest.mock('../../src/agents/detect', () => ({
  detectAgents: jest.fn().mockReturnValue([]),
}));

// Mock logger to suppress output in tests
jest.mock('../../src/utils/logger', () => ({
  banner: jest.fn(),
  step: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  spinner: jest.fn().mockReturnValue({ stop: jest.fn(), succeed: jest.fn(), fail: jest.fn() }),
  done: jest.fn(),
}));

import { getCredentials } from '../../src/auth/credentials';
import { runOAuthFlow } from '../../src/auth/oauth-server';
import { installMasterSkill } from '../../src/skills/installer';
import { getMasterSkillContent } from '../../src/skills/master-skill';
import { configureClaude } from '../../src/agents/claude';
import * as loggerModule from '../../src/utils/logger';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;
const mockRunOAuthFlow = runOAuthFlow as jest.MockedFunction<typeof runOAuthFlow>;
const mockInstallMasterSkill = installMasterSkill as jest.MockedFunction<typeof installMasterSkill>;
const mockGetMasterSkillContent = getMasterSkillContent as jest.MockedFunction<typeof getMasterSkillContent>;
const mockConfigureClaude = configureClaude as jest.MockedFunction<typeof configureClaude>;

const mockCreds = {
  api_key: 'cal_test123',
  email: 'test@example.com',
  agent_id: 'agent-123',
  api_base: 'https://app.gooseworks.ai',
};

describe('install command', () => {
  let mockProcessExit: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    // Default: existsSync returns false for most paths
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue([] as any);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.symlinkSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    mockProcessExit.mockRestore();
  });

  it('exits when no agent flag is provided', async () => {
    const { installCommand } = await import('../../src/commands/install');

    await expect(
      installCommand.parseAsync(['node', 'test'])
    ).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(
      'No agent specified. Use --claude, --cursor, or --all'
    );
  });

  it('uses existing credentials when already logged in', async () => {
    mockGetCredentials.mockReturnValue(mockCreds);

    const { installCommand } = await import('../../src/commands/install');

    await installCommand.parseAsync(['node', 'test', '--claude']);

    // Should NOT call OAuth
    expect(mockRunOAuthFlow).not.toHaveBeenCalled();
    // Should install master skill
    expect(mockGetMasterSkillContent).toHaveBeenCalledWith('https://app.gooseworks.ai');
    expect(mockInstallMasterSkill).toHaveBeenCalledWith('# GooseWorks Master Skill');
    // Should report success
    expect(loggerModule.success).toHaveBeenCalledWith(
      expect.stringContaining('Logged in as test@example.com')
    );
  });

  it('configures Claude when --claude flag is used', async () => {
    mockGetCredentials.mockReturnValue(mockCreds);

    const { installCommand } = await import('../../src/commands/install');

    await installCommand.parseAsync(['node', 'test', '--claude']);

    expect(mockConfigureClaude).toHaveBeenCalled();
    expect(loggerModule.success).toHaveBeenCalledWith('Claude Code configured');
  });

  it('installs master skill with correct api_base', async () => {
    const customCreds = { ...mockCreds, api_base: 'http://localhost:5999' };
    mockGetCredentials.mockReturnValue(customCreds);

    const { installCommand } = await import('../../src/commands/install');

    await installCommand.parseAsync(['node', 'test', '--claude']);

    expect(mockGetMasterSkillContent).toHaveBeenCalledWith('http://localhost:5999');
  });

  it('shows done message with agent name', async () => {
    mockGetCredentials.mockReturnValue(mockCreds);

    const { installCommand } = await import('../../src/commands/install');

    await installCommand.parseAsync(['node', 'test', '--claude']);

    expect(loggerModule.done).toHaveBeenCalledWith(
      expect.stringContaining('Claude Code')
    );
  });
});
