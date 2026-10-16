// The html-frames inputs, read and checked before anything starts. Bundled
// into the part (part.mjs) with the input schema from its part.json and the
// kit core's schema checker, so the part refuses exactly what part.json does,
// however it is called.
import { schemaErrors } from '../core/schema';
import type { FileRef, PartContext, Timeline } from '../part-interface';
import { inputs as INPUT_SCHEMA } from './parts/html-frames/1.3.1/part.json';
import {
  clipZone,
  countWords,
  framesOfStarts,
  isBlankScene,
  paceHolds,
  speechTimes,
  startsOfHolds,
  wordsByScene,
  zoneOnVideo,
  type PaceSpec,
  type SpeechEntry,
  type SpokenWord,
  type Zone,
} from './timing';
import { underSceneFrames, type UnderInfo, type UnderSpec } from './under';

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
  /** The cast key of who says this scene (1.2.0). */
  speaker: string | null;
  /** The style's own scene fields (1.2.0), passed to the page as they are. */
  extra: Record<string, unknown> | null;
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

/** An extra picture the page shows by id (1.2.0 `media`): a cast still, a screen. */
export interface MediaSpec {
  id: string;
  image: FileRef;
}

/**
 * One plan.footage entry, as the page sees it (1.2.0 `footage`): its window and
 * framing only. The file is never put in the page; a frame page cannot play video.
 */
export interface FootageSpec {
  index: number;
  scene_id: string | null;
  kind: string;
  start_s: number | null;
  end_s: number | null;
  crop: unknown;
  fit: string | null;
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
  /** The video the page is drawn over (1.2.0), or null for a video of the page alone. */
  under: UnderSpec | null;
  /** The voice track the scenes were timed by, or the speech of the video drawn over; else empty (1.2.0). */
  speech: SpeechEntry[];
  /** Each scene's spoken words, in video seconds (kit.scenes[i].words). */
  words: SpokenWord[][];
  /** Where captions may go, in the page's CSS pixels, kept to the page (1.2.0). */
  captionZone: Zone | null;
  /** How many of the last scenes are the end card; 0 for none (1.2.0). */
  endCardScenes: number;
  /** skip_blank asked for nothing and no scene has text: the step makes nothing (1.2.0). */
  skip: boolean;
  /** Extra pictures by id (1.2.0), staged as kit.media. */
  media: MediaSpec[];
  /** plan.footage windows (1.2.0), never the files. */
  footage: FootageSpec[];
  /** Measure every picture into kit.facts (1.2.0). */
  facts: boolean;
}

/** What the maker measured before reading the inputs: the video to draw over, read with ffprobe. */
export interface Measured {
  under?: UnderInfo | null;
}

/** The inputs that set the video's length; exactly one is given. */
const LENGTH_SOURCES = ['duration_s', 'scene_s', 'pace', 'speech', 'under'] as const;

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

export { countWords };

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
    const speaker = optionalText(raw.speaker, `${at}.speaker`, fail);
    if (raw.extra !== undefined && raw.extra !== null && !isObject(raw.extra)) fail(`${at}.extra should be an object`);
    const extra = isObject(raw.extra) ? raw.extra : null;
    return { id, index, line, on_screen: onScreen, picture, image, speaker, extra };
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

function mediaOf(value: unknown, fail: Fail): MediaSpec[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail('media should be a list');
  const ids = new Set<string>();
  return value.map((raw, i) => {
    const at = `media[${i}]`;
    if (!isObject(raw)) fail(`${at} should be an object`);
    if (typeof raw.id !== 'string' || !raw.id) fail(`${at}.id should be text`);
    if (ids.has(raw.id)) fail(`${at}.id "${raw.id}" is used twice`);
    ids.add(raw.id);
    return { id: raw.id, image: fileOf(raw.image, `${at}.image`, ['image'], fail) };
  });
}

function secondsOf(ms: unknown): number | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? Math.round(ms) / 1000 : null;
}

function footageOf(value: unknown, fail: Fail): FootageSpec[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail('footage should be a list');
  return value.map((raw, index) => {
    const at = `footage[${index}]`;
    if (!isObject(raw)) fail(`${at} should be an object`);
    const start = secondsOf(raw.start_ms);
    const end = secondsOf(raw.end_ms);
    if (start !== null && end !== null && end < start) fail(`${at} ends before it starts`);
    return {
      index,
      scene_id: typeof raw.scene_id === 'string' && raw.scene_id ? raw.scene_id : null,
      kind: typeof raw.kind === 'string' && raw.kind ? raw.kind : 'video',
      start_s: start,
      end_s: end,
      crop: raw.crop ?? null,
      fit: typeof raw.fit === 'string' && raw.fit ? raw.fit : null,
    };
  });
}

/** Reads the part's inputs into a render plan, or throws bad_input naming the problem. */
export function readInputs(raw: unknown, ctx: Pick<PartContext, 'error'>, measured: Measured = {}): MakerSpec {
  const fail: Fail = (detail) => {
    throw ctx.error('bad_input', detail);
  };
  if (!isObject(raw)) fail('inputs should be an object');
  const schemaProblems = schemaErrors(INPUT_SCHEMA, raw);
  if (schemaProblems.length) fail(schemaProblems.slice(0, 3).join('; '));
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

  const given = LENGTH_SOURCES.filter((key) => raw[key] !== undefined && raw[key] !== null);
  if (given.length !== 1) fail('give exactly one of duration_s (the whole video), scene_s (each scene), pace, speech or under (a video to draw over)');
  const source = given[0];

  let under: UnderSpec | null = null;
  if (source === 'under') {
    const file = fileOf(raw.under, 'under', ['video'], fail);
    if (!isObject(raw.under_timeline)) fail('under_timeline should be the timeline of the video to draw over');
    const timeline = raw.under_timeline as unknown as Timeline;
    const info = measured.under === undefined ? null : measured.under;
    if (measured.under === null) fail('the video to draw over could not be read');
    // Before it is measured (a dry read), the timeline's own length stands in.
    const seconds = info?.seconds ?? (typeof file.duration_s === 'number' ? file.duration_s : timeline.duration_s);
    under = {
      file,
      timeline,
      info: info ?? { seconds, width: timeline.width, height: timeline.height, fps: timeline.fps, hasAudio: false },
    };
  } else if (raw.under_timeline !== undefined && raw.under_timeline !== null) fail('under_timeline is given without under');

  // Drawn over a video, the frame rate follows it unless the step sets one.
  const underFps = under?.info.fps ? Math.min(LIMITS.maxFps, Math.max(1, Math.round(under.info.fps))) : null;
  const fps = raw.fps ?? underFps ?? 30;
  if (typeof fps !== 'number' || !Number.isInteger(fps) || fps < 1 || fps > LIMITS.maxFps) fail(`fps should be a whole number from 1 to ${LIMITS.maxFps}`);

  const shortSide = raw.short_side ?? 1080;
  if (!SHORT_SIDES.includes(shortSide as 720 | 1080)) fail(`short_side should be ${SHORT_SIDES.join(' or ')}`);
  const scale = (shortSide as number) / 1080;
  const output = { width: Math.round(design.width * scale), height: Math.round(design.height * scale) };

  // Scenes timed by a voice track or held by their words start where these say.
  const speechIn = source === 'speech' ? (raw.speech as SpeechEntry[]) : null;
  let timed: { starts: number[]; seconds: number } | null = null;
  if (speechIn) {
    const times = speechTimes(scenes.map((scene) => scene.id), speechIn, typeof raw.tail_s === 'number' ? raw.tail_s : 0);
    if (typeof times === 'string') fail(times);
    timed = times;
  } else if (source === 'pace') {
    const holds = paceHolds(scenes, raw.pace as unknown as PaceSpec);
    if (typeof holds === 'string') fail(holds);
    timed = startsOfHolds(holds);
  }

  const seconds = under
    ? under.info.seconds
    : timed
      ? timed.seconds
      : source === 'duration_s'
        ? raw.duration_s
        : (raw.scene_s as number) * scenes.length;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < LIMITS.minSeconds || seconds > LIMITS.maxSeconds) {
    fail(`the video would be ${String(seconds)} seconds; it must be ${LIMITS.minSeconds} to ${LIMITS.maxSeconds}`);
  }
  const frameCount = Math.round(seconds * fps);
  if (frameCount < scenes.length) fail(`${scenes.length} scenes need at least ${scenes.length} frames; the video has ${frameCount}`);
  let sceneFrames: number[];
  if (timed) {
    const frames = framesOfStarts(timed.starts, fps, frameCount);
    if (!Array.isArray(frames)) {
      const scene = scenes[frames.empty];
      fail(
        `scene ${frames.empty + 1} (${scene.id}) gets no time at ${fps} fps: ${
          source === 'speech' ? 'the speech gives it none (a scene with no speech needs a gap, or tail_s at the end)' : 'its pace hold is too short'
        }`,
      );
    }
    sceneFrames = frames;
  } else if (under) {
    // Scenes take the real times of the video drawn over.
    const fromUnder = underSceneFrames(scenes.map((scene) => scene.id), under.timeline, fps, frameCount);
    if (!fromUnder) {
      fail(`the plan's ${scenes.length} scenes do not match the ${under.timeline.scenes.length} scenes of the video to draw over (by id or in order)`);
    }
    sceneFrames = fromUnder;
  } else {
    // Scenes share the video evenly, on whole frames, so every scene starts on a frame.
    sceneFrames = scenes.map((_, i) => Math.round((i * frameCount) / scenes.length));
    sceneFrames.push(frameCount);
  }

  const values = raw.values ?? {};
  if (!isObject(values)) fail('values should be an object');
  if (Buffer.byteLength(JSON.stringify(values), 'utf8') > 64 * 1024) fail('values is larger than 64 KB');

  let captionZone: Zone | null = null;
  if (raw.caption_zone !== undefined && raw.caption_zone !== null) {
    captionZone = clipZone(raw.caption_zone as unknown as Zone, design);
    if (!captionZone) fail(`caption_zone lies outside the ${design.width}x${design.height} page`);
    if (!zoneOnVideo(captionZone, scale, output)) fail(`caption_zone is less than a pixel of the ${output.width}x${output.height} video`);
  }
  const endCardScenes = typeof raw.end_card_scenes === 'number' ? raw.end_card_scenes : 0;
  if (endCardScenes > scenes.length) fail(`end_card_scenes is ${endCardScenes}, but there are only ${scenes.length} scenes`);

  const speech = speechIn ?? under?.timeline.speech ?? [];

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
    under,
    speech,
    words: wordsByScene(speech, sceneFrames, fps),
    captionZone,
    endCardScenes,
    skip: raw.skip_blank === true && scenes.every(isBlankScene),
    media: mediaOf(raw.media, fail),
    footage: footageOf(raw.footage, fail),
    facts: raw.facts === true,
  };
}
