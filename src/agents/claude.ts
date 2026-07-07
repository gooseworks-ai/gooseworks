import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getSkillsBasePath } from '../skills/installer';
import { syncManagedSkillLinks, removeManagedSkillLinks } from './skill-links';

const CLAUDE_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

export function getClaudeSkillsDir(): string {
  return CLAUDE_SKILLS_DIR;
}

export function configureClaude(): number {
  const skillsBase = getSkillsBasePath();
  if (!fs.existsSync(skillsBase)) {
    return 0;
  }
  // Cross-platform, privilege-free, resilient linking (GOOSE-2418).
  return syncManagedSkillLinks(skillsBase, CLAUDE_SKILLS_DIR).linked;
}

export function removeClaude(): void {
  removeManagedSkillLinks(CLAUDE_SKILLS_DIR);
}
