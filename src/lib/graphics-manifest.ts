/**
 * Client-side validators for gooseworks-style.json and gooseworks-format.json.
 *
 * Mirrors the server-side Zod schema in gooseworks-app:
 *   backend/src/schemas/graphics-manifest.ts
 *
 * If the server schema changes, update this file to match. The CLI runs
 * pre-flight validation here for fast feedback before uploading bytes.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface StyleExample {
  format: string;
  isHero?: boolean;
  file: string;
  caption?: string;
}

export interface PaletteEntry {
  hex: string;
  role?: string;
}

export interface StyleManifest {
  name: string;
  slug?: string;
  description: string;
  designMd: string;
  moodGroup?: string;
  tags?: string[];
  palette?: PaletteEntry[];
  examples: StyleExample[];
}

export interface FormatExample {
  file: string;
  styleSlug?: string;
}

export interface FormatManifest {
  name: string;
  slug?: string;
  description: string;
  width: number;
  height: number;
  contentRulesMd: string;
  tags?: string[];
  examples: FormatExample[];
}

export const VALID_MOOD_GROUPS = [
  'Dark & Moody',
  'Light & Editorial',
  'Organic & Warm',
  'Bold & Energetic',
  'Retro & Cinematic',
  'Structural & Technical',
  'Friendly Corporate',
] as const;

export const STYLE_MANIFEST_FILENAME = 'gooseworks-style.json';
export const FORMAT_MANIFEST_FILENAME = 'gooseworks-format.json';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export const SLUG_RE = /^[a-z0-9-]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Allow-listed canvas dimensions. Mirrors the server-side check in
 * backend/src/schemas/graphics-manifest.ts. The screenshot tool ships a
 * strict allow-list (carousel/infographic/slides/poster/story/chart/tweet);
 * publishing custom dimensions would render fine locally but break for
 * any other agent that pulls the format later, so we reject them at
 * publish time.
 */
const FIXED_CANVAS_DIMENSIONS: ReadonlyArray<readonly [number, number]> = [
  [1080, 1080], // carousel / chart / tweet
  [1080, 1350], // poster
  [1920, 1080], // slides
  [1080, 1920], // story
];

function isAllowedCanvas(width: number, height: number): boolean {
  if (width === 1080 && height >= 1080) {
    return true; // infographic — any tall height
  }
  return FIXED_CANVAS_DIMENSIONS.some(([w, h]) => w === width && h === height);
}

const ALLOWED_CANVAS_LIST = [
  '1080×1080 (carousel/chart/tweet)',
  '1080×1350 (poster)',
  '1920×1080 (slides)',
  '1080×1920 (story)',
  '1080×≥1080 (infographic)',
].join(', ');

/**
 * Throws if the string does not match the public slug grammar. Use before
 * interpolating any externally-sourced slug (CLI arg, server response) into
 * a filesystem path.
 */
export function assertSafeSlug(slug: string, source = 'slug'): void {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error(`${source} '${slug}' is not a valid slug (must match /^[a-z0-9-]+$/)`);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function validateStyleManifest(m: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(m)) {
    return { ok: false, errors: ['manifest must be a JSON object'] };
  }

  if (typeof m.name !== 'string' || m.name.length < 1 || m.name.length > 120) {
    errors.push('name: required, 1-120 characters');
  }

  if (m.slug !== undefined) {
    if (typeof m.slug !== 'string' || !SLUG_RE.test(m.slug)) {
      errors.push('slug: must match /^[a-z0-9-]+$/');
    }
  }

  if (
    typeof m.description !== 'string' ||
    m.description.length < 20 ||
    m.description.length > 1000
  ) {
    errors.push('description: required, 20-1000 characters');
  }

  if (typeof m.designMd !== 'string' || m.designMd.length < 50) {
    errors.push('designMd: required, at least 50 characters');
  }

  if (m.moodGroup !== undefined) {
    if (
      typeof m.moodGroup !== 'string' ||
      !(VALID_MOOD_GROUPS as readonly string[]).includes(m.moodGroup)
    ) {
      errors.push(
        `moodGroup: must be one of: ${VALID_MOOD_GROUPS.join(', ')}`
      );
    }
  }

  if (m.tags !== undefined && !isStringArray(m.tags)) {
    errors.push('tags: must be an array of strings');
  }

  if (m.palette !== undefined) {
    if (!Array.isArray(m.palette)) {
      errors.push('palette: must be an array');
    } else {
      m.palette.forEach((entry, i) => {
        if (!isObject(entry)) {
          errors.push(`palette[${i}]: must be an object`);
          return;
        }
        if (typeof entry.hex !== 'string' || !HEX_RE.test(entry.hex)) {
          errors.push(`palette[${i}].hex: must be 6-digit hex like "#RRGGBB"`);
        }
        if (entry.role !== undefined && typeof entry.role !== 'string') {
          errors.push(`palette[${i}].role: must be a string`);
        }
      });
    }
  }

  if (!Array.isArray(m.examples) || m.examples.length < 1) {
    errors.push('examples: required, at least one entry');
  } else {
    let heroCount = 0;
    m.examples.forEach((ex, i) => {
      if (!isObject(ex)) {
        errors.push(`examples[${i}]: must be an object`);
        return;
      }
      if (typeof ex.format !== 'string' || ex.format.length === 0) {
        errors.push(`examples[${i}].format: required, non-empty string`);
      }
      if (typeof ex.file !== 'string' || ex.file.length === 0) {
        errors.push(`examples[${i}].file: required, non-empty string`);
      }
      if (
        ex.caption !== undefined &&
        (typeof ex.caption !== 'string' || ex.caption.length > 280)
      ) {
        errors.push(`examples[${i}].caption: must be a string, ≤280 chars`);
      }
      if (ex.isHero === true) heroCount++;
      else if (ex.isHero !== undefined && typeof ex.isHero !== 'boolean') {
        errors.push(`examples[${i}].isHero: must be boolean`);
      }
    });
    if (heroCount !== 1) {
      errors.push('examples: exactly one entry must have isHero: true');
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateFormatManifest(m: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(m)) {
    return { ok: false, errors: ['manifest must be a JSON object'] };
  }

  if (typeof m.name !== 'string' || m.name.length < 1 || m.name.length > 120) {
    errors.push('name: required, 1-120 characters');
  }

  if (m.slug !== undefined) {
    if (typeof m.slug !== 'string' || !SLUG_RE.test(m.slug)) {
      errors.push('slug: must match /^[a-z0-9-]+$/');
    }
  }

  if (
    typeof m.description !== 'string' ||
    m.description.length < 20 ||
    m.description.length > 1000
  ) {
    errors.push('description: required, 20-1000 characters');
  }

  const widthValid =
    Number.isInteger(m.width) &&
    (m.width as number) >= 64 &&
    (m.width as number) <= 8192;
  const heightValid =
    Number.isInteger(m.height) &&
    (m.height as number) >= 64 &&
    (m.height as number) <= 8192;

  if (!widthValid) {
    errors.push('width: integer between 64 and 8192');
  }
  if (!heightValid) {
    errors.push('height: integer between 64 and 8192');
  }
  if (
    widthValid &&
    heightValid &&
    !isAllowedCanvas(m.width as number, m.height as number)
  ) {
    errors.push(
      `width × height must match one of the allowed canvases: ${ALLOWED_CANVAS_LIST}. Custom dimensions are not supported because the renderer is locked to these seven canvases.`,
    );
  }

  if (typeof m.contentRulesMd !== 'string' || m.contentRulesMd.length < 50) {
    errors.push('contentRulesMd: required, at least 50 characters');
  }

  if (m.tags !== undefined && !isStringArray(m.tags)) {
    errors.push('tags: must be an array of strings');
  }

  if (!Array.isArray(m.examples) || m.examples.length < 1) {
    errors.push('examples: required, at least one entry');
  } else {
    m.examples.forEach((ex, i) => {
      if (!isObject(ex)) {
        errors.push(`examples[${i}]: must be an object`);
        return;
      }
      if (typeof ex.file !== 'string' || ex.file.length === 0) {
        errors.push(`examples[${i}].file: required, non-empty string`);
      }
      if (ex.styleSlug !== undefined && typeof ex.styleSlug !== 'string') {
        errors.push(`examples[${i}].styleSlug: must be a string`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Read a manifest file from disk. Returns the parsed object or throws a
 * ManifestParseError with a clear message.
 */
export class ManifestParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestParseError';
  }
}

export class ManifestMissingFileError extends Error {
  constructor(public readonly missing: string) {
    super(`manifest references file '${missing}' but it doesn't exist`);
    this.name = 'ManifestMissingFileError';
  }
}

export class ManifestEscapingPathError extends Error {
  constructor(public readonly ref: string) {
    super(`manifest references file '${ref}' which resolves outside the manifest directory`);
    this.name = 'ManifestEscapingPathError';
  }
}

export function readManifestFile(filePath: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ManifestParseError(
        `manifest not found at ${filePath}. Make sure the directory contains ${path.basename(filePath)}.`
      );
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ManifestParseError(`could not parse ${filePath}: ${message}`);
  }
}

export interface ResolvedExampleFile {
  /** The relative path as referenced in the manifest, e.g. "./poster.png". */
  manifestRef: string;
  /**
   * Field name to use in multipart upload. Always a forward-slash relative
   * path within the manifest directory — no `..`, no leading slash, no
   * absolute paths. Safe to send to the server as a multipart field name.
   */
  fieldName: string;
  /** Absolute path on disk. */
  absolutePath: string;
}

/**
 * Resolve example file references against the publish directory. Throws
 * ManifestMissingFileError if a referenced file doesn't exist, and
 * ManifestEscapingPathError if it resolves outside `manifestDir`.
 */
export function resolveExampleFiles(
  manifestDir: string,
  examples: ReadonlyArray<{ file: string }>
): ResolvedExampleFile[] {
  const root = path.resolve(manifestDir);
  return examples.map((ex) => {
    const ref = ex.file;
    const absolutePath = path.resolve(root, ref);
    const rel = path.relative(root, absolutePath);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ManifestEscapingPathError(ref);
    }
    if (!fs.existsSync(absolutePath)) {
      throw new ManifestMissingFileError(ref);
    }
    // Normalize to forward slashes for the multipart field name so the
    // wire format is stable across platforms. `rel` is already constrained
    // to live under `manifestDir`, so it cannot contain `..`.
    const fieldName = rel.split(path.sep).join('/');
    return { manifestRef: ref, fieldName, absolutePath };
  });
}
