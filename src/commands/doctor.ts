import { Command } from 'commander';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';

/** Run a binary and capture its output; never throws. */
function run(bin: string, args: string[]): { status: number | null; out: string } {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch {
    return { status: null, out: '' };
  }
}

/** True if `bin` resolves on PATH (cross-platform). */
function onPath(bin: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return run(probe, [bin]).status === 0;
}

/**
 * Local video renders burn subtitles with libass and encode with libx264. An
 * ffmpeg without either passes a bare `which ffmpeg` and then fails mid-render,
 * so check the build, not the path.
 */
function ffmpegBuild(): { ok: boolean; detail: string } {
  if (!onPath('ffmpeg')) return { ok: false, detail: 'ffmpeg is not on PATH' };
  const encoders = run('ffmpeg', ['-hide_banner', '-encoders']).out;
  const filters = run('ffmpeg', ['-hide_banner', '-filters']).out;
  const hasX264 = /\blibx264\b/.test(encoders);
  const hasAss = /\bass\b/.test(filters);
  if (hasX264 && hasAss) return { ok: true, detail: 'libx264 + libass present' };
  const missing = [!hasX264 && 'libx264 encoder', !hasAss && 'libass `ass` filter'].filter(Boolean).join(' and ');
  return { ok: false, detail: `ffmpeg is installed but lacks ${missing}` };
}

/**
 * "Playwright is installed" used to mean the npm package resolved. The renderer
 * needs the Chromium BROWSER, which `npx playwright install chromium` downloads
 * separately, so confirm the executable actually exists on disk.
 */
function chromiumBrowser(): { ok: boolean; detail: string } {
  // 1. Resolve through the package: the most precise answer when it works.
  const resolved = run(process.execPath, [
    '-e',
    "try{const p=require('playwright');process.stdout.write(p.chromium.executablePath())}catch(e){process.exit(2)}",
  ]);
  if (resolved.status === 0 && resolved.out.trim()) {
    const exe = resolved.out.trim();
    return fs.existsSync(exe)
      ? { ok: true, detail: exe }
      : { ok: false, detail: `Playwright is installed but Chromium is not downloaded (expected at ${exe})` };
  }
  // 2. Fall back to the CLI's own dry run, which prints the install location.
  const dry = run('npx', ['--no-install', 'playwright', 'install', '--dry-run', 'chromium']);
  if (dry.status !== 0) return { ok: false, detail: 'Playwright is not installed' };
  const location = /Install location:\s*(.+)/.exec(dry.out)?.[1]?.trim();
  if (location && fs.existsSync(location)) return { ok: true, detail: location };
  return { ok: false, detail: 'Playwright is installed but Chromium is not downloaded' };
}

function nodeVersion(): { ok: boolean; detail: string } {
  const major = Number(process.versions.node.split('.')[0]);
  return { ok: major >= 18, detail: `node ${process.versions.node}` };
}

export interface DoctorCheck {
  id: 'login' | 'mcp' | 'node' | 'ffmpeg' | 'ffprobe' | 'chromium';
  label: string;
  ok: boolean;
  /** What to run when the check fails. */
  fix: string;
  /** What was actually found, for the human and for `--json`. */
  detail?: string;
}

/**
 * The checks behind `gooseworks doctor`, reusable by `install` and by anything
 * that wants to know whether THIS machine can make a video ad
 * (GOOSE-3718). Pure process probes: no network, nothing written.
 */
export function runDoctorChecks(opts: { includeAuth?: boolean } = {}): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  if (opts.includeAuth !== false) {
    const creds = getCredentials();
    checks.push(
      { id: 'login', label: 'Logged in', ok: !!creds, fix: 'gooseworks login' },
      {
        id: 'mcp',
        label: 'GooseWorks MCP configured',
        ok: !!creds?.mcp_server_url,
        fix: 'gooseworks install --claude --mcp  (then restart Claude Code)',
      },
    );
  }
  const node = nodeVersion();
  const ffmpeg = ffmpegBuild();
  const chromium = chromiumBrowser();
  checks.push(
    { id: 'node', label: 'Node.js 18 or newer', ok: node.ok, detail: node.detail, fix: 'install Node 18+ (https://nodejs.org) or `nvm install 22`' },
    {
      id: 'ffmpeg',
      label: 'ffmpeg with libx264 + libass',
      ok: ffmpeg.ok,
      detail: ffmpeg.detail,
      fix: 'brew install ffmpeg (macOS) / apt-get install ffmpeg (Linux)',
    },
    { id: 'ffprobe', label: 'ffprobe on PATH', ok: onPath('ffprobe'), fix: 'bundled with ffmpeg — install ffmpeg' },
    {
      id: 'chromium',
      label: 'Playwright Chromium downloaded',
      ok: chromium.ok,
      detail: chromium.detail,
      fix: 'npx playwright install chromium',
    },
  );
  return checks;
}

/**
 * `gooseworks doctor` — verify the local prerequisites for making VIDEO ads on
 * this machine with goose-video-local (Playwright records the mockup, ffmpeg
 * stitches/mixes/burns captions). Also checks auth + that the GooseWorks MCP
 * server is wired, since the renderer reads/writes the project over MCP. Every
 * video ad is made locally now (server orders are paused), so this exits
 * non-zero if anything is missing: the agent's preflight relays the fix and
 * stops before creating a project.
 */
export const doctorCommand = new Command('doctor')
  .description('Check local prerequisites for video ad rendering (ffmpeg, Playwright Chromium, Node) + auth/MCP')
  .option('--json', 'Print the checks as JSON (for an agent to parse)')
  .action((opts: { json?: boolean }) => {
    const checks = runDoctorChecks();
    const allOk = checks.every((c) => c.ok);

    if (opts.json) {
      console.log(JSON.stringify({ ok: allOk, checks }, null, 2));
      if (!allOk) process.exitCode = 1;
      return;
    }

    logger.info('GooseWorks doctor — prerequisites for local video ad rendering\n');
    for (const c of checks) {
      if (c.ok) {
        logger.success(c.detail ? `${c.label}  (${c.detail})` : c.label);
      } else {
        logger.error(`${c.label}  →  fix: ${c.fix}${c.detail ? `  [${c.detail}]` : ''}`);
      }
    }
    logger.info('');
    if (allOk) {
      logger.success('All set — this machine can make video ads (goose-video-local).');
    } else {
      logger.warn(
        'Some prerequisites are missing. Video ads are made on this machine, so fix the items above before starting one, then re-run: gooseworks doctor.',
      );
      process.exitCode = 1;
    }
  });
