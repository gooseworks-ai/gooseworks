import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SKILLS_BASE = path.join(os.homedir(), '.agents', 'skills');

export function getSkillsBasePath(): string {
  return SKILLS_BASE;
}

export function installMasterSkill(masterSkillMd: string): void {
  const masterDir = path.join(SKILLS_BASE, 'gooseworks');
  fs.mkdirSync(masterDir, { recursive: true });
  fs.writeFileSync(
    path.join(masterDir, 'SKILL.md'),
    masterSkillMd,
    'utf-8'
  );
}

export function getInstalledSkills(): string[] {
  if (!fs.existsSync(SKILLS_BASE)) return [];

  return fs.readdirSync(SKILLS_BASE)
    .filter((entry) => entry === 'gooseworks' || entry.startsWith('gooseworks-'))
    .filter((entry) => {
      const skillMd = path.join(SKILLS_BASE, entry, 'SKILL.md');
      return fs.existsSync(skillMd);
    });
}

export function removeAllSkills(): void {
  if (!fs.existsSync(SKILLS_BASE)) return;

  const entries = fs.readdirSync(SKILLS_BASE);
  for (const entry of entries) {
    if (entry !== 'gooseworks' && !entry.startsWith('gooseworks-')) continue;
    fs.rmSync(path.join(SKILLS_BASE, entry), { recursive: true, force: true });
  }
}
