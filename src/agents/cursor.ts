import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getApiBase, getApiKey, getCredentials } from '../auth/credentials';

function getCursorConfigPath(): string {
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

interface CursorMcpConfig {
  mcpServers?: Record<string, {
    type?: string;
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    env?: Record<string, string>;
  }>;
}

function normalizeMcpUrl(base: string): string {
  const stripped = base.replace(/\/$/, '');
  return stripped.endsWith('/mcp') ? stripped : `${stripped}/mcp`;
}

export function configureCursor(): void {
  const configPath = getCursorConfigPath();
  const configDir = path.dirname(configPath);

  fs.mkdirSync(configDir, { recursive: true });

  let config: CursorMcpConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    config = {};
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  const apiBase = getApiBase();
  const apiKey = getApiKey();
  const creds = getCredentials();

  // Main MCP (sandbox tools): skills, integrations, enrichment, research.
  // HTTP MCP with Bearer auth in headers — `env` doesn't flow to remote HTTP
  // servers, which is why the older config never actually authenticated.
  config.mcpServers['gooseworks'] = {
    type: 'http',
    url: normalizeMcpUrl(apiBase),
    headers: {
      Authorization: `Bearer ${apiKey || ''}`,
    },
  };

  // Filesystem MCP (read/write/upload files across agents + shared folders).
  // Requires the files_mcp_url returned by the backend on login. If the token
  // was issued by an older backend, skip silently.
  if (creds?.files_mcp_url) {
    config.mcpServers['gooseworks-files'] = {
      type: 'http',
      url: normalizeMcpUrl(creds.files_mcp_url),
      headers: {
        Authorization: `Bearer ${apiKey || ''}`,
      },
    };
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function removeCursor(): void {
  const configPath = getCursorConfigPath();
  try {
    if (!fs.existsSync(configPath)) return;
    const config: CursorMcpConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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
    // Ignore errors
  }
}
