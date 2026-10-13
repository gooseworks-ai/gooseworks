import { HttpError, requestJson } from '../utils/http';
import type { Credentials } from './credentials';

const REVOKE_TIMEOUT_MS = 5_000;

/** `already_invalid`: the server no longer takes it. `unsupported`: a server with no way to cancel keys yet. */
export type RevokeOutcome = 'cancelled' | 'already_invalid' | 'unsupported' | 'unreachable';

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
    if (error instanceof HttpError && error.status === 401) return 'already_invalid';
    if (error instanceof HttpError && error.status === 404) return 'unsupported';
    return 'unreachable';
  }
}
