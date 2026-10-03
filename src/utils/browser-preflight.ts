import { spawnSync } from 'child_process';
import * as path from 'path';

export type BrowserProbeCode = 'ready' | 'invalid_script' | 'missing_module' | 'missing_browser'
  | 'launch_failed' | 'close_failed' | 'timeout' | 'probe_failed';

export interface BrowserPreflightResult {
  ok: boolean;
  code: BrowserProbeCode;
  detail: string;
  fix: string;
  rendererScript?: string;
  resolvedScript?: string;
  modulePath?: string;
  version?: string;
  executablePath?: string;
  cliPath?: string;
}

const MARKER = 'GOOSE_BROWSER_PREFLIGHT=';

// A separate Node process preserves native module resolution (including NODE_PATH)
// and keeps a broken Playwright installation from hanging or crashing the CLI.
// Nothing imports or runs the renderer, downloads a browser, or navigates a page.
const PROBE = String.raw`
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
let [anchor, selected, launchMs, closeMs] = process.argv.slice(1);
const meta = {};
let browser;
let completed = false;
function finish(code, detail) {
  if (completed) return;
  completed = true;
  process.stdout.write('GOOSE_BROWSER_PREFLIGHT=' + JSON.stringify({
    ok: code === 'ready', code, detail, ...meta,
  }) + '\n');
  // Keep the tree rooted here until the supervisor acknowledges the result.
  // In particular, Windows taskkill /T needs the parent PID still alive.
  setInterval(() => {}, 1000);
}
function message(error) { return String(error?.message || error).slice(0, 4000); }
async function closeBrowser() {
  if (!browser) return;
  await Promise.race([
    browser.close(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('browser close timed out')), Number(closeMs))),
  ]);
}
(async () => {
  if (selected === 'true') {
    try {
      if (!fs.statSync(anchor).isFile()) throw new Error('not a file');
      // Node resolves its main script's symlink unless explicitly told otherwise.
      if (!/--preserve-symlinks-main\b/.test(process.env.NODE_OPTIONS || '')) anchor = fs.realpathSync(anchor);
      meta.resolvedScript = anchor;
    }
    catch { return finish('invalid_script', 'Renderer script is not an existing file: ' + anchor); }
  }
  const fromRenderer = createRequire(anchor);
  let playwright;
  try {
    meta.modulePath = fromRenderer.resolve('playwright');
    playwright = fromRenderer('playwright');
    meta.version = fromRenderer('playwright/package.json').version;
    meta.cliPath = path.join(path.dirname(fromRenderer.resolve('playwright/package.json')), 'cli.js');
    meta.executablePath = playwright.chromium.executablePath();
    process.stdout.write('GOOSE_BROWSER_PREFLIGHT_META=' + JSON.stringify(meta) + '\n');
  } catch (error) {
    return finish(meta.modulePath ? 'probe_failed' : 'missing_module', message(error));
  }
  try {
    // Preserve chromium.launch() defaults: no alternate executable, channel,
    // headless mode or sandbox flags. The only override bounds the wait.
    browser = await playwright.chromium.launch({ timeout: Number(launchMs) });
  } catch (error) {
    const detail = message(error);
    const code = /executable.*doesn't exist|executable.*not found|ENOENT/i.test(detail)
      ? 'missing_browser' : /timeout|timed out/i.test(detail) ? 'timeout' : 'launch_failed';
    return finish(code, detail);
  }
  try { await closeBrowser(); }
  catch (error) { return finish('close_failed', message(error)); }
  finish('ready', 'Chromium launched and closed with the default renderer settings');
})().catch(error => finish('probe_failed', message(error)));
`;

function quote(value: string): string {
  return process.platform === 'win32' ? `"${value}"` : `'${value.replace(/'/g, `'"'"'`)}'`;
}

function repair(code: BrowserProbeCode, folder: string, cliPath?: string): string {
  const cd = `${process.platform === 'win32' ? 'cd /d' : 'cd'} ${quote(folder)}`;
  const cli = cliPath ? `${quote(process.execPath)} ${quote(cliPath)}` : 'npx --no-install playwright';
  if (code === 'invalid_script') return 'Pass --renderer-script with the actual fetched renderer script path';
  if (code === 'missing_module') return `${cd} && npm install playwright && npx --no-install playwright install chromium`;
  if (code === 'missing_browser') return `${cd} && ${cli} install chromium`;
  if (code === 'ready') return '';
  return `${cd} && ${cli} install --with-deps chromium`;
}

// spawnSync has no detached/process-group option. This supervisor uses spawn()
// to own a separate probe group and can kill its entire tree even if launch or
// close hangs. The existing synchronous doctor/install API stays compatible.
const SUPERVISOR = String.raw`
const { spawn, spawnSync } = require('child_process');
const [probe, ...args] = process.argv.slice(1);
let output = '';
let meta = {};
let finished = false;
const child = spawn(process.execPath, ['-e', probe, ...args], {
  detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'], env: process.env,
});
function cleanup() {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { timeout: 2000, stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch {} // The normally closed browser may already be gone.
}
function finish(code, override) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  cleanup();
  const text = override ? 'GOOSE_BROWSER_PREFLIGHT=' + JSON.stringify({ ...meta, ...override }) + '\n' : output;
  process.stdout.write(text, () => process.exit(code));
}
const deadline = setTimeout(() => finish(1, {
  ok: false, code: 'timeout', detail: 'Browser launch/close probe timed out; its process tree was stopped',
}), Number(args[2]) + Number(args[3]) + 500);
child.stdout.on('data', chunk => {
  output += chunk;
  if (Buffer.byteLength(output) > 60000) finish(1, { ok: false, code: 'probe_failed', detail: 'Browser probe exceeded its diagnostic output limit' });
  const metadata = output.split(/\r?\n/).find(line => line.startsWith('GOOSE_BROWSER_PREFLIGHT_META=') && output.includes(line + '\n'));
  if (metadata) {
    try { meta = JSON.parse(metadata.slice('GOOSE_BROWSER_PREFLIGHT_META='.length)); } catch {}
  }
  const line = output.split(/\r?\n/).find(line => line.startsWith('GOOSE_BROWSER_PREFLIGHT=') && output.includes(line + '\n'));
  if (line) {
    try { finish(JSON.parse(line.slice('GOOSE_BROWSER_PREFLIGHT='.length)).ok ? 0 : 1); }
    catch { finish(1, { ok: false, code: 'probe_failed', detail: 'Invalid browser probe result' }); }
  }
});
child.on('error', error => finish(1, { ok: false, code: 'probe_failed', detail: error.message }));
child.on('exit', cleanup); // Close inherited pipes even if a failed package left descendants.
child.on('close', code => finish(code ?? 1));
`;

/**
 * Probe the package the script would require, using the caller's cwd and env.
 * Without a script, this is only a general check rooted in the current folder.
 * Browser startup creates normal temporary runtime files; no project output.
 */
export function checkBrowserPreflight(opts: {
  rendererScript?: string;
  cwd?: string;
  launchTimeoutMs?: number;
  closeTimeoutMs?: number;
} = {}): BrowserPreflightResult {
  const cwd = opts.cwd ?? process.cwd();
  const selected = opts.rendererScript !== undefined;
  const anchor = path.resolve(cwd, opts.rendererScript ?? '__gooseworks_browser_probe__.js');
  const folder = path.dirname(anchor);
  const launchMs = opts.launchTimeoutMs ?? 15000;
  const closeMs = opts.closeTimeoutMs ?? 3000;
  let result: Omit<BrowserPreflightResult, 'fix'>;
  try {
    const probe = spawnSync(process.execPath, ['-e', SUPERVISOR, PROBE, anchor, String(selected), String(launchMs), String(closeMs)], {
      cwd,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: launchMs + closeMs + 3500,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024,
    });
    const error = probe.error as NodeJS.ErrnoException | undefined;
    const line = (probe.stdout ?? '').split(/\r?\n/).find((s) => s.startsWith(MARKER));
    if (line && !probe.error) {
      result = JSON.parse(line.slice(MARKER.length));
      if ((result.code === 'ready' && probe.status !== 0) || !result.code) throw new Error('invalid browser probe result');
    } else {
      result = {
        ok: false,
        code: error?.code === 'ETIMEDOUT' ? 'timeout' : 'probe_failed',
        detail: error?.code === 'ETIMEDOUT'
          ? 'Browser probe supervisor timed out before returning a result'
          : `Browser probe could not complete (${probe.error?.message ?? `exit ${probe.status}`})`,
      };
    }
  } catch (error) {
    result = { ok: false, code: 'probe_failed', detail: `Browser probe failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  const location = result.modulePath ? `; Playwright ${result.version ?? 'unknown version'} at ${result.modulePath}` : '';
  const executable = result.executablePath ? `; Chromium executable: ${result.executablePath}` : '';
  return {
    ...result,
    ...(selected ? { rendererScript: anchor } : {}),
    detail: `${selected ? `Renderer ${anchor}` : `General browser setup in ${cwd}`}: ${result.detail}${location}${executable}`,
    fix: repair(result.code, result.resolvedScript ? path.dirname(result.resolvedScript) : folder, result.cliPath),
  };
}
