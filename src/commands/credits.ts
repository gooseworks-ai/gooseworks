import { Command } from 'commander';
import * as https from 'https';
import * as http from 'http';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

interface CreditsResponse {
  status: string;
  data: {
    available_credits: number;
    subscription_credits: number;
    purchased_credits: number;
  };
}

function statusToMessage(status: number): string {
  if (status === 401) {
    return 'Unauthorized — your API key may be invalid. Run "gooseworks login" to re-authenticate.';
  }
  if (status === 403) {
    return 'Forbidden — your account may lack access to this endpoint.';
  }
  if (status === 404) {
    return 'Credits endpoint not found (server may be out of date).';
  }
  if (status >= 500) {
    return `Server error (${status}). Please try again later.`;
  }
  return `Request failed with status ${status}.`;
}

function fetchCredits(apiBase: string, apiKey: string): Promise<CreditsResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${apiBase}/v1/credits`);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.get(url.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (status < 200 || status >= 300) {
          reject(new Error(statusToMessage(status)));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('Invalid response from server'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

export const creditsCommand = new Command('credits')
  .description('Check your GooseWorks credit balance')
  .action(async () => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }

    try {
      const response = await fetchCredits(creds.api_base, creds.api_key);
      if (response.status === 'error') {
        logger.error('Failed to fetch credits');
        process.exit(1);
      }
      const { available_credits, subscription_credits, purchased_credits } = response.data;
      logger.success(
        `Credits: ${available_credits.toLocaleString()} available (${subscription_credits.toLocaleString()} subscription + ${purchased_credits.toLocaleString()} purchased)`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch credits';
      logger.error(message);
      process.exit(1);
    }
  });
