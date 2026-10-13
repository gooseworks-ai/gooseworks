import { Command } from 'commander';
import { clearCredentials, getCredentials, type Credentials } from '../auth/credentials';
import { clearPendingDeviceLogin } from '../auth/device-flow';
import { revokeKey } from '../auth/revoke';
import { otherGooseworksMcpEntries, removeClaudeMcp } from '../agents/claude-mcp';
import * as logger from '../utils/logger';
import { getEnvironment } from '../environment';

export const logoutCommand = new Command('logout')
  .description('Sign out, cancel the saved key and clear saved credentials')
  .action(async () => {
    // An unfinished device sign-in (`login --device --no-wait`) is dropped too,
    // even when no account is signed in yet.
    clearPendingDeviceLogin();
    let existing: Credentials | null = null;
    let broken = false;
    try {
      existing = getCredentials();
    } catch {
      // Saved for another environment or address: clear it so a new sign-in can start.
      broken = true;
    }
    if (!existing && !broken) {
      logger.info('Not currently logged in.');
    } else {
      const revoked = existing ? await revokeKey(existing) : null;
      clearCredentials();
      logger.success(existing ? `Signed out of GooseWorks (was ${existing.email}).` : 'Cleared a saved GooseWorks sign-in that did not match this environment.');
      if (revoked === 'cancelled') logger.info('Its key was cancelled, so any copy of it stops working too.');
      if (revoked === 'unreachable') logger.warn('Could not reach GooseWorks to cancel the old key; it was only removed from this computer.');
    }

    // Only the CLI's own Claude Code entries, and only where the CLI writes them. Removed even with no
    // saved sign-in: a key copied into Claude Code must not outlive logout.
    if (getEnvironment() !== 'production') return;
    if (removeClaudeMcp().length) logger.info('Removed the GooseWorks connection from Claude Code.');
    if (otherGooseworksMcpEntries().length) {
      logger.info('Claude Code also has other GooseWorks connections that were set up by hand; remove them in Claude Code if you no longer need them.');
    }
  });
