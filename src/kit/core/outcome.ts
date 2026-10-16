// How a `video make` ended, for whoever runs it: one stable exit code per outcome, the JSON last
// line `--json` prints, and the record `video status` reads back. An exit code never changes
// meaning; a new outcome gets a new code.
import { open, readdir, stat } from 'fs/promises';
import { renameSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import type { ProgressStep } from '../line/types';
import { LOOK_FOR, type Eyes, type SheetTile, type ReviewAudio } from './eyes';
import { hashFile } from './files';
import { runLayout, type RunLayout } from './paths';
import type { MakeResult } from './run';
import { isAlive, readJson, runLockHeld } from './save';

/** The exit code of each outcome. 2 is left to the command line's own usage errors. */
export const EXIT_CODES = {
  /** The video is made and passed its checks. */
  done: 0,
  /** It can't go on as it is: the plan, a check or a part needs a change first. */
  failed: 1,
  /** The person or the card stopped it. */
  stopped: 3,
  /** Something on the way failed for now: the same command carries on and keeps what was made. */
  run_again: 4,
  /** This video needs a newer GooseWorks than this computer could get. */
  update_kit: 5,
  /** This computer needs to sign in to GooseWorks, with the account the video belongs to. */
  sign_in: 6,
} as const;

export type Outcome = keyof typeof EXIT_CODES;

/** Codes the server keeps the video in Making for (gooseworks-app video-line/run-failure.ts RESUMABLE_CODES). */
export const RESUMABLE_CODES: ReadonlySet<string> = new Set(['timeout', 'tool_failed', 'needs_missing', 'provider_slow', 'price_unavailable', 'stopped_here']);

/** Codes a run stops on that the same command gets past later, besides the line's own resumable ones. */
const RUN_AGAIN_CODES: ReadonlySet<string> = new Set([
  ...RESUMABLE_CODES,
  'unreachable',
  'bad_cache',
  'parts_not_ready',
  'plan_changed',
  'line_unavailable',
  'internal_error',
]);

/** What an end says, as far as the outcome goes. */
export type Ended = Pick<MakeResult, 'status'> & { code?: string; next?: string };

export function outcomeOf(result: Ended): Outcome {
  if (result.status === 'done') return 'done';
  if (result.status === 'update_kit') return 'update_kit';
  if (result.next === 'sign_in') return 'sign_in';
  if (result.next === 'retry' || (result.code && RUN_AGAIN_CODES.has(result.code))) return 'run_again';
  return result.status === 'stopped' ? 'stopped' : 'failed';
}

/** last-result.json, and the JSON last line of `video make --json`. */
export interface ResultRecord {
  event: 'result';
  video_id: string;
  status: MakeResult['status'] | 'not_started';
  outcome: Outcome;
  exit_code: number;
  /** The words for the person. */
  message: string;
  code?: string;
  /** The finished video on this computer. */
  final?: string;
  /** Frames across the finished video, to look at before saying it is ready (`video verify` says what to look for). */
  contact_sheet?: string;
  /** What the final checks noted without failing the video. */
  warnings?: string[];
  /** This run's own log, for support. */
  log?: string;
  ended_at: string;
}

export function resultRecord(videoId: string, result: Ended & { message: string; final?: string; contact_sheet?: string; warnings?: string[]; log?: string }, at = new Date()): ResultRecord {
  const outcome = outcomeOf(result);
  return {
    event: 'result',
    video_id: videoId,
    status: result.status,
    outcome,
    exit_code: EXIT_CODES[outcome],
    message: result.message,
    ...(result.code ? { code: result.code } : {}),
    ...(result.status === 'done' && result.final ? { final: result.final } : {}),
    ...(result.status === 'done' && result.contact_sheet ? { contact_sheet: result.contact_sheet } : {}),
    ...(result.status === 'done' && result.warnings?.length ? { warnings: result.warnings } : {}),
    ...(result.log ? { log: result.log } : {}),
    ended_at: at.toISOString(),
  };
}

/**
 * Saves how the run ended. Written in one go, so a process that is ending right after (or being
 * ended) still leaves the whole record; a failed write never hides the run's own words.
 */
export function saveResult(layout: RunLayout, record: ResultRecord): void {
  try {
    mkdirSync(layout.root, { recursive: true, mode: 0o700 });
    const temp = `${layout.result}.${process.pid}.pending`;
    writeFileSync(temp, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, layout.result);
  } catch {
    // The run's words are printed either way.
  }
}

/** detached.json: the process making this video in the background. */
export interface DetachedRecord {
  pid: number;
  started_at: string;
  output: string;
}

/** The card's rows as the run left them, saved for `video status`. */
export interface ProgressRecord {
  note: string;
  steps: ProgressStep[];
  at: string;
}

/** What `video status` says about one video on this computer. */
export interface VideoStatus {
  event: 'status';
  video_id: string;
  /** making: a run is going; waiting: a detached run waits for another to finish first; else how the last run ended. */
  state: 'making' | 'waiting' | Outcome | 'not_started';
  /** The detached process, while it lives. */
  pid?: number;
  note?: string;
  steps?: ProgressStep[];
  /** The last run's words and exit code, once it ended. */
  message?: string;
  exit_code?: number;
  final?: string;
  contact_sheet?: string;
  warnings?: string[];
  log?: string;
  output?: string;
  updated_at?: string;
}

/** The newest run's own log, or null when no run of this video has one here. */
export async function latestRunLog(layout: RunLayout): Promise<string | null> {
  const names = await readdir(layout.runs).catch(() => [] as string[]);
  const logs = names.filter((name) => name.endsWith('.ndjson')).sort();
  return logs.length ? path.join(layout.runs, logs[logs.length - 1]) : null;
}

/** The last `lines` lines of a file, or null when it can't be read. */
export async function tailOf(file: string, lines: number): Promise<string[] | null> {
  const handle = await open(file, 'r').catch(() => null);
  if (!handle) return null;
  try {
    // Read back from the end in chunks until enough lines are in hand, never more than TAIL_MAX_BYTES.
    const size = (await handle.stat()).size;
    const chunks: Buffer[] = [];
    let start = size;
    let newlines = 0;
    while (start > 0 && newlines <= lines && size - start < TAIL_MAX_BYTES) {
      const length = Math.min(TAIL_CHUNK, start);
      start -= length;
      const chunk = Buffer.alloc(length);
      await handle.read(chunk, 0, length, start);
      chunks.unshift(chunk);
      for (const byte of chunk) if (byte === 10) newlines++;
    }
    const all = Buffer.concat(chunks).toString('utf8').split('\n');
    // The first piece may be the end of a line cut by the chunk edge.
    if (start > 0) all.shift();
    const kept = all.filter((line) => line.length > 0);
    return kept.slice(Math.max(kept.length - lines, 0));
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

const TAIL_CHUNK = 64 * 1024;
const TAIL_MAX_BYTES = 8 * 1024 * 1024;

/** Reads the run folder: is a run going, how far it got, and how the last one ended. */
export async function videoStatus(home: string, videoId: string): Promise<VideoStatus> {
  const layout = runLayout(home, videoId);
  const [detached, result, progress, held, log] = await Promise.all([
    readJson<DetachedRecord>(layout.detached),
    readJson<ResultRecord>(layout.result),
    readJson<ProgressRecord>(layout.progress),
    runLockHeld(layout),
    latestRunLog(layout),
  ]);
  // A detached run that already left its result is over, even if its pid now belongs to another process.
  const endedSince = detached && result && typeof result.ended_at === 'string' && result.ended_at >= detached.started_at;
  const background = detached && !endedSince && isAlive(detached.pid) ? detached : null;
  const rows = progress && Array.isArray(progress.steps) ? { note: progress.note, steps: progress.steps, updated_at: progress.at } : {};
  const where = { ...(log ? { log } : {}), ...(detached?.output ? { output: detached.output } : {}) };
  if (held || background) {
    return {
      event: 'status',
      video_id: videoId,
      state: held ? 'making' : 'waiting',
      ...(background ? { pid: background.pid } : {}),
      ...rows,
      ...where,
    };
  }
  if (result && typeof result.exit_code === 'number' && result.outcome in EXIT_CODES) {
    return {
      event: 'status',
      video_id: videoId,
      state: result.outcome,
      message: result.message,
      exit_code: result.exit_code,
      ...(result.final ? { final: result.final } : {}),
      ...(result.contact_sheet ? { contact_sheet: result.contact_sheet } : {}),
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
      ...rows,
      ...where,
      updated_at: result.ended_at,
    };
  }
  return { event: 'status', video_id: videoId, state: 'not_started', ...rows, ...where };
}

/** What `video verify` says about one video: where its final and frame sheet are, and what to look for. */
export interface VerifyRecord {
  event: 'verify';
  video_id: string;
  final?: string;
  contact_sheet?: string;
  tiles?: SheetTile[];
  /** What the final checks noted without failing the video. */
  warnings: string[];
  look_for: string[];
  review_status?: 'required' | 'incomplete';
  output_sha256?: string;
  coverage?: Eyes['coverage'];
  audio?: ReviewAudio;
}

/** Reads the finished video's folder for `video verify`. */
export async function verifyOf(home: string, videoId: string): Promise<VerifyRecord> {
  const layout = runLayout(home, videoId);
  const final = path.join(layout.final, 'final.mp4');
  const [eyes, result, made] = await Promise.all([
    readJson<Eyes>(path.join(layout.final, 'eyes.json')),
    readJson<ResultRecord>(layout.result),
    stat(final).then(
      (info) => info.isFile(),
      () => false,
    ),
  ]);
  const record: VerifyRecord = { event: 'verify', video_id: videoId, warnings: [], look_for: LOOK_FOR };
  // Only the final the last run finished and our server passed: never a leftover from a run that ended otherwise.
  if (!made || result?.status !== 'done' || result.final !== final) return record;
  const current = await hashFile(final).catch(() => null);
  const sameOutput = Boolean(current && eyes?.output_sha256 && current.sha256 === eyes.output_sha256);
  const sheet = typeof eyes?.contact_sheet === 'string' ? eyes.contact_sheet : null;
  const sheetReady = Boolean(sheet && await stat(sheet).then((info) => info.isFile(), () => false));
  const warned = Array.isArray(result.warnings) ? result.warnings : (eyes?.warnings ?? []).map((w) => w.message);
  const audioReady = !eyes?.audio?.required || Boolean(eyes.audio.final_mix && !eyes.warnings?.some((warning) => warning.check === 'review_audio') && (await Promise.all([eyes.audio.final_mix, ...(eyes.audio.before_sound ? [eyes.audio.before_sound] : [])].map((file) => stat(file).then((info) => info.isFile(), () => false)))).every(Boolean));
  return {
    ...record,
    final,
    ...(sameOutput && sheetReady ? { contact_sheet: sheet!, tiles: eyes!.tiles } : {}),
    ...(sameOutput ? { output_sha256: current!.sha256, coverage: eyes?.coverage, audio: eyes?.audio } : {}),
    review_status: sameOutput && sheetReady && eyes?.coverage?.complete && audioReady ? 'required' : 'incomplete',
    warnings: [...warned.filter((w): w is string => typeof w === 'string'), ...(!sameOutput ? ['Review evidence is missing or belongs to different output bytes. Review the actual current video.'] : [])],
  };
}

/** `video verify` for the person, or the AI, about to say the video is ready. */
export function verifyLines(found: VerifyRecord): string[] {
  if (!found.final) return ['This video hasn’t been finished on this computer, so there is nothing to look at yet.'];
  return [
    `The finished video: ${found.final}`,
    found.contact_sheet
      ? `Its frame sheet: ${found.contact_sheet} (frames across the video, labelled by scene: S2 4.1 is scene 2 at 4.1 seconds, END the end card)`
      : 'No frame sheet was made for it, so watch the video itself.',
    'File checks passed; picture and audio review is still required. This command does not certify clean speech or correct product scale.',
    ...(found.audio?.final_mix ? [`Full final audio: ${found.audio.final_mix}`] : []),
    ...(found.audio?.before_sound ? [`Audio before the sound layer: ${found.audio.before_sound} (may contain source ambience; compare it with the final mix)`] : []),
    ...(found.audio?.windows ?? []).map((window) => `Listen closely at ${window.start_s.toFixed(2)}–${window.end_s.toFixed(2)} seconds (${window.reason === 'cut' ? 'cut boundary' : 'gap between recognised words; may be intentional silence'}).`),
    ...(found.review_status === 'incomplete' ? ['Review evidence is incomplete. Do not call the video ready until the missing checks are performed on the actual output.'] : []),
    'Before you say it is ready, check:',
    ...found.look_for.map((item) => `- ${item}`),
    'If any of that is wrong, it isn’t ready: say what you saw and fix that scene first.',
    ...found.warnings.map((warning) => `Our check noted: ${warning}`),
  ];
}
