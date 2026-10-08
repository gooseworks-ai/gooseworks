// The kit's save folder layout (part-interface.md section 8).
//
//   ~/.gooseworks/kit/device.json          device_id, a UUID made once
//   ~/.gooseworks/kit/parts/<id>/<ver>/    part cache, hash-checked on every load
//   ~/.gooseworks/kit/bin/                 the kit's own ffmpeg and ffprobe
//   ~/.gooseworks/videos/<video_id>/       one run folder per video
//
// GOOSE_KIT_HOME replaces ~/.gooseworks.
import * as os from 'os';
import * as path from 'path';

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function kitHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.GOOSE_KIT_HOME) return path.resolve(env.GOOSE_KIT_HOME);
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
  log: string;
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
    log: path.join(root, 'log.ndjson'),
  };
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
