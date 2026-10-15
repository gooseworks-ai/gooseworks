import { spawnSync } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { lookAtFinal } from '../../src/kit/core/eyes';
import { hashFile } from '../../src/kit/core/files';

const ffmpeg = process.env.TEST_FFMPEG || 'ffmpeg';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0;
const withFfmpeg = available ? it : it.skip;

function makeVideo(file: string, frequency?: number) {
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x288:r=12:d=2'];
  if (frequency) args.push('-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=16000:duration=2`, '-c:a', 'aac');
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file);
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'fixture could not be encoded');
}

const timeline = { duration_s: 2, width: 160, height: 288, fps: 12, scenes: [{ id: 'face', start_s: 0, end_s: 1 }, { id: 'product', start_s: 1, end_s: 2 }], speech: [{ text: 'The water cleans itself', start_s: 0, end_s: 2 }] };

withFfmpeg('extracts complete final audio and the distinct track before the sound layer without certifying speech', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-audio-'));
  try {
    const final = path.join(dir, 'final.mp4');
    const beforeSound = path.join(dir, 'before-sound.mp4');
    makeVideo(final, 880);
    makeVideo(beforeSound, 220);
    const eyes = await lookAtFinal({ ffmpeg, final, beforeSound, timeline, products: [], signal: new AbortController().signal });
    expect(eyes.output_sha256).toBe((await hashFile(final)).sha256);
    expect(eyes.coverage?.complete).toBe(true);
    expect(eyes.audio?.required).toBe(true);
    const mix = await readFile(eyes.audio!.final_mix!);
    const source = await readFile(eyes.audio!.before_sound!);
    expect(mix.subarray(0, 4).toString()).toBe('RIFF');
    expect(source.subarray(0, 4).toString()).toBe('RIFF');
    expect(mix.length).toBeGreaterThan(60_000);
    expect(mix.equals(source)).toBe(false);
    expect(eyes.audio!.windows).toContainEqual({ start_s: 0, end_s: 2, reason: 'cut' });
    expect(eyes.look_for.join(' ')).toContain('matching transcript');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);

withFfmpeg('keeps a failed audio extraction explicit when the timeline promises speech', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-no-audio-'));
  try {
    const final = path.join(dir, 'final.mp4');
    makeVideo(final);
    const eyes = await lookAtFinal({ ffmpeg, final, timeline, products: [], signal: new AbortController().signal, custom: true });
    expect(eyes.audio).toMatchObject({ required: true, final_mix: null });
    expect(eyes.warnings.some((warning) => warning.check === 'review_audio')).toBe(true);
    // A template keeps the audio required for its planned speech, but sends no review warning.
    const template = await lookAtFinal({ ffmpeg, final, timeline, products: [], signal: new AbortController().signal });
    expect(template.audio).toMatchObject({ required: true, final_mix: null });
    expect(template.warnings.some((warning) => warning.check === 'review_audio')).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
