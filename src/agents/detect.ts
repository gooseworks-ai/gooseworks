import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type AgentType = 'claude' | 'cursor' | 'codex';

export interface DetectedAgent {
  type: AgentType;
  name: string;
  configDir: string;
}

export function detectAgents(): DetectedAgent[] {
  const agents: DetectedAgent[] = [];
  const home = os.homedir();

  // Claude Code: ~/.claude/
  const claudeDir = path.join(home, '.claude');
  if (fs.existsSync(claudeDir)) {
    agents.push({
      type: 'claude',
      name: 'Claude Code',
      configDir: claudeDir,
    });
  }

  // Cursor: ~/.cursor/ or platform-specific paths
  const cursorPaths = [
    path.join(home, '.cursor'),
    // macOS
    path.join(home, 'Library', 'Application Support', 'Cursor'),
    // Linux
    path.join(home, '.config', 'Cursor'),
  ];

  for (const cursorDir of cursorPaths) {
    if (fs.existsSync(cursorDir)) {
      agents.push({
        type: 'cursor',
        name: 'Cursor',
        configDir: cursorDir,
      });
      break;
    }
  }

  // Codex: ~/.codex/
  const codexDir = path.join(home, '.codex');
  if (fs.existsSync(codexDir)) {
    agents.push({
      type: 'codex',
      name: 'Codex',
      configDir: codexDir,
    });
  }

  return agents;
}

export function isAgentInstalled(type: AgentType): boolean {
  return detectAgents().some((a) => a.type === type);
}
