// `gooseworks video make <id>`, in order (part-interface.md section 8):
//  1. the hand-over (token, frozen plan, parts lock, style package);
//  2. a kit that is too old stops here and updates itself;
//  3. the run folder and its lock; the style package, checked;
//  4. every locked part loaded and checked: nothing is spent before this;
//  5. the plan's files downloaded and checked;
//  6. the style's timeline in order, saving after every piece;
//  7. the layers that are on, in the fixed order brand, captions, sound, check;
//  8. one local fix when the check fails;
//  9. the upload and our server's check, with one fix after a first fail;
// 10. done. The run folder stays, so the same command resumes at any time.
//
// The core knows the style file's grammar, the part interface, the four layer
// slots, the line and the save layout. It knows nothing about any one style.
import { copyFile, mkdir, readFile, rename, rm } from 'fs/promises';
import * as path from 'path';
import type {
  BrandKit,
  CaptionLook,
  CheckVerdict,
  FileRef,
  FixHint,
  JsonObject,
  LayerSlot,
  ModelNeed,
  OutputExpectation,
  PartContext,
  PartKind,
  PartRef,
  PartsLock,
  RunRecord,
  StepRecord,
  Timeline,
} from '../part-interface';
import { LineError, lineWords, linkedSignal, sleep as realSleep, type Sleep, type VideoLine } from '../line/client';
import { MAX_CAPTIONS_BYTES, MAX_UPLOAD_BYTES, type ApprovedPlan, type DeviceAnswer, type HandedVideo, type HandOver, type ProgressFailure, type ProgressStep, type UploadCheck, type CheckReason } from '../line/types';
import { bindInputs } from './bind';
import { lookAtFinal, type Eyes } from './eyes';
import { CONTENT_DIMENSIONS, MAX_ZOOM, assemblyPictureSources, cropZoom, finalContentReviewProblems, measuredFinalDurationMs, normalizeAssemblyTimeline, portableTimeline } from './assembly-timeline';
import { FINAL_MEASURE_FORMAT, finalMeasureFailures, measureFinal, type FinalMeasure } from './final-measure';
import { RESUMABLE_CODES } from './outcome';
import { canonicalHash, hashView, isFileRef, pieceSeed, sha256Hex, stepHash } from './canonical';
import { deviceId, deviceReport } from './device';
import { asPartError, KitStop, lineStop, PartError } from './errors';
import { fileRef, hashFile, intact, materialize } from './files';
import type { KitHost, LoadedPart } from './host';
import type { KitLog } from './log';
import { lockedRef } from './lock';
import { patchLockProblem, patchedFiles, readPatch, stepPatchHash, type KitPatch } from './patch';
import { isInside, runLayout, runName, type RunLayout } from './paths';
import { FAILED_TWICE, PieceCache, PieceFailure, pieceOrderer } from './pieces';
import { MAX_CHARS, plainWords } from './plain-words';
import { lineOf, ProgressBook, rowOf, StepLines, type RowKey } from './progress';
import { LAST_WORD_MS, ProgressReporter } from './progress-reporter';
import { readJson, RunStore, takeRunLock, writeJson } from './save';
import { assertCheckable, schemaErrors } from './schema';
import { recordRefusal } from './refusal-log';
import { withoutSignedLinks } from './secrets';
import { fetchStyle, readLocalStyle, type LoadedStyle } from './style';
import { inspectFfmpeg, kitTools, toolchainId, type Toolchain } from './toolchain';
import { PartLoadError } from '../parts/loader';
import { KIT_DEV_ENV } from '../env';
import { interfaceRefusal, KIT_VERSION, kitRangeRefusal } from './version';
import { getVersion } from '../../version';

export const LAYER_ORDER: readonly LayerSlot[] = ['brand', 'captions', 'sound', 'check'];
const SLOT_KIND: Record<LayerSlot, PartKind> = { brand: 'compose', captions: 'caption', sound: 'mix', check: 'check' };
/** Matches the backend upload manifest limit, including source timeline and full rubric. */
const MAX_MANIFEST_BYTES = 128 * 1024;
/** The server's checks a layer can redo. */
const SERVER_CHECK_SLOT: Record<string, LayerSlot> = { sound: 'sound', captions: 'captions' };
/** Pixel size of each aspect the plan may pick (short side 1080). */
const ASPECT_SIZE: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};

export interface MakeDeps {
  home: string;
  env: NodeJS.ProcessEnv;
  line: VideoLine;
  host: KitHost;
  log: KitLog;
  /** Where this kit talks to: production refuses the dev folders. */
  environment: 'production' | 'staging' | 'local';
  /** Found tools; when left out the core finds (and sets up) them. */
  tools?: Toolchain;
  sleep?: Sleep;
  heartbeatMs?: number;
  /** How long the run's last report may take once it ends (default 30 s). */
  lastWordMs?: number;
  /** The longest this run may take; by default worked out from its parts, at most RUN_CEILING_MAX_MS. */
  ceilingMs?: number;
  now?: () => Date;
  /** Ctrl-C from the command. */
  signal?: AbortSignal;
  /**
   * Ends the process when the run has stopped but something it started won't let go: called with the run's
   * result once the last word's deadline and a short grace have passed. The command's own exit, never the core's.
   */
  forceEnd?: (result: MakeResult) => void;
  /** Steps to run from their edited copies (`video make <id> --patched <step>`). */
  patched?: string[];
}

/** What every end carries: the code a failure was reported with, and this run's own log. */
interface EndFacts {
  code?: string;
  /** The line's next step when the line itself ended the run. */
  next?: string;
  log?: string;
}

export type MakeResult =
  | ({ status: 'done'; message: string; final?: string; contact_sheet?: string; warnings?: string[] } & EndFacts)
  | ({ status: 'stopped' | 'failed'; message: string } & EndFacts)
  | ({ status: 'update_kit'; message: string; min_version?: string } & EndFacts);

/** The longest one run may take, whatever its parts: past it the run stops and the same command carries on. */
export const RUN_CEILING_MAX_MS = 60 * 60_000;
/** The shortest ceiling, so a style of quick parts still has room for a slow provider. */
export const RUN_CEILING_MIN_MS = 20 * 60_000;
/** A run may take this many times its parts' typical time before it is cut short. */
const CEILING_FACTOR = 4;
/** After the last word's deadline, how long the process may still take to end on its own. */
const EXIT_GRACE_MS = 5_000;
/** Whatever the last word's deadline, the process ends this soon after the run does. */
const EXIT_WITHIN_MS = 30_000;
/** The person's words when the run reached its ceiling. */
export const CEILING_WORDS = 'Making this video took much longer than it should, so this run stopped. Run the same command again; what was made so far is kept.';

/** One fix: re-run this step or layer with these extra inputs (a new round makes a new step hash). */
interface Fix {
  target: string;
  inputs: JsonObject;
  round: number;
  from: 'local' | 'server';
}

/** run.json as the kit writes it: the contract's record plus the fixes in force, so a restart keeps them. */
type KitRunRecord = RunRecord & { fixes?: Fix[]; patch_sha256?: string | null };

interface StepSpec {
  id: string;
  ref: PartRef;
  loaded: LoadedPart;
  inputs: Record<string, unknown>;
  models: ModelNeed[];
  fix?: number;
}

const CHECK_FAILED = 'The video didn’t pass the final check.';
/** For a failure that repeats on every run of the same plan. */
const PLAN_FIX = 'Change the plan, then make it again.';
/** For a failure a new run of the same command may get past. */
const RUN_AGAIN = 'Run the same command again; what was made so far is kept.';
const PLAN_CHANGE = `This video can’t be made from this plan. ${PLAN_FIX}`;
/** The server's `failure.code` shape. */
const FAILURE_CODE = /^[a-z][a-z0-9_]{0,39}$/;
/** Codes the line blames on the plan only when a part refused it (`from_part`), not when the kit's own check did. */
const PLAN_CODES: ReadonlySet<string> = new Set(['bad_input', 'output_invalid']);
/**
 * Parts that only line a clip already made (and paid for) up with the plan's lines and cut it. Their
 * refusal is ours, not the plan's: the same command carries on. Kept the same as gooseworks-app
 * video-line/run-failure.ts TAKE_FIT_PARTS, which blames the line's side for them.
 */
export const TAKE_FIT_PARTS: ReadonlySet<string> = new Set(['transcribe-whisper', 'speech-recut']);
/** The person's words for a take-fit part's refusal, the same as gooseworks-app's TAKE_FIT_MESSAGE. */
export const TAKE_FIT_WORDS =
  'The clip was made, but we couldn’t line it up with the plan’s lines to cut it. That’s on our side, not the plan. Run it again; what was made so far is kept.';
/** Stops the person chose: Ctrl-C here, or Stop on the card (the line's refusal). They need no support. */
const OWN_STOPS: ReadonlySet<string> = new Set(['stopped_here', 'video_stopped']);
/**
 * Stops on this computer's side or ours that the line must hear, or the video waits in Making until it
 * goes quiet. This computer's own trouble goes as `tool_failed`, which never counts against us; the
 * rest keep their code, so the line alerts us. Stale-plan and the line's own refusals are left out.
 */
const REPORTED_STOPS: ReadonlyMap<string, string> = new Map([
  ['stopped_here', 'stopped_here'],
  ['unreachable', 'tool_failed'],
  ['bad_cache', 'tool_failed'],
  ['style_unreachable', 'tool_failed'],
  ['parts_not_ready', 'parts_not_ready'],
  ['price_unavailable', 'price_unavailable'],
  ['file_unavailable', 'file_unavailable'],
  ['piece_lost', 'piece_lost'],
]);

/**
 * The card's notes while a custom video waits on its maker's agent (plain words, at most 200
 * characters, never a path). The run is still on: the same command resumes it.
 */
export const WAITING_FOR_SOURCE_REVIEW = 'Waiting for the new clips to be reviewed before the edit goes on';
export const WAITING_FOR_CONTENT_REVIEW = 'Waiting for the finished video’s picture and sound review before it is sent';
export const WAITING_FOR_MEASURED_FIX = 'The finished video failed a sound or picture measurement and is being fixed before it is sent';

/** At most this many warnings go up with the video, for its delivery summary. */
const MAX_SENT_WARNINGS = 6;

/** What the final check noted without failing the video, in its own words. */
function verdictWarnings(verdict: CheckVerdict): CheckReason[] {
  const warned: CheckReason[] = [];
  for (const check of verdict.checks as Array<{ code: string; status: string; message?: unknown }>) {
    if (check.status === 'warn' && typeof check.message === 'string' && check.message.trim()) warned.push({ check: check.code, message: check.message.trim() });
  }
  return warned;
}

/** The finished video and its captions while our server checks them; final.mp4 only once it passes. */
const CANDIDATE = 'final.candidate.mp4';
const CANDIDATE_CAPTIONS = 'captions.candidate.vtt';

/** A step ran out of time while a piece it ordered was still being made at the maker. */
const PROVIDER_SLOW = 'provider_slow';

/**
 * The person's words for a piece the maker didn't send back in time, by the step's row (the server's
 * nouns). Whether it was charged is the server's to say: the piece may still finish after the step gave up.
 */
function slowWords(row: RowKey | null): string {
  const what =
    row === 'voice' ? 'One of the voice lines' : row === 'pictures' ? 'One of the pictures' : row === 'clips' || row === 'lips' ? 'One of the clips' : row === 'music' ? 'The music' : 'One of the parts';
  return `${what} we ordered for this video didn’t come back in time. ${RUN_AGAIN}`;
}

/** What a run was made from: a failure report only stands for a run made from the same. */
interface ReportKey {
  quote_id: string;
  plan_sha256: string;
  lock_sha256: string;
  kit: string;
  toolchain: string;
}

/** pending-report.json: a failure report the line never took. */
type PendingReport = ReportKey & { report: 1; failure: ProgressFailure; saved_at: string; resumable?: true };

/** The line refused the hand-over because this computer has no video browser yet. */
function missingBrowser(error: LineError): boolean {
  const missing = error.details?.missing;
  return Array.isArray(missing) && missing.includes('browser');
}

/** An older line refused the hand-over's `setup` claim as a field it doesn't know. */
function namesSetup(error: LineError): boolean {
  if (error.status !== 400) return false;
  const fields = Array.isArray(error.details?.fields) ? (error.details.fields as unknown[]) : [];
  if (fields.some((f) => typeof f === 'string' && /(^|\.)setup$/.test(f))) return true;
  return /\bsetup\b/.test(`${error.fix} ${error.message}`);
}

type Browser = Awaited<ReturnType<KitHost['browser']['check']>>;

/** A part that would not load, in plain words: which part and why go to the log. */
function loadStop(error: unknown): KitStop {
  const code = error instanceof PartLoadError ? error.code : undefined;
  switch (code) {
    case 'kit_range':
      return new KitStop('This video needs a newer video kit.', 'update_kit', code);
    case 'unreachable':
      return new KitStop('This video’s parts could not be downloaded right now. Run the same command again in a minute.', 'stop', code);
    case 'bad_cache':
      return new KitStop('The video kit’s folder on this computer is busy or can’t be used. Run the same command again in a minute.', 'stop', code);
    case 'withdrawn':
      return new KitStop(`A part this video uses was withdrawn. ${PLAN_CHANGE}`, 'change_request', code);
    default:
      return new KitStop(`A part this video uses can’t run. ${PLAN_CHANGE}`, 'change_request', code);
  }
}

/**
 * The code the line hears for a step's last failure. A provider failure a later run can get past
 * (its piece has an attempt left, or no piece is named) is reported as `tool_failed`, which keeps
 * the video in Making; the line ends the video on `provider_failed`.
 */
function reportedCode(error: PartError): string {
  if (error.code !== 'provider_failed') return error.code;
  return error instanceof PieceFailure && error.spent ? 'provider_failed' : 'tool_failed';
}

/** The words of the first `verdict.reasons[]` entry for `check`, else of the first entry with words; '' when none has any. */
function reasonFor(verdict: CheckVerdict, check: string | null): string {
  const reasons = (verdict as { reasons?: unknown }).reasons;
  if (!Array.isArray(reasons)) return '';
  const worded = reasons.filter((r): r is { check?: unknown; message: string } => !!r && typeof r === 'object' && typeof r.message === 'string' && r.message.trim() !== '');
  return ((check !== null && worded.find((r) => r.check === check)) || worded[0])?.message.trim() ?? '';
}

/**
 * Plain words for a part's failure: the line's own words when it said them, and a part's own refusal
 * of the plan (it writes those for the person) when it reads as plain words. Any other detail stays in the log.
 */
function failureWords(error: PartError, names: readonly string[] = []): string {
  if (error instanceof PieceFailure && error.spent) return FAILED_TWICE;
  if (error instanceof PieceFailure) return pieceWords(error);
  switch (error.code) {
    case 'provider_rejected':
      return 'One part of this video was refused by the maker. Change that scene in the plan, then make it again.';
    case 'over_quote':
      return 'This video reached its approved price, so it stopped. Nothing past the price was charged.';
    case 'needs_missing':
      return 'This computer is missing something this video needs. Run the computer check, then make it again.';
    case 'timeout':
      return 'Part of this video took too long. Run the same command again; what was made so far is kept.';
    case 'bad_input':
    case 'output_invalid':
      return refusalWords(error, names);
    default:
      return 'Part of this video could not be made. Run the same command again; what was made so far is kept.';
  }
}

/** A failed piece in the server's words: its sentence for the person, else its error and fix. The money and the next step are the server's to say. */
function pieceWords(error: PieceFailure): string {
  const { line } = error;
  return line.say?.trim() || [line.error, line.fix].filter(Boolean).join(' ');
}

/** A part's refusal first, then what to do, within the card's length; the generic words when it has none. */
function refusalWords(error: PartError, names: readonly string[]): string {
  if (!error.fromPart || !error.detail) return PLAN_CHANGE;
  const said = plainWords(error.detail, '', names, MAX_CHARS - PLAN_FIX.length - 1);
  const words = said ? `${said.charAt(0).toUpperCase()}${said.slice(1)} ${PLAN_FIX}` : PLAN_CHANGE;
  return words.length <= MAX_CHARS ? words : PLAN_CHANGE;
}

function checkLock(raw: unknown, videoId: string, plan: ApprovedPlan): PartsLock {
  const lock = raw as PartsLock;
  if (!lock || lock.lock !== 1 || lock.video_id !== videoId || !lock.parts || !lock.layers || !lock.style) {
    throw new KitStop('This video’s parts list can’t be read.', 'change_request');
  }
  if (lock.style.id !== plan.style_id || lock.style.version !== plan.style_version) throw new KitStop('This video’s parts list is for another style.', 'change_request');
  return lock;
}

/** What the finished video must be, handed to every layer as `expect`. Exported for tests. */
export function expectationOf(style: LoadedStyle['style'], plan: ApprovedPlan): OutputExpectation {
  const aspect = String(plan.body.aspect ?? style.aspects?.[0] ?? '');
  const size = ASPECT_SIZE[aspect];
  if (!size) throw new KitStop('This video’s shape can’t be made by the kit.', 'change_request');
  const scenes = Array.isArray(plan.body.scenes) ? (plan.body.scenes as Array<{ line?: unknown }>) : [];
  const script = scenes.map((s) => s?.line).filter((l): l is string => typeof l === 'string' && l.length > 0);
  const captionLook = captionLookOf(style.traits?.caption_look);
  return {
    aspect: aspect as OutputExpectation['aspect'],
    ...size,
    duration_s: { min: style.duration.min_seconds, max: style.duration.max_seconds },
    speech: (style.traits?.speech ?? 'none') as OutputExpectation['speech'],
    captions: style.traits?.captions === true,
    end_card: style.traits?.end_card === true,
    qc_flags: Array.isArray(style.traits?.qc_flags) ? style.traits.qc_flags : [],
    ...(script.length ? { script } : {}),
    ...(captionLook ? { caption_look: captionLook } : {}),
    // So the check layer holds loudness to the sound layer's mark only when that layer ran.
    layers: { brand: style.layers?.brand === true, captions: style.layers?.captions === true, sound: style.layers?.sound === true, check: true },
  };
}

/** The style's caption look, copied as written when it is an object; the captions layer checks its fields. */
function captionLookOf(look: unknown): CaptionLook | undefined {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return undefined;
  return JSON.parse(JSON.stringify(look)) as CaptionLook;
}

function brandKit(materialized: unknown): BrandKit {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((materialized ?? {}) as Record<string, unknown>)) if (v !== null && v !== undefined) out[k] = v;
  return out as unknown as BrandKit;
}

function fileRefsIn(value: unknown, into: FileRef[] = []): FileRef[] {
  if (isFileRef(value)) into.push(value);
  else if (Array.isArray(value)) value.forEach((v) => fileRefsIn(v, into));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => fileRefsIn(v, into));
  return into;
}

/** One make of one video. */
class Maker {
  private readonly sleep: Sleep;
  private readonly now: () => Date;
  private readonly stop = new AbortController();
  private fatal: KitStop | null = null;
  private readonly stepLines = new StepLines();
  private readonly book = new ProgressBook(() => this.printSteps());
  private reporter!: ProgressReporter;
  private store!: RunStore;
  private layout!: RunLayout;
  private run!: KitRunRecord;
  private cache!: PieceCache;
  private tools!: Toolchain;
  private toolchain = '';
  private browserReady = false;
  private handed!: HandOver;
  private lock: PartsLock | null = null;
  /** The edited steps this run makes the video with, sent with every hand-over. */
  private patch: KitPatch | null = null;
  private style!: LoadedStyle;
  private planScope: unknown;
  private brand!: BrandKit;
  private readonly parts = new Map<string, LoadedPart>();
  private readonly hosted = new Map<string, string>();
  private readonly pieceLocks = new Map<string, Promise<void>>();
  /** Where the run is, for the failure report: a step id or a stage before or after the steps. */
  private at = 'hand-over';
  /** This run's name: its log file and its keys in the order journal. */
  private runId = '';
  private failureSent = false;
  /** The failure reported reads as the plan's by its code, but a new run carries on past it (a take-fit part's). */
  private failureResumable = false;
  /** The run ended on a stop the person chose (Ctrl-C, or Stop on the card), which needs no support. */
  private ownStop = false;
  private ceilingTimer: NodeJS.Timeout | null = null;
  private ceilingFrom = 0;
  private exitTimer: NodeJS.Timeout | null = null;
  private progressSaved: Promise<void> = Promise.resolve();
  /** How the run ended, once it has: what a forced end reports. */
  private result: MakeResult | null = null;

  constructor(private readonly videoId: string, private readonly deps: MakeDeps) {
    this.sleep = deps.sleep ?? realSleep;
    this.now = deps.now ?? (() => new Date());
    deps.signal?.addEventListener('abort', () => this.halt(new KitStop('Stopped on this computer. Run the same command to carry on.', 'stop', 'stopped_here')), { once: true });
  }

  private halt(stop: KitStop): void {
    this.fatal ??= stop;
    if (!this.stop.signal.aborted) this.stop.abort(stop);
    this.armExit();
  }

  /**
   * The run is over, however it ended: whatever still listens to its stop signal (a piece being asked
   * about, a download, a browser) stops too, and the process gets to end within the last word's deadline.
   */
  private endRun(): void {
    if (this.ceilingTimer) clearTimeout(this.ceilingTimer);
    this.ceilingTimer = null;
    if (!this.stop.signal.aborted) this.stop.abort(new KitStop('This run is over.', 'stop'));
    this.armExit();
  }

  /** Once the run has stopped, the command ends the process if the run hasn't returned by the last word's deadline. */
  private armExit(): void {
    if (this.exitTimer || !this.deps.forceEnd) return;
    const end = this.deps.forceEnd;
    this.exitTimer = setTimeout(() => {
      this.deps.log.write('error', 'the run did not end on its own, so the process ends now', { step: this.at });
      if (this.result) return end(this.result);
      const stop = this.fatal;
      const message = stop?.message ?? 'This video could not be made right now. Run the same command again; what was made so far is kept.';
      end(stop?.reason === 'update_kit' ? { status: 'update_kit', message, code: stop.code } : { status: stop?.reason === 'stop' ? 'stopped' : 'failed', message, code: stop?.code ?? 'tool_failed' });
    }, Math.min((this.deps.lastWordMs ?? LAST_WORD_MS) + EXIT_GRACE_MS, EXIT_WITHIN_MS));
    this.exitTimer.unref?.();
  }

  /** From now on this run may take `ms` in all (counted from the first arming); past it, it stops and can carry on. */
  private armCeiling(ms: number): void {
    if (this.stop.signal.aborted) return;
    if (this.ceilingTimer) clearTimeout(this.ceilingTimer);
    this.ceilingFrom ||= Date.now();
    const left = Math.max(this.ceilingFrom + ms - Date.now(), 0);
    this.ceilingTimer = setTimeout(() => {
      this.ceilingTimer = null;
      this.deps.log.write('warn', 'the run reached its time limit', { step: this.at, minutes: Math.round(ms / 60_000) });
      this.halt(new KitStop(CEILING_WORDS, 'failed', 'timeout'));
    }, left);
    this.ceilingTimer.unref?.();
  }

  /** The run's ceiling from its parts' typical times; a fixed one from the deps wins. */
  private ceilingFor(): number {
    if (this.deps.ceilingMs) return this.deps.ceilingMs;
    let typical = 0;
    for (const loaded of this.parts.values()) typical += Math.max(loaded.manifest.timing?.typical_s ?? 0, 0);
    return Math.min(Math.max(typical * 1000 * CEILING_FACTOR, RUN_CEILING_MIN_MS), RUN_CEILING_MAX_MS);
  }

  private say(line: string): void {
    this.deps.log.say(line);
  }

  async make(): Promise<MakeResult> {
    try {
      return await this.makeOnce();
    } finally {
      this.endRun();
      if (this.exitTimer) clearTimeout(this.exitTimer);
    }
  }

  private async makeOnce(): Promise<MakeResult> {
    const { deps } = this;
    let dev: { parts: string | null; styles: string | null };
    try {
      dev = this.devFolders();
      if (deps.patched?.length) this.patch = await this.readPatch(dev);
    } catch (error) {
      return this.ended(error);
    }
    // The lock comes before the hand-over: a second command for the same video must not take the
    // line's lease from the run already making it.
    // The ceiling counts from here (after the account check), so a slow or stuck setup is bounded too;
    // it is tightened, from the same start, once the parts' timing is known.
    this.armCeiling(deps.ceilingMs ?? RUN_CEILING_MAX_MS);
    this.layout = runLayout(deps.home, this.videoId);
    const release = await takeRunLock(this.layout, this.now());
    try {
      return await this.makeLocked(dev);
    } finally {
      await release();
    }
  }

  private async makeLocked(dev: { parts: string | null; styles: string | null }): Promise<MakeResult> {
    const { deps } = this;
    // Every hand-over needs the video tools, so they are set up first. Without the browser yet, the
    // hand-over is a claim, so the card shows the video started while a first run downloads it.
    this.tools = deps.tools ?? (await inspectFfmpeg({ home: deps.home, env: deps.env, setup: true, download: (u, m) => deps.line.download(u, m), say: (l) => this.say(l) }));
    let browser = await this.checkBrowser(false);
    let answer: DeviceAnswer;
    let claimed: boolean;
    try {
      ({ answer, browser, claimed } = await this.handOverFirst(browser));
    } catch (error) {
      if (error instanceof LineError) {
        recordRefusal(deps.home, this.videoId, 'hand-over refused', error);
        if (error.next === 'update_kit') return { status: 'update_kit', message: lineWords(error), code: error.code, next: error.next };
        return { status: 'stopped', message: lineWords(error), code: error.code, next: error.next };
      }
      throw error;
    }
    if (!answer.kit.ok) return { status: 'update_kit', message: 'This video kit is too old for this video.', min_version: answer.kit.min_version };
    if (!answer.line) return { status: 'stopped', message: 'This video can’t be made on this computer right now.' };
    this.handed = answer.line;

    let runLog: string | null = null;
    let result: MakeResult | null = null;
    // From here on the pending report is always kept, whatever fails.
    try {
      const run = deps.log.attachRun({
        index: this.layout.log,
        dir: this.layout.runs,
        name: runName(this.now(), this.handed.quote_id),
        packageVersion: getVersion(),
        fields: { quote_id: this.handed.quote_id },
      });
      this.runId = run.run;
      runLog = run.file;
      const video = answer.line.video ?? answer.video;
      deps.log.write('info', 'video handed over', { quote_id: this.handed.quote_id, stage: this.handed.stage, kit: KIT_VERSION, video: video ?? null, setup_claimed: claimed });
      this.say(startLine(video, deps.environment));
      this.store = new RunStore(this.layout);
      this.cache = new PieceCache(this.layout.pieces);
      this.reporter = new ProgressReporter(deps.line, this.videoId, this.book, deps.log, (message, reason, code, next) => this.halt(new KitStop(message, reason, code, next)), deps.heartbeatMs, this.stop.signal, deps.lastWordMs);
      this.useBrowser(browser);
      const replayed = await this.replayPending();
      if (replayed) return (result = replayed);
      if (this.fatal) throw this.fatal;
      // Reports start now, so checking the style and parts never looks quiet.
      this.reporter.start();
      if (browser.ok) void this.reporter.send(true);
      else await this.setUpBrowser(claimed);
      return (result = await this.makeHandedOver(dev));
    } catch (error) {
      return (result = await this.ended(error));
    } finally {
      this.reporter?.close();
      if (result && runLog) result.log = runLog;
      this.result = result ?? null;
      this.endRun();
      await this.reporter?.flush().catch(() => undefined);
      await this.keepPendingReport().catch((error: unknown) => deps.log.write('warn', 'the failure report could not be saved', { error: error instanceof Error ? error.message : String(error) }));
      // The lock is released by makeOnce, after this.
      await this.progressSaved;
      // Support reads what happened in this run's own log.
      if (runLog && (result?.status === 'failed' || (result?.status === 'stopped' && !this.ownStop))) this.say(`If you contact support, share this file: ${runLog}`);
    }
  }

  /** Each change of the card's rows, as a line for the person running the kit. */
  private printSteps(): void {
    const request = this.book.request();
    const rows = this.stepLines.changed(request.steps, this.now().getTime());
    for (const row of rows) this.deps.log.step(row, lineOf(row));
    if (rows.length && this.layout) this.saveProgress(request.note, request.steps ?? []);
  }

  /** The rows as shown, for `video status`; saved one after another, and never at the run's cost. */
  private saveProgress(note: string, steps: ProgressStep[]): void {
    const record = { note, steps, at: this.now().toISOString() };
    const target = this.layout.progress;
    this.progressSaved = this.progressSaved.then(() => writeJson(target, record)).catch(() => undefined);
  }

  private checkBrowser(setup: boolean): ReturnType<KitHost['browser']['check']> {
    return this.deps.host.browser.check({ home: this.deps.home, setup, env: this.deps.env, say: (l) => this.say(l) });
  }

  private useBrowser(browser: Browser): void {
    this.browserReady = browser.ok;
    this.toolchain = toolchainId(this.tools, browser.ok ? browser.version : null);
  }

  /**
   * The hand-over. Without the browser it is first a claim (`setup: in_progress`), which an older
   * line refuses as an unknown field: it then hands over on the full report as before, setting up
   * the browser first only when the line won't hand over without it. A worker never claims.
   */
  private async handOverFirst(browser: Browser): Promise<{ answer: DeviceAnswer; browser: Browser; claimed: boolean }> {
    const { line } = this.deps;
    if (!browser.ok && !line.isWorker) {
      try {
        return { answer: await line.handOver(this.videoId, { ...(await this.report(browser)), setup: 'in_progress' }, this.patch), browser, claimed: true };
      } catch (error) {
        if (!(error instanceof LineError && namesSetup(error))) throw error;
        this.deps.log.write('info', 'the line does not take a hand-over before setup', { code: error.code });
      }
    }
    try {
      return { answer: await line.handOver(this.videoId, await this.report(browser), this.patch), browser, claimed: false };
    } catch (error) {
      if (!(error instanceof LineError && error.code === 'device_cannot_make' && !browser.ok && missingBrowser(error))) throw error;
      const ready = await this.checkBrowser(true);
      return { answer: await line.handOver(this.videoId, await this.report(ready), this.patch), browser: ready, claimed: false };
    }
  }

  /**
   * A first run's browser download, after the hand-over: the card hears from the kit all the while.
   * Then the full report goes to the line, which still holds a claim or a report without the browser.
   */
  private async setUpBrowser(claimed: boolean): Promise<void> {
    const note = this.book.note;
    this.book.note = 'Setting up your computer for the video';
    void this.reporter.send(true);
    const browser = await this.checkBrowser(true);
    this.useBrowser(browser);
    if (this.fatal) throw this.fatal;
    if (claimed || (browser.ok && !this.deps.line.isWorker)) await this.confirmHandOver(browser, claimed);
    this.book.note = note;
    if (this.fatal) throw this.fatal;
    void this.reporter.send(true);
  }

  /**
   * The full report as a second hand-over, so the line checks what this computer can make and keeps
   * it. A claim must be confirmed: the line checked nothing for it. A report that only adds the browser may fail.
   */
  private async confirmHandOver(browser: Browser, claimed: boolean): Promise<void> {
    // The new hand-over gives the run a new lease, so no report may be on its way under the old one.
    this.reporter.pause();
    try {
      await this.reporter.flush();
      const answer = await this.deps.line.handOver(this.videoId, await this.report(browser), this.patch);
      if (!answer.kit.ok) throw new KitStop('This video kit is too old for this video.', 'update_kit');
      if (answer.line?.quote_id !== this.handed.quote_id) throw new KitStop('The plan for this video changed after this run started. Run the make command again to make the current plan.', 'stop', 'plan_changed');
      this.handed = answer.line;
    } catch (error) {
      if (error instanceof KitStop) throw error;
      if (error instanceof LineError && (claimed || error.code === 'device_cannot_make')) throw lineStop(lineWords(error), error.next, error.code);
      if (claimed) throw error;
      this.deps.log.write('warn', 'the report with the browser could not be sent', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.reporter.resume();
    }
  }

  private report(browser: Browser): ReturnType<typeof deviceReport> {
    return deviceReport({ home: this.deps.home, worker: this.deps.line.isWorker, tools: this.tools, browser });
  }

  private reportKey(): ReportKey | null {
    try {
      return {
        quote_id: this.handed.quote_id,
        plan_sha256: canonicalHash(withoutSignedLinks(this.handed.plan)),
        lock_sha256: this.handed.parts_lock ? canonicalHash(this.handed.parts_lock) : '',
        kit: KIT_VERSION,
        toolchain: this.toolchain,
      };
    } catch {
      return null;
    }
  }

  /**
   * An earlier run's failure report the line never took goes before anything else, when it still
   * stands: the same plan, parts, kit and tools, and a code no new run gets past. Otherwise this
   * run reports for itself.
   */
  private async replayPending(): Promise<MakeResult | null> {
    const saved = await readJson<PendingReport>(this.layout.pendingReport);
    if (!saved) return null;
    const key = this.reportKey();
    const stands =
      saved.report === 1 &&
      !!saved.failure &&
      typeof saved.failure.code === 'string' &&
      typeof saved.failure.detail === 'string' &&
      !RESUMABLE_CODES.has(saved.failure.code) &&
      !saved.resumable &&
      !!key &&
      (Object.keys(key) as Array<keyof ReportKey>).every((field) => saved[field] === key[field]);
    if (!stands) {
      this.deps.log.write('info', 'an earlier run’s failure report no longer stands', { code: saved.failure?.code ?? null });
      await rm(this.layout.pendingReport, { force: true });
      return null;
    }
    const sent = await this.reporter.replay(saved.failure);
    this.deps.log.write(sent === 'taken' ? 'info' : 'warn', 'an earlier run’s failure report', { sent, step: saved.failure.step, code: saved.failure.code });
    if (sent === 'unsent') return null;
    await rm(this.layout.pendingReport, { force: true });
    if (sent === 'refused') return null;
    this.failureSent = true;
    return { status: 'failed', message: saved.failure.detail, code: saved.failure.code };
  }

  /** Keeps a failure report the line never took for the next run; one taken, or a finished video, clears it. */
  private async keepPendingReport(): Promise<void> {
    if (!this.reporter || !this.layout) return;
    const unsent = this.reporter.undelivered;
    const key = unsent ? this.reportKey() : null;
    if (unsent && key) {
      const pending: PendingReport = { report: 1, ...key, failure: unsent, saved_at: this.now().toISOString(), ...(this.failureResumable ? { resumable: true as const } : {}) };
      await writeJson(this.layout.pendingReport, pending);
      this.deps.log.write('warn', 'the failure report was not taken; the next run sends it', { step: unsent.step, code: unsent.code });
    } else if (this.failureSent || this.run?.status === 'done') {
      await rm(this.layout.pendingReport, { force: true });
    }
  }

  /** The edits named on the command, read before the hand-over that carries them. */
  private async readPatch(dev: { parts: string | null }): Promise<KitPatch> {
    if (dev.parts) throw new KitStop(`An edited step runs from the published parts; unset ${KIT_DEV_ENV.partsDir} to make the video with it.`, 'refused');
    if (this.deps.line.isWorker) throw new KitStop('An edited step is made on the computer it was edited on.', 'refused');
    const patch = await readPatch(runLayout(this.deps.home, this.videoId), this.deps.patched ?? []);
    this.deps.log.write('info', 'making with edited steps', { patch_sha256: patch.sha256, steps: patch.steps.map((s) => ({ step: s.step, part: `${s.part.id}@${s.part.version}`, files: s.files.map((f) => f.path) })) });
    return patch;
  }

  private devFolders(): { parts: string | null; styles: string | null } {
    const parts = this.deps.env[KIT_DEV_ENV.partsDir] || null;
    const styles = this.deps.env[KIT_DEV_ENV.stylesDir] || null;
    if ((parts || styles) && this.deps.environment === 'production') {
      throw new KitStop('The dev parts and styles folders work only against staging or a local server.', 'refused');
    }
    return { parts, styles };
  }

  private async ended(error: unknown): Promise<MakeResult> {
    // Nothing but the failure report goes out from here.
    this.reporter?.close();
    let stop = this.fatal ?? (error instanceof KitStop ? error : null);
    this.endRun();
    const reported = !stop || stop.reason === 'update_kit' ? undefined : stop.reason === 'stop' ? REPORTED_STOPS.get(stop.code ?? '') : (stop.code ?? 'change_request');
    if (stop && reported) {
      this.reportFailure(this.at, reported, stop.message);
      await this.reporter?.flush().catch(() => undefined);
      // A take-fit refusal promises the same command carries on, but the line's answer to the report can
      // stop the video (the same step failing again): then the run ends on that, not on a retry it refuses.
      if (stop.next === 'retry' && this.fatal && this.fatal !== stop) stop = this.fatal;
    }
    this.ownStop = stop?.reason === 'stop' && OWN_STOPS.has(stop.code ?? '');
    if (stop) this.deps.log.write('warn', 'the run stopped', { reason: stop.reason, code: stop.code ?? null, message: stop.message });
    if (this.run) {
      this.run.status = stop && stop.reason === 'stop' ? 'stopped' : 'failed';
      await this.saveRun().catch(() => undefined);
    }
    if (stop) {
      const code = stop.code ?? (stop.reason === 'stop' ? undefined : 'change_request');
      if (stop.reason === 'update_kit') return { status: 'update_kit', message: stop.message, ...(code ? { code } : {}) };
      return { status: stop.reason === 'stop' ? 'stopped' : 'failed', message: stop.message, ...(code ? { code } : {}), ...(stop.next ? { next: stop.next } : {}) };
    }
    this.deps.log.write('error', 'the run ended on an error', { step: this.at, error: error instanceof Error ? error.message : String(error) });
    const message = 'This video could not be made right now. Run the same command again; what was made so far is kept.';
    // Not a step's failure (a download or a disk write, say): a new run may get past it.
    this.reportFailure(this.at, 'tool_failed', message);
    await this.reporter?.flush().catch(() => undefined);
    return { status: 'failed', message, code: 'tool_failed' };
  }

  /** Tells the line once why the run gave up; the line's own refusals already ended it on its words. */
  private reportFailure(step: string, code: string, detail: string, fromPart?: boolean, resumable = false): void {
    if (!this.reporter || this.failureSent || this.reporter.refused) return;
    this.failureSent = true;
    this.failureResumable = resumable;
    void this.reporter.fail({ step: step.slice(0, 60), code: FAILURE_CODE.test(code) ? code : 'change_request', detail: detail.trim().slice(0, 2000), ...(fromPart === undefined ? {} : { from_part: fromPart }) });
  }

  /**
   * A stop that waits on a review or a fix the agent makes: before the kit exits, the line hears a
   * running report with a plain note, so the card says what it waits for instead of going quiet.
   * Never throws; a report that can't be sent only costs the card its note.
   */
  private async reportWaiting(note: string): Promise<void> {
    if (!this.reporter || this.reporter.refused) return;
    this.book.note = note;
    this.reporter.resume();
    await this.reporter.send(true).catch(() => undefined);
    await this.reporter.flush().catch(() => undefined);
  }

  private async saveRun(): Promise<void> {
    this.run.updated_at = this.now().toISOString();
    await this.store.writeRun(this.run);
  }

  private async makeHandedOver(dev: { parts: string | null; styles: string | null }): Promise<MakeResult> {
    const { deps, handed } = this;
    const plan = handed.plan;
    // Until the parts say how long they take, the run may take the longest any run may.
    this.armCeiling(deps.ceilingMs ?? RUN_CEILING_MAX_MS);
    this.at = 'plan';
    if (!plan || plan.project_id !== this.videoId || plan.style_id !== handed.style_package?.style_id || plan.style_version !== handed.style_package?.version) {
      throw new KitStop('The plan handed over is not this video’s.', 'change_request');
    }
    if (handed.parts_lock) this.lock = checkLock(handed.parts_lock, this.videoId, plan);
    else if (!dev.parts) throw new KitStop('This video’s parts are not ready yet. Run the same command again in a few minutes.', 'stop', 'parts_not_ready');
    const patchProblem = this.patch && this.lock ? patchLockProblem(this.patch, this.lock) : null;
    if (patchProblem) throw new KitStop(`${patchProblem}`, 'stop', 'patch_refused');

    const planCopy = withoutSignedLinks(plan);
    await mkdir(this.layout.root, { recursive: true, mode: 0o700 });
    await writeJson(this.layout.plan, planCopy);
    if (this.lock) await writeJson(this.layout.partsLock, this.lock);

    const previous = (await this.store.readRun()) as KitRunRecord | null;
    const started = this.now().toISOString();
    this.run = {
      record: 1,
      video_id: this.videoId,
      quote_id: handed.quote_id,
      plan_revision: plan.revision,
      style: { id: plan.style_id, version: plan.style_version },
      plan_sha256: canonicalHash(planCopy),
      lock_sha256: this.lock ? canonicalHash(this.lock) : '',
      device_id: await deviceId(deps.home),
      kit: { version: KIT_VERSION, toolchain: this.toolchain, parts_source: dev.parts ? 'dev' : 'published' },
      status: 'running',
      steps: previous?.steps ?? {},
      local_fix_used: previous?.quote_id === handed.quote_id ? previous.local_fix_used : false,
      fixes: previous?.quote_id === handed.quote_id ? ((previous as KitRunRecord).fixes ?? []) : [],
      upload_attempt: previous?.quote_id === handed.quote_id ? previous.upload_attempt : 0,
      patch_sha256: this.patch?.sha256 ?? null,
      started_at: previous?.started_at ?? started,
      updated_at: started,
    };
    await this.saveRun();

    // The style, then every part: all checked before anything is spent.
    // The style must be exactly the one approved: the package's hash and the plan's must agree.
    if (!plan.style_hash || handed.style_package.style_hash !== plan.style_hash) {
      throw new KitStop('The style handed over is not the one approved for this video.', 'change_request');
    }
    const pin = { id: plan.style_id, version: plan.style_version, hash: plan.style_hash };
    this.at = 'style';
    const note = (why: string, fields: Record<string, unknown>) => deps.log.write('error', why, fields);
    this.style = dev.styles
      ? await readLocalStyle(dev.styles, pin, note)
      : await fetchStyle({ ref: handed.style_package, projectId: this.videoId, dir: this.layout.style, download: (u, m) => deps.line.download(u, m, this.stop.signal), note });
    await this.loadParts(!!dev.parts);
    this.armCeiling(this.ceilingFor());

    // The card's rows show from here, all still to do, while the plan's files come down.
    const planned = (id: string) => ({ id, row: rowOf(this.parts.get(id)!.manifest), typical_s: this.parts.get(id)!.manifest.timing.typical_s });
    this.book.plan([...this.style.style.timeline.map((s) => planned(s.id)), ...this.layersOn().map((slot) => planned(`layer-${slot}`))]);
    this.book.note = 'Getting your files ready';
    void this.reporter.send(true);

    // The plan's files, checked against the hashes frozen at the yes.
    this.at = 'plan-files';
    const planFiles = {
      dir: this.layout.inputs,
      download: (u: string, m: number) => deps.line.download(u, m, this.stop.signal),
      hostedLink: (fileId: string) =>
        deps.line.hostedFileLink(this.videoId, fileId, this.stop.signal).catch((error: unknown) => {
          if (error instanceof LineError) throw lineStop(lineWords(error), error.next, error.code);
          throw error;
        }),
      // A hosted plan file goes into a payload as the line already knows it.
      onHosted: (sha256: string, ref: string) => this.hosted.set(sha256, ref),
    };
    this.planScope = await materialize(plan.body, planFiles);
    this.brand = brandKit(await materialize(plan.brand, planFiles));

    this.book.note = 'Making your video';
    void this.reporter.send(true);

    // The fixes already in force (after a restart) apply from the start.
    let result = await this.pipeline();
    if (!result.verdict.pass) {
      const fix = this.run.local_fix_used ? null : this.fixFrom(result.verdict, [], 'local');
      if (!fix) return this.checkFailed(result.verdict);
      this.run.local_fix_used = true;
      this.run.fixes = [...(this.run.fixes ?? []), fix];
      await this.saveRun();
      this.say('The final check found something to fix. Fixing it once…');
      result = await this.pipeline();
      if (!result.verdict.pass) return this.checkFailed(result.verdict);
    }
    return this.upload(result);
  }

  private layersOn(): LayerSlot[] {
    const layers = this.style.style.layers;
    return LAYER_ORDER.filter((slot) => slot === 'check' || layers[slot] === true);
  }

  /** Every part this video runs, from the lock, checked before anything is spent. */
  private async loadParts(dev: boolean): Promise<void> {
    const lock = this.lock;
    const layerRefs = lock?.layers ?? (this.handed.plan.layers as Record<LayerSlot, PartRef>);
    const wanted: Array<{ key: string; ref: PartRef; slot?: LayerSlot }> = [
      ...this.style.style.timeline.map((s) => ({ key: s.id, ref: lockedRef(s.part, lock) })),
      ...this.layersOn().map((slot) => ({ key: `layer-${slot}`, ref: layerRefs?.[slot], slot })),
    ];
    for (const { key, ref, slot } of wanted) {
      this.at = key;
      if (!ref || typeof ref.id !== 'string' || typeof ref.version !== 'string') throw new KitStop('This video names a part it has no version for.', 'change_request');
      if (lock) {
        const entry = lock.parts[ref.id];
        if (!entry || entry.version !== ref.version) {
          this.deps.log.write('error', 'part not in the parts list', { step: key, part: `${ref.id}@${ref.version}`, locked: entry?.version ?? null });
          throw new KitStop(`A part this video uses is not in this video’s parts list, so it can’t run. ${PLAN_CHANGE}`, 'change_request', 'not_locked');
        }
        const tooOld = kitRangeRefusal({ id: ref.id, version: ref.version, kit: entry.kit });
        if (tooOld) {
          this.deps.log.write('error', 'part needs another kit', { step: key, refusal: tooOld });
          throw new KitStop('This video needs a newer video kit.', 'update_kit', 'kit_range');
        }
      }
    }
    for (const { key, ref, slot } of wanted) {
      this.at = key;
      let loaded: LoadedPart;
      const edit = this.patchOf(key);
      const patched = edit && lock ? { dir: path.join(this.layout.patches, key), files: patchedFiles(edit, lock) } : undefined;
      try {
        loaded = await this.deps.host.loader.load({ ref, lock, dev, home: this.deps.home, env: this.deps.env, signal: this.stop.signal, ...(patched ? { patched } : {}) });
      } catch (error) {
        this.deps.log.write('error', 'part could not be loaded', {
          step: key,
          part: `${ref.id}@${ref.version}`,
          edited: !!patched,
          code: error instanceof PartLoadError ? error.code : null,
          error: error instanceof Error ? error.message : String(error),
        });
        // The edit is this computer's own: the video is fine, so it only stops.
        if (patched && error instanceof PartLoadError && error.code === 'hash_mismatch') throw new KitStop(error.message, 'stop', 'patch_refused');
        throw loadStop(error);
      }
      const m = loaded.manifest;
      const refused = (why: string, fields: Record<string, unknown> = {}) =>
        this.deps.log.write('error', why, { step: key, part: `${ref.id}@${ref.version}`, ...fields });
      if (m.id !== ref.id || m.version !== ref.version) {
        refused('part loaded as another version', { loaded: `${m.id}@${m.version}` });
        throw new KitStop(`A part this video uses loaded as another version, so it can’t run. ${PLAN_CHANGE}`, 'change_request', 'manifest_mismatch');
      }
      const refusal = interfaceRefusal(m);
      if (refusal) {
        refused('part needs another interface', { refusal });
        throw new KitStop('This video needs a newer video kit.', 'update_kit', 'interface');
      }
      if (slot && (m.layer !== slot || m.kind !== SLOT_KIND[slot])) {
        refused('part can’t fill its layer', { slot, layer: m.layer ?? null, kind: m.kind });
        throw new KitStop(`A part this video uses can’t do the job its plan gives it. ${PLAN_CHANGE}`, 'change_request', 'wrong_layer');
      }
      const lockModels = lock ? lock.parts[ref.id].models : m.needs.models;
      const paid = m.needs.network || m.needs.models.length > 0 || m.kind.startsWith('generate_');
      if (paid && (!Array.isArray(lockModels) || lockModels.length === 0)) {
        refused('paid part has no models in the parts list');
        throw new KitStop(`A part this video uses would order paid pieces its approved price doesn’t allow. ${PLAN_CHANGE}`, 'change_request', 'no_models');
      }
      const missing = this.missingNeeds(m.needs);
      if (missing) {
        refused('part needs what this computer lacks', { missing });
        throw new KitStop(`This computer can’t make this video: ${missing}. Run the computer check, then make the video again.`, 'refused', 'needs_missing');
      }
      try {
        assertCheckable(m.inputs);
        assertCheckable(m.outputs);
      } catch (error) {
        refused('part schema can’t be checked', { error: (error as Error).message });
        throw new KitStop('This video needs a newer video kit.', 'update_kit', 'schema');
      }
      this.parts.set(key, loaded);
    }
  }

  private missingNeeds(needs: LoadedPart['manifest']['needs']): string | null {
    if (needs.ffmpeg) {
      if (!this.tools.ffmpeg.path || !this.tools.ffprobe.path) return 'the video tools are missing';
      if (typeof needs.ffmpeg === 'object') {
        const lacking = [
          ...(needs.ffmpeg.filters ?? []).filter((f) => !(this.tools.ffmpeg.filters ?? []).includes(f)),
          ...(needs.ffmpeg.encoders ?? []).filter((e) => !(this.tools.ffmpeg.encoders ?? []).includes(e)),
        ];
        if (lacking.length) return 'the video tools here lack something it needs';
      }
    }
    if (needs.browser && !this.browserReady) return 'the video browser is missing';
    return null;
  }

  /** The timeline, then the layers that are on. Saved steps with the same hash are reused. */
  private async pipeline(): Promise<{ cut: FileRef; captions?: FileRef; verdict: CheckVerdict; steps: Record<string, string>; timeline: Timeline; beforeSound?: string }> {
    const outputs = new Map<string, Record<string, unknown>>();
    const scope = { plan: this.planScope, brand: this.brand, steps: outputs, assets: this.style.assets };
    const hashes: Record<string, string> = {};
    let timeline: Timeline | null = null;
    // Review metadata travels outside old part schemas, which reject unknown Timeline fields.
    const customMetadata = this.style.style as unknown as Record<string, unknown>;
    let assemblyRaw: unknown = customMetadata.assembly_timeline;
    let contentReview: unknown = customMetadata.content_review;
    const sourceReviewPath = path.join(this.layout.final, 'source-reviews.json');
    let sourceReviews: Record<string, unknown> = {};
    try {
      const saved = JSON.parse(await readFile(sourceReviewPath, 'utf8')) as { steps?: Record<string, unknown> };
      if (!saved || !saved.steps || typeof saved.steps !== 'object' || Array.isArray(saved.steps)) throw new Error('steps must be a map');
      sourceReviews = saved.steps;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new KitStop('The saved source reviews could not be read. Repair source-reviews.json before resuming.', 'change_request', 'bad_input');
    }
    const sourceFiles = new Map<string, FileRef>();
    const collectFiles = (value: unknown): void => {
      if (isFileRef(value)) { sourceFiles.set(value.sha256, value); return; }
      if (Array.isArray(value)) { value.forEach(collectFiles); return; }
      if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(collectFiles);
    };
    collectFiles(this.planScope);
    const retainReviewedFiles = async (value: unknown): Promise<unknown> => {
      if (isFileRef(value)) {
        if (!isInside(this.layout.root, value.path)) throw new KitStop('A reviewed source belongs to another job.', 'change_request', 'bad_input');
        const directory = path.join(this.layout.inputs, 'reviewed');
        const held = { ...value, path: path.join(directory, `${value.sha256}${path.extname(value.path)}`) };
        if (await intact(held)) return held;
        if (!(await intact(value))) throw new KitStop('A reviewed source changed or is missing. Keep the candidate bytes before resuming.', 'change_request', 'bad_input');
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await copyFile(value.path, held.path);
        if (!(await intact(held))) throw new KitStop('The retained source copy did not match its review.', 'failed', 'tool_failed');
        return held;
      }
      if (Array.isArray(value)) return Promise.all(value.map(retainReviewedFiles));
      if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value as Record<string, unknown>).map(async ([key, item]) => [key, await retainReviewedFiles(item)])));
      return value;
    };
    const acceptTimeline = (out: Record<string, unknown>): void => {
      collectFiles(out);
      if (out.assembly_timeline !== undefined) assemblyRaw = out.assembly_timeline;
      if (out.content_review !== undefined) contentReview = out.content_review;
      if (out.timeline && typeof out.timeline === 'object') {
        const { assembly_timeline, content_review, ...ordinary } = out.timeline as Timeline;
        if (assembly_timeline !== undefined) assemblyRaw = assembly_timeline;
        if (content_review !== undefined) contentReview = content_review;
        timeline = ordinary;
        out.timeline = ordinary;
      }
    };
    /**
     * The declaration rule: a part gets the source-linked timeline only where its input schema
     * declares `assembly_timeline`, as a top-level input or inside an object input (its `timeline`,
     * `under_timeline` or any other, after following local `$ref`s). Older parts never see it.
     * Returns whether the part declared it, so its answer may carry the timeline back.
     */
    const exposeAssemblyToDeclaredSchema = (loaded: LoadedPart, inputs: Record<string, unknown>): boolean => {
      const root = loaded.manifest.inputs as unknown as Record<string, unknown>;
      const declares = (node: unknown): boolean => {
        let schema = node as Record<string, unknown> | undefined;
        for (let depth = 0; depth < 8 && typeof schema?.$ref === 'string' && schema.$ref.startsWith('#/'); depth++) {
          let target: unknown = root;
          for (const name of schema.$ref.slice(2).split('/')) target = target && typeof target === 'object' ? (target as Record<string, unknown>)[name.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
          schema = target && typeof target === 'object' ? target as Record<string, unknown> : undefined;
        }
        const properties = schema?.properties as Record<string, unknown> | undefined;
        return !!properties && Object.prototype.hasOwnProperty.call(properties, 'assembly_timeline');
      };
      let declared = declares(root);
      if (declared && assemblyRaw) inputs.assembly_timeline = assemblyRaw;
      const properties = (root.properties ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(inputs)) {
        if (key === 'assembly_timeline' || !value || typeof value !== 'object' || Array.isArray(value) || isFileRef(value) || !declares(properties[key])) continue;
        declared = true;
        if (assemblyRaw) inputs[key] = { ...value, assembly_timeline: assemblyRaw };
      }
      return declared;
    };
    const fixes = this.run.fixes ?? [];
    const fixed = (id: string, inputs: Record<string, unknown>) => {
      const mine = fixes.filter((f) => f.target === id);
      return {
        inputs: mine.reduce((acc, f) => ({ ...acc, ...f.inputs }), inputs),
        round: mine.length ? Math.max(...mine.map((f) => f.round)) : undefined,
      };
    };
    for (const step of this.style.style.timeline) {
      const loaded = this.parts.get(step.id)!;
      const { inputs, round } = fixed(step.id, this.bind(step.id, step.inputs as Record<string, unknown> | undefined, scope));
      exposeAssemblyToDeclaredSchema(loaded, inputs);
      // Only the predeclared staged creator route consumes review evidence. Capture/script/budget stay frozen.
      const properties = (loaded.manifest.inputs as unknown as { properties?: Record<string, { enum?: unknown[] }> }).properties;
      const stagedSourceReview = Boolean(properties?.accepted_sources && properties?.generation_stage?.enum?.includes('reviewed_pipeline'));
      const alignedVoiceReview = Boolean(properties?.reviewed_alignments);
      if (stagedSourceReview) {
        inputs.generation_stage = 'reviewed_pipeline';
        const reviewed = sourceReviews[step.id] as { accepted_sources?: unknown; qualification?: unknown } | undefined;
        if (reviewed?.accepted_sources !== undefined) inputs.accepted_sources = await retainReviewedFiles(reviewed.accepted_sources);
        if (reviewed?.qualification !== undefined) inputs.qualification = reviewed.qualification;
      }
      if (alignedVoiceReview) {
        const reviewed = sourceReviews[step.id] as { reviewed_alignments?: unknown } | undefined;
        if (reviewed?.reviewed_alignments !== undefined) inputs.reviewed_alignments = await retainReviewedFiles(reviewed.reviewed_alignments);
      }
      const ref = lockedRef(step.part, this.lock);
      const out = await this.runStep({ id: step.id, ref, loaded, inputs, models: this.modelsOf(ref, loaded), fix: round }, hashes);
      acceptTimeline(out);
      outputs.set(step.id, out);
      const provenance = out.provenance as { source_content_review?: unknown } | undefined;
      const creatorPending = stagedSourceReview && out.content_review_status === 'pending' && provenance?.source_content_review !== 'pass';
      const voiceTimingPending = alignedVoiceReview && out.timing_status === 'requires_reviewed_alignment';
      const voiceInputRevision = canonicalHash(hashView({ ...inputs, reviewed_alignments: undefined }));
      const voiceSources = alignedVoiceReview ? fileRefsIn(out).filter((file) => file.media === 'audio') : [];
      const voiceRecord = sourceReviews[step.id] as { voice_reviews?: Array<{ source_sha256?: string; inputs_revision?: string; status?: string; reviewer?: string; audio_listened?: boolean; start_s?: number; end_s?: number; checks?: Record<string, string> }> } | undefined;
      const reviewedVoice = (file: FileRef): boolean => {
        const r = Array.isArray(voiceRecord?.voice_reviews) ? voiceRecord.voice_reviews.find((review) => review?.source_sha256 === file.sha256) : null;
        return !!r && r.inputs_revision === voiceInputRevision && r.status === 'pass' && typeof r.reviewer === 'string' && !!r.reviewer.trim() && r.audio_listened === true && typeof r.start_s === 'number' && Number.isFinite(r.start_s) && r.start_s === 0 && typeof r.end_s === 'number' && Number.isFinite(r.end_s) && file.duration_s !== undefined && r.end_s >= file.duration_s - 0.02 && ['script', 'voice', 'pronunciation', 'performance'].every((axis) => r.checks?.[axis] === 'pass');
      };
      const voiceContentPending = alignedVoiceReview && out.content_review_status === 'pending' && (!voiceSources.length || voiceSources.some((file) => !reviewedVoice(file)));
      if (creatorPending || voiceTimingPending || voiceContentPending) {
        await mkdir(this.layout.final, { recursive: true, mode: 0o700 });
        const request = path.join(this.layout.final, `source-review-request-${step.id}.json`);
        await writeJson(request, { step: step.id, inputs_revision: creatorPending ? canonicalHash(hashView(inputs)) : voiceInputRevision, outputs: out,
          instructions: creatorPending ? 'Review the actual source clips with moving picture and audio using the existing ingredient review. Save accepted_sources and qualification under this step in source-reviews.json, then resume the same command. Do not alter the approved script, capture or budget. Failed or incomplete source reviews cannot enter assembly.' : 'Listen to every actual source and finished voice track, including word endings and joins. Save voice_reviews under this step in source-reviews.json. Each record needs source_sha256, this inputs_revision, status pass, reviewer, audio_listened true, start_s 0, end_s covering the whole source, and checks script/voice/pronunciation/performance pass. If measured alignment is missing, also supply reviewed_alignments with tag-free spoken timings. No script, voice or model change is authorized by these review records.',
          review_file: sourceReviewPath });
        await this.reportWaiting(WAITING_FOR_SOURCE_REVIEW);
        throw new KitStop(`A source candidate is saved for review at ${request}. Save its actual review in ${sourceReviewPath}, then resume this command; existing paid pieces are reused.`, 'stop', 'source_review_incomplete');
      }
    }
    const last = this.style.style.timeline[this.style.style.timeline.length - 1];
    const made = outputs.get(last.id)?.video;
    if (!isFileRef(made) || made.media !== 'video') throw new KitStop('The style’s last step made no video.', 'change_request');
    let cut: FileRef = made;
    timeline ??= await this.bareTimeline(cut);
    const assemblyBeforeLayers = normalizeAssemblyTimeline(assemblyRaw, { speech: this.style.style.traits.speech });
    if (assemblyBeforeLayers.status === 'invalid') throw new KitStop(`The source-linked edit is inconsistent: ${assemblyBeforeLayers.issues.join(' ')}`, 'change_request', 'output_invalid');

    let words: FileRef | undefined;
    let captions: FileRef | undefined;
    let verdict: CheckVerdict | null = null;
    let beforeSound: string | undefined;
    for (const slot of this.layersOn()) {
      if (slot === 'sound') beforeSound = cut.path;
      const id = `layer-${slot}`;
      const loaded = this.parts.get(id)!;
      const ref = { id: loaded.manifest.id, version: loaded.manifest.version };
      const { inputs, round } = fixed(id, { video: cut, timeline, brand: this.brand, expect: expectationOf(this.style.style, this.handed.plan), ...(words ? { words } : {}) });
      const linked = exposeAssemblyToDeclaredSchema(loaded, inputs);
      const out = await this.runStep({ id, ref, loaded, inputs, models: this.modelsOf(ref, loaded), fix: round }, hashes);
      if (slot === 'check') {
        // The check judges the video; it never replaces its timeline or its source-linked edit.
        collectFiles(out);
        verdict = out.verdict as CheckVerdict;
        continue;
      }
      acceptTimeline(out);
      if (assemblyRaw && !linked && (slot === 'sound' || slot === 'captions')) {
        this.deps.log.write('warn', 'a layer cannot update the source-linked timeline', { step: id, part: `${ref.id}@${ref.version}`, note: 'its changes are checked only by the final measurements' });
      }
      const video = out.video;
      if (!isFileRef(video) || video.media !== 'video') {
        this.deps.log.write('error', 'layer made no video', { step: id });
        throw new KitStop(`Finishing this video gave back no video. ${PLAN_CHANGE}`, 'change_request', 'output_invalid');
      }
      cut = video;
      if (slot === 'captions') {
        if (isFileRef(out.words)) words = out.words;
        if (isFileRef(out.captions)) captions = out.captions;
      }
    }
    if (!verdict || typeof verdict.pass !== 'boolean' || !Array.isArray(verdict.checks)) throw new KitStop('The final check gave no verdict.', 'change_request');
    const assembly = normalizeAssemblyTimeline(assemblyRaw, { speech: this.style.style.traits.speech });
    if (assembly.status === 'invalid') throw new KitStop(`The finished edit has inconsistent source timing: ${assembly.issues.join(' ')}`, 'change_request', 'output_invalid');
    if (assembly.timeline) {
      if (Math.abs(assembly.timeline.duration_ms / 1000 - timeline.duration_s) > Math.max(0.05, 2 / timeline.fps)) throw new KitStop('The finished picture duration differs from its source-linked edit.', 'change_request', 'output_invalid');
      // A path in a declaration is insufficient: resolve against registered, hash-checked files.
      const pictures = assemblyPictureSources(assembly.timeline);
      const audible = [...assembly.timeline.audio_cues.map((c) => c.source),
        ...assembly.timeline.segments.flatMap((s) => s.speech_driver ? [s.speech_driver] : [])];
      const linked = [...pictures.map((p) => p.source), ...audible];
      const sourceProbe = kitTools({ ffmpeg: this.tools.ffmpeg.path ?? 'ffmpeg', ffprobe: this.tools.ffprobe.path ?? 'ffprobe', toolchain: this.toolchain }, this.stop.signal).probe;
      for (const source of linked) {
        const file = sourceFiles.get(source.sha256);
        if (!file || !(await intact(file))) throw new KitStop(`A timeline source is missing or changed: ${source.asset_id}`, 'change_request', 'output_invalid');
        const sourcePictures = pictures.filter((p) => p.source.sha256 === source.sha256 && p.source.asset_id === source.asset_id);
        if (sourcePictures.some((p) => p.source_kind !== file.media)) throw new KitStop(`A picture source has a different media kind: ${source.asset_id}`, 'change_request', 'output_invalid');
        const actual = await sourceProbe(file.path);
        if (sourcePictures.length && !actual.has_video) throw new KitStop(`A picture source has no readable picture: ${source.asset_id}`, 'change_request', 'output_invalid');
        for (const { source: shown } of sourcePictures) {
          const crop = shown.crop;
          if (!crop) continue;
          if (!actual.width || !actual.height || crop.x + crop.w > actual.width || crop.y + crop.h > actual.height) throw new KitStop(`A picture crop is outside its ${actual.width ?? '?'}×${actual.height ?? '?'} source: ${source.asset_id}`, 'change_request', 'output_invalid');
          // Zoom, not resolution: scaling the whole frame up is fine, cropping in past 1.5x is not.
          const zoom = cropZoom(crop, { width: actual.width, height: actual.height }, timeline);
          if (zoom > MAX_ZOOM + 1e-9) throw new KitStop(`A picture crop zooms in ${zoom.toFixed(2)}x, over the ${MAX_ZOOM}x limit: ${source.asset_id}. Use a wider or sharper source.`, 'change_request', 'output_invalid');
        }
        if (audible.some((a) => a.sha256 === source.sha256 && a.asset_id === source.asset_id) && !actual.has_audio) throw new KitStop(`An audio source has no readable audio: ${source.asset_id}`, 'change_request', 'output_invalid');
        // A still is intentionally held; only moving/audio sources have a media clock.
        if (file.media !== 'image' && (actual.duration_s === undefined || source.out_ms > actual.duration_s * 1000 + 1)) throw new KitStop(`A timeline source window exceeds the actual file: ${source.asset_id}`, 'change_request', 'output_invalid');
        source.path = file.path;
      }
      timeline.assembly_timeline = assembly.timeline;
    }
    if (contentReview && typeof contentReview === 'object') timeline.content_review = contentReview as NonNullable<Timeline['content_review']>;
    return { cut, captions, verdict, steps: hashes, timeline, beforeSound };
  }

  /** A style step's inputs: a reference the kit can't resolve goes to the log, plain words to the person. */
  private bind(stepId: string, inputs: Record<string, unknown> | undefined, scope: Parameters<typeof bindInputs>[1]): Record<string, unknown> {
    this.at = stepId;
    try {
      return bindInputs(inputs, scope, stepId);
    } catch (error) {
      if (!(error instanceof KitStop)) throw error;
      this.deps.log.write('error', 'step inputs could not be bound', { step: stepId, error: error.message });
      throw new KitStop(`One step of this video can’t get what it needs, so the video stopped there. ${PLAN_CHANGE}`, 'change_request', 'bad_input');
    }
  }

  private modelsOf(ref: PartRef, loaded: LoadedPart): ModelNeed[] {
    return this.lock ? (this.lock.parts[ref.id]?.models ?? []) : loaded.manifest.needs.models;
  }

  private async bareTimeline(cut: FileRef): Promise<Timeline> {
    const probe = kitTools({ ffmpeg: this.tools.ffmpeg.path ?? 'ffmpeg', ffprobe: this.tools.ffprobe.path ?? 'ffprobe', toolchain: this.toolchain }, this.stop.signal).probe;
    const info = await probe(cut.path).catch(() => null);
    const duration_s = info?.duration_s ?? cut.duration_s;
    const width = info?.width ?? cut.width;
    const height = info?.height ?? cut.height;
    const fps = info?.fps ?? cut.fps;
    if (!duration_s || !width || !height || !fps) throw new KitStop('The video’s length and size could not be read.', 'failed');
    return { duration_s, width, height, fps, scenes: [], speech: [] };
  }

  /** This step's remade pieces from the plan's takes (a video_fix remake), by piece key; null when none. */
  private takesOf(stepId: string): Record<string, number> | null {
    const listed = (this.handed.plan.body as { takes?: unknown }).takes;
    const takes: Record<string, number> = {};
    for (const entry of Array.isArray(listed) ? listed : []) {
      const { piece_key, take } = (entry ?? {}) as { piece_key?: unknown; take?: unknown };
      if (typeof piece_key === 'string' && piece_key.startsWith(`${stepId}.`) && Number.isInteger(take) && (take as number) > 1) takes[piece_key] = take as number;
    }
    return Object.keys(takes).length ? takes : null;
  }

  /** One step: reused when its saved record has the same hash and intact files, else run (and retried once). */
  private async runStep(spec: StepSpec, hashes: Record<string, string>): Promise<Record<string, unknown>> {
    const { manifest } = spec.loaded;
    this.at = spec.id;
    const inputErrors = schemaErrors(manifest.inputs, spec.inputs, `${spec.id} inputs`);
    if (inputErrors.length) {
      this.deps.log.write('error', 'step inputs refused', { step: spec.id, errors: inputErrors });
      throw new KitStop(`One step of this video was given something it can’t take, so the video stopped there. ${PLAN_CHANGE}`, 'change_request', 'bad_input');
    }
    const edit = this.patchOf(spec.id);
    const takes = this.takesOf(spec.id);
    const hash = stepHash({ interface: manifest.interface, part: spec.ref, toolchain: this.toolchain, inputs: spec.inputs, fix: spec.fix, ...(edit ? { patch: stepPatchHash(edit) } : {}), ...(takes ? { takes } : {}) });
    hashes[spec.id] = hash;
    const saved = await this.store.readStep(spec.id);
    if (saved && saved.status === 'done' && saved.step_hash === hash && saved.outputs && this.run.steps[spec.id]?.status === 'done') {
      const files = fileRefsIn(saved.outputs);
      if ((await Promise.all(files.map(intact))).every(Boolean)) {
        this.book.finish(spec.id);
        return saved.outputs as Record<string, unknown>;
      }
    }

    const dir = this.store.stepDir(spec.id);
    const workDir = path.join(dir, 'out');
    // Scratch space sits inside the step's own folder, so a part can register a scratch file too.
    const tmpDir = path.join(workDir, '.tmp');
    for (const attempt of [1, 2] as const) {
      if (this.stop.signal.aborted) throw this.fatal ?? new KitStop('This video was stopped.', 'stop');
      await rm(workDir, { recursive: true, force: true });
      await rm(tmpDir, { recursive: true, force: true });
      await mkdir(workDir, { recursive: true, mode: 0o700 });
      await mkdir(tmpDir, { recursive: true, mode: 0o700 });
      const record: StepRecord = {
        record: 1,
        step: spec.id,
        part: spec.ref,
        step_hash: hash,
        status: 'running',
        inputs: withoutSignedLinks(spec.inputs) as JsonObject,
        pieces: [],
        started_at: this.now().toISOString(),
      };
      await this.store.writeStep(record);
      this.run.steps[spec.id] = { status: 'running', step_hash: hash };
      await this.saveRun();
      this.book.start(spec.id);
      this.deps.log.write('info', 'step started', { step: spec.id, part: `${spec.ref.id}@${spec.ref.version}`, attempt });
      void this.reporter.send();

      const timeoutMs = manifest.timing.timeout_s * 1000;
      // Aborted as the step ends, however it ends, so nothing the part left running outlives it.
      const over = new AbortController();
      const link = linkedSignal([this.stop.signal, over.signal], timeoutMs);
      const waiting = new Set<string>();
      // Read as the time runs out, before the cut-short calls give up their pieces.
      let slowAtLine = false;
      try {
        const ctx = this.context(spec, attempt, workDir, tmpDir, link.signal, record, waiting);
        const outputs = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const ended = () => {
            slowAtLine = !this.stop.signal.aborted && waiting.size > 0;
            reject(this.stop.signal.aborted ? new PartError('stopped') : new PartError('timeout', `${spec.id} ran past ${manifest.timing.timeout_s} s${slowAtLine ? ' waiting on the line' : ''}`));
          };
          // Stopped while the step was being saved: the part never starts.
          if (link.signal.aborted) return ended();
          link.signal.addEventListener('abort', ended, { once: true });
          spec.loaded.run(spec.inputs, ctx).then((o) => resolve(o as Record<string, unknown>), reject);
        });
        if (this.fatal) throw this.fatal;
        const outputErrors = outputs && typeof outputs === 'object' ? schemaErrors(manifest.outputs, outputs, `${spec.id} outputs`) : ['outputs are not an object'];
        if (outputErrors.length) {
          this.deps.log.write('error', 'step outputs refused', { step: spec.id, errors: outputErrors });
          throw new PartError('output_invalid', outputErrors.join('; '));
        }
        await this.checkOutputFiles(outputs, spec.loaded.dir, tmpDir);
        record.status = 'done';
        record.outputs = outputs as JsonObject;
        record.finished_at = this.now().toISOString();
        await this.store.writeStep({ ...record, outputs: outputs as JsonObject });
        this.run.steps[spec.id] = { status: 'done', step_hash: hash, finished_at: record.finished_at };
        await this.saveRun();
        await rm(tmpDir, { recursive: true, force: true });
        this.book.finish(spec.id);
        this.deps.log.write('info', 'step done', { step: spec.id, pieces: record.pieces.length });
        void this.reporter.send(true);
        return outputs;
      } catch (error) {
        const stopped = this.fatal ?? (error instanceof KitStop ? error : null);
        const failure = stopped ? null : asPartError(error);
        record.status = stopped ? 'stopped' : 'failed';
        if (failure) record.error = { code: failure.code, ...(failure.detail ? { detail: this.deps.log.clean(failure.detail).slice(0, 2000) } : {}) };
        record.finished_at = this.now().toISOString();
        await this.store.writeStep(record);
        this.run.steps[spec.id] = { status: record.status, step_hash: hash };
        await this.saveRun();
        if (stopped) throw stopped;
        this.deps.log.write('warn', 'step failed', { step: spec.id, attempt, code: failure!.code, detail: record.error?.detail ?? null });
        if (failure!.retryable && attempt === 1 && manifest.retry?.transient !== 0) continue;
        const slow = failure!.code === 'timeout' && slowAtLine;
        const code = slow ? PROVIDER_SLOW : reportedCode(failure!);
        // A take-fit part's refusal keeps its code, so the line blames it on its own side too.
        const takeFit = PLAN_CODES.has(code) && TAKE_FIT_PARTS.has(spec.ref.id);
        const words = slow ? slowWords(rowOf(manifest)) : takeFit ? TAKE_FIT_WORDS : failureWords(failure!, this.idNames());
        this.book.finish(spec.id, 'failed');
        this.reporter.close();
        this.reportFailure(spec.id, code, words, PLAN_CODES.has(code) ? failure!.fromPart : undefined, takeFit);
        throw new KitStop(words, failure!.code === 'over_quote' ? 'stop' : 'failed', code, takeFit ? 'retry' : undefined);
      } finally {
        over.abort(new PartError('stopped'));
        link.done();
      }
    }
    throw new KitStop(failureWords(new PartError('tool_failed')), 'failed', 'tool_failed');
  }

  /** A part's output files must be in this video's folder (or the part's own) and unchanged. */
  private async checkOutputFiles(outputs: unknown, partDir: string, tmpDir: string): Promise<void> {
    for (const ref of fileRefsIn(outputs)) {
      if (!isInside(this.layout.root, ref.path) && !isInside(partDir, ref.path)) throw new PartError('output_invalid', 'an output file is outside this video’s folder');
      if (isInside(tmpDir, ref.path)) throw new PartError('output_invalid', 'an output file is in the step’s scratch folder, which is cleared after the step');
      // Every output is hashed again once the part returns, even one it registered.
      const actual = await hashFile(ref.path).catch(() => null);
      if (!actual || actual.sha256 !== ref.sha256 || actual.bytes !== ref.bytes) throw new PartError('output_invalid', 'an output file does not match its hash');
    }
  }

  private context(spec: StepSpec, attempt: 1 | 2, workDir: string, tmpDir: string, signal: AbortSignal, record: StepRecord, waiting: Set<string>): PartContext {
    const { manifest } = spec.loaded;
    const tools = kitTools({ ffmpeg: this.tools.ffmpeg.path ?? '', ffprobe: this.tools.ffprobe.path ?? '', toolchain: this.toolchain }, signal);
    const seedInput = spec.inputs.seed ?? null;
    const order = manifest.needs.network
      ? pieceOrderer({
          line: this.deps.line,
          videoId: this.videoId,
          stepId: spec.id,
          part: spec.ref,
          models: spec.models,
          runId: this.runId,
          workDir,
          runRoot: this.layout.root,
          cache: this.cache,
          signal,
          sleep: this.sleep,
          probe: tools.probe,
          hosted: this.hosted,
          locks: this.pieceLocks,
          onWait: () => void this.reporter.send(),
          waiting,
          takes: this.takesOf(spec.id) ?? undefined,
          onPiece: async (piece) => {
            record.pieces.push(piece);
            await this.store.writeStep(record);
            this.book.count(spec.id, { done: record.pieces.length });
            void this.reporter.send(true);
          },
        })
      : null;
    const style = { id: this.style.style.id, version: this.style.style.version };
    const ctx: PartContext = {
      interface: 1,
      video: { id: this.videoId, style, env: this.deps.environment },
      step: { id: spec.id, attempt },
      part: { id: spec.ref.id, version: spec.ref.version, dir: spec.loaded.dir },
      workDir,
      tmpDir,
      seed: (piece: string) => pieceSeed({ step: spec.id, part: spec.ref.id, piece, seed: seedInput }),
      ...(order
        ? {
            line: {
              order: async (request) => {
                try {
                  return await order(request);
                } catch (error) {
                  if (error instanceof KitStop) this.halt(error);
                  throw error;
                }
              },
            },
          }
        : {}),
      tools,
      ...(manifest.needs.browser ? { browser: this.deps.host.browser.provider({ allowDirs: [spec.loaded.dir, this.layout.root], signal }) } : {}),
      log: this.deps.log.forStep(spec.id),
      progress: (update) => {
        this.book.count(spec.id, update ?? {});
        void this.reporter.send();
      },
      file: async (relativePath, media) => {
        const target = path.resolve(workDir, relativePath);
        if (!isInside(workDir, target)) throw new PartError('bad_input', 'a part may register only files in its own folder');
        return fileRef(target, media, tools.probe);
      },
      error: (code, detail) => new PartError(code, detail, true),
      signal,
    };
    return ctx;
  }

  /** The one fix: the check's own hint, or the server's check mapped to the layer that can redo it. */
  private fixFrom(verdict: CheckVerdict, serverChecks: string[], from: Fix['from']): Fix | null {
    const round = (this.run.fixes?.length ?? 0) + 1;
    const failed = verdict.checks.filter((c) => c.status === 'fail' && (serverChecks.length === 0 || serverChecks.includes(c.code)));
    const hinted: FixHint | undefined = failed.find((c) => c.fix)?.fix;
    if (hinted?.slot && this.parts.has(`layer-${hinted.slot}`)) return { target: `layer-${hinted.slot}`, inputs: hinted.inputs ?? {}, round, from };
    if (hinted?.step && this.parts.has(hinted.step)) return { target: hinted.step, inputs: hinted.inputs ?? {}, round, from };
    for (const check of serverChecks) {
      const slot = SERVER_CHECK_SLOT[check];
      if (slot && this.parts.has(`layer-${slot}`)) return { target: `layer-${slot}`, inputs: {}, round, from };
    }
    return null;
  }

  private async checkFailed(verdict: CheckVerdict): Promise<MakeResult> {
    await this.writeFinal(null, verdict);
    this.book.finish('layer-check', 'failed');
    this.book.note = 'The final check found a problem';
    // A check part's words sit in the failed check's `message` or only in `verdict.reasons[]` (neither is in the
    // interface); only plain ones reach the card.
    const said = verdict.checks.find((c) => c.status === 'fail') as { code?: unknown; message?: unknown } | undefined;
    const code = typeof said?.code === 'string' ? said.code : null;
    const message = (typeof said?.message === 'string' && said.message.trim()) || reasonFor(verdict, code);
    const detail = plainWords(message, CHECK_FAILED, this.idNames());
    this.deps.log.write('warn', 'the final check failed', { check: code, message, detail });
    this.reporter.close();
    this.reportFailure('layer-check', 'check_failed', detail);
    await this.reporter.flush();
    this.run.status = 'failed';
    await this.saveRun();
    const notSent = 'The video didn’t pass the final check, so it wasn’t sent. Nothing more will be charged for it.';
    return { status: 'failed', message: detail === CHECK_FAILED ? notSent : `${detail} ${notSent}`, code: 'check_failed' };
  }

  /** Part, step and layer ids, which the person never sees. */
  private idNames(): string[] {
    const names = new Set<string>();
    for (const [key, loaded] of this.parts) {
      names.add(key);
      names.add(loaded.manifest.id);
      names.add(`${loaded.manifest.id}@${loaded.manifest.version}`);
    }
    return [...names];
  }

  private async writeFinal(result: { cut: FileRef; captions?: FileRef } | null, verdict: CheckVerdict): Promise<string | null> {
    await mkdir(this.layout.final, { recursive: true, mode: 0o700 });
    await writeJson(path.join(this.layout.final, 'check.json'), verdict);
    if (!result) return null;
    // A candidate until our server passes it: a failed one never replaces an earlier good final.
    const candidate = path.join(this.layout.final, CANDIDATE);
    await copyFile(result.cut.path, candidate);
    if (result.captions) await copyFile(result.captions.path, path.join(this.layout.final, CANDIDATE_CAPTIONS));
    else await rm(path.join(this.layout.final, CANDIDATE_CAPTIONS), { force: true });
    return candidate;
  }

  /** The passed candidate becomes the final, in one rename each. */
  private async promoteFinal(hasCaptions: boolean): Promise<string> {
    const final = path.join(this.layout.final, 'final.mp4');
    await rename(path.join(this.layout.final, CANDIDATE), final);
    if (hasCaptions) await rename(path.join(this.layout.final, CANDIDATE_CAPTIONS), path.join(this.layout.final, 'captions.vtt'));
    else await rm(path.join(this.layout.final, 'captions.vtt'), { force: true });
    return final;
  }

  private manifestFor(steps: Record<string, string>): Record<string, unknown> {
    const parts: Record<string, string> = {};
    for (const loaded of this.parts.values()) parts[loaded.manifest.id] = loaded.manifest.version;
    return {
      style: { id: this.style.style.id, version: this.style.style.version },
      lock_sha256: this.run.lock_sha256 || null,
      parts,
      steps,
      kit: { version: KIT_VERSION, toolchain: this.toolchain },
      parts_source: this.run.kit.parts_source,
      // The server matches it with the edit the hand-over registered.
      ...(this.patch ? { patch: { sha256: this.patch.sha256, steps: this.patch.steps.map((s) => ({ step: s.step, part: `${s.part.id}@${s.part.version}` })) } } : {}),
    };
  }

  private patchOf(step: string) {
    return this.patch?.steps.find((s) => s.step === step) ?? null;
  }

  /** Upload, our server's check, and one fix after a first failed check. */
  private async upload(result: { cut: FileRef; captions?: FileRef; verdict: CheckVerdict; steps: Record<string, string>; timeline: Timeline; beforeSound?: string }): Promise<MakeResult> {
    let current = result;
    this.at = 'upload';
    for (;;) {
      const candidate = (await this.writeFinal(current, current.verdict))!;
      const data = await readFile(candidate);
      if (data.length > MAX_UPLOAD_BYTES) throw new KitStop('The finished video is larger than the line takes.', 'failed');
      const sha256 = sha256Hex(data);
      // Only the exact bytes the final check passed are sent.
      if (sha256 !== current.cut.sha256 || data.length !== current.cut.bytes) {
        throw new KitStop('The finished video changed after its final check, so it wasn’t sent. Run the same command again to make it again.', 'failed', 'tool_failed');
      }
      let captions_vtt: string | undefined;
      if (current.captions) {
        const captions = await readFile(current.captions.path);
        if (sha256Hex(captions) !== current.captions.sha256 || captions.length !== current.captions.bytes) {
          throw new KitStop('The captions changed after the final check, so the video wasn’t sent. Run the same command again to make it again.', 'failed', 'tool_failed');
        }
        if (captions.length > MAX_CAPTIONS_BYTES) throw new KitStop('The captions file is larger than the line takes.', 'failed');
        captions_vtt = captions.toString('utf8');
      }
      const eyes = await this.lookAt(candidate, current);
      const assembly = normalizeAssemblyTimeline(current.timeline.assembly_timeline, { speech: this.style.style.traits.speech });
      let contentReview: unknown = current.timeline.content_review;
      const reviewPath = path.join(this.layout.final, 'content-review.json');
      try { contentReview = JSON.parse(await readFile(reviewPath, 'utf8')); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new KitStop('The saved content review could not be read. Repair that JSON before resuming.', 'change_request', 'output_invalid');
      }
      const custom = this.style.style.id.startsWith('custom-');
      let measuredDurationMs: number | null = null;
      let hasAudio = false;
      if (custom) {
        try {
          const probe = kitTools({ ffmpeg: this.tools.ffmpeg.path ?? '', ffprobe: this.tools.ffprobe.path ?? '', toolchain: this.toolchain }, this.stop.signal).probe;
          const info = await probe(candidate);
          measuredDurationMs = measuredFinalDurationMs(info.duration_s);
          hasAudio = info.has_audio === true;
        } catch {
          // Missing measurement leaves review incomplete; the edit clock is not a fallback.
        }
      }
      // Early feedback on the exact bytes (gooseworks-final-measure/1); the server measures them again and decides.
      let finalMeasure: FinalMeasure | null = null;
      let measureProblem: string | null = null;
      const measurePath = path.join(this.layout.final, 'final-measure.json');
      if (custom) {
        if (measuredDurationMs === null || !this.tools.ffmpeg.path) measureProblem = 'its length could not be read';
        else {
          try {
            finalMeasure = await measureFinal({ ffmpeg: this.tools.ffmpeg.path, file: candidate, outputSha256: sha256, durationMs: measuredDurationMs, hasAudio, timeline: assembly.timeline, signal: this.stop.signal });
          } catch (error) {
            measureProblem = 'the video tools could not read it';
            this.deps.log.write('warn', 'the final could not be measured', { error: error instanceof Error ? error.message : String(error) });
          }
        }
        await writeJson(measurePath, finalMeasure ?? { format: FINAL_MEASURE_FORMAT, output_sha256: sha256, measured_duration_ms: measuredDurationMs, checks: [], error: measureProblem });
      }
      const measureFailures = finalMeasure ? finalMeasureFailures(finalMeasure) : [];
      const contentProblems = finalContentReviewProblems(contentReview, sha256, assembly, custom ? measuredDurationMs : undefined, finalMeasure);
      await writeJson(path.join(this.layout.final, 'assembly-evidence.json'), { output_sha256: sha256, measured_duration_ms: measuredDurationMs, ...assembly, source_bytes_verified: assembly.status === 'complete', content_review_status: contentProblems.length ? 'incomplete' : 'approved', content_review_problems: contentProblems });
      if (custom && (measureProblem || measureFailures.length)) {
        this.run.status = 'failed';
        await this.saveRun();
        await this.reportWaiting(WAITING_FOR_MEASURED_FIX);
        this.reporter.close();
        const why = measureProblem ? `The candidate at ${candidate} could not be measured (${measureProblem}), so it wasn’t sent.` : `The candidate at ${candidate} failed its measured checks, so it wasn’t sent. ${measureFailures.join(' ')}`;
        return { status: 'stopped', code: 'final_measure_failed', message: `${why} Fix the edit, then run the same command again; unchanged assets are reused. The measurements are in ${measurePath}.` };
      }
      if (custom && contentProblems.length) {
        await writeJson(path.join(this.layout.final, 'review-request.json'), {
          candidate, output_sha256: sha256, measured_duration_ms: measuredDurationMs, timeline_revision: assembly.revision,
          creative_contract_revision: assembly.timeline?.creative_contract_revision ?? null,
          assembly_issues: assembly.issues, content_review_problems: contentProblems, final_measure_file: measurePath,
          instructions: 'Review this exact candidate from start to end. Record actual observations and unresolved issues (severity P0, P1 or P2; only P2 lets it go up). Save the completed review as content-review.json beside this request, then resume the same video make command. capabilities says how you perceived it: audio is listened only when a person or an audio-capable model heard the whole final, otherwise measured; motion is watched only when the moving picture was actually watched, otherwise measured. A measured review is accepted only when the final measurements pass (final-measure.json). Never claim listened or watched that did not happen. Fields not in the template are refused.',
          template: { output_sha256: sha256, timeline_revision: assembly.revision, creative_contract_revision: assembly.timeline?.creative_contract_revision ?? null,
            reviewer: '', verdict: 'incomplete', capabilities: { audio: 'measured', motion: 'measured' }, coverage: [], unresolved_issues: [],
            dimensions: Object.fromEntries(CONTENT_DIMENSIONS.map((name) => [name, { status: 'incomplete', note: 'Not reviewed yet' }])) },
        });
        this.run.status = 'failed';
        await this.saveRun();
        await this.reportWaiting(WAITING_FOR_CONTENT_REVIEW);
        this.reporter.close();
        return { status: 'stopped', code: 'content_review_incomplete', message: `The candidate is saved at ${candidate}. Its picture/audio review is incomplete. Save the actual review in ${reviewPath}, then resume the same command; unchanged assets are reused.` };
      }
      this.book.note = 'Sending your video for its final check';
      this.run.status = 'uploading';
      await this.saveRun();
      void this.reporter.send(true);

      let check: UploadCheck;
      try {
        const noted = [...verdictWarnings(current.verdict), ...(eyes?.warnings ?? [])].slice(0, MAX_SENT_WARNINGS);
        check = await this.sendUpload(sha256, data, captions_vtt, { ...this.manifestFor(current.steps),
          // Local file paths stay on this computer; the revision never included them.
          ...(assembly.timeline ? { assembly_timeline: portableTimeline(assembly.timeline) } : {}),
          ...(contentReview ? { content_review: contentReview } : {}),
          ...(finalMeasure ? { final_measure: finalMeasure } : {}),
          assembly_evidence: { status: assembly.status, revision: assembly.revision, output_sha256: sha256, source_bytes_verified: assembly.status === 'complete', issues: assembly.issues },
          content_review_status: contentProblems.length ? 'incomplete' : 'approved',
          ...(noted.length ? { check_warnings: noted } : {}) });
      } catch (error) {
        if (error instanceof LineError) throw lineStop(lineWords(error), error.next, error.code);
        throw error;
      }
      this.run.upload_attempt = check.attempt;
      if (check.result === 'pass') {
        const final = await this.promoteFinal(!!current.captions);
        this.run.status = 'done';
        await this.saveRun();
        await this.cleanTmp();
        return {
          status: 'done',
          message: `The video was made and passed its file checks. Review the actual picture and audio before calling it ready. Saved here: ${final}`,
          final,
          ...(eyes?.contact_sheet ? { contact_sheet: eyes.contact_sheet } : {}),
          ...(eyes?.warnings.length ? { warnings: eyes.warnings.map((w) => w.message) } : {}),
        };
      }
      const reasons = check.reasons.map((r) => r.message).filter(Boolean).join(' ');
      const serverFixUsed = (this.run.fixes ?? []).some((f) => f.from === 'server');
      const fix = check.fixes_left > 0 && !serverFixUsed ? this.fixFrom(current.verdict, check.reasons.map((r) => r.check), 'server') : null;
      if (!fix) {
        this.reporter.close();
        // The line went back to Making for a fix this run can't make, so it must hear the check failed.
        if (check.fixes_left > 0) {
          this.reportFailure('final-check', 'check_failed', plainWords(reasons, CHECK_FAILED, this.idNames()));
          await this.reporter.flush();
        }
        this.run.status = 'failed';
        await this.saveRun();
        return { status: 'failed', message: `The video didn’t pass our check. ${reasons}`.trim(), code: 'check_failed' };
      }
      this.run.fixes = [...(this.run.fixes ?? []), fix];
      this.run.status = 'running';
      await this.saveRun();
      this.reporter.resume();
      this.say('Our check found something to fix. Fixing it once…');
      current = await this.pipeline();
      if (!current.verdict.pass) return this.checkFailed(current.verdict);
      // A fix that changed nothing is not sent again: the same bytes get the same answer.
    }
  }

  /**
   * The slot, the PUT and done, saved stage by stage. These same bytes already
   * put (or already checked) are never sent again: done is asked again for
   * that upload, which gives the same answer.
   */
  private async sendUpload(sha256: string, data: Buffer, captions_vtt: string | undefined, manifest: Record<string, unknown>): Promise<UploadCheck> {
    if (Buffer.byteLength(JSON.stringify(manifest), 'utf8') > MAX_MANIFEST_BYTES) throw new KitStop('The source and review record exceeds the upload limit. Keep the candidate and move lengthy supporting notes to evidence files before resuming.', 'change_request', 'bad_input');
    const { line } = this.deps;
    type Stage = { upload_id: string; attempt: 1 | 2; sha256: string; quote_id: string; stage: 'requested' | 'put' | 'done'; result?: 'pass' | 'fail' };
    const saved = (await this.store.readUpload<{ uploads: Stage[] }>()) ?? { uploads: [] };
    const finish = async (stage: Stage): Promise<UploadCheck> => {
      this.book.note = 'Checking your video';
      this.run.status = 'checking';
      await this.saveRun();
      // The note goes out before the pause, so the card says the check has started.
      void this.reporter.send(true);
      await this.reporter.flush();
      this.reporter.pause();
      const check = await line.finishUpload(this.videoId, stage.upload_id, this.stop.signal);
      stage.stage = 'done';
      stage.result = check.result;
      await this.store.writeUpload(saved);
      return check;
    };
    // Bytes sent before (or maybe sent: a crash can land between the PUT and
    // the journal) are asked about first; they are sent again only when the
    // line says the slot holds no such file.
    const sent = [...saved.uploads].reverse().find((u) => u.sha256 === sha256 && u.quote_id === this.handed.quote_id);
    if (sent) {
      try {
        return await finish(sent);
      } catch (error) {
        if (!(sent.stage === 'requested' && error instanceof LineError && error.code === 'file_mismatch')) throw error;
        this.reporter.resume();
      }
    }
    const slot = await line.openUpload(this.videoId, { sha256, bytes: data.length, content_type: 'video/mp4', ...(captions_vtt ? { captions_vtt } : {}), manifest }, this.stop.signal);
    const stage: Stage = { upload_id: slot.upload_id, attempt: slot.attempt, sha256, quote_id: this.handed.quote_id, stage: 'requested' };
    saved.uploads.push(stage);
    await this.store.writeUpload(saved);
    await line.put(slot.put, data, this.stop.signal);
    stage.stage = 'put';
    await this.store.writeUpload(saved);
    return finish(stage);
  }

  /** The contact sheet and the product-presence warning, next to the final; never at the video's cost. */
  private async lookAt(final: string, made: { timeline: Timeline; beforeSound?: string }): Promise<Eyes | null> {
    const ffmpeg = this.tools.ffmpeg.path;
    if (!ffmpeg) return null;
    const listed = (this.planScope as { products?: unknown } | null)?.products;
    const products = Array.isArray(listed) ? (listed as Array<{ name?: unknown; images?: unknown } | null>) : [];
    try {
      return await lookAtFinal({
        ffmpeg,
        final,
        timeline: made.timeline,
        beforeSound: made.beforeSound,
        custom: this.style.style.id.startsWith('custom-'),
        products: products.map((p) => ({
          ...(typeof p?.name === 'string' ? { name: p.name } : {}),
          photos: (Array.isArray(p?.images) ? p.images : []).filter((ref): ref is FileRef => isFileRef(ref) && ref.media === 'image').map((ref) => ref.path),
        })),
        signal: this.stop.signal,
      });
    } catch (error) {
      this.deps.log.write('warn', 'the contact sheet could not be made', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  private async cleanTmp(): Promise<void> {
    for (const key of this.parts.keys()) await rm(path.join(this.store.stepDir(key), 'out', '.tmp'), { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The first line after the hand-over: which video, for which brand, on which GooseWorks. */
export function startLine(video: HandedVideo | undefined, environment: MakeDeps['environment']): string {
  const name = video?.name?.trim();
  const brand = video?.brand?.trim();
  const where = video?.environment?.trim() || environment;
  return `Making ${name ? `“${name}”` : 'your video'}${brand ? ` for ${brand}` : ''} on GooseWorks ${where}.`;
}

export async function makeVideo(videoId: string, deps: MakeDeps): Promise<MakeResult> {
  return new Maker(videoId, deps).make();
}
