import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

import {
  installMasterSkill,
  installStandaloneSkill,
  getInstalledSkills,
  removeAllSkills,
  getSkillsBasePath,
} from '../../src/skills/installer';

const SKILLS_BASE = '/mock-home/.agents/skills';

describe('skills/installer', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getSkillsBasePath', () => {
    it('returns ~/.agents/skills', () => {
      expect(getSkillsBasePath()).toBe(SKILLS_BASE);
    });
  });

  describe('installMasterSkill', () => {
    it('creates master skill directory and writes SKILL.md', () => {
      installMasterSkill('# GooseWorks Master');

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/gooseworks`,
        { recursive: true }
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/gooseworks/SKILL.md`,
        '# GooseWorks Master',
        'utf-8'
      );
    });
  });

  describe('getInstalledSkills', () => {
    it('returns empty array when base dir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(getInstalledSkills()).toEqual([]);
    });

    it('returns only gooseworks- prefixed dirs with SKILL.md', () => {
      mockFs.existsSync.mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr === SKILLS_BASE) return true;
        if (pathStr.includes('gooseworks-twitter') && pathStr.includes('SKILL.md')) return true;
        if (pathStr.includes('gooseworks-reddit') && pathStr.includes('SKILL.md')) return true;
        if (pathStr.includes('other-skill') && pathStr.includes('SKILL.md')) return false;
        return false;
      });
      mockFs.readdirSync.mockReturnValue([
        'gooseworks-twitter-scraper',
        'gooseworks-reddit-scraper',
        'other-skill',
        'readme.md',
      ] as any);

      const result = getInstalledSkills();
      expect(result).toEqual([
        'gooseworks-twitter-scraper',
        'gooseworks-reddit-scraper',
      ]);
    });
  });

  describe('installStandaloneSkill', () => {
    it('downloads every file into a staging dir then atomically renames it into place', async () => {
      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const value = String(url);
        if (value.includes('/git/trees/main?recursive=1')) {
          return {
            ok: true,
            json: async () => ({
              tree: [
                { path: 'skills/composites/goose-graphics/SKILL.md', type: 'blob' },
                { path: 'skills/composites/goose-graphics/scripts/render.py', type: 'blob' },
                { path: 'skills/composites/goose-aeo/SKILL.md', type: 'blob' },
              ],
            }),
          } as any;
        }
        const body = value.endsWith('/SKILL.md') ? '# Graphics' : 'print("hi")';
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from(body, 'utf-8').buffer,
        } as any;
      }) as any;

      await installStandaloneSkill('goose-graphics');

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/.goose-graphics.installing/SKILL.md`,
        expect.any(Buffer)
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/.goose-graphics.installing/scripts/render.py`,
        expect.any(Buffer)
      );
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/.goose-graphics.installing/scripts`,
        { recursive: true }
      );
      expect(mockFs.rmSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/goose-graphics`,
        { recursive: true, force: true }
      );
      expect(mockFs.renameSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/.goose-graphics.installing`,
        `${SKILLS_BASE}/goose-graphics`
      );
    });

    it('cleans up the staging dir and leaves the existing target untouched on download failure', async () => {
      let rawCalls = 0;
      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const value = String(url);
        if (value.includes('/git/trees/main?recursive=1')) {
          return {
            ok: true,
            json: async () => ({
              tree: [
                { path: 'skills/composites/goose-graphics/SKILL.md', type: 'blob' },
                { path: 'skills/composites/goose-graphics/scripts/render.py', type: 'blob' },
              ],
            }),
          } as any;
        }
        rawCalls++;
        if (rawCalls === 2) {
          return { ok: false, status: 500 } as any;
        }
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from('x', 'utf-8').buffer,
        } as any;
      }) as any;

      await expect(installStandaloneSkill('goose-graphics')).rejects.toThrow(/could not download/);

      expect(mockFs.rmSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/.goose-graphics.installing`,
        { recursive: true, force: true }
      );
      expect(mockFs.renameSync).not.toHaveBeenCalled();
      expect(mockFs.rmSync).not.toHaveBeenCalledWith(
        `${SKILLS_BASE}/goose-graphics`,
        expect.anything()
      );
    });

    it('surfaces a friendly error when GitHub rate-limits the tree request', async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 5 * 60;
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 403,
        headers: {
          get: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === 'x-ratelimit-remaining') return '0';
            if (lower === 'x-ratelimit-reset') return String(resetEpoch);
            return null;
          },
        },
      })) as any;

      await expect(installStandaloneSkill('goose-graphics')).rejects.toThrow(/rate-limited/);
      await expect(installStandaloneSkill('goose-graphics')).rejects.toThrow(/Try again in about/);
    });

    it('throws a clear not-found error listing available skills', async () => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({
          tree: [
            { path: 'skills/composites/goose-graphics/SKILL.md', type: 'blob' },
            { path: 'skills/composites/goose-aeo/SKILL.md', type: 'blob' },
          ],
        }),
      })) as any;

      await expect(installStandaloneSkill('goose-grphics')).rejects.toThrow(
        "skill 'goose-grphics' not found. Available: goose-aeo, goose-graphics"
      );
    });

    it('reports progress while downloading standalone skill files', async () => {
      global.fetch = jest.fn(async (url: string | URL | Request) => {
        const value = String(url);
        if (value.includes('/git/trees/main?recursive=1')) {
          return {
            ok: true,
            json: async () => ({
              tree: [
                { path: 'skills/composites/goose-graphics/SKILL.md', type: 'blob' },
                { path: 'skills/composites/goose-graphics/styles/index.json', type: 'blob' },
              ],
            }),
          } as any;
        }
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from('{}', 'utf-8').buffer,
        } as any;
      }) as any;
      const onProgress = jest.fn();

      await installStandaloneSkill('goose-graphics', { onProgress });

      expect(onProgress).toHaveBeenCalledWith({ downloaded: 1, total: 2 });
      expect(onProgress).toHaveBeenCalledWith({ downloaded: 2, total: 2 });
    });
  });

  describe('removeAllSkills', () => {
    it('removes managed GooseWorks directories', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'gooseworks',
        'gooseworks-twitter-scraper',
        'goose-graphics',
        'other-skill',
      ] as any);

      removeAllSkills();

      expect(mockFs.rmSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/gooseworks`,
        { recursive: true, force: true }
      );
      expect(mockFs.rmSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/gooseworks-twitter-scraper`,
        { recursive: true, force: true }
      );
      expect(mockFs.rmSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/goose-graphics`,
        { recursive: true, force: true }
      );
      expect(mockFs.rmSync).not.toHaveBeenCalledWith(
        `${SKILLS_BASE}/other-skill`,
        expect.anything()
      );
    });

    it('does nothing when base dir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      removeAllSkills();
      expect(mockFs.readdirSync).not.toHaveBeenCalled();
    });
  });
});
