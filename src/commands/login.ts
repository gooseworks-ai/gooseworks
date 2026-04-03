import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { runOAuthFlow } from '../auth/oauth-server';
import * as logger from '../utils/logger';
import { API_BASE } from '../config';

export const loginCommand = new Command('login')
  .description('Sign in to GooseWorks with Google')
  .option('--api-base <url>', 'API base URL', API_BASE)
  .action(async (opts) => {
    const existing = getCredentials();
    if (existing) {
      logger.success(`Already logged in as ${existing.email}`);
      logger.info('Run "gooseworks logout" first to switch accounts.');
      return;
    }

    try {
      const result = await runOAuthFlow(opts.apiBase);
      logger.success(`Logged in as ${result.email}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      logger.error(message);
      process.exit(1);
    }
  });

/**
 * Ensures the user is logged in, running OAuth if needed.
 * Returns credentials or exits the process.
 */
export async function ensureLoggedIn(apiBase: string = API_BASE) {
  const existing = getCredentials();
  if (existing) return existing;

  const result = await runOAuthFlow(apiBase);
  const creds = getCredentials();
  if (!creds) {
    logger.error('Failed to save credentials after login');
    process.exit(1);
  }
  return creds;
}
