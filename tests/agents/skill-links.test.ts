import * as fs from 'fs';

jest.mock('fs');
// Factory mock (not auto-mock): logger imports ESM-only chalk, which ts-jest
// can't parse, so we must not load the real module.
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

import { syncManagedSkillLinks, removeManagedSkillLinks } from '../../src/agents/skill-links';
import * as logger from '../../src/utils/logger';

const mockFs = fs as jest.Mocked<typeof fs>;
const mockLogger = logger as jest.Mocked<typeof logger>;

const BASE = '/mock-home/.agents/skills';
const DIR = '/mock-home/.claude/skills';

/** readdirSync returns different lists for the source base vs the target dir. */
function readdir(base: string[], dir: string[]) {
  mockFs.readdirSync.mockImplementation((p: any) => {
    if (p === BASE) return base as any;
    if (p === DIR) return dir as any;
    return [] as any;
  });
}

describe('agents/skill-links (GOOSE-2418)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: nothing is an existing link, nothing resolves anywhere.
    mockFs.readlinkSync.mockImplementation(() => {
      throw new Error('EINVAL');
    });
    mockFs.realpathSync.mockImplementation(((p: any) => p) as any);
    mockFs.existsSync.mockReturnValue(true);
  });

  describe('syncManagedSkillLinks', () => {
    it('links managed skills (dir symlink off-Windows) and skips unrelated dirs', () => {
      readdir(['gooseworks', 'goose-graphics', 'unrelated-dir'], []);

      const { linked, failed } = syncManagedSkillLinks(BASE, DIR);

      expect(linked).toBe(2);
      expect(failed).toBe(0);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(DIR, { recursive: true });
      const targets = mockFs.symlinkSync.mock.calls.map((c) => c[1]);
      expect(targets).toEqual(
        expect.arrayContaining([`${DIR}/gooseworks`, `${DIR}/goose-graphics`]),
      );
      expect(targets).not.toContain(`${DIR}/unrelated-dir`);
      // Off-Windows the link type is a directory symlink.
      expect(mockFs.symlinkSync.mock.calls[0][2]).toBe('dir');
    });

    it('preserves an existing link that already points at the wanted source', () => {
      readdir(['gooseworks'], ['gooseworks']);
      // The existing target is a link resolving to the correct source.
      mockFs.readlinkSync.mockReturnValue(`${BASE}/gooseworks` as any);
      mockFs.realpathSync.mockImplementation(((p: any) =>
        p === `${DIR}/gooseworks` ? `${BASE}/gooseworks` : p) as any);

      const { linked } = syncManagedSkillLinks(BASE, DIR);

      expect(linked).toBe(1);
      // A valid junction/symlink is neither torn down nor recreated.
      expect(mockFs.symlinkSync).not.toHaveBeenCalled();
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
      expect(mockFs.rmdirSync).not.toHaveBeenCalled();
    });

    it('warns and continues when one skill fails to link (no throw)', () => {
      readdir(['gooseworks', 'goose-graphics'], []);
      mockFs.symlinkSync.mockImplementation(((_s: any, target: any) => {
        if (target === `${DIR}/gooseworks`) throw new Error('EPERM: operation not permitted');
      }) as any);

      const { linked, failed } = syncManagedSkillLinks(BASE, DIR);

      expect(failed).toBe(1);
      expect(linked).toBe(1); // goose-graphics still linked
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('gooseworks'));
    });

    it('uses junctions on win32 (no admin / Developer Mode needed)', () => {
      const original = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      jest.isolateModules(() => {
        // Re-require so LINK_TYPE is recomputed under the win32 platform.
        const winFs = require('fs') as jest.Mocked<typeof fs>;
        winFs.readdirSync.mockImplementation((p: any) =>
          (p === BASE ? ['gooseworks'] : []) as any);
        winFs.readlinkSync.mockImplementation(() => {
          throw new Error('EINVAL');
        });
        winFs.realpathSync.mockImplementation(((p: any) => p) as any);
        winFs.existsSync.mockReturnValue(true);
        const mod = require('../../src/agents/skill-links');
        mod.syncManagedSkillLinks(BASE, DIR);
        expect(winFs.symlinkSync.mock.calls[0][2]).toBe('junction');
      });
      Object.defineProperty(process, 'platform', { value: original });
    });
  });

  describe('removeManagedSkillLinks', () => {
    it('removes managed links but never a real (non-link) directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['gooseworks', 'goose-graphics', 'other'] as any);
      // gooseworks is a link; goose-graphics is a REAL directory (readlink throws).
      mockFs.readlinkSync.mockImplementation(((p: any) => {
        if (p === `${DIR}/gooseworks`) return `${BASE}/gooseworks` as any;
        throw new Error('EINVAL');
      }) as any);

      removeManagedSkillLinks(DIR);

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(`${DIR}/gooseworks`);
      // Real managed directory is NOT torn down, and unmanaged 'other' is untouched.
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${DIR}/goose-graphics`);
      expect(mockFs.unlinkSync).not.toHaveBeenCalledWith(`${DIR}/other`);
    });
  });
});
