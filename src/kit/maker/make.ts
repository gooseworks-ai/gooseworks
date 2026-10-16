// The web video maker: lays out a style's frame page with the plan's scenes,
// products and brand in the kit's Chromium, moves its virtual clock one frame
// at a time, captures each frame and encodes them with the kit's ffmpeg.
// Everything it touches comes through the part context: the work folders,
// the browser, the two binaries, progress and the stop signal. Bundled into
// the html-frames part (part.mjs).
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FileRef, KitPage, PartContext, Timeline } from '../part-interface';
import { CUE_SOUNDS, bankSound, bedArgs, cuesOf, mixCues, muxArgs, readWav, wavBytes, type Cue, type CueSound } from './cues';
import { FRAME_PATTERN, SEGMENT_FRAMES, concatArgs, concatList, frameName, pngSize, segmentArgs } from './encode';
import { isAnimatedImage } from './images';
import { isFileRef, readInputs, type MakerSpec } from './inputs';
import { buildPage } from './page';
import { zoneOnVideo } from './timing';
import { alphaSegmentArgs, compositeArgs, passThroughTimeline, probeUnder, quietBands, underIsShared, type UnderInfo } from './under';

/** What the maker gives back; the part returns the first three. */
export interface MakerResult {
  video: FileRef;
  seconds: number;
  timeline: Timeline;
  /** sha256 of every captured frame, in order. */
  frameHashes: string[];
  sourceFiles: FileRef[];
  provenance: Record<string, unknown>;
}

/** One frame may take this long before the maker gives up on the page. */
const FRAME_TIMEOUT_MS = 60_000;

type MakerContext = Pick<PartContext, 'workDir' | 'tmpDir' | 'tools' | 'browser' | 'progress' | 'log' | 'error' | 'signal' | 'file'> & {
  /** The part's folder; its assets/sfx bank is read only when the page marks sound cues. */
  part?: Pick<PartContext['part'], 'dir'>;
};

/** Where the page drew the brand's logo, in the page's CSS pixels. */
export interface LogoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function timelineOf(spec: MakerSpec, logo: LogoRect | null): Timeline {
  const size = { duration_s: spec.frameCount / spec.fps, width: spec.output.width, height: spec.output.height, fps: spec.fps };
  // Drawn over a video, the video's own scenes, speech, end card and zones carry through.
  const scenes = spec.scenes.map((scene) => ({
    id: scene.id,
    start_s: spec.sceneFrames[scene.index] / spec.fps,
    end_s: spec.sceneFrames[scene.index + 1] / spec.fps,
  }));
  // Plan scenes that shared a one-scene video drawn over are this video's scenes.
  const shared = spec.under && underIsShared(spec.scenes.map((scene) => scene.id), spec.under.timeline);
  const timeline: Timeline = spec.under
    ? passThroughTimeline(spec.under.timeline, size, shared ? scenes : undefined)
    : { ...size, scenes, speech: spec.speech };
  // The last end_card_scenes scenes are the end card (over a video, this replaces its own).
  if (spec.endCardScenes > 0) {
    timeline.end_card = { start_s: spec.sceneFrames[spec.scenes.length - spec.endCardScenes] / spec.fps, end_s: size.duration_s };
  }
  const zones: NonNullable<Timeline['safe_zones']> = [];
  // The logo's box on the output picture, so the final check can look for the logo where it is drawn.
  if (logo) {
    const k = spec.scale;
    const x0 = Math.max(0, Math.floor(logo.x * k));
    const y0 = Math.max(0, Math.floor(logo.y * k));
    const x1 = Math.min(spec.output.width, Math.ceil((logo.x + logo.w) * k));
    const y1 = Math.min(spec.output.height, Math.ceil((logo.y + logo.h) * k));
    if (x1 - x0 >= 4 && y1 - y0 >= 4) zones.push({ use: 'logo' as const, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  // The style's caption zone, in the video's pixels; it takes the place of any caption zone of a video drawn over.
  const captions = spec.captionZone ? zoneOnVideo(spec.captionZone, spec.scale, spec.output) : null;
  if (captions) zones.push({ use: 'captions' as const, ...captions });
  const carried = (timeline.safe_zones ?? []).filter((zone) => !spec.captionZone || zone.use !== 'captions');
  const all = [...zones, ...carried].slice(0, 8);
  if (all.length) timeline.safe_zones = all;
  else delete timeline.safe_zones;
  return timeline;
}

async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** What the page runtime hands back after starting or drawing: problems, new data:/blob: pictures, and the logo's box. */
function reportOf(value: unknown): { problems: string[]; sources: Array<{ url: string; data: string }>; logo: LogoRect | null } {
  const raw = (value ?? {}) as { problems?: unknown; sources?: unknown; logo?: unknown };
  const problems = Array.isArray(raw.problems) ? raw.problems.filter((v): v is string => typeof v === 'string') : [];
  const sources = Array.isArray(raw.sources)
    ? raw.sources.filter((v): v is { url: string; data: string } => !!v && typeof v.url === 'string' && typeof v.data === 'string')
    : [];
  const box = raw.logo as Partial<LogoRect> | null | undefined;
  const logo = box && [box.x, box.y, box.w, box.h].every((v) => typeof v === 'number' && Number.isFinite(v)) && box.w! > 0 && box.h! > 0 ? (box as LogoRect) : null;
  return { problems, sources, logo };
}

/** The most a PNG of this size can take: raw RGBA, a filter byte per row, and zlib's overhead. */
function pngBound(width: number, height: number): number {
  const raw = (width * 4 + 1) * height;
  return raw + Math.ceil(raw / 16000) * 5 + 64 * 1024;
}

/** Kept back from ffmpeg's -fs limit: ffmpeg may finish the packet it is writing past the limit. */
const FS_MARGIN = 4 * 1024 * 1024;

export interface MakerOptions {
  /** Working space the maker may use, in bytes: page files, frames, segments and the video. */
  diskLimitBytes?: number;
}

/** The working space html-frames may use; part.json's needs.disk_mb says the same. */
export const DISK_LIMIT_MB = 1024;

/** A page call that failed because the page broke a rule (the kit's browser says bad_input). */
function pageError(error: unknown): { code: string; detail: string } | null {
  const shape = error as { code?: unknown; detail?: unknown; message?: unknown } | null;
  if (!shape || (shape.code !== 'bad_input' && shape.code !== 'tool_failed')) return null;
  return { code: shape.code, detail: String(shape.detail ?? shape.message ?? '') };
}

/** The video, refusing a step that skip_blank would leave empty. */
export async function makeVideo(rawInputs: unknown, ctx: MakerContext, options: MakerOptions = {}): Promise<MakerResult> {
  const made = await makeOrSkip(rawInputs, ctx, options);
  if (!made) throw ctx.error('bad_input', 'no scene has on-screen text or a line, and skip_blank makes nothing for that');
  return made;
}

/**
 * Page-embedded sound (kit.cue) over a source-linked video would change a soundtrack the timeline
 * declares, so it is refused. Cues the sound layer declares in the timeline (music, sfx) are
 * not page sound and pass: the page leaves the source sound as it is.
 */
export function pageSoundRefusal(pageCues: number, underAssembly: unknown): string | null {
  const segments = underAssembly && typeof underAssembly === 'object' ? (underAssembly as { segments?: unknown }).segments : undefined;
  const sourceLinked = Array.isArray(segments) && segments.length > 0;
  if (!pageCues || !sourceLinked) return null;
  return 'Page sound cues would change a source-linked soundtrack. Remove kit.cue from the page and add the sound through the sound layer, which declares its cues in the timeline; an old audio intent or review cannot certify this mix.';
}

/**
 * What the part runs: the video, or null when skip_blank is on and no scene
 * has on-screen text or a line (the step then gives no outputs, and the kit
 * leaves out every reference to them).
 */
export async function makeOrSkip(rawInputs: unknown, ctx: MakerContext, options: MakerOptions = {}): Promise<MakerResult | null> {
  // A video to draw over is measured first: its length is the video's length.
  const underRef = rawInputs && typeof rawInputs === 'object' ? (rawInputs as { under?: unknown }).under : undefined;
  let underInfo: UnderInfo | null | undefined;
  if (isFileRef(underRef) && underRef.media === 'video') underInfo = await probeUnder(ctx.tools, underRef.path);
  const spec = readInputs(rawInputs, ctx, { under: underInfo });
  if (spec.skip) {
    ctx.log.info('no scene has text; skip_blank makes nothing', { scenes: spec.scenes.length });
    return null;
  }
  if (!ctx.browser) throw ctx.error('needs_missing', 'the kit browser');
  const stopIfAsked = () => {
    if (ctx.signal.aborted) throw ctx.error('stopped');
  };
  stopIfAsked();

  // Working space is reserved before every write and given back when a file goes,
  // so the maker never puts more on disk than the part's limit.
  const limit = options.diskLimitBytes ?? DISK_LIMIT_MB * 1024 * 1024;
  let used = 0;
  const overLimit = () => ctx.error('bad_input', `the video needs more than ${Math.round(limit / (1024 * 1024))} MB of working space; make it shorter or simpler`);
  const reserve = (bytes: number) => {
    if (used + bytes > limit) throw overLimit();
    used += bytes;
  };
  const release = (bytes: number) => {
    used = Math.max(0, used - bytes);
  };
  /** Runs ffmpeg writing `file` with -fs set to the space left, then counts what it wrote. */
  const encodeInto = async (args: string[], file: string) => {
    const room = limit - used - FS_MARGIN;
    if (room <= 0) throw overLimit();
    // Encoders run one at a time, so this room is the whole of what is left.
    await ctx.tools.exec('ffmpeg', [...args.slice(0, -1), '-fs', String(room), args[args.length - 1]]);
    const size = (await stat(file)).size;
    if (size >= room) throw overLimit();
    reserve(size);
  };

  const pageDir = path.join(ctx.tmpDir, 'page');
  const framesDir = path.join(ctx.tmpDir, 'frames');
  const segmentsDir = path.join(ctx.tmpDir, 'segments');
  const scratch = [pageDir, framesDir, segmentsDir];
  const total = spec.frameCount;
  const frameHashes: string[] = [];
  let logo: LogoRect | null = null;
  let cues: Cue[] = [];
  const segments: string[] = [];
  const name = 'video.mp4';
  const out = path.join(ctx.workDir, name);
  let finished = false;
  try {
    for (const dir of scratch) {
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
    }
    if (spec.under) {
      const times = spec.scenes.map((scene) => ({ start_s: spec.sceneFrames[scene.index] / spec.fps, end_s: spec.sceneFrames[scene.index + 1] / spec.fps }));
      spec.under.quietBands = await quietBands(ctx.tools, spec.under.file.path, spec.under.info, times, framesDir, spec.output);
    }
    const built = await buildPage(spec, pageDir, ctx, reserve);

    const refusePage = (problems: string[]) => {
      throw ctx.error('bad_input', problems.slice(0, 3).join(' '));
    };
    const encodeSegment = async (start: number, count: number, frameBytes: number) => {
      // Over a video, the page's frames keep their alpha until the last pass lays them over it.
      const segment = path.join(segmentsDir, `seg-${String(segments.length + 1).padStart(5, '0')}.${spec.under ? 'mov' : 'mp4'}`);
      const args = spec.under
        ? alphaSegmentArgs({ framesDir, framePattern: FRAME_PATTERN, start, count, fps: spec.fps, out: segment })
        : segmentArgs({ tools: ctx.tools, framesDir, start, count, fps: spec.fps, out: segment });
      await encodeInto(args, segment);
      segments.push(segment);
      for (let i = start; i < start + count; i++) await rm(path.join(framesDir, frameName(i)), { force: true });
      release(frameBytes);
    };
    // A picture the page made from a data: or blob: URL must be still, like every other picture.
    const checked = (value: unknown) => {
      const report = reportOf(value);
      if (report.problems.length) refusePage(report.problems);
      for (const source of report.sources) {
        if (isAnimatedImage(Buffer.from(source.data, 'base64'))) {
          refusePage([`The picture ${source.url} moves on its own; frame pages take still pictures and draw any motion themselves.`]);
        }
      }
      return report;
    };
    const frameBound = pngBound(spec.output.width, spec.output.height);

    const browser = await ctx.browser.launch();
    try {
      const page: KitPage = await browser.newPage({ viewport: spec.design, deviceScaleFactor: spec.scale });
      await page.goto(pathToFileURL(built.entry).href);
      const started = await withTimeout(
        page.evaluate<unknown>('window.__kitDriver ? window.__kitDriver.start() : null'),
        FRAME_TIMEOUT_MS,
        // A page that runs out of time is slow on this computer, not a bad plan: the kit tries the step again.
        () => ctx.error('timeout', 'the frame page did not get ready within a minute'),
      );
      if (started === null) throw ctx.error('tool_failed', 'the frame page lost the kit runtime');
      checked(started);
      cues = cuesOf(started);
      const refused = pageSoundRefusal(cues.length, spec.under?.timeline.assembly_timeline);
      if (refused) throw ctx.error('bad_input', refused);

      let segmentStart = 0;
      let segmentBytes = 0;
      for (let index = 0; index < total; index++) {
        stopIfAsked();
        const drawn = checked(
          await withTimeout(
            page.evaluate<unknown>(`window.__kitDriver.frame(${index})`),
            FRAME_TIMEOUT_MS,
            () => ctx.error('timeout', `the frame page took more than a minute to draw frame ${index}`),
          ),
        );
        // The last frame that shows the logo gives its box: by then any entrance has settled.
        if (drawn.logo) logo = drawn.logo;
        const file = path.join(framesDir, frameName(index));
        // Room for the largest PNG this size can be, then only what it took.
        reserve(frameBound);
        await page.screenshot({ path: file, type: 'png', omitBackground: !!spec.under });
        const png = await readFile(file);
        release(frameBound - Math.min(frameBound, png.length));
        if (png.length > frameBound) reserve(png.length - frameBound);
        segmentBytes += png.length;
        if (index === 0) {
          const size = pngSize(png);
          if (!size || size.width !== spec.output.width || size.height !== spec.output.height) {
            throw ctx.error('tool_failed', `the browser drew ${size ? `${size.width}x${size.height}` : 'no picture'}, not ${spec.output.width}x${spec.output.height}`);
          }
        }
        frameHashes.push(createHash('sha256').update(png).digest('hex'));
        if (index + 1 - segmentStart === SEGMENT_FRAMES || index + 1 === total) {
          await encodeSegment(segmentStart, index + 1 - segmentStart, segmentBytes);
          segmentStart = index + 1;
          segmentBytes = 0;
        }
        if ((index + 1) % spec.fps === 0 || index + 1 === total) ctx.progress({ done: index + 1, total });
      }
      // Anything the page did after the last picture still counts: the record must be clean.
      checked(await page.evaluate<unknown>('window.__kitDriver.finish()'));
      await page.close();
    } catch (error) {
      if (ctx.signal.aborted) throw ctx.error('stopped');
      // The kit's browser refuses a page that broke a rule with a bad_input error; keep its words.
      const fromPage = pageError(error);
      if (fromPage) throw ctx.error(fromPage.code as 'bad_input' | 'tool_failed', fromPage.detail);
      throw error;
    } finally {
      await browser.close().catch(() => undefined);
    }

    stopIfAsked();
    const list = path.join(segmentsDir, 'segments.txt');
    const listText = concatList(segments);
    reserve(Buffer.byteLength(listText));
    await writeFile(list, listText);
    await mkdir(ctx.workDir, { recursive: true });
    const seconds = total / spec.fps;
    // With sound cues the picture is made first, then the cue mix is added to it as AAC in one more pass.
    const picture = cues.length ? path.join(segmentsDir, 'picture.mp4') : out;
    const underSound = !!spec.under?.info.hasAudio;
    if (spec.under) {
      const args = compositeArgs({
        tools: ctx.tools,
        under: spec.under.file.path,
        list,
        size: spec.output,
        fps: spec.fps,
        frames: total,
        // With cues, the video's sound is the bed of the cue mix instead.
        hasAudio: underSound && !cues.length,
        out: picture,
      });
      await encodeInto(args, picture);
    } else await encodeInto(concatArgs(list, picture), picture);

    if (cues.length) {
      stopIfAsked();
      const partDir = ctx.part?.dir;
      if (!partDir) throw ctx.error('tool_failed', "the part's sound bank is missing");
      const bank = new Map<CueSound, Float32Array>();
      for (const sound of new Set(cues.map((cue) => cue.sound))) {
        let pcm;
        try {
          pcm = readWav(await readFile(path.join(partDir, 'assets', 'sfx', `${sound}.wav`)));
        } catch {
          pcm = null;
        }
        if (!pcm || pcm.rate !== 48_000) throw ctx.error('tool_failed', `the part's sound "${sound}" could not be read`);
        bank.set(sound, bankSound(pcm));
      }
      let bed: Float32Array[] | null = null;
      if (spec.under && underSound) {
        const bedFile = path.join(segmentsDir, 'bed.wav');
        await encodeInto(bedArgs({ under: spec.under.file.path, seconds, out: bedFile }), bedFile);
        const pcm = readWav(await readFile(bedFile));
        if (!pcm) throw ctx.error('tool_failed', 'the sound of the video drawn over could not be read');
        bed = pcm.channels;
      }
      const mix = mixCues({ cues, bank, fps: spec.fps, frames: total, bed });
      const mixFile = path.join(segmentsDir, 'cues.wav');
      const bytes = wavBytes(mix.channels);
      reserve(bytes.length);
      await writeFile(mixFile, bytes);
      await encodeInto(muxArgs({ tools: ctx.tools, picture, audio: mixFile, seconds, out }), out);
      ctx.log.info('sound cues mixed', { cues: mix.placed.length, gain: mix.gain, sounds: CUE_SOUNDS.filter((s) => bank.has(s)) });
    }

    // The output check: the size the aspect asks for, the length the frames make, H.264 in yuv420p.
    const info = await ctx.tools.probe(out);
    const streams = await ctx.tools.exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,nb_frames', '-of', 'json', out]);
    const stream = (JSON.parse(streams.stdout) as { streams?: Array<{ pix_fmt?: string; nb_frames?: string }> }).streams?.[0];
    const wrong: string[] = [];
    if (!info.has_video || info.video_codec !== 'h264') wrong.push(`codec ${info.video_codec ?? 'none'}`);
    if (info.width !== spec.output.width || info.height !== spec.output.height) wrong.push(`size ${info.width}x${info.height}`);
    if (info.duration_s === undefined || Math.abs(info.duration_s - seconds) > 1.5 / spec.fps + 0.01) wrong.push(`length ${info.duration_s}s`);
    if (stream?.pix_fmt !== 'yuv420p') wrong.push(`pixels ${stream?.pix_fmt ?? 'unknown'}`);
    if (stream?.nb_frames !== undefined && Number(stream.nb_frames) !== total) wrong.push(`${stream.nb_frames} frames`);
    if (cues.length && !info.has_audio) wrong.push('no sound for its cues');
    if (underSound && !info.has_audio) wrong.push('retained source sound was lost');
    if (wrong.length) throw ctx.error('output_invalid', `the encoded video is wrong: ${wrong.join(', ')}`);

    const video = await ctx.file(name, 'video');
    ctx.log.info('assembly source clocks', {
      ...(spec.under ? { source_sha256: spec.under.file.sha256, source_in_ms: 0, source_out_ms: Math.round(seconds * 1000), picture_speed: 1, audio_speed: 1, native_audio: underSound ? 'preserve' : 'absent' } : {}),
      cues: cues.map((cue) => ({ sound: cue.sound, requested_s: cue.at_s, gain: cue.gain, max_s: cue.max_s })),
      content_review_status: 'incomplete',
    });
    ctx.log.info('frames rendered', { frames: total, seconds, width: spec.output.width, height: spec.output.height });
    finished = true;
    return {
      video, seconds, timeline: timelineOf(spec, logo), frameHashes,
      sourceFiles: spec.under ? [spec.under.file] : [],
      provenance: {
        renderer_version: 'html-frames@1.3.1', content_review_status: 'pending',
        ...(spec.under ? { source_sha256: spec.under.file.sha256, picture_speed: 1, audio_speed: 1, native_audio: underSound ? 'preserve' : 'absent' } : {}),
        audio_intent_status: spec.under?.timeline.assembly_timeline && !cues.length ? 'source_clocks_preserved' : 'requires_authored_timeline',
        page_sound_cues: cues.map((cue) => ({ sound: cue.sound, requested_s: cue.at_s, gain: cue.gain, max_s: cue.max_s })),
        exact_final_review: 'pending',
      },
    };
  } finally {
    // The maker's own scratch goes on every exit; a failed run leaves no half-made video either.
    for (const dir of scratch) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    if (!finished) await rm(out, { force: true }).catch(() => undefined);
  }
}
