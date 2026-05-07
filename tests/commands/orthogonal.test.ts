import * as http from 'http';
import type { AddressInfo } from 'net';

jest.mock('../../src/auth/credentials', () => ({
  getCredentials: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  banner: jest.fn(),
  step: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  example: jest.fn(),
  spinner: jest.fn().mockReturnValue({ stop: jest.fn() }),
  done: jest.fn(),
}));

import { getCredentials } from '../../src/auth/credentials';
import * as loggerModule from '../../src/utils/logger';
import { orthogonalCommand } from '../../src/commands/orthogonal';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;

type Responder = (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>;

async function startServer(respond: Responder) {
  const server = http.createServer(async (req, res) => {
    try {
      await respond(req, res);
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

const baseCreds = (apiBase: string) => ({
  api_key: 'cal_test',
  email: 'u@example.com',
  agent_id: 'agent-1',
  api_base: apiBase,
});

describe('orthogonal command', () => {
  let processExitSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;
  let server: { url: string; close: () => Promise<void> } | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    processExitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    if (server) {
      await server.close();
      server = null;
    }
  });

  describe('find', () => {
    it('exits when not logged in', async () => {
      mockGetCredentials.mockReturnValue(null);

      await expect(
        orthogonalCommand.parseAsync(['node', 'test', 'find', 'find email']),
      ).rejects.toThrow('process.exit called');

      expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
    });

    it('posts {prompt, limit} to /v1/proxy/orthogonal/search and prints results', async () => {
      let receivedUrl: string | undefined;
      let receivedBody: string | undefined;

      server = await startServer(async (req, res) => {
        receivedUrl = req.url;
        receivedBody = await readBody(req);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          data: { success: true, results: [{ slug: 'hunter', name: 'Hunter' }] },
        }));
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await orthogonalCommand.parseAsync(['node', 'test', 'find', 'find email by name']);

      expect(receivedUrl).toBe('/v1/proxy/orthogonal/search');
      expect(JSON.parse(receivedBody!)).toEqual({ prompt: 'find email by name', limit: 5 });

      const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('hunter');
      expect(logged).toContain('Hunter');
    });

    it('passes --limit through to the request', async () => {
      let receivedBody: string | undefined;
      server = await startServer(async (req, res) => {
        receivedBody = await readBody(req);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', data: { success: true, results: [] } }));
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await orthogonalCommand.parseAsync(['node', 'test', 'find', 'x', '--limit', '12']);

      expect(JSON.parse(receivedBody!)).toEqual({ prompt: 'x', limit: 12 });
    });

    it('reports Unauthorized on 401', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(401);
        res.end();
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await expect(
        orthogonalCommand.parseAsync(['node', 'test', 'find', 'x']),
      ).rejects.toThrow('process.exit called');

      expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
    });
  });

  describe('describe', () => {
    it('exits when not logged in', async () => {
      mockGetCredentials.mockReturnValue(null);

      await expect(
        orthogonalCommand.parseAsync(['node', 'test', 'describe', 'hunter', '/v2/email-finder']),
      ).rejects.toThrow('process.exit called');

      expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
    });

    it('posts {api, path} to /v1/proxy/orthogonal/details and prints params', async () => {
      let receivedUrl: string | undefined;
      let receivedBody: string | undefined;

      server = await startServer(async (req, res) => {
        receivedUrl = req.url;
        receivedBody = await readBody(req);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          data: {
            api: { slug: 'hunter', name: 'Hunter' },
            endpoint: { path: '/v2/email-finder', method: 'GET', description: 'Find email' },
          },
        }));
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await orthogonalCommand.parseAsync(['node', 'test', 'describe', 'hunter', '/v2/email-finder']);

      expect(receivedUrl).toBe('/v1/proxy/orthogonal/details');
      expect(JSON.parse(receivedBody!)).toEqual({ api: 'hunter', path: '/v2/email-finder' });

      const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('hunter');
      expect(logged).toContain('/v2/email-finder');
    });

    it('reports Unauthorized on 401', async () => {
      server = await startServer((_req, res) => {
        res.writeHead(401);
        res.end();
      });
      mockGetCredentials.mockReturnValue(baseCreds(server.url));

      await expect(
        orthogonalCommand.parseAsync(['node', 'test', 'describe', 'hunter', '/v2/x']),
      ).rejects.toThrow('process.exit called');

      expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
    });
  });
});
