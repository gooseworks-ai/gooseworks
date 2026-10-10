// A part's own words reach the card only as plain sentences.
import { plainWords } from '../../src/kit/core/plain-words';

const FALLBACK = 'The video didn’t pass the final check.';

describe('plain words from a part', () => {
  it('keeps plain sentences as they are', () => {
    expect(plainWords('The video has no sound.', FALLBACK)).toBe('The video has no sound.');
    expect(plainWords('The captions run past the end', FALLBACK)).toBe('The captions run past the end.');
  });

  it('drops a sentence with a path, a file name or a tool’s output, and keeps the rest', () => {
    expect(plainWords('The video is too short. Read /Users/someone/.gooseworks/videos/vid_1/final/final.mp4 to see.', FALLBACK)).toBe('The video is too short.');
    expect(plainWords('The sound is too quiet. Checked out.wav at -40 dB.', FALLBACK)).toBe('The sound is too quiet.');
  });

  it('gives the fallback for a relative path, a slash or a file extension of any kind', () => {
    expect(plainWords('The logo is missing from assets/logo.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('The logo is missing from assets\\logo.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('Use a picture or/and a line.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('The logo in logo.heic can’t be read.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('The scene-2.clip file is empty.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('Only .webp pictures can be used.', FALLBACK)).toBe(FALLBACK);
  });

  it.each([
    'Invalid data found when processing input',
    'Error while decoding stream #0:0',
    'Conversion failed!',
    'No such file or directory',
    'moov atom not found',
    'Could not find codec parameters for the picture',
    'Error opening input',
    'Output file is empty, nothing was encoded',
  ])('gives the fallback for the tool diagnostic %p without a tool name', (diagnostic) => {
    expect(plainWords(diagnostic, FALLBACK)).toBe(FALLBACK);
  });

  it('gives the fallback for a tool diagnostic', () => {
    expect(plainWords('[matroska,webm @ 0x792ac40000] File ended prematurely', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('ffmpeg exited with 1: Invalid data found when processing input', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('TypeError: Cannot read properties of undefined (reading "pts")\n    at check (/parts/check-layer/1.0.0/part.mjs:12:7)', FALLBACK)).toBe(FALLBACK);
  });

  it('gives the fallback when the plain part is the smaller part', () => {
    expect(plainWords('Bad. stream #0:1 codec aac has pts gaps; demuxer reported 14 errors; dts out of order in muxer queue', FALLBACK)).toBe(FALLBACK);
  });

  it('keeps part and step ids out', () => {
    expect(plainWords('layer-sound made no audio.', FALLBACK, ['layer-sound'])).toBe(FALLBACK);
    expect(plainWords('check-layer@1.0.0 found silence.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('loudness_lufs is below the floor.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('brand.cta should be an object.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('scenes.0.line is too long.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('scenes[0].line is too long.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('products[1].images[2] is too small.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('Scenes.0 has no line.', FALLBACK)).toBe(FALLBACK);
    expect(plainWords('Step clips refused the label.', FALLBACK, ['clips'])).toBe(FALLBACK);
    expect(plainWords('Clips refused the label.', FALLBACK, ['clips'])).toBe(FALLBACK);
    expect(plainWords('The cuts are too short.', FALLBACK, ['cut'])).toBe('The cuts are too short.');
  });

  it('caps the words at 200 characters, at a sentence', () => {
    const long = `${'The picture is too dark in places. '.repeat(10)}`;
    const out = plainWords(long, FALLBACK);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toMatch(/places\.$/);
    expect(plainWords('a'.repeat(250), FALLBACK)).toBe(FALLBACK);
  });
});
