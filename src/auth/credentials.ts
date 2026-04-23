import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { API_BASE } from '../config';

export interface Credentials {
  api_key: string;
  email: string;
  /** Current / default agent — used by skills/proxy routes that still expect an agent context. */
  agent_id: string;
  api_base: string;
  /** 'agent' (legacy) or 'user' (new, filesystem MCP). */
  scope_type?: 'agent' | 'user';
  /** Mirror of agent_id for clarity when the token is user-scoped. */
  default_agent_id?: string;
  /** Base URL for the GooseWorks MCP server (e.g. http://localhost:6200 in dev). */
  mcp_server_url?: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), '.gooseworks');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

export function getCredentials(): Credentials | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.api_key || !parsed.email || !parsed.agent_id) {
      return null;
    }
    return parsed as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { mode: 0o700, recursive: true });
  }
  fs.writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify(creds, null, 2) + '\n',
    { mode: 0o600 }
  );
}

export function clearCredentials(): void {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // Ignore errors during cleanup
  }
}

export function getApiKey(): string | null {
  const creds = getCredentials();
  return creds?.api_key ?? null;
}

export function getApiBase(): string {
  const creds = getCredentials();
  return creds?.api_base ?? API_BASE;
}
