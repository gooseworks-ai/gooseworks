import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getCredentials } from '../auth/credentials';
import { getSkillsBasePath } from '../skills/installer';
import { isManagedGooseworksSkill } from '../skills/names';

const CODEX_SKILLS_DIR = path.join(os.homedir(), '.codex', 'skills');
const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');

export function getCodexSkillsDir(): string {
  return CODEX_SKILLS_DIR;
}

export function configureCodex(): number {
  const skillsBase = getSkillsBasePath();
  if (!fs.existsSync(skillsBase)) {
    return 0;
  }

  fs.mkdirSync(CODEX_SKILLS_DIR, { recursive: true });

  // Clean up ALL old gooseworks-* symlinks first
  try {
    const existing = fs.readdirSync(CODEX_SKILLS_DIR);
    for (const entry of existing) {
      if (!isManagedGooseworksSkill(entry)) continue;
      const target = path.join(CODEX_SKILLS_DIR, entry);
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
    const target = path.join(CODEX_SKILLS_DIR, skillDir);

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

export function removeCodex(): void {
  if (!fs.existsSync(CODEX_SKILLS_DIR)) return;

  const entries = fs.readdirSync(CODEX_SKILLS_DIR);
  for (const entry of entries) {
    if (!isManagedGooseworksSkill(entry)) continue;
    const target = path.join(CODEX_SKILLS_DIR, entry);
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

function normalizeMcpUrl(base: string): string {
  const stripped = base.replace(/\/$/, '');
  return stripped.endsWith('/mcp') ? stripped : `${stripped}/mcp`;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function readCodexConfig(): string {
  try {
    if (!fs.existsSync(CODEX_CONFIG_PATH)) return '';
    return fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8');
  } catch {
    return '';
  }
}

function stripTomlTable(raw: string, tableName: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      const name = header[1].trim();
      skipping = name === tableName || name.startsWith(`${tableName}.`);
    }

    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Add (or overwrite) the GooseWorks MCP entry in ~/.codex/config.toml.
 * Stores the same user-scoped bearer token shape used by Claude/Cursor config,
 * so Codex Desktop can use it without relying on a launcher env var.
 */
export function configureCodexMcp(): boolean {
  const creds = getCredentials();
  if (!creds?.mcp_server_url || !creds.api_key) return false;

  const configDir = path.dirname(CODEX_CONFIG_PATH);
  fs.mkdirSync(configDir, { recursive: true });

  const existing = stripTomlTable(readCodexConfig(), 'mcp_servers.gooseworks');
  const block = [
    '[mcp_servers.gooseworks]',
    `url = ${tomlString(normalizeMcpUrl(creds.mcp_server_url))}`,
    `http_headers = { Authorization = ${tomlString(`Bearer ${creds.api_key}`)} }`,
  ].join('\n');
  const next = `${existing ? `${existing}\n\n` : ''}${block}\n`;

  fs.writeFileSync(CODEX_CONFIG_PATH, next, { mode: 0o600 });
  return true;
}
