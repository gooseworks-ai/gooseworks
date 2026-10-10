// Builds the page folder a frame page runs from: the style's template and
// frames at their own relative places, the fonts, product photos and brand
// files under _kit/, and the template with the kit runtime put first in its
// <head>. Only these files are in the folder, so the page can show only what
// its inputs name (and what the step hash covers). Bundled into the part.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { FileRef, PartContext } from '../part-interface';
import { cssDataUrls, isAnimatedImage } from './images';
import type { MakerSpec } from './inputs';
import { runtimeScript } from './runtime';

const KIT_FOLDER = '_kit';
// A page's picture is staged at most this many pixels on its long side: the browser drops a 4000 px
// photo when the page holds several, and reports it as unreadable.
const MAX_PICTURE_PX = 2048;
// Pictures the kit's ffmpeg reads and writes back losslessly enough to stage smaller (to PNG, a JPEG to JPEG).
const RESIZABLE: Record<string, 'png' | 'jpg'> = { 'image/png': 'png', 'image/webp': 'png', 'image/jpeg': 'jpg' };

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

const FONT_FORMAT: Record<string, { ext: string; format: string }> = {
  ttf: { ext: 'ttf', format: 'truetype' },
  otf: { ext: 'otf', format: 'opentype' },
  woff: { ext: 'woff', format: 'woff' },
  woff2: { ext: 'woff2', format: 'woff2' },
};

const COLOR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\))$/;

export interface BuiltPage {
  /** Absolute path of the page to open. */
  entry: string;
  /** Font families the page can use: the style's fonts by file name, the brand's as brand-heading and brand-body. */
  families: string[];
  /** Bytes written into the page folder. */
  bytes: number;
}

type Fail = (detail: string) => never;

/** Reads a file the core handed over and refuses it if it changed since the core hashed it. */
async function readChecked(ref: FileRef, fail: Fail): Promise<Buffer> {
  let data: Buffer;
  try {
    data = await readFile(ref.path);
  } catch {
    return fail(`the file ${path.basename(ref.path)} could not be read`);
  }
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha !== ref.sha256) fail(`the file ${path.basename(ref.path)} changed after it was checked`);
  return data;
}

function commonFolder(files: string[]): string {
  let common = path.dirname(files[0]);
  for (const file of files.slice(1)) {
    while (path.relative(common, file).startsWith('..')) {
      const up = path.dirname(common);
      if (up === common) break;
      common = up;
    }
  }
  return common;
}

function fontOf(ref: FileRef, fail: Fail): { ext: string; format: string } {
  const fromMime = ref.mime.startsWith('font/') ? ref.mime.slice(5) : '';
  const fromName = path.extname(ref.path).slice(1).toLowerCase();
  const kind = FONT_FORMAT[fromMime] ?? FONT_FORMAT[fromName];
  if (!kind) fail(`the font ${path.basename(ref.path)} is not ttf, otf, woff or woff2`);
  return kind;
}

/** The family a style font is used by in CSS: its file name without the extension. */
export function familyOf(ref: FileRef): string {
  return path.basename(ref.path, path.extname(ref.path)).replace(/[^A-Za-z0-9 _-]/g, '-');
}

/**
 * Puts the kit's head first in the document, right after the doctype, so it
 * runs before anything of the page's own, even a script placed before <head>.
 * The parser files it into the head the page then continues.
 */
function injectFirst(html: string, head: string): string {
  const text = html.replace(/^\uFEFF/, '');
  const doctype = /^\s*<!doctype[^>]*>/i.exec(text);
  if (doctype) return doctype[0] + head + text.slice(doctype[0].length);
  return '<!doctype html>' + head + text;
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Builds the page folder. `reserve(bytes)` is called before every write and
 * throws when the maker's working space would run out, so nothing is written
 * past it.
 */
export async function buildPage(
  spec: MakerSpec,
  dir: string,
  ctx: Pick<PartContext, 'error' | 'log'> & { tools?: Pick<PartContext['tools'], 'exec' | 'probe'> },
  reserve: (bytes: number) => void = () => undefined,
): Promise<BuiltPage> {
  const fail: Fail = (detail) => {
    throw ctx.error('bad_input', detail);
  };
  await mkdir(path.join(dir, KIT_FOLDER, 'fonts'), { recursive: true });
  await mkdir(path.join(dir, KIT_FOLDER, 'media'), { recursive: true });
  let bytes = 0;
  const put = async (target: string, data: Buffer | string) => {
    const size = Buffer.byteLength(data);
    reserve(size);
    await writeFile(target, data);
    bytes += size;
  };
  const still = (ref: FileRef, data: Buffer) => {
    if (isAnimatedImage(data)) fail(`the picture ${path.basename(ref.path)} moves on its own; frame pages take still pictures and draw any motion themselves`);
  };
  // A closed shadow root written into the page's HTML is out of the kit runtime's reach.
  const openTrees = (ref: FileRef, data: Buffer) => {
    if (/\bshadowroot(mode)?\s*=\s*["']?closed/i.test(data.toString('utf8'))) {
      fail(`the frame ${path.basename(ref.path)} declares a closed shadow root; use an open one`);
    }
  };

  // The template and its frames keep their places relative to each other.
  const pageFiles = [spec.template, ...spec.frames];
  const base = commonFolder(pageFiles.map((f) => f.path));
  const entry = path.join(dir, path.relative(base, spec.template.path));
  // Every URL the kit gives the page is relative to the page itself.
  const url = (relFromDir: string) => path.relative(path.dirname(entry), path.join(dir, ...relFromDir.split('/'))).split(path.sep).join('/');
  const placed = new Map<string, string>();
  const preload: string[] = [];
  const staging = new Map<string, string>();
  for (const ref of pageFiles) {
    const rel = path.relative(base, ref.path).split(path.sep).join('/');
    if (rel.split('/')[0] === KIT_FOLDER) fail(`the frame ${rel} uses the folder name ${KIT_FOLDER}, which the kit keeps for itself`);
    const known = placed.get(rel);
    if (known !== undefined) {
      if (known !== ref.sha256) fail(`two different frames are both called ${rel}`);
      continue;
    }
    placed.set(rel, ref.sha256);
    const data = await readChecked(ref, fail);
    if (ref.media === 'html') openTrees(ref, data);
    // The page can't read the rules of its own stylesheet files (each file is its own origin),
    // so the pictures they name as data: URLs are checked here.
    if (ref.mime === 'text/css' || /\.css$/i.test(ref.path)) {
      for (const inline of cssDataUrls(data.toString('utf8'))) {
        if (isAnimatedImage(inline.bytes)) fail(`the stylesheet ${rel} names a picture that moves on its own; frame pages take still pictures and draw any motion themselves`);
      }
    }
    const target = path.join(dir, ...rel.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    if (ref === spec.template) continue;
    if (ref.media === 'image') still(ref, data);
    await put(target, data);
    if (ref.media === 'image') preload.push(url(rel));
  }

  // Fonts: the style's under their file names, the brand's under fixed names.
  const faces: string[] = [];
  const families: string[] = [];
  const addFont = async (ref: FileRef, family: string) => {
    if (families.includes(family)) fail(`two fonts are both called ${family}`);
    const kind = fontOf(ref, fail);
    const name = `${ref.sha256.slice(0, 16)}.${kind.ext}`;
    await put(path.join(dir, KIT_FOLDER, 'fonts', name), await readChecked(ref, fail));
    faces.push(`@font-face{font-family:${cssString(family)};src:url(${cssString(url(`${KIT_FOLDER}/fonts/${name}`))}) format(${cssString(kind.format)});font-display:block;}`);
    families.push(family);
  };
  for (const font of spec.fonts) await addFont(font, familyOf(font));
  if (spec.brand?.fonts.heading) await addFont(spec.brand.fonts.heading, 'brand-heading');
  if (spec.brand?.fonts.body) await addFont(spec.brand.fonts.body, 'brand-body');

  // A picture larger than MAX_PICTURE_PX on its long side, staged smaller by the kit's ffmpeg; null when it fits.
  const smaller = async (ref: FileRef): Promise<{ ext: string; target: string } | null> => {
    const to = RESIZABLE[ref.mime];
    if (!to || !ctx.tools) return null;
    let { width, height } = ref;
    if (!width || !height) ({ width, height } = await ctx.tools.probe(ref.path).catch(() => ({ width: undefined, height: undefined })));
    if (!width || !height || Math.max(width, height) <= MAX_PICTURE_PX) return null;
    const k = MAX_PICTURE_PX / Math.max(width, height);
    const [w, h] = [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
    const rel = `${KIT_FOLDER}/media/${ref.sha256.slice(0, 16)}-${MAX_PICTURE_PX}.${to}`;
    const target = path.join(dir, ...rel.split('/'));
    const quality = to === 'jpg' ? ['-q:v', '2'] : [];
    try {
      await ctx.tools.exec('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-i', ref.path, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=lanczos`, ...quality, target]);
    } catch {
      return fail(`the picture ${path.basename(ref.path)} is too large to show (${width}x${height}); use one at most ${MAX_PICTURE_PX} px on its long side`);
    }
    return { ext: to, target };
  };

  // Pictures: product photos, the logo and scene stills, by content.
  const media = async (ref: FileRef): Promise<string> => {
    const ext = IMAGE_EXT[ref.mime];
    if (!ext) fail(`the picture ${path.basename(ref.path)} is not png, jpg, webp, gif, avif or svg`);
    let rel = `${KIT_FOLDER}/media/${ref.sha256.slice(0, 16)}.${ext}`;
    const staged = staging.get(ref.sha256);
    if (staged) return staged;
    const data = await readChecked(ref, fail);
    still(ref, data);
    const resized = await smaller(ref);
    if (resized) {
      rel = path.relative(dir, resized.target).split(path.sep).join('/');
      const size = (await readFile(resized.target)).length;
      reserve(size);
      bytes += size;
    } else await put(path.join(dir, ...rel.split('/')), data);
    preload.push(url(rel));
    staging.set(ref.sha256, url(rel));
    return url(rel);
  };
  const products = [];
  for (const product of spec.products) {
    const images = [];
    for (const image of product.images) images.push(await media(image));
    products.push({ id: product.id, name: product.name, images });
  }
  const scenes = [];
  for (const scene of spec.scenes) {
    const picture = scene.picture && typeof scene.picture === 'object' ? await media(scene.picture) : scene.picture;
    const image = scene.image ? await media(scene.image) : null;
    scenes.push({
      id: scene.id,
      index: scene.index,
      line: scene.line,
      on_screen: scene.on_screen,
      picture,
      image,
      start_s: spec.sceneFrames[scene.index] / spec.fps,
      end_s: spec.sceneFrames[scene.index + 1] / spec.fps,
    });
  }
  const brand = spec.brand
    ? {
        name: spec.brand.name,
        colors: spec.brand.colors,
        logo: spec.brand.logo ? await media(spec.brand.logo) : null,
        fonts: { heading: spec.brand.fonts.heading ? 'brand-heading' : null, body: spec.brand.fonts.body ? 'brand-body' : null },
        cta: spec.brand.cta,
      }
    : null;

  // Brand colours as CSS variables, only when they are plain colours.
  const variables = [`--kit-width:${spec.design.width}px`, `--kit-height:${spec.design.height}px`];
  for (const [key, value] of Object.entries(spec.brand?.colors ?? {})) {
    if (typeof value === 'string' && /^[a-z0-9_]+$/i.test(key) && COLOR.test(value.trim())) {
      variables.push(`--brand-${key.replace(/_/g, '-')}:${value.trim()}`);
    }
  }

  const data = {
    aspect: spec.aspect,
    width: spec.design.width,
    height: spec.design.height,
    fps: spec.fps,
    frames: spec.frameCount,
    duration_s: spec.frameCount / spec.fps,
    scenes,
    products,
    brand,
    fonts: families,
    values: spec.values,
    preload,
  };
  const head =
    '<meta charset="utf-8">' +
    `<style id="kit-fonts">${faces.join('')}:root{${variables.join(';')}}</style>` +
    `<script>${runtimeScript(data)}</script>`;
  const template = (await readChecked(spec.template, fail)).toString('utf8');
  await put(entry, injectFirst(template, head));
  return { entry, families, bytes };
}
