// The style the video pinned: downloaded from its package (A8, GV-20) and
// checked file by file, or, off production, read from a local styles folder
// (GOOSE_KIT_STYLES_DIR) and still checked against the pinned style hash.
// The core reads only the style file's grammar: timeline, layers, traits,
// duration, aspects and assets. Nothing here knows any one style.
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import * as path from 'path';
import type { FileRef, StyleLayers, StyleStep } from '../part-interface';
import type { StylePackageRef } from '../line/types';
import { canonicalHash, sha256Hex } from './canonical';
import { KitStop } from './errors';
import { fileRef, hashFile, mediaOfMime, mimeOf } from './files';
import { isInside } from './paths';
import { atomicWrite } from './save';

export interface StyleFile {
  id: string;
  version: string;
  traits: { needs_browser?: boolean; speech?: string; captions?: boolean; end_card?: boolean; qc_flags?: string[] };
  duration: { min_seconds: number; max_seconds: number };
  aspects: string[];
  timeline: StyleStep[];
  layers: StyleLayers;
  assets: { fonts?: string[]; frames?: string[] };
  [field: string]: unknown;
}

export interface LoadedStyle {
  style: StyleFile;
  /** Every packaged asset by its path in the style, as a FileRef. */
  assets: Map<string, FileRef>;
}

const STEP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_STYLE_FILE = 10 * 1024 * 1024;

function refuse(message: string): never {
  throw new KitStop(message, 'refused');
}

function safeRelative(p: unknown): string {
  if (typeof p !== 'string' || !p || path.isAbsolute(p) || p.split(/[\\/]/).some((part) => part === '..' || part === '')) refuse('The style package names a file outside its folder.');
  return p;
}

/** The style file's grammar, as the core relies on it. */
export function checkStyle(raw: unknown, pin: { id: string; version: string; hash: string }): StyleFile {
  if (!raw || typeof raw !== 'object') refuse('The style file could not be read.');
  const style = raw as StyleFile;
  if (style.id !== pin.id || style.version !== pin.version) refuse('The style file is not the version this video pinned.');
  if (canonicalHash(style) !== pin.hash) refuse('The style file does not match the one approved for this video.');
  if (!Array.isArray(style.timeline) || style.timeline.length === 0) refuse('The style has no steps to make.');
  const seen = new Set<string>();
  for (const step of style.timeline) {
    if (!step || typeof step.id !== 'string' || !STEP_ID.test(step.id) || step.id.startsWith('layer-') || seen.has(step.id)) refuse('The style lists a step the kit can’t run.');
    if (!step.part || typeof step.part.id !== 'string' || typeof step.part.version !== 'string') refuse(`The style’s step ${step.id} names no part.`);
    seen.add(step.id);
  }
  const layers = style.layers as unknown as Record<string, unknown>;
  if (!layers || ['brand', 'captions', 'sound', 'check'].some((slot) => typeof layers[slot] !== 'boolean')) refuse('The style’s layers can’t be read.');
  if (!style.duration || typeof style.duration.min_seconds !== 'number' || typeof style.duration.max_seconds !== 'number') refuse('The style’s length can’t be read.');
  return style;
}

export interface FetchStyle {
  ref: StylePackageRef;
  projectId: string;
  dir: string;
  /** Downloads on our API origin are signed in; others are not. */
  download: (url: string, maxBytes: number) => Promise<Buffer>;
}

interface PackageView {
  url: string | null;
  sha256: string;
  files: Array<{ path: string; sha256: string; bytes: number; url: string | null }>;
}

interface PackageManifest {
  style_id: string;
  version: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

async function assetRefs(style: StyleFile, dir: string): Promise<Map<string, FileRef>> {
  const assets = new Map<string, FileRef>();
  for (const p of [...(style.assets?.fonts ?? []), ...(style.assets?.frames ?? [])]) {
    const file = path.join(dir, safeRelative(p));
    if (!isInside(dir, file) || !existsSync(file)) refuse(`The style package is missing ${p}.`);
    const mime = mimeOf(file);
    assets.set(p, await fileRef(file, mediaOfMime(mime), undefined, mime));
  }
  return assets;
}

/** Downloads the pinned package, checking the manifest and every file before anything runs. */
export async function fetchStyle(opts: FetchStyle): Promise<LoadedStyle> {
  const link = new URL(opts.ref.url);
  if (!link.searchParams.has('project_id')) link.searchParams.set('project_id', opts.projectId);
  let view: PackageView;
  try {
    view = JSON.parse((await opts.download(link.toString(), 1024 * 1024)).toString('utf8')) as PackageView;
  } catch (error) {
    if (error instanceof KitStop) throw error;
    refuse('The style for this video could not be downloaded. Run the same command again in a minute.');
  }
  if (!opts.ref.sha256 || view.sha256 !== opts.ref.sha256 || !view.url || !Array.isArray(view.files)) refuse('The style package is not the one this video pinned.');
  const manifestBytes = await opts.download(view.url, 1024 * 1024);
  if (sha256Hex(manifestBytes) !== opts.ref.sha256) refuse('The style package does not match its checksum.');
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as PackageManifest;
  if (manifest.style_id !== opts.ref.style_id || manifest.version !== opts.ref.version || !Array.isArray(manifest.files)) refuse('The style package is not the one this video pinned.');
  for (const entry of manifest.files) {
    const rel = safeRelative(entry.path);
    const target = path.join(opts.dir, rel);
    if (!isInside(opts.dir, target)) refuse('The style package names a file outside its folder.');
    if (existsSync(target) && (await hashFile(target)).sha256 === entry.sha256) continue;
    const listed = view.files.find((f) => f.path === entry.path && f.sha256 === entry.sha256);
    if (!listed?.url) refuse(`The style package has no link for ${entry.path}.`);
    const data = await opts.download(listed.url, MAX_STYLE_FILE);
    if (data.length !== entry.bytes || sha256Hex(data) !== entry.sha256) refuse(`The style file ${entry.path} does not match its checksum.`);
    await atomicWrite(target, data);
  }
  const style = checkStyle(JSON.parse(await readFile(path.join(opts.dir, 'style.json'), 'utf8')), {
    id: opts.ref.style_id,
    version: opts.ref.version,
    hash: opts.ref.style_hash,
  });
  return { style, assets: await assetRefs(style, opts.dir) };
}

/** Off production only: the style from a local styles folder, still checked against the pinned hash. */
export async function readLocalStyle(stylesDir: string, pin: { id: string; version: string; hash: string }): Promise<LoadedStyle> {
  const dir = path.join(path.resolve(stylesDir), safeRelative(pin.id));
  const file = path.join(dir, 'style.json');
  if (!existsSync(file)) refuse(`There is no ${pin.id} style in the local styles folder.`);
  const style = checkStyle(JSON.parse(await readFile(file, 'utf8')), pin);
  return { style, assets: await assetRefs(style, dir) };
}
