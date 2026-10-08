import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { profileRoot, selectEnvironment } from '../../src/environment';
import { NOT_A_SIGN_IN_MESSAGE, parsePastedSignIn, pasteLogin } from '../../src/auth/paste-login';
import { startStubApi, type StubApi } from './stub-api';

const WHOAMI = '/api/cli/auth/whoami';
const CREDITS = '/v1/credits';

function callbackUrl(host: string, params: Record<string, string>): string {
  return `http://${host}/callback?${new URLSearchParams(params).toString()}`;
}

const urlParams = {
  token: 'cal_pasted_token',
  email: 'url@example.com',
  agent_id: 'agent-url',
  state: 'abc123',
  scope_type: 'user',
  default_agent_id: 'agent-url',
};

describe('auth/paste-login', () => {
  describe('parsePastedSignIn', () => {
    const expected = {
      kind: 'callback',
      token: 'cal_pasted_token',
      email: 'url@example.com',
      agent_id: 'agent-url',
      scope_type: 'user',
      default_agent_id: 'agent-url',
    };

    it('parses the full localhost callback address', () => {
      expect(parsePastedSignIn(callbackUrl('localhost:51234', urlParams))).toEqual(expected);
    });

    it('parses a 127.0.0.1 callback address, keeping api_base and mcp_server_url', () => {
      const parsed = parsePastedSignIn(callbackUrl('127.0.0.1:51234', {
        ...urlParams,
        api_base: 'https://api.gooseworks.ai',
        mcp_server_url: 'https://mcp.gooseworks.ai/mcp',
      }));
      expect(parsed).toEqual({ ...expected, api_base: 'https://api.gooseworks.ai', mcp_server_url: 'https://mcp.gooseworks.ai/mcp' });
    });

    it('parses the query string alone, with or without "?"', () => {
      const query = new URLSearchParams(urlParams).toString();
      expect(parsePastedSignIn(`?${query}`)).toEqual(expected);
      expect(parsePastedSignIn(query)).toEqual(expected);
    });

    it('parses an address without its scheme, as browsers display it', () => {
      expect(parsePastedSignIn(callbackUrl('localhost:51234', urlParams).replace('http://', ''))).toEqual(expected);
    });

    it('strips surrounding quotes, backticks, angle brackets and whitespace', () => {
      const url = callbackUrl('localhost:51234', urlParams);
      expect(parsePastedSignIn(`  "${url}"\n`)).toEqual(expected);
      expect(parsePastedSignIn(`'<${url}>'`)).toEqual(expected);
      expect(parsePastedSignIn('`cal_raw_key`')).toEqual({ kind: 'key', key: 'cal_raw_key' });
    });

    it('accepts a raw GooseWorks key', () => {
      expect(parsePastedSignIn('cal_raw_key_123')).toEqual({ kind: 'key', key: 'cal_raw_key_123' });
    });

    it('rejects garbage, foreign hosts, other paths and non-GooseWorks tokens', () => {
      for (const value of [
        '',
        'hello world',
        'cal_has whitespace',
        callbackUrl('evil.example.com', urlParams),
        `https://evil.example.com/callback?${new URLSearchParams(urlParams)}`,
        callbackUrl('localhost:51234', urlParams).replace('/callback', '/other'),
        callbackUrl('localhost:51234', { ...urlParams, token: 'sk_live_nope' }),
        callbackUrl('localhost:51234', { token: 'cal_x', email: 'u@example.com' }),
      ]) {
        expect(() => parsePastedSignIn(value)).toThrow(NOT_A_SIGN_IN_MESSAGE);
      }
    });
  });

  describe('pasteLogin', () => {
    let api: StubApi;
    let home: string;
    const savedHome = process.env.GOOSEWORKS_USER_HOME;
    const credentialsPath = () => path.join(profileRoot(), 'credentials.json');
    const saved = () => JSON.parse(fs.readFileSync(credentialsPath(), 'utf-8'));
    const pastedUrl = (extra: Record<string, string> = {}) => callbackUrl('localhost:51234', { ...urlParams, api_base: api.base, ...extra });

    beforeAll(async () => { api = await startStubApi(); });
    afterAll(async () => { await api.close(); });
    beforeEach(() => {
      selectEnvironment('production');
      api.reset();
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-paste-'));
      process.env.GOOSEWORKS_USER_HOME = home;
    });
    afterEach(() => {
      if (savedHome === undefined) delete process.env.GOOSEWORKS_USER_HOME;
      else process.env.GOOSEWORKS_USER_HOME = savedHome;
      fs.rmSync(home, { recursive: true, force: true });
    });

    it('verifies a pasted address with whoami and saves the server\'s identity', async () => {
      api.replies[WHOAMI] = [{
        status: 200,
        body: {
          status: 'success',
          data: {
            email: 'server@example.com',
            agent_id: 'agent-server',
            default_agent_id: 'agent-server',
            scope_type: 'user',
            api_base: 'https://api.gooseworks.ai',
            mcp_server_url: 'http://localhost:6200',
          },
        },
      }];

      const result = await pasteLogin(pastedUrl(), 'https://api.gooseworks.ai');

      expect(api.calls(WHOAMI)).toHaveLength(1);
      expect(api.calls(WHOAMI)[0].headers.authorization).toBe('Bearer cal_pasted_token');
      expect(result).toMatchObject({ api_key: 'cal_pasted_token', email: 'server@example.com', agent_id: 'agent-server' });
      expect(saved()).toEqual({
        api_key: 'cal_pasted_token',
        email: 'server@example.com',
        agent_id: 'agent-server',
        api_base: api.base,
        scope_type: 'user',
        default_agent_id: 'agent-server',
        mcp_server_url: 'http://localhost:6200',
      });
      expect(fs.statSync(credentialsPath()).mode & 0o777).toBe(0o600);
    });

    it('accepts a bare key when the server confirms it', async () => {
      api.replies[WHOAMI] = [{ status: 200, body: { status: 'success', data: { email: 'server@example.com', agent_id: 'agent-server', scope_type: 'user' } } }];

      await pasteLogin('cal_bare_key', api.base);

      expect(saved()).toMatchObject({ api_key: 'cal_bare_key', email: 'server@example.com', agent_id: 'agent-server', api_base: api.base });
    });

    it('falls back to /v1/credits on an older server and uses the address fields', async () => {
      api.replies[WHOAMI] = [{ status: 404, body: { status: 'error' } }];
      api.replies[CREDITS] = [{ status: 200, body: { balance: 100 } }];

      await pasteLogin(pastedUrl(), 'https://api.gooseworks.ai');

      expect(api.calls(CREDITS)).toHaveLength(1);
      expect(api.calls(CREDITS)[0].headers.authorization).toBe('Bearer cal_pasted_token');
      expect(saved()).toEqual({
        api_key: 'cal_pasted_token',
        email: 'url@example.com',
        agent_id: 'agent-url',
        api_base: api.base,
        scope_type: 'user',
        default_agent_id: 'agent-url',
      });
    });

    it('refuses a bare key on a server without whoami', async () => {
      api.replies[WHOAMI] = [{ status: 404, body: { status: 'error' } }];

      await expect(pasteLogin('cal_bare_key', api.base)).rejects.toThrow("This server can't check a bare key yet. Paste the full address from your browser instead.");
      expect(api.calls(CREDITS)).toHaveLength(0);
      expect(fs.existsSync(credentialsPath())).toBe(false);
    });

    it('reports an invalid key (401) and saves nothing', async () => {
      api.replies[WHOAMI] = [{ status: 401, body: { status: 'error' } }];

      await expect(pasteLogin(pastedUrl(), 'https://api.gooseworks.ai')).rejects.toThrow("That sign-in key isn't valid any more. Run gooseworks login again.");
      expect(fs.existsSync(credentialsPath())).toBe(false);
    });

    it('reports an invalid key when the credits fallback answers 401', async () => {
      api.replies[WHOAMI] = [{ status: 404, body: { status: 'error' } }];
      api.replies[CREDITS] = [{ status: 401, body: { status: 'error' } }];

      await expect(pasteLogin(pastedUrl(), 'https://api.gooseworks.ai')).rejects.toThrow("That sign-in key isn't valid any more.");
      expect(fs.existsSync(credentialsPath())).toBe(false);
    });

    it('rejects an address that points at a foreign API without calling it', async () => {
      // .invalid never resolves (RFC 2606), so even a broken guard sends nothing anywhere.
      await expect(pasteLogin(pastedUrl({ api_base: 'https://evil.invalid' }), 'https://api.gooseworks.ai'))
        .rejects.toThrow('Unrecognized api connection host');
      expect(api.requests).toHaveLength(0);
      expect(fs.existsSync(credentialsPath())).toBe(false);
    });

    it('needs a value when stdin is not a terminal, and prompts when it is', async () => {
      await expect(pasteLogin(undefined, api.base, { isTTY: false })).rejects.toThrow(/gooseworks login --paste/);

      api.replies[WHOAMI] = [{ status: 200, body: { status: 'success', data: { email: 'server@example.com', agent_id: 'agent-server' } } }];
      const prompt = jest.fn().mockResolvedValue('cal_prompted_key');
      await pasteLogin(undefined, api.base, { isTTY: true, prompt });

      expect(prompt).toHaveBeenCalledWith('Paste the address your browser showed (or your key): ');
      expect(saved()).toMatchObject({ api_key: 'cal_prompted_key' });
    });
  });
});
