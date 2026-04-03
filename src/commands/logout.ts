import { Command } from 'commander';
import { clearCredentials, getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

export const logoutCommand = new Command('logout')
  .description('Sign out and clear saved credentials')
  .action(async () => {
    const existing = getCredentials();
    if (!existing) {
      logger.info('Not currently logged in.');
      return;
    }

    clearCredentials();
    logger.success(`Logged out (was ${existing.email})`);
  });
