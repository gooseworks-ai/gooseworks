import { Command } from 'commander';
import { clearCredentials, getCredentials } from '../auth/credentials';
import { removeClaudeMcp } from '../agents/claude-mcp';
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
    // Also drop the `gooseworks` MCP registration from ~/.claude.json. Otherwise
    // it lingers pointing at the logged-out backend with a now-dead token — the
    // classic "project not found" / wrong-org trap when you later log into a
    // different backend (e.g. local dev) without re-registering.
    removeClaudeMcp();
    logger.success(`Logged out (was ${existing.email}) — cleared credentials + MCP registration`);
  });
