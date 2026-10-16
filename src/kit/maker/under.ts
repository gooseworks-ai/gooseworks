// Drawing a frame page over another step's video (html-frames 1.2.0 `under`).
// The page is captured transparent, its frames are kept with their alpha in
// short PNG-in-MOV segments, and one last ffmpeg pass lays them over the video,
// keeping its sound. Before the page runs, each scene's quiet band (the
// emptiest horizontal band of its middle frame) is measured here in Node, since
// a file:// page may not read a video's pixels. Bundled into the part.
import { readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import type { FileRef, KitTools, Timeline } from '../part-interface';
import { MASTER_RATE_CAP } from './encode';

/** What the maker measures of the video it draws over. */
export interface UnderInfo {
  /** Length of its picture, in seconds. */
  seconds: number;
  width: number;
  height: number;
  fps: number | null;
  hasAudio: boolean;
}

/** A band of rows, as fractions of the height (0 at the top). */
export interface QuietBand {
  y0: number;
  y1: number;
}

/** The band a quiet band is looked for in, and its height, as fractions of the height. */
export const QUIET_SAFE = { top: 0.15, bottom: 0.85, height: 0.15 } as const;

/** The size the middle frame is measured at: a few pixels a row is plenty for "busy or not". */
const MEASURE_WIDTH = 96;

function numberOf(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function rateOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const [a, b] = value.split('/').map(Number);
  const rate = b ? a / b : a;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Reads the video's picture length, size, frame rate and whether it has sound, with ffprobe. */
export async function probeUnder(tools: Pick<KitTools, 'exec'>, file: string): Promise<UnderInfo | null> {
  let parsed: { streams?: Array<Record<string, unknown>>; format?: { duration?: unknown } };
  try {
    const { stdout } = await tools.exec('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,width,height,duration,avg_frame_rate,r_frame_rate:format=duration',
      '-of', 'json', file,
    ]);
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  if (!video) return null;
  const width = numberOf(video.width);
  const height = numberOf(video.height);
  const seconds = numberOf(video.duration) ?? numberOf(parsed.format?.duration);
  if (!width || !height || !seconds || seconds <= 0) return null;
  return {
    seconds,
    width,
    height,
    fps: rateOf(video.avg_frame_rate) ?? rateOf(video.r_frame_rate),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** How the video is fitted to the page: scaled to cover it, then cropped to the middle. */
export interface CoverFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function coverFit(from: { width: number; height: number }, to: { width: number; height: number }): CoverFit {
  const scale = Math.max(to.width / from.width, to.height / from.height);
  return { scale, offsetX: (from.width * scale - to.width) / 2, offsetY: (from.height * scale - to.height) / 2 };
}

/** The ffmpeg filter that fits the video to the page: cover, centre crop, square pixels. */
export function coverFilter(size: { width: number; height: number }): string {
  return `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase:flags=bicubic,crop=${size.width}:${size.height},setsar=1`;
}

/**
 * The emptiest band of a grey picture: rows are scored by how much the picture
 * changes along and down them (the per-row gradient), and the band of
 * QUIET_SAFE.height whose rows change least, inside QUIET_SAFE, wins. Ties go
 * to the band nearer the bottom, where captions usually sit.
 */
export function quietBandOf(gray: Uint8Array, width: number, height: number): QuietBand {
  const rows = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const v = gray[row + x];
      if (x + 1 < width) sum += Math.abs(gray[row + x + 1] - v);
      if (y + 1 < height) sum += Math.abs(gray[row + width + x] - v);
    }
    rows[y] = sum / width;
  }
  const band = Math.max(1, Math.round(QUIET_SAFE.height * height));
  const first = Math.ceil(QUIET_SAFE.top * height);
  const last = Math.max(first, Math.floor(QUIET_SAFE.bottom * height) - band);
  let best = first;
  let bestScore = Infinity;
  for (let y0 = first; y0 <= last; y0++) {
    let score = 0;
    for (let y = y0; y < y0 + band && y < height; y++) score += rows[y];
    // A band must be clearly quieter to win over one further down.
    if (score <= bestScore + 1e-9) {
      best = y0;
      bestScore = score;
    }
  }
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return { y0: round(best / height), y1: round(Math.min(height, best + band) / height) };
}

/**
 * Each scene's quiet band, from the video's frame at the middle of the scene,
 * fitted to the page the way the last pass fits it (cover, centre crop), so the
 * band describes what shows. Frames are read one at a time as raw grey pixels into `dir`.
 */
export async function quietBands(
  tools: Pick<KitTools, 'exec'>,
  file: string,
  info: UnderInfo,
  times: Array<{ start_s: number; end_s: number }>,
  dir: string,
  page: { width: number; height: number },
): Promise<QuietBand[]> {
  const width = MEASURE_WIDTH;
  const height = Math.max(2, Math.round((page.height / page.width) * width));
  const bands: QuietBand[] = [];
  for (let i = 0; i < times.length; i++) {
    const middle = Math.min(Math.max(0, (times[i].start_s + times[i].end_s) / 2), Math.max(0, info.seconds - 0.05));
    const out = path.join(dir, `quiet-${i}.gray`);
    await tools.exec('ffmpeg', [
      '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
      '-ss', middle.toFixed(3), '-i', file,
      '-frames:v', '1', '-an',
      '-vf', `${coverFilter({ width, height })},format=gray`,
      '-f', 'rawvideo', '-pix_fmt', 'gray', out,
    ]);
    const gray = await readFile(out);
    await rm(out, { force: true });
    bands.push(gray.length >= width * height ? quietBandOf(gray, width, height) : { y0: 0.7, y1: 0.85 });
  }
  return bands;
}

/**
 * True when the plan's scenes share the video drawn over evenly: that video is
 * one scene (one clip, say) and the plan has several.
 */
export function underIsShared(ids: string[], timeline: Pick<Timeline, 'scenes'>): boolean {
  return timeline.scenes.length === 1 && ids.length > 1;
}

/**
 * Scene start frames from the timeline of the video drawn over. Each plan scene
 * takes the time of the timeline scene with its id; when ids do not match and
 * both list the same number of scenes, they pair in order. When that video is
 * one scene and the plan has several, the plan's scenes share it evenly on
 * whole frames, as they share a video of a given length. Returns null when the
 * scenes cannot be paired.
 */
export function underSceneFrames(
  ids: string[],
  timeline: Pick<Timeline, 'scenes'>,
  fps: number,
  frameCount: number,
): number[] | null {
  if (underIsShared(ids, timeline)) {
    if (frameCount < ids.length) return null;
    const shared = ids.map((_, i) => Math.round((i * frameCount) / ids.length));
    shared.push(frameCount);
    return shared;
  }
  const byId = new Map(timeline.scenes.map((s) => [s.id, s]));
  const matched = ids.map((id) => byId.get(id) ?? null);
  let spans: Array<{ start_s: number }>;
  if (matched.every((s) => s)) spans = matched as Array<{ start_s: number }>;
  else if (timeline.scenes.length === ids.length) spans = ids.map((id, i) => byId.get(id) ?? timeline.scenes[i]);
  else return null;
  const frames = spans.map((s) => Math.min(frameCount, Math.max(0, Math.round(s.start_s * fps))));
  for (let i = 1; i < frames.length; i++) if (frames[i] < frames[i - 1]) return null;
  frames.push(frameCount);
  return frames;
}

/** One segment of transparent page frames, kept with their alpha (PNG in MOV), to be laid over the video later. */
export function alphaSegmentArgs(opts: { framesDir: string; framePattern: string; start: number; count: number; fps: number; out: string }): string[] {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-framerate', String(opts.fps),
    '-start_number', String(opts.start),
    '-i', `${opts.framesDir}/${opts.framePattern}`,
    '-frames:v', String(opts.count),
    '-c:v', 'png', '-pix_fmt', 'rgba',
    '-fflags', '+bitexact', '-flags', '+bitexact', '-map_metadata', '-1',
    '-an', '-r', String(opts.fps),
    opts.out,
  ];
}

/**
 * The last pass: the video fitted to the page, the page's frames laid over it,
 * encoded like every html-frames video, with the video's sound kept as AAC.
 */
export function compositeArgs(opts: {
  tools: Pick<KitTools, 'encodeArgs'>;
  under: string;
  list: string;
  size: { width: number; height: number };
  fps: number;
  frames: number;
  hasAudio: boolean;
  out: string;
}): string[] {
  const seconds = (opts.frames / opts.fps).toFixed(6);
  const graph = [
    `[0:v]setpts=PTS-STARTPTS,fps=${opts.fps},${coverFilter(opts.size)}[base]`,
    `[1:v]setpts=PTS-STARTPTS,format=rgba[page]`,
    `[base][page]overlay=0:0:format=auto:eof_action=pass:shortest=0,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`,
  ].join(';');
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-i', opts.under,
    '-f', 'concat', '-safe', '0', '-i', opts.list,
    '-filter_complex', graph,
    '-map', '[v]',
    ...(opts.hasAudio ? ['-map', '0:a:0'] : []),
    '-frames:v', String(opts.frames),
    ...opts.tools.encodeArgs('h264-master'),
    ...MASTER_RATE_CAP,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...(opts.hasAudio ? [...opts.tools.encodeArgs('aac'), '-t', seconds] : ['-an']),
    '-r', String(opts.fps),
    opts.out,
  ];
}

/** A zone of the video drawn over, moved onto the page's picture (scaled to cover, cropped to the middle). */
function fitZone<Z extends { x: number; y: number; w: number; h: number }>(zone: Z, fit: CoverFit, size: { width: number; height: number }): Z | null {
  const x0 = Math.max(0, zone.x * fit.scale - fit.offsetX);
  const y0 = Math.max(0, zone.y * fit.scale - fit.offsetY);
  const x1 = Math.min(size.width, (zone.x + zone.w) * fit.scale - fit.offsetX);
  const y1 = Math.min(size.height, (zone.y + zone.h) * fit.scale - fit.offsetY);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { ...zone, x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

/** How far a source-linked video's length may move when drawn over: max(1 ms, one frame at the output fps), in seconds. */
export function linkedLengthTolerance(fps: number): number {
  return Math.max(0.001, Number.isFinite(fps) && fps > 0 ? 1 / fps : 0);
}

/**
 * The timeline of a video drawn over: the video's own scenes, speech, end card
 * and safe zones carried through (cut to the new length, zones moved to the
 * new picture), with this video's length, size and frame rate. When the plan's
 * scenes shared a one-scene video (`scenes` given), they are the scenes, and a
 * speech entry that names a scene names the one it starts in.
 */
export function passThroughTimeline(
  under: Timeline,
  out: { duration_s: number; width: number; height: number; fps: number },
  scenes?: Array<{ id: string; start_s: number; end_s: number }>,
): Timeline {
  const end = out.duration_s;
  // The encoder lands on whole output frames, so a source-linked length may move by up to one frame.
  if (under.assembly_timeline && Math.abs(end - under.duration_s) > linkedLengthTolerance(out.fps) + 1e-9) {
    throw new Error('Changing the source-linked picture length requires a revised assembly timeline; speech and source clocks cannot be silently clamped');
  }
  const cut = <T extends { start_s: number; end_s: number }>(items: T[]) =>
    items.filter((item) => item.start_s < end).map((item) => (item.end_s > end ? { ...item, end_s: end } : item));
  let speech = cut(under.speech);
  if (scenes?.length) {
    const sceneAt = (t: number) => scenes.find((s) => t < s.end_s) ?? scenes[scenes.length - 1];
    speech = speech.map((entry) => (typeof entry.scene_id === 'string' ? { ...entry, scene_id: sceneAt(entry.start_s).id } : entry));
  }
  const timeline: Timeline = {
    duration_s: out.duration_s,
    width: out.width,
    height: out.height,
    fps: out.fps,
    scenes: cut((scenes ?? under.scenes).map((s) => ({ id: s.id, start_s: s.start_s, end_s: s.end_s }))),
    speech,
    ...(under.assembly_timeline ? { assembly_timeline: under.assembly_timeline } : {}),
    // A new export needs its own exact-byte review even when its source clocks are unchanged.
  };
  if (under.end_card && under.end_card.start_s < end) timeline.end_card = { start_s: under.end_card.start_s, end_s: Math.min(end, under.end_card.end_s) };
  const fit = coverFit({ width: under.width, height: under.height }, out);
  const zones = (under.safe_zones ?? [])
    .map((z) => fitZone(z, fit, out))
    .filter((z): z is NonNullable<typeof z> => !!z)
    .slice(0, 8);
  if (zones.length) timeline.safe_zones = zones;
  return timeline;
}

/** The under video as the part takes it: the file and its timeline. */
export interface UnderSpec {
  file: FileRef;
  timeline: Timeline;
  info: UnderInfo;
  /** Each plan scene's quiet band, measured before the page is built (kit.under.quiet_band). */
  quietBands?: QuietBand[];
}
