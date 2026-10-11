// html-frames 1.2.0 `under`: the page drawn transparent over another step's
// video, its sound kept, scene times from that video's timeline, its speech,
// end card and zones carried through, and each scene's quiet band measured.
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readInputs } from '../../../src/kit/maker/inputs';
import { makeVideo } from '../../../src/kit/maker/make';
import { compositeArgs, passThroughTimeline, quietBandOf, underSceneFrames } from '../../../src/kit/maker/under';
import type { Timeline } from '../../../src/kit/part-interface';
import { TestPartError, describeMedia, fileRef, partContext, pixelAt, runFfmpeg } from './helpers';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'hf12-under-'));
const errorCtx = { error: (code: string, detail?: string) => new TestPartError(code as never, detail) };

const underTimeline: Timeline = {
  duration_s: 2,
  width: 1080,
  height: 1920,
  fps: 30,
  scenes: [
    { id: 's1', start_s: 0, end_s: 1 },
    { id: 's2', start_s: 1, end_s: 2 },
  ],
  speech: [
    { scene_id: 's1', text: 'Hello there', start_s: 0.1, end_s: 0.9, words: [{ text: 'Hello', start_s: 0.1, end_s: 0.4 }, { text: 'there', start_s: 0.5, end_s: 0.9 }] },
    { scene_id: 's2', text: 'Bye', start_s: 1.1, end_s: 1.6 },
  ],
  end_card: { start_s: 1.5, end_s: 2 },
  safe_zones: [{ use: 'captions', x: 108, y: 1400, w: 864, h: 200 }],
};

describe('quiet bands', () => {
  /** A grey picture that is busy everywhere except a flat band from `flat0` to `flat1` (fractions). */
  function picture(width: number, height: number, flat0: number, flat1: number): Uint8Array {
    const gray = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const flat = y >= flat0 * height && y < flat1 * height;
        gray[y * width + x] = flat ? 128 : (x * 37 + y * 91) % 2 ? 250 : 10;
      }
    }
    return gray;
  }

  it('finds the emptiest band inside 0.15 to 0.85', () => {
    const band = quietBandOf(picture(96, 170, 0.3, 0.5), 96, 170);
    expect(band.y0).toBeGreaterThanOrEqual(0.3);
    expect(band.y1).toBeLessThanOrEqual(0.5 + 1 / 170);
    expect(band.y1 - band.y0).toBeCloseTo(0.15, 1);
  });

  it('never leaves the safe band, even when the flat part is at the very top', () => {
    const band = quietBandOf(picture(96, 170, 0, 0.12), 96, 170);
    expect(band.y0).toBeGreaterThanOrEqual(0.15);
    expect(band.y1).toBeLessThanOrEqual(0.85);
  });

  it('prefers the lower band when the picture is flat everywhere', () => {
    const band = quietBandOf(new Uint8Array(96 * 170).fill(90), 96, 170);
    expect(band.y1).toBeCloseTo(0.85, 1);
  });
});

describe('scene times from the video drawn over', () => {
  it('pairs scenes by id, in any order', () => {
    const timeline = { scenes: [{ id: 'b', start_s: 1, end_s: 2.5 }, { id: 'a', start_s: 0, end_s: 1 }] };
    expect(underSceneFrames(['a', 'b'], timeline, 30, 75)).toEqual([0, 30, 75]);
  });

  it('pairs scenes in order when the ids differ but the counts match', () => {
    const timeline = { scenes: [{ id: 'cut-1', start_s: 0, end_s: 0.5 }, { id: 'cut-2', start_s: 0.5, end_s: 2 }] };
    expect(underSceneFrames(['s1', 's2'], timeline, 30, 60)).toEqual([0, 15, 60]);
  });

  it('gives up when the scenes cannot be paired', () => {
    const timeline = { scenes: [{ id: 'cut-1', start_s: 0, end_s: 2 }] };
    expect(underSceneFrames(['s1', 's2'], timeline, 30, 60)).toBeNull();
  });
});

describe('the timeline of a video drawn over', () => {
  it('carries speech, the end card and zones through, moved to the new picture and cut to the new length', () => {
    const out = passThroughTimeline(underTimeline, { duration_s: 1.8, width: 720, height: 1280, fps: 30 });
    expect(out).toMatchObject({ duration_s: 1.8, width: 720, height: 1280, fps: 30 });
    expect(out.scenes).toEqual([{ id: 's1', start_s: 0, end_s: 1 }, { id: 's2', start_s: 1, end_s: 1.8 }]);
    expect(out.speech).toEqual(underTimeline.speech);
    expect(out.end_card).toEqual({ start_s: 1.5, end_s: 1.8 });
    expect(out.safe_zones).toEqual([{ use: 'captions', x: 72, y: 933, w: 576, h: 133 }]);
  });

  it('crops zones when the video is a different shape from the page', () => {
    // A 16:9 video covers a 9:16 page: scaled to 1280 high, the middle 720 kept.
    const wide = { ...underTimeline, width: 1920, height: 1080, safe_zones: [{ use: 'logo' as const, x: 0, y: 0, w: 200, h: 100 }, { use: 'captions' as const, x: 900, y: 900, w: 120, h: 100 }] };
    const out = passThroughTimeline(wide, { duration_s: 2, width: 720, height: 1280, fps: 30 });
    // The logo sat outside the kept middle; the captions zone is moved into it.
    expect(out.safe_zones).toEqual([{ use: 'captions', x: 289, y: 1067, w: 142, h: 119 }]);
  });
});

describe('the last pass', () => {
  const tools = { encodeArgs: () => ['-c:v', 'libx264'] };
  const base = { tools, under: '/u.mp4', list: '/l.txt', size: { width: 720, height: 1280 }, fps: 30, frames: 60, out: '/o.mp4' };

  it("keeps the video's sound when it has some", () => {
    const args = compositeArgs({ ...base, hasAudio: true });
    expect(args.join(' ')).toContain('-map 0:a:0');
    expect(args.join(' ')).toContain('-t 2.000000');
    expect(args).not.toContain('-an');
  });

  it('is silent when the video is', () => {
    const args = compositeArgs({ ...base, hasAudio: false });
    expect(args.join(' ')).not.toContain('0:a');
    expect(args).toContain('-an');
  });
});

describe('under inputs', () => {
  let root: string;
  let under: ReturnType<typeof fileRef>;
  let template: ReturnType<typeof fileRef>;
  beforeAll(() => {
    root = temp();
    writeFileSync(path.join(root, 'under.mp4'), 'not really a video');
    writeFileSync(path.join(root, 'page.html'), '<!doctype html><body></body>');
    under = fileRef(path.join(root, 'under.mp4'));
    template = fileRef(path.join(root, 'page.html'));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const measured = { under: { seconds: 2, width: 720, height: 1280, fps: 30, hasAudio: true } };
  const base = () => ({ template, scenes: [{ id: 's1' }, { id: 's2' }], aspect: '9:16', max_words: 8, under, under_timeline: underTimeline });

  it("takes the video's length, frame rate and scene times", () => {
    const spec = readInputs(base(), errorCtx, measured);
    expect([spec.frameCount, spec.fps, spec.sceneFrames]).toEqual([60, 30, [0, 30, 60]]);
    expect(spec.under?.file.sha256).toBe(under.sha256);
  });

  it('refuses another length beside the video', () => {
    expect(() => readInputs({ ...base(), duration_s: 2 }, errorCtx, measured)).toThrow(/bad_input/);
  });

  it('refuses a video without its timeline, and a timeline without its video', () => {
    const { under_timeline: _timeline, ...noTimeline } = base();
    expect(() => readInputs(noTimeline, errorCtx, measured)).toThrow(/bad_input/);
    const { under: _video, ...noVideo } = base();
    expect(() => readInputs({ ...noVideo, duration_s: 2 }, errorCtx, measured)).toThrow(/bad_input/);
  });

  it('refuses plan scenes that do not match the video', () => {
    expect(() => readInputs({ ...base(), scenes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, errorCtx, measured)).toThrow(/do not match/);
  });

  it('refuses a video it could not read', () => {
    expect(() => readInputs(base(), errorCtx, { under: null })).toThrow(/could not be read/);
  });
});

describeMedia('drawing a page over a video', () => {
  const isRed = ([r, g, b]: number[]) => r > 200 && g < 70 && b < 70;
  const isGrey = ([r, g, b]: number[]) => Math.abs(r - g) < 40 && Math.abs(g - b) < 40 && r > 20 && r < 235;
  // Not the page's red and not a white page background: the video shows through.
  const isVideo = ([r, g, b]: number[]) => !isRed([r, g, b]) && !(r > 245 && g > 245 && b > 245);

  it("lays the transparent page over the video, keeps its sound and places a box in each scene's quiet band", async () => {
    const root = temp();
    try {
      // Busy noise everywhere except a flat grey band from 0.60 to 0.80 of the height, with a tone.
      const underFile = path.join(root, 'under.mp4');
      runFfmpeg([
        '-y',
        '-f', 'lavfi', '-i', 'color=c=gray:s=720x1280:r=30:d=2,noise=c0s=100:allf=t,drawbox=x=0:y=ih*0.6:w=iw:h=ih*0.2:color=0x808080:t=fill',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', underFile,
      ]);
      writeFileSync(
        path.join(root, 'page.html'),
        `<!doctype html><html><head><style>html,body{margin:0;background:transparent}#b{position:absolute;left:100px;width:300px;background:#f00}</style></head>
<body><div id="b"></div><script>
kit.render(function (t, frame) {
  var q = kit.under.quiet_band[frame.scene.index];
  var b = document.getElementById('b');
  b.style.top = (q.y0 * kit.height) + 'px';
  b.style.height = ((q.y1 - q.y0) * kit.height) + 'px';
});
</script></body></html>`,
      );
      const { ctx } = partContext(root);
      const made = await makeVideo(
        {
          template: fileRef(path.join(root, 'page.html')),
          scenes: [{ id: 's1', on_screen: 'one' }, { id: 's2', on_screen: 'two' }],
          aspect: '9:16',
          max_words: 8,
          short_side: 720,
          under: fileRef(underFile),
          under_timeline: underTimeline,
        },
        ctx,
      );
      expect(made.seconds).toBeCloseTo(2, 5);
      expect(made.frameHashes).toHaveLength(60);
      expect(made.timeline).toMatchObject({ duration_s: 2, width: 720, height: 1280, fps: 30, end_card: { start_s: 1.5, end_s: 2 } });
      expect(made.timeline.speech).toEqual(underTimeline.speech);
      expect(made.timeline.scenes).toEqual(underTimeline.scenes);
      expect(made.timeline.safe_zones).toEqual([{ use: 'captions', x: 72, y: 933, w: 576, h: 133 }]);

      const info = await ctx.tools.probe(made.video.path);
      expect(info).toMatchObject({ has_video: true, video_codec: 'h264', has_audio: true, width: 720, height: 1280 });
      const audio = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', made.video.path], { encoding: 'utf8' });
      expect(audio.stdout.trim()).toBe('aac');
      expect(info.duration_s).toBeCloseTo(2, 1);

      // Mid-way through scene 2: the red box sits in the flat band; elsewhere the video shows through.
      const still = path.join(root, 'still.png');
      runFfmpeg(['-y', '-ss', '1.5', '-i', made.video.path, '-frames:v', '1', still]);
      expect(isRed(pixelAt(still, 250, Math.round(1280 * 0.7)))).toBe(true);
      expect(isGrey(pixelAt(still, 600, Math.round(1280 * 0.7)))).toBe(true);
      expect(isVideo(pixelAt(still, 250, Math.round(1280 * 0.3)))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});
