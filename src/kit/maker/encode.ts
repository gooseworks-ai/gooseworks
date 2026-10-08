// ffmpeg arguments for the maker. Frames are encoded in short segments (so a
// long video never keeps thousands of full-size PNGs on disk) and the
// segments are joined without re-encoding. Bundled into the part.
import type { KitTools } from '../part-interface';

/** Frames per segment: about 2 seconds at 30 fps. */
export const SEGMENT_FRAMES = 60;

export const FRAME_PATTERN = 'f%06d.png';

export function frameName(index: number): string {
  return `f${String(index).padStart(6, '0')}.png`;
}

/**
 * One segment of frames to H.264. The kit's encoder settings come first (they
 * pin everything that changes the bytes); the maker then fixes what it needs:
 * libx264, yuv420p and BT.709 colour, so the screen's sRGB looks right in players.
 */
export function segmentArgs(opts: {
  tools: Pick<KitTools, 'encodeArgs'>;
  framesDir: string;
  start: number;
  count: number;
  fps: number;
  out: string;
}): string[] {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-framerate', String(opts.fps),
    '-start_number', String(opts.start),
    '-i', `${opts.framesDir}/${FRAME_PATTERN}`,
    '-frames:v', String(opts.count),
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    ...opts.tools.encodeArgs('h264-master'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-an',
    '-r', String(opts.fps),
    opts.out,
  ];
}

/** The concat list for ffmpeg's concat demuxer. */
export function concatList(segments: string[]): string {
  return segments.map((file) => `file '${file.replace(/'/g, `'\\''`)}'\n`).join('');
}

export function concatArgs(listFile: string, out: string): string[] {
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c', 'copy',
    '-movflags', '+faststart',
    '-fflags', '+bitexact', '-map_metadata', '-1',
    out,
  ];
}

/** Width and height from a PNG's header. */
export function pngSize(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
