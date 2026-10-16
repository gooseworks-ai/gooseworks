/**
 * The frame contact sheet written next to the final, and the product-presence warning,
 * which compares the product photos' colours with the sampled frames and only ever warns.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inflateSync } from 'zlib';
import { audioReviewWindows, bestCover, encodePng, lookAtFinal, presenceWarning, productColours, sheetTimes, SHEET_FRAMES, tileLabel } from '../../src/kit/core/eyes';

const timeline = {
  duration_s: 14,
  width: 1080,
  height: 1920,
  scenes: [
    { id: 'hook', start_s: 0, end_s: 4 },
    { id: 'demo', start_s: 4, end_s: 12 },
  ],
  end_card: { start_s: 12, end_s: 14 },
};

/** A picture of one colour, with a square of another in it. */
function picture(width: number, height: number, fill: number[], square?: { colour: number[]; side: number }): Buffer {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inside = square && x >= (width - square.side) / 2 && x < (width + square.side) / 2 && y >= (height - square.side) / 2 && y < (height + square.side) / 2;
      data.set(inside ? square!.colour : fill, (y * width + x) * 3);
    }
  return data;
}

/** A product photo: a red tin on white, no transparency. */
function photo(): Buffer {
  const rgb = picture(64, 64, [255, 255, 255], { colour: [200, 30, 40], side: 32 });
  const rgba = Buffer.alloc(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) rgba.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  return rgba;
}

it('takes 12 frames across the video before the end card, each with its scene, then the end card', () => {
  const tiles = sheetTimes(timeline);
  expect(tiles).toHaveLength(SHEET_FRAMES + 1);
  expect(tiles[0]).toEqual({ tile: 1, at_s: 0.5, scene_id: 'hook', scene: 1 });
  expect(tiles[SHEET_FRAMES - 1]).toMatchObject({ scene_id: 'demo', scene: 2 });
  expect(tiles.slice(0, SHEET_FRAMES).every((t) => t.at_s < 12)).toBe(true);
  expect(tiles[SHEET_FRAMES]).toEqual({ tile: 13, at_s: 13, end_card: true });
  expect(tileLabel(tiles[0])).toBe('S1 0.5');
  expect(tileLabel(tiles[SHEET_FRAMES])).toBe('END');
});

it('writes a PNG that decodes to the sheet’s pixels', () => {
  const data = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]);
  const png = encodePng({ width: 2, height: 2, data });
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(2);
  const idat = png.indexOf('IDAT');
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  expect([...raw]).toEqual([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 9, 9, 9]);
});

it('finds the product in a frame that shows it, and warns only when no frame does', () => {
  const tin = productColours({ width: 64, height: 64, data: photo() })!;
  const shown = { width: 180, height: 320, data: picture(180, 320, [40, 90, 200], { colour: [205, 28, 38], side: 70 }) };
  const missing = { width: 180, height: 320, data: picture(180, 320, [40, 90, 200], { colour: [30, 160, 60], side: 70 }) };
  expect(bestCover(tin, [shown])).toBeGreaterThan(0.9);
  expect(bestCover(tin, [missing])).toBeLessThan(0.1);
  expect(presenceWarning('Tin', [tin], [missing, shown])).toBeNull();
  expect(presenceWarning('Tin', [tin], [missing])).toMatchObject({ check: 'product_visible', message: '“Tin” may not show clearly in the video: none of the frames we looked at matches its photos.' });
  // Nothing to compare is no warning.
  expect(presenceWarning('Tin', [], [missing])).toBeNull();
});

it('writes the sheet and eyes.json next to the final, leaving out frames it could not read', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyes-'));
  try {
    const final = path.join(dir, 'final.mp4');
    let grabs = 0;
    const eyes = await lookAtFinal({
      ffmpeg: 'unused',
      final,
      timeline,
      products: [{ name: 'Tin', photos: ['/photos/tin.png'] }],
      signal: new AbortController().signal,
      custom: true,
      grab: async (file, _args, bytes) => {
        if (file === '/photos/tin.png') return photo();
        if (grabs++ === 3) throw new Error('unreadable');
        return picture(180, 320, [40, 90, 200]).subarray(0, bytes);
      },
    });
    expect(eyes.contact_sheet).toBe(path.join(dir, 'contact-sheet.png'));
    expect(fs.readFileSync(eyes.contact_sheet!).subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(eyes.tiles).toHaveLength(13);
    expect(eyes.warnings.map((w) => w.check)).toEqual(['product_visible', 'review_coverage', 'review_audio']);
    expect(eyes.coverage).toEqual({ complete: false, missing_scenes: [], unreadable_tiles: [4] });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'eyes.json'), 'utf8'))).toMatchObject({ contact_sheet: eyes.contact_sheet, warnings: [{ check: 'product_visible' }, { check: 'review_coverage' }, { check: 'review_audio' }], audio: { required: true, final_mix: null }, content_review_status: 'incomplete', review_capability: { audio_perception: false, motion_perception: false } });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('includes a frame from each of 18 scenes, even when uniform samples miss short product shots', () => {
  const scenes = Array.from({ length: 18 }, (_, i) => ({ id: `s${i + 1}`, start_s: i, end_s: i + 1 }));
  const tiles = sheetTimes({ duration_s: 20, scenes, end_card: { start_s: 18, end_s: 20 } });
  expect(new Set(tiles.filter((tile) => !tile.end_card).map((tile) => tile.scene_id))).toEqual(new Set(scenes.map((scene) => scene.id)));
  expect(tiles.every((tile, i) => tile.tile === i + 1)).toBe(true);
  expect(tiles.at(-1)).toMatchObject({ end_card: true, at_s: 19 });
});

it('marks the cut at 9 seconds and the unrecognised speech window from 8.4 to 10.2 for listening', () => {
  const windows = audioReviewWindows({
    duration_s: 12,
    scenes: [{ id: 'face', start_s: 0, end_s: 9 }, { id: 'product', start_s: 9, end_s: 12 }],
    speech: [{ text: 'cleans it', start_s: 8, end_s: 10.5, words: [{ text: 'cleans', start_s: 8, end_s: 8.4 }, { text: 'it', start_s: 10.2, end_s: 10.5 }] }],
  });
  expect(windows).toContainEqual({ start_s: 7.75, end_s: 10.25, reason: 'cut' });
  expect(windows).toContainEqual({ start_s: 7.9, end_s: 10.7, reason: 'word_gap' });
  expect(windows.every((window) => window.start_s >= 0 && window.end_s <= 12)).toBe(true);
});

it('never asks for an audio review of a silent template video', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyes-'));
  try {
    // A template with no planned speech: no audio is required, extracted or warned about.
    const eyes = await lookAtFinal({ ffmpeg: '/no/ffmpeg', final: path.join(dir, 'final.mp4'), timeline, products: [], signal: new AbortController().signal, grab: async (_file, _args, bytes) => picture(180, 320, [40, 90, 200]).subarray(0, bytes) });
    expect(eyes.warnings.map((w) => w.check)).toEqual([]);
    expect(eyes.audio).toMatchObject({ required: false, final_mix: null, windows: [] });
    // The same silent final made as a custom video still needs its sound reviewed.
    const custom = await lookAtFinal({ ffmpeg: '/no/ffmpeg', final: path.join(dir, 'final.mp4'), timeline, products: [], signal: new AbortController().signal, custom: true, grab: async (_file, _args, bytes) => picture(180, 320, [40, 90, 200]).subarray(0, bytes) });
    expect(custom.warnings.map((w) => w.check)).toEqual(['review_audio']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('writes no sheet when no frame could be read', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyes-'));
  try {
    const eyes = await lookAtFinal({ ffmpeg: 'unused', final: path.join(dir, 'final.mp4'), timeline, products: [], signal: new AbortController().signal, grab: async () => Promise.reject(new Error('no')) });
    expect(eyes.contact_sheet).toBeNull();
    expect(fs.existsSync(path.join(dir, 'contact-sheet.png'))).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
