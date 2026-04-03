import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs and os before importing the module
jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

// Set up homedir before importing credentials module
mockOs.homedir.mockReturnValue('/mock-home');

import {
  getCredentials,
  saveCredentials,
  clearCredentials,
  getApiKey,
  getApiBase,
  type Credentials,
} from '../../src/auth/credentials';

const CREDS_DIR = '/mock-home/.gooseworks';
const CREDS_FILE = '/mock-home/.gooseworks/credentials.json';

const validCreds: Credentials = {
  api_key: 'cal_test123456789',
  email: 'test@example.com',
  agent_id: 'agent-uuid-123',
  api_base: 'https://app.gooseworks.ai',
};

describe('credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
  });

  describe('getCredentials', () => {
    it('returns null when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getCredentials()).toBeNull();
    });

    it('returns credentials when file exists and is valid', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validCreds));
      expect(getCredentials()).toEqual(validCreds);
    });

    it('returns null when file has invalid JSON', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('not json');
      expect(getCredentials()).toBeNull();
    });

    it('returns null when required fields are missing', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ api_key: 'test' }));
      expect(getCredentials()).toBeNull();
    });

    it('returns null when readFileSync throws', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('permission denied');
      });
      expect(getCredentials()).toBeNull();
    });
  });

  describe('saveCredentials', () => {
    it('creates directory and writes file with correct permissions', () => {
      mockFs.existsSync.mockReturnValue(false);
      saveCredentials(validCreds);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(CREDS_DIR, {
        mode: 0o700,
        recursive: true,
      });
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        CREDS_FILE,
        JSON.stringify(validCreds, null, 2) + '\n',
        { mode: 0o600 }
      );
    });

    it('skips mkdir when directory already exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      saveCredentials(validCreds);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('clearCredentials', () => {
    it('deletes file when it exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      clearCredentials();
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(CREDS_FILE);
    });

    it('does nothing when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      clearCredentials();
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('does not throw when unlink fails', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('fail');
      });
      expect(() => clearCredentials()).not.toThrow();
    });
  });

  describe('getApiKey', () => {
    it('returns api_key when credentials exist', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validCreds));
      expect(getApiKey()).toBe('cal_test123456789');
    });

    it('returns null when no credentials', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getApiKey()).toBeNull();
    });
  });

  describe('getApiBase', () => {
    it('returns api_base from credentials', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(validCreds));
      expect(getApiBase()).toBe('https://app.gooseworks.ai');
    });

    it('returns default when no credentials', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getApiBase()).toBe('https://app.gooseworks.ai');
    });
  });
});
