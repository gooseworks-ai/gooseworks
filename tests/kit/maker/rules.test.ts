// Rules of the web video maker: word limits, the same bytes for the same
// inputs, the aspect's size, and no network for page code.
import * as http from 'http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import type { AddressInfo, Socket } from 'net';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { readInputs } from '../../../src/kit/maker/inputs';
import { run } from '../../../src/kit/maker/parts/html-frames/src/part';
import { makeVideo } from '../../../src/kit/maker/make';
import type { PartContext } from '../../../src/kit/part-interface';
import { FIXTURES, TestPartError, describeMedia, ffprobe, fileRef, partContext, sha256File } from './helpers';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'c2-maker-'));
const page = (name: string) => fileRef(path.join(FIXTURES, 'rules', name));

describe('word limit', () => {
  const scenes = (onScreen: string) => [
    { id: 'hook', line: null, on_screen: 'Three short words', picture: null },
    { id: 'long', line: null, on_screen: onScreen, picture: null },
  ];
  const errorOnly = { error: (code: string, detail?: string) => new TestPartError(code as never, detail) } as Pick<PartContext, 'error'>;

  it('refuses a scene with more words than the style allows, before the browser starts', async () => {
    let launched = 0;
    const ctx = {
      ...errorOnly,
      browser: { launch: async () => { launched++; throw new Error('the browser must not start'); } },
      signal: new AbortController().signal,
    } as unknown as PartContext;
    const inputs = { template: page('plain.html'), scenes: scenes('one two three four five six seven eight nine'), aspect: '9:16', max_words: 8, duration_s: 2 };
    await expect(run(inputs, ctx)).rejects.toMatchObject({ code: 'bad_input', detail: expect.stringContaining('scene 2 (long) has 9 words') });
    expect(launched).toBe(0);
  });

  it('counts the line and the on-screen words each against the limit, and allows exactly the limit', () => {
    const at = { template: page('plain.html'), aspect: '9:16', max_words: 8, duration_s: 2 };
    expect(readInputs({ ...at, scenes: scenes('one two three four five six seven eight') }, errorOnly).scenes).toHaveLength(2);
    expect(() =>
      readInputs({ ...at, scenes: [{ id: 'a', line: 'one two three four five six seven eight nine', on_screen: 'short' }] }, errorOnly),
    ).toThrow(/has 9 words in line/);
  });
});

describeMedia('frames are pure', () => {
  const inputs = () => ({
    template: page('clock.html'),
    scenes: [{ id: 'a', on_screen: 'First' }, { id: 'b', on_screen: 'Second' }],
    aspect: '9:16',
    max_words: 8,
    duration_s: 1.2,
    fps: 10,
    short_side: 720,
  });

  it('gives byte-identical frames and video for the same inputs, on a page that reads every clock', async () => {
    const one = temp();
    const two = temp();
    try {
      const first = await makeVideo(inputs(), partContext(one).ctx);
      const second = await makeVideo(inputs(), partContext(two).ctx);
      expect(first.frameHashes).toHaveLength(12);
      // The page really moves, so equal hashes are not a still picture.
      expect(new Set(first.frameHashes).size).toBe(12);
      expect(second.frameHashes).toEqual(first.frameHashes);
      expect(sha256File(second.video.path)).toBe(sha256File(first.video.path));
    } finally {
      rmSync(one, { recursive: true, force: true });
      rmSync(two, { recursive: true, force: true });
    }
  }, 120_000);
});

describeMedia('output size', () => {
  const cases: Array<[string, number, number, number]> = [
    ['9:16', 1080, 1080, 1920],
    ['1:1', 720, 720, 720],
    ['4:5', 1080, 1080, 1350],
    ['16:9', 720, 1280, 720],
  ];
  it.each(cases)('%s at a %d px short side is %dx%d', async (aspect, shortSide, width, height) => {
    const root = temp();
    try {
      const made = await makeVideo(
        { template: page('plain.html'), scenes: [{ id: 'a', on_screen: 'Hello' }], aspect, max_words: 8, duration_s: 0.5, fps: 4, short_side: shortSide },
        partContext(root).ctx,
      );
      expect(ffprobe(made.video.path)).toMatchObject({ width, height, codec: 'h264', pix_fmt: 'yuv420p', frames: 2 });
      expect(made.timeline).toMatchObject({ width, height, fps: 4, duration_s: 0.5 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describeMedia('no network for page code', () => {
  let server: http.Server;
  let port = 0;
  let connections = 0;
  const sockets = new Set<Socket>();

  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end('reached'));
    server.on('connection', (socket) => {
      connections++;
      sockets.add(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  beforeEach(() => {
    connections = 0;
  });

  /** A page that tries every way out: fetch, XHR, beacon, image, stylesheet, @import, font, WebSocket, EventSource. */
  const greedyPage = (dir: string, outside: string) => {
    const at = `http://127.0.0.1:${port}`;
    const file = path.join(dir, 'greedy.html');
    writeFileSync(
      file,
      `<!doctype html><html><head>
<link rel="stylesheet" href="${at}/sheet.css">
<style>@import url(${at}/import.css); @font-face { font-family: Far; src: url(${at}/font.woff2); } body { font-family: Far; background: url(${at}/bg.png); }</style>
</head><body><p>hi</p><img id="far" src="${at}/pic.png"><img id="outside" src="${pathToFileURL(outside).href}">
<script>
  fetch('${at}/fetch').catch(function () {});
  try { var x = new XMLHttpRequest(); x.open('GET', '${at}/xhr'); x.send(); } catch (e) {}
  try { navigator.sendBeacon('${at}/beacon', 'x'); } catch (e) {}
  try { new WebSocket('ws://127.0.0.1:${port}/ws'); } catch (e) {}
  try { new EventSource('${at}/events'); } catch (e) {}
</script></body></html>`,
    );
    return file;
  };

  it('blocks every request and the maker refuses the page', async () => {
    const root = temp();
    const away = temp();
    try {
      const outside = path.join(away, 'secret.svg');
      writeFileSync(outside, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
      const dir = path.join(root, 'style');
      mkdirSync(dir, { recursive: true });
      const template = fileRef(greedyPage(dir, outside));
      const { ctx } = partContext(root);
      await expect(
        makeVideo({ template, scenes: [{ id: 'a', on_screen: 'x' }], aspect: '1:1', max_words: 8, duration_s: 0.5, fps: 2, short_side: 720 }, ctx),
      ).rejects.toMatchObject({ code: 'bad_input', detail: expect.stringContaining('tries to reach http://127.0.0.1') });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(connections).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(away, { recursive: true, force: true });
    }
  }, 60_000);

  it('lets a page open only files in its own folders', async () => {
    const root = temp();
    const away = temp();
    try {
      const inside = path.join(root, 'inside.svg');
      const outside = path.join(away, 'outside.svg');
      for (const file of [inside, outside]) writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
      const file = path.join(root, 'two.html');
      writeFileSync(file, `<!doctype html><img id="in" src="inside.svg"><img id="out" src="${pathToFileURL(outside).href}">`);
      const { ctx } = partContext(root);
      const browser = await ctx.browser!.launch();
      try {
        const tab = await browser.newPage({ viewport: { width: 64, height: 64 } });
        await expect(tab.goto(pathToFileURL(outside).href)).rejects.toThrow(/only files in its own folders/);
        await tab.goto(pathToFileURL(file).href);
        const loaded = await tab.evaluate<{ inside: number; outside: number }>(
          '({ inside: document.getElementById("in").naturalWidth, outside: document.getElementById("out").naturalWidth })',
        );
        expect(loaded).toEqual({ inside: 10, outside: 0 });
        expect(await tab.evaluate<string>(`fetch("http://127.0.0.1:${port}/x").then(() => "reached", (e) => "blocked")`)).toBe('blocked');
        expect(await tab.evaluate<string>(`new Promise((done) => { try { const s = new WebSocket("ws://127.0.0.1:${port}/ws"); s.onopen = () => done("reached"); s.onerror = () => done("blocked"); } catch (e) { done("blocked"); } })`)).toBe('blocked');
      } finally {
        await browser.close();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(connections).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(away, { recursive: true, force: true });
    }
  }, 60_000);
});
