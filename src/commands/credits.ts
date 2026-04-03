import { Command } from 'commander';
import * as https from 'https';
import * as http from 'http';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

interface CreditsResponse {
  status: string;
  data: {
    available: number;
    subscription: number;
    purchased: number;
  };
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
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          resolve(body);
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
      const { available, subscription, purchased } = response.data;
      logger.success(
        `Credits: ${available.toLocaleString()} available (${subscription.toLocaleString()} subscription + ${purchased.toLocaleString()} purchased)`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch credits';
      logger.error(message);
      process.exit(1);
    }
  });
