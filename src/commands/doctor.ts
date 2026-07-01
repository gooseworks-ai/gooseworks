import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

/** True if `bin` resolves on PATH (cross-platform). */
function onPath(bin: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  try {
    return spawnSync(probe, [bin], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

/** Playwright is usable either as a global bin or via `npx playwright`. */
function hasPlaywright(): boolean {
  if (onPath('playwright')) return true;
  try {
    return (
      spawnSync('npx', ['--no-install', 'playwright', '--version'], {
        stdio: 'ignore',
      }).status === 0
    );
  } catch {
    return false;
  }
}

interface Check {
  label: string;
  ok: boolean;
  fix: string;
}

/**
 * `gooseworks doctor` — verify the local prerequisites for making VIDEO ads
 * (the goose-video skill renders locally: Playwright records the mockup, ffmpeg
 * stitches/mixes). Also checks auth + that the GooseWorks MCP server is wired,
 * since the skill reads/writes the project over MCP. Exits non-zero if anything
 * is missing so the agent's Phase-0 preflight can relay the fix and stop.
 */
export const doctorCommand = new Command('doctor')
  .description(
    'Check local prerequisites for video ad rendering (ffmpeg, Playwright) + auth/MCP',
  )
  .action(() => {
    const creds = getCredentials();
    const checks: Check[] = [
      { label: 'Logged in', ok: !!creds, fix: 'gooseworks login' },
      {
        label: 'GooseWorks MCP configured',
        ok: !!creds?.mcp_server_url,
        fix: 'gooseworks install --claude --mcp  (then restart Claude Code)',
      },
      {
        label: 'ffmpeg on PATH',
        ok: onPath('ffmpeg'),
        fix: 'brew install ffmpeg (macOS) / apt-get install ffmpeg (Linux)',
      },
      {
        label: 'ffprobe on PATH',
        ok: onPath('ffprobe'),
        fix: 'bundled with ffmpeg — install ffmpeg',
      },
      {
        label: 'Playwright (Chromium renderer)',
        ok: hasPlaywright(),
        fix: 'npx playwright install chromium',
      },
    ];

    logger.info('GooseWorks doctor — prerequisites for local video ad rendering\n');
    let allOk = true;
    for (const c of checks) {
      if (c.ok) {
        logger.success(c.label);
      } else {
        logger.error(`${c.label}  →  fix: ${c.fix}`);
        allOk = false;
      }
    }
    logger.info('');
    if (allOk) {
      logger.success('All set — you can make video ads locally (goose-video).');
    } else {
      logger.warn(
        'Some prerequisites are missing. Fix the items above, then re-run: gooseworks doctor',
      );
      process.exitCode = 1;
    }
  });
