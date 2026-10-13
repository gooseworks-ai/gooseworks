import { revokeKey } from '../../src/auth/revoke';
import { startStubApi, type StubApi } from './stub-api';

const REVOKE = '/api/cli/auth/revoke';
let api: StubApi;

beforeAll(async () => { api = await startStubApi(); });
afterAll(async () => { await api.close(); });
beforeEach(() => api.reset());

describe('revokeKey', () => {
  it('cancels the key it presents, and only with that key', async () => {
    api.replies[REVOKE] = [{ status: 200, body: { status: 'success' } }];
    await expect(revokeKey({ api_base: `${api.base}/`, api_key: 'cal_old' })).resolves.toBe('cancelled');
    expect(api.calls(REVOKE)).toHaveLength(1);
    expect(api.calls(REVOKE)[0].method).toBe('POST');
    expect(api.calls(REVOKE)[0].headers.authorization).toBe('Bearer cal_old');
  });

  it('tells a key the server no longer takes from one it could not reach', async () => {
    api.replies[REVOKE] = [{ status: 401, body: { status: 'error' } }];
    await expect(revokeKey({ api_base: api.base, api_key: 'cal_old' })).resolves.toBe('already_invalid');
    await expect(revokeKey({ api_base: 'http://127.0.0.1:9', api_key: 'cal_old' })).resolves.toBe('unreachable');
  });

  it('tells a server that cannot cancel keys yet from one it could not reach', async () => {
    api.replies[REVOKE] = [{ status: 404, body: { status: 'error' } }];
    await expect(revokeKey({ api_base: api.base, api_key: 'cal_old' })).resolves.toBe('unsupported');
  });
});
