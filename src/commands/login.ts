import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { runOAuthFlow, type OAuthResult } from '../auth/oauth-server';
import { DeviceFlowUnavailableError, readPendingDeviceLogin, runDeviceFlow } from '../auth/device-flow';
import { chooseLoginMode } from '../auth/login-mode';
import { pasteLogin } from '../auth/paste-login';
import { getInstalledSkills, installManagedEntrySkills } from '../skills/installer';
import { getEntrySkills } from '../skills/master-skill';
import { configureClaude } from '../agents/claude';
import { configureClaudeMcp } from '../agents/claude-mcp';
import { isAgentInstalled } from '../agents/detect';
import * as logger from '../utils/logger';
import { API_BASE } from '../config';
import { recordAttributionRef } from '../auth/attribution';
import { readEntryFreshnessReport, reportEntrySkillFreshness } from './skills';
import { assertConnection, getEnvironment } from '../environment';

/**
 * Refresh vendored entry skills on login for users who have already set up
 * (`gooseworks` skill present). This is the "update skills on login": it picks up
 * new or content-changed entry skills (e.g. the goose-ads skill) without
 * rewriting unchanged ones, then re-symlinks Claude so the new skill is visible.
 * Bootstrapping a first-time install stays the job of `gooseworks install`.
 */
async function refreshEntrySkillsOnLogin(): Promise<void> {
  if (getEnvironment() === 'staging') return;
  if (!getInstalledSkills().includes('gooseworks')) return;
  const freshness = await readEntryFreshnessReport();
  await reportEntrySkillFreshness(freshness);
  if (freshness.cli === 'outdated') return;
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
  if (getEnvironment() === 'staging') return;
  // Only re-point a Claude Code that is here. Without it (a cloud agent's
  // sandbox, GOOSE-3937) this would create ~/.claude.json holding the key.
  if (!isAgentInstalled('claude')) return;
  if (configureClaudeMcp()) {
    const creds = getCredentials();
    logger.info(`Synced the gooseworks MCP → ${creds?.mcp_server_url ?? 'the configured server'}`);
  }
}

/** After a fresh login, point the user at a normal first request — not a special onboard command. */
function showNextSteps(): void {
  logger.info('You do not need a special onboarding command. Ask GooseWorks to do a normal task, or say:');
  logger.example('Set up GooseWorks for https://yourcompany.com');
  logger.info('The agent preserves that request while it completes any missing company setup.');
}

export interface SignInFlags {
  device?: boolean;
  browser?: boolean;
  /** false with `--no-wait`: print the device link and return without waiting. */
  wait?: boolean;
}

export type SignInOutcome = { status: 'done'; result: OAuthResult } | { status: 'pending' };

/**
 * Signs in with the browser (localhost callback) or device (code + link) flow,
 * picked by `chooseLoginMode`. An auto-chosen device sign-in falls back to the
 * browser when the server predates it; an explicit `--device` does not.
 */
export async function signIn(apiBase: string, ref: string | undefined, flags: SignInFlags = {}): Promise<SignInOutcome> {
  const noWait = flags.wait === false;
  const { mode } = chooseLoginMode({
    device: flags.device,
    browser: flags.browser,
    noWait,
    pendingLogin: readPendingDeviceLogin(apiBase) !== null,
  });
  if (mode === 'device') {
    try {
      const outcome = await runDeviceFlow(apiBase, { ref, wait: !noWait });
      return outcome.status === 'done' ? outcome : { status: 'pending' };
    } catch (err) {
      if (!(err instanceof DeviceFlowUnavailableError)) throw err;
      if (flags.device || noWait) {
        throw new Error("Device sign-in isn't available on this server yet. Run gooseworks login --browser instead.");
      }
      logger.warn("Device sign-in isn't available on this server yet; using browser sign-in.");
    }
  }
  return { status: 'done', result: await runOAuthFlow(apiBase, ref) };
}

async function finishLogin(apiBase: string, ref: string | undefined, result: OAuthResult): Promise<void> {
  await recordAttributionRef(apiBase, ref, result.api_key);
  logger.success(`Logged in as ${result.email}`);
  await refreshEntrySkillsOnLogin();
  syncMcpRegistration();
  showNextSteps();
}

export function createLoginCommand(): Command {
  return new Command('login')
  .description('Sign in to GooseWorks with Google')
  .option('--api-base <url>', 'API base URL', API_BASE)
  .option('--ref <code>', 'Referral or marketing campaign code for attribution')
  .option('--device', 'Sign in from any device with a code (for cloud agents, SSH)')
  .option('--browser', 'Sign in with a browser on this computer')
  .option('--no-wait', 'With --device: print the link and exit; run the command again to finish')
  .option('--paste [value]', 'Finish sign-in from the address your browser showed, or a GooseWorks key')
  .action(async (opts) => {
    assertConnection(opts.apiBase, 'api');
    if (opts.browser && (opts.device || opts.wait === false)) {
      logger.error('--browser signs in on this computer; it cannot be combined with --device or --no-wait.');
      process.exit(1);
      return;
    }

    if (opts.paste !== undefined) {
      try {
        const result = await pasteLogin(typeof opts.paste === 'string' ? opts.paste : undefined, opts.apiBase);
        await finishLogin(opts.apiBase, opts.ref, result);
      } catch (err: unknown) {
        logger.error(err instanceof Error ? err.message : 'Login failed');
        process.exit(1);
      }
      return;
    }

    const existing = getCredentials();
    if (existing) {
      logger.success(`Already logged in as ${existing.email}`);
      await recordAttributionRef(existing.api_base || opts.apiBase, opts.ref, existing.api_key);
      await refreshEntrySkillsOnLogin();
      syncMcpRegistration();
      logger.info('Run "gooseworks logout" first to switch accounts.');
      return;
    }

    try {
      const outcome = await signIn(opts.apiBase, opts.ref, { device: opts.device, browser: opts.browser, wait: opts.wait });
      if (outcome.status === 'pending') {
        logger.info('After you approve, run this command again (without --no-wait) to finish.');
        return;
      }
      await finishLogin(opts.apiBase, opts.ref, outcome.result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      logger.error(message);
      process.exit(1);
    }
  });
}

export const loginCommand = createLoginCommand();

/**
 * Ensures the user is logged in, signing in (browser or device) if needed.
 * Returns credentials or exits the process.
 */
export async function ensureLoggedIn(apiBase: string = API_BASE, ref?: string) {
  assertConnection(apiBase, 'api');
  const existing = getCredentials();
  if (existing) {
    await recordAttributionRef(existing.api_base || apiBase, ref, existing.api_key);
    return existing;
  }

  // No flags: a pending `login --device --no-wait` is resumed here, which is
  // how `install --skills-only` finishes what that command started.
  await signIn(apiBase, ref);
  const creds = getCredentials();
  if (!creds) {
    logger.error('Failed to save credentials after login');
    process.exit(1);
  }
  await recordAttributionRef(apiBase, ref, creds.api_key);
  return creds;
}
