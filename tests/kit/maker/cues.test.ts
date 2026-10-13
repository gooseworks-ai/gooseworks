// html-frames 1.2.0 sound cues: the page marks UI sounds with kit.cue before it
// is ready; the maker lays each at the first frame drawn at or after its time,
// from the bundled bank, and adds the mix as an AAC track. A page with no
// cues stays silent.
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CUE_CEILING, CUE_RATE, CUE_SOUNDS, bankSound, cuesOf, frameSample, mixCues, readWav, wavBytes, type Cue, type CueSound } from '../../../src/kit/maker/cues';
import { makeVideo } from '../../../src/kit/maker/make';
import { runtimeScript } from '../../../src/kit/maker/runtime';
import { describeMedia, fileRef, partContext, runFfmpeg } from './helpers';

const PART_DIR = path.join(__dirname, '..', '..', '..', 'src', 'kit', 'maker', 'parts', 'html-frames', '1.2.1');
const temp = () => mkdtempSync(path.join(os.tmpdir(), 'hf12-cues-'));

const cue = (sound: CueSound, at_s: number, extra: Partial<Cue> = {}): Cue => ({ sound, at_s, gain: 1, max_s: null, ...extra });

describe('the bundled sound bank', () => {
  const manifest = JSON.parse(readFileSync(path.join(PART_DIR, 'part.json'), 'utf8')) as { files: string[]; needs: { ffmpeg: { encoders: string[] } } };

  it.each([...CUE_SOUNDS])('%s is 48 kHz mono 16-bit PCM, starts on its sound and is listed in part.json', (name) => {
    const pcm = readWav(readFileSync(path.join(PART_DIR, 'assets', 'sfx', `${name}.wav`)));
    expect(pcm).not.toBeNull();
    expect([pcm!.rate, pcm!.channels.length]).toEqual([CUE_RATE, 1]);
    const sound = bankSound(pcm!);
    let peak = 0;
    for (const v of sound) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(CUE_CEILING);
    // Leading silence is at most 15 ms (the swells start soft; the tones start at once).
    expect(pcm!.channels[0].length - sound.length).toBeLessThan(0.015 * CUE_RATE);
    expect(manifest.files).toContain(`assets/sfx/${name}.wav`);
  });

  it('names pcm_s16le, which the bed of a video drawn over is read with', () => {
    expect(manifest.needs.ffmpeg.encoders).toEqual(expect.arrayContaining(['aac', 'pcm_s16le']));
  });
});

describe('mixing cues', () => {
  const click = new Float32Array([0.5, 0.25, 0.25, 0.25]);
  const bank = new Map<CueSound, Float32Array>([['tick', click]]);

  it('lays each cue at the first frame drawn at or after its time', () => {
    const { channels, placed } = mixCues({ cues: [cue('tick', 0.1), cue('tick', 0.51), cue('tick', 0)], bank, fps: 30, frames: 30 });
    // 0.1 s is frame 3 exactly; 0.51 s first shows on frame 16 (0.5333 s).
    expect(placed.map((p) => [p.frame, p.sample])).toEqual([[3, 4800], [16, 25600], [0, 0]]);
    expect(channels[0].length).toBe(CUE_RATE);
    expect(channels[0][4800]).toBeCloseTo(0.5, 6);
    expect(channels[1][25600]).toBeCloseTo(0.5, 6);
    expect(channels[0][4799]).toBe(0);
    expect(channels[0][25599]).toBe(0);
  });

  it('applies gain, cuts at max_s with a fade, and cuts at the end of the video', () => {
    const long = new Float32Array(CUE_RATE).fill(0.25);
    const { channels } = mixCues({ cues: [cue('chime', 0, { gain: 2, max_s: 0.1 }), cue('chime', 0.9)], bank: new Map([['chime', long]]), fps: 30, frames: 30 });
    expect(channels[0][0]).toBeCloseTo(0.5, 6);
    expect(channels[0][Math.round(0.1 * CUE_RATE) - 1]).toBeLessThan(0.5);
    expect(channels[0][Math.round(0.1 * CUE_RATE)]).toBe(0);
    expect(channels[0][frameSample(27, 30)]).toBeCloseTo(0.25, 6);
    expect(channels[0].length).toBe(CUE_RATE);
  });

  it('turns a mix that would peak above -1 dBFS down as a whole', () => {
    const loud = new Float32Array([0.6, 0.3]);
    const { channels, gain } = mixCues({ cues: [cue('pop', 0), cue('pop', 0)], bank: new Map([['pop', loud]]), fps: 30, frames: 3 });
    expect(gain).toBeCloseTo(CUE_CEILING / 1.2, 6);
    expect(channels[0][0]).toBeCloseTo(CUE_CEILING, 5);
    expect(channels[0][1]).toBeCloseTo(CUE_CEILING / 2, 5);
  });

  it('mixes over a bed', () => {
    const bed = [new Float32Array(CUE_RATE).fill(0.1), new Float32Array(CUE_RATE).fill(-0.1)];
    const { channels } = mixCues({ cues: [cue('tick', 0.5)], bank, fps: 30, frames: 30, bed });
    expect(channels[0][0]).toBeCloseTo(0.1, 6);
    expect(channels[1][0]).toBeCloseTo(-0.1, 6);
    expect(channels[0][24000]).toBeCloseTo(0.6, 6);
    expect(channels[1][24000]).toBeCloseTo(0.4, 6);
  });

  it('strips leading silence from a bank sound', () => {
    const pcm = { rate: CUE_RATE, channels: [new Float32Array([0, 0.0001, 0, 0.3, 0.1])] };
    expect([...bankSound(pcm)]).toEqual([expect.closeTo(0.3, 6), expect.closeTo(0.1, 6)]);
  });

  it('writes and reads 16-bit WAV', () => {
    const back = readWav(wavBytes([new Float32Array([0, 0.5, -0.5]), new Float32Array([1, -1, 0.25])]));
    expect(back?.rate).toBe(CUE_RATE);
    expect([...back!.channels[0]].map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0.5, -0.5]);
    expect([...back!.channels[1]].map((v) => Math.round(v * 1000) / 1000)).toEqual([1, -1, 0.25]);
  });

  it("keeps only well-formed cues from the page's report", () => {
    const cues = cuesOf({ cues: [{ sound: 'tick', at_s: 0.2, gain: 0.5, max_s: null }, { sound: 'boing', at_s: 1 }, { sound: 'pop', at_s: -1 }, null] });
    expect(cues).toEqual([cue('tick', 0.2, { gain: 0.5 })]);
    expect(cuesOf({})).toEqual([]);
  });

  it("puts the bank's names in the page runtime", () => {
    expect(runtimeScript({})).toContain(`var SOUNDS = ${JSON.stringify(CUE_SOUNDS)};`);
  });
});

/** The output's sound, decoded to mono 48 kHz floats. */
function decodedAudio(video: string): Float32Array {
  const raw = runFfmpeg(['-i', video, '-map', '0:a:0', '-ac', '1', '-ar', String(CUE_RATE), '-f', 's16le', '-']);
  const out = new Float32Array(raw.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = raw.readInt16LE(i * 2) / 32768;
  return out;
}

/** The first sample at or after `from` louder than `level`. */
function onset(samples: Float32Array, from: number, level: number): number {
  for (let i = Math.max(0, from); i < samples.length; i++) if (Math.abs(samples[i]) > level) return i;
  return -1;
}

/** The codec of each sound stream, as ffprobe reads it. */
function audioCodecs(video: string): string[] {
  const r = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video], { encoding: 'utf8' });
  return r.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

const PAGE = (script: string) => `<!doctype html><html><head><style>html,body{margin:0;background:#fff}#b{position:absolute;inset:0}</style></head>
<body><div id="b"></div><script>
${script}
kit.render(function (t) { document.getElementById('b').style.background = t < 0.5 ? '#123456' : '#654321'; });
</script></body></html>`;

describeMedia('sound cues in a rendered video', () => {
  async function render(root: string, script: string, extra: Record<string, unknown> = {}) {
    writeFileSync(path.join(root, 'page.html'), PAGE(script));
    const { ctx } = partContext(root);
    return {
      ctx,
      made: await makeVideo(
        { template: fileRef(path.join(root, 'page.html')), scenes: [{ id: 's1', on_screen: 'one' }], aspect: '9:16', max_words: 8, short_side: 720, duration_s: 2, ...extra },
        ctx,
      ),
    };
  }

  it('adds an AAC track with every cue starting on its frame', async () => {
    const root = temp();
    try {
      // Cues marked inside kit.ready, at times on and between frames.
      const times = [0.1, 0.51, 1.0, 1.37];
      const { ctx, made } = await render(
        root,
        `kit.ready(Promise.resolve().then(function () {
  [${times.join(',')}].forEach(function (t) { kit.cue('tick', t); });
  kit.cue('chime', 1.7, { gain: 0.5, max_s: 0.2 });
}));`,
      );
      const info = await ctx.tools.probe(made.video.path);
      expect(info).toMatchObject({ has_video: true, video_codec: 'h264', has_audio: true, width: 720, height: 1280 });
      expect(info.duration_s).toBeCloseTo(2, 1);
      expect(made.frameHashes).toHaveLength(60);
      expect(audioCodecs(made.video.path)).toEqual(['aac']);

      const audio = decodedAudio(made.video.path);
      const tick = bankSound(readWav(readFileSync(path.join(PART_DIR, 'assets', 'sfx', 'tick.wav')))!);
      let tickPeak = 0;
      for (const v of tick) tickPeak = Math.max(tickPeak, Math.abs(v));
      // Each tick starts on the first frame drawn at or after its time, within 2 ms (AAC smears a transient a little).
      const frames = times.map((t) => Math.ceil(t * 30 - 1e-6));
      expect(frames).toEqual([3, 16, 30, 42]);
      for (const frame of frames) {
        const expected = frameSample(frame, 30);
        const found = onset(audio, expected - Math.round(0.02 * CUE_RATE), tickPeak * 0.3);
        expect(Math.abs(found - expected)).toBeLessThanOrEqual(Math.round(0.002 * CUE_RATE));
      }
      // Silence between cues: nothing before the first tick, nothing in the gap after the second.
      let before = 0;
      for (let i = 0; i < frameSample(3, 30) - 0.01 * CUE_RATE; i++) before = Math.max(before, Math.abs(audio[i]));
      expect(before).toBeLessThan(0.01);
      // The chime at 1.7 s (frame 51), cut to 0.2 s: sound there, silence by 1.95 s.
      expect(onset(audio, frameSample(51, 30) - 0.02 * CUE_RATE, 0.05)).toBeGreaterThanOrEqual(frameSample(51, 30) - 0.002 * CUE_RATE);
      let after = 0;
      for (let i = Math.round(1.95 * CUE_RATE); i < audio.length; i++) after = Math.max(after, Math.abs(audio[i]));
      expect(after).toBeLessThan(0.01);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);

  it('stays silent with no cues', async () => {
    const root = temp();
    try {
      const { ctx, made } = await render(root, '');
      const info = await ctx.tools.probe(made.video.path);
      expect(info).toMatchObject({ has_video: true, has_audio: false });
      expect(audioCodecs(made.video.path)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);

  it('makes the same bytes twice', async () => {
    const a = temp();
    const b = temp();
    try {
      const script = "kit.cue('pop', 0.4); kit.cue('whoosh', 0);";
      const first = await render(a, script);
      const second = await render(b, script);
      expect(first.made.video.sha256).toBe(second.made.video.sha256);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  }, 240_000);

  it.each([
    ['an unknown sound', "kit.cue('boing', 0.5);", /the sound "boing"/],
    ['a time outside the video', "kit.cue('tick', 2.5);", /outside the video/],
    ['a bad gain', "kit.cue('tick', 0.5, { gain: 9 });", /gain outside/],
    ['a cue marked while drawing', "kit.render(function (t) { if (t > 1) kit.cue('tick', 1.5); });", /after it got ready/],
  ])('refuses %s', async (_what, script, words) => {
    const root = temp();
    try {
      await expect(render(root, script)).rejects.toMatchObject({ code: 'bad_input', detail: expect.stringMatching(words) });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);

  it("mixes cues over the sound of a video it draws over", async () => {
    const root = temp();
    try {
      const underFile = path.join(root, 'under.mp4');
      runFfmpeg([
        '-y',
        '-f', 'lavfi', '-i', 'color=c=gray:s=720x1280:r=30:d=2',
        '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2,volume=0.8',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', underFile,
      ]);
      const underTimeline = { duration_s: 2, width: 720, height: 1280, fps: 30, scenes: [{ id: 's1', start_s: 0, end_s: 2 }], speech: [] };
      writeFileSync(path.join(root, 'page.html'), `<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body><script>kit.cue('click', 1);</script></body></html>`);
      const { ctx } = partContext(root);
      const made = await makeVideo(
        { template: fileRef(path.join(root, 'page.html')), scenes: [{ id: 's1', on_screen: 'one' }], aspect: '9:16', max_words: 8, short_side: 720, under: fileRef(underFile), under_timeline: underTimeline },
        ctx,
      );
      const audio = decodedAudio(made.video.path);
      // The bed (a quiet 220 Hz tone) plays from the start; the click lands on frame 30 above it.
      let bed = 0;
      for (let i = Math.round(0.2 * CUE_RATE); i < Math.round(0.9 * CUE_RATE); i++) bed = Math.max(bed, Math.abs(audio[i]));
      expect(bed).toBeGreaterThan(0.03);
      expect(bed).toBeLessThan(0.2);
      const found = onset(audio, Math.round(0.95 * CUE_RATE), 0.3);
      expect(Math.abs(found - frameSample(30, 30))).toBeLessThanOrEqual(Math.round(0.002 * CUE_RATE));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});
