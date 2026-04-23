import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getCredentials } from '../auth/credentials';

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
 * Add (or overwrite) the `gooseworks` MCP entry in ~/.claude.json.
 * Requires an already-saved user-scoped token and mcp_server_url.
 *
 * Also removes any legacy `gooseworks-files` entry written by older CLI versions.
 *
 * Returns true if configured, false if skipped (missing mcp_server_url).
 */
export function configureClaudeMcp(): boolean {
  const creds = getCredentials();
  if (!creds) return false;
  if (!creds.mcp_server_url) return false;

  const config = readConfig();
  if (!config.mcpServers) config.mcpServers = {};

  // Clean up legacy files-MCP entry from older CLI versions
  if (config.mcpServers['gooseworks-files']) {
    delete config.mcpServers['gooseworks-files'];
  }

  config.mcpServers.gooseworks = {
    type: 'http',
    url: normalizeMcpUrl(creds.mcp_server_url),
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
