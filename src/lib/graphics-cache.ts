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

export type Resource = 'styles' | 'formats';
export type Variant = 'md' | 'json';

function getCacheRootInternal(): string {
  return (
    process.env.GOOSEWORKS_GRAPHICS_CACHE_DIR ||
    path.join(os.homedir(), '.gooseworks', 'cache', 'graphics')
  );
}

function pathFor(resource: Resource, slug: string, variant: Variant): string {
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

export function writeCache(
  resource: Resource,
  slug: string,
  variant: Variant,
  body: string,
  etag: string | null
): void {
  const bodyPath = pathFor(resource, slug, variant);
  fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
  fs.writeFileSync(bodyPath, body, 'utf-8');
  const etagPath = `${bodyPath}.etag`;
  if (etag) {
    fs.writeFileSync(etagPath, etag, 'utf-8');
  } else if (fs.existsSync(etagPath)) {
    try {
      fs.unlinkSync(etagPath);
    } catch {
      // best effort
    }
  }
}

/** Test seam — exposes the resolved cache root for unit tests. */
export function getCacheRoot(): string {
  return getCacheRootInternal();
}
