import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getSkillsBasePath } from '../skills/installer';

const CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

export function getClaudeSkillsDir(): string {
  return CLAUDE_SKILLS_DIR;
}

export function configureClaude(): number {
  const skillsBase = getSkillsBasePath();
  if (!fs.existsSync(skillsBase)) {
    return 0;
  }

  fs.mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });

  const skillDirs = fs.readdirSync(skillsBase)
    .filter((entry) => entry.startsWith('gooseworks-'));

  let linked = 0;
  for (const skillDir of skillDirs) {
    const source = path.join(skillsBase, skillDir);
    const target = path.join(CLAUDE_SKILLS_DIR, skillDir);

    // Remove existing symlink/directory if present
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    } catch {
      // Target doesn't exist, that's fine
    }

    fs.symlinkSync(source, target, 'dir');
    linked++;
  }

  return linked;
}

export function removeClaude(): void {
  if (!fs.existsSync(CLAUDE_SKILLS_DIR)) return;

  const entries = fs.readdirSync(CLAUDE_SKILLS_DIR);
  for (const entry of entries) {
    if (!entry.startsWith('gooseworks-')) continue;
    const target = path.join(CLAUDE_SKILLS_DIR, entry);
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(target);
      }
    } catch {
      // Ignore
    }
  }
}
