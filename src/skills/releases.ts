import { createHash } from 'node:crypto';
import { getEnvironment } from '../environment';

export function skillContentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** The CLI version npm currently hands out (`latest` on production, `next` on staging). */
export interface PublishedCli {
  version: string;
  /** The registry address the version was read from. */
  source: string;
}

const REGISTRY = 'https://registry.npmjs.org';

async function boundedResponse(url: string, signal: AbortSignal, limit: number): Promise<Buffer> {
  const response = await fetch(url, { signal, redirect: 'error' });
  if (!response.ok || !response.body) throw new Error(`Published package unavailable (${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) throw new Error('Published package exceeds the size limit');
      chunks.push(next.value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * Reads the published CLI version from npm. Entry skills no longer ship in the
 * package (they come from goose-skills), so only the version is read.
 */
export async function getPublishedCli(timeoutMs = 5000): Promise<PublishedCli> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const source = `${REGISTRY}/gooseworks/${getEnvironment() === 'staging' ? 'next' : 'latest'}`;
    const meta = JSON.parse((await boundedResponse(source, controller.signal, 1024 * 1024)).toString('utf8'));
    if (meta.name !== 'gooseworks' || typeof meta.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(meta.version)) throw new Error('Invalid published package metadata');
    return { version: meta.version, source };
  } finally {
    clearTimeout(timer);
  }
}

export function compareReleaseVersion(running: string, released: string): 'current' | 'outdated' | 'unreleased' {
  if (running === released) return 'current';
  const parse = (version: string) => version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  const a = parse(running), b = parse(released);
  if (!a || !b) return 'unreleased';
  for (let i = 1; i <= 3; i++) {
    if (Number(a[i]) !== Number(b[i])) return Number(a[i]) < Number(b[i]) ? 'outdated' : 'unreleased';
  }
  if (!a[4] && b[4]) return 'unreleased';
  if (a[4] && !b[4]) return 'outdated';
  const preA = (a[4] || '').split('.'), preB = (b[4] || '').split('.');
  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    if (preA[i] === preB[i]) continue;
    if (preA[i] === undefined) return 'outdated';
    if (preB[i] === undefined) return 'unreleased';
    const numericA = /^\d+$/.test(preA[i]), numericB = /^\d+$/.test(preB[i]);
    if (numericA && numericB) return Number(preA[i]) < Number(preB[i]) ? 'outdated' : 'unreleased';
    if (numericA !== numericB) return numericA ? 'outdated' : 'unreleased';
    return preA[i] < preB[i] ? 'outdated' : 'unreleased';
  }
  return 'current';
}
