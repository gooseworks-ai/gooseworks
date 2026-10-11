// html-frames 1.2.0: picture facts (kit.facts), extra pictures (kit.media) and
// footage windows (kit.scenes[i].footage, metadata only), plus the probe that
// says why facts are measured in Node: a file:// page cannot read a picture's
// pixels in the kit browser.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FACTS_SIZE, pictureFacts } from '../../../src/kit/maker/facts';
import { readInputs } from '../../../src/kit/maker/inputs';
import { makeVideo } from '../../../src/kit/maker/make';
import { buildPage } from '../../../src/kit/maker/page';
import type { PartContext } from '../../../src/kit/part-interface';
import { TestPartError, describeMedia, fileRef, partContext, runFfmpeg } from './helpers';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'frames12-facts-'));
const ctxError = { error: (code: string, detail?: string) => new TestPartError(code as never, detail) } as Pick<PartContext, 'error'>;

/** An n x n RGBA picture filled with `fill`, then each box painted (x0, y0 inclusive; x1, y1 exclusive). */
function pixels(n: number, fill: number[], boxes: Array<{ x0: number; y0: number; x1: number; y1: number; c: number[] }> = []): Uint8Array {
  const data = new Uint8Array(n * n * 4);
  for (let p = 0; p < n * n; p++) data.set(fill, p * 4);
  for (const box of boxes) {
    for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) data.set(box.c, (y * n + x) * 4);
  }
  return data;
}

const N = FACTS_SIZE;
const RED = [220, 30, 30, 255];
const BLUE = [20, 40, 200, 255];

describe('picture facts', () => {
  it('a cutout: see-through, no plate, the subject box and an accent', () => {
    const facts = pictureFacts(pixels(N, [0, 0, 0, 0], [{ x0: 32, y0: 16, x1: 96, y1: 112, c: RED }]), N, { width: 800, height: 1000 });
    expect(facts.alpha).toBe(true);
    expect(facts.plate).toBeNull();
    expect(facts.accent).toBe('#dc1e1e');
    expect(facts.subject).toEqual({ x: 0.25, y: 0.125, w: 0.5, h: 0.75, top_cx: 0.5 });
    expect(facts.width).toBe(800);
    expect(facts.height).toBe(1000);
  });

  it('a studio shot: the plate colour, and the top half centres the subject, not its wide shadow', () => {
    // A narrow bottle at x 16..48 on top, a wide shadow at x 16..112 below it, on a light grey backdrop.
    const facts = pictureFacts(
      pixels(N, [240, 240, 238, 255], [
        { x0: 16, y0: 20, x1: 48, y1: 80, c: BLUE },
        { x0: 16, y0: 80, x1: 112, y1: 96, c: [90, 90, 90, 255] },
      ]),
      N,
      { width: 1024, height: 1024 },
    );
    expect(facts.alpha).toBe(false);
    expect(facts.plate).toBe('#f0f0ee');
    expect(facts.accent).toBe('#1428c8');
    expect(facts.subject).toEqual({ x: 0.125, y: 0.1563, w: 0.75, h: 0.5938, top_cx: 0.25 });
  });

  it('a lone noisy pixel on the backdrop is not part of the subject', () => {
    const facts = pictureFacts(
      pixels(N, [255, 255, 255, 255], [
        { x0: 64, y0: 64, x1: 80, y1: 80, c: BLUE },
        { x0: 5, y0: 120, x1: 6, y1: 121, c: [0, 0, 0, 255] },
      ]),
      N,
      { width: 10, height: 10 },
    );
    expect(facts.subject).toEqual({ x: 0.5, y: 0.5, w: 0.125, h: 0.125, top_cx: 0.5625 });
  });

  it('a photo (busy edges) has no plate and no subject box', () => {
    const data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) data.set([(x * 2) % 256, (y * 2) % 256, ((x + y) * 3) % 256, 255], (y * N + x) * 4);
    const facts = pictureFacts(data, N, { width: 1920, height: 1080 });
    expect(facts.plate).toBeNull();
    expect(facts.subject).toBeNull();
    expect(facts.alpha).toBe(false);
  });

  it('luminance runs 0 to 1, and white or black alone gives no accent', () => {
    const white = pictureFacts(pixels(N, [255, 255, 255, 255]), N, { width: 1, height: 1 });
    expect(white.luminance).toBe(1);
    expect(white.accent).toBeNull();
    expect(white.subject).toBeNull();
    const black = pictureFacts(pixels(N, [0, 0, 0, 255]), N, { width: 1, height: 1 });
    expect(black.luminance).toBe(0);
    expect(black.accent).toBeNull();
  });

  it('the same pixels always give the same facts', () => {
    const data = pixels(N, [250, 250, 250, 255], [{ x0: 10, y0: 10, x1: 40, y1: 40, c: RED }, { x0: 60, y0: 60, x1: 90, y1: 90, c: BLUE }]);
    expect(JSON.stringify(pictureFacts(data, N, { width: 2, height: 2 }))).toBe(JSON.stringify(pictureFacts(data, N, { width: 2, height: 2 })));
  });
});

describe('media, footage and facts inputs', () => {
  let dir: string;
  let template: ReturnType<typeof fileRef>;
  let still: ReturnType<typeof fileRef>;
  let clip: ReturnType<typeof fileRef>;
  beforeAll(() => {
    dir = temp();
    writeFileSync(path.join(dir, 'page.html'), '<!doctype html><html><body></body></html>');
    writeFileSync(path.join(dir, 'a.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    writeFileSync(path.join(dir, 'clip.mp4'), 'not really a video');
    template = fileRef(path.join(dir, 'page.html'));
    still = fileRef(path.join(dir, 'a.png'));
    clip = fileRef(path.join(dir, 'clip.mp4'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const base = () => ({ template, scenes: [{ id: 's1', line: null, on_screen: null, picture: null }, { id: 's2', line: 'Hi.' }], max_words: 20, aspect: '9:16', duration_s: 2 });

  it('reads media by id, footage windows in seconds and facts (off unless asked)', () => {
    const spec = readInputs(
      {
        ...base(),
        media: [{ id: 'cast-a', image: still }],
        footage: [
          { asset_id: 'x', scene_id: 's2', start_ms: 1500, end_ms: 4250, audio: false, crop: [0.1, 0, 0.9, 1], fit: 'width', file: clip },
          { asset_id: 'y', scene_id: null, start_ms: null, end_ms: null, kind: 'image', file: still },
        ],
      },
      ctxError,
    );
    expect(spec.media).toEqual([{ id: 'cast-a', image: still }]);
    expect(spec.footage).toEqual([
      { index: 0, scene_id: 's2', kind: 'video', start_s: 1.5, end_s: 4.25, crop: [0.1, 0, 0.9, 1], fit: 'width' },
      { index: 1, scene_id: null, kind: 'image', start_s: null, end_s: null, crop: null, fit: null },
    ]);
    expect(spec.facts).toBe(false);
    expect(readInputs({ ...base(), facts: true }, ctxError).facts).toBe(true);
    // Nothing new given: nothing new in the spec, and a scene with no line is fine.
    const plain = readInputs(base(), ctxError);
    expect(plain.media).toEqual([]);
    expect(plain.footage).toEqual([]);
    expect(plain.scenes[0].line).toBeNull();
  });

  it('refuses a media id used twice, a media item that is not a picture, and footage that ends before it starts', () => {
    expect(() => readInputs({ ...base(), media: [{ id: 'a', image: still }, { id: 'a', image: still }] }, ctxError)).toThrow(/media\[1\]\.id "a" is used twice/);
    expect(() => readInputs({ ...base(), media: [{ id: 'a', image: clip }] }, ctxError)).toThrow(/bad_input/);
    expect(() => readInputs({ ...base(), footage: [{ start_ms: 3000, end_ms: 1000 }] }, ctxError)).toThrow(/footage\[0\] ends before it starts/);
    expect(() => readInputs({ ...base(), footage: [{ crop: [0, 0, 1] }] }, ctxError)).toThrow(/bad_input/);
    expect(() => readInputs({ ...base(), facts: 'yes' }, ctxError)).toThrow(/bad_input/);
  });
});

/** The page data buildPage wrote into the page's head. */
function pageData(entry: string): Record<string, any> {
  const html = readFileSync(entry, 'utf8');
  const start = html.indexOf('var DATA = ') + 'var DATA = '.length;
  for (let end = html.indexOf(';', start); end > 0; end = html.indexOf(';', end + 1)) {
    try {
      return JSON.parse(html.slice(start, end));
    } catch {
      // A ';' inside a string: keep looking.
    }
  }
  throw new Error('no page data');
}

describeMedia('facts, media and footage in the page', () => {
  let src: string;
  const at = (name: string) => path.join(src, name);
  beforeAll(() => {
    src = temp();
    // A cutout: a red square on a clear 400x400 picture, inset 100 px.
    runFfmpeg(['-y', '-filter_complex', 'color=c=black@0:s=400x400,format=rgba[bg];color=c=red:s=200x200,format=rgba[fg];[bg][fg]overlay=100:100', '-frames:v', '1', at('cutout.png')]);
    // A studio shot over 2048 px: a blue block on white, 3000x1500 (staged at 2048x1024).
    runFfmpeg(['-y', '-filter_complex', 'color=c=white:s=3000x1500[bg];color=c=blue:s=1500x750[fg];[bg][fg]overlay=750:375', '-frames:v', '1', '-q:v', '2', at('studio.jpg')]);
    // A cast still for kit.media.
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=0x22aa44:s=300x500', '-frames:v', '1', at('cast.png')]);
    runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', at('clip.mp4')]);
    writeFileSync(at('logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#123456"/></svg>');
    writeFileSync(at('page.html'), '<!doctype html><html><body></body></html>');
  });
  afterAll(() => rmSync(src, { recursive: true, force: true }));

  const inputs = (facts: boolean) => ({
    template: fileRef(at('page.html')),
    scenes: [
      { id: 's1', line: null, on_screen: 'One', picture: fileRef(at('cutout.png')) },
      { id: 's2', line: 'Two', on_screen: null, image: fileRef(at('studio.jpg')) },
    ],
    products: [{ id: 'p1', name: 'Tin', images: [fileRef(at('cutout.png'))] }],
    brand: { name: 'Fernhill', logo: fileRef(at('logo.svg')) },
    media: [{ id: 'cast-a', image: fileRef(at('cast.png')) }],
    footage: [
      { asset_id: 'a1', scene_id: 's2', start_ms: 250, end_ms: 1000, audio: false, crop: [0, 0.25, 1, 0.75], fit: 'cover', file: fileRef(at('clip.mp4')) },
      { asset_id: 'a2', start_ms: 0, end_ms: 500, audio: false },
    ],
    facts,
    max_words: 10,
    aspect: '9:16',
    duration_s: 1,
    fps: 4,
  });

  it('measures every staged picture by the URL the page uses, stages media, and passes footage windows without the files', async () => {
    const root = temp();
    try {
      const { ctx } = partContext(root);
      const spec = readInputs(inputs(true), ctx);
      const built = await buildPage(spec, path.join(root, 'page'), ctx);
      const data = pageData(built.entry);
      const cutoutUrl = data.scenes[0].picture;
      const studioUrl = data.scenes[1].image;
      expect(data.products[0].images[0]).toBe(cutoutUrl);
      expect(Object.keys(data.facts).sort()).toEqual([cutoutUrl, studioUrl, data.media[0].url].sort());
      // The SVG logo is staged but has no facts.
      expect(data.facts[data.brand.logo]).toBeUndefined();

      const cutout = data.facts[cutoutUrl];
      expect(cutout).toMatchObject({ alpha: true, plate: null, width: 400, height: 400 });
      expect(cutout.accent).toMatch(/^#f[0-9a-f]0[0-9a-f]0[0-9a-f]$/);
      for (const [key, want] of Object.entries({ x: 0.25, y: 0.25, w: 0.5, h: 0.5, top_cx: 0.5 })) expect(Math.abs(cutout.subject[key] - want)).toBeLessThan(0.02);

      const studio = data.facts[studioUrl];
      expect(studio).toMatchObject({ alpha: false, width: 2048, height: 1024 });
      expect(studio.plate).toMatch(/^#f[c-f]f[c-f]f[c-f]$/);
      for (const [key, want] of Object.entries({ x: 0.25, y: 0.25, w: 0.5, h: 0.5, top_cx: 0.5 })) expect(Math.abs(studio.subject[key] - want)).toBeLessThan(0.02);

      expect(data.media).toEqual([{ id: 'cast-a', url: expect.stringMatching(/^_kit\/media\/[0-9a-f]{16}\.png$/) }]);
      expect(data.facts[data.media[0].url]).toMatchObject({ alpha: false, width: 300, height: 500, subject: null });

      expect(data.scenes[0].footage).toEqual([]);
      expect(data.scenes[1].footage).toEqual([{ scene_id: 's2', kind: 'video', start_s: 0.25, end_s: 1, crop: [0, 0.25, 1, 0.75], fit: 'cover' }]);
      expect(data.footage).toHaveLength(2);
      // Footage files never reach the page folder; the measuring scratch is gone too.
      const staged = readdirSync(path.join(root, 'page', '_kit', 'media'));
      expect(staged.some((name) => /\.mp4$/.test(name))).toBe(false);
      expect(readdirSync(path.join(root, 'page', '_kit')).includes('facts.rgba')).toBe(false);
      expect(JSON.stringify(data)).not.toContain('clip.mp4');

      // Without facts: the same page with an empty kit.facts.
      const plain = pageData((await buildPage(readInputs(inputs(false), ctx), path.join(root, 'page-plain'), ctx)).entry);
      expect(plain.facts).toEqual({});
      expect(plain.media).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('a frame page reads kit.facts, kit.media and kit.scenes[i].footage and draws the measured plate', async () => {
    const root = temp();
    try {
      writeFileSync(
        at('reader.html'),
        `<!doctype html><html><body style="margin:0"><img id="cast"><script>
          var s2 = kit.scenes[1];
          var f = kit.facts[s2.image];
          if (!f || !f.plate || !f.subject) throw new Error('no facts for the studio picture');
          if (kit.media.length !== 1 || kit.media[0].id !== 'cast-a') throw new Error('no media');
          if (s2.footage.length !== 1 || s2.footage[0].start_s !== 0.25 || 'file' in s2.footage[0]) throw new Error('wrong footage');
          document.getElementById('cast').src = kit.media[0].url;
          kit.render(function () { document.body.style.background = f.plate; });
        </script></body></html>`,
      );
      const { ctx } = partContext(root);
      const made = await makeVideo({ ...inputs(true), template: fileRef(at('reader.html')) }, ctx);
      expect(made.seconds).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  // The probe (GOOSE-4015 W0-08): in the kit browser a file:// page's canvas is tainted by its own
  // pictures, so getImageData throws; a data: URL picture stays readable. Facts are measured in Node for this reason.
  it('probe: a file:// page cannot read a staged picture\'s pixels, but can read a data: URL picture', async () => {
    const root = temp();
    try {
      const dataUrl = 'data:image/png;base64,' + readFileSync(at('cast.png')).toString('base64');
      writeFileSync(
        at('probe.html'),
        `<!doctype html><html><body><script>
          var results = {};
          function read(name, src) {
            return new Promise(function (done) {
              var img = new Image();
              img.onload = function () {
                try {
                  var c = document.createElement('canvas'); c.width = 4; c.height = 4;
                  var g = c.getContext('2d'); g.drawImage(img, 0, 0, 4, 4);
                  results[name] = 'read ' + g.getImageData(0, 0, 1, 1).data[1];
                } catch (e) { results[name] = 'blocked ' + e.name; }
                done();
              };
              img.onerror = function () { results[name] = 'not loaded'; done(); };
              img.src = src;
            });
          }
          kit.ready(Promise.all([read('file', kit.media[0].url), read('data', ${JSON.stringify(dataUrl)})]));
          kit.render(function () { throw new Error('PROBE ' + JSON.stringify({ file: results.file, data: results.data })); });
        </script></body></html>`,
      );
      const { ctx } = partContext(root);
      const error = await makeVideo({ ...inputs(false), template: fileRef(at('probe.html')) }, ctx).catch((e: Error) => e);
      // The cast still's green channel (0xaa, give or take ffmpeg's colour conversion).
      expect(String(error)).toMatch(/PROBE \{"file":"blocked SecurityError","data":"read 1[67]\d"\}/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});
