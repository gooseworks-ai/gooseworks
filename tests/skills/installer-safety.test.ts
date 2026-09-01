/**
 * GOOSE-3191 — `gooseworks install` must never delete a skill we didn't write.
 *
 * These run against a REAL temp skills dir (no `jest.mock('fs')`) so they prove
 * the on-disk behaviour, not the behaviour of a mock. `~/.agents/skills` is
 * resolved from `os.homedir()` at module load, so each test re-imports the
 * installer inside `jest.isolateModules` with `homedir` pointed at a temp dir.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Installer = typeof import('../../src/skills/installer');

function withTempHome(run: (installer: Installer, skillsBase: string) => void): void {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gw-install-'));
  const skillsBase = path.join(home, '.agents', 'skills');
  fs.mkdirSync(skillsBase, { recursive: true });

  try {
    jest.isolateModules(() => {
      // `os.homedir` is non-configurable on modern Node, so replace the module
      // rather than spying on the property.
      jest.doMock('os', () => ({ ...jest.requireActual('os'), homedir: () => home }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const installer: Installer = require('../../src/skills/installer');
      expect(installer.getSkillsBasePath()).toBe(skillsBase);
      run(installer, skillsBase);
    });
  } finally {
    jest.dontMock('os');
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function writeSkill(dir: string, body: string, stamp?: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf-8');
  if (stamp !== undefined) fs.writeFileSync(path.join(dir, '.gooseworks-version'), stamp, 'utf-8');
}

describe('removeAllSkills — third-party skills survive install (GOOSE-3191)', () => {
  it("keeps an unstamped third-party `goose-*` skill and everything inside it", () => {
    withTempHome((installer, skillsBase) => {
      // The decoy: a user's own skill that merely happens to start with `goose-`.
      const decoy = path.join(skillsBase, 'goose-notours');
      writeSkill(decoy, '# my own notes skill\n');
      fs.mkdirSync(path.join(decoy, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(decoy, 'scripts', 'run.py'), 'print("mine")\n', 'utf-8');

      // A second decoy under the other historically-matched prefix.
      writeSkill(path.join(skillsBase, 'gooseworks-mine'), '# also mine\n');

      // Ours: written by the CLI on a previous install.
      installer.installManagedEntrySkills(
        [{ name: 'gooseworks', content: '# router' }],
        { force: true },
      );

      installer.removeAllSkills();

      expect(fs.existsSync(path.join(decoy, 'SKILL.md'))).toBe(true);
      expect(fs.readFileSync(path.join(decoy, 'scripts', 'run.py'), 'utf-8')).toBe('print("mine")\n');
      expect(fs.existsSync(path.join(skillsBase, 'gooseworks-mine', 'SKILL.md'))).toBe(true);
      // …and ours is still cleaned up.
      expect(fs.existsSync(path.join(skillsBase, 'gooseworks'))).toBe(false);
    });
  });

  it('removes every known entry-skill slug even when it has no stamp (old CLI upgrade)', () => {
    withTempHome((installer, skillsBase) => {
      for (const name of ['gooseworks', 'goose-ads', 'goose-video', 'goose-product-photos', 'ads-remix']) {
        writeSkill(path.join(skillsBase, name), `# ${name}\n`); // no stamp
      }
      writeSkill(path.join(skillsBase, 'goose-notours'), '# mine\n');

      installer.removeAllSkills();

      for (const name of ['gooseworks', 'goose-ads', 'goose-video', 'goose-product-photos', 'ads-remix']) {
        expect(fs.existsSync(path.join(skillsBase, name))).toBe(false);
      }
      expect(fs.existsSync(path.join(skillsBase, 'goose-notours'))).toBe(true);
    });
  });

  it('removes a stamped standalone skill (installed with `--with`)', () => {
    withTempHome((installer, skillsBase) => {
      writeSkill(path.join(skillsBase, 'goose-graphics'), '# graphics\n', 'standalone:goose-graphics');
      writeSkill(path.join(skillsBase, 'goose-notours'), '# mine\n');

      installer.removeAllSkills();

      expect(fs.existsSync(path.join(skillsBase, 'goose-graphics'))).toBe(false);
      expect(fs.existsSync(path.join(skillsBase, 'goose-notours'))).toBe(true);
    });
  });

  it('getInstalledSkills lists only skills we own', () => {
    withTempHome((installer, skillsBase) => {
      writeSkill(path.join(skillsBase, 'goose-notours'), '# mine\n');
      writeSkill(path.join(skillsBase, 'goose-graphics'), '# graphics\n', 'standalone:goose-graphics');
      installer.installManagedEntrySkills([{ name: 'gooseworks', content: '# router' }], { force: true });

      expect(installer.getInstalledSkills().sort()).toEqual(['goose-graphics', 'gooseworks']);
    });
  });
});
