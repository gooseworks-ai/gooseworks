import { HttpError, requestJson } from '../utils/http';
import type { Credentials } from './credentials';

const REVOKE_TIMEOUT_MS = 5_000;

/** `cancelled`, `already_invalid` (the server no longer takes it) or `unreachable`. */
export type RevokeOutcome = 'cancelled' | 'already_invalid' | 'unreachable';

/**
 * Cancels the saved key on the server, so a copy of it (an MCP entry, another
 * tool's config) stops working too. Best effort: the caller forgets the key
 * whatever happens here.
 */
export async function revokeKey(creds: Pick<Credentials, 'api_base' | 'api_key'>): Promise<RevokeOutcome> {
  try {
    await requestJson({
      apiBase: creds.api_base.replace(/\/+$/, ''),
      apiKey: creds.api_key,
      method: 'POST',
      path: '/api/cli/auth/revoke',
      body: {},
      timeoutMs: REVOKE_TIMEOUT_MS,
    });
    return 'cancelled';
  } catch (error) {
    return error instanceof HttpError && error.status === 401 ? 'already_invalid' : 'unreachable';
  }
}
