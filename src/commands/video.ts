import { spawn } from 'child_process';
import { Command } from 'commander';
import { getCredentials, type Credentials } from '../auth/credentials';
import { apiEnvironment, KIT_ENV, readKitEnv } from '../kit/env';
import { checkComputer } from '../kit/core/check';
import { deviceId } from '../kit/core/device';
import { defaultHost } from '../kit/core/host';
import { KitLog } from '../kit/core/log';
import { kitHome } from '../kit/core/paths';
import { makeVideo } from '../kit/core/run';
import { VideoLine } from '../kit/line/client';
import { signIn } from './login';

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * The saved login, only when it belongs to the address the kit talks to. A
 * developer's saved local or tunnel address must never break a customer's make,
 * so any other saved address counts as not signed in. An explicit
 * GOOSEWORKS_API_BASE keeps the saved login as it is.
 */
function savedLogin(apiBase: string, explicit: boolean): Credentials | null {
  let creds: Credentials | null;
  try {
    creds = getCredentials();
  } catch {
    return null;
  }
  if (!creds) return null;
  return explicit || sameOrigin(creds.api_base, apiBase) ? creds : null;
}

/**
 * Signs in on this computer, so the customer never has to run another command,
 * then reads the saved login back so its key stays paired with its own address.
 */
async function signInForKit(apiBase: string, explicit: boolean): Promise<Credentials | null> {
  console.log('Signing in to GooseWorks first, then carrying on…');
  try {
    const outcome = await signIn(apiBase, undefined);
    if (outcome.status !== 'done') return null;
  } catch {
    console.log('Sign-in did not finish. Run the same command again.');
    return null;
  }
  const creds = savedLogin(apiBase, explicit);
  if (!creds) console.log('Sign-in finished for a different GooseWorks server, so nothing was sent.');
  return creds;
}

async function setUp() {
  const explicit = !!process.env[KIT_ENV.apiBase];
  // The token leaves the environment as it is read, so no child process sees it.
  const settings = readKitEnv(process.env);
  const kit = { ...settings, noSelfUpdate: settings.noSelfUpdate || settings.worker };
  if (kit.worker && !kit.lineToken) throw new Error('This worker has no video token, so it cannot make the video.');
  const creds = kit.worker ? null : (savedLogin(settings.apiBase, explicit) ?? (await signInForKit(settings.apiBase, explicit)));
  const apiBase = kit.worker ? settings.apiBase : (creds?.api_base ?? settings.apiBase);
  const login = creds?.api_key;
  const home = kitHome();
  const line = new VideoLine({
    apiBase,
    deviceId: await deviceId(home),
    workerId: kit.workerId,
    login,
    lineToken: kit.lineToken,
  });
  const log = new KitLog((text) => console.log(text), (text) => line.redact(text));
  return { kit, home, line, log, apiBase, signedIn: kit.worker || !!login };
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
    const { kit, home, line, log, signedIn } = await setUp();
    if (!signedIn) {
      process.exitCode = 1;
      return;
    }
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
    const { kit, home, line, log, apiBase, signedIn } = await setUp();
    if (!signedIn) {
      process.exitCode = 1;
      return;
    }
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
        environment: apiEnvironment(apiBase),
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

/** The old save step: `video make` now uploads the finished video and gets it checked. */
export const videoSaveMovedCommand = new Command('video-save')
  .description('Replaced by "gooseworks video make <id>", which uploads the finished video itself')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(() => {
    console.log('Saving is part of "gooseworks video make <id>" now: run it again and it sends the finished video for its check.');
    process.exitCode = 1;
  });
