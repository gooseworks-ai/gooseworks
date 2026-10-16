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

/**
 * Verify the GooseWorks MCP server is reachable (its unauthenticated /health
 * endpoint). Ads creation REQUIRES MCP, so install surfaces this loudly. Returns
 * { ok } — never throws. Confirms reachability, not token validity (that surfaces
 * on the first tool call).
 */
export async function verifyMcpReachable(timeoutMs = 5000): Promise<{ ok: boolean; error?: string }> {
  const creds = getCredentials();
  if (!creds?.mcp_server_url) return { ok: false, error: 'no mcp_server_url in credentials' };
  let healthUrl: string;
  try {
    healthUrl = new URL('/health', creds.mcp_server_url).toString();
  } catch {
    return { ok: false, error: `invalid mcp_server_url: ${creds.mcp_server_url}` };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl, { signal: controller.signal });
    return res.ok ? { ok: true } : { ok: false, error: `health check returned ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

const OWN_ENTRIES = ['gooseworks', 'gooseworks-files'];

/** The CLI's own entries (`gooseworks`, legacy `gooseworks-files`); returns the names it removed. */
export function removeClaudeMcp(): string[] {
  const removed: string[] = [];
  try {
    if (!fs.existsSync(CLAUDE_CONFIG_PATH)) return removed;
    const config = readConfig();
    for (const name of OWN_ENTRIES) {
      if (config.mcpServers?.[name]) {
        delete config.mcpServers[name];
        removed.push(name);
      }
    }
    if (removed.length) writeConfig(config);
  } catch {
    // Best-effort
  }
  return removed;
}

function isGooseworksEntry(name: string, entry: { url?: string } | undefined): boolean {
  if (/gooseworks/i.test(name)) return true;
  try {
    const host = new URL(entry?.url ?? '').hostname;
    return host === 'gooseworks.ai' || host.endsWith('.gooseworks.ai');
  } catch {
    return false;
  }
}

/**
 * GooseWorks connections in ~/.claude.json the CLI never writes (other names,
 * or set for one project), so logout can mention them without touching them.
 */
export function otherGooseworksMcpEntries(): string[] {
  const config = readConfig();
  const found: string[] = [];
  for (const [name, entry] of Object.entries(config.mcpServers ?? {})) {
    if (!OWN_ENTRIES.includes(name) && isGooseworksEntry(name, entry)) found.push(name);
  }
  const projects = config.projects as Record<string, { mcpServers?: ClaudeConfig['mcpServers'] }> | undefined;
  for (const [project, settings] of Object.entries(projects ?? {})) {
    for (const [name, entry] of Object.entries(settings?.mcpServers ?? {})) {
      if (isGooseworksEntry(name, entry)) found.push(`${name} (${project})`);
    }
  }
  return found;
}
