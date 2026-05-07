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
import { fetchCommand } from '../../src/commands/fetch';

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

describe('fetch command', () => {
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

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
  });

  it('prints skill JSON on happy path', async () => {
    server = await startServer((req, res) => {
      expect(req.method).toBe('GET');
      expect(req.url).toBe('/api/skills/catalog/reddit-scraper');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        data: {
          slug: 'reddit-scraper',
          name: 'Reddit Scraper',
          description: 'Scrape Reddit',
          content: '# Reddit Scraper SKILL.md',
          scripts: { 'scrape.py': 'print("hi")' },
          requiresSkills: [],
          dependencySkills: [],
        },
      }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await fetchCommand.parseAsync(['node', 'test', 'reddit-scraper']);

    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('reddit-scraper');
    expect(logged).toContain('Reddit Scraper');
    expect(logged).toContain('# Reddit Scraper SKILL.md');
  });

  it('url-encodes the slug', async () => {
    let receivedUrl: string | undefined;
    server = await startServer((req, res) => {
      receivedUrl = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: { slug: 'a/b', name: 'X', content: '' } }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await fetchCommand.parseAsync(['node', 'test', 'a/b']);

    expect(receivedUrl).toBe('/api/skills/catalog/a%2Fb');
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

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

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

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

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

    await expect(fetchCommand.parseAsync(['node', 'test', 'reddit-scraper'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Invalid response from server');
  });
});
