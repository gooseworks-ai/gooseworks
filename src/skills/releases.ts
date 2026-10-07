import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { getEnvironment } from '../environment';
import { stagingContent } from './staging-content';

export function skillContentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface ReleasedSkills {
  version: string;
  hashes: Record<string, string>;
  source: string;
}

const REGISTRY = 'https://registry.npmjs.org';
const MAX_ARCHIVE = 8 * 1024 * 1024;
const MAX_UNPACKED = 32 * 1024 * 1024;

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

/** Reads selected regular files in memory; never extracts paths onto disk. */
export function readReleasedSkillHashes(archive: Buffer, version: string, transform?: (content: string) => string): Record<string, string> {
  const tar = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED });
  const files = new Map<string, Buffer>();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, end: number) => header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '').trim();
    const octal = (start: number, end: number) => {
      const value = field(start, end);
      if (!/^[0-7]+$/.test(value)) throw new Error('Invalid published archive header');
      return parseInt(value, 8);
    };
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(148, 156)) throw new Error('Invalid published archive checksum');
    const size = octal(124, 136);
    const prefix = field(345, 500);
    const name = (prefix ? `${prefix}/` : '') + field(0, 100);
    const start = offset + 512;
    if (start + size > tar.length) throw new Error('Truncated published archive');
    const regular = header[156] === 0 || header[156] === 48;
    if (regular && (name === 'package/package.json' || name === 'package/skills/manifest.json' || /^package\/skills\/[a-z0-9-]+\/SKILL\.md$/.test(name))) {
      if (files.has(name) || size > 2 * 1024 * 1024) throw new Error('Invalid published skill file');
      files.set(name, tar.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  const pkg = JSON.parse(files.get('package/package.json')?.toString('utf8') || '{}');
  if (pkg.name !== 'gooseworks' || pkg.version !== version) throw new Error('Published package identity mismatch');
  const hashes: Record<string, string> = {};
  for (const [name, content] of files) {
    const match = name.match(/^package\/skills\/([a-z0-9-]+)\/SKILL\.md$/);
    if (match) hashes[match[1]] = skillContentHash(content);
  }
  if (!hashes.gooseworks) throw new Error('Published package has no GooseWorks entry skill');
  // Older releases have no manifest: derive it from the integrity-verified
  // release files. New manifests must match those same actual shipped bytes.
  const manifestFile = files.get('package/skills/manifest.json');
  const adjustedHashes = () => transform ? Object.fromEntries(Object.keys(hashes).map(name => [name, skillContentHash(transform(files.get(`package/skills/${name}/SKILL.md`)!.toString('utf8')))])) : hashes;
  if (manifestFile) {
    const manifest = JSON.parse(manifestFile.toString('utf8'));
    if (manifest.package !== 'gooseworks' || manifest.version !== version || !manifest.entries || typeof manifest.entries !== 'object') throw new Error('Invalid published skill manifest');
    for (const [name, hash] of Object.entries(manifest.entries)) {
      if (hashes[name] !== hash) throw new Error(`Published manifest mismatch for ${name}`);
    }
    if (!manifest.entries.gooseworks) throw new Error('Published manifest has no entry skill');
    return transform ? adjustedHashes() : { ...manifest.entries };
  }
  return adjustedHashes();
}

/** Checks npm's release, never GitHub main. One timeout covers metadata + body. */
export async function getReleasedSkills(timeoutMs = 5000): Promise<ReleasedSkills> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const meta = JSON.parse((await boundedResponse(`${REGISTRY}/gooseworks/${getEnvironment() === 'staging' ? 'next' : 'latest'}`, controller.signal, 1024 * 1024)).toString('utf8'));
    if (meta.name !== 'gooseworks' || typeof meta.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(meta.version)) throw new Error('Invalid published package metadata');
    const source = `${REGISTRY}/gooseworks/-/gooseworks-${meta.version}.tgz`;
    if (meta.dist?.tarball !== source || typeof meta.dist?.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+=*$/.test(meta.dist.integrity)) throw new Error('Invalid published package integrity');
    const archive = await boundedResponse(source, controller.signal, MAX_ARCHIVE);
    const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
    if (integrity !== meta.dist.integrity) throw new Error('Published package integrity mismatch');
    return { version: meta.version, hashes: readReleasedSkillHashes(archive, meta.version, getEnvironment() === 'staging' ? stagingContent : undefined), source };
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
