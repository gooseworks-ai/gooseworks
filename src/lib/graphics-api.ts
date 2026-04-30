/**
 * HTTP client for the Gooseworks graphics API.
 *
 * Uses the global fetch (Node 18+) and FormData/Blob for multipart uploads.
 * Endpoint shapes are documented in gooseworks-app GOOSE-1468.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ResolvedExampleFile } from './graphics-manifest';

export interface ApiClientOptions {
  apiBase: string;
  /** Bearer token. Optional for public reads, but always sent if available. */
  apiKey?: string | null;
}

export interface AuthedApiClientOptions {
  apiBase: string;
  apiKey: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

interface ErrorEnvelope {
  status: 'error';
  error?: string;
  message?: string;
  errors?: Array<string | { path?: string; message?: string }>;
  suggested_slug?: string;
  file?: string;
}

function authHeaders(apiKey?: string | null): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const env = body as ErrorEnvelope;
    if (typeof env.message === 'string') return env.message;
    if (typeof env.error === 'string') return env.error;
  }
  return fallback;
}

async function asApiError(res: Response, defaultMessage: string): Promise<ApiError> {
  const body = await readJsonSafe(res);
  let code: string | null = null;
  if (body && typeof body === 'object' && typeof (body as ErrorEnvelope).error === 'string') {
    code = (body as ErrorEnvelope).error || null;
  }
  return new ApiError(res.status, code, extractMessage(body, defaultMessage), body);
}

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NetworkError(message, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read endpoints

export interface ListQuery {
  q?: string;
  mood?: string;
  tag?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

function buildQuery(q: ListQuery): string {
  const params = new URLSearchParams();
  if (q.q) params.set('q', q.q);
  if (q.mood) params.set('mood', q.mood);
  if (q.tag) params.set('tag', q.tag);
  if (q.featured) params.set('featured', 'true');
  if (q.limit !== undefined) params.set('limit', String(q.limit));
  if (q.offset !== undefined) params.set('offset', String(q.offset));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export interface GraphicStyleSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  moodGroup?: string | null;
  tags?: string[];
  featured?: boolean;
  authorHandle?: string | null;
  [key: string]: unknown;
}

export interface GraphicFormatSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  width?: number;
  height?: number;
  featured?: boolean;
  authorHandle?: string | null;
  [key: string]: unknown;
}

export interface ListEnvelope<T> {
  status: 'success';
  data: T[];
  meta?: { total?: number; limit?: number; offset?: number };
}

async function getJsonEnvelope<T>(
  url: string,
  apiKey?: string | null
): Promise<T> {
  const res = await safeFetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders(apiKey) },
  });
  if (!res.ok) throw await asApiError(res, `request failed (${res.status})`);
  const body = (await readJsonSafe(res)) as { status?: string; data?: unknown };
  if (!body || body.status !== 'success') {
    throw new ApiError(res.status, null, 'unexpected response shape', body);
  }
  return body as T;
}

export async function listStyles(
  opts: ApiClientOptions,
  query: ListQuery = {}
): Promise<ListEnvelope<GraphicStyleSummary>> {
  const url = `${opts.apiBase}/api/graphics/styles${buildQuery(query)}`;
  return getJsonEnvelope<ListEnvelope<GraphicStyleSummary>>(url, opts.apiKey);
}

export async function listFormats(
  opts: ApiClientOptions,
  query: ListQuery = {}
): Promise<ListEnvelope<GraphicFormatSummary>> {
  const url = `${opts.apiBase}/api/graphics/formats${buildQuery(query)}`;
  return getJsonEnvelope<ListEnvelope<GraphicFormatSummary>>(url, opts.apiKey);
}

export interface ItemEnvelope<T> {
  status: 'success';
  data: T;
}

/**
 * ETag-aware response for JSON record fetches. On 304, `envelope` is null
 * and the caller should fall back to its cached body.
 */
export interface RecordResponse<T> {
  status: 200 | 304;
  envelope: ItemEnvelope<T> | null;
  etag: string | null;
}

async function fetchRecord<T>(
  url: string,
  apiKey: string | null | undefined,
  etag: string | null
): Promise<RecordResponse<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...authHeaders(apiKey),
  };
  if (etag) headers['If-None-Match'] = etag;

  const res = await safeFetch(url, { method: 'GET', headers });
  if (res.status === 304) {
    return { status: 304, envelope: null, etag };
  }
  if (!res.ok) throw await asApiError(res, `request failed (${res.status})`);
  const body = (await readJsonSafe(res)) as { status?: string; data?: unknown };
  if (!body || body.status !== 'success') {
    throw new ApiError(res.status, null, 'unexpected response shape', body);
  }
  return {
    status: 200,
    envelope: body as ItemEnvelope<T>,
    etag: res.headers.get('etag'),
  };
}

export async function getStyleRecord(
  opts: ApiClientOptions,
  slug: string,
  etag: string | null = null
): Promise<RecordResponse<GraphicStyleSummary & { examples?: unknown[] }>> {
  const url = `${opts.apiBase}/api/graphics/styles/${encodeURIComponent(slug)}`;
  return fetchRecord(url, opts.apiKey, etag);
}

export async function getFormatRecord(
  opts: ApiClientOptions,
  slug: string,
  etag: string | null = null
): Promise<RecordResponse<GraphicFormatSummary & { examples?: unknown[] }>> {
  const url = `${opts.apiBase}/api/graphics/formats/${encodeURIComponent(slug)}`;
  return fetchRecord(url, opts.apiKey, etag);
}

export interface MarkdownResponse {
  /** 200 with a fresh body, or 304 if If-None-Match matched (body is null). */
  status: 200 | 304;
  body: string | null;
  etag: string | null;
}

async function fetchMarkdown(
  url: string,
  apiKey: string | null | undefined,
  etag: string | null
): Promise<MarkdownResponse> {
  const headers: Record<string, string> = {
    Accept: 'text/plain',
    ...authHeaders(apiKey),
  };
  if (etag) headers['If-None-Match'] = etag;

  const res = await safeFetch(url, { method: 'GET', headers });
  if (res.status === 304) {
    return { status: 304, body: null, etag };
  }
  if (!res.ok) throw await asApiError(res, `request failed (${res.status})`);
  const body = await res.text();
  return { status: 200, body, etag: res.headers.get('etag') };
}

export async function getStyleDesignMd(
  opts: ApiClientOptions,
  slug: string,
  etag: string | null = null
): Promise<MarkdownResponse> {
  const url = `${opts.apiBase}/api/graphics/styles/${encodeURIComponent(slug)}/design.md`;
  return fetchMarkdown(url, opts.apiKey, etag);
}

export async function getFormatSpecMd(
  opts: ApiClientOptions,
  slug: string,
  etag: string | null = null
): Promise<MarkdownResponse> {
  const url = `${opts.apiBase}/api/graphics/formats/${encodeURIComponent(slug)}/spec.md`;
  return fetchMarkdown(url, opts.apiKey, etag);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write endpoints

export interface WriteResult {
  slug: string;
  id: string;
}

function inferContentType(absolutePath: string): string {
  const ext = path.extname(absolutePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function buildMultipart(
  manifest: unknown,
  files: ResolvedExampleFile[]
): FormData {
  const fd = new FormData();
  fd.append('manifest', JSON.stringify(manifest));
  for (const f of files) {
    const buf = fs.readFileSync(f.absolutePath);
    // Node's Blob accepts a Uint8Array. We use the file's basename as the
    // filename, but the field name carries the manifest reference (with "./"
    // stripped) so the server can match it back to the manifest entry.
    const ab = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength
    ) as ArrayBuffer;
    // Without a `type`, Node's FormData serialises the part as
    // `Content-Type: application/octet-stream`, which the server's image
    // allowlist rejects with a 400.
    const blob = new Blob([ab], { type: inferContentType(f.absolutePath) });
    fd.append(f.fieldName, blob, path.basename(f.absolutePath));
  }
  return fd;
}

async function readWriteResponse(res: Response): Promise<WriteResult> {
  const body = (await readJsonSafe(res)) as
    | { status?: string; data?: { slug?: string; id?: string } }
    | null;
  if (!body || body.status !== 'success' || !body.data?.slug || !body.data.id) {
    throw new ApiError(res.status, null, 'unexpected write response shape', body);
  }
  return { slug: body.data.slug, id: body.data.id };
}

async function postMultipart(
  url: string,
  apiKey: string,
  manifest: unknown,
  files: ResolvedExampleFile[],
  method: 'POST' | 'PATCH'
): Promise<WriteResult> {
  const fd = buildMultipart(manifest, files);
  const res = await safeFetch(url, {
    method,
    headers: authHeaders(apiKey),
    body: fd,
  });
  if (!res.ok) throw await asApiError(res, `${method} ${url} failed (${res.status})`);
  return readWriteResponse(res);
}

export async function publishStyle(
  opts: AuthedApiClientOptions,
  manifest: unknown,
  files: ResolvedExampleFile[]
): Promise<WriteResult> {
  const url = `${opts.apiBase}/api/graphics/styles`;
  return postMultipart(url, opts.apiKey, manifest, files, 'POST');
}

export async function updateStyle(
  opts: AuthedApiClientOptions,
  slug: string,
  manifest: unknown,
  files: ResolvedExampleFile[]
): Promise<WriteResult> {
  const url = `${opts.apiBase}/api/graphics/styles/${encodeURIComponent(slug)}`;
  return postMultipart(url, opts.apiKey, manifest, files, 'PATCH');
}

export async function deleteStyle(
  opts: AuthedApiClientOptions,
  slug: string
): Promise<void> {
  const url = `${opts.apiBase}/api/graphics/styles/${encodeURIComponent(slug)}`;
  const res = await safeFetch(url, {
    method: 'DELETE',
    headers: authHeaders(opts.apiKey),
  });
  if (!res.ok) throw await asApiError(res, `DELETE ${url} failed (${res.status})`);
}

export async function publishFormat(
  opts: AuthedApiClientOptions,
  manifest: unknown,
  files: ResolvedExampleFile[]
): Promise<WriteResult> {
  const url = `${opts.apiBase}/api/graphics/formats`;
  return postMultipart(url, opts.apiKey, manifest, files, 'POST');
}

export async function updateFormat(
  opts: AuthedApiClientOptions,
  slug: string,
  manifest: unknown,
  files: ResolvedExampleFile[]
): Promise<WriteResult> {
  const url = `${opts.apiBase}/api/graphics/formats/${encodeURIComponent(slug)}`;
  return postMultipart(url, opts.apiKey, manifest, files, 'PATCH');
}

export async function deleteFormat(
  opts: AuthedApiClientOptions,
  slug: string
): Promise<void> {
  const url = `${opts.apiBase}/api/graphics/formats/${encodeURIComponent(slug)}`;
  const res = await safeFetch(url, {
    method: 'DELETE',
    headers: authHeaders(opts.apiKey),
  });
  if (!res.ok) throw await asApiError(res, `DELETE ${url} failed (${res.status})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Example PNG download (for `get --include-examples`)

export async function downloadBytes(url: string): Promise<Buffer> {
  const res = await safeFetch(url, { method: 'GET' });
  if (!res.ok) throw await asApiError(res, `download failed (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
