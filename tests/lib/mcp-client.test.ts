import * as http from 'http';
import type { AddressInfo } from 'net';
import { connectMcp, mcpEndpoint, McpError } from '../../src/lib/mcp-client';
import type { Credentials } from '../../src/auth/credentials';

interface Seen {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

/**
 * A stand-in GooseWorks MCP server: answers initialize, tools/list (two
 * pages), tools/call (JSON or SSE) and DELETE, and records every request.
 */
async function startStubMcp(opts: { sse?: boolean; status?: number } = {}) {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      const body = raw ? JSON.parse(raw) : undefined;
      seen.push({ method: req.method || '', path: req.url || '', headers: req.headers, body });
      if (opts.status) {
        res.writeHead(opts.status);
        res.end();
        return;
      }
      if (req.method === 'DELETE') {
        res.writeHead(200);
        res.end();
        return;
      }
      if (!('id' in body)) {
        res.writeHead(202);
        res.end();
        return;
      }
      let result: unknown;
      if (body.method === 'initialize') {
        result = { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'stub' }, instructions: 'Paid work needs a yes.' };
      } else if (body.method === 'tools/list') {
        result = body.params?.cursor
          ? { tools: [{ name: 'brand_read', description: 'Read brands.', inputSchema: { type: 'object' } }] }
          : { tools: [{ name: 'account_whoami', description: 'Who am I. More text.', inputSchema: { type: 'object' } }], nextCursor: 'page-2' };
      } else if (body.method === 'tools/call') {
        result = { content: [{ type: 'text', text: JSON.stringify({ called: body.params.name, args: body.params.arguments }) }] };
      }
      const message = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
      const headers: Record<string, string> = { 'Mcp-Session-Id': 'session-1' };
      if (opts.sse) {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream' });
        res.end(`event: message\ndata: ${message}\n\n`);
      } else {
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
        res.end(message);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

const creds = (mcp_server_url: string): Credentials => ({
  api_key: 'cal_test',
  email: 'user@example.com',
  agent_id: 'agent-1',
  api_base: 'http://127.0.0.1:1',
  mcp_server_url,
});

describe('lib/mcp-client', () => {
  it.each([false, true])('lists every page and calls a tool with the saved key and session (sse: %s)', async (sse) => {
    const stub = await startStubMcp({ sse });
    try {
      const mcp = await connectMcp(creds(stub.url));
      expect(mcp.instructions).toBe('Paid work needs a yes.');
      const tools = await mcp.listTools();
      expect(tools.map((t) => t.name)).toEqual(['account_whoami', 'brand_read']);
      const result = await mcp.callTool('brand_read', { brand_id: 'b1' });
      expect(JSON.parse(result.content![0].text!)).toEqual({ called: 'brand_read', args: { brand_id: 'b1' } });
      await mcp.close();

      const posts = stub.seen.filter((r) => r.method === 'POST');
      expect(posts.map((r) => r.body.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/list', 'tools/call']);
      for (const r of stub.seen) {
        expect(r.path).toBe('/mcp');
        expect(r.headers.authorization).toBe('Bearer cal_test');
      }
      // The session from initialize rides every later request, and the
      // negotiated protocol version replaces the requested one.
      expect(posts.slice(1).every((r) => r.headers['mcp-session-id'] === 'session-1')).toBe(true);
      expect(posts[2].headers['mcp-protocol-version']).toBe('2025-06-18');
      expect(stub.seen.at(-1)).toMatchObject({ method: 'DELETE', headers: { 'mcp-session-id': 'session-1' } });
    } finally {
      await stub.close();
    }
  });

  it('turns a refused key into a sign-in hint', async () => {
    const stub = await startStubMcp({ status: 401 });
    try {
      await expect(connectMcp(creds(stub.url))).rejects.toThrow(/did not accept this sign-in.*login --device --no-wait/);
    } finally {
      await stub.close();
    }
  });

  it('needs a saved MCP address and only talks HTTPS (or a local dev server)', async () => {
    await expect(connectMcp({ ...creds('x'), mcp_server_url: undefined })).rejects.toBeInstanceOf(McpError);
    expect(mcpEndpoint('https://mcp.gooseworks.ai').toString()).toBe('https://mcp.gooseworks.ai/mcp');
    expect(mcpEndpoint('https://mcp.gooseworks.ai/mcp/').toString()).toBe('https://mcp.gooseworks.ai/mcp');
    expect(mcpEndpoint('http://localhost:6200').toString()).toBe('http://localhost:6200/mcp');
    expect(() => mcpEndpoint('http://mcp.example.com')).toThrow(McpError);
    expect(() => mcpEndpoint('https://mcp.gooseworks.ai/?token=x')).toThrow(McpError);
  });
});
