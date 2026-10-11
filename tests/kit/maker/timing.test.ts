// html-frames 1.2.0 timing: scenes timed by a voice track (speech + tail_s) or
// held by their words (pace), the caption zone and end card a style asks for,
// and skip_blank, which makes nothing when no scene has text.
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readInputs, type MakerSpec } from '../../../src/kit/maker/inputs';
import { makeVideo, timelineOf } from '../../../src/kit/maker/make';
import { run } from '../../../src/kit/maker/parts/html-frames/src/part';
import { speechTimes, wordsByScene, zoneOnVideo } from '../../../src/kit/maker/timing';
import type { PartContext, Timeline } from '../../../src/kit/part-interface';
import { FIXTURES, TestPartError, describeMedia, fileRef, partContext, pixelAt, runFfmpeg } from './helpers';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'hf12-timing-'));
const errorCtx = { error: (code: string, detail?: string) => new TestPartError(code as never, detail) } as Pick<PartContext, 'error'>;
const template = fileRef(path.join(FIXTURES, 'rules', 'plain.html'));
const base = { template, aspect: '9:16', max_words: 12, fps: 30 };
const three = [
  { id: 'a', line: 'First line here', on_screen: 'One two' },
  { id: 'b', line: 'Second line', on_screen: 'One two three four five six' },
  { id: 'c', line: 'a b c', on_screen: null },
];
const voiced = [
  { scene_id: 'a', text: 'First line here', start_s: 0.2, end_s: 1.0, words: [{ text: 'First', start_s: 0.2, end_s: 0.5 }, { text: 'line', start_s: 0.5, end_s: 0.7 }, { text: 'here', start_s: 0.7, end_s: 1.0 }] },
  { scene_id: 'b', text: 'Second line', start_s: 1.2, end_s: 2.0, words: [{ text: 'Second', start_s: 1.2, end_s: 1.6 }, { text: 'line', start_s: 1.6, end_s: 2.0 }] },
  { scene_id: 'c', text: 'a b c', start_s: 2.3, end_s: 3.1 },
];
const read = (inputs: Record<string, unknown>): MakerSpec => readInputs({ ...base, scenes: three, ...inputs }, errorCtx);

describe('speech: scenes timed by a voice track', () => {
  it('starts each scene at its first entry and ends tail_s after the last one', () => {
    const spec = read({ speech: voiced, tail_s: 0.9 });
    expect(spec.frameCount).toBe(120);
    expect(spec.sceneFrames).toEqual([0, 36, 69, 120]);
    expect(spec.speech).toEqual(voiced);
    expect(spec.words.map((w) => w.map((x) => x.text))).toEqual([['First', 'line', 'here'], ['Second', 'line'], []]);
  });

  it('tail_s defaults to 0: the video ends with the last entry', () => {
    expect(read({ speech: voiced }).frameCount).toBe(93);
  });

  it('pairs entries with scenes in order when none names a scene and the counts match', () => {
    const unnamed = voiced.map(({ scene_id: _id, ...rest }) => rest);
    expect(read({ speech: unnamed, tail_s: 0.9 }).sceneFrames).toEqual([0, 36, 69, 120]);
  });

  it('refuses entries without scene ids when the counts differ', () => {
    const unnamed = voiced.slice(0, 2).map(({ scene_id: _id, ...rest }) => rest);
    expect(() => read({ speech: unnamed })).toThrow(/2 entries without scene ids, so they cannot be paired with 3 scenes/);
  });

  it('refuses an entry that names a scene the plan does not have', () => {
    expect(() => read({ speech: [...voiced, { scene_id: 'zz', text: 'x', start_s: 3.2, end_s: 3.4 }] })).toThrow(/names scene "zz"/);
  });

  it('refuses an entry that ends before it starts', () => {
    expect(() => read({ speech: [{ ...voiced[0], start_s: 1, end_s: 0.5 }, voiced[1], voiced[2]] })).toThrow(/ends \(0\.5 s\) before it starts/);
  });

  it('gives scenes with no speech the gap after the speech before them (a null-line scene)', () => {
    const scenes = [{ id: 'a', line: 'Hello' }, { id: 'b', line: null, on_screen: 'Pause' }, { id: 'c', line: 'Bye' }];
    const speech = [
      { scene_id: 'a', text: 'Hello', start_s: 0, end_s: 1 },
      { scene_id: 'c', text: 'Bye', start_s: 2, end_s: 3 },
    ];
    const spec = readInputs({ ...base, scenes, speech }, errorCtx);
    expect(spec.sceneFrames).toEqual([0, 30, 60, 90]);
  });

  it('splits one gap evenly between several silent scenes, and a silent end card takes the tail', () => {
    expect(speechTimes(['a', 'b', 'c', 'd'], [{ scene_id: 'a', text: 'x', start_s: 0, end_s: 1 }, { scene_id: 'd', text: 'y', start_s: 3, end_s: 4 }], 0)).toEqual({
      starts: [0, 1, 2, 3],
      seconds: 4,
    });
    const card = [{ id: 'a', line: 'Hi' }, { id: 'b', line: 'There' }, { id: 'end', line: null, on_screen: 'Shop now' }];
    const spec = readInputs({ ...base, scenes: card, speech: voiced.slice(0, 2).map((e, i) => ({ ...e, scene_id: card[i].id })), tail_s: 1 }, errorCtx);
    expect(spec.sceneFrames).toEqual([0, 36, 60, 90]);
  });

  it('refuses a silent last scene with no tail to stand in', () => {
    const card = [{ id: 'a', line: 'Hi' }, { id: 'b', line: 'There' }, { id: 'end', line: null, on_screen: 'Shop now' }];
    const speech = voiced.slice(0, 2).map((e, i) => ({ ...e, scene_id: card[i].id }));
    expect(() => readInputs({ ...base, scenes: card, speech }, errorCtx)).toThrow(/scene 3 \(end\) gets no time/);
  });

  it('refuses tail_s without speech, and speech next to another length', () => {
    expect(() => read({ duration_s: 3, tail_s: 1 })).toThrow(/bad_input/);
    expect(() => read({ duration_s: 3, speech: voiced })).toThrow(/exactly one allowed shape/);
  });

  it('gives words to the scene they start in, by frame', () => {
    const speech = [{ text: 'x', start_s: 0, end_s: 2, words: [{ text: 'early', start_s: 0.1, end_s: 0.2 }, { text: 'late', start_s: 1.5, end_s: 1.9 }, { text: 'after', start_s: 9, end_s: 9.5 }] }];
    expect(wordsByScene(speech, [0, 30, 60], 30).map((w) => w.map((x) => x.text))).toEqual([['early'], ['late', 'after']]);
  });
});

describe('pace: scenes held by their words', () => {
  it('holds base_s + per_word_s a word, kept to min_s and max_s, the last at least last_min_s', () => {
    // a: 1 + 2*0.5 = 2.0; b: 1 + 6*0.5 = 4.0 -> max 3; c (line, 3 words): 2.5 -> last_min 4.
    const spec = read({ pace: { base_s: 1, per_word_s: 0.5, min_s: 1.5, max_s: 3, last_min_s: 4 } });
    expect(spec.sceneFrames).toEqual([0, 60, 150, 270]);
    expect(spec.frameCount).toBe(270);
  });

  it('counts the line when a scene has no on-screen words, and min_s lifts a short scene', () => {
    const spec = readInputs({ ...base, scenes: [{ id: 'a', line: 'one two three four' }, { id: 'b', on_screen: '' }], pace: { base_s: 0, per_word_s: 0.5, min_s: 1 } }, errorCtx);
    expect(spec.sceneFrames).toEqual([0, 60, 90]);
  });

  it('refuses min_s above max_s, and a length outside 0.5 to 180 s', () => {
    expect(() => read({ pace: { base_s: 1, per_word_s: 0, min_s: 4, max_s: 2 } })).toThrow(/pace\.min_s \(4\) is more than pace\.max_s \(2\)/);
    expect(() => read({ pace: { base_s: 0, per_word_s: 0 } })).toThrow(/would be 0 seconds/);
    const wordy = ['a', 'b', 'c'].map((id) => ({ id, on_screen: 'one two three four five six seven eight nine ten' }));
    expect(() => readInputs({ ...base, scenes: wordy, pace: { base_s: 30, per_word_s: 5 } }, errorCtx)).toThrow(/would be 240 seconds; it must be 0\.5 to 180/);
  });

  it('refuses a scene whose hold rounds to no frame', () => {
    expect(() => readInputs({ ...base, fps: 2, scenes: [{ id: 'a', on_screen: 'x' }, { id: 'b', on_screen: 'y' }], pace: { base_s: 0.1, per_word_s: 0, last_min_s: 2 } }, errorCtx)).toThrow(
      /scene 1 \(a\) gets no time/,
    );
  });
});

describe('caption zone and end card on the timeline', () => {
  const spec = (inputs: Record<string, unknown>) => read({ duration_s: 3, ...inputs });

  it('reports the caption zone in video pixels, rounded inward, and the end card over the last scenes', () => {
    const s = readInputs({ ...base, scenes: three, duration_s: 3, short_side: 720, caption_zone: { x: 140, y: 1400, w: 800, h: 110 }, end_card_scenes: 1 }, errorCtx);
    const timeline = timelineOf(s, null);
    expect(timeline.safe_zones).toEqual([{ use: 'captions', x: 94, y: 934, w: 532, h: 72 }]);
    expect(timeline.end_card).toEqual({ start_s: 2, end_s: 3 });
    expect(timeline.speech).toEqual([]);
  });

  it('keeps a zone that runs off the page to the page, and refuses one wholly off it', () => {
    expect(spec({ caption_zone: { x: 900, y: 1800, w: 400, h: 400 } }).captionZone).toEqual({ x: 900, y: 1800, w: 180, h: 120 });
    expect(() => spec({ caption_zone: { x: 0, y: 2000, w: 100, h: 100 } })).toThrow(/caption_zone lies outside the 1080x1920 page/);
  });

  it('refuses a zone that rounds to no pixel of the video', () => {
    expect(() => spec({ short_side: 720, caption_zone: { x: 100.2, y: 100.2, w: 1, h: 1 } })).toThrow(/caption_zone is less than a pixel of the 720x1280 video/);
  });

  it('puts the logo first, then the caption zone; end_card_scenes 0 adds no end card', () => {
    const timeline = timelineOf(spec({ caption_zone: { x: 0, y: 0, w: 1080, h: 200 }, end_card_scenes: 0 }), { x: 10, y: 10, w: 100, h: 50 });
    expect(timeline.safe_zones?.map((z) => z.use)).toEqual(['logo', 'captions']);
    expect(timeline.end_card).toBeUndefined();
  });

  it('refuses more end card scenes than scenes', () => {
    expect(() => spec({ end_card_scenes: 4 })).toThrow(/end_card_scenes is 4, but there are only 3 scenes/);
  });

  it('over a video: the caption zone replaces its caption zones and end_card_scenes its end card', () => {
    const under: Timeline = {
      duration_s: 3,
      width: 1080,
      height: 1920,
      fps: 30,
      scenes: [{ id: 'a', start_s: 0, end_s: 1 }, { id: 'b', start_s: 1, end_s: 2 }, { id: 'c', start_s: 2, end_s: 3 }],
      speech: voiced,
      end_card: { start_s: 2.5, end_s: 3 },
      safe_zones: [{ use: 'captions', x: 0, y: 1500, w: 1080, h: 200 }, { use: 'logo', x: 10, y: 10, w: 100, h: 100 }],
    };
    const underFile = { ...fileRef(path.join(FIXTURES, 'rules', 'plain.html')), media: 'video', mime: 'video/mp4' };
    const measured = { under: { seconds: 3, width: 1080, height: 1920, fps: 30, hasAudio: false } };
    const s = readInputs(
      { template, aspect: '9:16', max_words: 12, scenes: three, under: underFile, under_timeline: under, caption_zone: { x: 100, y: 1200, w: 880, h: 100 }, end_card_scenes: 2 },
      errorCtx,
      measured,
    );
    expect(s.speech).toEqual(voiced);
    expect(s.words[1].map((w) => w.text)).toEqual(['Second', 'line']);
    const timeline = timelineOf(s, null);
    expect(timeline.safe_zones).toEqual([{ use: 'captions', x: 100, y: 1200, w: 880, h: 100 }, { use: 'logo', x: 10, y: 10, w: 100, h: 100 }]);
    expect(timeline.end_card).toEqual({ start_s: 1, end_s: 3 });
    // The video's speech carries through, cut to this video's length.
    expect(timeline.speech.map((e) => [e.scene_id, e.end_s])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('rounds a zone inward and drops one that rounds to nothing', () => {
    expect(zoneOnVideo({ x: 0.5, y: 0.5, w: 1, h: 1 }, 1, { width: 10, height: 10 })).toBeNull();
    expect(zoneOnVideo({ x: 1.2, y: 1.2, w: 3, h: 3 }, 1, { width: 10, height: 10 })).toEqual({ x: 2, y: 2, w: 2, h: 2 });
  });
});

describe('skip_blank', () => {
  const blank = [{ id: 'a', line: null, on_screen: null }, { id: 'b', line: '  ', on_screen: '' }];

  it('is on only when asked and no scene has on-screen text or a line', () => {
    expect(readInputs({ ...base, scenes: blank, duration_s: 2, skip_blank: true }, errorCtx).skip).toBe(true);
    expect(readInputs({ ...base, scenes: blank, duration_s: 2 }, errorCtx).skip).toBe(false);
    expect(readInputs({ ...base, scenes: [...blank, { id: 'c', on_screen: 'Hook' }], duration_s: 2, skip_blank: true }, errorCtx).skip).toBe(false);
    expect(readInputs({ ...base, scenes: [{ id: 'c', line: 'Spoken only' }], duration_s: 2, skip_blank: true }, errorCtx).skip).toBe(false);
  });

  it('gives no outputs at all, and never starts the browser', async () => {
    let launched = 0;
    const ctx = {
      ...errorCtx,
      tools: { exec: async () => ({ stdout: '{}', stderr: '' }) },
      log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      browser: { launch: async () => { launched++; throw new Error('the browser must not start'); } },
      signal: new AbortController().signal,
    } as unknown as PartContext;
    await expect(run({ ...base, scenes: blank, duration_s: 2, skip_blank: true }, ctx)).resolves.toEqual({});
    expect(launched).toBe(0);
    // Still checked first: a bad input is refused, not skipped.
    await expect(run({ ...base, scenes: blank, duration_s: 900, skip_blank: true }, ctx)).rejects.toMatchObject({ code: 'bad_input' });
    // makeVideo itself always means a video.
    await expect(makeVideo({ ...base, scenes: blank, duration_s: 2, skip_blank: true }, ctx as never)).rejects.toMatchObject({ code: 'bad_input' });
  });
});

describeMedia('a voice-timed page', () => {
  const isRed = ([r, g, b]: number[]) => r > 200 && g < 70 && b < 70;
  const isBlue = ([r, g, b]: number[]) => b > 200 && r < 70 && g < 70;

  it('draws each scene for its speech, gives the page kit.speech and the words, and reports the timeline', async () => {
    const root = temp();
    try {
      // Red while the page is in a scene whose words reached it, blue otherwise.
      writeFileSync(
        path.join(root, 'page.html'),
        `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%}</style></head><body><script>
kit.render(function (t, frame) {
  var i = frame.scene.index;
  var s = frame.scene.scene;
  var ok = kit.speech.length === 3 && s.words.length === [3, 2, 0][i] && (i !== 1 || s.words[0].text === 'Second');
  document.body.style.background = ok ? '#f00' : '#00f';
});
</script></body></html>`,
      );
      const { ctx } = partContext(root);
      const made = await makeVideo(
        {
          template: fileRef(path.join(root, 'page.html')),
          scenes: three,
          aspect: '9:16',
          max_words: 12,
          fps: 10,
          short_side: 720,
          speech: voiced,
          tail_s: 0.9,
          caption_zone: { x: 140, y: 1400, w: 800, h: 110 },
          end_card_scenes: 1,
        },
        ctx,
      );
      expect(made.seconds).toBeCloseTo(4, 5);
      expect(made.frameHashes).toHaveLength(40);
      expect(made.timeline.scenes).toEqual([
        { id: 'a', start_s: 0, end_s: 1.2 },
        { id: 'b', start_s: 1.2, end_s: 2.3 },
        { id: 'c', start_s: 2.3, end_s: 4 },
      ]);
      expect(made.timeline.speech).toEqual(voiced);
      expect(made.timeline.end_card).toEqual({ start_s: 2.3, end_s: 4 });
      expect(made.timeline.safe_zones).toEqual([{ use: 'captions', x: 94, y: 934, w: 532, h: 72 }]);
      for (const at of [0.5, 1.5, 3.5]) {
        const still = path.join(root, `still-${at}.png`);
        runFfmpeg(['-y', '-ss', String(at), '-i', made.video.path, '-frames:v', '1', still]);
        const pixel = pixelAt(still, 360, 640);
        expect({ at, red: isRed(pixel), blue: isBlue(pixel) }).toEqual({ at, red: true, blue: false });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});

describe('values', () => {
  it('counts the 64 KB limit in UTF-8 bytes', () => {
    // 30,000 three-byte characters: about 29 K characters but about 88 KB.
    expect(() => read({ duration_s: 3, values: { label: '語'.repeat(30_000) } })).toThrow(/values is larger than 64 KB/);
    expect(read({ duration_s: 3, values: { label: 'a'.repeat(30_000) } }).values).toEqual({ label: 'a'.repeat(30_000) });
  });
});
