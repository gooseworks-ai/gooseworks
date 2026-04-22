import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getApiBase, getCredentials } from '../auth/credentials';

/**
 * Claude Code keeps user-level MCP server entries in ~/.claude.json.
 * We only touch the `mcpServers` subtree and preserve everything else.
 */

const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');

interface ClaudeConfig {
  mcpServers?: Record<string, {
    type?: string;
    url?: string;
    headers?: Record<string, string>;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  [key: string]: unknown;
}

function readConfig(): ClaudeConfig {
  try {
    if (!fs.existsSync(CLAUDE_CONFIG_PATH)) return {};
    const raw = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
    if (!raw.trim()) return {};
    return JSON.parse(raw) as ClaudeConfig;
  } catch {
    return {};
  }
}

function writeConfig(config: ClaudeConfig): void {
  const pretty = JSON.stringify(config, null, 2) + '\n';
  fs.writeFileSync(CLAUDE_CONFIG_PATH, pretty, { mode: 0o600 });
}

function normalizeMcpUrl(base: string): string {
  const stripped = base.replace(/\/$/, '');
  return stripped.endsWith('/mcp') ? stripped : `${stripped}/mcp`;
}

/**
 * Add (or overwrite) the `gooseworks` main MCP entry in ~/.claude.json.
 * Returns true if configured, false if skipped (no credentials).
 */
export function configureClaudeMcp(): boolean {
  const creds = getCredentials();
  if (!creds) return false;

  const base = creds.mcp_server_url || getApiBase();

  const config = readConfig();
  if (!config.mcpServers) config.mcpServers = {};

  config.mcpServers.gooseworks = {
    type: 'http',
    url: normalizeMcpUrl(base),
    headers: {
      Authorization: `Bearer ${creds.api_key}`,
    },
  };

  writeConfig(config);
  return true;
}

/**
 * Add (or overwrite) the `gooseworks-files` MCP entry in ~/.claude.json.
 * Requires an already-saved user-scoped token and files_mcp_url.
 *
 * Returns true if configured, false if skipped (missing files_mcp_url).
 */
export function configureClaudeFilesMcp(): boolean {
  const creds = getCredentials();
  if (!creds) return false;
  if (!creds.files_mcp_url) return false;

  const config = readConfig();
  if (!config.mcpServers) config.mcpServers = {};

  config.mcpServers['gooseworks-files'] = {
    type: 'http',
    url: normalizeMcpUrl(creds.files_mcp_url),
    headers: {
      Authorization: `Bearer ${creds.api_key}`,
    },
  };

  writeConfig(config);
  return true;
}

export function removeClaudeMcp(): void {
  try {
    if (!fs.existsSync(CLAUDE_CONFIG_PATH)) return;
    const config = readConfig();
    let changed = false;
    if (config.mcpServers?.gooseworks) {
      delete config.mcpServers.gooseworks;
      changed = true;
    }
    if (config.mcpServers?.['gooseworks-files']) {
      delete config.mcpServers['gooseworks-files'];
      changed = true;
    }
    if (changed) writeConfig(config);
  } catch {
    // Best-effort
  }
}

export function removeClaudeFilesMcp(): void {
  try {
    if (!fs.existsSync(CLAUDE_CONFIG_PATH)) return;
    const config = readConfig();
    if (config.mcpServers?.['gooseworks-files']) {
      delete config.mcpServers['gooseworks-files'];
      writeConfig(config);
    }
  } catch {
    // Best-effort
  }
}
