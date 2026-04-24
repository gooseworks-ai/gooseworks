import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

jest.mock('../../src/auth/credentials', () => ({
  getApiKey: jest.fn(),
  getCredentials: jest.fn(),
}));

import { getApiKey, getCredentials } from '../../src/auth/credentials';
import {
  configureCursor,
  removeCursor,
  hasExistingCursorMcpEntry,
} from '../../src/agents/cursor';

const mockGetApiKey = getApiKey as jest.MockedFunction<typeof getApiKey>;
const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;

// On darwin, globalStorage lives under Library/Application Support
const ORIGINAL_PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform');
function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform });
}

const baseCreds = {
  api_key: 'cal_test',
  email: 'u@example.com',
  agent_id: 'agent-1',
  api_base: 'https://app.gooseworks.ai',
  mcp_server_url: 'http://localhost:6200',
};

describe('agents/cursor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
    mockGetApiKey.mockReturnValue('cal_test');
    setPlatform('darwin');
  });

  afterAll(() => {
    if (ORIGINAL_PLATFORM) {
      Object.defineProperty(process, 'platform', ORIGINAL_PLATFORM);
    }
  });

  describe('configureCursor', () => {
    it('returns wroteMcp=false when mcp flag is false', () => {
      mockGetCredentials.mockReturnValue(baseCreds);
      mockFs.existsSync.mockReturnValue(false);

      const result = configureCursor({ mcp: false });

      expect(result.wroteMcp).toBe(false);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('returns wroteMcp=false when credentials lack mcp_server_url', () => {
      mockGetCredentials.mockReturnValue({ ...baseCreds, mcp_server_url: undefined });
      mockFs.existsSync.mockReturnValue(false);

      const result = configureCursor({ mcp: true });

      expect(result.wroteMcp).toBe(false);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('writes gooseworks MCP entry to global config on mcp=true', () => {
      mockGetCredentials.mockReturnValue(baseCreds);
      mockFs.existsSync.mockImplementation(() => false);

      const result = configureCursor({ mcp: true });

      expect(result.wroteMcp).toBe(true);
      const writeCall = mockFs.writeFileSync.mock.calls.find((c) =>
        String(c[0]).endsWith(path.join('cursor.mcp', 'config.json'))
      );
      expect(writeCall).toBeDefined();
      const written = JSON.parse(String(writeCall![1]).trim());
      expect(written.mcpServers.gooseworks).toEqual({
        type: 'http',
        url: 'http://localhost:6200/mcp',
        headers: { Authorization: 'Bearer cal_test' },
      });
    });

    it('normalizes mcp_server_url with trailing slash', () => {
      mockGetCredentials.mockReturnValue({ ...baseCreds, mcp_server_url: 'http://example.com/' });
      mockFs.existsSync.mockReturnValue(false);

      configureCursor({ mcp: true });

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const written = JSON.parse(String(writeCall[1]).trim());
      expect(written.mcpServers.gooseworks.url).toBe('http://example.com/mcp');
    });

    it('strips legacy gooseworks-files entry while writing gooseworks', () => {
      mockGetCredentials.mockReturnValue(baseCreds);
      mockFs.existsSync.mockImplementation((p) =>
        String(p).endsWith(path.join('cursor.mcp', 'config.json'))
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: {
          'gooseworks-files': { type: 'http' },
          other: { type: 'http' },
        },
      }));

      configureCursor({ mcp: true });

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const written = JSON.parse(String(writeCall[1]).trim());
      expect(written.mcpServers['gooseworks-files']).toBeUndefined();
      expect(written.mcpServers.other).toBeDefined();
      expect(written.mcpServers.gooseworks).toBeDefined();
    });
  });

  describe('hasExistingCursorMcpEntry', () => {
    it('returns false when no config exists', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(hasExistingCursorMcpEntry()).toBe(false);
    });

    it('returns true when global config has gooseworks entry', () => {
      mockFs.existsSync.mockImplementation((p) =>
        String(p).endsWith(path.join('cursor.mcp', 'config.json'))
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: { gooseworks: { type: 'http' } },
      }));

      expect(hasExistingCursorMcpEntry()).toBe(true);
    });

    it('returns true for legacy gooseworks-files entry', () => {
      mockFs.existsSync.mockImplementation((p) =>
        String(p).endsWith(path.join('cursor.mcp', 'config.json'))
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: { 'gooseworks-files': { type: 'http' } },
      }));

      expect(hasExistingCursorMcpEntry()).toBe(true);
    });

    it('returns false when config has unrelated entries only', () => {
      mockFs.existsSync.mockImplementation((p) =>
        String(p).endsWith(path.join('cursor.mcp', 'config.json'))
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: { other: { type: 'http' } },
      }));

      expect(hasExistingCursorMcpEntry()).toBe(false);
    });

    it('returns false when config JSON is corrupt', () => {
      mockFs.existsSync.mockImplementation((p) =>
        String(p).endsWith(path.join('cursor.mcp', 'config.json'))
      );
      mockFs.readFileSync.mockReturnValue('{broken');

      expect(hasExistingCursorMcpEntry()).toBe(false);
    });
  });

  describe('removeCursor', () => {
    it('deletes gooseworks and legacy gooseworks-files keys when present', () => {
      mockFs.existsSync.mockImplementation((p) =>
        String(p).endsWith(path.join('cursor.mcp', 'config.json'))
      );
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        mcpServers: {
          gooseworks: { type: 'http' },
          'gooseworks-files': { type: 'http' },
          keep: { type: 'http' },
        },
      }));
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      removeCursor();

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const written = JSON.parse(String(writeCall[1]).trim());
      expect(written.mcpServers.gooseworks).toBeUndefined();
      expect(written.mcpServers['gooseworks-files']).toBeUndefined();
      expect(written.mcpServers.keep).toBeDefined();
    });

    it('does nothing when no config file exists', () => {
      mockFs.existsSync.mockReturnValue(false);
      removeCursor();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
