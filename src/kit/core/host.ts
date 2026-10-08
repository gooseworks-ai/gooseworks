// What the core needs from the two other kit lanes, as interfaces:
// - BrowserSupport: the bundled Chromium (C2's web video maker).
// - PartLoader: loading and verifying locked parts (C3).
// The core is handed both; `defaultHost()` gives the ones this build carries.
import type { KitBrowserProvider, PartManifest, PartRef, PartRun, PartsLock } from '../part-interface';
import type { ToolReport } from '../line/types';

export interface BrowserSupport {
  /** The bundled browser for the device report; sets it up first when `setup` is true. */
  check(opts: { home: string; setup: boolean; env: NodeJS.ProcessEnv; say: (line: string) => void }): Promise<ToolReport & { problem?: string }>;
  /** The Playwright-shaped browser a render_html part gets. Pages may load only file:// under `allowDirs`. */
  provider(opts: { allowDirs: string[]; signal: AbortSignal }): KitBrowserProvider;
}

export interface LoadedPart {
  manifest: PartManifest;
  /** The part's read-only version folder. */
  dir: string;
  run: PartRun;
}

export interface PartLoader {
  /**
   * Loads one part version, every file checked against the lock's sha256
   * (or, with `dev`, read from the dev parts folder without hashes). Throws a
   * plain error when a file is missing or does not match.
   */
  load(opts: { ref: PartRef; lock: PartsLock | null; dev: boolean; home: string; env: NodeJS.ProcessEnv; signal: AbortSignal }): Promise<LoadedPart>;
}

export interface KitHost {
  browser: BrowserSupport;
  loader: PartLoader;
}

// STAND-IN: C2 — replaced by the web video maker's bundled browser once
// video/c2-web-maker merges. It refuses: it never reports a browser it has not
// started.
const browserStandIn: BrowserSupport = {
  async check() {
    return { ok: false, version: null, bundled: false, problem: 'the video browser is not part of this build yet' };
  },
  provider() {
    throw new Error('The video browser is not part of this build yet.');
  },
};

// STAND-IN: C3 — replaced by the parts loader once video/c3-parts-cli merges.
// It refuses every part, so nothing runs (and nothing is spent) without the
// real lock check.
const loaderStandIn: PartLoader = {
  async load() {
    throw new Error('Loading video parts is not part of this build yet.');
  },
};

export function defaultHost(): KitHost {
  return { browser: browserStandIn, loader: loaderStandIn };
}
