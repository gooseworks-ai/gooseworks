// Hashes (part-interface.md section 5). Every hash is sha256 over canonical
// JSON: keys sorted, no spaces, undefined dropped (the server's canonical-json
// rule). In the step, piece and seed hashes a FileRef counts only as
// { media, sha256 }, never its path, so they match across computers and runs.
import { createHash } from 'crypto';
import type { FileRef, PartRef } from '../part-interface';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function isFileRef(value: unknown): value is FileRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v.kind === 'file' && typeof v.sha256 === 'string' && typeof v.media === 'string' && typeof v.path === 'string';
}

/** The value as hashes see it: every FileRef reduced to { media, sha256 }. */
export function hashView(value: unknown): unknown {
  if (isFileRef(value)) return { media: value.media, sha256: value.sha256 };
  if (Array.isArray(value)) return value.map(hashView);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = hashView(v);
    return out;
  }
  return value;
}

/** Local cache key of one step: { interface, part, toolchain, inputs }. */
export function stepHash(input: { interface: number; part: PartRef; toolchain: string; inputs: unknown; fix?: number }): string {
  const { fix, ...rest } = input;
  return canonicalHash(hashView(fix ? { ...rest, fix } : rest));
}

/** The piece hash, sent as the line's inputs_hash: { part, provider, path, body }, before any file is hosted. */
export function pieceHash(input: { part: PartRef; provider: string; path: string; body: unknown }): string {
  return canonicalHash(hashView({ part: { id: input.part.id, version: input.part.version }, provider: input.provider, path: input.path, body: input.body }));
}

/** A stable 32-bit seed per piece: the first 4 bytes of sha256({ step, part: id, piece, seed }). */
export function pieceSeed(input: { step: string; part: string; piece: string; seed: unknown }): number {
  const digest = createHash('sha256').update(canonicalJson(hashView({ step: input.step, part: input.part, piece: input.piece, seed: input.seed ?? null }))).digest();
  return digest.readUInt32BE(0);
}
