// The kit's save folder layout (part-interface.md section 8).
//
//   ~/.gooseworks/kit/device.json          device_id, a UUID made once
//   ~/.gooseworks/kit/parts/<id>/<ver>/    part cache, hash-checked on every load
//   ~/.gooseworks/kit/bin/                 the kit's own ffmpeg and ffprobe
//   ~/.gooseworks/videos/<video_id>/       one run folder per video
//   ~/.gooseworks/videos/<video_id>/runs/  one log per run of `video make`
//   ~/.gooseworks/kit/detached.lock        one detached make at a time on this computer
//   ~/.gooseworks/videos/<video_id>/patches/<step>/  a step's part taken out to edit (`video step --edit`)
//
// GOOSE_KIT_HOME replaces ~/.gooseworks.
import * as os from 'os';
import * as path from 'path';
import { KIT_DEV_ENV } from '../env';

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function kitHome(env: NodeJS.ProcessEnv = process.env): string {
  const home = env[KIT_DEV_ENV.home];
  if (home) return path.resolve(home);
  return path.join(env.GOOSEWORKS_USER_HOME || os.homedir(), '.gooseworks');
}

export function kitDir(home: string): string {
  return path.join(home, 'kit');
}

export function devicePath(home: string): string {
  return path.join(kitDir(home), 'device.json');
}

export function partsCacheDir(home: string): string {
  return path.join(kitDir(home), 'parts');
}

export function kitBinDir(home: string): string {
  return path.join(kitDir(home), 'bin');
}

/** Detached makes take turns on this lock, so a batch is made one video after another, as in the foreground. */
export function detachedTurnLock(home: string): string {
  return path.join(kitDir(home), 'detached.lock');
}

/** Every path inside one video's run folder. */
export interface RunLayout {
  root: string;
  lock: string;
  run: string;
  plan: string;
  partsLock: string;
  style: string;
  inputs: string;
  steps: string;
  layers: string;
  pieces: string;
  final: string;
  upload: string;
  /** A failure report the line never took, sent again by the next run. */
  pendingReport: string;
  /** One line per run: when it started and which file under runs/ holds its log. */
  log: string;
  /** Each run's own log, named by runName. */
  runs: string;
  /** How the last `video make` of this video ended: its outcome, exit code and words. */
  result: string;
  /** The `video make --detach` process making this video, while it lives. */
  detached: string;
  /** What detached runs printed (with --json), one event per line. */
  output: string;
  /** The card's rows as the run last showed them, for `video status`. */
  progress: string;
  /** Steps' parts taken out to edit, one folder per step. */
  patches: string;
}

export function runLayout(home: string, videoId: string): RunLayout {
  if (!SAFE_ID.test(videoId)) throw new Error('That video id is not valid.');
  const root = path.join(home, 'videos', videoId);
  return {
    root,
    lock: path.join(root, 'run.lock'),
    run: path.join(root, 'run.json'),
    plan: path.join(root, 'plan.json'),
    partsLock: path.join(root, 'parts.lock.json'),
    style: path.join(root, 'style'),
    inputs: path.join(root, 'inputs'),
    steps: path.join(root, 'steps'),
    layers: path.join(root, 'layers'),
    pieces: path.join(root, 'pieces'),
    final: path.join(root, 'final'),
    upload: path.join(root, 'upload.json'),
    pendingReport: path.join(root, 'pending-report.json'),
    log: path.join(root, 'log.ndjson'),
    runs: path.join(root, 'runs'),
    result: path.join(root, 'last-result.json'),
    detached: path.join(root, 'detached.json'),
    output: path.join(root, 'output.ndjson'),
    progress: path.join(root, 'progress.json'),
    patches: path.join(root, 'patches'),
  };
}

/** A run's name: when it started (UTC, safe in a file name) and its quote, e.g. "20261013T192657.123Z-q_1". */
export function runName(started: Date, quoteId: string): string {
  const at = started.toISOString().replace(/[-:]/g, '');
  const quote = quoteId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'quote';
  return `${at}-${quote}`;
}

/** A timeline step's folder, or a layer's ("layer-<slot>" lives under layers/<slot>). */
export function stepFolder(layout: RunLayout, stepId: string): string {
  return stepId.startsWith('layer-') ? path.join(layout.layers, stepId.slice('layer-'.length)) : path.join(layout.steps, stepId);
}

/** True when `child` is `parent` or inside it. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
