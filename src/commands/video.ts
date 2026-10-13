import { spawn } from 'child_process';
import { Command } from 'commander';
import { connectionFor, getCredentials, type Credentials } from '../auth/credentials';
import { apiEnvironment, readKitEnv } from '../kit/env';
import { checkComputer } from '../kit/core/check';
import { KitStop } from '../kit/core/errors';
import { deviceId } from '../kit/core/device';
import { defaultHost } from '../kit/core/host';
import { KitLog } from '../kit/core/log';
import { takeOutStep } from '../kit/core/patch';
import { kitHome } from '../kit/core/paths';
import { recordRefusal } from '../kit/core/refusal-log';
import { makeVideo } from '../kit/core/run';
import { LineError, lineWords, VideoLine } from '../kit/line/client';
import { signIn, syncMcpRegistration } from './login';
import { exitWhenDone } from '../utils/exit';

/** No one may be watching (CI, or no terminal), so a sign-in must not wait for approval. */
function unattended(): boolean {
  const ci = process.env.CI?.trim().toLowerCase();
  return !process.stdin.isTTY || !process.stdout.isTTY || (!!ci && ci !== '0' && ci !== 'false');
}

function savedEmail(): string | null {
  try {
    return getCredentials()?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Signs in on this computer, so the customer never has to run another command,
 * then reads the saved login back so its key stays paired with its own address.
 * The new login replaces this computer's GooseWorks login, and Claude Code's
 * connection follows it. Unattended, it prints the approval link and stops instead of waiting.
 */
async function signInForKit(apiBase: string, choice: { chooseAccount?: boolean; videoId?: string } = {}): Promise<Credentials | null> {
  const noWait = unattended();
  const before = savedEmail();
  console.log(noWait ? 'Signing in to GooseWorks first…' : 'Signing in to GooseWorks first, then carrying on…');
  try {
    const outcome = await signIn(apiBase, undefined, { ...(noWait ? { wait: false } : {}), ...choice });
    if (outcome.status !== 'done') {
      console.log('Approve the sign-in at the link above, then run the same command again.');
      return null;
    }
  } catch {
    console.log('Sign-in did not finish. Run the same command again.');
    return null;
  }
  const creds = connectionFor(apiBase);
  if (!creds) {
    console.log('Sign-in finished for a different GooseWorks server, so nothing was sent.');
    return null;
  }
  if (before && before !== creds.email) console.log(`This computer now uses GooseWorks as ${creds.email} instead of ${before}.`);
  syncMcpRegistration();
  return creds;
}

/**
 * The kit talks to GOOSEWORKS_API_BASE or the environment's address, never a saved login's other address.
 * `video make` passes its video, so a first sign-in already asks for an account that can make it.
 */
async function setUp(videoId?: string) {
  // The token leaves the environment as it is read, so no child process sees it.
  const settings = readKitEnv(process.env);
  const kit = { ...settings, noSelfUpdate: settings.noSelfUpdate || settings.worker };
  if (kit.worker && !kit.lineToken) throw new Error('This worker has no video token, so it cannot make the video.');
  const apiBase = settings.apiBase;
  const creds = kit.worker ? null : (connectionFor(apiBase) ?? (await signInForKit(apiBase, videoId ? { videoId } : {})));
  if (creds) console.log(`Signed in to GooseWorks as ${creds.email}.`);
  const home = kitHome();
  const device = await deviceId(home);
  const lineFor = (login?: string) => new VideoLine({ apiBase, deviceId: device, workerId: kit.workerId, login, lineToken: kit.lineToken });
  let line = lineFor(creds?.api_key);
  const log = new KitLog((text) => console.log(text), (text) => line.redact(text));
  const session = {
    kit,
    home,
    log,
    apiBase,
    signedIn: kit.worker || !!creds,
    get line() {
      return line;
    },
    /** After a new sign-in: the same line with the new login. */
    relogin(login: string) {
      line = lineFor(login);
      return line;
    },
  };
  return session;
}

type Session = Awaited<ReturnType<typeof setUp>>;

/**
 * Before any slow setup: may this login make the video? A wrong account or an
 * expired sign-in signs in again by itself (choosing the account, bound to
 * this video) and asks once more. Returns the line to make it with, or null.
 */
export async function lineForVideo(id: string, session: Session): Promise<VideoLine | null> {
  if (session.kit.worker) return session.line;
  let error: unknown;
  try {
    await session.line.access(id);
    return session.line;
  } catch (caught) {
    error = caught;
  }
  if (!(error instanceof LineError)) throw error;
  // A server without the access check: the hand-over checks the same things.
  if (error.status === 404 && error.code !== 'not_found') return session.line;
  recordRefusal(session.home, id, 'access refused', error);
  if (error.next !== 'sign_in') {
    session.log.say(lineWords(error));
    return null;
  }
  const signedInAs = typeof error.details?.signed_in_as === 'string' ? error.details.signed_in_as : null;
  session.log.say(
    error.code === 'not_signed_in'
      ? 'This computer’s GooseWorks sign-in has expired; signing in again…'
      : `This computer is signed in as ${signedInAs ?? 'another account'}; signing in with the account from your chat…`,
  );
  const creds = await signInForKit(session.apiBase, { chooseAccount: error.code !== 'not_signed_in', videoId: id });
  if (!creds) return null;
  const line = session.relogin(creds.api_key);
  try {
    await line.access(id);
    return line;
  } catch (again) {
    if (!(again instanceof LineError)) throw again;
    recordRefusal(session.home, id, 'access refused', again);
    session.log.say(lineWords(again));
    return null;
  }
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
    const session = await setUp();
    const { kit, home, line, log, apiBase, signedIn } = session;
    if (!signedIn) {
      process.exitCode = 1;
      return;
    }
    const signInAgain = async () => {
      const creds = await signInForKit(apiBase);
      return creds ? session.relogin(creds.api_key) : null;
    };
    const result = await checkComputer({ home, env: process.env, line, host: defaultHost(), say: (text) => log.say(text), signInAgain });
    if (result.status === 'update_kit') {
      process.exitCode = await selfUpdate((text) => log.say(text), kit.noSelfUpdate, result.message);
      return;
    }
    if (result.status !== 'ready') process.exitCode = 1;
  });

videoCommand
  .command('make <id>')
  .description('Make an approved video: the same command resumes it after a stop or a crash')
  .option('--patched <steps>', 'Make it with these steps’ edited code (comma-separated), taken out with video step --edit')
  .action(async (id: string, options: { patched?: string }) => {
    const session = await setUp(id);
    const { kit, home, log, apiBase, signedIn } = session;
    if (!signedIn) {
      process.exitCode = 1;
      return;
    }
    const line = await lineForVideo(id, session);
    if (!line) {
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
        ...(options.patched ? { patched: patchedSteps(options.patched) } : {}),
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
      // The run is over and its lock given back: a handle a part left open (a browser, say) must not keep the command running.
      exitWhenDone();
    }
  });

function patchedSteps(list: string): string[] {
  return list
    .split(',')
    .map((step) => step.trim())
    .filter(Boolean);
}

videoCommand
  .command('step <id> <step>')
  .description('Take out the exact code one step of a video ran, to fix it; then make the video again with --patched <step>')
  .option('--edit', 'Copy the step’s locked part into the video’s folder and print where it is')
  .action(async (id: string, step: string, options: { edit?: boolean }) => {
    if (!options.edit) {
      console.log(`Add --edit to take the step out: gooseworks video step ${id} ${step} --edit`);
      process.exitCode = 1;
      return;
    }
    try {
      const taken = await takeOutStep({ home: kitHome(), videoId: id, step, env: process.env, loader: defaultHost().loader });
      if (taken.movedAside) console.log(`An earlier edit of this step, for another version, was moved to ${taken.movedAside}.`);
      console.log(
        taken.kept
          ? `Step ${step} (${taken.part.id} ${taken.part.version}) is already taken out, with your edits, at:`
          : `Step ${step} runs ${taken.part.id} ${taken.part.version}. Its code is now at:`,
      );
      console.log(taken.dir);
      console.log(`Change only what is wrong there (never part.json). Then run this video’s make command again with --patched ${step} added.`);
      console.log('The edited step may only reuse what this video already bought: a new paid request stops the run before anything is charged.');
    } catch (error) {
      if (!(error instanceof KitStop) && !(error instanceof Error && error.name === 'PartLoadError')) throw error;
      console.log((error as Error).message);
      process.exitCode = 1;
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
