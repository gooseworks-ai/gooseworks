// html-frames 1.1.0: the logo's box on the timeline, and pictures over 2048 px
// staged smaller (turned by their EXIF orientation, alpha kept) from the bytes
// the core checked.
import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeVideo } from '../../../src/kit/maker/make';
import { readInputs } from '../../../src/kit/maker/inputs';
import { buildPage } from '../../../src/kit/maker/page';
import type { PartContext } from '../../../src/kit/part-interface';
import { FIXTURES, describeMedia, fileRef, partContext, pictureInfo, pixelAt, runFfmpeg, sha256File } from './helpers';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'c2-frames11-'));
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** A still from ffmpeg's lavfi graph, written to `file`. */
function still(file: string, graph: string, extra: string[] = []): string {
  runFfmpeg(['-y', '-filter_complex', graph, '-frames:v', '1', ...extra, file]);
  return file;
}

/** A TIFF block with one tag: the EXIF orientation. */
function orientationTiff(orientation: number): Buffer {
  return Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
}

function withJpegOrientation(file: string, orientation: number): void {
  const data = readFileSync(file);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), orientationTiff(orientation)]);
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  writeFileSync(file, Buffer.concat([data.subarray(0, 2), segment, data.subarray(2)]));
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function withPngOrientation(file: string, orientation: number): void {
  const data = readFileSync(file);
  const tiff = orientationTiff(orientation);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(tiff.length, 0);
  head.write('eXIf', 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), tiff])));
  const afterIhdr = 8 + 12 + 13;
  writeFileSync(file, Buffer.concat([data.subarray(0, afterIhdr), head, tiff, crc, data.subarray(afterIhdr)]));
}

const isRed = ([r, g, b]: number[]) => r > 200 && g < 70 && b < 70;
const isBlue = ([r, g, b]: number[]) => b > 200 && r < 70 && g < 70;

describeMedia('pictures over 2048 px', () => {
  let src: string;
  const pictures: Record<string, string> = {};

  beforeAll(() => {
    src = temp();
    const at = (name: string) => path.join(src, name);
    pictures.edge2047 = still(at('edge-2047.png'), 'color=c=0x336699:s=2047x1000');
    pictures.edge2049 = still(at('edge-2049.png'), 'color=c=0x336699:s=2049x1000');
    // Stored 4000x3000, red on the left: EXIF 6 shows it 3000x4000 with the red on top.
    pictures.rotatedJpeg = still(at('rotated.jpg'), 'color=c=red:s=2000x3000[a];color=c=blue:s=2000x3000[b];[a][b]hstack', ['-q:v', '2']);
    withJpegOrientation(pictures.rotatedJpeg, 6);
    // Stored 3000x1000, red on the left: EXIF 8 shows it 1000x3000 with the red at the bottom.
    pictures.rotatedPng = still(at('rotated.png'), 'color=c=red:s=1500x1000[a];color=c=blue:s=1500x1000[b];[a][b]hstack');
    withPngOrientation(pictures.rotatedPng, 8);
    // Clear on the left half, opaque green on the right.
    pictures.alphaPng = still(at('alpha.png'), 'color=c=black@0:s=1500x1000,format=rgba[a];color=c=lime:s=1500x1000,format=rgba[b];[a][b]hstack');
    pictures.alphaWebp = path.join(FIXTURES, 'pictures', 'alpha-2100x300.webp');
  });
  afterAll(() => rmSync(src, { recursive: true, force: true }));

  /** Stages every picture as product photos and returns each one's staged file, by name. */
  async function stage(root: string, ctx: PartContext, names: string[]): Promise<Record<string, string>> {
    const refs = names.map((name) => fileRef(pictures[name]));
    const spec = readInputs(
      { template: fileRef(path.join(FIXTURES, 'rules', 'plain.html')), scenes: [{ id: 'a', on_screen: 'x' }], aspect: '1:1', max_words: 8, duration_s: 0.5, fps: 4, short_side: 720, products: [{ id: 'p', images: refs }] },
      ctx,
    );
    const dir = path.join(root, 'page');
    await buildPage(spec, dir, ctx);
    const media = path.join(dir, '_kit', 'media');
    const files = readdirSync(media);
    const out: Record<string, string> = {};
    names.forEach((name, i) => {
      const found = files.filter((f) => f.startsWith(refs[i].sha256.slice(0, 16)));
      expect([name, found]).toEqual([name, [expect.any(String)]]);
      out[name] = path.join(media, found[0]);
    });
    return out;
  }

  it('leaves a picture of 2047 px as it is, and scales one of 2049 px to 2048 keeping its aspect', async () => {
    const root = temp();
    try {
      const staged = await stage(root, partContext(root).ctx, ['edge2047', 'edge2049']);
      expect(path.basename(staged.edge2047)).not.toMatch(/-2048\./);
      expect(sha256File(staged.edge2047)).toBe(sha256File(pictures.edge2047));
      expect(path.basename(staged.edge2049)).toMatch(/-2048\.png$/);
      expect(pictureInfo(staged.edge2049)).toMatchObject({ width: 2048, height: Math.round((1000 * 2048) / 2049) });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('turns a JPEG and a PNG by their EXIF orientation and sizes them as the browser shows them', async () => {
    const root = temp();
    try {
      const staged = await stage(root, partContext(root).ctx, ['rotatedJpeg', 'rotatedPng']);
      expect(path.basename(staged.rotatedJpeg)).toMatch(/-2048\.jpg$/);
      expect(pictureInfo(staged.rotatedJpeg)).toMatchObject({ width: 1536, height: 2048 });
      expect(isRed(pixelAt(staged.rotatedJpeg, 768, 400))).toBe(true);
      expect(isBlue(pixelAt(staged.rotatedJpeg, 768, 1650))).toBe(true);
      expect(pictureInfo(staged.rotatedPng)).toMatchObject({ width: Math.round((1000 * 2048) / 3000), height: 2048 });
      expect(isBlue(pixelAt(staged.rotatedPng, 340, 400))).toBe(true);
      expect(isRed(pixelAt(staged.rotatedPng, 340, 1650))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps the alpha of a PNG and a WebP', async () => {
    const root = temp();
    try {
      const staged = await stage(root, partContext(root).ctx, ['alphaPng', 'alphaWebp']);
      expect(pictureInfo(staged.alphaPng)).toEqual({ width: 2048, height: Math.round((1000 * 2048) / 3000), pix_fmt: 'rgba' });
      expect(pixelAt(staged.alphaPng, 100, 300)[3]).toBe(0);
      expect(pixelAt(staged.alphaPng, 1900, 300)).toEqual([0, 255, 0, 255]);
      expect(path.basename(staged.alphaWebp)).toMatch(/-2048\.png$/);
      expect(pictureInfo(staged.alphaWebp)).toEqual({ width: 2048, height: Math.round((300 * 2048) / 2100), pix_fmt: 'rgba' });
      expect(pixelAt(staged.alphaWebp, 100, 100)[3]).toBe(0);
      expect(pixelAt(staged.alphaWebp, 1950, 100)).toEqual([0, 255, 0, 255]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('leaves the originals untouched and stages the same bytes on every run', async () => {
    const names = ['edge2049', 'rotatedJpeg', 'rotatedPng', 'alphaPng', 'alphaWebp'];
    const before = names.map((name) => sha256File(pictures[name]));
    const runs: string[][] = [];
    for (let i = 0; i < 2; i++) {
      const root = temp();
      try {
        const staged = await stage(root, partContext(root).ctx, names);
        runs.push(names.map((name) => sha256File(staged[name])));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
    expect(runs[1]).toEqual(runs[0]);
    expect(names.map((name) => sha256File(pictures[name]))).toEqual(before);
  }, 120_000);

  it('scales the bytes it checked, even when the file is replaced before ffmpeg runs', async () => {
    const root = temp();
    const swapped = path.join(root, 'swapped.jpg');
    try {
      writeFileSync(swapped, readFileSync(pictures.rotatedJpeg));
      const { ctx } = partContext(root);
      const ref = fileRef(swapped);
      const blue = still(path.join(root, 'blue.jpg'), 'color=c=blue:s=3000x3000');
      const racing: PartContext = {
        ...ctx,
        tools: {
          ...ctx.tools,
          exec: async (bin, args, options) => {
            writeFileSync(swapped, readFileSync(blue));
            return ctx.tools.exec(bin, args, options);
          },
        },
      };
      const spec = readInputs(
        { template: fileRef(path.join(FIXTURES, 'rules', 'plain.html')), scenes: [{ id: 'a', on_screen: 'x' }], aspect: '1:1', max_words: 8, duration_s: 0.5, fps: 4, short_side: 720, products: [{ id: 'p', images: [ref] }] },
        racing,
      );
      await buildPage(spec, path.join(root, 'page'), racing);
      expect(sha(readFileSync(swapped))).not.toBe(ref.sha256);
      const media = path.join(root, 'page', '_kit', 'media');
      const staged = path.join(media, readdirSync(media).find((f) => f.startsWith(ref.sha256.slice(0, 16)))!);
      expect(pictureInfo(staged)).toMatchObject({ width: 1536, height: 2048 });
      expect(isRed(pixelAt(staged, 768, 400))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('draws the same frames on every run from a turned, scaled photo', async () => {
    const html = `<!doctype html><style>html,body{margin:0;width:var(--kit-width);height:var(--kit-height);overflow:hidden;background:#000}
      img{position:absolute;left:100px;top:50px;height:600px}</style><body><script>
      document.body.insertAdjacentHTML('beforeend', '<img src="' + kit.products[0].images[0] + '">');
      kit.render(function () {});
    </script></body>`;
    const runs: string[][] = [];
    for (let i = 0; i < 2; i++) {
      const root = temp();
      try {
        writeFileSync(path.join(root, 'page.html'), html);
        const made = await makeVideo(
          {
            template: fileRef(path.join(root, 'page.html')),
            scenes: [{ id: 'a', on_screen: 'x' }],
            products: [{ id: 'p', images: [fileRef(pictures.rotatedJpeg)] }],
            aspect: '1:1',
            max_words: 8,
            duration_s: 0.5,
            fps: 4,
            short_side: 720,
          },
          partContext(root).ctx,
        );
        runs.push(made.frameHashes);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
    expect(runs[0]).toHaveLength(2);
    expect(runs[1]).toEqual(runs[0]);
  }, 120_000);
});

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
