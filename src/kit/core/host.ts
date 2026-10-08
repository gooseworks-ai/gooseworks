// What the core needs from the two other kit lanes:
// - BrowserSupport: the bundled Chromium (C2's web video maker).
// - PartLoader: loading locked parts, every file checked against the lock (src/kit/parts).
// The core is handed both; `defaultHost()` gives the ones this build carries.
import type { KitBrowserProvider } from '../part-interface';
import { createKitBrowserSupport } from '../maker/browser';
import { createPartLoader, type PartLoader } from '../parts/loader';
import { KIT_VERSION } from './version';
import type { ToolReport } from '../line/types';

export interface BrowserSupport {
  /** The bundled browser for the device report; sets it up first when `setup` is true. */
  check(opts: { home: string; setup: boolean; env: NodeJS.ProcessEnv; say: (line: string) => void }): Promise<ToolReport & { problem?: string }>;
  /** The Playwright-shaped browser a render_html part gets. Pages may load only file:// under `allowDirs`. */
  provider(opts: { allowDirs: string[]; signal: AbortSignal }): KitBrowserProvider;
}

export type { LoadedPart, PartLoader } from '../parts/loader';

export interface KitHost {
  browser: BrowserSupport;
  loader: PartLoader;
}

export function defaultHost(): KitHost {
  return { browser: createKitBrowserSupport(), loader: createPartLoader({ kitVersion: KIT_VERSION }) };
}
