// html-frames 1.1.0: the box the page drew the brand's logo in, as the
// timeline's logo safe zone.
import { mkdtempSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeVideo } from '../../../src/kit/maker/make';
import { FIXTURES, describeMedia, fileRef, partContext, runFfmpeg } from './helpers';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'c2-frames11-'));

/** A still from ffmpeg's lavfi graph, written to `file`. */
function still(file: string, graph: string, extra: string[] = []): string {
  runFfmpeg(['-y', '-filter_complex', graph, '-frames:v', '1', ...extra, file]);
  return file;
}

describeMedia("the logo's box on the timeline", () => {
  let src: string;
  let logo: string;

  beforeAll(() => {
    src = temp();
    logo = still(path.join(src, 'logo.png'), 'color=c=red:s=400x100');
  });
  afterAll(() => rmSync(src, { recursive: true, force: true }));

  const DESIGN: Record<string, { width: number; height: number }> = { '9:16': { width: 1080, height: 1920 }, '16:9': { width: 1920, height: 1080 } };

  /** A box in the page's CSS pixels, as the maker puts it on the output picture. */
  function onOutput(box: { x: number; y: number; w: number; h: number }, aspect: string, shortSide: number) {
    const k = shortSide / 1080;
    const x0 = Math.floor(box.x * k);
    const y0 = Math.floor(box.y * k);
    return { use: 'logo', x: x0, y: y0, w: Math.ceil((box.x + box.w) * k) - x0, h: Math.ceil((box.y + box.h) * k) - y0 };
  }

  async function zonesFor(layout: string, aspect: string, shortSide: number) {
    const root = temp();
    try {
      const made = await makeVideo(
        {
          template: fileRef(path.join(FIXTURES, 'rules', 'logo.html')),
          scenes: [{ id: 'a', on_screen: 'x' }],
          brand: { name: 'Brand', logo: fileRef(logo) },
          values: { layout },
          aspect,
          max_words: 8,
          duration_s: 0.5,
          fps: 4,
          short_side: shortSide,
        },
        partContext(root).ctx,
      );
      return made.timeline.safe_zones;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const sizes: Array<[string, number]> = [
    ['9:16', 1080],
    ['9:16', 720],
    ['16:9', 1080],
    ['16:9', 720],
  ];

  it.each(sizes)('puts a plain logo where it is drawn, in the video pixels of %s at %d', async (aspect, shortSide) => {
    const { width, height } = DESIGN[aspect];
    const box = { x: width - 120 - 300, y: height - 300 - 75, w: 300, h: 75 };
    expect(await zonesFor('plain', aspect, shortSide)).toEqual([onOutput(box, aspect, shortSide)]);
  }, 60_000);

  it.each([
    ['9:16', 1080],
    ['16:9', 720],
  ] as Array<[string, number]>)('reports only the part of an object-fit: cover logo its icon shows (%s at %d)', async (aspect, shortSide) => {
    expect(await zonesFor('cover', aspect, shortSide)).toEqual([onOutput({ x: 584, y: 150, w: 180, h: 180 }, aspect, shortSide)]);
  }, 60_000);

  it("cuts the logo by an ancestor's overflow, inside its border", async () => {
    expect(await zonesFor('clipped', '9:16', 1080)).toEqual([onOutput({ x: 65, y: 65, w: 210, h: 100 }, '9:16', 1080)]);
  }, 60_000);

  it("places an object-fit: contain logo inside the image's own padding and border", async () => {
    expect(await zonesFor('padded', '9:16', 1080)).toEqual([onOutput({ x: 330, y: 705, w: 200, h: 50 }, '9:16', 1080)]);
  }, 60_000);

  it('does not cut an absolutely placed logo by a clipping ancestor outside its containing block', async () => {
    expect(await zonesFor('escape', '9:16', 1080)).toEqual([onOutput({ x: 700, y: 900, w: 240, h: 60 }, '9:16', 1080)]);
  }, 60_000);
});
