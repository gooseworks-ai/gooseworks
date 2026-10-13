// `video make <id> --detach`: the same command in a process of its own, which outlives the shell
// (and the app) that started it. Its output goes to the video's output.ndjson as JSON events.
import { spawn } from 'child_process';
import { closeSync, mkdirSync, openSync } from 'fs';
import * as path from 'path';

/** Set on the detached process: it waits its turn, and never detaches again. */
export const DETACHED_ENV = 'GOOSEWORKS_KIT_DETACHED';

/** The command line again without --detach, and with --json so its output file is one event per line. */
export function detachedArgs(args: readonly string[]): string[] {
  const kept = args.filter((arg) => arg !== '--detach');
  return kept.includes('--json') ? kept : [...kept, '--json'];
}

/** Starts the detached process with its output appended to `output`; returns its pid. */
export function startDetached(opts: { args: string[]; output: string; env: NodeJS.ProcessEnv }): number {
  mkdirSync(path.dirname(opts.output), { recursive: true, mode: 0o700 });
  const fd = openSync(opts.output, 'a', 0o600);
  try {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], ...opts.args], {
      detached: true,
      stdio: ['ignore', fd, fd],
      env: { ...opts.env, [DETACHED_ENV]: '1' },
      windowsHide: true,
    });
    child.on('error', () => undefined);
    if (!child.pid) throw new Error('The video maker could not be started in the background on this computer.');
    child.unref();
    return child.pid;
  } finally {
    closeSync(fd);
  }
}
