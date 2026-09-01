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

    // Ownership is decided by the entry-skill registry + the `.gooseworks-version`
    // stamp, NOT by a name prefix (GOOSE-3191).
    it('returns entry skills and stamped skills with SKILL.md, and nothing else', () => {
      mockFs.existsSync.mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr === SKILLS_BASE) return true;
        // gooseworks: a known entry skill, has SKILL.md, no stamp needed.
        if (pathStr === `${SKILLS_BASE}/gooseworks/SKILL.md`) return true;
        // goose-graphics: not an entry skill, but stamped by `--with`.
        if (pathStr === `${SKILLS_BASE}/goose-graphics/SKILL.md`) return true;
        if (pathStr === `${SKILLS_BASE}/goose-graphics/.gooseworks-version`) return true;
        // goose-notours + other-skill: the user's own — unstamped.
        if (pathStr === `${SKILLS_BASE}/goose-notours/SKILL.md`) return true;
        if (pathStr === `${SKILLS_BASE}/other-skill/SKILL.md`) return true;
        return false;
      });
      mockFs.readdirSync.mockReturnValue([
        'gooseworks',
        'goose-graphics',
        'goose-notours',
        'other-skill',
        'readme.md',
      ] as any);

      const result = getInstalledSkills();
      expect(result).toEqual(['gooseworks', 'goose-graphics']);
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
    it('removes entry skills and stamped skills, and NEVER an unstamped stranger', () => {
      // Only goose-graphics carries our stamp; goose-notours + gooseworks-mine
      // are the user's own skills that merely share our naming (GOOSE-3191).
      mockFs.existsSync.mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr === SKILLS_BASE) return true;
        return pathStr === `${SKILLS_BASE}/goose-graphics/.gooseworks-version`;
      });
      mockFs.readdirSync.mockReturnValue([
        'gooseworks',
        'goose-ads',
        'goose-video',
        'goose-product-photos',
        'ads-remix',
        'goose-graphics',
        'goose-notours',
        'gooseworks-mine',
        'other-skill',
      ] as any);

      removeAllSkills();

      for (const removed of [
        'gooseworks',
        'goose-ads',
        'goose-video',
        'goose-product-photos',
        'ads-remix',
        'goose-graphics',
      ]) {
        expect(mockFs.rmSync).toHaveBeenCalledWith(
          `${SKILLS_BASE}/${removed}`,
          { recursive: true, force: true }
        );
      }
      for (const kept of ['goose-notours', 'gooseworks-mine', 'other-skill']) {
        expect(mockFs.rmSync).not.toHaveBeenCalledWith(
          `${SKILLS_BASE}/${kept}`,
          expect.anything()
        );
      }
    });

    it('does nothing when base dir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      removeAllSkills();
      expect(mockFs.readdirSync).not.toHaveBeenCalled();
    });
  });
});
