// The kit's ffmpeg and ffprobe: found, checked and, when missing, set up in
// ~/.gooseworks/kit/bin (never a system install). A worker image sets
// FFMPEG_PATH and FFPROBE_PATH; the kit then uses those copies as they are and
// never downloads a second one.
import { spawn, spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';
import type { KitTools, MediaInfo } from '../part-interface';
import type { ToolReport } from '../line/types';
import { sha256Hex } from './canonical';
import { PartError } from './errors';
import { kitBinDir } from './paths';

/** What every video needs from ffmpeg: libass to draw captions, libx264 to encode. */
export const REQUIRED_FILTERS = ['ass', 'subtitles'];
export const REQUIRED_ENCODERS = ['libx264'];

interface PinnedFile {
  url: string;
  /** sha256 of the .gz as published, and of the binary inside it. */
  gz_sha256: string;
  gz_bytes: number;
  bin_sha256: string;
}

const BUILD = 'b6.1.1';
const RELEASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${BUILD}`;

/** Pinned static builds, checked by sha256 before they are used. */
const PINNED: Record<string, { ffmpeg: PinnedFile; ffprobe: PinnedFile }> = {
  'darwin-arm64': {
    ffmpeg: { url: `${RELEASE}/ffmpeg-darwin-arm64.gz`, gz_sha256: '8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa', gz_bytes: 19246198, bin_sha256: 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584' },
    ffprobe: { url: `${RELEASE}/ffprobe-darwin-arm64.gz`, gz_sha256: 'd986a8ec7b030899fe66a8a288ed809a3543338705a3ce178cfb85869c5d80be', gz_bytes: 19207077, bin_sha256: 'bb2db6f5d8cef919da12fbf592119a987202a8c060a886f3cab091f9cab90b64' },
  },
  'darwin-x64': {
    ffmpeg: { url: `${RELEASE}/ffmpeg-darwin-x64.gz`, gz_sha256: '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106', gz_bytes: 25296431, bin_sha256: 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894' },
    ffprobe: { url: `${RELEASE}/ffprobe-darwin-x64.gz`, gz_sha256: 'd4da574d6e2e197bd259b47d69cf262df9e312af24ad960444f6d806d3d4c186', gz_bytes: 25239438, bin_sha256: 'fa3add0ce901f7241abe0dfc0155d958fc834aca3f8ce61f87cc712ae669c1e0' },
  },
  'linux-arm64': {
    ffmpeg: { url: `${RELEASE}/ffmpeg-linux-arm64.gz`, gz_sha256: '754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0', gz_bytes: 25568691, bin_sha256: '6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce' },
    ffprobe: { url: `${RELEASE}/ffprobe-linux-arm64.gz`, gz_sha256: '2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8', gz_bytes: 25493573, bin_sha256: 'd17ae9b4c297d48e2521ba14e417bb0537c6ff77c584cdbcd6bb0d8d0307a2e8' },
  },
  'linux-x64': {
    ffmpeg: { url: `${RELEASE}/ffmpeg-linux-x64.gz`, gz_sha256: 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa', gz_bytes: 29354986, bin_sha256: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99' },
    ffprobe: { url: `${RELEASE}/ffprobe-linux-x64.gz`, gz_sha256: '25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067', gz_bytes: 29276839, bin_sha256: '4f231a1960d83e403d08f7971e271707bec278a9ae18e21b8b5b03186668450d' },
  },
};

export interface ToolInfo {
  path: string | null;
  report: ToolReport;
  /** ffmpeg's filters and encoders, for parts that name the ones they need. */
  filters?: string[];
  encoders?: string[];
  /** Plain words for `video check` when the tool can't be used. */
  problem?: string;
}

export interface Toolchain {
  ffmpeg: ToolInfo;
  ffprobe: ToolInfo;
}

/** The environment ffmpeg and ffprobe run with: nothing secret, nothing from the person's shell. */
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ']) if (env[name]) out[name] = env[name];
  return out;
}

function runQuiet(bin: string, args: string[]): { ok: boolean; out: string } {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv(), timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
    return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } catch {
    return { ok: false, out: '' };
  }
}

/** Names from `ffmpeg -filters` or `-encoders`: the word after the flags column. */
export function listedNames(output: string): string[] {
  const names = new Set<string>();
  for (const line of output.split('\n')) {
    const match = /^\s*[A-Z.|]{2,}\s+([A-Za-z0-9_]+)\s/.exec(line);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

function versionOf(output: string): string | null {
  const match = /version\s+(\S+)/.exec(output);
  return match ? match[1].slice(0, 100) : null;
}

/** Checks one ffmpeg build: it runs, and it has libass and libx264. */
export function probeFfmpeg(bin: string, bundled: boolean): ToolInfo {
  const version = runQuiet(bin, ['-hide_banner', '-version']);
  if (!version.ok) return { path: null, report: { ok: false, version: null, bundled }, problem: 'the video tools do not start' };
  const filters = listedNames(runQuiet(bin, ['-hide_banner', '-filters']).out);
  const encoders = listedNames(runQuiet(bin, ['-hide_banner', '-encoders']).out);
  const missing = [...REQUIRED_FILTERS.filter((f) => !filters.includes(f)), ...REQUIRED_ENCODERS.filter((e) => !encoders.includes(e))];
  const report: ToolReport = {
    ok: missing.length === 0,
    version: versionOf(version.out),
    bundled,
    ...(bundled ? {} : { filters: filters.slice(0, 1000), encoders: encoders.slice(0, 500) }),
  };
  const gaps = [
    ...(REQUIRED_FILTERS.some((f) => missing.includes(f)) ? ['can’t draw captions'] : []),
    ...(REQUIRED_ENCODERS.some((e) => missing.includes(e)) ? ['can’t save videos'] : []),
  ];
  return { path: missing.length ? null : bin, report, filters, encoders, ...(gaps.length ? { problem: `the video tools here ${gaps.join(' and ')}` } : {}) };
}

export function probeFfprobe(bin: string, bundled: boolean): ToolInfo {
  const version = runQuiet(bin, ['-hide_banner', '-version']);
  if (!version.ok) return { path: null, report: { ok: false, version: null, bundled }, problem: 'the video probe does not start' };
  return { path: bin, report: { ok: true, version: versionOf(version.out), bundled } };
}

function onPath(name: string): string | null {
  const r = runQuiet(process.platform === 'win32' ? 'where' : 'which', [name]);
  const first = r.out.split('\n')[0]?.trim();
  return r.ok && first ? first : null;
}

function bundledPaths(home: string): { dir: string; ffmpeg: string; ffprobe: string } {
  const dir = path.join(kitBinDir(home), `ffmpeg-${BUILD}`);
  return { dir, ffmpeg: path.join(dir, 'ffmpeg'), ffprobe: path.join(dir, 'ffprobe') };
}

/** Downloads and checks one pinned binary into the kit's own folder. */
async function installPinned(file: PinnedFile, target: string, download: (url: string, maxBytes: number) => Promise<Buffer>): Promise<void> {
  const gz = await download(file.url, file.gz_bytes + 1024);
  if (gz.length !== file.gz_bytes || sha256Hex(gz) !== file.gz_sha256) throw new Error('A downloaded video tool did not match its checksum.');
  const bin = gunzipSync(gz);
  if (sha256Hex(bin) !== file.bin_sha256) throw new Error('A downloaded video tool did not match its checksum.');
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${process.pid}.pending`;
  writeFileSync(temp, bin, { mode: 0o755 });
  chmodSync(temp, 0o755);
  renameSync(temp, target);
}

export interface InspectOptions {
  home: string;
  env?: NodeJS.ProcessEnv;
  /** Download what is missing. */
  setup: boolean;
  download: (url: string, maxBytes: number) => Promise<Buffer>;
  say?: (line: string) => void;
}

/**
 * Finds ffmpeg and ffprobe in this order: the image's copies (FFMPEG_PATH,
 * FFPROBE_PATH), the kit's own, a fresh download of the pinned build, then
 * the computer's own copies when they have what videos need.
 */
export async function inspectFfmpeg(opts: InspectOptions): Promise<Toolchain> {
  const env = opts.env ?? process.env;
  if (env.FFMPEG_PATH || env.FFPROBE_PATH) {
    return {
      ffmpeg: env.FFMPEG_PATH ? probeFfmpeg(env.FFMPEG_PATH, false) : { path: null, report: { ok: false, version: null, bundled: false }, problem: 'FFMPEG_PATH is not set' },
      ffprobe: env.FFPROBE_PATH ? probeFfprobe(env.FFPROBE_PATH, false) : { path: null, report: { ok: false, version: null, bundled: false }, problem: 'FFPROBE_PATH is not set' },
    };
  }
  const own = bundledPaths(opts.home);
  const pinned = PINNED[`${process.platform}-${process.arch}`];
  let setupProblem: string | undefined;
  if (pinned && opts.setup && (!existsSync(own.ffmpeg) || !existsSync(own.ffprobe))) {
    opts.say?.('Setting up the video tools (about 50 MB, once)…');
    try {
      if (!existsSync(own.ffmpeg)) await installPinned(pinned.ffmpeg, own.ffmpeg, opts.download);
      if (!existsSync(own.ffprobe)) await installPinned(pinned.ffprobe, own.ffprobe, opts.download);
    } catch (error) {
      setupProblem = error instanceof Error ? error.message : 'the video tools could not be set up';
    }
  }
  if (existsSync(own.ffmpeg) && existsSync(own.ffprobe)) {
    const ffmpeg = probeFfmpeg(own.ffmpeg, true);
    const ffprobe = probeFfprobe(own.ffprobe, true);
    if (ffmpeg.report.ok && ffprobe.report.ok) return { ffmpeg, ffprobe };
    // A pinned build that can't make videos here is removed, not used.
    rmSync(own.dir, { recursive: true, force: true });
    setupProblem = ffmpeg.problem ?? ffprobe.problem;
  }
  const systemFfmpeg = onPath('ffmpeg');
  const systemFfprobe = onPath('ffprobe');
  const ffmpeg = systemFfmpeg ? probeFfmpeg(systemFfmpeg, false) : { path: null, report: { ok: false, version: null, bundled: false } as ToolReport, problem: setupProblem ?? (pinned ? 'the video tools are not set up yet' : 'this computer’s system is not supported for the video tools') };
  const ffprobe = systemFfprobe ? probeFfprobe(systemFfprobe, false) : { path: null, report: { ok: false, version: null, bundled: false } as ToolReport, problem: setupProblem ?? 'the video probe is not set up yet' };
  return { ffmpeg, ffprobe };
}

/** "ffmpeg-<version>/chromium-<version>": part of every step hash. */
export function toolchainId(tools: Toolchain, browserVersion: string | null): string {
  return `ffmpeg-${tools.ffmpeg.report.version ?? 'none'}/chromium-${browserVersion ?? 'none'}`;
}

function numberOf(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function rate(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.includes('/')) return numberOf(value);
  const [a, b] = value.split('/').map(Number);
  return a > 0 && b > 0 ? Math.round((a / b) * 1000) / 1000 : undefined;
}

/** ffprobe's answer for one file. */
export function parseProbe(json: string): MediaInfo {
  const data = JSON.parse(json) as { format?: { duration?: string }; streams?: Array<Record<string, unknown>> };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const info: MediaInfo = { has_audio: !!audio, has_video: !!video };
  const duration = numberOf(data.format?.duration);
  if (duration !== undefined) info.duration_s = duration;
  if (video) {
    const width = numberOf(video.width);
    const height = numberOf(video.height);
    const fps = rate(video.avg_frame_rate) ?? rate(video.r_frame_rate);
    if (width) info.width = width;
    if (height) info.height = height;
    if (fps) info.fps = fps;
    if (typeof video.codec_name === 'string') info.video_codec = video.codec_name;
  }
  if (audio && typeof audio.codec_name === 'string') info.audio_codec = audio.codec_name;
  return info;
}

/** Encoder flags that pin every setting that changes the output bytes, threads included. */
export function encodeArgs(preset: 'h264-master' | 'h264-intermediate' | 'aac'): string[] {
  const exact = ['-fflags', '+bitexact', '-flags', '+bitexact', '-map_metadata', '-1'];
  switch (preset) {
    case 'h264-master':
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '1', '-x264-params', 'threads=1:lookahead-threads=1', '-movflags', '+faststart', ...exact];
    case 'h264-intermediate':
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', '-threads', '1', '-x264-params', 'threads=1:lookahead-threads=1', ...exact];
    case 'aac':
      return ['-c:a', 'aac', '-b:a', '192k', '-threads', '1', ...exact];
  }
}

/** The tools a part gets: the two binaries only, no shell, killed on abort. */
export function kitTools(chain: { ffmpeg: string; ffprobe: string; toolchain: string }, signal: AbortSignal): KitTools {
  const exec: KitTools['exec'] = (bin, args, options = {}) =>
    new Promise((resolve, reject) => {
      if (bin !== 'ffmpeg' && bin !== 'ffprobe') return reject(new PartError('bad_input', 'only ffmpeg and ffprobe can run'));
      if (signal.aborted) return reject(new PartError('stopped'));
      const child = spawn(bin === 'ffmpeg' ? chain.ffmpeg : chain.ffprobe, args, {
        cwd: options.cwd,
        env: childEnv(),
        shell: false,
        stdio: [options.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let size = 0;
      const keep = (into: Buffer[]) => (chunk: Buffer) => {
        size += chunk.length;
        if (size <= 64 * 1024 * 1024) into.push(chunk);
      };
      child.stdout?.on('data', keep(out));
      child.stderr?.on('data', keep(err));
      let ended: PartError | null = null;
      const kill = (why: PartError) => {
        ended = why;
        child.kill('SIGKILL');
      };
      const onAbort = () => kill(new PartError('stopped'));
      signal.addEventListener('abort', onAbort, { once: true });
      const timer = options.timeoutMs ? setTimeout(() => kill(new PartError('timeout', `${bin} ran too long`)), options.timeoutMs) : null;
      child.on('error', (error) => {
        signal.removeEventListener('abort', onAbort);
        if (timer) clearTimeout(timer);
        reject(new PartError('tool_failed', error.message));
      });
      child.on('close', (code) => {
        signal.removeEventListener('abort', onAbort);
        if (timer) clearTimeout(timer);
        const stdout = Buffer.concat(out).toString('utf8');
        const stderr = Buffer.concat(err).toString('utf8');
        if (ended) return reject(ended);
        if (code !== 0) return reject(new PartError('tool_failed', `${bin} exited with ${code}: ${stderr.slice(-2000)}`));
        resolve({ stdout, stderr });
      });
      if (options.stdin && child.stdin) child.stdin.end(Buffer.from(options.stdin));
    });
  return {
    ffmpeg: chain.ffmpeg,
    ffprobe: chain.ffprobe,
    toolchain: chain.toolchain,
    exec,
    probe: async (file) => {
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60_000 });
      return parseProbe(stdout);
    },
    encodeArgs,
  };
}
