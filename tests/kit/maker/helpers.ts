// Test support for the web video maker: a part context with the real browser
// and the real ffmpeg (no stand-ins), and files as the core hands them over.
// Tests that need Chromium or ffmpeg skip with the reason when either is missing.
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { browsersFolder, createKitBrowserSupport, findShell, pinnedShell } from '../../../src/kit/maker/browser';
import type { FileRef, KitTools, MediaInfo, MediaKind, PartContext, PartErrorCode } from '../../../src/kit/part-interface';

export const FIXTURES = path.join(__dirname, '..', '..', 'fixtures', 'kit-maker');

const MIME: Record<string, string> = {
  html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', mp4: 'video/mp4',
};

function mediaOf(mime: string): MediaKind {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('font/')) return 'font';
  if (mime === 'text/html') return 'html';
  if (mime === 'application/json') return 'json';
  return 'text';
}

/** A file as the core hands it to a part. */
export function fileRef(file: string): FileRef {
  const data = readFileSync(file);
  const mime = MIME[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
  return { kind: 'file', path: path.resolve(file), sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length, media: mediaOf(mime), mime };
}

function which(name: string): string | null {
  const r = spawnSync('which', [name], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() || null : null;
}

function findTools(): { ffmpeg: string; ffprobe: string } | string {
  const ffmpeg = process.env.FFMPEG_PATH || which('ffmpeg');
  const ffprobe = process.env.FFPROBE_PATH || which('ffprobe');
  if (!ffmpeg || !ffprobe) return 'ffmpeg and ffprobe are not installed (set FFMPEG_PATH and FFPROBE_PATH)';
  const encoders = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (!/\blibx264\b/.test(encoders.stdout ?? '')) return 'this ffmpeg has no libx264';
  return { ffmpeg, ffprobe };
}

function findChromium(): string {
  try {
    require.resolve('playwright-core');
  } catch {
    return 'playwright-core is not installed';
  }
  if (process.env.GOOSE_TEST_CHROMIUM) return process.env.GOOSE_TEST_CHROMIUM;
  const home = process.env.GOOSE_KIT_HOME || path.join(os.homedir(), '.gooseworks');
  const where = browsersFolder(home, process.env);
  const exe = findShell(where.dir, pinnedShell().revision);
  return exe ?? `the kit browser is not set up in ${where.dir} (run "gooseworks video check", or set GOOSE_TEST_CHROMIUM)`;
}

const toolsFound = findTools();
const chromiumFound = findChromium();
const ready = typeof toolsFound !== 'string' && path.isAbsolute(chromiumFound);

/** Why the media tests can't run here, or null when they can. */
export const MEDIA_SKIP_REASON: string | null = ready
  ? null
  : [typeof toolsFound === 'string' ? toolsFound : null, path.isAbsolute(chromiumFound) ? null : chromiumFound].filter(Boolean).join('; ');

/** describe() when Chromium and ffmpeg are here; otherwise one skipped test that names what is missing. */
export function describeMedia(name: string, body: () => void): void {
  if (MEDIA_SKIP_REASON === null) describe(name, body);
  else describe(name, () => it.skip(`needs Chromium and ffmpeg: ${MEDIA_SKIP_REASON}`, () => undefined));
}

export class TestPartError extends Error {
  constructor(readonly code: PartErrorCode, readonly detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
  get retryable() {
    return ['provider_failed', 'tool_failed', 'timeout'].includes(this.code);
  }
}

/** The same encoder settings the kit core pins (C1, toolchain.ts encodeArgs). */
function encodeArgs(preset: 'h264-master' | 'h264-intermediate' | 'aac'): string[] {
  const exact = ['-fflags', '+bitexact', '-flags', '+bitexact', '-map_metadata', '-1'];
  if (preset === 'aac') return ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-threads', '1', ...exact];
  const speed = preset === 'h264-master' ? ['-preset', 'medium', '-crf', '18'] : ['-preset', 'veryfast', '-crf', '12'];
  return ['-c:v', 'libx264', ...speed, '-pix_fmt', 'yuv420p', '-threads', '1', '-x264-params', 'threads=1:lookahead-threads=1', '-movflags', '+faststart', ...exact];
}

function makeTools(bins: { ffmpeg: string; ffprobe: string }, signal: AbortSignal): KitTools {
  const exec: KitTools['exec'] = (bin, args, options = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(bin === 'ffmpeg' ? bins.ffmpeg : bins.ffprobe, args, { cwd: options.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
      child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
      const onAbort = () => child.kill('SIGKILL');
      signal.addEventListener('abort', onAbort, { once: true });
      child.on('error', reject);
      child.on('close', (code) => {
        signal.removeEventListener('abort', onAbort);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new TestPartError('tool_failed', `${bin} exited with ${code}: ${stderr.slice(-1000)}`));
      });
    });
  const probe = async (file: string): Promise<MediaInfo> => {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
    const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<Record<string, unknown>> };
    const video = data.streams?.find((s) => s.codec_type === 'video');
    const [a, b] = String(video?.avg_frame_rate ?? '0/1').split('/').map(Number);
    return {
      has_video: !!video,
      has_audio: !!data.streams?.some((s) => s.codec_type === 'audio'),
      duration_s: data.format?.duration ? Number(data.format.duration) : undefined,
      width: video ? Number(video.width) : undefined,
      height: video ? Number(video.height) : undefined,
      fps: b ? a / b : undefined,
      video_codec: typeof video?.codec_name === 'string' ? video.codec_name : undefined,
    };
  };
  return { ffmpeg: bins.ffmpeg, ffprobe: bins.ffprobe, toolchain: 'test', exec, probe, encodeArgs };
}

export interface TestContext {
  ctx: PartContext;
  root: string;
  progress: Array<{ done?: number; total?: number }>;
  abort: AbortController;
}

/** A part context over a fresh step folder in `root`, with the real browser and ffmpeg. */
export function partContext(root: string): TestContext {
  if (typeof toolsFound === 'string' || !path.isAbsolute(chromiumFound)) throw new Error(`media tools missing: ${MEDIA_SKIP_REASON}`);
  const workDir = path.join(root, 'out');
  const tmpDir = path.join(root, 'tmp');
  mkdirSync(workDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  const abort = new AbortController();
  const tools = makeTools(toolsFound, abort.signal);
  const progress: Array<{ done?: number; total?: number }> = [];
  const browser = createKitBrowserSupport({ executablePath: chromiumFound }).provider({ allowDirs: [root], signal: abort.signal });
  const ctx: PartContext = {
    interface: 1,
    video: { id: 'vid_test', style: { id: 'test-style', version: '1.0.0' }, env: 'local' },
    step: { id: 'frames', attempt: 1 },
    part: { id: 'html-frames', version: '1.1.0', dir: path.join(__dirname, '..', '..', '..', 'src', 'kit', 'maker', 'parts', 'html-frames', '1.1.0') },
    workDir,
    tmpDir,
    seed: () => 0,
    tools,
    browser,
    log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
    progress: (update) => progress.push(update),
    file: async (relativePath) => {
      const ref = fileRef(path.join(workDir, relativePath));
      const info = await tools.probe(ref.path);
      return { ...ref, duration_s: info.duration_s, width: info.width, height: info.height, fps: info.fps };
    },
    error: (code, detail) => new TestPartError(code, detail),
    signal: abort.signal,
  };
  return { ctx, root, progress, abort };
}

/** ffprobe's own reading of a video: what a player would see. */
export function ffprobe(file: string): { width: number; height: number; duration: number; codec: string; pix_fmt: string; frames: number } {
  if (typeof toolsFound === 'string') throw new Error(toolsFound);
  const r = spawnSync(toolsFound.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,codec_name,pix_fmt,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}: ${r.stderr}`);
  const data = JSON.parse(r.stdout) as { streams: Array<Record<string, string | number>>; format: { duration: string } };
  const s = data.streams[0];
  return { width: Number(s.width), height: Number(s.height), codec: String(s.codec_name), pix_fmt: String(s.pix_fmt), frames: Number(s.nb_read_frames), duration: Number(data.format.duration) };
}

export function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Runs the test ffmpeg and returns its stdout bytes; throws with its stderr on failure. */
export function runFfmpeg(args: string[], input?: Buffer): Buffer {
  if (typeof toolsFound === 'string') throw new Error(toolsFound);
  const r = spawnSync(toolsFound.ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { input, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed: ${r.stderr?.toString()}`);
  return r.stdout;
}
