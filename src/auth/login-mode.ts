import * as fs from 'fs';

export type LoginMode = 'device' | 'browser';

export interface LoginModeOptions {
  /** `--device` */
  device?: boolean;
  /** `--browser` */
  browser?: boolean;
  /** `--no-wait` (only makes sense with device sign-in). */
  noWait?: boolean;
  /** A saved, unexpired device sign-in exists for this API base. */
  pendingLogin?: boolean;
}

function truthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false';
}

function isWsl(env: NodeJS.ProcessEnv, readFile: (file: string) => string): boolean {
  if (env.WSL_DISTRO_NAME) return true;
  try {
    return readFile('/proc/version').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

/**
 * Picks browser (localhost callback) or device (code + link) sign-in.
 *
 * Explicit flags win, then `GOOSEWORKS_LOGIN`, then a pending device sign-in,
 * then environment heuristics that only fire where a local browser can't reach
 * the CLI (SSH, CI, Linux with no display, containers). macOS/Windows desktops
 * always get the browser flow by default. We can't rely on `open()` failing:
 * open@7 resolves on Linux even with no browser.
 */
export function chooseLoginMode(
  opts: LoginModeOptions,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (file: string) => boolean = fs.existsSync,
  readFile: (file: string) => string = (file) => fs.readFileSync(file, 'utf-8'),
): { mode: LoginMode; reason: string } {
  if (opts.device) return { mode: 'device', reason: '--device' };
  if (opts.noWait) return { mode: 'device', reason: '--no-wait' };
  if (opts.browser) return { mode: 'browser', reason: '--browser' };

  const forced = env.GOOSEWORKS_LOGIN?.trim().toLowerCase();
  if (forced === 'device' || forced === 'browser') return { mode: forced, reason: `GOOSEWORKS_LOGIN=${forced}` };

  if (opts.pendingLogin) return { mode: 'device', reason: 'resuming a pending device sign-in' };

  if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY) return { mode: 'device', reason: 'SSH session' };

  if (truthy(env.CI)) return { mode: 'device', reason: 'CI environment' };

  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY && !isWsl(env, readFile)) {
    return { mode: 'device', reason: 'Linux without a display' };
  }

  if (exists('/.dockerenv') || exists('/run/.containerenv') || env.container || env.KUBERNETES_SERVICE_HOST) {
    return { mode: 'device', reason: 'container' };
  }

  return { mode: 'browser', reason: 'default' };
}
