import * as http from 'http';
import type { AddressInfo } from 'net';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

export interface StubReply {
  status: number;
  body?: unknown;
}

/**
 * A real HTTP server on 127.0.0.1:0 that answers scripted replies per path.
 * A path with no reply left answers 400, so an unexpected extra call fails
 * the flow loudly instead of looping.
 */
export interface StubApi {
  base: string;
  requests: RecordedRequest[];
  replies: Record<string, StubReply[]>;
  calls(path: string): RecordedRequest[];
  reset(): void;
  close(): Promise<void>;
}

export async function startStubApi(): Promise<StubApi> {
  const requests: RecordedRequest[] = [];
  const replies: Record<string, StubReply[]> = {};
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      const pathOnly = new URL(req.url || '/', 'http://127.0.0.1').pathname;
      let body: unknown;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
      requests.push({ method: req.method || 'GET', path: pathOnly, headers: req.headers, body });
      const reply = replies[pathOnly]?.shift() ?? { status: 400, body: { status: 'error', message: 'no scripted reply' } };
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(reply.body === undefined ? '' : JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    requests,
    replies,
    calls: (path) => requests.filter((r) => r.path === path),
    reset: () => {
      requests.length = 0;
      for (const key of Object.keys(replies)) delete replies[key];
    },
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
