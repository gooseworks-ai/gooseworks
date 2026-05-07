import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { requestJson } from '../utils/http';
import * as logger from '../utils/logger';

interface FindResponse {
  status: string;
  data?: unknown;
}

interface DescribeResponse {
  status: string;
  data?: unknown;
}

const findCmd = new Command('find')
  .description('Discover external APIs that can handle your task')
  .argument('<prompt>', 'Natural language description (e.g. "find email by name and company")')
  .option('--limit <n>', 'Max results', (v) => parseInt(v, 10), 5)
  .action(async (prompt: string, opts: { limit: number }) => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    const spin = logger.spinner(`Searching APIs for "${prompt}"...`);
    try {
      const response = await requestJson<FindResponse>({
        apiBase: creds.api_base,
        apiKey: creds.api_key,
        method: 'POST',
        path: '/v1/proxy/orthogonal/search',
        body: { prompt, limit: opts.limit },
      });
      spin.stop();

      const output = response.data !== undefined ? response.data : response;
      console.log(JSON.stringify(output, null, 2));
    } catch (err: unknown) {
      spin.stop();
      const message = err instanceof Error ? err.message : 'API search failed';
      logger.error(message);
      process.exit(1);
    }
  });

const describeCmd = new Command('describe')
  .description('Get an Orthogonal API endpoint\'s parameters before calling')
  .argument('<api>', 'API slug (e.g. "hunter")')
  .argument('<path>', 'Endpoint path (e.g. "/v2/email-finder")')
  .action(async (api: string, path: string) => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    const spin = logger.spinner(`Describing ${api} ${path}...`);
    try {
      const response = await requestJson<DescribeResponse>({
        apiBase: creds.api_base,
        apiKey: creds.api_key,
        method: 'POST',
        path: '/v1/proxy/orthogonal/details',
        body: { api, path },
      });
      spin.stop();

      const output = response.data !== undefined ? response.data : response;
      console.log(JSON.stringify(output, null, 2));
    } catch (err: unknown) {
      spin.stop();
      const message = err instanceof Error ? err.message : 'Describe failed';
      logger.error(message);
      process.exit(1);
    }
  });

export const orthogonalCommand = new Command('orthogonal')
  .description('Discover and describe external APIs via Orthogonal')
  .addCommand(findCmd)
  .addCommand(describeCmd);
