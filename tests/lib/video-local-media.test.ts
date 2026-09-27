/** Opt-in real-media proof, run by CI with an ffmpeg build that includes libass. */
import { execFileSync } from 'child_process';
import { mkdtemp, rm, stat, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createCaptionRuntime } from '../../src/lib/video-local-runtime';

const mediaTest = process.env.VIDEO_LOCAL_MEDIA_TEST === '1' ? describe : describe.skip;

mediaTest('local captions with real FFmpeg', () => {
  let directory: string;
  beforeAll(async () => { directory = await mkdtemp(path.join(os.tmpdir(), 'goose-local-media-')); });
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it('burns an approved ASS overlay into a playable MP4 with the expected dimensions and duration', async () => {
    const runtime = createCaptionRuntime();
    await runtime.preflight();
    const source = path.join(directory, 'source.mp4');
    const ass = path.join(directory, 'captions.ass');
    const output = path.join(directory, 'captioned.mp4');
    execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=24:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source], { timeout: 60_000 });
    await writeFile(ass, `[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 240

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,32,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.20,0:00:01.80,Default,,0,0,0,,Caption proof
`);
    await runtime.render(source, ass, output);
    const result = await runtime.probe(output);
    expect(result).toMatchObject({ width: 320, height: 240 });
    expect(result.duration_s).toBeGreaterThan(1.8);
    expect(result.duration_s).toBeLessThan(2.2);
    expect((await stat(output)).size).toBeGreaterThan(1024);
  }, 90_000);
});
