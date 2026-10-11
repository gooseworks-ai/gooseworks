// Small ffmpeg helpers for the try-style stand-ins. They run the kit's own
// ffmpeg build (the one the parts run), never a shell.
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';

export interface Ffmpeg {
  ffmpeg: string;
  ffprobe: string;
  /** Whether this build has drawtext (freetype). Without it the stand-ins carry no words. */
  drawtext: boolean;
  /** A font file drawtext can use, when one was found. */
  font: string | null;
}

export function run(bin: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '' } });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err = (err + d).slice(-8000)));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

export async function ff(tools: Ffmpeg, args: string[]): Promise<void> {
  const r = await run(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  if (r.code !== 0) throw new Error(`ffmpeg failed: ${r.err.trim().split('\n').slice(-3).join(' | ')}`);
}

export async function probe(tools: Ffmpeg, file: string): Promise<{ duration_s: number; width?: number; height?: number }> {
  const r = await run(tools.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', file]);
  if (r.code !== 0) throw new Error(`ffprobe failed on ${file}`);
  const json = JSON.parse(r.out) as { format?: { duration?: string }; streams?: Array<{ width?: number; height?: number }> };
  const video = (json.streams ?? []).find((s) => s.width && s.height);
  return { duration_s: Number(json.format?.duration ?? 0) || 0, width: video?.width, height: video?.height };
}

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Helvetica.ttc',
  '/Library/Fonts/Arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
];

export async function ffmpegFor(ffmpeg: string, ffprobe: string): Promise<Ffmpeg> {
  const filters = await run(ffmpeg, ['-hide_banner', '-filters']);
  const drawtext = /\sdrawtext\s/.test(filters.out);
  const font = FONT_CANDIDATES.find((f) => existsSync(f)) ?? null;
  return { ffmpeg, ffprobe, drawtext: drawtext && !!font, font };
}

/** Text safe inside a drawtext `text='…'` option. */
export function drawtextSafe(text: string): string {
  return text
    .replace(/[^A-Za-z0-9 .,!?@#%&()+=/_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

export function drawtext(tools: Ffmpeg, text: string, y: string, size: number): string | null {
  if (!tools.drawtext || !tools.font) return null;
  const safe = drawtextSafe(text);
  if (!safe) return null;
  return `drawtext=fontfile='${tools.font}':text='${safe}':fontcolor=black:fontsize=${size}:box=1:boxcolor=white@0.75:boxborderw=12:x=(w-text_w)/2:y=${y}`;
}

const BRIGHT = ['#f4d35e', '#9bdeac', '#8ecae6', '#ffb4a2', '#cdb4db', '#f7a072', '#b8f2e6', '#ffd6a5'];

/** A bright colour picked by the text, so the same prompt always looks the same. */
export function brightFor(text: string): string {
  const n = createHash('sha256').update(text).digest()[0];
  return BRIGHT[n % BRIGHT.length];
}

/** Even sizes ffmpeg's encoders accept. */
export function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}
