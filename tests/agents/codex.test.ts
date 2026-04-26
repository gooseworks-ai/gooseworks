import * as fs from 'fs';
import * as os from 'os';

jest.mock('fs');
jest.mock('os');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

mockOs.homedir.mockReturnValue('/mock-home');

import { configureCodex, removeCodex, getCodexSkillsDir } from '../../src/agents/codex';

const SKILLS_BASE = '/mock-home/.agents/skills';
const CODEX_SKILLS = '/mock-home/.codex/skills';

describe('agents/codex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/mock-home');
  });

  it('returns 0 when skills base does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(configureCodex()).toBe(0);
  });

  it('symlinks managed GooseWorks entries into ~/.codex/skills/', () => {
    mockFs.existsSync.mockImplementation((p) => p === SKILLS_BASE);
    mockFs.readdirSync.mockImplementation((dir) => {
      if (dir === SKILLS_BASE) return ['gooseworks', 'gooseworks-reddit', 'goose-graphics', 'other'] as any;
      if (dir === CODEX_SKILLS) return [] as any;
      return [] as any;
    });

    const count = configureCodex();

    expect(count).toBe(3);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(CODEX_SKILLS, { recursive: true });
    const targets = mockFs.symlinkSync.mock.calls.map((c) => c[1]);
    expect(targets).toContain(`${CODEX_SKILLS}/gooseworks`);
    expect(targets).toContain(`${CODEX_SKILLS}/gooseworks-reddit`);
    expect(targets).toContain(`${CODEX_SKILLS}/goose-graphics`);
    expect(targets).not.toContain(`${CODEX_SKILLS}/other`);
  });

  it('removes existing managed symlinks before re-linking', () => {
    mockFs.existsSync.mockImplementation((p) => p === SKILLS_BASE);
    mockFs.readdirSync.mockImplementation((dir) => {
      if (dir === SKILLS_BASE) return ['gooseworks'] as any;
      if (dir === CODEX_SKILLS) return ['gooseworks', 'gooseworks-stale', 'goose-graphics'] as any;
      return [] as any;
    });
    mockFs.lstatSync.mockReturnValue({ isSymbolicLink: () => true } as any);

    configureCodex();

    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/gooseworks`);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/gooseworks-stale`);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/goose-graphics`);
  });

  it('removeCodex unlinks only managed symlinks', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue(['gooseworks', 'goose-graphics', 'other'] as any);
    mockFs.lstatSync.mockImplementation((p) => ({
      isSymbolicLink: () => String(p).includes('goose'),
    }) as any);

    removeCodex();

    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/gooseworks`);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${CODEX_SKILLS}/goose-graphics`);
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
});
