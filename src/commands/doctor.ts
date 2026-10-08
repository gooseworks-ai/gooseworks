import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { getCredentials } from '../auth/credentials';
import * as logger from '../utils/logger';
import { checkBrowserPreflight } from '../utils/browser-preflight';
import { getEnvironment } from '../environment';
import { stagingLaunch, inspectCodexSkills, inspectClaudeSkills } from '../agents/staging';

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
 * Common setup requires H.264 encoding. ASS captions additionally need libass;
 * Pillow overlays do not. The selected caption renderer checks its own needs.
 */
function ffmpegBuild(): { ok: boolean; detail: string } {
  if (!onPath('ffmpeg')) return { ok: false, detail: 'ffmpeg is not on PATH' };
  const encoders = run('ffmpeg', ['-hide_banner', '-encoders']).out;
  const filters = run('ffmpeg', ['-hide_banner', '-filters']).out;
  const hasX264 = /\blibx264\b/.test(encoders);
  const hasAss = /\bass\b/.test(filters);
  if (hasX264) return { ok: true, detail: hasAss ? 'libx264 + libass present' : 'libx264 present; ASS captions unavailable, Pillow overlays supported' };
  const missing = 'libx264 encoder';
  return { ok: false, detail: `ffmpeg is installed but lacks ${missing}` };
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
  /** Browser diagnostics identify the package actually probed. */
  code?: string;
  rendererScript?: string;
  modulePath?: string;
  version?: string;
  executablePath?: string;
}

/**
 * The checks behind `gooseworks doctor`, reusable by `install` and by anything
 * that wants common machine checks. An explicit renderer script verifies that
 * renderer's Playwright, not a package belonging to the calling project.
 * No download or ad render. Browser startup uses normal runtime temp files.
 */
export function runDoctorChecks(opts: { includeAuth?: boolean; includeBrowser?: boolean; rendererScript?: string } = {}): DoctorCheck[] {
  if (opts.includeBrowser === false && opts.rendererScript !== undefined) {
    throw new Error('--renderer-script cannot be combined with --no-browser');
  }
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
  checks.push(
    { id: 'node', label: 'Node.js 18 or newer', ok: node.ok, detail: node.detail, fix: 'install Node 18+ (https://nodejs.org) or `nvm install 22`' },
    {
      id: 'ffmpeg',
      label: 'ffmpeg with libx264',
      ok: ffmpeg.ok,
      detail: ffmpeg.detail,
      fix: 'brew install ffmpeg (macOS) / apt-get install ffmpeg (Linux)',
    },
    { id: 'ffprobe', label: 'ffprobe on PATH', ok: onPath('ffprobe'), fix: 'bundled with ffmpeg — install ffmpeg' },
  );
  if (opts.includeBrowser !== false) {
    checks.push({
      id: 'chromium',
      label: opts.rendererScript !== undefined ? 'Selected renderer Chromium launch' : 'General Playwright Chromium launch',
      ...checkBrowserPreflight({ rendererScript: opts.rendererScript }),
    });
  }
  return checks;
}

/**
 * General setup is not certification for an unfetched renderer. The selected
 * renderer must pass its own free launch check before paid ingredients.
 */
export function createDoctorCommand(): Command {
  return new Command('doctor')
  .description('Check local prerequisites for video ad rendering (ffmpeg, Playwright Chromium, Node) + auth/MCP')
  .option('--json', 'Print the checks as JSON (for an agent to parse)')
  .option('--renderer-script <path>', 'Launch Chromium through the selected Node renderer’s Playwright installation')
  .option('--no-browser', 'Check common prerequisites only (for non-browser formats or before fetching a renderer)')
  .option('--project <folder>', 'Check the isolated staging test project')
  .option('--agent <name>', 'Staging agent to check (claude or codex)', 'codex')
  .action(async (opts: { json?: boolean; rendererScript?: string; browser?: boolean; project?: string; agent: string }, command: Command) => {
    if (getEnvironment() === 'staging') {
      const launch = stagingLaunch(opts.project || '', opts.agent);
      const inventory = opts.agent === 'codex' ? await inspectCodexSkills(launch) : await inspectClaudeSkills(launch);
      console.log(JSON.stringify({ ok: true, environment: 'staging', project: launch.cwd, skills: inventory, mcp: 'gooseworks-staging' }, null, 2));
      return;
    }
    if (opts.browser === false && opts.rendererScript !== undefined) {
      command.error('--renderer-script cannot be combined with --no-browser');
    }
    const checks = runDoctorChecks({ includeBrowser: opts.browser, rendererScript: opts.rendererScript });
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
      logger.success(opts.rendererScript !== undefined
        ? 'Common prerequisites and the selected renderer’s default Chromium launch passed.'
        : 'Common setup checks passed. After fetching a browser renderer, check it with --renderer-script before paid work.');
    } else {
      logger.warn(
        'Some prerequisites are missing. Fix the items above, then re-run the same doctor check before paid work.',
      );
      process.exitCode = 1;
    }
  });
}

export const doctorCommand = createDoctorCommand();
