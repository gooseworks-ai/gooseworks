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
import { SEGMENT_FRAMES, concatArgs, concatList, frameName, pngSize, segmentArgs } from './encode';
import { readInputs, type MakerSpec } from './inputs';
import { buildPage } from './page';

/** What the maker gives back; the part returns the first three. */
export interface MakerResult {
  video: FileRef;
  seconds: number;
  timeline: Timeline;
  /** sha256 of every captured frame, in order. */
  frameHashes: string[];
}

/** One frame may take this long before the maker gives up on the page. */
const FRAME_TIMEOUT_MS = 60_000;

type MakerContext = Pick<PartContext, 'workDir' | 'tmpDir' | 'tools' | 'browser' | 'progress' | 'log' | 'error' | 'signal' | 'file'>;

function timelineOf(spec: MakerSpec): Timeline {
  return {
    duration_s: spec.frameCount / spec.fps,
    width: spec.output.width,
    height: spec.output.height,
    fps: spec.fps,
    scenes: spec.scenes.map((scene) => ({
      id: scene.id,
      start_s: spec.sceneFrames[scene.index] / spec.fps,
      end_s: spec.sceneFrames[scene.index + 1] / spec.fps,
    })),
    speech: [],
  };
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

function problemsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
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

export async function makeVideo(rawInputs: unknown, ctx: MakerContext, options: MakerOptions = {}): Promise<MakerResult> {
  const spec = readInputs(rawInputs, ctx);
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
  const segments: string[] = [];
  const name = 'video.mp4';
  const out = path.join(ctx.workDir, name);
  let finished = false;
  try {
    for (const dir of scratch) {
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
    }
    const built = await buildPage(spec, pageDir, ctx, reserve);

    const refusePage = (problems: string[]) => {
      throw ctx.error('bad_input', problems.slice(0, 3).join(' '));
    };
    const encodeSegment = async (start: number, count: number, frameBytes: number) => {
      const segment = path.join(segmentsDir, `seg-${String(segments.length + 1).padStart(5, '0')}.mp4`);
      await encodeInto(segmentArgs({ tools: ctx.tools, framesDir, start, count, fps: spec.fps, out: segment }), segment);
      segments.push(segment);
      for (let i = start; i < start + count; i++) await rm(path.join(framesDir, frameName(i)), { force: true });
      release(frameBytes);
    };
    const checked = (value: unknown) => {
      const problems = problemsOf(value);
      if (problems.length) refusePage(problems);
    };
    const frameBound = pngBound(spec.output.width, spec.output.height);

    const browser = await ctx.browser.launch();
    try {
      const page: KitPage = await browser.newPage({ viewport: spec.design, deviceScaleFactor: spec.scale });
      await page.goto(pathToFileURL(built.entry).href);
      const started = await withTimeout(
        page.evaluate<unknown>('window.__kitDriver ? window.__kitDriver.start() : null'),
        FRAME_TIMEOUT_MS,
        () => ctx.error('bad_input', 'the frame page did not get ready within a minute'),
      );
      if (started === null) throw ctx.error('tool_failed', 'the frame page lost the kit runtime');
      checked(started);

      let segmentStart = 0;
      let segmentBytes = 0;
      for (let index = 0; index < total; index++) {
        stopIfAsked();
        checked(
          await withTimeout(
            page.evaluate<unknown>(`window.__kitDriver.frame(${index})`),
            FRAME_TIMEOUT_MS,
            () => ctx.error('bad_input', `the frame page took more than a minute to draw frame ${index}`),
          ),
        );
        const file = path.join(framesDir, frameName(index));
        // Room for the largest PNG this size can be, then only what it took.
        reserve(frameBound);
        await page.screenshot({ path: file, type: 'png' });
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
    await encodeInto(concatArgs(list, out), out);

    // The output check: the size the aspect asks for, the length the frames make, H.264 in yuv420p.
    const seconds = total / spec.fps;
    const info = await ctx.tools.probe(out);
    const streams = await ctx.tools.exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,nb_frames', '-of', 'json', out]);
    const stream = (JSON.parse(streams.stdout) as { streams?: Array<{ pix_fmt?: string; nb_frames?: string }> }).streams?.[0];
    const wrong: string[] = [];
    if (!info.has_video || info.video_codec !== 'h264') wrong.push(`codec ${info.video_codec ?? 'none'}`);
    if (info.width !== spec.output.width || info.height !== spec.output.height) wrong.push(`size ${info.width}x${info.height}`);
    if (info.duration_s === undefined || Math.abs(info.duration_s - seconds) > 1.5 / spec.fps + 0.01) wrong.push(`length ${info.duration_s}s`);
    if (stream?.pix_fmt !== 'yuv420p') wrong.push(`pixels ${stream?.pix_fmt ?? 'unknown'}`);
    if (stream?.nb_frames !== undefined && Number(stream.nb_frames) !== total) wrong.push(`${stream.nb_frames} frames`);
    if (wrong.length) throw ctx.error('output_invalid', `the encoded video is wrong: ${wrong.join(', ')}`);

    const video = await ctx.file(name, 'video');
    ctx.log.info('frames rendered', { frames: total, seconds, width: spec.output.width, height: spec.output.height });
    finished = true;
    return { video, seconds, timeline: timelineOf(spec), frameHashes };
  } finally {
    // The maker's own scratch goes on every exit; a failed run leaves no half-made video either.
    for (const dir of scratch) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    if (!finished) await rm(out, { force: true }).catch(() => undefined);
  }
}
