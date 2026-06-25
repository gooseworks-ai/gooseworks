import { Command } from 'commander';
import chalk from 'chalk';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

export const envCommand = new Command('env')
  .description(
    'Print shell export commands for GooseWorks credentials (use: eval $(gooseworks env)). ' +
      'Note: this exposes your API key in the shell environment, where any process you run can read it. ' +
      'Most commands (e.g. "gooseworks call") load credentials on their own — you usually do not need this.'
  )
  .action(() => {
    const creds = getCredentials();
    if (!creds) {
      logger.error('Not logged in. Run "gooseworks login" first.');
      process.exit(1);
    }
    // Warning goes to stderr so it never pollutes `eval $(gooseworks env)` (which captures stdout only).
    console.error(
      chalk.yellow('    ⚠') +
        ' This exports your GOOSEWORKS_API_KEY into the shell environment, where any process you run can read it.\n' +
        '      Prefer commands that load credentials directly (e.g. "gooseworks call"); only export when a script truly needs the env var.'
    );
    console.log(`export GOOSEWORKS_API_KEY="${creds.api_key}"`);
    console.log(`export GOOSEWORKS_API_BASE="${creds.api_base}"`);
  });
