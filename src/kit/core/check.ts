// `gooseworks video check`: is this computer ready to make videos? It checks
// and sets up the kit's own ffmpeg, ffprobe and browser (in ~/.gooseworks/kit,
// never a system install), then sends the device report, so the catalogue
// offers only the styles this computer can make.
import { LineError, type VideoLine } from '../line/client';
import { deviceReport } from './device';
import type { KitHost } from './host';
import { inspectFfmpeg, type Toolchain } from './toolchain';

/** Free space the line asks for on top of what the kit keeps (gooseworks-app MIN_DISK_MB). */
const MIN_DISK_MB = 500;

export interface CheckDeps {
  home: string;
  env: NodeJS.ProcessEnv;
  line: VideoLine;
  host: KitHost;
  say: (line: string) => void;
  tools?: Toolchain;
}

export type CheckResult =
  | { status: 'ready' | 'not_ready'; ready?: number; total?: number }
  | { status: 'update_kit'; message: string; min_version?: string };

export async function checkComputer(deps: CheckDeps): Promise<CheckResult> {
  const { say, line } = deps;
  say('Checking this computer for making videos…');
  const tools = deps.tools ?? (await inspectFfmpeg({ home: deps.home, env: deps.env, setup: true, download: (u, m) => line.download(u, m), say }));
  const browser = await deps.host.browser.check({ home: deps.home, setup: true, env: deps.env, say });
  const report = await deviceReport({ home: deps.home, worker: line.isWorker, tools, browser });

  const toolsOk = tools.ffmpeg.report.ok && tools.ffprobe.report.ok;
  say(toolsOk ? 'Video tools: ready.' : `Video tools: not ready (${tools.ffmpeg.problem ?? tools.ffprobe.problem ?? 'missing'}).`);
  say(browser.ok ? 'Video browser: ready.' : `Video browser: not ready (${browser.problem ?? 'missing'}). Styles that draw in the browser stay hidden.`);
  const gb = (report.disk_free_mb / 1024).toFixed(1);
  say(report.disk_free_mb >= MIN_DISK_MB ? `Free space: ${gb} GB.` : `Free space: ${gb} GB, too little to make videos. Free at least 1 GB.`);
  const ready = toolsOk && report.disk_free_mb >= MIN_DISK_MB;

  if (line.isWorker) {
    // A worker has no login, and the line takes a worker's device report
    // only with the hand-over, so it goes with `video make`.
    say(ready ? 'Ready to make videos.' : 'Not ready to make videos.');
    return { status: ready ? 'ready' : 'not_ready' };
  }

  if (!line.hasLogin) {
    say('Sign in to GooseWorks on this computer, then run this check again so your styles show up.');
    return { status: 'not_ready' };
  }
  try {
    const answer = await line.reportDevice(report);
    if (!answer.kit.ok) return { status: 'update_kit', message: 'This video kit is older than the oldest one that works.', min_version: answer.kit.min_version };
    const { ready: styles, total } = answer.styles;
    say(ready ? `Ready: ${styles} ${styles === 1 ? 'style' : 'styles'}${total > styles ? ` of ${total}` : ''}.` : `Not ready yet: ${styles} of ${total} styles can be made here.`);
    return { status: ready ? 'ready' : 'not_ready', ready: styles, total };
  } catch (error) {
    if (error instanceof LineError) {
      if (error.next === 'update_kit') return { status: 'update_kit', message: [error.message, error.fix].filter(Boolean).join(' ') };
      say([error.message, error.fix].filter(Boolean).join(' '));
      return { status: 'not_ready' };
    }
    throw error;
  }
}
