import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

import {
  installMasterSkill,
  getInstalledSkills,
  removeAllSkills,
  getSkillsBasePath,
} from '../../src/skills/installer';

const SKILLS_BASE = '/mock-home/.agents/skills';

describe('skills/installer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
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
        `${SKILLS_BASE}/gooseworks-master`,
        { recursive: true }
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/gooseworks-master/SKILL.md`,
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

  describe('removeAllSkills', () => {
    it('removes only gooseworks- prefixed directories', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'gooseworks-twitter-scraper',
        'gooseworks-master',
        'other-skill',
      ] as any);

      removeAllSkills();

      expect(mockFs.rmSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/gooseworks-twitter-scraper`,
        { recursive: true, force: true }
      );
      expect(mockFs.rmSync).toHaveBeenCalledWith(
        `${SKILLS_BASE}/gooseworks-master`,
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
