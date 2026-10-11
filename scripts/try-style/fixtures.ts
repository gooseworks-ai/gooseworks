// A hand-written plan.json and brand.json turned into the frozen plan the line
// hands over, the way the app freezes them at the yes. Files may be named:
//
//   a media id        "fx-mist-pouch-cutout", looked up in a media/index.json
//                     (GOOSE-4015 fixtures: { media: { <id>: { file, mime, sha256 } } },
//                     `file` relative to the folder holding media/)
//   { "file": "p.png" } or "file:p.png"   anywhere in the plan or brand
//   "media/p.png"     a bare path, in a file slot only
//   a FrozenFile      { url, sha256, bytes, mime } whose url is a relative path
//
// and become what the app hands over:
//
//   products[].images[]            FrozenFile   (frozen product photos)
//   brand.logo, brand.fonts.*      FrozenFile
//   scenes[].image_asset_id        scenes[].image  = LineFile (a hosted brand file)
//   footage[].asset_id             footage[].file  = LineFile
//   cast[].image_asset_id          cast[].image    = LineFile
//   scenes[].image, footage[].file, cast[].image given directly: FrozenFile
//
// A FrozenFile is served at /f/<sha256> and a LineFile at /store/<file_id> by
// the fake line; the kit downloads both and checks their hashes, exactly as
// it does against the real line.
import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import { mimeOf } from '../../src/kit/core/files';
import { API } from './line';

export interface Frozen {
  url: string;
  sha256: string;
  bytes: number;
  mime: string;
}

export interface LineFileValue {
  file_id: string;
  ref: string;
  sha256: string;
  bytes: number;
  mime: string;
}

export interface Hosted {
  path: string;
  mime: string;
  sha256: string;
  bytes: number;
}

interface MediaEntry {
  file: string;
  mime: string;
}

export class FixtureFiles {
  /** sha256 → local path, served at /f/<sha256>. */
  readonly served = new Map<string, string>();
  /** file_id → the file, served at /store/<file_id> and hosted for payloads. */
  readonly lineFiles = new Map<string, Hosted>();
  readonly missing: string[] = [];
  readonly problems: string[] = [];
  private readonly media = new Map<string, MediaEntry>();
  private readonly indexes = new Set<string>();

  constructor(private readonly dirs: string[]) {
    for (const d of dirs) this.loadIndexNear(d);
  }

  /** Reads <dir>/media/index.json, and the same one or two levels up. */
  loadIndexNear(dir: string): void {
    for (const d of [dir, path.dirname(dir), path.dirname(path.dirname(dir))]) {
      const file = path.join(d, 'media', 'index.json');
      if (this.indexes.has(file) || !existsSync(file)) continue;
      this.indexes.add(file);
      try {
        const index = JSON.parse(readFileSync(file, 'utf8')) as { media?: Record<string, { file?: string; mime?: string }> };
        for (const [id, m] of Object.entries(index.media ?? {})) {
          if (typeof m?.file === 'string' && !this.media.has(id)) this.media.set(id, { file: path.resolve(d, m.file), mime: m.mime ?? mimeOf(m.file) });
        }
      } catch {
        this.problems.push(`${file} could not be read`);
      }
    }
  }

  isMediaId(value: unknown): value is string {
    return typeof value === 'string' && this.media.has(value);
  }

  find(name: string, from: string): string | null {
    const candidates = path.isAbsolute(name) ? [name] : [from, path.dirname(from), ...this.dirs, process.cwd()].map((d) => path.resolve(d, name));
    return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
  }

  private read(file: string): { data: Buffer; sha256: string } {
    const data = readFileSync(file);
    return { data, sha256: createHash('sha256').update(data).digest('hex') };
  }

  /** A FrozenFile for a media id or a path. */
  freeze(name: string, from: string, expectSha?: string): Frozen | null {
    const media = this.media.get(name);
    const file = media && existsSync(media.file) ? media.file : this.find(name, from);
    if (!file) {
      this.missing.push(name);
      return null;
    }
    const { data, sha256 } = this.read(file);
    if (expectSha && expectSha !== sha256) this.problems.push(`${name} does not match its sha256`);
    this.served.set(sha256, file);
    return { url: `${API}/f/${sha256}`, sha256, bytes: data.length, mime: media?.mime ?? mimeOf(file) };
  }

  /** A LineFile for a media id (or a path): a brand file the line hosts for this video. */
  host(name: string, from: string): LineFileValue | null {
    const media = this.media.get(name);
    const file = media && existsSync(media.file) ? media.file : this.find(name, from);
    if (!file) {
      this.missing.push(name);
      return null;
    }
    const { data, sha256 } = this.read(file);
    const file_id = `m${sha256.slice(0, 20)}`;
    const mime = media?.mime ?? mimeOf(file);
    this.lineFiles.set(file_id, { path: file, mime, sha256, bytes: data.length });
    return { file_id, ref: `gooseworks-file:${file_id}`, sha256, bytes: data.length, mime };
  }
}

const FILE_PREFIX = 'file:';
const LOOKS_LIKE_FILE = /\.(png|jpe?g|webp|gif|svg|mp4|mov|webm|m4v|mp3|wav|m4a|ttf|otf|woff2?)$/i;

function isFileObject(v: unknown): v is { file: string } | { path: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 1 && (keys[0] === 'file' || keys[0] === 'path') && typeof (v as Record<string, unknown>)[keys[0]] === 'string';
}

function isRelativeFrozen(v: unknown): v is Frozen {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return Object.keys(o).sort().join(',') === 'bytes,mime,sha256,url' && typeof o.url === 'string' && !/^[a-z]+:/i.test(o.url);
}

/** The value with every named file frozen. `slot` is true where a bare path string or media id is a file. */
export function freezeFiles(value: unknown, files: FixtureFiles, from: string, slot = false): unknown {
  if (isFileObject(value)) return files.freeze('file' in value ? value.file : value.path, from);
  if (isRelativeFrozen(value)) return files.freeze(value.url, from, value.sha256);
  if (typeof value === 'string') {
    if (value.startsWith(FILE_PREFIX)) return files.freeze(value.slice(FILE_PREFIX.length), from);
    if (slot && (files.isMediaId(value) || (LOOKS_LIKE_FILE.test(value) && !/^https?:/i.test(value)))) return files.freeze(value, from);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => freezeFiles(v, files, from, slot));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = freezeFiles(v, files, from, false);
    return out;
  }
  return value;
}

/** The plan's file slots, frozen the way the app does at the yes. */
export function freezePlanBody(body: Record<string, unknown>, files: FixtureFiles, from: string): Record<string, unknown> {
  const out = freezeFiles(body, files, from) as Record<string, unknown>;
  // [list, field holding a file, is it a list of files, the asset-id field the app hosts]
  const slots: Array<[string, string, boolean, string | null]> = [
    ['products', 'images', true, null],
    ['scenes', 'image', false, 'image_asset_id'],
    ['footage', 'file', false, 'asset_id'],
    ['cast', 'image', false, 'image_asset_id'],
  ];
  for (const [list, field, many, assetField] of slots) {
    const raws = body[list];
    const made = out[list];
    if (!Array.isArray(raws) || !Array.isArray(made)) continue;
    raws.forEach((raw, i) => {
      if (!raw || typeof raw !== 'object' || !made[i] || typeof made[i] !== 'object') return;
      const r = raw as Record<string, unknown>;
      const m = made[i] as Record<string, unknown>;
      if (assetField && typeof r[assetField] === 'string' && r[field] === undefined) {
        m[field] = files.host(r[assetField] as string, from);
        return;
      }
      const value = r[field];
      if (value === undefined || value === null) return;
      if (many && !Array.isArray(value)) return;
      m[field] = freezeFiles(value, files, from, true);
    });
  }
  return out;
}

const DEFAULT_COLORS = { primary: '#1d3557', secondary: '#457b9d', background: '#f1faee', text: '#14213d', palette: [] as string[] };

/** brand.json → the FrozenBrand the hand-over carries. */
export function freezeBrand(raw: Record<string, unknown>, files: FixtureFiles, from: string): Record<string, unknown> {
  const b = raw as Record<string, any>;
  const logo = raw.logo === undefined || raw.logo === null ? null : freezeFiles(raw.logo, files, from, true);
  const fonts: Record<string, unknown> = {};
  for (const k of ['heading', 'body']) {
    const v = (raw.fonts as Record<string, unknown> | undefined)?.[k];
    if (v !== undefined && v !== null) fonts[k] = freezeFiles(v, files, from, true);
  }
  return {
    name: typeof b.name === 'string' ? b.name : 'Example Brand',
    logo,
    colors: { ...DEFAULT_COLORS, ...(b.colors ?? {}) },
    fonts,
    pronunciations: Array.isArray(b.pronunciations) ? b.pronunciations : [],
    cta: b.cta ?? null,
  };
}

/** plan.json → the plan body the hand-over carries, with today's defaults filled in. */
export function planBody(raw: Record<string, unknown>, style: { aspects?: string[] }, files: FixtureFiles, from: string): Record<string, unknown> {
  const frozen = freezePlanBody(raw, files, from);
  return {
    aspect: frozen.aspect ?? style.aspects?.[0] ?? '9:16',
    scenes: [],
    products: [],
    voice: null,
    music: null,
    cast: [],
    answers: {},
    footage: [],
    ...frozen,
  };
}
