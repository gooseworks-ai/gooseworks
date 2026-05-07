import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

export const envCommand = new Command('env')
  .description('Print shell export commands for GooseWorks credentials (use: eval $(gooseworks env))')
  .action(() => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }
    console.log(`export GOOSEWORKS_API_KEY="${creds.api_key}"`);
    console.log(`export GOOSEWORKS_API_BASE="${creds.api_base}"`);
  });
