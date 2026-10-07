import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { API_BASE } from '../config';
import { assertConnection, getEnvironment, profileRoot } from '../environment';

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

function credentialsFile(): string { return path.join(profileRoot(), 'credentials.json'); }
const LEGACY_FILE = path.join(os.homedir(), '.gooseworks', 'credentials.json');

export function validateCredentials(creds: Credentials): void {
  assertConnection(creds.api_base, 'api');
  if (creds.mcp_server_url) assertConnection(creds.mcp_server_url, 'mcp');
}

export function getCredentials(): Credentials | null {
  let parsed: Credentials;
  try {
    const file = fs.existsSync(credentialsFile()) ? credentialsFile()
      : getEnvironment() === 'production' && fs.existsSync(LEGACY_FILE) ? LEGACY_FILE : null;
    if (!file) return null;
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!parsed.api_key || !parsed.email || !parsed.agent_id || !parsed.api_base) {
      return null;
    }
  } catch {
    return null;
  }
  // A mismatched saved login is an error, never an excuse to use another profile.
  validateCredentials(parsed);
  return parsed;
}

export function saveCredentials(creds: Credentials): void {
  validateCredentials(creds);
  const CREDENTIALS_DIR = profileRoot();
  const CREDENTIALS_FILE = credentialsFile();
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { mode: 0o700, recursive: true });
  }
  fs.writeFileSync(
    CREDENTIALS_FILE,
    JSON.stringify(creds, null, 2) + '\n',
    { mode: 0o600 }
  );
  fs.chmodSync(CREDENTIALS_DIR, 0o700);
  fs.chmodSync(CREDENTIALS_FILE, 0o600);
}

export function clearCredentials(): void {
  const CREDENTIALS_FILE = credentialsFile();
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
    if (getEnvironment() === 'production' && fs.existsSync(LEGACY_FILE)) fs.unlinkSync(LEGACY_FILE);
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
