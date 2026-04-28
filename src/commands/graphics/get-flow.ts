/**
 * Generic `get <slug>` flow shared by styles + formats.
 *
 * Default output: hits the markdown endpoint (design.md or spec.md), prints
 * the body to stdout, with ETag-keyed disk cache and offline fallback.
 *
 * --json: hits the JSON record endpoint and prints it to stdout.
 *
 * --include-examples: also downloads example PNGs from the JSON record into
 * ./<slug>/<format>.png (current working directory).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ApiError,
  NetworkError,
  type MarkdownResponse,
  type RecordResponse,
} from '../../lib/graphics-api';
import { downloadBytes } from '../../lib/graphics-api';
import {
  readCache,
  writeCache,
  type Resource,
} from '../../lib/graphics-cache';
import { SLUG_RE } from '../../lib/graphics-manifest';
import { reportApiErrorAndExit } from './shared';

export interface GetConfig<T> {
  resource: Resource;
  /** Hits `:slug/design.md` or `:slug/spec.md`. */
  fetchMarkdown: (slug: string, etag: string | null) => Promise<MarkdownResponse>;
  /** Hits `:slug` for the full JSON record, with ETag round-trip. */
  fetchRecord: (slug: string, etag: string | null) => Promise<RecordResponse<T>>;
}

export interface GetOptions {
  json?: boolean;
  includeExamples?: boolean;
  noCache?: boolean;
}

export async function runGetFlow<T extends { examples?: unknown[]; slug?: string }>(
  cfg: GetConfig<T>,
  slug: string,
  opts: GetOptions
): Promise<void> {
  if (opts.json) {
    await emitJson(cfg, slug, !!opts.includeExamples, !!opts.noCache);
    return;
  }
  await emitMarkdown(cfg, slug, !!opts.noCache);
  if (opts.includeExamples) {
    await downloadExamples(cfg, slug);
  }
}

async function emitMarkdown<T>(
  cfg: GetConfig<T>,
  slug: string,
  noCache: boolean
): Promise<void> {
  const cached = noCache ? null : readCache(cfg.resource, slug, 'md');
  const etag = cached?.etag ?? null;

  try {
    const res = await cfg.fetchMarkdown(slug, etag);
    if (res.status === 304 && cached) {
      process.stdout.write(cached.body);
      if (!cached.body.endsWith('\n')) process.stdout.write('\n');
      return;
    }
    if (res.status === 200 && res.body !== null) {
      if (!noCache) writeCache(cfg.resource, slug, 'md', res.body, res.etag);
      process.stdout.write(res.body);
      if (!res.body.endsWith('\n')) process.stdout.write('\n');
      return;
    }
    // 304 with no cached body shouldn't happen in practice — fall through.
    process.stderr.write('Unexpected 304 with no cached body.\n');
    process.exit(1);
  } catch (err) {
    if (cached && (err instanceof NetworkError || isTransientApiError(err))) {
      process.stderr.write(
        `Warning: ${describeFetchError(err)} — serving cached copy.\n`
      );
      process.stdout.write(cached.body);
      if (!cached.body.endsWith('\n')) process.stdout.write('\n');
      return;
    }
    reportApiErrorAndExit(err);
  }
}

async function emitJson<T extends { examples?: unknown[]; slug?: string }>(
  cfg: GetConfig<T>,
  slug: string,
  includeExamples: boolean,
  noCache: boolean
): Promise<void> {
  const cached = noCache ? null : readCache(cfg.resource, slug, 'json');
  const cachedEtag = cached?.etag ?? null;

  let recordData: T;
  try {
    const res = await cfg.fetchRecord(slug, cachedEtag);
    if (res.status === 304 && cached) {
      recordData = (JSON.parse(cached.body) as { data: T }).data;
    } else if (res.status === 200 && res.envelope) {
      recordData = res.envelope.data;
      if (!noCache) {
        writeCache(
          cfg.resource,
          slug,
          'json',
          JSON.stringify(res.envelope, null, 2),
          res.etag
        );
      }
    } else {
      process.stderr.write('Unexpected 304 with no cached body.\n');
      process.exit(1);
    }
  } catch (err) {
    if (cached && (err instanceof NetworkError || isTransientApiError(err))) {
      process.stderr.write(
        `Warning: ${describeFetchError(err)} — serving cached copy.\n`
      );
      // The cached body is the full envelope; print just `.data` to match
      // the freshly-fetched output shape.
      try {
        const parsed = JSON.parse(cached.body) as { data: unknown };
        process.stdout.write(JSON.stringify(parsed.data, null, 2));
      } catch {
        process.stdout.write(cached.body);
      }
      process.stdout.write('\n');
      return;
    }
    reportApiErrorAndExit(err);
  }

  process.stdout.write(JSON.stringify(recordData, null, 2));
  process.stdout.write('\n');

  if (includeExamples) {
    await downloadExamplesFromRecord(
      recordData as { examples?: unknown[]; slug?: string },
      slug
    );
  }
}

async function downloadExamples<T extends { examples?: unknown[]; slug?: string }>(
  cfg: GetConfig<T>,
  slug: string
): Promise<void> {
  let recordData: T;
  try {
    const res = await cfg.fetchRecord(slug, null);
    if (res.status !== 200 || !res.envelope) {
      process.stderr.write('Could not download examples: empty record response.\n');
      return;
    }
    recordData = res.envelope.data;
  } catch (err) {
    process.stderr.write(
      `Could not download examples: ${describeFetchError(err)}\n`
    );
    return;
  }
  await downloadExamplesFromRecord(recordData, slug);
}

interface ExampleLike {
  format?: string;
  url?: string;
  imageUrl?: string;
}

async function downloadExamplesFromRecord(
  record: { examples?: unknown[]; slug?: string },
  slug: string
): Promise<void> {
  const examples = (record.examples ?? []) as ExampleLike[];
  if (examples.length === 0) {
    process.stderr.write('No examples to download.\n');
    return;
  }
  // The directory name comes from the user-supplied CLI slug, not record.slug,
  // and we re-validate before using it as a path component.
  if (!SLUG_RE.test(slug)) {
    process.stderr.write(`Refusing to write examples: slug '${slug}' is not a valid slug.\n`);
    return;
  }
  const targetDir = path.resolve(process.cwd(), slug);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const ex of examples) {
    const url = ex.url || ex.imageUrl;
    if (!url) continue;
    if (!isSafeDownloadUrl(url)) {
      process.stderr.write(`  skipped ${url}: only http(s) URLs are downloaded\n`);
      continue;
    }
    const format = typeof ex.format === 'string' && SLUG_RE.test(ex.format) ? ex.format : 'example';
    const fileName = `${format}.png`;
    try {
      const bytes = await downloadBytes(url);
      const dest = path.join(targetDir, fileName);
      fs.writeFileSync(dest, bytes);
      process.stderr.write(`  saved ${path.relative(process.cwd(), dest)}\n`);
    } catch (err) {
      process.stderr.write(
        `  failed to download ${url}: ${describeFetchError(err)}\n`
      );
    }
  }
}

function isSafeDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isTransientApiError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 500;
}

function describeFetchError(err: unknown): string {
  if (err instanceof NetworkError) return `network unreachable (${err.message})`;
  if (err instanceof ApiError) return `server error ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}
