// The kit's browser: one Chromium (Playwright's headless shell), set up in
// ~/.gooseworks/kit/browsers on first use and never taken from the system.
// A worker image sets PLAYWRIGHT_BROWSERS_PATH; the kit then uses that copy as
// it is and never downloads a second one.
//
// render_html parts get it as ctx.browser: a Playwright-shaped subset whose
// pages may load only file:// URLs inside the folders the core allows (the
// part's own folder and the video's run folder). Everything else is blocked
// three ways: the context is offline (WebSocket included), every request is
// routed through an allow-list, and DNS and proxying lead nowhere.
import { spawn } from 'child_process';
import { existsSync, readFileSync, realpathSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { KitBrowser, KitBrowserProvider, KitPage } from '../part-interface';

// The few Playwright calls the kit makes, typed here so the kit builds
// without Playwright's own types.
interface PwRequest { url(): string }
interface PwRoute {
  request(): PwRequest;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}
interface PwPage {
  goto(url: string, options?: { waitUntil?: 'load'; timeout?: number }): Promise<unknown>;
  setContent(html: string, options?: { waitUntil?: 'load'; timeout?: number }): Promise<void>;
  evaluate(fn: unknown, arg?: unknown): Promise<unknown>;
  screenshot(options: { path?: string; type?: 'png' | 'jpeg'; omitBackground?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
}
interface PwContext {
  route(url: string, handler: (route: PwRoute) => unknown): Promise<void>;
  addInitScript(script: { content: string }): Promise<void>;
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(options: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
  version(): string;
}
interface PwChromium {
  launch(options: Record<string, unknown>): Promise<PwBrowser>;
}

/** The same shape as the core's ToolReport, plus a plain problem. */
export interface BrowserReport {
  ok: boolean;
  version: string | null;
  bundled: boolean;
  problem?: string;
}

export interface BrowserCheckOptions {
  home: string;
  setup: boolean;
  env: NodeJS.ProcessEnv;
  say: (line: string) => void;
}

export interface BrowserProviderOptions {
  allowDirs: string[];
  signal: AbortSignal;
}

/** What the core asks of the browser (C1's BrowserSupport). */
export interface KitBrowserSupport {
  check(opts: BrowserCheckOptions): Promise<BrowserReport>;
  provider(opts: BrowserProviderOptions): KitBrowserProvider;
}

export interface KitBrowserSupportOptions {
  /** A Chromium to use as it is, instead of the kit's own (tests, special images). */
  executablePath?: string;
  /** Loads playwright-core; replaceable so the kit can say plainly when it is missing. */
  loadPlaywright?: () => { chromium: PwChromium };
}

/** Flags that keep pictures the same from run to run and keep Chromium off the network. */
export const CHROMIUM_ARGS = [
  '--force-color-profile=srgb',
  '--disable-lcd-text',
  '--font-render-hinting=none',
  '--disable-gpu',
  '--disable-partial-raster',
  '--disable-skia-runtime-opts',
  '--hide-scrollbars',
  '--mute-audio',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-sync',
  '--no-pings',
  '--host-resolver-rules=MAP * ~NOTFOUND',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
];

/** Runs in every page and frame before the page's own code: no peer-to-peer, no workers, no sockets. */
const LOCKDOWN = `(() => {
  const off = (name) => { try { Object.defineProperty(window, name, { value: undefined, writable: false, configurable: false }); } catch (e) {} };
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'WebTransport'].forEach(off);
  try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined }); } catch (e) {}
  const Socket = window.WebSocket;
  if (Socket) window.WebSocket = function WebSocket() { throw new DOMException('The network is not available', 'SecurityError'); };
})();`;

const MAX_SIDE = 4096;

function kitHomeOf(env: NodeJS.ProcessEnv): string {
  if (env.GOOSE_KIT_HOME) return path.resolve(env.GOOSE_KIT_HOME);
  return path.join(env.GOOSEWORKS_USER_HOME || os.homedir(), '.gooseworks');
}

/** Where the browser lives: the image's folder (not bundled) or the kit's own. */
export function browsersFolder(home: string, env: NodeJS.ProcessEnv): { dir: string; bundled: boolean } {
  if (env.PLAYWRIGHT_BROWSERS_PATH) return { dir: path.resolve(env.PLAYWRIGHT_BROWSERS_PATH), bundled: false };
  return { dir: path.join(home, 'kit', 'browsers'), bundled: true };
}

function playwrightRoot(): string {
  return path.dirname(require.resolve('playwright-core/package.json'));
}

/** The headless shell this playwright-core expects: its revision and Chrome version. */
export function pinnedShell(): { revision: string; version: string } {
  const browsers = JSON.parse(readFileSync(path.join(playwrightRoot(), 'browsers.json'), 'utf8')) as {
    browsers: Array<{ name: string; revision: string; browserVersion?: string }>;
  };
  const shell = browsers.browsers.find((b) => b.name === 'chromium-headless-shell');
  if (!shell) throw new Error('playwright-core lists no headless shell');
  return { revision: shell.revision, version: shell.browserVersion ?? shell.revision };
}

const SHELL_PATH: Record<string, string[]> = {
  'darwin-arm64': ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
  'darwin-x64': ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
  'linux-x64': ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  'linux-arm64': ['chrome-linux', 'headless_shell'],
  'win32-x64': ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
};

/** The installed headless shell in `dir`, or null. */
export function findShell(dir: string, revision: string, platform = `${process.platform}-${process.arch}`): string | null {
  const parts = SHELL_PATH[platform];
  if (!parts) return null;
  const folder = path.join(dir, `chromium_headless_shell-${revision}`);
  const exe = path.join(folder, ...parts);
  return existsSync(path.join(folder, 'INSTALLATION_COMPLETE')) && existsSync(exe) ? exe : null;
}

/** Downloads the pinned headless shell into `dir` with playwright-core's own installer. */
function installShell(dir: string, env: NodeJS.ProcessEnv): Promise<void> {
  const cli = path.join(playwrightRoot(), 'cli.js');
  const childEnv: NodeJS.ProcessEnv = { PLAYWRIGHT_BROWSERS_PATH: dir };
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY']) if (env[name]) childEnv[name] = env[name];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', '--only-shell', 'chromium'], { env: childEnv, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    const keep = (chunk: Buffer) => {
      log = (log + chunk.toString('utf8')).slice(-4000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => child.kill('SIGKILL'), 15 * 60_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`the browser download stopped (${code ?? 'timeout'}): ${log.slice(-500)}`));
    });
  });
}

function realOrResolved(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    // A file that does not exist yet (a screenshot about to be written): check its folder.
    const dir = path.dirname(file);
    if (dir === file) return file;
    return path.join(realOrResolved(dir), path.basename(file));
  }
}

function inside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True when `url` is a file:// URL inside one of `roots` (real paths, so links can't lead out). */
export function allowedFileUrl(url: string, roots: string[]): boolean {
  if (!/^file:/i.test(url)) return false;
  let file: string;
  try {
    file = fileURLToPath(new URL(url));
  } catch {
    return false;
  }
  const real = realOrResolved(file);
  return roots.some((root) => inside(root, real));
}

function childEnvFor(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = { TZ: 'UTC', LANG: 'en_US.UTF-8' };
  for (const name of ['PATH', 'HOME', 'TMPDIR']) if (env[name]) out[name] = env[name] as string;
  return out;
}

export function createKitBrowserSupport(options: KitBrowserSupportOptions = {}): KitBrowserSupport {
  const load = options.loadPlaywright ?? (() => require('playwright-core') as { chromium: PwChromium });
  let found: string | null = options.executablePath ?? null;

  const locate = (home: string, env: NodeJS.ProcessEnv): { exe: string | null; bundled: boolean; dir: string } => {
    const where = browsersFolder(home, env);
    if (options.executablePath) return { exe: options.executablePath, bundled: false, dir: where.dir };
    return { exe: findShell(where.dir, pinnedShell().revision), ...where };
  };

  const launch = async (exe: string, env: NodeJS.ProcessEnv): Promise<PwBrowser> =>
    load().chromium.launch({
      executablePath: exe,
      headless: true,
      args: CHROMIUM_ARGS,
      env: childEnvFor(env),
      // Anything that slipped past the offline context and the route would meet a proxy that isn't there.
      proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
      timeout: 60_000,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });

  return {
    async check({ home, setup, env, say }) {
      let where: { exe: string | null; bundled: boolean; dir: string };
      try {
        where = locate(home, env);
      } catch {
        return { ok: false, version: null, bundled: false, problem: 'the video browser is not part of this install' };
      }
      if (!where.exe && setup && where.bundled) {
        say('Setting up the video browser (about 100 MB, once)…');
        try {
          await installShell(where.dir, env);
        } catch (error) {
          return { ok: false, version: null, bundled: true, problem: `the video browser could not be set up: ${error instanceof Error ? error.message : String(error)}` };
        }
        where = locate(home, env);
      }
      if (!where.exe) {
        return {
          ok: false,
          version: null,
          bundled: where.bundled,
          problem: where.bundled ? 'the video browser is not set up yet' : 'the video browser is not in PLAYWRIGHT_BROWSERS_PATH',
        };
      }
      try {
        const browser = await launch(where.exe, env);
        const version = browser.version();
        await browser.close();
        found = where.exe;
        return { ok: true, version, bundled: where.bundled };
      } catch {
        return { ok: false, version: null, bundled: where.bundled, problem: 'the video browser does not start' };
      }
    },

    provider({ allowDirs, signal }) {
      const roots = allowDirs.map((dir) => realOrResolved(path.resolve(dir)));
      const open = new Set<PwBrowser>();
      const closeAll = () => {
        for (const browser of open) void browser.close().catch(() => undefined);
        open.clear();
      };
      signal.addEventListener('abort', closeAll, { once: true });
      const refuse = (message: string) => new Error(message);

      const wrapPage = (page: PwPage, context: PwContext): KitPage => ({
        async goto(url) {
          if (!allowedFileUrl(url, roots)) throw refuse('A page may open only files in its own folders.');
          return page.goto(url, { waitUntil: 'load', timeout: 60_000 });
        },
        async setContent(html) {
          await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
        },
        evaluate(fn, arg) {
          return page.evaluate(fn, arg) as never;
        },
        async screenshot(opts) {
          const target = path.resolve(opts.path);
          if (!roots.some((root) => inside(root, realOrResolved(target)))) throw refuse('A screenshot may be saved only in the step’s own folders.');
          return page.screenshot({ path: target, type: opts.type ?? 'png', omitBackground: opts.omitBackground ?? false });
        },
        async close() {
          await page.close().catch(() => undefined);
          await context.close().catch(() => undefined);
        },
      });

      const wrapBrowser = (browser: PwBrowser): KitBrowser => ({
        async newPage(opts = {}) {
          if (signal.aborted) throw refuse('Stopped.');
          const viewport = opts.viewport ?? { width: 1080, height: 1920 };
          const scale = opts.deviceScaleFactor ?? 1;
          const sideOk = (n: number) => Number.isInteger(n) && n >= 16 && n <= MAX_SIDE;
          if (!sideOk(viewport.width) || !sideOk(viewport.height) || !(scale >= 0.25 && scale <= 4)) throw refuse('That page size is not allowed.');
          const context = await browser.newContext({
            viewport,
            deviceScaleFactor: scale,
            offline: true,
            serviceWorkers: 'block',
            acceptDownloads: false,
            javaScriptEnabled: true,
            locale: 'en-US',
            timezoneId: 'UTC',
            colorScheme: 'light',
            reducedMotion: 'no-preference',
          });
          await context.addInitScript({ content: LOCKDOWN });
          await context.route('**/*', (route) => {
            const url = route.request().url();
            return allowedFileUrl(url, roots) ? route.continue() : route.abort('blockedbyclient');
          });
          return wrapPage(await context.newPage(), context);
        },
        async close() {
          open.delete(browser);
          await browser.close().catch(() => undefined);
        },
      });

      return {
        async launch() {
          if (signal.aborted) throw refuse('Stopped.');
          let exe = found;
          if (!exe) {
            const env = process.env;
            exe = locate(kitHomeOf(env), env).exe;
          }
          if (!exe) throw refuse('The video browser is not set up yet.');
          const browser = await launch(exe, process.env);
          open.add(browser);
          if (signal.aborted) closeAll();
          return wrapBrowser(browser);
        },
      };
    },
  };
}
