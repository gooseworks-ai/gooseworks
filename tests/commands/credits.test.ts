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
import { creditsCommand } from '../../src/commands/credits';

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

describe('credits command', () => {
  let processExitSpy: jest.SpyInstance;
  let server: { url: string; close: () => Promise<void> } | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(async () => {
    processExitSpy.mockRestore();
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('exits when not logged in', async () => {
    mockGetCredentials.mockReturnValue(null);

    await expect(creditsCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Not logged in. Run "gooseworks login" first.');
  });

  it('prints credit balance on 200 response', async () => {
    server = await startServer((req, res) => {
      expect(req.url).toBe('/v1/credits');
      expect(req.headers.authorization).toBe('Bearer cal_test');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        data: {
          available_credits: 1234,
          subscription_credits: 1000,
          purchased_credits: 234,
        },
      }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await creditsCommand.parseAsync(['node', 'test']);

    expect(loggerModule.success).toHaveBeenCalledWith(
      expect.stringContaining('1,234 available')
    );
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('reports Unauthorized message on 401', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'bad key' }));
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_bad',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(creditsCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(
      expect.stringContaining('Unauthorized')
    );
  });

  it('reports Server error on 500', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(500);
      res.end('internal');
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(creditsCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith(
      expect.stringContaining('Server error (500)')
    );
  });

  it('reports Invalid response on malformed JSON', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('not json at all');
    });

    mockGetCredentials.mockReturnValue({
      api_key: 'cal_test',
      email: 'u@example.com',
      agent_id: 'agent-1',
      api_base: server.url,
    });

    await expect(creditsCommand.parseAsync(['node', 'test'])).rejects.toThrow('process.exit called');

    expect(loggerModule.error).toHaveBeenCalledWith('Invalid response from server');
  });
});
