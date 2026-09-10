import * as http from 'http';

// Mock the same collaborators the oauth-server test mocks so runOAuthFlow can
// run without touching the real filesystem, browser, or logger.
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

// FRONTEND_URL is resolved from the environment at module-load time, so each
// scenario resets the module registry and re-imports oauth-server after setting
// (or clearing) GOOSEWORKS_FRONTEND_URL. This mirrors how the published CLI is
// invoked with the env either unset (production default) or overridden.
async function openedAuthUrl(
  env: string | undefined,
  apiBase: string,
  attributionRef?: string,
): Promise<string> {
  jest.resetModules();
  if (env === undefined) {
    delete process.env.GOOSEWORKS_FRONTEND_URL;
  } else {
    process.env.GOOSEWORKS_FRONTEND_URL = env;
  }

  const open = require('open') as jest.Mock;
  open.mockClear();
  const { runOAuthFlow } = require('../../src/auth/oauth-server');

  const flow = runOAuthFlow(apiBase, attributionRef);

  // Wait until the browser open has been invoked, then capture the URL.
  let url = '';
  for (let i = 0; i < 100; i++) {
    if (open.mock.calls.length > 0) {
      url = open.mock.calls[0][0] as string;
      break;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  if (!url) throw new Error('open was never called');

  // Complete the callback so the flow resolves and the server closes.
  const u = new URL(url);
  const port = u.searchParams.get('callback_port')!;
  const state = u.searchParams.get('state')!;
  await new Promise<void>((resolve, reject) => {
    const qs = new URLSearchParams({
      token: 'cal_token',
      email: 'user@example.com',
      agent_id: 'agent-123',
      state,
    }).toString();
    http
      .get(`http://127.0.0.1:${port}/callback?${qs}`, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      })
      .on('error', reject);
  });
  await flow;

  return url;
}

describe('cli auth URL (frontend default flip)', () => {
  const savedEnv = process.env.GOOSEWORKS_FRONTEND_URL;
  afterAll(() => {
    if (savedEnv === undefined) delete process.env.GOOSEWORKS_FRONTEND_URL;
    else process.env.GOOSEWORKS_FRONTEND_URL = savedEnv;
  });

  it('defaults to make.gooseworks.ai/cli/auth when the env override is unset', async () => {
    const url = await openedAuthUrl(undefined, 'https://api.gooseworks.ai');
    expect(url.startsWith('https://make.gooseworks.ai/cli/auth')).toBe(true);
    expect(url).not.toContain('app.gooseworks.ai');
  });

  it('lets GOOSEWORKS_FRONTEND_URL override the default', async () => {
    const url = await openedAuthUrl('http://localhost:4000', 'http://localhost:5999');
    expect(url.startsWith('http://localhost:4000/cli/auth')).toBe(true);
  });

  it('forwards callback_port, state, api_base, and creator_ref into the opened URL', async () => {
    const url = await openedAuthUrl(undefined, 'https://api.gooseworks.ai', 'K7M2QX9P');
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://make.gooseworks.ai/cli/auth');
    expect(u.searchParams.get('callback_port')).toMatch(/^\d+$/);
    expect(u.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/);
    expect(u.searchParams.get('api_base')).toBe('https://api.gooseworks.ai');
    expect(u.searchParams.get('creator_ref')).toBe('K7M2QX9P');
  });
});
