/**
 * Device sign-in (GOOSE-3937) — the "TV login" pattern (RFC 8628 shape).
 *
 * The CLI asks the server for a short code, prints a link, and the user
 * approves on any device. The CLI then collects its key by polling. Nothing
 * travels through localhost, so this works when the shell runs in a cloud
 * sandbox or over SSH and the browser is on a phone or laptop.
 *
 * `--no-wait` prints the link and exits; the pending request is saved in the
 * profile dir so the next sign-in (e.g. `install --skills-only`) resumes it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FRONTEND_URL } from '../config';
import { getEnvironment, profileRoot } from '../environment';
import { HttpError, requestJson } from '../utils/http';
import * as logger from '../utils/logger';
import { saveCredentials, validateCredentials, type Credentials } from './credentials';
import type { OAuthResult } from './oauth-server';

export interface PendingDeviceLogin {
  device_code: string;
  user_code: string;
  link: string;
  api_base: string;
  /** ISO timestamp. */
  expires_at: string;
  /** Seconds between polls. */
  interval: number;
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface DeviceWaitDeps {
  sleep?: Sleep;
  now?: () => number;
}

export type DeviceFlowOutcome =
  | { status: 'pending'; pending: PendingDeviceLogin }
  | { status: 'done'; result: OAuthResult };

/** The server predates device sign-in (`/api/cli/device/start` returned 404). */
export class DeviceFlowUnavailableError extends Error {
  constructor() {
    super("Device sign-in isn't available on this server yet.");
    this.name = 'DeviceFlowUnavailableError';
  }
}

/** Ctrl-C / SIGTERM while waiting. The pending request is kept so a rerun resumes. */
export class DeviceLoginStoppedError extends Error {
  constructor() {
    super('Stopped waiting for sign-in. Run the command again to finish; the same link works until it expires.');
    this.name = 'DeviceLoginStoppedError';
  }
}

export const EXPIRED_MESSAGE = 'This sign-in code expired. Run the command again for a new link.';
export const DENIED_MESSAGE = 'Sign-in was canceled in the browser.';

const REQUEST_TIMEOUT_MS = 15_000;
// The collecting poll mints the key (and, for a new user, their workspace and
// credits), so give it longer than the other calls.
const POLL_TIMEOUT_MS = 60_000;
// The server gives an approval its own 10 minutes to be collected, because in
// a cloud agent the user approves and then has to go back and tell the agent.
// So a saved request stays usable this long past its own expiry; the server
// says "expired" if it really is.
export const APPROVAL_GRACE_MS = 10 * 60_000;
const DEFAULT_EXPIRES_IN_S = 600;
const DEFAULT_INTERVAL_S = 3;
const MAX_INTERVAL_S = 60;

interface StartResponse {
  status?: string;
  data?: {
    device_code?: string;
    user_code?: string;
    verification_url?: string;
    verification_url_complete?: string;
    expires_in?: number;
    interval?: number;
  };
}

interface PollSuccessData {
  token?: string;
  email?: string;
  agent_id?: string;
  scope_type?: string;
  default_agent_id?: string | null;
  api_base?: string | null;
  mcp_server_url?: string | null;
}

interface PollResponse {
  status?: string;
  interval?: number;
  data?: PollSuccessData;
}

function pendingFile(): string {
  return path.join(profileRoot(), 'pending-login.json');
}

function trimBase(apiBase: string): string {
  return apiBase.replace(/\/+$/, '');
}

function saneInterval(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(n, 1), MAX_INTERVAL_S);
}

function savePendingDeviceLogin(pending: PendingDeviceLogin): void {
  const dir = profileRoot();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  fs.writeFileSync(pendingFile(), JSON.stringify(pending, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(dir, 0o700);
  fs.chmodSync(pendingFile(), 0o600);
}

/**
 * The saved device sign-in for `apiBase`, or null when the file is missing,
 * broken, expired, or belongs to another API base.
 */
export function readPendingDeviceLogin(apiBase: string, now: () => number = Date.now): PendingDeviceLogin | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(pendingFile(), 'utf-8')) as Partial<PendingDeviceLogin>;
    if (
      typeof parsed.device_code !== 'string' || !parsed.device_code ||
      typeof parsed.user_code !== 'string' || !parsed.user_code ||
      typeof parsed.link !== 'string' || !parsed.link ||
      typeof parsed.api_base !== 'string' || typeof parsed.expires_at !== 'string'
    ) return null;
    if (trimBase(parsed.api_base) !== trimBase(apiBase)) return null;
    const expiresAt = Date.parse(parsed.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt + APPROVAL_GRACE_MS <= now()) return null;
    return {
      device_code: parsed.device_code,
      user_code: parsed.user_code,
      link: parsed.link,
      api_base: parsed.api_base,
      expires_at: parsed.expires_at,
      interval: saneInterval(parsed.interval, DEFAULT_INTERVAL_S),
    };
  } catch {
    return null;
  }
}

export function clearPendingDeviceLogin(): void {
  try {
    if (fs.existsSync(pendingFile())) fs.unlinkSync(pendingFile());
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * The link the user opens. Built from the CLI's own FRONTEND_URL (the same
 * source `/cli/auth` uses) so local/staging overrides keep working.
 */
export function deviceLink(userCode: string, ref?: string): string {
  let link = `${FRONTEND_URL}/link?code=${encodeURIComponent(userCode)}`;
  const trimmed = ref?.trim();
  if (trimmed) link += `&creator_ref=${encodeURIComponent(trimmed)}`;
  return link;
}

export async function startDeviceLogin(
  apiBase: string,
  ref?: string,
  now: () => number = Date.now,
  sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<PendingDeviceLogin> {
  let res: StartResponse | undefined;
  // Cloud agents share egress IPs, so a busy platform can hit the per-IP
  // limit: back off and try a couple more times.
  for (let attempt = 1; !res; attempt++) {
    try {
      res = await requestJson<StartResponse>({
        apiBase: trimBase(apiBase),
        method: 'POST',
        path: '/api/cli/device/start',
        body: { scope_type: 'user' },
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) throw new DeviceFlowUnavailableError();
      if (err instanceof HttpError && err.status === 429 && attempt < 3) {
        await sleep(attempt * 2000);
        continue;
      }
      throw err;
    }
  }
  const data = res?.data;
  if (!data || typeof data.device_code !== 'string' || !data.device_code || typeof data.user_code !== 'string' || !data.user_code) {
    throw new Error('The server did not return a sign-in code. Please try again.');
  }
  const expiresInRaw = Number(data.expires_in);
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : DEFAULT_EXPIRES_IN_S;
  const pending: PendingDeviceLogin = {
    device_code: data.device_code,
    user_code: data.user_code,
    link: deviceLink(data.user_code, ref),
    api_base: apiBase,
    expires_at: new Date(now() + expiresIn * 1000).toISOString(),
    interval: saneInterval(data.interval, DEFAULT_INTERVAL_S),
  };
  savePendingDeviceLogin(pending);
  return pending;
}

/** Prints the link and code. Never opens a browser. */
export function printDeviceInstructions(
  pending: PendingDeviceLogin,
  opts: { resumed?: boolean; now?: () => number } = {},
): void {
  const now = opts.now ?? Date.now;
  const left = Date.parse(pending.expires_at) - now();
  const heading = opts.resumed ? 'Still waiting for you to approve:' : 'Sign in to GooseWorks from any device:';
  logger.info(`${heading}\n        ${pending.link}`);
  if (left > 0) {
    const minutes = Math.max(1, Math.ceil(left / 60_000));
    logger.info(`Code: ${pending.user_code} (expires in ${minutes} minute${minutes === 1 ? '' : 's'})`);
  } else {
    // Past its approval deadline but inside the collection grace: the server
    // still hands over the key if the user approved in time.
    logger.info(`Code: ${pending.user_code}`);
  }
}

const defaultSleep: Sleep = (ms, signal) => new Promise<void>((resolve) => {
  const onAbort = () => { clearTimeout(timer); resolve(); };
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

function credentialsFromPoll(apiBase: string, data: PollSuccessData | undefined): Credentials {
  if (!data || typeof data.token !== 'string' || !data.token || typeof data.email !== 'string' || !data.email || typeof data.agent_id !== 'string' || !data.agent_id) {
    throw new Error('The server sent an incomplete sign-in. Run the command again for a new link.');
  }
  const scopeType = data.scope_type === 'agent' || data.scope_type === 'user' ? data.scope_type : undefined;
  return {
    api_key: data.token,
    email: data.email,
    agent_id: data.agent_id,
    api_base: data.api_base || apiBase,
    ...(scopeType ? { scope_type: scopeType } : {}),
    ...(data.default_agent_id ? { default_agent_id: data.default_agent_id } : {}),
    ...(data.mcp_server_url ? { mcp_server_url: data.mcp_server_url } : {}),
  };
}

type PollStep =
  | { kind: 'done'; result: OAuthResult }
  /** Not approved yet (or a transient failure): poll again after `interval` s. */
  | { kind: 'waiting'; interval: number }
  /** Expired, canceled or refused. The pending file is already cleared. */
  | { kind: 'gone'; message: string };

/** One poll. Saves the key on success; never throws for a server answer. */
async function pollOnce(
  apiBase: string,
  pending: PendingDeviceLogin,
  interval: number,
  guard: <T>(work: Promise<T>) => Promise<T> = (work) => work,
): Promise<PollStep> {
  let res: PollResponse;
  try {
    res = await guard(requestJson<PollResponse>({
      apiBase: trimBase(apiBase),
      method: 'POST',
      path: '/api/cli/device/poll',
      body: { device_code: pending.device_code },
      timeoutMs: POLL_TIMEOUT_MS,
    }));
  } catch (err) {
    if (err instanceof DeviceLoginStoppedError) throw err;
    if (err instanceof HttpError && err.status === 404) {
      clearPendingDeviceLogin();
      return { kind: 'gone', message: EXPIRED_MESSAGE };
    }
    if (err instanceof HttpError && err.status === 429) {
      return { kind: 'waiting', interval: Math.min(interval + 2, MAX_INTERVAL_S) };
    }
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
      clearPendingDeviceLogin();
      return { kind: 'gone', message: `Sign-in failed (status ${err.status}). Run the command again for a new link.` };
    }
    // 5xx, timeouts and network errors are transient.
    return { kind: 'waiting', interval };
  }

  switch (res?.status) {
    case 'success': {
      // The code is single-use: once collected, the pending file is useless.
      try {
        const creds = credentialsFromPoll(apiBase, res.data);
        if (getEnvironment() === 'staging' && (!res.data?.api_base || new URL(res.data.api_base).origin !== new URL(apiBase).origin)) {
          throw new Error('The sign-in did not confirm the staging API');
        }
        validateCredentials(creds);
        saveCredentials(creds);
        return {
          kind: 'done',
          result: {
            api_key: creds.api_key,
            email: creds.email,
            agent_id: creds.agent_id,
            ...(creds.scope_type ? { scope_type: creds.scope_type } : {}),
            ...(creds.default_agent_id ? { default_agent_id: creds.default_agent_id } : {}),
            ...(creds.mcp_server_url ? { mcp_server_url: creds.mcp_server_url } : {}),
          },
        };
      } finally {
        clearPendingDeviceLogin();
      }
    }
    case 'expired':
      clearPendingDeviceLogin();
      return { kind: 'gone', message: EXPIRED_MESSAGE };
    case 'denied':
      clearPendingDeviceLogin();
      return { kind: 'gone', message: DENIED_MESSAGE };
    case 'slow_down':
      return { kind: 'waiting', interval: saneInterval(res.interval, Math.min(interval + 2, MAX_INTERVAL_S)) };
    default:
      // 'pending' (and anything unrecognised): keep the server's pace.
      return { kind: 'waiting', interval: saneInterval(res?.interval, interval) };
  }
}

/**
 * Polls until the user approves, denies, or the code expires. On success the
 * key is saved like a browser sign-in and the pending file is removed. The
 * server decides expiry; the local cut-off (expiry plus the approval grace)
 * only stops a server that never answers.
 */
export async function waitForDeviceLogin(
  apiBase: string,
  pending: PendingDeviceLogin,
  deps: DeviceWaitDeps = {},
): Promise<OAuthResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const giveUpAt = Date.parse(pending.expires_at) + APPROVAL_GRACE_MS;
  let interval = saneInterval(pending.interval, DEFAULT_INTERVAL_S);

  const controller = new AbortController();
  const stopped = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new DeviceLoginStoppedError()), { once: true });
  });
  stopped.catch(() => undefined);
  const guard = <T>(work: Promise<T>): Promise<T> => Promise.race([work, stopped]);
  const onSignal = () => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    for (;;) {
      const step = await pollOnce(apiBase, pending, interval, guard);
      if (step.kind === 'done') return step.result;
      if (step.kind === 'gone') throw new Error(step.message);
      interval = step.interval;
      if (!(now() < giveUpAt)) {
        clearPendingDeviceLogin();
        throw new Error(EXPIRED_MESSAGE);
      }
      await guard(sleep(interval * 1000, controller.signal));
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

/**
 * Resume a saved request for this API base, or start a new one; print the
 * link; then either return at once (`wait: false`) or wait for approval.
 * Resuming with `wait: false` asks the server first, so it never re-prints a
 * code that was already approved, canceled or used.
 */
export async function runDeviceFlow(
  apiBase: string,
  opts: { ref?: string; wait?: boolean } & DeviceWaitDeps = {},
): Promise<DeviceFlowOutcome> {
  const now = opts.now ?? Date.now;
  let existing = readPendingDeviceLogin(apiBase, now);
  if (existing && opts.wait === false) {
    const step = await pollOnce(apiBase, existing, existing.interval);
    if (step.kind === 'done') return { status: 'done', result: step.result };
    if (step.kind === 'gone') existing = null;
  }
  const pending = existing ?? await startDeviceLogin(apiBase, opts.ref, now, opts.sleep);
  printDeviceInstructions(pending, { resumed: existing !== null, now });
  if (opts.wait === false) return { status: 'pending', pending };
  const result = await waitForDeviceLogin(apiBase, pending, { sleep: opts.sleep, now });
  return { status: 'done', result };
}
