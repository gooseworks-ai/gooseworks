import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');
// codex.ts now links via skill-links.ts, which imports logger (→ ESM chalk).
// Factory mock so the real chalk-importing module is never loaded.
jest.mock('../../src/utils/logger', () => ({
  banner: jest.fn(),
  step: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  example: jest.fn(),
  spinner: jest.fn(),
  done: jest.fn(),
}));
jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

import { getCredentials } from '../../src/auth/credentials';
import { configureCodex, configureCodexMcp, removeCodex, getCodexSkillsDir } from '../../src/agents/codex';

const SKILLS_BASE = '/mock-home/.agents/skills';
const CODEX_SKILLS = '/mock-home/.codex/skills';
const CODEX_CONFIG = '/mock-home/.codex/config.toml';
const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;

describe('agents/codex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.mkdirSync.mockReturnValue(undefined);
  });

  it('returns 0 when skills base does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(configureCodex()).toBe(0);
  });

  it('symlinks managed GooseWorks entries into ~/.codex/skills/', () => {
    mockFs.existsSync.mockImplementation(
      (p) => p === SKILLS_BASE || p === `${SKILLS_BASE}/goose-graphics/.gooseworks-version`,
    );
    mockFs.readdirSync.mockImplementation((dir) => {
      if (dir === SKILLS_BASE) return ['gooseworks', 'goose-ads', 'goose-graphics', 'goose-notours', 'other'] as any;
      if (dir === CODEX_SKILLS) return [] as any;
      return [] as any;
    });

    const count = configureCodex();

    expect(count).toBe(3);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(CODEX_SKILLS, { recursive: true });
    const targets = mockFs.symlinkSync.mock.calls.map((c) => c[1]);
    expect(targets).toContain(`${CODEX_SKILLS}/gooseworks`);
    expect(targets).toContain(`${CODEX_SKILLS}/goose-ads`);
    expect(targets).toContain(`${CODEX_SKILLS}/goose-graphics`);
    expect(targets).not.toContain(`${CODEX_SKILLS}/goose-notours`);
    expect(targets).not.toContain(`${CODEX_SKILLS}/other`);
  });

  it('removes existing managed symlinks before re-linking', () => {
    mockFs.existsSync.mockImplementation(
      (p) => p === SKILLS_BASE || p === `${SKILLS_BASE}/goose-graphics/.gooseworks-version`,
    );
    mockFs.readdirSync.mockImplementation((dir) => {
      if (dir === SKILLS_BASE) return ['gooseworks'] as any;
      if (dir === CODEX_SKILLS) return ['gooseworks', 'goose-video', 'goose-graphics', 'goose-notours'] as any;
      return [] as any;
    });
    mockFs.lstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);

    configureCodex();

    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/gooseworks`);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/goose-video`);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/goose-graphics`);
    expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${CODEX_SKILLS}/goose-notours`);
  });

  it('removeCodex unlinks only managed symlinks', () => {
    mockFs.existsSync.mockImplementation(
      (p) => !String(p).endsWith('.gooseworks-version') || String(p).includes('/goose-graphics/'),
    );
    mockFs.readdirSync.mockReturnValue(['gooseworks', 'goose-graphics', 'goose-notours', 'other'] as any);
    mockFs.lstatSync.mockImplementation((p) => ({
      isSymbolicLink: () => String(p).includes('goose'),
    }) as any);

    removeCodex();

    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/gooseworks`);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/goose-graphics`);
    expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${CODEX_SKILLS}/goose-notours`);
    expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${CODEX_SKILLS}/other`);
  });

  it('removeCodex does nothing when dir is missing', () => {
    mockFs.existsSync.mockReturnValue(false);
    removeCodex();
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('getCodexSkillsDir returns the codex path', () => {
    expect(getCodexSkillsDir()).toBe(CODEX_SKILLS);
  });

  it('configureCodexMcp writes the GooseWorks MCP entry to config.toml', () => {
    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'test@example.com',
      agent_id: 'agent-123',
      api_base: 'https://app.gooseworks.ai',
      mcp_server_url: 'http://localhost:6200',
    });
    mockFs.existsSync.mockImplementation((p) => p === CODEX_CONFIG);
    mockFs.readFileSync.mockReturnValue([
      'model = "gpt-5.5"',
      '',
      '[mcp_servers.node_repl]',
      'command = "node_repl"',
      '',
    ].join('\n') as any);

    expect(configureCodexMcp()).toBe(true);

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/mock-home/.codex', { recursive: true });
    const [, content, options] = mockFs.writeFileSync.mock.calls[0];
    expect(content).toContain('[mcp_servers.node_repl]');
    expect(content).toContain('[mcp_servers.gooseworks]');
    expect(content).toContain('url = "http://localhost:6200/mcp"');
    expect(content).toContain('http_headers = { Authorization = "Bearer cal_test" }');
    expect(options).toEqual({ mode: 0o600 });
  });

  it('configureCodexMcp replaces an existing GooseWorks MCP entry', () => {
    mockGetCredentials.mockReturnValue({
      api_key: 'cal_new',
      email: 'test@example.com',
      agent_id: 'agent-123',
      api_base: 'https://app.gooseworks.ai',
      mcp_server_url: 'http://localhost:6200/mcp',
    });
    mockFs.existsSync.mockImplementation((p) => p === CODEX_CONFIG);
    mockFs.readFileSync.mockReturnValue([
      'model = "gpt-5.5"',
      '',
      '[mcp_servers.gooseworks]',
      'url = "http://old.example/mcp"',
      'http_headers = { Authorization = "Bearer old" }',
      '',
      '[mcp_servers.gooseworks.tools.old_tool]',
      'approval_mode = "prompt"',
      '',
      '[projects."/repo"]',
      'trust_level = "trusted"',
      '',
    ].join('\n') as any);

    configureCodexMcp();

    const content = mockFs.writeFileSync.mock.calls[0][1] as string;
    expect(content).not.toContain('old.example');
    expect(content).not.toContain('old_tool');
    expect(content).toContain('[projects."/repo"]');
    expect(content).toContain('url = "http://localhost:6200/mcp"');
    expect(content).toContain('http_headers = { Authorization = "Bearer cal_new" }');
  });

  it('configureCodexMcp returns false when MCP credentials are missing', () => {
    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'test@example.com',
      agent_id: 'agent-123',
      api_base: 'https://app.gooseworks.ai',
    });

    expect(configureCodexMcp()).toBe(false);
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });
});
