import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');
// claude.ts now links via skill-links.ts, which imports logger (→ ESM chalk).
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

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

import { configureClaude, removeClaude, getClaudeSkillsDir } from '../../src/agents/claude';

const SKILLS_BASE = '/mock-home/.agents/skills';
const CLAUDE_SKILLS = '/mock-home/.claude/skills';

describe('agents/claude', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
  });

  describe('configureClaude', () => {
    it('returns 0 when skills base does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(configureClaude()).toBe(0);
      expect(mockFs.symlinkSync).not.toHaveBeenCalled();
    });

    // GOOSE-3191: "managed" = a known entry-skill slug, or a dir carrying our
    // `.gooseworks-version` stamp. A same-prefix stranger is NOT linked.
    it('symlinks managed GooseWorks entries, skipping unrelated dirs', () => {
      mockFs.existsSync.mockImplementation(
        (p) => p === SKILLS_BASE || p === `${SKILLS_BASE}/goose-graphics/.gooseworks-version`,
      );
      mockFs.readdirSync.mockImplementation((dir) => {
        if (dir === SKILLS_BASE) {
          return ['gooseworks', 'goose-ads', 'goose-graphics', 'goose-notours', 'unrelated-dir'] as any;
        }
        if (dir === CLAUDE_SKILLS) {
          return [] as any;
        }
        return [] as any;
      });

      const count = configureClaude();

      expect(count).toBe(3);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(CLAUDE_SKILLS, { recursive: true });
      const symlinkCalls = mockFs.symlinkSync.mock.calls;
      expect(symlinkCalls).toHaveLength(3);
      const targets = symlinkCalls.map((c) => c[1]);
      expect(targets).toContain(`${CLAUDE_SKILLS}/gooseworks`);
      expect(targets).toContain(`${CLAUDE_SKILLS}/goose-ads`);
      expect(targets).toContain(`${CLAUDE_SKILLS}/goose-graphics`);
      expect(targets).not.toContain(`${CLAUDE_SKILLS}/goose-notours`);
      expect(targets).not.toContain(`${CLAUDE_SKILLS}/unrelated-dir`);
    });

    it('cleans up pre-existing managed symlinks before re-linking', () => {
      mockFs.existsSync.mockImplementation(
        (p) => p === SKILLS_BASE || p === `${SKILLS_BASE}/goose-graphics/.gooseworks-version`,
      );
      mockFs.readdirSync.mockImplementation((dir) => {
        if (dir === SKILLS_BASE) return ['gooseworks'] as any;
        if (dir === CLAUDE_SKILLS) return ['gooseworks', 'goose-ads', 'goose-graphics', 'goose-notours', 'other-symlink'] as any;
        return [] as any;
      });
      mockFs.lstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);

      configureClaude();

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CLAUDE_SKILLS}/gooseworks`);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CLAUDE_SKILLS}/goose-ads`);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CLAUDE_SKILLS}/goose-graphics`);
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${CLAUDE_SKILLS}/goose-notours`);
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${CLAUDE_SKILLS}/other-symlink`);
    });
  });

  describe('removeClaude', () => {
    it('does nothing when claude skills dir does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      removeClaude();
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    it('unlinks only symlinked managed entries', () => {
      mockFs.existsSync.mockImplementation(
        (p) => !String(p).endsWith('.gooseworks-version') || String(p).includes('/goose-graphics/'),
      );
      mockFs.readdirSync.mockReturnValue(['gooseworks', 'goose-ads', 'goose-graphics', 'goose-notours', 'other'] as any);
      mockFs.lstatSync.mockImplementation((p) => ({
        isSymbolicLink: () => String(p).includes('goose'),
      }) as any);

      removeClaude();

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CLAUDE_SKILLS}/gooseworks`);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CLAUDE_SKILLS}/goose-ads`);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CLAUDE_SKILLS}/goose-graphics`);
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${CLAUDE_SKILLS}/goose-notours`);
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${CLAUDE_SKILLS}/other`);
    });
  });

  describe('getClaudeSkillsDir', () => {
    it('returns the Claude skills dir path', () => {
      expect(getClaudeSkillsDir()).toBe(CLAUDE_SKILLS);
    });
  });
});
