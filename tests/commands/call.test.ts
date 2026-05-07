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
import type { Command } from 'commander';

const mockGetCredentials = getCredentials as jest.MockedFunction<typeof getCredentials>;

// Re-require the command per test so commander's parsed option state
// (e.g. --body, --query) doesn't leak across tests.
function freshCallCommand(): Command {
  let cmd: Command | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cmd = require('../../src/commands/call').callCommand;
  });
  return cmd!;
}

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

describe('call command', () => {
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

    await expect(
      freshCallCommand().parseAsync(['node', 'test', 'apify', 'acts/x/runs']),
    ).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
  });

  it('routes direct-proxy provider to /v1/proxy/<provider>/<path>', async () => {
    let receivedMethod: string | undefined;
    let receivedUrl: string | undefined;
    let receivedBody: string | undefined;

    server = await startServer(async (req, res) => {
      receivedMethod = req.method;
      receivedUrl = req.url;
      receivedBody = await readBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: { runId: 'abc' } }));
    });
    mockGetCredentials.mockReturnValue(baseCreds(server.url));

    await freshCallCommand().parseAsync([
      'node',
      'test',
      'apify',
      'acts/parseforge~reddit/runs',
      '--body',
      '{"subreddit":"ClaudeAI"}',
    ]);

    expect(receivedMethod).toBe('POST');
    expect(receivedUrl).toBe('/v1/proxy/apify/acts/parseforge~reddit/runs');
    expect(JSON.parse(receivedBody!)).toEqual({ subreddit: 'ClaudeAI' });

    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('"runId"');
    expect(logged).toContain('"abc"');
  });

  it('routes orthogonal-routed provider to /v1/proxy/orthogonal/run with wrapped body', async () => {
    let receivedUrl: string | undefined;
    let receivedBody: string | undefined;

    server = await startServer(async (req, res) => {
      receivedUrl = req.url;
      receivedBody = await readBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        data: { email: 'john@stripe.com' },
        cost: { credits: 5, priceCents: 100, requestId: 'req-1' },
      }));
    });
    mockGetCredentials.mockReturnValue(baseCreds(server.url));

    await freshCallCommand().parseAsync([
      'node',
      'test',
      'hunter',
      '/v2/email-finder',
      '--query',
      '{"domain":"stripe.com","first_name":"John"}',
    ]);

    expect(receivedUrl).toBe('/v1/proxy/orthogonal/run');
    expect(JSON.parse(receivedBody!)).toEqual({
      api: 'hunter',
      path: '/v2/email-finder',
      query: { domain: 'stripe.com', first_name: 'John' },
    });

    const logged = consoleLogSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('john@stripe.com');
    expect(loggerModule.info).toHaveBeenCalledWith('Cost: 5 credits');
  });

  it('rejects --body that is not valid JSON', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: {} }));
    });
    mockGetCredentials.mockReturnValue(baseCreds(server.url));

    await expect(
      freshCallCommand().parseAsync(['node', 'test', 'apify', 'x', '--body', 'not-json']),
    ).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('--body must be valid JSON'));
  });

  it('reports Unauthorized on 401', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(401);
      res.end();
    });
    mockGetCredentials.mockReturnValue(baseCreds(server.url));

    await expect(
      freshCallCommand().parseAsync(['node', 'test', 'apify', 'acts/x/runs']),
    ).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
  });
});
