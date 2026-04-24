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
import { searchCommand } from '../../src/commands/search';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;

type Responder = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function startServer(respond: Responder): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(respond);
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

describe('search command', () => {
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

  it('exits when not logged in', async () => {
    mockGetCredentials.mockReturnValue(null);

    await expect(searchCommand.parseAsync(['node', 'test', 'reddit'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
  });

  it('prints skills on happy path', async () => {
    server = await startServer(async (req, res) => {
      const body = await readBody(req);
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/api/skills/search');
      expect(JSON.parse(body)).toEqual({ query: 'reddit' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        data: [
          { id: '1', name: 'Reddit Scraper', slug: 'reddit-scraper', category: 'scraping', description: 'Scrape subreddits and posts' },
        ],
      }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await searchCommand.parseAsync(['node', 'test', 'reddit']);

    expect(loggerModule.success).toHaveBeenCalledWith('Found 1 skill:');
    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('Reddit Scraper');
    expect(logged).toContain('reddit-scraper');
  });

  it('warns when no skills match', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: [] }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await searchCommand.parseAsync(['node', 'test', 'nothing-matches']);

    expect(loggerModule.warn).toHaveBeenCalledWith('No skills found for "nothing-matches"');
  });

  it('reports Unauthorized on 401', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(401);
      res.end();
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_bad',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(searchCommand.parseAsync(['node', 'test', 'reddit'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
  });

  it('reports Server error on 500', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(searchCommand.parseAsync(['node', 'test', 'reddit'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('Server error (500)'));
  });

  it('reports Invalid response on malformed JSON', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('<<<not json>>>');
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(searchCommand.parseAsync(['node', 'test', 'reddit'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Invalid response from server');
  });
});
