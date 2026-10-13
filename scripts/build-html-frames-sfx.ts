// Makes html-frames 1.2.1's bundled UI sounds (assets/sfx/<name>.wav) with
// ffmpeg's aevalsrc: decaying sine partials and filtered noise, our own
// synthesis, so no licence applies. tick, chime, pop and whoosh follow the
// airdrop-notification-carousel recipe's synth_audio tones; click follows the
// day-in-the-life-variant-swap recipe's snap click. Each file is 48 kHz mono
// 16-bit PCM and starts on its sound (no leading silence). Levels keep the
// recipe's balance: the chime peaks near 0.85, as the recipe's mix did.
//
//   npx tsx scripts/build-html-frames-sfx.ts           writes the bank
//   npx tsx scripts/build-html-frames-sfx.ts --print   prints each sound's length and peak
//
// The files are committed; run this only to change a sound (as a new part
// version: a published version's files never change).
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import * as path from 'path';
import { CUE_SOUNDS, readWav, type CueSound } from '../src/kit/maker/cues';

const OUT = path.join(__dirname, '..', 'src', 'kit', 'maker', 'parts', 'html-frames', '1.2.1', 'assets', 'sfx');

/** The recipe's levels, scaled so the chime peaks near 0.85 as the recipe's normalised mix did. */
const K = 1.5;

/** A decaying sine partial: frequency, length, amplitude, decay constant, start offset (all seconds). */
function partial(hz: number, length: number, amp: number, decay: number, offset = 0): string {
  const t = offset ? `(t-${offset})` : 't';
  return `${amp * K}*sin(2*PI*${hz}*${t})*exp(-${t}/${decay})*between(t,${offset},${offset + length})`;
}

/** Deterministic white noise in -1..1 from the sample number (no random state). */
const NOISE = '(2*mod(sin(n*12.9898)*43758.5453,1)-1)';

interface Recipe {
  seconds: number;
  expr: string;
  /** Filters after the source (noise shaping). */
  filters?: string;
  /** For noise sounds: the peak the result is scaled to. */
  peak?: number;
}

const RECIPES: Record<CueSound, Recipe> = {
  // A light tick for each swap: 2650 Hz + 3500 Hz, 50 ms.
  tick: { seconds: 0.05, expr: [partial(2650, 0.05, 0.14, 0.02), partial(3500, 0.035, 0.06, 0.015)].join('+') },
  // A soft finger tap: a short 1200 Hz knock over a low thump.
  tap: { seconds: 0.06, expr: [partial(1200, 0.06, 0.18, 0.008), partial(180, 0.06, 0.1, 0.02)].join('+') },
  // The tap pop: a 2400 Hz click, then 760 Hz + 1140 Hz from 20 ms.
  pop: { seconds: 0.18, expr: [partial(2400, 0.05, 0.16, 0.02), partial(760, 0.16, 0.12, 0.09, 0.02), partial(1140, 0.16, 0.07, 0.09, 0.02)].join('+') },
  // The landing chime: 1319 Hz + 1976 Hz + 2637 Hz, ringing out over 0.7 s.
  chime: { seconds: 0.7, expr: [partial(1319, 0.7, 0.34, 0.34), partial(1976, 0.6, 0.16, 0.28), partial(2637, 0.4, 0.07, 0.2)].join('+') },
  // The card's entrance: noise under a sin² swell, low-passed (the recipe's 80-tap box filter), 0.55 s.
  whoosh: { seconds: 0.55, expr: `${NOISE}*pow(sin(PI*t/0.55),2)`, filters: 'lowpass=f=700,lowpass=f=700', peak: 0.2 },
  // A quicker, brighter pass: band-passed noise under a sin² swell, 0.3 s.
  swoosh: { seconds: 0.3, expr: `${NOISE}*pow(sin(PI*t/0.3),2)`, filters: 'highpass=f=900,lowpass=f=4500', peak: 0.18 },
  // A two-note notification ding: 1568 Hz, then 2093 Hz + 3136 Hz from 110 ms.
  notify: { seconds: 0.46, expr: [partial(1568, 0.25, 0.22, 0.12), partial(2093, 0.35, 0.22, 0.15, 0.11), partial(3136, 0.3, 0.05, 0.1, 0.11)].join('+') },
  // The snap click: 1800 Hz decaying over 220 Hz at 0.4 of its level, 0.12 s.
  click: { seconds: 0.12, expr: [partial(1800, 0.12, 0.3, 0.015), partial(220, 0.12, 0.12, 0.03)].join('+') },
};

function ffmpeg(args: string[]): string {
  const r = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed: ${r.stderr}`);
  return r.stderr;
}

function peakOf(file: string): number {
  const pcm = readWav(readFileSync(file));
  if (!pcm) throw new Error(`${file} is not 16-bit PCM`);
  let peak = 0;
  for (const channel of pcm.channels) for (const v of channel) peak = Math.max(peak, Math.abs(v));
  return peak;
}

function write(name: CueSound, recipe: Recipe, gain = 1): string {
  const file = path.join(OUT, `${name}.wav`);
  const filters = [recipe.filters, gain !== 1 ? `volume=${gain.toFixed(6)}` : null].filter(Boolean).join(',');
  ffmpeg([
    '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `aevalsrc=exprs='${recipe.expr}':s=48000:c=mono:d=${recipe.seconds}`,
    ...(filters ? ['-af', filters] : []),
    '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le',
    '-fflags', '+bitexact', '-flags', '+bitexact', '-map_metadata', '-1',
    file,
  ]);
  return file;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const print = process.argv.includes('--print');
  for (const name of CUE_SOUNDS) {
    const recipe = RECIPES[name];
    let file = write(name, recipe);
    // Noise has no set level: measure it once and scale it to its peak.
    if (recipe.peak) file = write(name, recipe, recipe.peak / peakOf(file));
    if (print) console.log(`${name}: ${recipe.seconds}s, peak ${peakOf(file).toFixed(3)}`);
    else console.log(`wrote ${path.relative(process.cwd(), file)}`);
  }
}

main();
