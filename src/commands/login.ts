import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { runOAuthFlow } from '../auth/oauth-server';
import { getInstalledSkills, installManagedEntrySkills } from '../skills/installer';
import { getEntrySkills } from '../skills/master-skill';
import { configureClaude } from '../agents/claude';
import { isAgentInstalled } from '../agents/detect';
import * as logger from '../utils/logger';
import { API_BASE } from '../config';

/**
 * Refresh vendored entry skills on login for users who have already set up
 * (`gooseworks` skill present). This is the "update skills on login": it picks up
 * new or content-changed entry skills (e.g. the ads-remix skill) without
 * rewriting unchanged ones, then re-symlinks Claude so the new skill is visible.
 * Bootstrapping a first-time install stays the job of `gooseworks install`.
 */
function refreshEntrySkillsOnLogin(): void {
  if (!getInstalledSkills().includes('gooseworks')) return;
  const changed = installManagedEntrySkills(getEntrySkills())
    .filter((r) => r.action === 'installed')
    .map((r) => r.name);
  if (changed.length === 0) return;
  logger.success(`Refreshed skills: ${changed.join(', ')}`);
  if (isAgentInstalled('claude')) configureClaude();
}

export const loginCommand = new Command('login')
  .description('Sign in to GooseWorks with Google')
  .option('--api-base <url>', 'API base URL', API_BASE)
  .action(async (opts) => {
    const existing = getCredentials();
    if (existing) {
      logger.success(`Already logged in as ${existing.email}`);
      refreshEntrySkillsOnLogin();
      logger.info('Run "gooseworks logout" first to switch accounts.');
      return;
    }

    try {
      const result = await runOAuthFlow(opts.apiBase);
      logger.success(`Logged in as ${result.email}`);
      refreshEntrySkillsOnLogin();
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
