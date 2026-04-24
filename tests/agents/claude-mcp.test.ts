import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));

import { getCredentials } from '../../src/auth/credentials';
import { configureClaudeMcp, removeClaudeMcp } from '../../src/agents/claude-mcp';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;
const CONFIG_PATH = '/mock-home/.claude.json';

const baseCreds = {
  api_key: 'cal_test',
  email: 'u@example.com',
  agent_id: 'agent-1',
  api_base: 'https://app.gooseworks.ai',
  mcp_server_url: 'http://localhost:6200',
};

describe('agents/claude-mcp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
  });

  describe('configureClaudeMcp', () => {
    it('returns false when no credentials', () => {
      mockGetCredentials.mockReturnValue(null);
      expect(configureClaudeMcp()).toBe(false);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('returns false when credentials lack mcp_server_url', () => {
      mockGetCredentials.mockReturnValue({ ...baseCreds, mcp_server_url: undefined });
      expect(configureClaudeMcp()).toBe(false);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('writes gooseworks entry preserving existing keys', () => {
      mockGetCredentials.mockReturnValue(baseCreds);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        someOtherKey: 'preserved',
        mcpServers: {
          otherServer: { type: 'http', url: 'http://other' },
        },
      }));

      expect(configureClaudeMcp()).toBe(true);

      const writeCall = mockFs.writeFileSync.mock.calls.find((c) => c[0] === CONFIG_PATH);
      expect(writeCall).toBeDefined();
      const written = JSON.parse(String(writeCall![1]).trim());
      expect(written.someOtherKey).toBe('preserved');
      expect(written.mcpServers.otherServer).toEqual({ type: 'http', url: 'http://other' });
      expect(written.mcpServers.gooseworks).toEqual({
        type: 'http',
        url: 'http://localhost:6200/mcp',
        headers: { Authorization: 'Bearer cal_test' },
      });
    });

    it('strips legacy gooseworks-files entry', () => {
      mockGetCredentials.mockReturnValue(baseCreds);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: {
          'gooseworks-files': { type: 'http', url: 'http://legacy' },
        },
      }));

      configureClaudeMcp();

      const writeCall = mockFs.writeFileSync.mock.calls.find((c) => c[0] === CONFIG_PATH);
      const written = JSON.parse(String(writeCall![1]).trim());
      expect(written.mcpServers['gooseworks-files']).toBeUndefined();
      expect(written.mcpServers.gooseworks).toBeDefined();
    });

    it('normalizes mcp_server_url already ending in /mcp', () => {
      mockGetCredentials.mockReturnValue({ ...baseCreds, mcp_server_url: 'http://example.com/mcp' });
      mockFs.existsSync.mockReturnValue(false);

      configureClaudeMcp();

      const writeCall = mockFs.writeFileSync.mock.calls.find((c) => c[0] === CONFIG_PATH);
      const written = JSON.parse(String(writeCall![1]).trim());
      expect(written.mcpServers.gooseworks.url).toBe('http://example.com/mcp');
    });

    it('handles missing config file by writing fresh JSON', () => {
      mockGetCredentials.mockReturnValue(baseCreds);
      mockFs.existsSync.mockReturnValue(false);

      expect(configureClaudeMcp()).toBe(true);

      const writeCall = mockFs.writeFileSync.mock.calls.find((c) => c[0] === CONFIG_PATH);
      expect(writeCall).toBeDefined();
      const written = JSON.parse(String(writeCall![1]).trim());
      expect(written.mcpServers.gooseworks).toBeDefined();
    });
  });

  describe('removeClaudeMcp', () => {
    it('does nothing when config file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      removeClaudeMcp();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('deletes both gooseworks and legacy gooseworks-files entries', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: {
          gooseworks: { type: 'http' },
          'gooseworks-files': { type: 'http' },
          other: { type: 'http' },
        },
      }));

      removeClaudeMcp();

      const writeCall = mockFs.writeFileSync.mock.calls.find((c) => c[0] === CONFIG_PATH);
      const written = JSON.parse(String(writeCall![1]).trim());
      expect(written.mcpServers.gooseworks).toBeUndefined();
      expect(written.mcpServers['gooseworks-files']).toBeUndefined();
      expect(written.mcpServers.other).toBeDefined();
    });

    it('does not write when there is nothing to remove', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: { other: {} },
      }));

      removeClaudeMcp();

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
