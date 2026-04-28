/**
 * ETag-keyed disk cache for the graphics design.md/spec.md endpoints.
 *
 * Layout:
 *   ~/.gooseworks/cache/graphics/styles/<slug>.md
 *   ~/.gooseworks/cache/graphics/styles/<slug>.md.etag
 *   ~/.gooseworks/cache/graphics/styles/<slug>.json
 *   ~/.gooseworks/cache/graphics/styles/<slug>.json.etag
 *   ~/.gooseworks/cache/graphics/formats/<slug>.md
 *   …
 *
 * Freshness is implicit (HTTP ETag handles it); there's no fixed TTL.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SLUG_RE } from './graphics-manifest';

export type Resource = 'styles' | 'formats';
export type Variant = 'md' | 'json';

function getCacheRootInternal(): string {
  return (
    process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR ||
    path.join(os.homedir(), '.gooseworks', 'cache', 'graphics')
  );
}

/**
 * Returns the cache file path for a slug, or null if the slug fails the
 * public grammar. Returning null instead of throwing means a malformed user
 * arg falls through to the network layer (which will reject it with a
 * normal 404), rather than crashing the CLI before any request is made.
 * The check also blocks path traversal via slugs sourced from server JSON.
 */
function pathFor(resource: Resource, slug: string, variant: Variant): string | null {
  if (!SLUG_RE.test(slug)) return null;
  const ext = variant === 'md' ? '.md' : '.json';
  return path.join(getCacheRootInternal(), resource, `${slug}${ext}`);
}

export interface CacheEntry {
  body: string;
  etag: string | null;
}

export function readCache(
  resource: Resource,
  slug: string,
  variant: Variant
): CacheEntry | null {
  const bodyPath = pathFor(resource, slug, variant);
  if (!bodyPath) return null;
  if (!fs.existsSync(bodyPath)) return null;
  try {
    const body = fs.readFileSync(bodyPath, 'utf-8');
    const etagPath = `${bodyPath}.etag`;
    const etag = fs.existsSync(etagPath)
      ? fs.readFileSync(etagPath, 'utf-8').trim() || null
      : null;
    return { body, etag };
  } catch {
    return null;
  }
}

/**
 * Atomically writes the cache body and (optionally) etag. Each file is
 * written via a PID-suffixed temp file then renamed, so a crash mid-write
 * never leaves a torn body file readable. Concurrent writers can still
 * race on body-vs-etag consistency, but that race is self-healing on the
 * next fetch (mismatched etag → 200 with fresh body → both rewritten).
 */
export function writeCache(
  resource: Resource,
  slug: string,
  variant: Variant,
  body: string,
  etag: string | null
): void {
  const bodyPath = pathFor(resource, slug, variant);
  if (!bodyPath) return;
  fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
  atomicWrite(bodyPath, body);
  const etagPath = `${bodyPath}.etag`;
  if (etag) {
    atomicWrite(etagPath, etag);
  } else if (fs.existsSync(etagPath)) {
    try {
      fs.unlinkSync(etagPath);
    } catch {
      // best effort
    }
  }
}

function atomicWrite(target: string, contents: string): void {
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, contents, 'utf-8');
  fs.renameSync(tmp, target);
}

/** Test seam — exposes the resolved cache root for unit tests. */
export function getCacheRoot(): string {
  return getCacheRootInternal();
}
