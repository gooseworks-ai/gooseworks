jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));

jest.mock('../../src/skills/installer', () => ({
  installMasterSkill: jest.fn(),
  removeAllSkills: jest.fn(),
}));

jest.mock('../../src/skills/master-skill', () => ({
  getMasterSkillContent: jest.fn().mockReturnValue('# master skill content'),
}));

jest.mock('../../src/agents/claude', () => ({
  configureClaude: jest.fn(),
}));

jest.mock('../../src/agents/claude-mcp', () => ({
  configureClaudeMcp: jest.fn().mockReturnValue(true),
}));

jest.mock('../../src/agents/codex', () => ({
  configureCodex: jest.fn(),
}));

jest.mock('../../src/agents/cursor', () => ({
  configureCursor: jest.fn(),
  hasExistingCursorMcpEntry: jest.fn(),
}));

jest.mock('../../src/agents/detect', () => ({
  isAgentInstalled: jest.fn(),
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

import { getCredentials } from '../../src/auth/credentials';
import { getMasterSkillContent } from '../../src/skills/master-skill';
import { configureClaude } from '../../src/agents/claude';
import { configureClaudeMcp } from '../../src/agents/claude-mcp';
import { configureCodex } from '../../src/agents/codex';
import { configureCursor, hasExistingCursorMcpEntry } from '../../src/agents/cursor';
import { isAgentInstalled } from '../../src/agents/detect';
import * as loggerModule from '../../src/utils/logger';
import { updateCommand } from '../../src/commands/update';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;
const mockGetMasterSkillContent = getMasterSkillContent as jest.MockedFunction<typeof getMasterSkillContent>;
const mockConfigureClaude = configureClaude as jest.MockedFunction<typeof configureClaude>;
const mockConfigureClaudeMcp = configureClaudeMcp as jest.MockedFunction<typeof configureClaudeMcp>;
const mockConfigureCodex = configureCodex as jest.MockedFunction<typeof configureCodex>;
const mockConfigureCursor = configureCursor as jest.MockedFunction<typeof configureCursor>;
const mockHasExistingCursorMcpEntry = hasExistingCursorMcpEntry as jest.MockedFunction<typeof hasExistingCursorMcpEntry>;
const mockIsAgentInstalled = isAgentInstalled as jest.MockedFunction<typeof isAgentInstalled>;

const baseCreds = {
  api_key: 'cal_test',
  email: 'u@example.com',
  agent_id: 'agent-123',
  api_base: 'https://app.gooseworks.ai',
};

describe('update command', () => {
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    mockConfigureCursor.mockReturnValue({
      globalPath: '/mock/cursor/config.json',
      projectPath: null,
      wroteMcp: true,
    });
  });

  afterEach(() => {
    processExitSpy.mockRestore();
  });

  it('exits when not logged in', async () => {
    mockGetCredentials.mockReturnValue(null);

    await expect(updateCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
    expect(mockConfigureClaude).not.toHaveBeenCalled();
  });

  it('calls getMasterSkillContent with no arguments', async () => {
    mockGetCredentials.mockReturnValue(baseCreds);
    mockIsAgentInstalled.mockReturnValue(false);

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockGetMasterSkillContent).toHaveBeenCalledWith();
  });

  it('reconfigures only Claude when only Claude is installed', async () => {
    mockGetCredentials.mockReturnValue(baseCreds);
    mockIsAgentInstalled.mockImplementation((type) => type === 'claude');

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockConfigureClaude).toHaveBeenCalled();
    expect(mockConfigureCodex).not.toHaveBeenCalled();
    expect(mockConfigureCursor).not.toHaveBeenCalled();
    expect(mockHasExistingCursorMcpEntry).not.toHaveBeenCalled();
  });

  it('reconfigures Codex when Codex is installed', async () => {
    mockGetCredentials.mockReturnValue(baseCreds);
    mockIsAgentInstalled.mockImplementation((type) => type === 'codex');

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockConfigureCodex).toHaveBeenCalled();
    expect(loggerModule.success).toHaveBeenCalledWith('Codex symlinks updated');
  });

  it('reconfigures Cursor MCP when existing gooseworks entry is present', async () => {
    mockGetCredentials.mockReturnValue(baseCreds);
    mockIsAgentInstalled.mockImplementation((type) => type === 'cursor');
    mockHasExistingCursorMcpEntry.mockReturnValue(true);

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockConfigureCursor).toHaveBeenCalledWith({ mcp: true });
    expect(loggerModule.success).toHaveBeenCalledWith('Cursor MCP config refreshed');
  });

  it('skips Cursor reconfiguration when no existing gooseworks entry', async () => {
    mockGetCredentials.mockReturnValue(baseCreds);
    mockIsAgentInstalled.mockImplementation((type) => type === 'cursor');
    mockHasExistingCursorMcpEntry.mockReturnValue(false);

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockConfigureCursor).not.toHaveBeenCalled();
    expect(loggerModule.info).toHaveBeenCalledWith(
      'Cursor installed but MCP was not previously configured — skipped'
    );
  });

  it('reconfigures all three agents when all are installed and Cursor has existing MCP entry', async () => {
    mockGetCredentials.mockReturnValue(baseCreds);
    mockIsAgentInstalled.mockReturnValue(true);
    mockHasExistingCursorMcpEntry.mockReturnValue(true);

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockConfigureClaude).toHaveBeenCalled();
    expect(mockConfigureCodex).toHaveBeenCalled();
    expect(mockConfigureCursor).toHaveBeenCalledWith({ mcp: true });
  });

  it('refreshes Claude MCP only when credentials include mcp_server_url', async () => {
    mockGetCredentials.mockReturnValue({ ...baseCreds, mcp_server_url: 'http://localhost:6200' });
    mockIsAgentInstalled.mockImplementation((type) => type === 'claude');

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockConfigureClaudeMcp).toHaveBeenCalled();
  });

  it('does not call configureClaudeMcp when credentials lack mcp_server_url', async () => {
    mockGetCredentials.mockReturnValue(baseCreds);
    mockIsAgentInstalled.mockImplementation((type) => type === 'claude');

    await updateCommand.parseAsync(['node', 'test']);

    expect(mockConfigureClaudeMcp).not.toHaveBeenCalled();
  });
});
