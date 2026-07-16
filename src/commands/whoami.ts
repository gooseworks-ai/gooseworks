import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

/**
 * `gooseworks whoami` — show which account the CLI is currently signed in as.
 *
 * Reads `~/.gooseworks/credentials.json` only (no network call), so it works
 * offline and reflects exactly what the CLI + its MCP registration will
 * authenticate as. This is the answer to "I have multiple accounts — which one
 * is active right now?"; use `gooseworks login` / `logout` to switch.
 */
export const whoamiCommand = new Command('whoami')
  .description('Show which GooseWorks account you are signed in as')
  .option('--json', 'Output raw JSON')
  .action((opts) => {
    const creds = getCredentials();
    if (!creds) {
      if (opts.json) {
        console.log(JSON.stringify({ logged_in: false }, null, 2));
      } else {
        logger.error('Not logged in. Run "gooseworks login" first.');
      }
      process.exit(1);
    }

    const scope = creds.scope_type ?? 'agent';
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            logged_in: true,
            email: creds.email,
            scope_type: scope,
            agent_id: creds.agent_id,
            default_agent_id: creds.default_agent_id ?? creds.agent_id,
            api_base: creds.api_base,
            mcp_server_url: creds.mcp_server_url ?? null,
          },
          null,
          2,
        ),
      );
      return;
    }

    logger.success(`Signed in as ${creds.email}`);
    logger.info(`Scope:      ${scope}`);
    logger.info(`Agent:      ${creds.agent_id}`);
    logger.info(`API base:   ${creds.api_base}`);
    if (creds.mcp_server_url) {
      logger.info(`MCP server: ${creds.mcp_server_url}`);
    }
    logger.info('Run "gooseworks logout" then "gooseworks login" to switch accounts.');
  });
