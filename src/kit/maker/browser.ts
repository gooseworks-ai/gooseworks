// The kit's browser: one Chromium (Playwright's headless shell), set up in
// ~/.gooseworks/kit/browsers on first use from a pinned, checksummed download
// and never taken from the system. A worker image sets PLAYWRIGHT_BROWSERS_PATH;
// the kit then uses that copy as it is and never downloads a second one.
//
// render_html parts get it as ctx.browser: a Playwright-shaped subset whose
// pages may load only file:// URLs inside the folders the core allows (the
// part's own folder and the video's run folder). Chromium runs in its sandbox.
// The network is blocked three ways: the context is offline (WebSocket
// included), every request is routed through an allow-list, and DNS and
// proxying lead nowhere. The kit also watches each page from outside: a
// blocked or failed request, an uncaught error, a worker, a frame, a popup or
// a dialog makes every later call on that page fail with a bad_input error
// naming what happened, so a part can never hand back output from a page that
// broke the rules.
import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { mkdir, open, rename, rm, writeFile } from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { BrowserSupport } from '../core/host';
import { kitHome } from '../core/paths';
import type { KitBrowser, KitPage } from '../part-interface';
import { unzipTo } from './unzip';

// The few Playwright calls the kit makes, typed here so the kit builds
// without Playwright's own types.
interface PwFrame {
  url(): string;
}
interface PwRequest {
  url(): string;
  failure(): { errorText: string } | null;
  isNavigationRequest(): boolean;
  frame(): PwFrame;
}
interface PwRoute {
  request(): PwRequest;
  continue(): Promise<void>;
  abort(errorCode?: string): Promise<void>;
}
interface PwDialog {
  dismiss(): Promise<void>;
}
interface PwPage {
  goto(url: string, options?: { waitUntil?: 'load'; timeout?: number }): Promise<unknown>;
  setContent(html: string, options?: { waitUntil?: 'load'; timeout?: number }): Promise<void>;
  evaluate(fn: unknown, arg?: unknown): Promise<unknown>;
  screenshot(options: { path?: string; type?: 'png' | 'jpeg'; omitBackground?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
  on(event: 'requestfailed', handler: (request: PwRequest) => void): void;
  on(event: 'pageerror', handler: (error: Error) => void): void;
  on(event: 'worker' | 'frameattached' | 'crash', handler: () => void): void;
  on(event: 'dialog', handler: (dialog: PwDialog) => void): void;
  on(event: 'framenavigated', handler: (frame: PwFrame) => void): void;
  mainFrame(): PwFrame;
}
interface PwContext {
  route(url: string, handler: (route: PwRoute) => unknown): Promise<void>;
  addInitScript(script: { content: string }): Promise<void>;
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
  on(event: 'page', handler: (page: PwPage) => void): void;
}
interface PwBrowser {
  newContext(options: Record<string, unknown>): Promise<PwContext>;
  close(): Promise<void>;
  version(): string;
}
interface PwChromium {
  launch(options: Record<string, unknown>): Promise<PwBrowser>;
}

export interface KitBrowserSupportOptions {
  /** A Chromium to use as it is, instead of the kit's own (tests, special images). */
  executablePath?: string;
  /** Loads playwright-core; replaceable so the kit can say plainly when it is missing. */
  loadPlaywright?: () => { chromium: PwChromium };
  /** Downloads one file; replaceable for tests. */
  download?: (url: string, target: string, maxBytes: number) => Promise<void>;
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
  '--disable-3d-apis',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
];

/** Runs in every page and frame before the page's own code: no peer-to-peer, no workers, no sockets. */
const LOCKDOWN = `(() => {
  const off = (name) => { try { Object.defineProperty(window, name, { value: undefined, writable: false, configurable: false }); } catch (e) {} };
  ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'WebTransport'].forEach(off);
  try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined }); } catch (e) {}
  const refuse = (name) => function () { throw new DOMException(name + ' is not available', 'SecurityError'); };
  for (const name of ['WebSocket', 'Worker', 'SharedWorker']) {
    try { Object.defineProperty(window, name, { value: refuse(name), writable: false, configurable: false }); } catch (e) {}
  }
  // A page rewritten with document.open or write would lose what the kit put first in it.
  for (const name of ['open', 'write', 'writeln']) {
    try { Object.defineProperty(Document.prototype, name, { value: refuse('document.' + name), writable: true, configurable: true }); } catch (e) {}
  }
})();`;

const MAX_SIDE = 4096;

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

export interface ShellDownload {
  url: string;
  bytes: number;
  /** sha256 of the zip, checked before anything in it is unpacked. */
  sha256: string;
}

/**
 * The only headless shell downloads the kit will unpack, by Playwright revision
 * and platform: the Chrome for Testing builds Playwright uses (Playwright's own
 * build on linux-arm64). A revision or platform with no pin is not set up; the
 * kit says so instead of unpacking an unchecked download. Fill a new revision
 * with `npx tsx scripts/pin-kit-browser.ts` when playwright-core moves.
 */
export const SHELL_DOWNLOADS: Record<string, Record<string, ShellDownload>> = {
  // Chrome for Testing 149.0.7827.55, as playwright-core 1.61.0 pins it.
  '1228': {
    'darwin-arm64': {
      url: 'https://storage.googleapis.com/chrome-for-testing-public/149.0.7827.55/mac-arm64/chrome-headless-shell-mac-arm64.zip',
      bytes: 98043456,
      sha256: '302f82603be06683947594ecd60f849e362a8fe3dd82a89bd4408477c97e75a6',
    },
    'darwin-x64': {
      url: 'https://storage.googleapis.com/chrome-for-testing-public/149.0.7827.55/mac-x64/chrome-headless-shell-mac-x64.zip',
      bytes: 103452247,
      sha256: 'a32029e1861329a431b712d5b864e213d9cf8ef51a82ce4c24b27e25f6605434',
    },
    'linux-x64': {
      url: 'https://storage.googleapis.com/chrome-for-testing-public/149.0.7827.55/linux64/chrome-headless-shell-linux64.zip',
      bytes: 119778157,
      sha256: '410c9407d5de3fea80d9398666be06f2aa09154a3fa7b327dc254e336bb4c4b7',
    },
    'linux-arm64': {
      url: 'https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/1228/chromium-headless-shell-linux-arm64.zip',
      bytes: 115342043,
      sha256: '1652929a70f4afb17aca36fce073fb7ed22262d16825be761b0801972f43ac4f',
    },
    'win32-x64': {
      url: 'https://storage.googleapis.com/chrome-for-testing-public/149.0.7827.55/win64/chrome-headless-shell-win64.zip',
      bytes: 119099822,
      sha256: '5cfda0c763aa6a867ce2efad0c467e3220e9c5c01c4cba02fd57afe49ede5457',
    },
  },
};

/** The kit's own fetch: follows redirects, stops at maxBytes. */
async function fetchToFile(url: string, target: string, maxBytes: number): Promise<void> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`the browser download failed (HTTP ${response.status})`);
  const file = await open(target, 'w', 0o600);
  let size = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('the browser download is larger than expected');
      await file.write(value);
    }
  } finally {
    await file.close();
  }
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex');
}

/** Downloads the pinned headless shell into `dir`, checks its sha256, then unpacks it. */
export async function installShell(opts: {
  dir: string;
  revision: string;
  download?: (url: string, target: string, maxBytes: number) => Promise<void>;
  platform?: string;
  pins?: Record<string, Record<string, ShellDownload>>;
}): Promise<void> {
  const { dir, revision } = opts;
  const download = opts.download ?? fetchToFile;
  const platform = opts.platform ?? `${process.platform}-${process.arch}`;
  const pin = (opts.pins ?? SHELL_DOWNLOADS)[revision]?.[platform];
  if (!pin) throw new Error(`the video browser for ${platform} (build ${revision}) has no checked download yet`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stamp = randomBytes(6).toString('hex');
  const zip = path.join(dir, `.download-${stamp}.zip`);
  const unpacked = path.join(dir, `.unpack-${stamp}`);
  const folder = path.join(dir, `chromium_headless_shell-${revision}`);
  try {
    await download(pin.url, zip, pin.bytes + 1024 * 1024);
    const actual = await sha256Of(zip);
    if (actual !== pin.sha256) throw new Error('the browser download did not match its checksum');
    await unzipTo(zip, unpacked);
    await writeFile(path.join(unpacked, 'INSTALLATION_COMPLETE'), '');
    await rm(folder, { recursive: true, force: true });
    await rename(unpacked, folder);
  } finally {
    await rm(zip, { force: true });
    await rm(unpacked, { recursive: true, force: true });
  }
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

/** How the kit starts Chromium: in its sandbox, off the network, with fixed rendering. */
export function launchOptions(executablePath: string, env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    executablePath,
    headless: true,
    chromiumSandbox: true,
    args: CHROMIUM_ARGS,
    env: childEnvFor(env),
    // Anything that slipped past the offline context and the route would meet a proxy that isn't there.
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    timeout: 60_000,
    // The kit's own stop handling closes the browser; Playwright must not exit the process first.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  };
}

/** Shown on every page before the one the kit fingerprints: text in every generic font, a gradient and an angle. */
const PROBE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<div style="font:24px serif">Serif Aa Gg 0123 &amp; fi</div>
<div style="font:24px sans-serif">Sans Aa Gg 0123 &amp; fi</div>
<div style="font:24px monospace">Mono Aa Gg 0123</div>
<div style="font:24px system-ui">System Aa Gg 0123</div>
<div style="font:24px cursive">Cursive Aa</div>
<div style="font:24px sans-serif">éßЖΩ 中文 العربية 😀🎉</div>
<div style="width:300px;height:40px;background:linear-gradient(90deg,#f00,#00f);transform:rotate(3deg)"></div>
</body>`;

const contextOptions = (viewport: { width: number; height: number }, deviceScaleFactor: number) => ({
  viewport,
  deviceScaleFactor,
  offline: true,
  serviceWorkers: 'block',
  acceptDownloads: false,
  javaScriptEnabled: true,
  locale: 'en-US',
  timezoneId: 'UTC',
  colorScheme: 'light',
  reducedMotion: 'no-preference',
});

/**
 * The browser's version plus where it draws: the platform and a hash of a
 * probe page drawn with the system's own fonts. The core puts this in the
 * toolchain id, so a step drawn on one computer is never reused on another
 * that would draw it differently.
 */
async function renderFingerprint(browser: PwBrowser): Promise<string> {
  const context = await browser.newContext(contextOptions({ width: 480, height: 320 }, 1));
  try {
    await context.route('**/*', (route) => route.abort('blockedbyclient'));
    const page = await context.newPage();
    await page.setContent(PROBE, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate('document.fonts.ready');
    const png = await page.screenshot({ type: 'png' });
    return `${browser.version()}+${process.platform}-${process.arch}.${createHash('sha256').update(png).digest('hex').slice(0, 12)}`;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** The error every call on a page gets once the page broke a rule. The core reads `code` as bad_input. */
function refused(message: string): Error {
  return Object.assign(new Error(message), { name: 'KitPageRefused', code: 'bad_input', detail: message });
}

function shortUrl(url: string): string {
  return url.length > 200 ? `${url.slice(0, 200)}…` : url;
}

/** The kit's BrowserSupport for the core (src/kit/core/host.ts). */
export function createKitBrowserSupport(options: KitBrowserSupportOptions = {}): BrowserSupport {
  const load = options.loadPlaywright ?? (() => require('playwright-core') as { chromium: PwChromium });
  let found: string | null = options.executablePath ?? null;

  const locate = (home: string, env: NodeJS.ProcessEnv): { exe: string | null; bundled: boolean; dir: string } => {
    const where = browsersFolder(home, env);
    if (options.executablePath) return { exe: options.executablePath, bundled: false, dir: where.dir };
    return { exe: findShell(where.dir, pinnedShell().revision), ...where };
  };

  const launch = async (exe: string, env: NodeJS.ProcessEnv): Promise<PwBrowser> => load().chromium.launch(launchOptions(exe, env));

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
          await installShell({ dir: where.dir, revision: pinnedShell().revision, download: options.download });
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
      let browser: PwBrowser;
      try {
        browser = await launch(where.exe, env);
      } catch {
        return { ok: false, version: null, bundled: where.bundled, problem: 'the video browser does not start in its sandbox on this computer' };
      }
      try {
        const version = await renderFingerprint(browser);
        found = where.exe;
        return { ok: true, version, bundled: where.bundled };
      } catch {
        return { ok: false, version: null, bundled: where.bundled, problem: 'the video browser does not draw pages' };
      } finally {
        await browser.close().catch(() => undefined);
      }
    },

    provider({ allowDirs, signal }) {
      const roots = allowDirs.map((dir) => realOrResolved(path.resolve(dir)));
      const launched = new Set<PwBrowser>();
      const closeAll = () => {
        for (const browser of launched) void browser.close().catch(() => undefined);
        launched.clear();
      };
      signal.addEventListener('abort', closeAll, { once: true });
      const plain = (message: string) => new Error(message);

      const watchedPage = async (browser: PwBrowser, viewport: { width: number; height: number }, scale: number): Promise<KitPage> => {
        const problems: string[] = [];
        let crashed = false;
        const note = (message: string) => {
          if (problems.length < 20 && !problems.includes(message)) problems.push(message);
        };
        const blocked = new Set<string>();
        // The only documents the page may hold are the ones the part opens (goto, setContent).
        let opening: string | null = null;
        let current: string | null = null;
        let page: PwPage | null = null;
        const withoutHash = (url: string) => url.split('#')[0];
        const context = await browser.newContext(contextOptions(viewport, scale));
        await context.addInitScript({ content: LOCKDOWN });
        await context.route('**/*', (route) => {
          const request = route.request();
          const url = request.url();
          if (page && request.isNavigationRequest() && request.frame() === page.mainFrame() && opening === null) {
            blocked.add(url);
            note(`The page tried to move to another document (${shortUrl(url)}). A frame page stays on the page it was opened on.`);
            return route.abort('blockedbyclient');
          }
          if (allowedFileUrl(url, roots)) return route.continue();
          blocked.add(url);
          note(`The page tried to reach ${shortUrl(url)}. Pages may load only their own files.`);
          return route.abort('blockedbyclient');
        });
        context.on('page', (opened) => {
          if (page === null || opened === page) return;
          note('The page opened another window.');
          void opened.close().catch(() => undefined);
        });
        page = await context.newPage();
        const main = page.mainFrame();
        page.on('framenavigated', (frame) => {
          if (frame !== main) return;
          const at = withoutHash(frame.url());
          if (opening !== null) return;
          if (current !== null && at !== current) note(`The page moved to another document (${shortUrl(at)}). A frame page stays on the page it was opened on.`);
        });
        page.on('requestfailed', (request) => {
          const url = request.url();
          if (!blocked.has(url)) note(`The page could not load ${shortUrl(url)} (${request.failure()?.errorText ?? 'failed'}).`);
        });
        page.on('pageerror', (error) => note(`The page threw an error: ${String(error.message).slice(0, 300)}`));
        page.on('worker', () => note('The page started a worker.'));
        page.on('frameattached', () => note('The page holds another page inside it (a frame).'));
        page.on('dialog', (dialog) => {
          note('The page opened a dialog.');
          void dialog.dismiss().catch(() => undefined);
        });
        page.on('crash', () => {
          crashed = true;
        });
        const clean = () => {
          if (crashed) throw Object.assign(new Error('The browser page crashed.'), { code: 'tool_failed' });
          if (problems.length) throw refused(problems.slice(0, 3).join(' '));
        };
        const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
          clean();
          let result: T;
          try {
            result = await work();
          } catch (error) {
            // A call that failed because the page broke a rule (a navigation destroys the page's
            // context, for one) reports the rule, not the browser's own words.
            clean();
            throw error;
          }
          clean();
          return result;
        };
        const opened = page;
        const openDocument = async <T>(target: string, work: () => Promise<T>): Promise<T> => {
          opening = target;
          try {
            return await work();
          } finally {
            opening = null;
            current = withoutHash(opened.mainFrame().url());
          }
        };
        return {
          goto: (url) =>
            guarded(async () => {
              if (!allowedFileUrl(url, roots)) throw plain('A page may open only files in its own folders.');
              return openDocument(url, () => opened.goto(url, { waitUntil: 'load', timeout: 60_000 }));
            }),
          setContent: (html) => guarded(() => openDocument('about:blank', () => opened.setContent(html, { waitUntil: 'load', timeout: 60_000 }))),
          evaluate: (fn, arg) => guarded(() => opened.evaluate(fn, arg)) as never,
          screenshot: (opts) =>
            guarded(async () => {
              const target = path.resolve(opts.path);
              if (!roots.some((root) => inside(root, realOrResolved(target)))) throw plain('A screenshot may be saved only in the step’s own folders.');
              return opened.screenshot({ path: target, type: opts.type ?? 'png', omitBackground: opts.omitBackground ?? false });
            }),
          async close() {
            await opened.close().catch(() => undefined);
            await context.close().catch(() => undefined);
          },
        };
      };

      const wrapBrowser = (browser: PwBrowser): KitBrowser => ({
        async newPage(opts = {}) {
          if (signal.aborted) throw plain('Stopped.');
          const viewport = opts.viewport ?? { width: 1080, height: 1920 };
          const scale = opts.deviceScaleFactor ?? 1;
          const sideOk = (n: number) => Number.isInteger(n) && n >= 16 && n <= MAX_SIDE;
          if (!sideOk(viewport.width) || !sideOk(viewport.height) || !(scale >= 0.25 && scale <= 4)) throw plain('That page size is not allowed.');
          return watchedPage(browser, viewport, scale);
        },
        async close() {
          launched.delete(browser);
          await browser.close().catch(() => undefined);
        },
      });

      return {
        async launch() {
          if (signal.aborted) throw plain('Stopped.');
          let exe = found;
          if (!exe) {
            const env = process.env;
            exe = locate(kitHome(env), env).exe;
          }
          if (!exe) throw plain('The video browser is not set up yet.');
          const browser = await launch(exe, process.env);
          launched.add(browser);
          if (signal.aborted) closeAll();
          return wrapBrowser(browser);
        },
      };
    },
  };
}
