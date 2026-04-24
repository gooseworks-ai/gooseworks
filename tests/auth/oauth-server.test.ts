import * as http from 'http';

jest.mock('../../src/auth/credentials', () => ({
  saveCredentials: jest.fn(),
}));

jest.mock('open', () => jest.fn().mockResolvedValue(undefined));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
}));

import open from 'open';
import { saveCredentials } from '../../src/auth/credentials';
import { runOAuthFlow } from '../../src/auth/oauth-server';

const mockOpen = open as jest.MockedFunction<typeof open>;
const mockSaveCredentials = saveCredentials as jest.MockedFunction<typeof saveCredentials>;

function extractCallbackParams(url: string): { port: string; state: string } {
  const u = new URL(url);
  return {
    port: u.searchParams.get('callback_port')!,
    state: u.searchParams.get('state')!,
  };
}

function hitCallback(port: string, params: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString();
    const req = http.get(`http://127.0.0.1:${port}/callback?${qs}`, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString('utf-8'),
      }));
    });
    req.on('error', reject);
  });
}

async function waitForOpen(): Promise<string> {
  // Poll until `open` has been called by runOAuthFlow
  for (let i = 0; i < 50; i++) {
    if (mockOpen.mock.calls.length > 0) {
      return mockOpen.mock.calls[0][0] as string;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('open was never called');
}

describe('auth/oauth-server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpen.mockResolvedValue(undefined as any);
  });

  it('completes the OAuth flow, saves credentials, and resolves', async () => {
    const flow = runOAuthFlow('https://api.gooseworks.ai');
    const url = await waitForOpen();
    const { port, state } = extractCallbackParams(url);

    const res = await hitCallback(port, {
      token: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      state,
    });

    const result = await flow;

    expect(res.status).toBe(200);
    expect(result).toMatchObject({
      api_key: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
    });
    expect(mockSaveCredentials).toHaveBeenCalledWith(expect.objectContaining({
      api_key: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      api_base: 'https://api.gooseworks.ai',
    }));
  });

  it('returns 400 when state does not match', async () => {
    const flow = runOAuthFlow('https://api.gooseworks.ai');
    const url = await waitForOpen();
    const { port } = extractCallbackParams(url);

    const res = await hitCallback(port, {
      token: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      state: 'wrong-state',
    });

    expect(res.status).toBe(400);
    expect(res.body).toContain('invalid state');
    expect(mockSaveCredentials).not.toHaveBeenCalled();

    // Finish the flow with the correct state so the promise resolves and cleans up
    const { state: realState } = extractCallbackParams(url);
    await hitCallback(port, {
      token: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      state: realState,
    });
    await flow;
  });

  it('returns 400 when required params are missing', async () => {
    const flow = runOAuthFlow('https://api.gooseworks.ai');
    const url = await waitForOpen();
    const { port, state } = extractCallbackParams(url);

    const res = await hitCallback(port, { state });

    expect(res.status).toBe(400);
    expect(res.body).toContain('missing parameters');
    expect(mockSaveCredentials).not.toHaveBeenCalled();

    // Finish the flow so cleanup runs
    await hitCallback(port, {
      token: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      state,
    });
    await flow;
  });

  it('forwards optional fields (scope_type, default_agent_id, mcp_server_url) into credentials', async () => {
    const flow = runOAuthFlow('https://api.gooseworks.ai');
    const url = await waitForOpen();
    const { port, state } = extractCallbackParams(url);

    await hitCallback(port, {
      token: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      scope_type: 'user',
      default_agent_id: 'agent-default',
      mcp_server_url: 'http://localhost:6200',
      state,
    });

    await flow;

    expect(mockSaveCredentials).toHaveBeenCalledWith(expect.objectContaining({
      scope_type: 'user',
      default_agent_id: 'agent-default',
      mcp_server_url: 'http://localhost:6200',
    }));
  });
});
