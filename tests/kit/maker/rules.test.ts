// Rules of the web video maker: word limits, the same bytes for the same
// inputs, the aspect's size, and no network for page code.
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as http from 'http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import type { AddressInfo, Socket } from 'net';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { findShell, installShell } from '../../../src/kit/maker/browser';
import { isAnimatedImage } from '../../../src/kit/maker/images';
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
      ).rejects.toMatchObject({ code: 'bad_input', detail: expect.stringMatching(/tr(ied|ies) to reach (http:\/\/127\.0\.0\.1|file:)/) });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(connections).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(away, { recursive: true, force: true });
    }
  }, 60_000);

  it('lets a page open only files in its own folders, and refuses the page once it reaches past them', async () => {
    const root = temp();
    const away = temp();
    try {
      const inside = path.join(root, 'inside.svg');
      const outside = path.join(away, 'outside.svg');
      for (const file of [inside, outside]) writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
      const own = path.join(root, 'own.html');
      const far = path.join(root, 'far.html');
      writeFileSync(own, '<!doctype html><img id="in" src="inside.svg">');
      writeFileSync(far, `<!doctype html><img id="out" src="${pathToFileURL(outside).href}">`);
      const { ctx } = partContext(root);
      const browser = await ctx.browser!.launch();
      try {
        const first = await browser.newPage({ viewport: { width: 64, height: 64 } });
        await expect(first.goto(pathToFileURL(outside).href)).rejects.toThrow(/only files in its own folders/);
        await first.goto(pathToFileURL(own).href);
        expect(await first.evaluate<number>('document.getElementById("in").naturalWidth')).toBe(10);
        // Peer-to-peer sockets fail inside the page and reach nothing.
        expect(await first.evaluate<string>(`new Promise((done) => { try { const s = new WebSocket("ws://127.0.0.1:${port}/ws"); s.onopen = () => done("reached"); s.onerror = () => done("blocked"); } catch (e) { done("blocked"); } })`)).toBe('blocked');
        // A request past the folders is blocked, and every later call on that page is refused.
        await expect(first.evaluate<string>(`fetch("http://127.0.0.1:${port}/x").then(() => "reached", () => "blocked")`)).rejects.toMatchObject({ code: 'bad_input', message: expect.stringContaining(`tried to reach http://127.0.0.1:${port}/x`) });
        await expect(first.evaluate('1')).rejects.toMatchObject({ code: 'bad_input' });
        const second = await browser.newPage({ viewport: { width: 64, height: 64 } });
        await expect(second.goto(pathToFileURL(far).href)).rejects.toMatchObject({ code: 'bad_input', message: expect.stringContaining('outside.svg') });
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

describeMedia('the kit browser', () => {
  it('runs Chromium in its sandbox', async () => {
    const root = temp();
    try {
      const { ctx } = partContext(root);
      const browser = await ctx.browser!.launch();
      try {
        const ps = spawnSync('ps', ['-A', '-ww', '-o', 'args='], { encoding: 'utf8' });
        const chromium = ps.stdout.split('\n').filter((line) => /chrome-headless-shell|headless_shell/.test(line) && line.includes('--remote-debugging-pipe'));
        expect(chromium.length).toBeGreaterThan(0);
        for (const line of chromium) expect(line).not.toContain('--no-sandbox');
      } finally {
        await browser.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describeMedia('pages that break the rules are refused', () => {
  const render = async (html: string, extra: Record<string, unknown> = {}, options = {}) => {
    const root = temp();
    const dir = path.join(root, 'style');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'page.html'), html);
    const { ctx } = partContext(root);
    const outcome = await makeVideo(
      { template: fileRef(path.join(dir, 'page.html')), scenes: [{ id: 'a', on_screen: 'x' }], aspect: '1:1', max_words: 8, duration_s: 1, fps: 6, short_side: 720, ...extra },
      ctx,
      options,
    ).then(
      () => ({ ok: true, detail: '' }),
      (error: { code?: string; detail?: string }) => ({ ok: false, code: error.code, detail: String(error.detail) }),
    );
    // Whatever happened, the maker leaves none of its scratch and no half-made video.
    const left = ['page', 'frames', 'segments'].filter((name) => existsSync(path.join(root, 'tmp', name)));
    const video = existsSync(path.join(root, 'out', 'video.mp4'));
    rmSync(root, { recursive: true, force: true });
    return { ...outcome, left, video };
  };
  const drawing = (script: string) => `<!doctype html><body style="background:#246"><div id="t" style="color:#fff;font:40px sans-serif"></div><script>${script}</script></body>`;

  it('a page that opens a frame inside it, even to borrow its clock', async () => {
    const result = await render(drawing("var f = document.createElement('iframe'); document.body.appendChild(f); document.getElementById('t').textContent = f.contentWindow.Date.now(); f.remove();"));
    expect(result).toMatchObject({ ok: false, code: 'bad_input', detail: expect.stringContaining('another page inside it'), left: [], video: false });
  }, 60_000);

  it('a page that opens a popup', async () => {
    const result = await render(drawing("window.open('about:blank');"));
    expect(result).toMatchObject({ ok: false, code: 'bad_input', detail: expect.stringContaining('another window') });
  }, 60_000);

  it('a page that starts a worker', async () => {
    const result = await render(drawing("new Worker(URL.createObjectURL(new Blob(['postMessage(Date.now())'], { type: 'text/javascript' })));"));
    expect(result).toMatchObject({ ok: false, code: 'bad_input', detail: expect.stringMatching(/Worker/) });
  }, 60_000);

  it('a page that hides a fetch, or misses a file its styles use', async () => {
    const hidden = await render(drawing("performance.getEntriesByType = function () { return []; }; fetch('file:///etc/hosts').catch(function () {}); try { navigator.sendBeacon('http://127.0.0.1:9/x', 'y'); } catch (e) {}"));
    expect(hidden).toMatchObject({ ok: false, code: 'bad_input' });
    const missing = await render('<!doctype html><body><div style="width:200px;height:200px;background:url(nothere.png)"></div></body>');
    expect(missing).toMatchObject({ ok: false, code: 'bad_input', detail: expect.stringContaining('nothere.png') });
  }, 60_000);

  it('a page that plays sound or video it creates', async () => {
    const result = await render(drawing("var v = document.createElement('video'); v.play().catch(function () {}); try { new AudioContext(); } catch (e) {}"));
    expect(result).toMatchObject({ ok: false, code: 'bad_input', detail: expect.stringContaining('video or sound') });
  }, 60_000);

  it('a render that needs more working space than allowed, and cleans up after itself', async () => {
    const noise = drawing("kit.render(function (t) { var c = document.getElementById('c') || document.body.appendChild(Object.assign(document.createElement('canvas'), { id: 'c', width: 1080, height: 1080 })); var g = c.getContext('2d'); var img = g.createImageData(1080, 1080); for (var i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0; g.putImageData(img, 0, 0); });");
    const result = await render(noise, {}, { diskLimitBytes: 3 * 1024 * 1024 });
    expect(result).toMatchObject({ ok: false, code: 'bad_input', detail: expect.stringContaining('working space'), left: [], video: false });
  }, 60_000);

  it('a page that throws midway leaves no scratch behind', async () => {
    const result = await render(drawing("kit.render(function (t, frame) { if (frame.index === 3) throw new Error('broken at frame 3'); document.getElementById('t').textContent = String(t); });"));
    expect(result).toMatchObject({ ok: false, code: 'bad_input', detail: expect.stringContaining('broken at frame 3'), left: [], video: false });
  }, 60_000);
});

describe('moving pictures', () => {
  // A GIF with one or two image blocks (the pixel data is not needed to count frames).
  const gif = (frames: number) => {
    const head = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff];
    const frame = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00];
    return Uint8Array.from([...head, ...Array.from({ length: frames }, () => frame).flat(), 0x3b]);
  };
  it('refuses animated pictures and keeps still ones', () => {
    expect(isAnimatedImage(gif(2), 'image/gif')).toBe(true);
    expect(isAnimatedImage(gif(1), 'image/gif')).toBe(false);
    const svg = (body: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
    expect(isAnimatedImage(svg('<circle r="4"><animate attributeName="r" values="4;8" dur="1s"/></circle>'), 'image/svg+xml')).toBe(true);
    expect(isAnimatedImage(svg('<circle r="4"/>'), 'image/svg+xml')).toBe(false);
  });
});

describe('the browser download', () => {
  /** A stored (uncompressed) zip with one file. */
  const zipOf = (name: string, content: string) => {
    const data = Buffer.from(content);
    const file = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(file.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(file.length, 28);
    central.writeUInt32LE((0o100755 << 16) >>> 0, 38);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(46 + file.length, 12);
    end.writeUInt32LE(30 + file.length + data.length, 16);
    return Buffer.concat([local, file, data, central, file, end]);
  };

  it('unpacks only a download whose sha256 matches its pin', async () => {
    const zip = zipOf('chrome-headless-shell-mac-arm64/chrome-headless-shell', '#!/bin/sh\n');
    const sha256 = createHash('sha256').update(zip).digest('hex');
    const pins = { 't1': { 'darwin-arm64': { url: 'https://example.test/shell.zip', bytes: zip.length, sha256 } } };
    const download = async (_url: string, target: string) => writeFileSync(target, zip);
    const tampered = async (_url: string, target: string) => writeFileSync(target, Buffer.concat([zip, Buffer.from([0])]));
    const dir = temp();
    try {
      await expect(installShell({ dir, revision: 't1', download: tampered, platform: 'darwin-arm64', pins })).rejects.toThrow(/did not match its checksum/);
      expect(findShell(dir, 't1', 'darwin-arm64')).toBeNull();
      await expect(installShell({ dir, revision: 't1', download, platform: 'linux-x64', pins })).rejects.toThrow(/no checked download/);
      await installShell({ dir, revision: 't1', download, platform: 'darwin-arm64', pins });
      expect(findShell(dir, 't1', 'darwin-arm64')).toBe(path.join(dir, 'chromium_headless_shell-t1', 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
