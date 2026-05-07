import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { requestJson } from '../utils/http';
import * as logger from '../utils/logger';

const DIRECT_PROXIES = new Set(['apify', 'apollo', 'crustdata']);

interface CallResponse {
  status?: string;
  data?: unknown;
  cost?: { credits?: number; priceCents?: number; requestId?: string };
  [key: string]: unknown;
}

function parseJsonOption(value: string | undefined, name: string): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new Error(`--${name} must be valid JSON: ${(err as Error).message}`);
  }
}

export const callCommand = new Command('call')
  .description('Call any external provider (apify, apollo, crustdata, hunter, pdl, etc.)')
  .argument('<provider>', 'Provider name (e.g. "apify", "hunter", "pdl")')
  .argument('<path>', 'Endpoint path (e.g. "acts/.../runs", "/v2/email-finder")')
  .option('--method <verb>', 'HTTP method (only used for direct-proxy providers; default POST)', 'POST')
  .option('--body <json>', 'Request body as JSON string')
  .option('--query <json>', 'Query parameters as JSON string')
  .action(async (
    provider: string,
    path: string,
    opts: { method?: string; body?: string; query?: string },
  ) => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    let bodyParsed: unknown;
    let queryParsed: unknown;
    try {
      bodyParsed = parseJsonOption(opts.body, 'body');
      queryParsed = parseJsonOption(opts.query, 'query');
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(1);
    }

    const isDirect = DIRECT_PROXIES.has(provider.toLowerCase());
    let endpointPath: string;
    let method: string;
    let body: unknown;
    let query: Record<string, string | number | boolean | undefined> | undefined;

    if (isDirect) {
      const cleanPath = path.replace(/^\/+/, '');
      endpointPath = `/v1/proxy/${provider.toLowerCase()}/${cleanPath}`;
      method = (opts.method ?? 'POST').toUpperCase();
      body = bodyParsed;
      if (queryParsed && typeof queryParsed === 'object') {
        query = queryParsed as Record<string, string | number | boolean | undefined>;
      }
    } else {
      endpointPath = '/v1/proxy/orthogonal/run';
      method = 'POST';
      body = {
        api: provider,
        path,
        ...(queryParsed !== undefined ? { query: queryParsed } : {}),
        ...(bodyParsed !== undefined ? { body: bodyParsed } : {}),
      };
    }

    const spin = logger.spinner(`Calling ${provider} ${path}...`);
    try {
      const response = await requestJson<CallResponse>({
        apiBase: creds.api_base,
        apiKey: creds.api_key,
        method,
        path: endpointPath,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        query,
      });
      spin.stop();

      const output = response.data !== undefined ? response.data : response;
      console.log(JSON.stringify(output, null, 2));

      if (response.cost?.credits !== undefined) {
        const c = response.cost.credits;
        logger.info(`Cost: ${c} credit${c === 1 ? '' : 's'}`);
      }
    } catch (err: unknown) {
      spin.stop();
      const message = err instanceof Error ? err.message : 'Call failed';
      logger.error(message);
      process.exit(1);
    }
  });
