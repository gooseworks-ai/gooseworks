// The html-frames inputs, read and checked before anything starts. Bundled
// into the part (part.mjs): Node built-ins only, nothing from the kit core.
import type { FileRef, PartContext } from '../part-interface';

export type Aspect = '9:16' | '1:1' | '4:5' | '16:9';

/** Every frame page is laid out at a 1080 px short side (CSS px). */
export const DESIGN_SIZE: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};

/** Output short sides the maker encodes. The page is laid out at 1080 and scaled for 720. */
export const SHORT_SIDES = [720, 1080] as const;

export const LIMITS = {
  scenes: 30,
  products: 12,
  frames: 200,
  fonts: 20,
  minSeconds: 0.5,
  maxSeconds: 180,
  maxFps: 60,
  maxWords: 200,
  textChars: 2000,
};

export interface SceneSpec {
  id: string;
  index: number;
  line: string | null;
  on_screen: string | null;
  /** A picture the plan names: a still (as a file) or a description. */
  picture: FileRef | string | null;
  /** A picture the customer uploaded for this scene (a partner's icon, a screen), as a file. */
  image: FileRef | null;
}

export interface ProductSpec {
  id: string;
  name: string;
  images: FileRef[];
}

export interface BrandSpec {
  name: string;
  logo: FileRef | null;
  colors: Record<string, string | string[]>;
  fonts: { heading: FileRef | null; body: FileRef | null };
  cta: { text: string; url: string | null } | null;
}

export interface MakerSpec {
  template: FileRef;
  frames: FileRef[];
  fonts: FileRef[];
  scenes: SceneSpec[];
  products: ProductSpec[];
  brand: BrandSpec | null;
  aspect: Aspect;
  fps: number;
  /** Frames in the video: the duration rounded to whole frames. */
  frameCount: number;
  /** Where each scene starts, in frames; one more entry than scenes (the end). */
  sceneFrames: number[];
  /** CSS size the page is laid out at. */
  design: { width: number; height: number };
  /** Pixel size of the video. */
  output: { width: number; height: number };
  /** Device scale factor: output / design. */
  scale: number;
  values: Record<string, unknown>;
}

type Fail = (detail: string) => never;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isFileRef(value: unknown): value is FileRef {
  return (
    isObject(value) &&
    value.kind === 'file' &&
    typeof value.path === 'string' &&
    value.path.startsWith('/') &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.media === 'string' &&
    typeof value.mime === 'string'
  );
}

function fileOf(value: unknown, at: string, media: string[], fail: Fail): FileRef {
  if (!isFileRef(value)) fail(`${at} should be a file`);
  if (!media.includes(value.media)) fail(`${at} should be ${media.join(' or ')}, not ${value.media}`);
  return value;
}

function optionalText(value: unknown, at: string, fail: Fail): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') fail(`${at} should be text`);
  if (value.length > LIMITS.textChars) fail(`${at} is longer than ${LIMITS.textChars} characters`);
  return value;
}

/** Words as a reader counts them: runs of letters or digits, joined by ' or -. */
export function countWords(text: string | null): number {
  if (!text) return 0;
  return text.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function scenesOf(value: unknown, maxWords: number, fail: Fail): SceneSpec[] {
  if (!Array.isArray(value) || value.length === 0) fail('scenes should list at least one scene');
  if (value.length > LIMITS.scenes) fail(`scenes lists ${value.length} scenes; at most ${LIMITS.scenes} are allowed`);
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const at = `scenes[${index}]`;
    if (!isObject(raw)) fail(`${at} should be an object`);
    const id = raw.id === undefined || raw.id === null ? `scene-${index + 1}` : raw.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) fail(`${at}.id should be text of 1 to 64 characters`);
    if (ids.has(id)) fail(`${at}.id "${id}" is used twice`);
    ids.add(id);
    const line = optionalText(raw.line, `${at}.line`, fail);
    const onScreen = optionalText(raw.on_screen, `${at}.on_screen`, fail);
    for (const [field, text] of [['line', line], ['on_screen', onScreen]] as const) {
      const words = countWords(text);
      if (words > maxWords) {
        fail(`scene ${index + 1} (${id}) has ${words} words in ${field}; this style allows ${maxWords} per scene`);
      }
    }
    let picture: FileRef | string | null = null;
    if (isFileRef(raw.picture)) picture = fileOf(raw.picture, `${at}.picture`, ['image'], fail);
    else picture = optionalText(raw.picture, `${at}.picture`, fail);
    const image = raw.image === undefined || raw.image === null ? null : fileOf(raw.image, `${at}.image`, ['image'], fail);
    return { id, index, line, on_screen: onScreen, picture, image };
  });
}

function productsOf(value: unknown, fail: Fail): ProductSpec[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail('products should be a list');
  if (value.length > LIMITS.products) fail(`products lists ${value.length}; at most ${LIMITS.products} are allowed`);
  return value.map((raw, i) => {
    const at = `products[${i}]`;
    if (!isObject(raw)) fail(`${at} should be an object`);
    if (typeof raw.id !== 'string' || !raw.id) fail(`${at}.id should be text`);
    const name = optionalText(raw.name, `${at}.name`, fail) ?? '';
    const images = raw.images === undefined || raw.images === null ? [] : raw.images;
    if (!Array.isArray(images) || images.length > 20) fail(`${at}.images should be a list of up to 20 images`);
    return { id: raw.id, name, images: images.map((img, j) => fileOf(img, `${at}.images[${j}]`, ['image'], fail)) };
  });
}

function brandOf(value: unknown, fail: Fail): BrandSpec | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) fail('brand should be an object');
  const name = optionalText(value.name, 'brand.name', fail) ?? '';
  const logo = value.logo === undefined || value.logo === null ? null : fileOf(value.logo, 'brand.logo', ['image'], fail);
  const colors: Record<string, string | string[]> = {};
  if (value.colors !== undefined && value.colors !== null) {
    if (!isObject(value.colors)) fail('brand.colors should be an object');
    for (const [key, color] of Object.entries(value.colors)) {
      if (color === null || color === undefined) continue;
      if (typeof color === 'string' && color.length <= 64) colors[key] = color;
      else if (Array.isArray(color) && color.length <= 16 && color.every((c) => typeof c === 'string' && c.length <= 64)) colors[key] = color as string[];
      else fail(`brand.colors.${key} should be a colour or a list of colours`);
    }
  }
  const fonts: BrandSpec['fonts'] = { heading: null, body: null };
  if (value.fonts !== undefined && value.fonts !== null) {
    if (!isObject(value.fonts)) fail('brand.fonts should be an object');
    for (const slot of ['heading', 'body'] as const) {
      const font = value.fonts[slot];
      if (font !== undefined && font !== null) fonts[slot] = fileOf(font, `brand.fonts.${slot}`, ['font'], fail);
    }
  }
  let cta: BrandSpec['cta'] = null;
  if (value.cta !== undefined && value.cta !== null) {
    if (!isObject(value.cta)) fail('brand.cta should be an object');
    const text = optionalText(value.cta.text, 'brand.cta.text', fail);
    if (text) cta = { text, url: optionalText(value.cta.url, 'brand.cta.url', fail) };
  }
  return { name, logo, colors, fonts, cta };
}

/** Reads the part's inputs into a render plan, or throws bad_input naming the problem. */
export function readInputs(raw: unknown, ctx: Pick<PartContext, 'error'>): MakerSpec {
  const fail: Fail = (detail) => {
    throw ctx.error('bad_input', detail);
  };
  if (!isObject(raw)) fail('inputs should be an object');
  const template = fileOf(raw.template, 'template', ['html'], fail);
  const framesRaw = raw.frames ?? [];
  if (!Array.isArray(framesRaw) || framesRaw.length > LIMITS.frames) fail(`frames should be a list of up to ${LIMITS.frames} files`);
  const frames = framesRaw.map((f, i) => fileOf(f, `frames[${i}]`, ['html', 'text', 'json', 'image'], fail));
  const fontsRaw = raw.fonts ?? [];
  if (!Array.isArray(fontsRaw) || fontsRaw.length > LIMITS.fonts) fail(`fonts should be a list of up to ${LIMITS.fonts} files`);
  const fonts = fontsRaw.map((f, i) => fileOf(f, `fonts[${i}]`, ['font'], fail));

  const maxWords = raw.max_words;
  if (typeof maxWords !== 'number' || !Number.isInteger(maxWords) || maxWords < 1 || maxWords > LIMITS.maxWords) {
    fail(`max_words should be a whole number from 1 to ${LIMITS.maxWords}`);
  }
  const scenes = scenesOf(raw.scenes, maxWords, fail);

  const aspect = raw.aspect;
  if (typeof aspect !== 'string' || !(aspect in DESIGN_SIZE)) fail(`aspect should be one of ${Object.keys(DESIGN_SIZE).join(', ')}`);
  const design = DESIGN_SIZE[aspect as Aspect];

  const fps = raw.fps ?? 30;
  if (typeof fps !== 'number' || !Number.isInteger(fps) || fps < 1 || fps > LIMITS.maxFps) fail(`fps should be a whole number from 1 to ${LIMITS.maxFps}`);

  const shortSide = raw.short_side ?? 1080;
  if (!SHORT_SIDES.includes(shortSide as 720 | 1080)) fail(`short_side should be ${SHORT_SIDES.join(' or ')}`);
  const scale = (shortSide as number) / 1080;
  const output = { width: Math.round(design.width * scale), height: Math.round(design.height * scale) };

  const hasTotal = raw.duration_s !== undefined && raw.duration_s !== null;
  const hasPerScene = raw.scene_s !== undefined && raw.scene_s !== null;
  if (hasTotal === hasPerScene) fail('give exactly one of duration_s (the whole video) or scene_s (each scene)');
  const seconds = hasTotal ? raw.duration_s : (raw.scene_s as number) * scenes.length;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < LIMITS.minSeconds || seconds > LIMITS.maxSeconds) {
    fail(`the video would be ${String(seconds)} seconds; it must be ${LIMITS.minSeconds} to ${LIMITS.maxSeconds}`);
  }
  const frameCount = Math.round(seconds * fps);
  if (frameCount < scenes.length) fail(`${scenes.length} scenes need at least ${scenes.length} frames; the video has ${frameCount}`);
  // Scenes share the video evenly, on whole frames, so every scene starts on a frame.
  const sceneFrames = scenes.map((_, i) => Math.round((i * frameCount) / scenes.length));
  sceneFrames.push(frameCount);

  const values = raw.values ?? {};
  if (!isObject(values)) fail('values should be an object');
  if (JSON.stringify(values).length > 64 * 1024) fail('values is larger than 64 KB');

  return {
    template,
    frames,
    fonts,
    scenes,
    products: productsOf(raw.products, fail),
    brand: brandOf(raw.brand, fail),
    aspect: aspect as Aspect,
    fps,
    frameCount,
    sceneFrames,
    design,
    output,
    scale,
    values,
  };
}
