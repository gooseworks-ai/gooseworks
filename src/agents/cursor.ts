import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getApiBase, getApiKey, getCredentials } from '../auth/credentials';

function getGlobalCursorConfigPath(): string {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'config.json');
  }
  if (platform === 'linux') {
    return path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'config.json');
  }
  // Windows
  return path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'cursor.mcp', 'config.json');
}

/**
 * Walk up from cwd to find the nearest directory containing `.cursor/`.
 * Returns the path to `.cursor/mcp.json` if a `.cursor/` dir exists,
 * or null if none found before hitting the filesystem root.
 */
function findProjectMcpConfigPath(): string | null {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    const cursorDir = path.join(dir, '.cursor');
    if (fs.existsSync(cursorDir) && fs.statSync(cursorDir).isDirectory()) {
      return path.join(cursorDir, 'mcp.json');
    }
    dir = path.dirname(dir);
  }
  return null;
}

interface McpServerEntry {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

interface CursorMcpConfig {
  mcpServers?: Record<string, McpServerEntry>;
}

function normalizeMcpUrl(base: string): string {
  const stripped = base.replace(/\/$/, '');
  return stripped.endsWith('/mcp') ? stripped : `${stripped}/mcp`;
}

function readMcpConfig(configPath: string): CursorMcpConfig {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8').trim();
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // Corrupted or empty — start fresh
  }
  return {};
}

function buildGooseworksEntries(): Record<string, McpServerEntry> {
  const apiBase = getApiBase();
  const apiKey = getApiKey();
  const creds = getCredentials();
  const mcpBase = creds?.mcp_server_url || apiBase;

  const entries: Record<string, McpServerEntry> = {
    gooseworks: {
      type: 'http',
      url: normalizeMcpUrl(mcpBase),
      headers: {
        Authorization: `Bearer ${apiKey || ''}`,
      },
    },
  };

  if (creds?.files_mcp_url) {
    entries['gooseworks-files'] = {
      type: 'http',
      url: normalizeMcpUrl(creds.files_mcp_url),
      headers: {
        Authorization: `Bearer ${apiKey || ''}`,
      },
    };
  }

  return entries;
}

function writeMcpConfig(configPath: string, entries: Record<string, McpServerEntry>): void {
  const configDir = path.dirname(configPath);
  fs.mkdirSync(configDir, { recursive: true });

  const config = readMcpConfig(configPath);
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  Object.assign(config.mcpServers, entries);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function removeGooseworksFromConfig(configPath: string): void {
  try {
    if (!fs.existsSync(configPath)) return;
    const config = readMcpConfig(configPath);
    let changed = false;
    if (config.mcpServers?.gooseworks) {
      delete config.mcpServers.gooseworks;
      changed = true;
    }
    if (config.mcpServers?.['gooseworks-files']) {
      delete config.mcpServers['gooseworks-files'];
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    }
  } catch {
    // Best-effort
  }
}

export interface CursorConfigResult {
  globalPath: string;
  projectPath: string | null;
}

export function configureCursor(): CursorConfigResult {
  const entries = buildGooseworksEntries();

  const globalPath = getGlobalCursorConfigPath();
  writeMcpConfig(globalPath, entries);

  const projectPath = findProjectMcpConfigPath();
  if (projectPath) {
    writeMcpConfig(projectPath, entries);
  }

  return { globalPath, projectPath };
}

export function removeCursor(): void {
  removeGooseworksFromConfig(getGlobalCursorConfigPath());

  const projectPath = findProjectMcpConfigPath();
  if (projectPath) {
    removeGooseworksFromConfig(projectPath);
  }
}
