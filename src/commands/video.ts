import { spawn } from 'child_process';
import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { API_BASE } from '../config';
import { getEnvironment } from '../environment';
import { checkComputer } from '../kit/core/check';
import { deviceId } from '../kit/core/device';
import { defaultHost } from '../kit/core/host';
import { KitLog } from '../kit/core/log';
import { kitHome } from '../kit/core/paths';
import { makeVideo } from '../kit/core/run';
import { VideoLine } from '../kit/line/client';

/**
 * The kit's settings. On a worker (MV-40) the line token arrives in the
 * environment; it is taken out of it at once so no child process sees it, and
 * from then on lives only inside the line client.
 */
function readKitEnv() {
  const env = process.env;
  const worker = env.GOOSEWORKS_KIT_WORKER === '1';
  const lineToken = env.GOOSEWORKS_VIDEO_LINE_TOKEN || undefined;
  delete process.env.GOOSEWORKS_VIDEO_LINE_TOKEN;
  return {
    worker,
    lineToken: worker ? lineToken : undefined,
    workerId: env.GOOSEWORKS_KIT_WORKER_ID || undefined,
    // A worker's image pins its kit, and its token has left the environment, so it never relaunches itself.
    noSelfUpdate: worker || env.GOOSEWORKS_KIT_NO_SELF_UPDATE === '1',
  };
}

function environmentOf(apiBase: string): 'production' | 'staging' | 'local' {
  const host = new URL(apiBase).hostname;
  if (['localhost', '127.0.0.1', '[::1]'].includes(host)) return 'local';
  return getEnvironment() === 'staging' ? 'staging' : 'production';
}

async function setUp() {
  const kit = readKitEnv();
  const creds = kit.worker ? null : getCredentials();
  if (kit.worker && !kit.lineToken) throw new Error('This worker has no video token, so it cannot make the video.');
  const apiBase = kit.worker ? API_BASE : (creds?.api_base ?? API_BASE);
  const home = kitHome();
  const line = new VideoLine({
    apiBase,
    deviceId: await deviceId(home),
    workerId: kit.workerId,
    login: creds?.api_key,
    lineToken: kit.lineToken,
  });
  const log = new KitLog((text) => console.log(text), (text) => line.redact(text));
  return { kit, home, line, log, apiBase };
}

/**
 * The kit is older than the oldest one that works: run the same command with
 * the newest GooseWorks once (nothing is installed on the system). A worker
 * pins its kit and never does this.
 */
function selfUpdate(say: (line: string) => void, noSelfUpdate: boolean, message: string): Promise<number> {
  if (noSelfUpdate) {
    say(`${message} This machine keeps its kit version, so the video was not made here.`);
    return Promise.resolve(1);
  }
  if (process.env.GOOSEWORKS_KIT_UPDATED === '1') {
    say(`${message} The newest GooseWorks is still too old for this video. Try again later.`);
    return Promise.resolve(1);
  }
  say('Updating the video kit, then carrying on…');
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', 'gooseworks@latest', ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, GOOSEWORKS_KIT_UPDATED: '1' },
    });
    child.on('error', () => {
      say('The video kit could not update itself. Update GooseWorks, then run the same command again.');
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export const videoCommand = new Command('video').description('Make approved videos on this computer');

videoCommand
  .command('check')
  .description('Check this computer can make videos, set up what is missing, and report it')
  .action(async () => {
    const { kit, home, line, log } = await setUp();
    const result = await checkComputer({ home, env: process.env, line, host: defaultHost(), say: (text) => log.say(text) });
    if (result.status === 'update_kit') {
      process.exitCode = await selfUpdate((text) => log.say(text), kit.noSelfUpdate, result.message);
      return;
    }
    if (result.status !== 'ready') process.exitCode = 1;
  });

videoCommand
  .command('make <id>')
  .description('Make an approved video: the same command resumes it after a stop or a crash')
  .action(async (id: string) => {
    const { kit, home, line, log, apiBase } = await setUp();
    const stop = new AbortController();
    const onSignal = () => stop.abort();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    try {
      const result = await makeVideo(id, {
        home,
        env: { ...process.env },
        line,
        host: defaultHost(),
        log,
        environment: environmentOf(apiBase),
        signal: stop.signal,
      });
      if (result.status === 'update_kit') {
        process.exitCode = await selfUpdate((text) => log.say(text), kit.noSelfUpdate, result.message);
        return;
      }
      // The line's own words are the last thing printed.
      log.say(result.message);
      if (result.status !== 'done') process.exitCode = 1;
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  });
