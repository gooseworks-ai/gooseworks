// Files as the core moves them: FileRefs (path, sha256, bytes, media, mime,
// and the probe's numbers), and the plan's frozen files downloaded and checked.
import { createHash } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, stat } from 'fs/promises';
import * as path from 'path';
import type { FileRef, MediaInfo, MediaKind } from '../part-interface';
import { KitStop } from './errors';
import { atomicWrite } from './save';

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  json: 'application/json', txt: 'text/plain', vtt: 'text/vtt', srt: 'application/x-subrip', ass: 'text/x-ssa',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
};

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'image/png': 'png', 'image/jpeg': 'jpg',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'font/ttf': 'ttf', 'font/otf': 'otf', 'font/woff': 'woff', 'font/woff2': 'woff2',
  'application/json': 'json', 'text/vtt': 'vtt', 'text/html': 'html',
};

export function mimeOf(file: string): string {
  return MIME_BY_EXT[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

export function mediaOfMime(mime: string): MediaKind {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('font/')) return 'font';
  if (mime === 'text/html') return 'html';
  if (mime === 'application/json') return 'json';
  if (mime === 'text/vtt' || mime === 'application/x-subrip' || mime === 'text/x-ssa') return 'subtitles';
  return 'text';
}

export async function hashFile(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on('data', (chunk) => {
        hash.update(chunk);
        bytes += chunk.length;
      })
      .on('end', () => resolve())
      .on('error', reject);
  });
  return { sha256: hash.digest('hex'), bytes };
}

export type Probe = (file: string) => Promise<MediaInfo>;

/** A FileRef for a file on disk: hashed, and probed when it is audio, video or an image. */
export async function fileRef(file: string, media: MediaKind, probe?: Probe, mime?: string): Promise<FileRef> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`${path.basename(file)} is not a file`);
  const { sha256, bytes } = await hashFile(file);
  if (bytes < 1) throw new Error(`${path.basename(file)} is empty`);
  const ref: FileRef = { kind: 'file', path: path.resolve(file), sha256, bytes, media, mime: mime ?? mimeOf(file) };
  if (probe && (media === 'video' || media === 'audio' || media === 'image')) {
    try {
      const probed = await probe(ref.path);
      if (probed.duration_s !== undefined && media !== 'image') ref.duration_s = probed.duration_s;
      if (probed.width !== undefined) ref.width = probed.width;
      if (probed.height !== undefined) ref.height = probed.height;
      if (probed.fps !== undefined && media === 'video') ref.fps = probed.fps;
    } catch {
      // A file the probe can't read keeps its hash; the part that needs the numbers fails on its own.
    }
  }
  return ref;
}

/** Whether a FileRef's file is still there with the same bytes. */
export async function intact(ref: FileRef): Promise<boolean> {
  if (!existsSync(ref.path)) return false;
  try {
    const { sha256, bytes } = await hashFile(ref.path);
    return sha256 === ref.sha256 && bytes === ref.bytes;
  } catch {
    return false;
  }
}

/** A file frozen with the plan at the yes: { url, sha256, bytes, mime }. */
export interface FrozenFile {
  url: string;
  sha256: string;
  bytes: number;
  mime: string;
}

export function isFrozenFile(value: unknown): value is FrozenFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort().join(',');
  return keys === 'bytes,mime,sha256,url' && typeof v.url === 'string' && typeof v.sha256 === 'string' && /^[a-f0-9]{64}$/.test(v.sha256) && typeof v.bytes === 'number' && typeof v.mime === 'string';
}

/**
 * A file the line hosts for this video, frozen with the plan:
 * { file_id, ref: "gooseworks-file:<file_id>", sha256, bytes, mime }.
 */
export interface LineFile {
  file_id: string;
  ref: string;
  sha256: string;
  bytes: number;
  mime: string;
}

export function isLineFile(value: unknown): value is LineFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort().join(',');
  return (
    keys === 'bytes,file_id,mime,ref,sha256' &&
    typeof v.file_id === 'string' &&
    /^[A-Za-z0-9_-]{1,64}$/.test(v.file_id) &&
    v.ref === `gooseworks-file:${v.file_id}` &&
    typeof v.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(v.sha256) &&
    typeof v.bytes === 'number' &&
    typeof v.mime === 'string'
  );
}

const MAX_INPUT_BYTES = 200 * 1024 * 1024;

export interface PlanFiles {
  dir: string;
  /** Downloads a link (a frozen file's, or a hosted file's fresh link). */
  download: (url: string, maxBytes: number) => Promise<Buffer>;
  /** A fresh short-lived link to a file the line hosts for this video. */
  hostedLink: (fileId: string) => Promise<string>;
  /** Told about each hosted file once its bytes are checked, so payloads can name it as it is. */
  onHosted?: (sha256: string, ref: string) => void;
  probe?: Probe;
}

const mismatch = () => new KitStop('A file in the plan does not match the one approved, so nothing was made and nothing was spent.', 'refused');

/** The bytes of one plan file, checked against its size and hash; fetched once per sha256. */
async function checkedFile(files: PlanFiles, file: { sha256: string; bytes: number; mime: string }, fetch: () => Promise<Buffer>): Promise<FileRef> {
  await mkdir(files.dir, { recursive: true, mode: 0o700 });
  const target = path.join(files.dir, `${file.sha256}.${EXT_BY_MIME[file.mime] ?? 'bin'}`);
  const have = existsSync(target) ? await hashFile(target) : null;
  if (!have || have.sha256 !== file.sha256 || have.bytes !== file.bytes) {
    if (file.bytes > MAX_INPUT_BYTES) throw new KitStop('A file in the plan is larger than the kit allows. Nothing was spent.', 'refused');
    const data = await fetch();
    if (data.length !== file.bytes || createHash('sha256').update(data).digest('hex') !== file.sha256) throw mismatch();
    await atomicWrite(target, data);
  }
  return fileRef(target, mediaOfMime(file.mime), files.probe, file.mime);
}

/**
 * The value with every plan file (a frozen link, or a file the line hosts)
 * downloaded into the run folder, checked against its hash and size, and
 * swapped for its FileRef. One file that fails its check stops the run.
 */
export async function materialize(value: unknown, files: PlanFiles): Promise<unknown> {
  if (isFrozenFile(value)) return checkedFile(files, value, () => files.download(value.url, MAX_INPUT_BYTES));
  if (isLineFile(value)) {
    const ref = await checkedFile(files, value, async () => {
      // A hosted file's link lives a few minutes: a failed download asks for a fresh one once.
      try {
        return await files.download(await files.hostedLink(value.file_id), MAX_INPUT_BYTES);
      } catch (error) {
        if (error instanceof KitStop) throw error;
        return files.download(await files.hostedLink(value.file_id), MAX_INPUT_BYTES);
      }
    });
    files.onHosted?.(value.sha256, value.ref);
    return ref;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) out.push(await materialize(item, files));
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await materialize(v, files);
    return out;
  }
  return value;
}
