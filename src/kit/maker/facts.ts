// Picture facts (html-frames 1.2.0 `facts: true`): how each picture the page
// gets should be presented, measured here in Node because a file:// page may
// not read a picture's pixels (its canvas is tainted). A port of the app's
// hyperframe imageFacts (video-lab/blocks/hyperframe/images.ts) and its
// product palette, plus the subject box the old product renderers centred on.
// The kit's ffmpeg decodes a small RGBA copy, turned by the EXIF orientation as
// the browser shows it; the sums below run on those bytes. Bundled into the part.
import { readFile, rm } from 'node:fs/promises';
import type { KitTools } from '../part-interface';
import type { PictureGeometry } from './images';

/** A box as fractions (0..1) of the picture as shown. */
export interface SubjectBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The x-centre of the subject's top half: centre a bottle on this, not on its shadow. */
  top_cx: number;
}

export interface PictureFacts {
  /** More than 4% of the picture is see-through: a cutout. */
  alpha: boolean;
  /** The colour of an even, opaque border (a studio backdrop), as #rrggbb; null for a photo or a cutout. */
  plate: string | null;
  /** The most common foreground colour (not the plate, near-white or near-black), as #rrggbb; null when there is none. */
  accent: string | null;
  /** Mean brightness of the opaque pixels, 0 (black) to 1 (white). */
  luminance: number;
  /** Size of the picture as the page loads it, in pixels. */
  width: number;
  height: number;
  /** Where the subject is, for a cutout or a picture on a plain backdrop; null for a photo. */
  subject: SubjectBox | null;
}

/** The measuring copy is this many pixels on each side (stretched to a square: boxes come out as fractions). */
export const FACTS_SIZE = 128;

/** Border width the plate is read from: 3 px of the app's 96, kept as a share. */
const BORDER = Math.max(1, Math.round((3 / 96) * FACTS_SIZE));

/** ffmpeg filters that turn stored pixels the way each EXIF orientation shows them (as page.ts stages them). */
const ORIENT: Record<number, string[]> = {
  1: [],
  2: ['hflip'],
  3: ['hflip', 'vflip'],
  4: ['vflip'],
  5: ['transpose=0'],
  6: ['transpose=1'],
  7: ['transpose=3'],
  8: ['transpose=2'],
};

function hex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * Facts from a square RGBA copy of the picture (`n` x `n`, as shown), and the
 * size the page loads it at. Pure, so it is tested on hand-made pixels.
 */
export function pictureFacts(rgba: Uint8Array, n: number, size: { width: number; height: number }): PictureFacts {
  const at = (x: number, y: number) => (y * n + x) * 4;
  let seeThrough = 0;
  let lumSum = 0;
  let lumCount = 0;
  const border: number[][] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = at(x, y);
      const a = rgba[i + 3];
      if (a < 200) seeThrough++;
      if (a >= 128) {
        lumSum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
        lumCount++;
      }
      if (x < BORDER || y < BORDER || x >= n - BORDER || y >= n - BORDER) border.push([rgba[i], rgba[i + 1], rgba[i + 2], a]);
    }
  }
  const alpha = seeThrough / (n * n) > 0.04;
  const opaque = border.filter((p) => p[3] >= 200);
  const avg = [0, 1, 2].map((k) => opaque.reduce((s, p) => s + p[k], 0) / Math.max(1, opaque.length));
  const spread = Math.max(...[0, 1, 2].map((k) => Math.sqrt(opaque.reduce((s, p) => s + (p[k] - avg[k]) ** 2, 0) / Math.max(1, opaque.length))));
  const even = !alpha && opaque.length > border.length * 0.9 && spread < 14;
  const plate = even ? hex(avg[0], avg[1], avg[2]) : null;

  // Foreground: opaque, away from the plate, not a white highlight or black.
  const near = (i: number) => even && Math.abs(rgba[i] - avg[0]) + Math.abs(rgba[i + 1] - avg[1]) + Math.abs(rgba[i + 2] - avg[2]) < 40;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
    if (a < 200 || near(i)) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if ((max > 238 && min > 225) || max < 22) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  // Ties go to the lower bucket key, so the answer never depends on the order pixels were seen in.
  const top = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0])[0]?.[1];
  const accent = top && top.n >= n * n * 0.005 ? hex(top.r / top.n, top.g / top.n, top.b / top.n) : null;

  return {
    alpha,
    plate,
    accent,
    luminance: round(lumCount ? lumSum / lumCount / 255 : 0, 3),
    width: size.width,
    height: size.height,
    subject: alpha || even ? subjectOf(rgba, n, alpha ? (i) => rgba[i + 3] >= 128 : (i) => rgba[i + 3] >= 128 && !near(i)) : null,
  };
}

/** The box of the subject's pixels; a lone pixel (JPEG noise on a backdrop) does not count. */
function subjectOf(rgba: Uint8Array, n: number, inSubject: (i: number) => boolean): SubjectBox | null {
  const mask = new Uint8Array(n * n);
  for (let p = 0; p < n * n; p++) mask[p] = inSubject(p * 4) ? 1 : 0;
  const kept = (x: number, y: number) => {
    const p = y * n + x;
    if (!mask[p]) return false;
    return (x > 0 && mask[p - 1] === 1) || (x < n - 1 && mask[p + 1] === 1) || (y > 0 && mask[p - n] === 1) || (y < n - 1 && mask[p + n] === 1);
  };
  let [x0, y0, x1, y1] = [n, n, -1, -1];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!kept(x, y)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  // The top half of the subject's rows: its own left and right edges give the centre.
  const half = y0 + Math.max(1, Math.ceil((y1 - y0 + 1) / 2));
  let [tx0, tx1] = [n, -1];
  for (let y = y0; y < half; y++) {
    for (let x = 0; x < n; x++) {
      if (!kept(x, y)) continue;
      tx0 = Math.min(tx0, x);
      tx1 = Math.max(tx1, x);
    }
  }
  return {
    x: round(x0 / n),
    y: round(y0 / n),
    w: round((x1 + 1 - x0) / n),
    h: round((y1 + 1 - y0) / n),
    top_cx: round(tx1 < 0 ? (x0 + x1 + 1) / 2 / n : (tx0 + tx1 + 1) / 2 / n),
  };
}

/**
 * Measures one picture from its checked bytes with the kit's ffmpeg. `scratch`
 * is a file path the RGBA copy is written to and removed from. Returns null
 * when ffmpeg cannot read it; the page then has no facts for that picture.
 */
export async function measurePicture(
  tools: Pick<KitTools, 'exec'>,
  data: Uint8Array,
  shape: PictureGeometry,
  size: { width: number; height: number },
  scratch: string,
): Promise<PictureFacts | null> {
  const filters = [...ORIENT[shape.orientation], 'format=rgba', `scale=${FACTS_SIZE}:${FACTS_SIZE}:flags=area`, 'setsar=1', 'format=rgba'];
  try {
    await tools.exec(
      'ffmpeg',
      ['-hide_banner', '-y', '-loglevel', 'error', '-noautorotate', '-f', `${shape.format}_pipe`, '-i', 'pipe:0', '-frames:v', '1', '-vf', filters.join(','), '-f', 'rawvideo', '-pix_fmt', 'rgba', '-threads', '1', scratch],
      { stdin: data },
    );
    const rgba = await readFile(scratch);
    if (rgba.length !== FACTS_SIZE * FACTS_SIZE * 4) return null;
    return pictureFacts(rgba, FACTS_SIZE, size);
  } catch {
    return null;
  } finally {
    await rm(scratch, { force: true }).catch(() => undefined);
  }
}
