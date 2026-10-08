// The settings the video kit reads from its environment, named once.
//
// The five worker settings match gooseworks-app
// apps/api/src/trigger-render/lib/kit-make-contract.ts (KIT_ENV), which sets
// them on a worker (part-interface.md section 13). Change both sides together.
// The dev folders work only against staging or a local server.
import { getEnvironment } from '../environment';

export const KIT_ENV = {
  /** Where the private line lives. The CLI's existing API setting. */
  apiBase: 'GOOSEWORKS_API_BASE',
  /** The video's line token on a worker. Memory only: never printed, logged or written. */
  lineToken: 'GOOSEWORKS_VIDEO_LINE_TOKEN',
  /** "1" on a worker: report kind "worker", never open a browser or ask a question. */
  worker: 'GOOSEWORKS_KIT_WORKER',
  /** "1": never update itself; the worker image pins the kit. */
  noSelfUpdate: 'GOOSEWORKS_KIT_NO_SELF_UPDATE',
  /** "<job_id>:<attempt>:<run_id>…", sent back unchanged on every line call. */
  workerId: 'GOOSEWORKS_KIT_WORKER_ID',
} as const;

export const KIT_DEV_ENV = {
  /** A local goose-skills checkout to load parts from, without the lock's hashes. */
  partsDir: 'GOOSE_KIT_PARTS_DIR',
  /** A local folder of style files. */
  stylesDir: 'GOOSE_KIT_STYLES_DIR',
  /** Replaces ~/.gooseworks for the kit's save folders. */
  home: 'GOOSE_KIT_HOME',
} as const;

export type KitEnvironment = 'production' | 'staging' | 'local';

export interface KitSettings {
  apiBase: string;
  environment: KitEnvironment;
  worker: boolean;
  /** Only on a worker. */
  lineToken?: string;
  workerId?: string;
  noSelfUpdate: boolean;
  partsDir?: string;
  stylesDir?: string;
}

const PRODUCTION_API = 'https://api.gooseworks.ai';
const STAGING_API = 'https://api.staging.gooseworks.ai';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** The API origin the kit talks to: GOOSEWORKS_API_BASE, else the selected environment's. */
export function kitApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return env[KIT_ENV.apiBase] || (getEnvironment() === 'staging' ? STAGING_API : PRODUCTION_API);
}

/** Which server an API origin is. Anything not staging or local counts as production. */
export function apiEnvironment(apiBase: string): KitEnvironment {
  let host: string;
  try {
    host = new URL(apiBase).hostname;
  } catch {
    return 'production';
  }
  if (LOCAL_HOSTS.includes(host)) return 'local';
  if (host.endsWith('.staging.gooseworks.ai')) return 'staging';
  return 'production';
}

/**
 * Reads the kit's settings once. The line token is removed from `env` as it
 * is read, so no child process the kit starts can see it.
 */
export function readKitEnv(env: NodeJS.ProcessEnv = process.env): KitSettings {
  const apiBase = kitApiBase(env);
  const worker = env[KIT_ENV.worker] === '1';
  const lineToken = env[KIT_ENV.lineToken] || undefined;
  delete env[KIT_ENV.lineToken];
  return {
    apiBase,
    environment: apiEnvironment(apiBase),
    worker,
    lineToken: worker ? lineToken : undefined,
    workerId: env[KIT_ENV.workerId] || undefined,
    noSelfUpdate: env[KIT_ENV.noSelfUpdate] === '1',
    partsDir: env[KIT_DEV_ENV.partsDir] || undefined,
    stylesDir: env[KIT_DEV_ENV.stylesDir] || undefined,
  };
}
