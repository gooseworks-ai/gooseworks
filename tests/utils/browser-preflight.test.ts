import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { checkBrowserPreflight } from '../../src/utils/browser-preflight';

// Real child processes and Node module resolution, with disposable fake packages.
// These packages never import a provider, download a browser or render media.
let root: string;
let initialNodePath: string | undefined;
let initialBrowserPath: string | undefined;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-browser-preflight-'));
  initialNodePath = process.env.NODE_PATH;
  initialBrowserPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  delete process.env.NODE_PATH;
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
});

afterEach(() => {
  if (initialNodePath === undefined) delete process.env.NODE_PATH;
  else process.env.NODE_PATH = initialNodePath;
  if (initialBrowserPath === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  else process.env.PLAYWRIGHT_BROWSERS_PATH = initialBrowserPath;
  fs.rmSync(root, { recursive: true, force: true });
});

function renderer(folder: string): string {
  fs.mkdirSync(folder, { recursive: true });
  const script = path.join(folder, 'record.js');
  fs.writeFileSync(script, "throw new Error('The renderer must not be executed by preflight');\n");
  return script;
}

function playwright(folder: string, code = '', close = '', executable = path.join(root, 'chromium')): string {
  const pkg = path.join(folder, 'node_modules/playwright');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'playwright', version: '1.50.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkg, 'index.js'), `
    exports.chromium = {
      executablePath: () => ${JSON.stringify(executable)},
      launch: async options => {
        if (JSON.stringify(options) !== JSON.stringify({timeout: 100})) throw Error('Changed default launch settings');
        ${code}
        return { close: async () => { ${close} } };
      }
    };
  `);
  return path.join(pkg, 'index.js');
}

function probe(script: string, cwd = root) {
  return checkBrowserPreflight({ rendererScript: script, cwd, launchTimeoutMs: 100, closeTimeoutMs: 50 });
}

it('launches and closes the script-relative package without executing the renderer or writing project output', () => {
  const script = renderer(path.join(root, 'fetched/scripts'));
  const modulePath = playwright(path.dirname(script), '', 'process.stdout.write("closed\\n");');
  const project = path.join(root, 'customer-project');
  fs.mkdirSync(project);
  const result = probe(script, project);
  expect(result).toMatchObject({ ok: true, code: 'ready', modulePath: fs.realpathSync(modulePath), version: '1.50.0' });
  expect(result.detail).toContain('launched and closed');
  expect(fs.readdirSync(project)).toEqual([]);
});

it('cannot pass with project browser A when fetched package B lacks its headless browser', () => {
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  const a = playwright(project);
  const script = renderer(path.join(root, 'fetched/scripts'));
  const b = playwright(path.dirname(script), 'throw Error("Executable doesn\'t exist at browser-B/headless_shell");');
  const general = checkBrowserPreflight({ cwd: project, launchTimeoutMs: 100, closeTimeoutMs: 50 });
  expect(general).toMatchObject({ ok: true, modulePath: fs.realpathSync(a) });
  const selected = probe(script, project);
  expect(selected).toMatchObject({ ok: false, code: 'missing_browser', modulePath: fs.realpathSync(b) });
  expect(selected.fix).toContain(path.dirname(b));
  expect(selected.fix).not.toContain(path.dirname(a));
});

it('requires actual launch even when an executable or empty cache directory exists', () => {
  const cache = path.join(root, 'empty-cache');
  fs.mkdirSync(cache);
  const script = renderer(path.join(root, 'fetched/scripts'));
  playwright(path.dirname(script), 'throw Error("browserType.launch: Target page, context or browser has been closed");', '', cache);
  expect(probe(script)).toMatchObject({ ok: false, code: 'launch_failed', executablePath: cache });
});

it('reports missing browser separately from unavailable local runtime', () => {
  const script = renderer(path.join(root, 'fetched/scripts'));
  playwright(path.dirname(script), 'throw Error("error while loading shared libraries: libX11.so missing");');
  const result = probe(script);
  expect(result).toMatchObject({ ok: false, code: 'launch_failed' });
  expect(result.detail).toContain('libX11');
  expect(result.fix).toContain('--with-deps chromium');
});

it('fails invalid or directory script paths before trying another package', () => {
  playwright(root);
  expect(probe(path.join(root, 'missing.js'))).toMatchObject({ ok: false, code: 'invalid_script' });
  expect(probe(root)).toMatchObject({ ok: false, code: 'invalid_script' });
});

it('reports a missing package with a folder-specific quoted repair', () => {
  const script = renderer(path.join(root, "fetched folder's scripts"));
  const result = probe(script);
  expect(result).toMatchObject({ ok: false, code: 'missing_module' });
  expect(result.fix).toContain('npm install playwright');
  if (process.platform !== 'win32') expect(result.fix).toContain("folder'\"'\"'s scripts'");
});

it('accepts relative paths with spaces and shell metacharacters as arguments, without executing them', () => {
  const script = renderer(path.join(root, 'fetched space $(touch SHOULD_NOT_EXIST) `touch OTHER`/scripts'));
  playwright(path.dirname(script));
  expect(probe(path.relative(root, script))).toMatchObject({ ok: true, rendererScript: script });
  expect(fs.existsSync(path.join(root, 'SHOULD_NOT_EXIST'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'OTHER'))).toBe(false);
});

it('matches Node main-script symlink resolution', () => {
  const script = renderer(path.join(root, 'actual/scripts'));
  const modulePath = playwright(path.dirname(script));
  const linkFolder = path.join(root, 'linked');
  fs.mkdirSync(linkFolder);
  const linked = path.join(linkFolder, 'record.js');
  fs.symlinkSync(script, linked);
  expect(probe(linked)).toMatchObject({ ok: true, modulePath: fs.realpathSync(modulePath) });
});

it('repairs the real script folder when a symlinked renderer has no package', () => {
  const script = renderer(path.join(root, 'actual/scripts'));
  const linkFolder = path.join(root, 'linked');
  fs.mkdirSync(linkFolder);
  const linked = path.join(linkFolder, 'record.js');
  fs.symlinkSync(script, linked);
  const result = probe(linked);
  expect(result).toMatchObject({ ok: false, code: 'missing_module', resolvedScript: fs.realpathSync(script) });
  expect(result.fix).toContain(path.dirname(fs.realpathSync(script)));
  expect(result.fix).not.toContain(linkFolder);
});

it('preserves NODE_PATH, browser-cache environment and cwd used for rendering', () => {
  const script = renderer(path.join(root, 'fetched/scripts'));
  const deps = path.join(root, 'documented-runtime');
  const modulePath = playwright(deps, `
    if (process.env.PLAYWRIGHT_BROWSERS_PATH !== ${JSON.stringify(path.join(root, 'custom cache'))}) throw Error('lost cache env');
    if (process.cwd() !== ${JSON.stringify(fs.realpathSync(root))}) throw Error('lost cwd');
  `);
  process.env.NODE_PATH = path.join(deps, 'node_modules');
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, 'custom cache');
  expect(probe(script)).toMatchObject({ ok: true, modulePath: fs.realpathSync(modulePath) });
});

it('classifies a normal Playwright launch timeout as failure', () => {
  const script = renderer(path.join(root, 'fetched/scripts'));
  playwright(path.dirname(script), 'throw Error("browserType.launch: Timeout 100ms exceeded.");');
  expect(probe(script)).toMatchObject({ ok: false, code: 'timeout', version: '1.50.0' });
});

it('awaits close and fails if close throws', () => {
  const script = renderer(path.join(root, 'fetched/scripts'));
  playwright(path.dirname(script), '', 'throw Error("close failed");');
  expect(probe(script)).toMatchObject({ ok: false, code: 'close_failed' });
});

async function waitForExit(pid: number) {
  for (let n = 0; n < 20; n++) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Probe browser child ${pid} is still running`);
}

const treeTest = process.platform === 'win32' ? it.skip : it;
treeTest('bounds a hung launch and cleans up its browser process tree', async () => {
  const script = renderer(path.join(root, 'fetched/scripts'));
  const pidFile = path.join(root, 'browser.pid');
  playwright(path.dirname(script), `
    const child = require('child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    await new Promise(() => {});
  `);
  const started = Date.now();
  expect(probe(script)).toMatchObject({ ok: false, code: 'timeout', version: '1.50.0' });
  expect(Date.now() - started).toBeLessThan(3000);
  await waitForExit(Number(fs.readFileSync(pidFile, 'utf8')));
});

treeTest('bounds a hung close and cleans up its browser process tree', async () => {
  const script = renderer(path.join(root, 'fetched/scripts'));
  const pidFile = path.join(root, 'browser.pid');
  playwright(path.dirname(script), `
    const child = require('child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
  `, 'await new Promise(() => {});');
  expect(probe(script)).toMatchObject({ ok: false, code: 'close_failed' });
  await waitForExit(Number(fs.readFileSync(pidFile, 'utf8')));
});

for (const mode of ['hung-launch', 'failed-close', 'hung-close']) {
  treeTest(`cleans separate detached browser/renderer groups after ${mode} without killing unrelated processes`, async () => {
    const script = renderer(path.join(root, 'fetched/scripts'));
    const pidFile = path.join(root, 'detached-browser.json');
    // Playwright starts Chromium detached on Unix. Chromium may also have
    // grandchildren; include another detached group to prove parentage matters.
    const browserCode = `
      const {spawn} = require('child_process');
      const renderer = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
      require('fs').writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify([process.pid, renderer.pid]));
      setInterval(()=>{},1000);
    `;
    playwright(path.dirname(script), `
      const child = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(browserCode)}], { detached: true, stdio: 'ignore' });
      // Wait for its renderer child before reporting a close failure.
      for (let n=0; n<100 && !require('fs').existsSync(${JSON.stringify(pidFile)}); n++) await new Promise(resolve=>setTimeout(resolve,5));
      ${mode === 'hung-launch' ? 'await new Promise(() => {});' : ''}
    `, mode === 'failed-close' ? 'throw Error("close failed");' : 'await new Promise(() => {});');
    const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
    const started = Date.now();
    try {
      const result = probe(script);
      expect(result).toMatchObject({ ok: false, code: mode === 'hung-launch' ? 'timeout' : 'close_failed', cleanup: { ok: true, remainingPids: [] } });
      expect(Date.now() - started).toBeLessThan(4000);
      const pids: number[] = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      for (const pid of pids) await waitForExit(pid);
      expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    } finally {
      // Dispose only explicitly owned fixture processes even when assertions fail.
      const pids: number[] = fs.existsSync(pidFile) ? JSON.parse(fs.readFileSync(pidFile, 'utf8')) : [];
      for (const pid of [...pids, unrelated.pid!]) {
        try { process.kill(-pid, 'SIGKILL'); } catch {}
      }
    }
  });
}
