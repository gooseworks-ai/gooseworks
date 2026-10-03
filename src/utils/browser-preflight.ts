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
  cleanup?: { ok: boolean; remainingPids: number[] };
}

const MARKER = 'GOOSE_BROWSER_PREFLIGHT=';

// A separate Node process preserves native module resolution (including NODE_PATH)
// and keeps a broken Playwright installation from hanging or crashing the CLI.
// Nothing imports or runs the renderer, downloads a browser, or navigates a page.
const PROBE = String.raw`
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
// Register each native child synchronously at creation. A probe can crash/exit
// before the supervisor's inventory poll; Chromium must remain owned then too.
const childProcess = require('child_process');
const nativeSpawn = childProcess.spawn;
if (process.platform !== 'win32') {
  childProcess.spawn = function(...args) {
    const child = Reflect.apply(nativeSpawn, this, args);
    if (child.pid) {
      const inventory = childProcess.spawnSync('/bin/ps', ['-p', String(child.pid), '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid=', '-o', 'stat=', '-o', 'lstart='], {
        encoding: 'utf8', timeout: 250, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'ignore'],
      });
      const row = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(inventory.stdout || '');
      fs.writeSync(1, 'GOOSE_BROWSER_CHILD=' + JSON.stringify({
        pid: child.pid, parent: process.pid,
        born: row && Number(row[2]) === process.pid ? row[5] : null,
      }) + '\n');
    }
    return child; // Preserve arguments, launch flags and the native ChildProcess.
  };
  require('module').syncBuiltinESMExports();
}
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
// to own the probe. Chromium creates another detached Unix group, so cleanup
// tracks descendants by parentage, freezes them, and kills owned PIDs before
// the probe. The existing synchronous doctor/install API stays compatible.
const SUPERVISOR = String.raw`
const { spawn, spawnSync } = require('child_process');
const [probe, ...args] = process.argv.slice(1);
let output = '';
let meta = {};
let finished = false;
const owned = new Map();
let rootBorn;
let ownershipUncertain = false;
const registrations = new Set();
function processTable() {
  const result = spawnSync('/bin/ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid=', '-o', 'stat=', '-o', 'lstart='], {
    encoding: 'utf8', timeout: 250, maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return null;
  const rows = new Map();
  for (const line of result.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
    if (match) rows.set(Number(match[1]), { pid: Number(match[1]), parent: Number(match[2]), group: Number(match[3]), state: match[4], born: match[5] });
  }
  return rows.size ? rows : null;
}
// Without a process inventory we cannot safely clean up a detached browser.
// Fail before launching it; never use a broad browser-name or user-wide kill.
if (process.platform !== 'win32' && !processTable()) {
  process.stdout.write('GOOSE_BROWSER_PREFLIGHT=' + JSON.stringify({ ok: false, code: 'probe_failed', detail: 'Cannot inspect owned browser processes with /bin/ps; browser was not launched' }) + '\n');
  process.exit(1);
}
const child = spawn(process.execPath, ['-e', probe, ...args], {
  detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'], env: process.env,
});
function discover(rows) {
  // Retain observed children after reparenting, but reject reused PID identities.
  for (const [pid, row] of owned) if (rows.get(pid)?.born !== row.born) owned.delete(pid);
  const root = rows.get(child.pid);
  if (root && (!rootBorn || root.born === rootBorn)) {
    rootBorn = root.born;
    owned.set(child.pid, root);
  }
  let changed;
  do {
    changed = false;
    for (const row of rows.values()) {
      if (!owned.has(row.pid) && owned.has(row.parent)) {
        owned.set(row.pid, row);
        changed = true;
      }
    }
  } while (changed);
  return [...owned.keys()].map(pid => rows.get(pid)).filter(row => row && !row.state.startsWith('Z'));
}
function signal(row, name) {
  try { process.kill(row.pid, name); } catch {} // Already gone, or reported by verification below.
}
const monitor = process.platform === 'win32' ? null : setInterval(() => {
  const rows = processTable();
  if (rows) discover(rows);
}, 100);
function cleanup() {
  if (monitor) clearInterval(monitor);
  if (!child.pid) return { ok: true, remainingPids: [] };
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { timeout: 2000, stdio: 'ignore' });
    return { ok: result.status === 0, remainingPids: result.status === 0 ? [] : [child.pid] };
  }
  const until = Date.now() + 1500;
  const frozen = new Set();
  let active = [];
  let stable = false;
  // Freeze parent processes first, then rescan for children created just before
  // SIGSTOP. This stops further forks without changing browser launch options.
  for (let round = 0; round < 8 && Date.now() < until; round++) {
    const rows = processTable();
    if (!rows) continue; // Retry a transient inventory timeout within the same budget.
    active = discover(rows);
    const fresh = active.filter(row => !frozen.has(row.pid));
    for (const row of fresh) { signal(row, 'SIGSTOP'); frozen.add(row.pid); }
    if (!fresh.length) { stable = true; break; }
  }
  // Use individual owned PIDs, not a whole group that could contain unrelated
  // processes. Detached Chromium groups and their renderers are still covered.
  for (const row of active.filter(row => row.pid !== child.pid).reverse()) signal(row, 'SIGKILL');
  const root = active.find(row => row.pid === child.pid);
  if (root) signal(root, 'SIGKILL');
  else if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  while (Date.now() < until) {
    const rows = processTable();
    if (!rows) continue;
    active = discover(rows);
    if (!active.length) return { ok: stable && !ownershipUncertain, remainingPids: [] };
    for (const row of active) signal(row, 'SIGKILL');
  }
  return { ok: false, remainingPids: active.map(row => row.pid) };
}
function finish(code, override) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  const stopped = cleanup();
  let result = { ...meta, ...override, cleanup: stopped };
  if (!stopped.ok) {
    result = { ...result, ok: false, code: 'probe_failed', detail: (result.detail || 'Browser probe ended') + '; could not confirm cleanup of owned browser processes' };
    code = 1;
  } else if (result.code === 'timeout') result.detail += '; its owned processes were stopped';
  const text = 'GOOSE_BROWSER_PREFLIGHT=' + JSON.stringify(result) + '\n';
  process.stdout.write(text, () => process.exit(code));
}
const deadline = setTimeout(() => finish(1, {
  ok: false, code: 'timeout', detail: 'Browser launch/close probe timed out',
}), Number(args[2]) + Number(args[3]) + 500);
child.stdout.on('data', chunk => {
  output += chunk;
  if (Buffer.byteLength(output) > 60000) finish(1, { ok: false, code: 'probe_failed', detail: 'Browser probe exceeded its diagnostic output limit' });
  // Consume creation records before processing a terminal result. writeSync in
  // the probe and the close (not exit) handler preserve records on abrupt exit.
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('GOOSE_BROWSER_CHILD=') || !output.includes(line + '\n') || registrations.has(line)) continue;
    registrations.add(line);
    try {
      const registration = JSON.parse(line.slice('GOOSE_BROWSER_CHILD='.length));
      if (!registration.born || registration.parent !== child.pid) { ownershipUncertain = true; continue; }
      // The creation record has the native parent's verified start identity.
      // Seed discovery even if that parent has already exited and reparented it.
      owned.set(registration.pid, registration);
    } catch { ownershipUncertain = true; }
  }
  const metadata = output.split(/\r?\n/).find(line => line.startsWith('GOOSE_BROWSER_PREFLIGHT_META=') && output.includes(line + '\n'));
  if (metadata) {
    try { meta = JSON.parse(metadata.slice('GOOSE_BROWSER_PREFLIGHT_META='.length)); } catch {}
  }
  const line = output.split(/\r?\n/).find(line => line.startsWith('GOOSE_BROWSER_PREFLIGHT=') && output.includes(line + '\n'));
  if (line) {
    try { const result = JSON.parse(line.slice('GOOSE_BROWSER_PREFLIGHT='.length)); finish(result.ok ? 0 : 1, result); }
    catch { finish(1, { ok: false, code: 'probe_failed', detail: 'Invalid browser probe result' }); }
  }
});
child.on('error', error => finish(1, { ok: false, code: 'probe_failed', detail: error.message }));
child.on('close', () => finish(1, { ok: false, code: 'probe_failed', detail: 'Browser probe closed without a result' }));
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
