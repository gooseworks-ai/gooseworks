import { spawn } from 'child_process';
import { rm } from 'fs/promises';
import * as path from 'path';
import { format } from 'util';
import { Command } from 'commander';
import { connectionFor, getCredentials, type Credentials } from '../auth/credentials';
import { apiEnvironment, readKitEnv } from '../kit/env';
import { checkComputer } from '../kit/core/check';
import { KitStop } from '../kit/core/errors';
import { deviceId } from '../kit/core/device';
import { defaultHost } from '../kit/core/host';
import { DETACHED_ENV, detachedArgs, startDetached } from '../kit/core/detach';
import { KitLog, type KitEvent } from '../kit/core/log';
import { EXIT_CODES, latestRunLog, resultRecord, saveResult, tailOf, verifyLines, verifyOf, videoStatus, type DetachedRecord, type Ended, type VideoStatus } from '../kit/core/outcome';
import { detachedTurnLock, kitHome, runLayout } from '../kit/core/paths';
import { lineOf } from '../kit/core/progress';
import { takeOutStep } from '../kit/core/patch';
import { recordRefusal } from '../kit/core/refusal-log';
import { makeVideo, type MakeResult } from '../kit/core/run';
import { readJson, waitForLock, writeJson } from '../kit/core/save';
import { LineError, lineWords, VideoLine } from '../kit/line/client';
import { signIn, syncMcpRegistration } from './login';
import { exitNow, exitWhenDone } from '../utils/exit';

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
async function setUp(videoId?: string, emit?: (event: KitEvent) => void) {
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
  const log = new KitLog((text) => console.log(text), (text) => line.redact(text), emit);
  const session = {
    kit,
    home,
    log,
    apiBase,
    signedIn: kit.worker || !!creds,
    /** The line's last refusal before the make, which says why it can't go on. */
    refused: null as LineError | null,
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
  session.refused = error;
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
    session.refused = again;
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
  // A detached run already holds its turn: the newer kit makes the video inside it, without waiting again.
  const env: NodeJS.ProcessEnv = { ...process.env, GOOSEWORKS_KIT_UPDATED: '1' };
  delete env[DETACHED_ENV];
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', 'gooseworks@latest', ...process.argv.slice(2)], {
      stdio: 'inherit',
      env,
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

/** What each exit code of `video make` means, for whoever runs it. */
const EXIT_HELP = `
Exit codes:
  ${EXIT_CODES.done}  the video is made and passed its checks
  ${EXIT_CODES.failed}  it can't go on as it is: the plan, a check or a part needs a change first
  ${EXIT_CODES.stopped}  it was stopped, on this computer or on the card
  ${EXIT_CODES.run_again}  something failed for now: the same command carries on and keeps what was made
  ${EXIT_CODES.update_kit}  it needs a newer GooseWorks than this computer could get
  ${EXIT_CODES.sign_in}  this computer needs to sign in to GooseWorks with the video's account`;

/** Where the command's words go: printed lines, or with --json one JSON event per line. */
interface Output {
  json: boolean;
  say(text: string): void;
  event(value: object): void;
  /** Puts console.log back. */
  restore(): void;
}

function output(json: boolean): Output {
  const write = (value: object) => {
    process.stdout.write(`${JSON.stringify(value)}\n`);
  };
  if (!json) return { json, say: (text) => console.log(text), event: write, restore: () => undefined };
  // Every line, a sign-in's included, goes out as an event, so a program reads one JSON value per line.
  const original = console.log;
  console.log = (...args: unknown[]) => write({ event: 'say', text: format(...args) });
  return { json, say: (text) => write({ event: 'say', text }), event: write, restore: () => void (console.log = original) };
}

/**
 * `video make --detach` prints exactly one JSON line on stdout, whatever happens; its other words
 * (a sign-in, say) go to stderr, where the person still sees them.
 */
function detachOutput(): Output {
  const original = console.log;
  const toErr = (text: string) => void process.stderr.write(`${text}\n`);
  console.log = (...args: unknown[]) => toErr(format(...args));
  let sent = false;
  const once = (value: object) => {
    if (sent) return;
    sent = true;
    process.stdout.write(`${JSON.stringify(value)}\n`);
  };
  return { json: true, say: toErr, event: once, restore: () => void (console.log = original) };
}

type Finished = Ended & { message: string; final?: string; contact_sheet?: string; warnings?: string[]; log?: string };

/** Saves how the make ended, prints its words when they weren't yet, and sets the exit code; `--json` ends on the result. */
function finish(id: string, home: string, result: Finished, out: Output, printWords: boolean): number {
  if (printWords && result.message) out.say(result.message);
  if (printWords && result.status === 'done') for (const line of afterDone(result)) out.say(line);
  const record = resultRecord(id, result);
  saveResult(runLayout(home, id), record);
  if (out.json) out.event(record);
  process.exitCode = record.exit_code || undefined;
  return record.exit_code;
}

/** After a finished video's words: what the checks noted, and the frame sheet to look at before it is shared. */
function afterDone(result: Finished): string[] {
  return [
    ...(result.warnings ?? []).map((warning) => `Our check noted: ${warning}`),
    ...(result.contact_sheet ? [`Look over its frames before you share it: ${result.contact_sheet}`] : []),
  ];
}

/** Why the make couldn't start, as an end: the line's refusal, or a sign-in that didn't finish. */
function notStarted(refused: LineError | null): Ended & { message: string } {
  if (!refused) return { status: 'stopped', message: 'This computer isn’t signed in to GooseWorks yet. Sign in, then run the same command again.', next: 'sign_in' };
  return { status: refused.next === 'change_request' ? 'failed' : 'stopped', message: lineWords(refused), code: refused.code, next: refused.next };
}

/** Makes the video in this process. A detached process first waits for its turn on this computer. */
async function makeHere(id: string, out: Output, patched?: string[]): Promise<void> {
  const turn = process.env[DETACHED_ENV] === '1' ? await waitForLock(detachedTurnLock(kitHome())) : null;
  try {
    const session = await setUp(id, out.json ? (event) => out.event(event) : undefined);
    const { kit, home, log, apiBase, signedIn } = session;
    if (!signedIn) {
      finish(id, home, notStarted(null), out, false);
      return;
    }
    const line = await lineForVideo(id, session);
    if (!line) {
      finish(id, home, notStarted(session.refused), out, false);
      return;
    }
    const stop = new AbortController();
    const onSignal = () => stop.abort();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    let ended = false;
    // The run stopped but something it started won't let go: its words, its result, then the process ends.
    const forceEnd = (result: MakeResult) => {
      if (ended) return;
      ended = true;
      void exitNow(finish(id, home, result, out, true));
    };
    try {
      const result = await makeVideo(id, {
        home,
        env: { ...process.env },
        line,
        host: defaultHost(),
        log,
        environment: apiEnvironment(apiBase),
        signal: stop.signal,
        forceEnd,
        ...(patched?.length ? { patched } : {}),
      });
      if (ended) return;
      ended = true;
      if (result.status === 'update_kit') {
        const code = await selfUpdate((text) => log.say(text), kit.noSelfUpdate, result.message);
        // The newer kit saved and printed its own result; only a kit that couldn't update says it here.
        if (code === 1 && (kit.noSelfUpdate || process.env.GOOSEWORKS_KIT_UPDATED === '1')) finish(id, home, result, out, false);
        else process.exitCode = code || undefined;
        return;
      }
      // The line's own words are the last thing printed (with --json, the result follows them).
      finish(id, home, result, out, true);
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  } finally {
    await turn?.();
    if (process.env[DETACHED_ENV] === '1') await forgetDetached(kitHome(), id);
  }
}

/** The detached run is over: its record goes, so a later process with the same pid is never taken for it. */
async function forgetDetached(home: string, id: string): Promise<void> {
  const layout = runLayout(home, id);
  const record = await readJson<DetachedRecord>(layout.detached);
  if (record?.pid === process.pid) await rm(layout.detached, { force: true }).catch(() => undefined);
}

/**
 * Starts the make in a process of its own and returns: signed in first, where the person can see it, and
 * never a second run of a video that is already being made. Prints one JSON line either way.
 */
async function makeDetached(id: string, out: Output): Promise<void> {
  const session = await setUp(id);
  const { kit, home } = session;
  if (kit.worker) {
    finish(id, home, { status: 'failed', message: 'A worker makes its video in the foreground, so --detach is not for it.', code: 'invalid_input' }, out, true);
    return;
  }
  if (!session.signedIn) {
    finish(id, home, notStarted(null), out, false);
    return;
  }
  if (!(await lineForVideo(id, session))) {
    finish(id, home, notStarted(session.refused), out, false);
    return;
  }
  const layout = runLayout(home, id);
  // One claim per video across the check and the start, so two detaches never start two runs.
  const claim = await waitForLock(path.join(layout.root, 'detach.lock'));
  try {
    const now = await videoStatus(home, id);
    if (now.state === 'making' || now.state === 'waiting') {
      out.event({ event: 'running', video_id: id, state: now.state, ...(now.pid ? { pid: now.pid } : {}), output: layout.output });
      return;
    }
    const pid = startDetached({ args: detachedArgs(process.argv.slice(2)), output: layout.output, env: process.env });
    const record: DetachedRecord = { pid, started_at: new Date().toISOString(), output: layout.output };
    await writeJson(layout.detached, record);
    out.event({ event: 'started', video_id: id, pid, output: layout.output });
  } finally {
    await claim();
  }
}

videoCommand
  .command('make <id>')
  .description('Make an approved video: the same command resumes it after a stop or a crash')
  .option('--detach', 'start it in a process of its own on this computer, print one JSON line and return; `video status <id>` follows it')
  .option('--json', 'print one JSON event per line, ending with a JSON result line')
  .option('--patched <steps>', 'Make it with these steps’ edited code (comma-separated), taken out with video step --edit')
  .addHelpText('after', EXIT_HELP)
  .action(async (id: string, opts: { detach?: boolean; json?: boolean; patched?: string }) => {
    const detach = !!opts.detach && process.env[DETACHED_ENV] !== '1';
    const out = detach ? detachOutput() : output(!!opts.json);
    try {
      if (detach) await makeDetached(id, out);
      else await makeHere(id, out, opts.patched ? patchedSteps(opts.patched) : undefined);
    } catch (error) {
      // Whatever went wrong still ends on the result and its stable exit code.
      const message = error instanceof KitStop ? error.message : 'This video could not be made right now. Run the same command again; what was made so far is kept.';
      if (!(error instanceof KitStop)) console.error(error instanceof Error ? error.message : String(error));
      const code = error instanceof KitStop ? error.code : 'tool_failed';
      finish(id, kitHome(), { status: error instanceof KitStop && error.reason === 'stop' ? 'stopped' : 'failed', message, ...(code ? { code } : {}) }, out, true);
    } finally {
      out.restore();
      // The run is over and its lock given back: a handle a part left open (a browser, say) must not keep the command running.
      exitWhenDone();
    }
  });

/** The status as lines for the person. */
function statusLines(status: VideoStatus): string[] {
  const head =
    status.state === 'making'
      ? 'This video is being made on this computer now.'
      : status.state === 'waiting'
        ? 'This video waits for another video on this computer to finish, then starts by itself.'
        : status.state === 'not_started'
          ? 'This video hasn’t been made on this computer yet.'
          : (status.message ?? 'The last run of this video ended.');
  const rows = status.state === 'making' || status.state === 'waiting' ? (status.steps ?? []).filter((row) => row.state !== 'todo').map(lineOf) : [];
  const sheet = status.contact_sheet ? [`Frame sheet: ${status.contact_sheet} (\`video verify ${status.video_id}\` says what to look for)`] : [];
  return [head, ...rows, ...sheet, ...(status.log ? [`Log: ${status.log}`] : [])];
}

videoCommand
  .command('status <ids...>')
  .description('How each video is going on this computer: being made, waiting, or how its last run ended')
  .option('--json', 'print each as one JSON line')
  .action(async (ids: string[], opts: { json?: boolean }) => {
    for (const id of ids) {
      const status = await videoStatus(kitHome(), id);
      if (opts.json) console.log(JSON.stringify(status));
      else for (const line of [...(ids.length > 1 ? [`${id}:`] : []), ...statusLines(status)]) console.log(line);
    }
  });

videoCommand
  .command('verify <ids...>')
  .description('Where each finished video and its frame sheet are on this computer, and what to look for before saying it is ready')
  .option('--json', 'print each as one JSON line')
  .action(async (ids: string[], opts: { json?: boolean }) => {
    for (const id of ids) {
      const found = await verifyOf(kitHome(), id);
      if (!found.final) process.exitCode = 1;
      if (opts.json) console.log(JSON.stringify(found));
      else for (const line of [...(ids.length > 1 ? [`${id}:`] : []), ...verifyLines(found)]) console.log(line);
    }
  });

videoCommand
  .command('log <id>')
  .description('The newest run log of the video on this computer, for support')
  .option('--lines <n>', 'how many of its last lines to print', '50')
  .option('--path', 'print only where the log is')
  .action(async (id: string, opts: { lines: string; path?: boolean }) => {
    const file = await latestRunLog(runLayout(kitHome(), id));
    if (!file) {
      console.log('No run of this video has a log on this computer yet.');
      process.exitCode = 1;
      return;
    }
    if (opts.path) {
      console.log(file);
      return;
    }
    const count = Math.min(Math.max(Number.parseInt(opts.lines, 10) || 50, 1), 5000);
    for (const line of (await tailOf(file, count)) ?? []) console.log(line);
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
