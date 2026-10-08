/**
 * A small MCP client for the GooseWorks MCP server (Streamable HTTP), using
 * the saved CLI sign-in. It lets an agent that has a shell but no MCP
 * connector (a cloud agent's sandbox: ChatGPT agent, Meta AI, Grok) call the
 * same GooseWorks tools a connected agent calls (GOOSE-3937).
 *
 * One connection per CLI run: initialize → tools/list or tools/call → DELETE
 * the session. The endpoint is `<mcp_server_url>/mcp`, the same one the CLI
 * registers for Claude Code and Codex.
 */
import type { Credentials } from '../auth/credentials';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const PROTOCOL_VERSION = '2025-03-26';

export const LOGIN_HINT =
  'Run `npx gooseworks login` (cloud sandbox or SSH: `npx gooseworks login --device --no-wait`).';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpContentBlock {
  type: string;
  text?: string;
  mimeType?: string;
  uri?: string;
  resource?: { uri?: string; mimeType?: string; text?: string };
}

export interface McpToolResult {
  content?: McpContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpConnection {
  /** The server's own usage rules (paid work, approvals), if it sends any. */
  instructions: string | null;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  close(): Promise<void>;
}

export class McpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'McpError';
  }
}

/** `<mcp_server_url>/mcp`; HTTPS only, except a local dev server. */
export function mcpEndpoint(mcpServerUrl: string): URL {
  const url = new URL(mcpServerUrl);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new McpError('The saved GooseWorks MCP address is not a plain HTTPS URL. ' + LOGIN_HINT);
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/mcp') ? path : `${path}/mcp`;
  return url;
}

async function readBounded(response: Response): Promise<string> {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_RESPONSE_BYTES) throw new McpError('The GooseWorks reply is too large (over 8 MB).');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) throw new McpError('The GooseWorks reply is too large (over 8 MB).');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The JSON-RPC message with `id` from a JSON or SSE (text/event-stream) body. */
function pickMessage(body: string, contentType: string | null, id: number): any {
  if (contentType?.includes('text/event-stream')) {
    let found: any;
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed?.id === id) found = parsed;
      } catch {
        // Ignore non-JSON keep-alive events.
      }
    }
    return found;
  }
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

export async function connectMcp(
  creds: Credentials,
  opts: { timeoutMs?: number; clientName?: string; version?: string } = {},
): Promise<McpConnection> {
  if (!creds.mcp_server_url) {
    throw new McpError('This sign-in has no GooseWorks MCP address. ' + LOGIN_HINT);
  }
  const endpoint = mcpEndpoint(creds.mcp_server_url);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let session: string | undefined;
  let protocol = PROTOCOL_VERSION;
  let sequence = 0;

  const headers = (): Record<string, string> => ({
    Authorization: `Bearer ${creds.api_key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': protocol,
    ...(session ? { 'Mcp-Session-Id': session } : {}),
  });

  const rpc = async (method: string, params: unknown, notification = false): Promise<any> => {
    const id = ++sequence;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
        headers: headers(),
        body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new McpError(timedOut
        ? `GooseWorks did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again, or pass --timeout.`
        : `Could not reach GooseWorks at ${endpoint.origin}. Check the connection and try again.`);
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new McpError('GooseWorks did not accept this sign-in. ' + LOGIN_HINT, response.status);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new McpError(`GooseWorks answered HTTP ${response.status}. Try again in a moment.`, response.status);
    }
    session = response.headers.get('mcp-session-id') ?? session;
    if (notification) {
      await response.body?.cancel();
      return undefined;
    }
    const message = pickMessage(await readBounded(response), response.headers.get('content-type'), id);
    if (!message || message.id !== id) throw new McpError('GooseWorks sent an unexpected reply.');
    if (message.error) {
      const text = typeof message.error.message === 'string' ? message.error.message : 'unknown error';
      throw new McpError(`GooseWorks refused the request: ${text}`);
    }
    return message.result;
  };

  const initialized = await rpc('initialize', {
    protocolVersion: protocol,
    capabilities: {},
    clientInfo: { name: opts.clientName ?? 'gooseworks-cli', version: opts.version ?? '1' },
  });
  if (typeof initialized?.protocolVersion === 'string') protocol = initialized.protocolVersion;
  await rpc('notifications/initialized', {}, true);
  const instructions = typeof initialized?.instructions === 'string' && initialized.instructions.trim()
    ? initialized.instructions.trim()
    : null;

  return {
    instructions,
    async listTools() {
      const tools: McpTool[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await rpc('tools/list', cursor ? { cursor } : {});
        for (const tool of Array.isArray(page?.tools) ? page.tools : []) {
          if (tool && typeof tool.name === 'string') tools.push(tool);
        }
        const next = page?.nextCursor;
        if (next !== undefined && next !== null && (typeof next !== 'string' || seen.has(next) || seen.size >= 100)) {
          throw new McpError('GooseWorks sent an unexpected tool list.');
        }
        if (next) seen.add(next);
        cursor = next || undefined;
      } while (cursor);
      return tools;
    },
    async callTool(name, args) {
      const result = await rpc('tools/call', { name, arguments: args });
      return (result ?? {}) as McpToolResult;
    },
    async close() {
      if (!session) return;
      try {
        const response = await fetch(endpoint, {
          method: 'DELETE',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: headers(),
        });
        await response.body?.cancel();
      } catch {
        // The server also cleans up idle sessions.
      }
    },
  };
}
