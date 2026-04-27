import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getSkillsBasePath } from '../skills/installer';
import { isManagedGooseworksSkill } from '../skills/names';

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

  // Clean up ALL old gooseworks-* symlinks first
  try {
    const existing = fs.readdirSync(CLAUDE_SKILLS_DIR);
    for (const entry of existing) {
      if (!isManagedGooseworksSkill(entry)) continue;
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
  } catch {
    // Directory might not exist yet
  }

  // Symlink only what's currently in ~/.agents/skills/
  const skillDirs = fs.readdirSync(skillsBase)
    .filter(isManagedGooseworksSkill);

  let linked = 0;
  for (const skillDir of skillDirs) {
    const source = path.join(skillsBase, skillDir);
    const target = path.join(CLAUDE_SKILLS_DIR, skillDir);

    try {
      fs.symlinkSync(source, target, 'dir');
    } catch {
      // If it somehow still exists, remove and retry
      fs.rmSync(target, { recursive: true, force: true });
      fs.symlinkSync(source, target, 'dir');
    }
    linked++;
  }

  return linked;
}

export function removeClaude(): void {
  if (!fs.existsSync(CLAUDE_SKILLS_DIR)) return;

  const entries = fs.readdirSync(CLAUDE_SKILLS_DIR);
  for (const entry of entries) {
    if (!isManagedGooseworksSkill(entry)) continue;
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
