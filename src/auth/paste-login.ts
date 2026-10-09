/**
 * `gooseworks login --paste` (GOOSE-3937) — a manual support fallback.
 *
 * When the browser lands on a localhost callback that can't reach the CLI
 * ("localhost refused to connect"), the address bar still holds the full
 * `/callback?token=…` URL. Pasting it (or a bare `cal_` key) here finishes
 * sign-in. The key is always verified live before it is saved.
 */
import * as readline from 'readline';
import { assertConnection } from '../environment';
import { HttpError, requestJson } from '../utils/http';
import { saveCredentials, validateCredentials, type Credentials } from './credentials';
import type { OAuthResult } from './oauth-server';

export type PastedSignIn =
  | { kind: 'key'; key: string }
  | {
    kind: 'callback';
    token: string;
    email: string;
    agent_id: string;
    api_base?: string;
    scope_type?: 'agent' | 'user';
    default_agent_id?: string;
    mcp_server_url?: string;
  };

export const NOT_A_SIGN_IN_MESSAGE = "That doesn't look like a GooseWorks sign-in address or key.";
const INVALID_KEY_MESSAGE = "That sign-in key isn't valid any more. Run gooseworks login again.";
const REQUEST_TIMEOUT_MS = 15_000;

function unwrap(raw: string): string {
  let value = raw.trim();
  for (;;) {
    const first = value[0];
    const last = value[value.length - 1];
    const wrapped = value.length >= 2 && (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === '`' && last === '`') ||
      (first === '<' && last === '>')
    );
    if (!wrapped) return value;
    value = value.slice(1, -1).trim();
  }
}

function queryOf(value: string): URLSearchParams {
  // Browsers often hide the scheme in the address bar.
  const withScheme = /^(localhost|127\.0\.0\.1)(:\d+)?\//i.test(value) ? `http://${value}` : value;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withScheme)) {
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      throw new Error(NOT_A_SIGN_IN_MESSAGE);
    }
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/callback') {
      throw new Error(NOT_A_SIGN_IN_MESSAGE);
    }
    return url.searchParams;
  }
  if (value.startsWith('?')) return new URLSearchParams(value.slice(1));
  if (/(^|&)token=/.test(value)) return new URLSearchParams(value);
  throw new Error(NOT_A_SIGN_IN_MESSAGE);
}

/** Parses a pasted callback address (full URL or query only) or a raw `cal_` key. */
export function parsePastedSignIn(raw: string): PastedSignIn {
  const value = unwrap(raw);
  if (/^cal_\S+$/.test(value)) return { kind: 'key', key: value };

  const params = queryOf(value);
  const token = params.get('token');
  const email = params.get('email');
  const agentId = params.get('agent_id');
  if (!token || !token.startsWith('cal_') || /\s/.test(token) || !email || !agentId) {
    throw new Error(NOT_A_SIGN_IN_MESSAGE);
  }
  const scopeType = params.get('scope_type');
  const apiBase = params.get('api_base');
  const defaultAgentId = params.get('default_agent_id');
  const mcpServerUrl = params.get('mcp_server_url');
  return {
    kind: 'callback',
    token,
    email,
    agent_id: agentId,
    ...(apiBase ? { api_base: apiBase } : {}),
    ...(scopeType === 'agent' || scopeType === 'user' ? { scope_type: scopeType } : {}),
    ...(defaultAgentId ? { default_agent_id: defaultAgentId } : {}),
    ...(mcpServerUrl ? { mcp_server_url: mcpServerUrl } : {}),
  };
}

interface WhoamiResponse {
  status?: string;
  data?: {
    email?: string;
    agent_id?: string;
    default_agent_id?: string | null;
    scope_type?: string;
    api_base?: string | null;
    mcp_server_url?: string | null;
  };
}

export interface PasteIo {
  isTTY?: boolean;
  prompt?: (question: string) => Promise<string>;
}

function defaultPrompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Verifies a pasted address or key against the server, then saves it.
 * No time limit: the pasted key is checked live instead.
 */
export async function pasteLogin(value: string | undefined, apiBase: string, io: PasteIo = {}): Promise<OAuthResult> {
  let raw = value;
  if (raw === undefined || raw.trim() === '') {
    const isTTY = io.isTTY ?? process.stdin.isTTY;
    if (!isTTY) throw new Error('Pass the address or key: gooseworks login --paste "<value>"');
    raw = await (io.prompt ?? defaultPrompt)('Paste the address your browser showed (or your key): ');
  }

  const parsed = parsePastedSignIn(raw);
  const base = (parsed.kind === 'callback' && parsed.api_base ? parsed.api_base : apiBase).replace(/\/+$/, '');
  assertConnection(base, 'api');
  const key = parsed.kind === 'key' ? parsed.key : parsed.token;

  let creds: Credentials;
  try {
    const res = await requestJson<WhoamiResponse>({ apiBase: base, apiKey: key, path: '/api/cli/auth/whoami', timeoutMs: REQUEST_TIMEOUT_MS });
    const who = res?.data;
    if (!who || typeof who.email !== 'string' || !who.email || typeof who.agent_id !== 'string' || !who.agent_id) {
      throw new Error('The server did not confirm this sign-in. Run gooseworks login again.');
    }
    const fromUrl = parsed.kind === 'callback' ? parsed : undefined;
    const scopeType = who.scope_type === 'agent' || who.scope_type === 'user' ? who.scope_type : fromUrl?.scope_type;
    const defaultAgentId = who.default_agent_id || fromUrl?.default_agent_id;
    const mcpServerUrl = who.mcp_server_url || fromUrl?.mcp_server_url;
    creds = {
      api_key: key,
      email: who.email,
      agent_id: who.agent_id,
      api_base: base,
      ...(scopeType ? { scope_type: scopeType } : {}),
      ...(defaultAgentId ? { default_agent_id: defaultAgentId } : {}),
      ...(mcpServerUrl ? { mcp_server_url: mcpServerUrl } : {}),
    };
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    if (err.status === 401) throw new Error(INVALID_KEY_MESSAGE);
    if (err.status !== 404) throw err;
    // Older server without /whoami.
    if (parsed.kind === 'key') {
      throw new Error("This server can't check a bare key yet. Paste the full address from your browser instead.");
    }
    try {
      await requestJson({ apiBase: base, apiKey: key, path: '/v1/credits', timeoutMs: REQUEST_TIMEOUT_MS });
    } catch (creditsErr) {
      if (creditsErr instanceof HttpError && creditsErr.status === 401) throw new Error(INVALID_KEY_MESSAGE);
      throw creditsErr;
    }
    creds = {
      api_key: key,
      email: parsed.email,
      agent_id: parsed.agent_id,
      api_base: base,
      ...(parsed.scope_type ? { scope_type: parsed.scope_type } : {}),
      ...(parsed.default_agent_id ? { default_agent_id: parsed.default_agent_id } : {}),
      ...(parsed.mcp_server_url ? { mcp_server_url: parsed.mcp_server_url } : {}),
    };
  }

  validateCredentials(creds);
  saveCredentials(creds);
  return {
    api_key: creds.api_key,
    email: creds.email,
    agent_id: creds.agent_id,
    ...(creds.scope_type ? { scope_type: creds.scope_type } : {}),
    ...(creds.default_agent_id ? { default_agent_id: creds.default_agent_id } : {}),
    ...(creds.mcp_server_url ? { mcp_server_url: creds.mcp_server_url } : {}),
  };
}
