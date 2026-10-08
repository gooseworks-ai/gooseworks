// Rule: the kit core knows nothing about any one style (part-interface.md
// section 8). No style ids, part ids, model ids, provider payload fields or
// sound targets in src/kit/core or src/kit/line: those live in parts, layers
// and style files.
import { readdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';

const ROOTS = ['src/kit/core', 'src/kit/line'].map((p) => path.join(__dirname, '..', '..', p));

const FORBIDDEN: Array<[string, RegExp]> = [
  ['a style id', /search-grid|photo-grid|logo-equation|phone-chat|imessage|apple-notes|street-interview|podcast-skit|vignette|split-screen|kinetic-typ/i],
  ['a part id', /html-frames|audio-mix|music-elevenlabs|voice-elevenlabs|(brand|captions|sound|check)-layer|end-card|overlay-creator|broll-pexels/i],
  ['a model id', /fal-ai\/|kling|\bveo\b|seedance|nano-banana|gpt-image|eleven_[a-z0-9]|\bflux\b|birefnet|lipsync|creator-h3|whisper-1/i],
  ['a provider payload field or route', /\bprompt\b|image_url|audio_url|voice_id|model_id|text-to-speech|with-timestamps|\/v1\/music/i],
  ['a sound or check target', /LUFS|dBTP|loudnorm|ebur128|-14\b/],
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sources(full) : /\.ts$/.test(name) ? [full] : [];
  });
}

describe('the kit core is style-free', () => {
  const files = ROOTS.flatMap(sources);

  it('has core files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN)('names no %s', (_what, pattern) => {
    const hits = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${path.relative(path.join(__dirname, '..', '..'), file)}:${i + 1}` }))
        .filter(({ line }) => pattern.test(line))
        .map(({ at, line }) => `${at}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });
});
