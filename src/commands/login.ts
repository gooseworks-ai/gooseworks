import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { runOAuthFlow } from '../auth/oauth-server';
import { getInstalledSkills, installManagedEntrySkills } from '../skills/installer';
import { getEntrySkills } from '../skills/master-skill';
import { configureClaude } from '../agents/claude';
import { configureClaudeMcp } from '../agents/claude-mcp';
import { isAgentInstalled } from '../agents/detect';
import * as logger from '../utils/logger';
import { API_BASE } from '../config';
import { recordAttributionRef } from '../auth/attribution';

/**
 * Refresh vendored entry skills on login for users who have already set up
 * (`gooseworks` skill present). This is the "update skills on login": it picks up
 * new or content-changed entry skills (e.g. the goose-ads skill) without
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

/**
 * Re-point the `gooseworks` MCP registration at the backend we just logged into
 * (from `creds.mcp_server_url`). `install`/`update` already do this, but plain
 * `login` didn't — so switching backends (e.g. prod → local dev) left the MCP
 * tools pointed at the OLD backend even though the CLI creds were correct. That
 * mismatch reads as "project not found" / wrong org on every `mcp__gooseworks__*`
 * call, while `doctor` (creds-only) still passes — a confusing trap.
 */
function syncMcpRegistration(): void {
  if (configureClaudeMcp()) {
    const creds = getCredentials();
    logger.info(`Synced the gooseworks MCP → ${creds?.mcp_server_url ?? 'the configured server'}`);
  }
}

/** The first request automatically starts or resumes shared onboarding. */
function showNextSteps(): void {
  logger.info('Open Claude/Codex and ask for the work you want done.');
  logger.info('Your first request automatically starts or resumes onboarding.');
}

export const loginCommand = new Command('login')
  .description('Sign in to GooseWorks with Google')
  .option('--api-base <url>', 'API base URL', API_BASE)
  .option('--ref <code>', 'Referral or marketing campaign code for attribution')
  .action(async (opts) => {
    const existing = getCredentials();
    if (existing) {
      logger.success(`Already logged in as ${existing.email}`);
      await recordAttributionRef(existing.api_base || opts.apiBase, opts.ref, existing.api_key);
      refreshEntrySkillsOnLogin();
      syncMcpRegistration();
      logger.info('Run "gooseworks logout" first to switch accounts.');
      return;
    }

    try {
      const result = await runOAuthFlow(opts.apiBase, opts.ref);
      await recordAttributionRef(opts.apiBase, opts.ref, result.api_key);
      logger.success(`Logged in as ${result.email}`);
      refreshEntrySkillsOnLogin();
      syncMcpRegistration();
      showNextSteps();
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
export async function ensureLoggedIn(apiBase: string = API_BASE, ref?: string) {
  const existing = getCredentials();
  if (existing) {
    await recordAttributionRef(existing.api_base || apiBase, ref, existing.api_key);
    return existing;
  }

  const result = await runOAuthFlow(apiBase, ref);
  const creds = getCredentials();
  if (!creds) {
    logger.error('Failed to save credentials after login');
    process.exit(1);
  }
  await recordAttributionRef(apiBase, ref, creds.api_key);
  return creds;
}
