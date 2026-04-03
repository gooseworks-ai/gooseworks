import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getApiBase, getApiKey } from '../auth/credentials';

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
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
  }>;
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

  config.mcpServers['gooseworks'] = {
    url: `${apiBase}/mcp`,
    env: {
      GOOSEWORKS_API_KEY: apiKey || '',
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function removeCursor(): void {
  const configPath = getCursorConfigPath();
  try {
    if (!fs.existsSync(configPath)) return;
    const config: CursorMcpConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.mcpServers?.gooseworks) {
      delete config.mcpServers.gooseworks;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    }
  } catch {
    // Ignore errors
  }
}
