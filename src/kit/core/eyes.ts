// What an agent with eyes looks at before it says a video is ready, and the one content warning a
// machine can give without a vision model:
//   final/contact-sheet.png   about 12 frames across the video and its end card, each labelled by scene
//   final/eyes.json           which scene and second each tile is, the sheet's path and the warnings
// The product-presence warning compares the frozen product photos with the sampled frames by colour
// alone, so it only ever warns: a product whose colours are nowhere in the video may not show.
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import * as path from 'path';
import { deflateSync } from 'zlib';
import type { Timeline } from '../part-interface';
import type { CheckReason } from '../line/types';
import { childEnv } from './toolchain';

/** Frames across the video, before the end card. */
export const SHEET_FRAMES = 12;
const COLUMNS = 4;
/** Each tile's long side, in pixels. */
const TILE_LONG = 320;
/** The label strip under each tile. */
const LABEL_H = 20;
const GAP = 4;
/** One frame grab may take this long. */
const GRAB_MS = 20_000;
/** At most this many product photos are compared. */
const MAX_PHOTOS = 4;
/** A product photo's colours must cover this much of some patch of a frame for the product to count as seen. */
export const PRESENCE_MIN = 0.5;

/** What an agent looks for on the sheet before it says the video is ready. */
export const LOOK_FOR = [
  'The product shows, facing the camera, where the plan puts it.',
  'Every word on screen is readable on a phone.',
  'No other brand’s name or logo shows.',
  'No spoken or written word is cut off.',
];

export interface SheetTile {
  /** 1-based, left to right, top to bottom. */
  tile: number;
  at_s: number;
  /** The scene the frame is in, by the timeline's id, and its place in the video (1-based). */
  scene_id?: string;
  scene?: number;
  end_card?: true;
}

export interface Eyes {
  contact_sheet: string | null;
  tiles: SheetTile[];
  warnings: CheckReason[];
  look_for: string[];
}

export interface Product {
  name?: string;
  photos: string[];
}

interface Rgb {
  width: number;
  height: number;
  data: Buffer;
}

type Grab = (file: string, args: string[], bytes: number, signal: AbortSignal) => Promise<Buffer>;

/** One raw picture from ffmpeg's stdout, exactly `bytes` long. */
const grabWith =
  (ffmpeg: string): Grab =>
  (file, args, bytes, signal) =>
    new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, ['-v', 'error', ...args.slice(0, args.indexOf('-i')), '-i', file, ...args.slice(args.indexOf('-i') + 1), '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        env: childEnv(),
        signal,
      });
      const chunks: Buffer[] = [];
      let got = 0;
      const timer = setTimeout(() => child.kill('SIGKILL'), GRAB_MS);
      child.stdout.on('data', (chunk: Buffer) => {
        got += chunk.length;
        if (got <= bytes) chunks.push(chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const data = Buffer.concat(chunks);
        if (code === 0 && data.length === bytes) resolve(data);
        else reject(new Error(`no frame from ${path.basename(file)}`));
      });
    });

/** The tile size for a picture of this shape: the long side TILE_LONG, both sides even. */
export function tileSize(width: number, height: number): { width: number; height: number } {
  const scale = TILE_LONG / Math.max(width, height, 1);
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Where the frames are taken: evenly across the video before its end card, then the end card's middle. */
export function sheetTimes(timeline: Pick<Timeline, 'duration_s' | 'scenes' | 'end_card'>): SheetTile[] {
  const card = timeline.end_card && timeline.end_card.end_s > timeline.end_card.start_s ? timeline.end_card : null;
  const bodyEnd = Math.max(card ? card.start_s : timeline.duration_s, 0.1);
  const scenes = [...(timeline.scenes ?? [])].sort((a, b) => a.start_s - b.start_s);
  const tiles: SheetTile[] = [];
  for (let i = 0; i < SHEET_FRAMES; i++) {
    const at = +((bodyEnd * (i + 0.5)) / SHEET_FRAMES).toFixed(2);
    const index = scenes.findIndex((scene) => at >= scene.start_s && at < scene.end_s);
    tiles.push({ tile: i + 1, at_s: at, ...(index >= 0 ? { scene_id: scenes[index].id, scene: index + 1 } : {}) });
  }
  if (card) tiles.push({ tile: SHEET_FRAMES + 1, at_s: +((card.start_s + card.end_s) / 2).toFixed(2), end_card: true });
  return tiles;
}

/** A tile's label: its scene and second, or END for the end card. */
export function tileLabel(tile: SheetTile): string {
  if (tile.end_card) return 'END';
  return `${tile.scene ? `S${tile.scene} ` : ''}${tile.at_s.toFixed(1)}`;
}

// A 5 by 7 font for the labels: each row of a glyph is 5 bits, the left pixel first.
const FONT: Record<string, number[]> = {
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  S: [15, 16, 16, 14, 1, 1, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  N: [17, 25, 21, 19, 17, 17, 17],
  D: [30, 17, 17, 17, 17, 17, 30],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(sheet: Rgb, text: string, x0: number, y0: number, scale = 2): void {
  let x = x0;
  for (const char of text) {
    const rows = FONT[char] ?? FONT[' '];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++) {
        if (!(rows[row] & (16 >> col))) continue;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const px = x + col * scale + dx;
            const py = y0 + row * scale + dy;
            if (px < sheet.width && py < sheet.height) sheet.data.fill(255, (py * sheet.width + px) * 3, (py * sheet.width + px) * 3 + 3);
          }
      }
    x += 6 * scale;
  }
}

/** The tiles in a grid on a dark sheet, each with its label underneath. */
export function composeSheet(frames: Array<{ tile: SheetTile; frame: Rgb | null }>, tile: { width: number; height: number }): Rgb {
  const rows = Math.ceil(frames.length / COLUMNS);
  const cols = Math.min(frames.length, COLUMNS);
  const width = cols * tile.width + (cols + 1) * GAP;
  const height = rows * (tile.height + LABEL_H) + (rows + 1) * GAP;
  const sheet: Rgb = { width, height, data: Buffer.alloc(width * height * 3, 24) };
  frames.forEach(({ tile: info, frame }, i) => {
    const x0 = GAP + (i % COLUMNS) * (tile.width + GAP);
    const y0 = GAP + Math.floor(i / COLUMNS) * (tile.height + LABEL_H + GAP);
    if (frame)
      for (let y = 0; y < tile.height; y++) frame.data.copy(sheet.data, ((y0 + y) * width + x0) * 3, y * tile.width * 3, (y + 1) * tile.width * 3);
    drawText(sheet, frame ? tileLabel(info) : `${tileLabel(info)} .`, x0 + 4, y0 + tile.height + 3);
  });
  return sheet;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** An RGB picture as a PNG file's bytes. */
export function encodePng(picture: Rgb): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(picture.width, 0);
  header.writeUInt32BE(picture.height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const stride = picture.width * 3;
  const raw = Buffer.alloc((stride + 1) * picture.height);
  for (let y = 0; y < picture.height; y++) picture.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Colour bins: 4 for greys (by brightness), then 12 hues by 2 saturations by 2 brightnesses.
const BINS = 4 + 12 * 2 * 2;

function binOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (s < 0.2 || v < 0.15) return Math.min(Math.floor(v * 4), 3);
  let h = 0;
  if (max === r) h = ((g - b) / (max - min) + 6) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  return 4 + Math.min(Math.floor(h * 2), 11) * 4 + (s < 0.55 ? 0 : 2) + (v < 0.6 ? 0 : 1);
}

/** The product's colour mix: its opaque pixels, or those unlike its border when the photo has no transparency. */
export function productColours(photo: { width: number; height: number; data: Buffer }): Float64Array | null {
  const { width, height, data } = photo;
  const count = width * height;
  let clear = 0;
  for (let i = 0; i < count; i++) if (data[i * 4 + 3] < 128) clear++;
  const cutout = clear >= count * 0.05;
  // Without transparency, the background is the border's typical colour.
  const border: number[][] = [];
  for (let x = 0; x < width; x++) border.push([0, x], [height - 1, x]);
  for (let y = 0; y < height; y++) border.push([y, 0], [y, width - 1]);
  const median = (channel: number) => {
    const values = border.map(([y, x]) => data[(y * width + x) * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  const bg = [median(0), median(1), median(2)];
  const keep = (i: number) => {
    if (cutout) return data[i * 4 + 3] >= 128;
    const d = Math.abs(data[i * 4] - bg[0]) + Math.abs(data[i * 4 + 1] - bg[1]) + Math.abs(data[i * 4 + 2] - bg[2]);
    return d > 60;
  };
  const hist = new Float64Array(BINS);
  let kept = 0;
  for (let i = 0; i < count; i++)
    if (keep(i)) {
      hist[binOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])]++;
      kept++;
    }
  if (kept < count * 0.05) return null;
  for (let b = 0; b < BINS; b++) hist[b] /= kept;
  return hist;
}

/**
 * How much of the best-matching patch of any frame the product's colours cover (0 to 1): square patches of
 * a quarter, two fifths and seven tenths of the frame's short side, moved half a patch at a time.
 */
export function bestCover(product: Float64Array, frames: Rgb[]): number {
  let best = 0;
  for (const frame of frames) {
    const { width, height, data } = frame;
    const bins = new Uint8Array(width * height);
    for (let i = 0; i < bins.length; i++) bins[i] = binOf(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    for (const share of [0.25, 0.4, 0.7]) {
      const side = Math.max(Math.round(Math.min(width, height) * share), 4);
      const step = Math.max(Math.floor(side / 2), 1);
      const counts = new Float64Array(BINS);
      for (let y0 = 0; y0 + side <= height; y0 += step)
        for (let x0 = 0; x0 + side <= width; x0 += step) {
          counts.fill(0);
          for (let y = y0; y < y0 + side; y++) for (let x = x0; x < x0 + side; x++) counts[bins[y * width + x]]++;
          let cover = 0;
          for (let b = 0; b < BINS; b++) cover += Math.min(product[b], counts[b] / (side * side));
          if (cover > best) best = cover;
        }
    }
  }
  return best;
}

/** The warning for a product none of whose photos' colours show in the video; null when one does or none can be read. */
export function presenceWarning(name: string | undefined, photos: Float64Array[], frames: Rgb[]): CheckReason | null {
  if (!photos.length || !frames.length) return null;
  const cover = Math.max(...photos.map((photo) => bestCover(photo, frames)));
  if (cover >= PRESENCE_MIN) return null;
  const who = name?.trim() ? `“${name.trim().slice(0, 60)}”` : 'The product';
  return {
    check: 'product_visible',
    message: `${who} may not show clearly in the video: none of the frames we looked at matches its photos.`,
    expected: `a frame patch matching the photos at ${PRESENCE_MIN}`,
    found: cover.toFixed(2),
  };
}

/**
 * Writes the contact sheet and eyes.json next to the final, and gives back the product-presence warnings.
 * A frame or photo that can't be read is left out; nothing here stops the video.
 */
export async function lookAtFinal(opts: {
  ffmpeg: string;
  final: string;
  timeline: Pick<Timeline, 'duration_s' | 'width' | 'height' | 'scenes' | 'end_card'>;
  products: Product[];
  signal: AbortSignal;
  /** Replaces ffmpeg, for tests. */
  grab?: Grab;
}): Promise<Eyes> {
  const grab = opts.grab ?? grabWith(opts.ffmpeg);
  const dir = path.dirname(opts.final);
  const size = tileSize(opts.timeline.width, opts.timeline.height);
  const tiles = sheetTimes(opts.timeline);
  const frames: Array<{ tile: SheetTile; frame: Rgb | null }> = [];
  for (const tile of tiles) {
    const data = await grab(opts.final, ['-ss', String(tile.at_s), '-i', '-vf', `scale=${size.width}:${size.height}:flags=area,format=rgb24`], size.width * size.height * 3, opts.signal).catch(() => null);
    frames.push({ tile, frame: data ? { ...size, data } : null });
  }
  const seen = frames.filter((f) => f.frame && !f.tile.end_card).map((f) => f.frame!) as Rgb[];
  let sheet: string | null = null;
  if (frames.some((f) => f.frame)) {
    sheet = path.join(dir, 'contact-sheet.png');
    await writeFile(sheet, encodePng(composeSheet(frames, size)), { mode: 0o600 });
  }
  const warnings: CheckReason[] = [];
  let photosLeft = MAX_PHOTOS;
  for (const product of opts.products) {
    const colours: Float64Array[] = [];
    for (const photo of product.photos) {
      if (photosLeft <= 0) break;
      photosLeft--;
      const data = await grab(photo, ['-i', '-vf', 'scale=64:64:flags=area,format=rgba'], 64 * 64 * 4, opts.signal).catch(() => null);
      const hist = data ? productColours({ width: 64, height: 64, data }) : null;
      if (hist) colours.push(hist);
    }
    const warning = presenceWarning(product.name, colours, seen);
    if (warning) warnings.push(warning);
  }
  const eyes: Eyes = { contact_sheet: sheet, tiles, warnings, look_for: LOOK_FOR };
  await writeFile(path.join(dir, 'eyes.json'), JSON.stringify(eyes, null, 2) + '\n', { mode: 0o600 });
  return eyes;
}
