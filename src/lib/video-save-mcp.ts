/** Uses the normal saved CLI login and canonical MCP tools, never raw Ads REST. */
import type { Credentials } from '../auth/credentials';
import type { SaveTransport } from './video-save';

export class SaveToolError extends Error {
  constructor(public readonly code: string) { super(`GooseWorks save tool failed (${code}); reconnect or diagnose on the original connection`); }
}
const ALLOWED = new Set(['account_whoami', 'video_project_read', 'media_list', 'media_upload',
  'media_confirm', 'video_render_run', 'video_project_upsert']);
function safeUrl(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
    throw new Error('Save connection and storage must use HTTPS (or local fixture HTTP)');
  }
  return url;
}
async function bounded(response: Response, max: number): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error(`Save storage returned HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length'));
  if (length > max) throw new Error('Save response is too large');
  const reader = response.body.getReader(); const chunks: Buffer[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > max) throw new Error('Save response is too large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => undefined); }
}
export async function createSaveTransport(creds: Credentials): Promise<SaveTransport> {
  if (!creds.mcp_server_url) throw new Error('Connect GooseWorks MCP with the normal login/install flow before saving');
  const endpoint = safeUrl(creds.mcp_server_url);
  if (endpoint.search) throw new Error('MCP credentials belong in the normal Authorization header');
  const endpointPath = endpoint.pathname.replace(/\/$/, '');
  endpoint.pathname = endpointPath.endsWith('/mcp') ? endpointPath : `${endpointPath}/mcp`;
  const apiOrigin = safeUrl(creds.api_base).origin;
  let session: string | undefined; let sequence = 0; let protocol = '2025-03-26';
  const rpc = async (method: string, params: unknown, notification = false): Promise<any> => {
    const id = ++sequence;
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${creds.api_key}`, 'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': protocol,
          ...(session ? { 'Mcp-Session-Id': session } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }) });
    } catch { throw new Error('GooseWorks connection interrupted; retain the checkpoint and reconnect normally before resuming'); }
    if (response.status === 401 || response.status === 403) throw new Error('GooseWorks authorization needs the normal login/reconnect flow; finished files remain local');
    if (response.status === 404) throw new Error('GooseWorks session/tools unavailable; reconnect normally and resume this checkpoint');
    if (notification && response.ok) { await response.body?.cancel(); return; }
    const body = (await bounded(response, 8 * 1024 * 1024)).toString('utf8');
    session = response.headers.get('mcp-session-id') ?? session;
    let message: any;
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      for (const event of body.split(/\r?\n\r?\n/)) {
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        const parsed = JSON.parse(data); if (parsed.id === id) message = parsed;
      }
    } else message = JSON.parse(body);
    if (!message || message.id !== id || message.error || !message.result) throw new Error('Uncertain MCP reply; read remote state on the next resume');
    return message.result;
  };
  const initialized = await rpc('initialize', { protocolVersion: protocol, capabilities: {},
    clientInfo: { name: 'gooseworks-video-save', version: '1' } });
  if (typeof initialized.protocolVersion === 'string') protocol = initialized.protocolVersion;
  await rpc('notifications/initialized', {}, true);
  // Old servers can strip unknown optional patch fields. Never send a guarded
  // write until the selected server advertises the atomic contract itself.
  let cursor: string | undefined; let guardedSelection = false;
  const seen = new Set<string>();
  do {
    const listed = await rpc('tools/list', cursor ? { cursor } : {});
    const tool = listed.tools?.find((tool: any) => tool.name === 'video_project_upsert');
    const guard = tool?.inputSchema?.properties?.patch?.properties?.final_selection_guard;
    if (guard?.properties?.expected_final_render_id && guard?.properties?.expected_review_digest &&
        ['expected_final_render_id', 'expected_review_digest'].every(key => guard.required?.includes(key))) guardedSelection = true;
    const next = listed.nextCursor;
    if (next !== undefined && (typeof next !== 'string' || seen.has(next) || seen.size >= 100)) throw new Error('Uncertain save tool contracts; reconnect normally');
    if (next) seen.add(next);
    cursor = next;
  } while (cursor && !guardedSelection);
  if (!guardedSelection) throw new Error('This GooseWorks connection does not advertise atomic final selection. Update/reconnect the server before saving; retain finished files and the checkpoint.');
  return {
    async call(name, args) {
      if (!ALLOWED.has(name) || (name === 'video_render_run' &&
          (!args.render?.render_id || args.render.status !== 'complete' || Object.keys(args).some(k => !['brand_id', 'project_id', 'render'].includes(k)))) ||
          (name === 'video_project_upsert' && (Object.keys(args).some(k => !['brand_id', 'project_id', 'patch'].includes(k)) ||
            Object.keys(args.patch ?? {}).some(k => !['final_render_id', 'final_selection_guard'].includes(k)) ||
            !args.patch.final_render_id || !args.patch.final_selection_guard ||
            Object.keys(args.patch.final_selection_guard).sort().join(',') !== 'expected_final_render_id,expected_review_digest' ||
            !(args.patch.final_selection_guard.expected_final_render_id === null ||
              typeof args.patch.final_selection_guard.expected_final_render_id === 'string') ||
            !/^[a-f0-9]{64}$/.test(args.patch.final_selection_guard.expected_review_digest)))) throw new Error('Save-only transport refused a generation or unrelated write');
      const result = await rpc('tools/call', { name, arguments: args });
      const text = result.content?.find((block: any) => block.type === 'text')?.text;
      if (typeof text !== 'string') throw new Error('Incomplete MCP save reply');
      const data = JSON.parse(text);
      if (result.isError || data.error) throw new SaveToolError(typeof data.error?.code === 'string' ? data.error.code : 'unknown');
      if (name === 'account_whoami' && data.environment?.api_origin !== apiOrigin) throw new Error('CLI and project environment origins differ; use the selected host MCP connection without switching credentials');
      return data;
    },
    async put(url, headers, bytes) {
      if (Object.entries(headers).some(([key, value]) => key.toLowerCase() !== 'content-type' || typeof value !== 'string')) throw new Error('Unexpected upload headers');
      const response = await fetch(safeUrl(url), { method: 'PUT', headers, body: bytes, redirect: 'error', signal: AbortSignal.timeout(10 * 60_000) });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Upload was interrupted (HTTP ${response.status}); resume the same checkpoint`);
    },
    async download(url, maxBytes) {
      return bounded(await fetch(safeUrl(url), { redirect: 'error', signal: AbortSignal.timeout(180_000) }), maxBytes);
    },
  };
}
