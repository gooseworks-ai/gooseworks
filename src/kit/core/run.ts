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
import { copyFile, mkdir, readFile, rm } from 'fs/promises';
import * as path from 'path';
import type {
  BrandKit,
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
import { LineError, linkedSignal, sleep as realSleep, type Sleep, type VideoLine } from '../line/client';
import { MAX_CAPTIONS_BYTES, MAX_UPLOAD_BYTES, type ApprovedPlan, type DeviceAnswer, type HandOver, type ProgressFailure, type UploadCheck } from '../line/types';
import { bindInputs } from './bind';
import { canonicalHash, isFileRef, pieceSeed, sha256Hex, stepHash } from './canonical';
import { deviceId, deviceReport } from './device';
import { asPartError, KitStop, PartError } from './errors';
import { fileRef, hashFile, intact, materialize } from './files';
import type { KitHost, LoadedPart } from './host';
import type { KitLog } from './log';
import { isInside, runLayout, type RunLayout } from './paths';
import { FAILED_TWICE, PieceCache, PieceFailure, pieceOrderer } from './pieces';
import { plainWords } from './plain-words';
import { ProgressBook } from './progress';
import { ProgressReporter } from './progress-reporter';
import { readJson, RunStore, takeRunLock, writeJson } from './save';
import { assertCheckable, schemaErrors } from './schema';
import { withoutSignedLinks } from './secrets';
import { fetchStyle, readLocalStyle, type LoadedStyle } from './style';
import { inspectFfmpeg, kitTools, toolchainId, type Toolchain } from './toolchain';
import { PartLoadError } from '../parts/loader';
import { KIT_DEV_ENV } from '../env';
import { interfaceRefusal, KIT_VERSION, kitRangeRefusal } from './version';

export const LAYER_ORDER: readonly LayerSlot[] = ['brand', 'captions', 'sound', 'check'];
const SLOT_KIND: Record<LayerSlot, PartKind> = { brand: 'compose', captions: 'caption', sound: 'mix', check: 'check' };
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
  now?: () => Date;
  /** Ctrl-C from the command. */
  signal?: AbortSignal;
}

export type MakeResult =
  | { status: 'done'; message: string }
  | { status: 'stopped' | 'failed'; message: string }
  | { status: 'update_kit'; message: string; min_version?: string };

/** One fix: re-run this step or layer with these extra inputs (a new round makes a new step hash). */
interface Fix {
  target: string;
  inputs: JsonObject;
  round: number;
  from: 'local' | 'server';
}

/** run.json as the kit writes it: the contract's record plus the fixes in force, so a restart keeps them. */
type KitRunRecord = RunRecord & { fixes?: Fix[] };

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
const PLAN_CHANGE = 'This video can’t be made from this plan. Change the plan, then make it again.';
/** The server's `failure.code` shape. */
const FAILURE_CODE = /^[a-z][a-z0-9_]{0,39}$/;
/** Codes the server keeps the video in Making for (gooseworks-app video-line/run-failure.ts RESUMABLE_CODES). */
const RESUMABLE_CODES: ReadonlySet<string> = new Set(['timeout', 'tool_failed', 'needs_missing']);

/** What a run was made from: a failure report only stands for a run made from the same. */
interface ReportKey {
  quote_id: string;
  plan_sha256: string;
  lock_sha256: string;
  kit: string;
  toolchain: string;
}

/** pending-report.json: a failure report the line never took. */
type PendingReport = ReportKey & { report: 1; failure: ProgressFailure; saved_at: string };

/** A part that would not load, in plain words: which part and why go to the log. */
function loadStop(error: unknown): KitStop {
  const code = error instanceof PartLoadError ? error.code : undefined;
  switch (code) {
    case 'kit_range':
      return new KitStop('This video needs a newer video kit. Nothing was spent.', 'update_kit', code);
    case 'unreachable':
      return new KitStop('This video’s parts could not be downloaded right now. Run the same command again in a minute. Nothing was spent.', 'stop', code);
    case 'bad_cache':
      return new KitStop('The video kit’s folder on this computer is busy or can’t be used. Run the same command again in a minute. Nothing was spent.', 'stop', code);
    case 'withdrawn':
      return new KitStop(`A part this video uses was withdrawn. ${PLAN_CHANGE} Nothing was spent.`, 'change_request', code);
    default:
      return new KitStop(`A part this video uses can’t run. ${PLAN_CHANGE} Nothing was spent.`, 'change_request', code);
  }
}

function lineWords(error: LineError): string {
  return [error.message, error.fix].filter(Boolean).join(' ');
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

/** Plain words for a part's failure: the line's own words when it said them, never a part's detail. */
function failureWords(error: PartError): string {
  if (error instanceof PieceFailure && error.spent) return FAILED_TWICE;
  if (error instanceof PieceFailure) return [error.line.error, error.line.fix].filter(Boolean).join(' ');
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
      return PLAN_CHANGE;
    default:
      return 'Part of this video could not be made. Run the same command again; what was made so far is kept.';
  }
}

function checkLock(raw: unknown, videoId: string, plan: ApprovedPlan): PartsLock {
  const lock = raw as PartsLock;
  if (!lock || lock.lock !== 1 || lock.video_id !== videoId || !lock.parts || !lock.layers || !lock.style) {
    throw new KitStop('This video’s parts list can’t be read. Nothing was spent.', 'change_request');
  }
  if (lock.style.id !== plan.style_id || lock.style.version !== plan.style_version) throw new KitStop('This video’s parts list is for another style. Nothing was spent.', 'change_request');
  return lock;
}

function expectationOf(style: LoadedStyle['style'], plan: ApprovedPlan): OutputExpectation {
  const aspect = String(plan.body.aspect ?? style.aspects?.[0] ?? '');
  const size = ASPECT_SIZE[aspect];
  if (!size) throw new KitStop('This video’s shape can’t be made by the kit.', 'change_request');
  const scenes = Array.isArray(plan.body.scenes) ? (plan.body.scenes as Array<{ line?: unknown }>) : [];
  const script = scenes.map((s) => s?.line).filter((l): l is string => typeof l === 'string' && l.length > 0);
  return {
    aspect: aspect as OutputExpectation['aspect'],
    ...size,
    duration_s: { min: style.duration.min_seconds, max: style.duration.max_seconds },
    speech: (style.traits?.speech ?? 'none') as OutputExpectation['speech'],
    captions: style.traits?.captions === true,
    end_card: style.traits?.end_card === true,
    qc_flags: Array.isArray(style.traits?.qc_flags) ? style.traits.qc_flags : [],
    ...(script.length ? { script } : {}),
  };
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
  private readonly book = new ProgressBook();
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
  private style!: LoadedStyle;
  private planScope: unknown;
  private brand!: BrandKit;
  private readonly parts = new Map<string, LoadedPart>();
  private readonly hosted = new Map<string, string>();
  private readonly pieceLocks = new Map<string, Promise<void>>();
  /** Where the run is, for the failure report: a step id or a stage before or after the steps. */
  private at = 'hand-over';
  private failureSent = false;

  constructor(private readonly videoId: string, private readonly deps: MakeDeps) {
    this.sleep = deps.sleep ?? realSleep;
    this.now = deps.now ?? (() => new Date());
    deps.signal?.addEventListener('abort', () => this.halt(new KitStop('Stopped on this computer. Run the same command to carry on.', 'stop')), { once: true });
  }

  private halt(stop: KitStop): void {
    this.fatal ??= stop;
    if (!this.stop.signal.aborted) this.stop.abort(stop);
  }

  private say(line: string): void {
    this.deps.log.say(line);
  }

  async make(): Promise<MakeResult> {
    const { deps } = this;
    let dev: { parts: string | null; styles: string | null };
    try {
      dev = this.devFolders();
    } catch (error) {
      return this.ended(error);
    }
    this.tools = deps.tools ?? (await inspectFfmpeg({ home: deps.home, env: deps.env, setup: true, download: (u, m) => deps.line.download(u, m), say: (l) => this.say(l) }));
    const browser = await deps.host.browser.check({ home: deps.home, setup: true, env: deps.env, say: (l) => this.say(l) });
    this.browserReady = browser.ok;
    this.toolchain = toolchainId(this.tools, browser.ok ? browser.version : null);
    const report = await deviceReport({ home: deps.home, worker: deps.line.isWorker, tools: this.tools, browser });

    let answer: DeviceAnswer;
    try {
      answer = await deps.line.handOver(this.videoId, report);
    } catch (error) {
      if (error instanceof LineError) {
        if (error.next === 'update_kit') return { status: 'update_kit', message: lineWords(error) };
        return { status: 'stopped', message: lineWords(error) };
      }
      throw error;
    }
    if (!answer.kit.ok) return { status: 'update_kit', message: 'This video kit is too old for this video.', min_version: answer.kit.min_version };
    if (!answer.line) return { status: 'stopped', message: 'This video can’t be made on this computer right now.' };
    this.handed = answer.line;

    this.layout = runLayout(deps.home, this.videoId);
    const release = await takeRunLock(this.layout, this.now());
    // From here on the lock is always given back, whatever fails.
    try {
      deps.log.attach(this.layout.log);
      deps.log.write('info', 'video handed over', { quote_id: this.handed.quote_id, stage: this.handed.stage, kit: KIT_VERSION });
      this.store = new RunStore(this.layout);
      this.cache = new PieceCache(this.layout.pieces);
      this.reporter = new ProgressReporter(deps.line, this.videoId, this.book, deps.log, (message, reason, code) => this.halt(new KitStop(message, reason, code)), deps.heartbeatMs, this.stop.signal);
      const replayed = await this.replayPending();
      if (replayed) return replayed;
      if (this.fatal) throw this.fatal;
      // Reports start now, so checking the style and parts never looks quiet.
      this.reporter.start();
      void this.reporter.send(true);
      return await this.makeHandedOver(dev);
    } catch (error) {
      return await this.ended(error);
    } finally {
      this.reporter?.stopTimer();
      await this.reporter?.flush().catch(() => undefined);
      await this.keepPendingReport().catch((error: unknown) => deps.log.write('warn', 'the failure report could not be saved', { error: error instanceof Error ? error.message : String(error) }));
      await release();
    }
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
    return { status: 'failed', message: saved.failure.detail };
  }

  /** Keeps a failure report the line never took for the next run; one taken, or a finished video, clears it. */
  private async keepPendingReport(): Promise<void> {
    if (!this.reporter || !this.layout) return;
    const unsent = this.reporter.undelivered;
    const key = unsent ? this.reportKey() : null;
    if (unsent && key) {
      const pending: PendingReport = { report: 1, ...key, failure: unsent, saved_at: this.now().toISOString() };
      await writeJson(this.layout.pendingReport, pending);
      this.deps.log.write('warn', 'the failure report was not taken; the next run sends it', { step: unsent.step, code: unsent.code });
    } else if (this.failureSent || this.run?.status === 'done') {
      await rm(this.layout.pendingReport, { force: true });
    }
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
    const stop = this.fatal ?? (error instanceof KitStop ? error : null);
    if (stop) this.deps.log.write('warn', 'the run stopped', { reason: stop.reason, code: stop.code ?? null, message: stop.message });
    if (this.run) {
      this.run.status = stop && stop.reason === 'stop' ? 'stopped' : 'failed';
      await this.saveRun().catch(() => undefined);
    }
    if (stop && (stop.reason === 'failed' || stop.reason === 'change_request' || stop.reason === 'refused')) {
      this.reportFailure(this.at, stop.code ?? 'change_request', stop.message);
      await this.reporter?.flush().catch(() => undefined);
    }
    if (stop) {
      if (stop.reason === 'update_kit') return { status: 'update_kit', message: stop.message };
      return { status: stop.reason === 'stop' ? 'stopped' : 'failed', message: stop.message };
    }
    this.deps.log.write('error', 'the run ended on an error', { error: error instanceof Error ? error.message : String(error) });
    return { status: 'failed', message: 'This video could not be made right now. Run the same command again; what was made so far is kept.' };
  }

  /** Tells the line once why the run gave up; the line's own refusals already ended it on its words. */
  private reportFailure(step: string, code: string, detail: string): void {
    if (!this.reporter || this.failureSent || this.reporter.refused) return;
    this.failureSent = true;
    void this.reporter.fail({ step: step.slice(0, 60), code: FAILURE_CODE.test(code) ? code : 'change_request', detail: detail.trim().slice(0, 2000) });
  }

  private async saveRun(): Promise<void> {
    this.run.updated_at = this.now().toISOString();
    await this.store.writeRun(this.run);
  }

  private async makeHandedOver(dev: { parts: string | null; styles: string | null }): Promise<MakeResult> {
    const { deps, handed } = this;
    const plan = handed.plan;
    this.at = 'plan';
    if (!plan || plan.project_id !== this.videoId || plan.style_id !== handed.style_package?.style_id || plan.style_version !== handed.style_package?.version) {
      throw new KitStop('The plan handed over is not this video’s. Nothing was spent.', 'change_request');
    }
    if (handed.parts_lock) this.lock = checkLock(handed.parts_lock, this.videoId, plan);
    else if (!dev.parts) throw new KitStop('This video’s parts are not ready yet. Run the same command again in a few minutes. Nothing was spent.', 'stop');

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
      started_at: previous?.started_at ?? started,
      updated_at: started,
    };
    await this.saveRun();

    // The style, then every part: all checked before anything is spent.
    // The style must be exactly the one approved: the package's hash and the plan's must agree.
    if (!plan.style_hash || handed.style_package.style_hash !== plan.style_hash) {
      throw new KitStop('The style handed over is not the one approved for this video. Nothing was spent.', 'change_request');
    }
    const pin = { id: plan.style_id, version: plan.style_version, hash: plan.style_hash };
    this.at = 'style';
    const note = (why: string, fields: Record<string, unknown>) => deps.log.write('error', why, fields);
    this.style = dev.styles
      ? await readLocalStyle(dev.styles, pin, note)
      : await fetchStyle({ ref: handed.style_package, projectId: this.videoId, dir: this.layout.style, download: (u, m) => deps.line.download(u, m, this.stop.signal), note });
    await this.loadParts(!!dev.parts);

    // The plan's files, checked against the hashes frozen at the yes.
    this.at = 'plan-files';
    const planFiles = {
      dir: this.layout.inputs,
      download: (u: string, m: number) => deps.line.download(u, m, this.stop.signal),
      hostedLink: (fileId: string) =>
        deps.line.hostedFileLink(this.videoId, fileId, this.stop.signal).catch((error: unknown) => {
          if (error instanceof LineError) throw new KitStop(`${lineWords(error)} Nothing was spent.`, error.next === 'update_kit' ? 'update_kit' : error.next === 'change_request' ? 'change_request' : 'stop', error.code);
          throw error;
        }),
      // A hosted plan file goes into a payload as the line already knows it.
      onHosted: (sha256: string, ref: string) => this.hosted.set(sha256, ref),
    };
    this.planScope = await materialize(plan.body, planFiles);
    this.brand = brandKit(await materialize(plan.brand, planFiles));

    this.book.note = 'Making your video';
    this.book.plan([
      ...this.style.style.timeline.map((s) => ({ id: s.id, kind: this.parts.get(s.id)!.manifest.kind, typical_s: this.parts.get(s.id)!.manifest.timing.typical_s })),
      ...this.layersOn().map((slot) => ({ id: `layer-${slot}`, kind: SLOT_KIND[slot], typical_s: this.parts.get(`layer-${slot}`)!.manifest.timing.typical_s })),
    ]);
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
      ...this.style.style.timeline.map((s) => ({ key: s.id, ref: s.part })),
      ...this.layersOn().map((slot) => ({ key: `layer-${slot}`, ref: layerRefs?.[slot], slot })),
    ];
    for (const { key, ref, slot } of wanted) {
      this.at = key;
      if (!ref || typeof ref.id !== 'string' || typeof ref.version !== 'string') throw new KitStop('This video names a part it has no version for. Nothing was spent.', 'change_request');
      if (lock) {
        const entry = lock.parts[ref.id];
        if (!entry || entry.version !== ref.version) {
          this.deps.log.write('error', 'part not in the parts list', { step: key, part: `${ref.id}@${ref.version}`, locked: entry?.version ?? null });
          throw new KitStop(`A part this video uses is not in this video’s parts list, so it can’t run. ${PLAN_CHANGE} Nothing was spent.`, 'change_request', 'not_locked');
        }
        const tooOld = kitRangeRefusal({ id: ref.id, version: ref.version, kit: entry.kit });
        if (tooOld) {
          this.deps.log.write('error', 'part needs another kit', { step: key, refusal: tooOld });
          throw new KitStop('This video needs a newer video kit. Nothing was spent.', 'update_kit', 'kit_range');
        }
      }
    }
    for (const { key, ref, slot } of wanted) {
      this.at = key;
      let loaded: LoadedPart;
      try {
        loaded = await this.deps.host.loader.load({ ref, lock, dev, home: this.deps.home, env: this.deps.env, signal: this.stop.signal });
      } catch (error) {
        this.deps.log.write('error', 'part could not be loaded', {
          step: key,
          part: `${ref.id}@${ref.version}`,
          code: error instanceof PartLoadError ? error.code : null,
          error: error instanceof Error ? error.message : String(error),
        });
        throw loadStop(error);
      }
      const m = loaded.manifest;
      const refused = (why: string, fields: Record<string, unknown> = {}) =>
        this.deps.log.write('error', why, { step: key, part: `${ref.id}@${ref.version}`, ...fields });
      if (m.id !== ref.id || m.version !== ref.version) {
        refused('part loaded as another version', { loaded: `${m.id}@${m.version}` });
        throw new KitStop(`A part this video uses loaded as another version, so it can’t run. ${PLAN_CHANGE} Nothing was spent.`, 'change_request', 'manifest_mismatch');
      }
      const refusal = interfaceRefusal(m);
      if (refusal) {
        refused('part needs another interface', { refusal });
        throw new KitStop('This video needs a newer video kit. Nothing was spent.', 'update_kit', 'interface');
      }
      if (slot && (m.layer !== slot || m.kind !== SLOT_KIND[slot])) {
        refused('part can’t fill its layer', { slot, layer: m.layer ?? null, kind: m.kind });
        throw new KitStop(`A part this video uses can’t do the job its plan gives it. ${PLAN_CHANGE} Nothing was spent.`, 'change_request', 'wrong_layer');
      }
      const lockModels = lock ? lock.parts[ref.id].models : m.needs.models;
      const paid = m.needs.network || m.needs.models.length > 0 || m.kind.startsWith('generate_');
      if (paid && (!Array.isArray(lockModels) || lockModels.length === 0)) {
        refused('paid part has no models in the parts list');
        throw new KitStop(`A part this video uses would order paid pieces its approved price doesn’t allow. ${PLAN_CHANGE} Nothing was spent.`, 'change_request', 'no_models');
      }
      const missing = this.missingNeeds(m.needs);
      if (missing) {
        refused('part needs what this computer lacks', { missing });
        throw new KitStop(`This computer can’t make this video: ${missing}. Run the computer check, then make the video again. Nothing was spent.`, 'refused', 'needs_missing');
      }
      try {
        assertCheckable(m.inputs);
        assertCheckable(m.outputs);
      } catch (error) {
        refused('part schema can’t be checked', { error: (error as Error).message });
        throw new KitStop('This video needs a newer video kit. Nothing was spent.', 'update_kit', 'schema');
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
  private async pipeline(): Promise<{ cut: FileRef; captions?: FileRef; verdict: CheckVerdict; steps: Record<string, string> }> {
    const outputs = new Map<string, Record<string, unknown>>();
    const scope = { plan: this.planScope, brand: this.brand, steps: outputs, assets: this.style.assets };
    const hashes: Record<string, string> = {};
    let timeline: Timeline | null = null;
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
      const out = await this.runStep({ id: step.id, ref: step.part, loaded, inputs, models: this.modelsOf(step.part, loaded), fix: round }, hashes);
      outputs.set(step.id, out);
      if (out.timeline && typeof out.timeline === 'object') timeline = out.timeline as Timeline;
    }
    const last = this.style.style.timeline[this.style.style.timeline.length - 1];
    const made = outputs.get(last.id)?.video;
    if (!isFileRef(made) || made.media !== 'video') throw new KitStop('The style’s last step made no video.', 'change_request');
    let cut: FileRef = made;
    timeline ??= await this.bareTimeline(cut);

    let words: FileRef | undefined;
    let captions: FileRef | undefined;
    let verdict: CheckVerdict | null = null;
    for (const slot of this.layersOn()) {
      const id = `layer-${slot}`;
      const loaded = this.parts.get(id)!;
      const ref = { id: loaded.manifest.id, version: loaded.manifest.version };
      const { inputs, round } = fixed(id, { video: cut, timeline, brand: this.brand, expect: expectationOf(this.style.style, this.handed.plan), ...(words ? { words } : {}) });
      const out = await this.runStep({ id, ref, loaded, inputs, models: this.modelsOf(ref, loaded), fix: round }, hashes);
      if (slot === 'check') {
        verdict = out.verdict as CheckVerdict;
        continue;
      }
      const video = out.video;
      if (!isFileRef(video) || video.media !== 'video') {
        this.deps.log.write('error', 'layer made no video', { step: id });
        throw new KitStop(`Finishing this video gave back no video. ${PLAN_CHANGE}`, 'change_request', 'output_invalid');
      }
      cut = video;
      if (out.timeline && typeof out.timeline === 'object') timeline = out.timeline as Timeline;
      if (slot === 'captions') {
        if (isFileRef(out.words)) words = out.words;
        if (isFileRef(out.captions)) captions = out.captions;
      }
    }
    if (!verdict || typeof verdict.pass !== 'boolean' || !Array.isArray(verdict.checks)) throw new KitStop('The final check gave no verdict.', 'change_request');
    return { cut, captions, verdict, steps: hashes };
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

  /** One step: reused when its saved record has the same hash and intact files, else run (and retried once). */
  private async runStep(spec: StepSpec, hashes: Record<string, string>): Promise<Record<string, unknown>> {
    const { manifest } = spec.loaded;
    this.at = spec.id;
    const inputErrors = schemaErrors(manifest.inputs, spec.inputs, `${spec.id} inputs`);
    if (inputErrors.length) {
      this.deps.log.write('error', 'step inputs refused', { step: spec.id, errors: inputErrors });
      throw new KitStop(`One step of this video was given something it can’t take, so the video stopped there. ${PLAN_CHANGE}`, 'change_request', 'bad_input');
    }
    const hash = stepHash({ interface: manifest.interface, part: spec.ref, toolchain: this.toolchain, inputs: spec.inputs, fix: spec.fix });
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
      const link = linkedSignal([this.stop.signal], timeoutMs);
      try {
        const ctx = this.context(spec, attempt, workDir, tmpDir, link.signal, record);
        const outputs = await new Promise<Record<string, unknown>>((resolve, reject) => {
          const ended = () => reject(this.stop.signal.aborted ? new PartError('stopped') : new PartError('timeout', `${spec.id} ran past ${manifest.timing.timeout_s} s`));
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
        const words = failureWords(failure!);
        const code = reportedCode(failure!);
        this.book.finish(spec.id, 'failed');
        this.reportFailure(spec.id, code, words);
        throw new KitStop(words, failure!.code === 'over_quote' ? 'stop' : 'failed', code);
      } finally {
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

  private context(spec: StepSpec, attempt: 1 | 2, workDir: string, tmpDir: string, signal: AbortSignal, record: StepRecord): PartContext {
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
          workDir,
          runRoot: this.layout.root,
          cache: this.cache,
          signal,
          sleep: this.sleep,
          probe: tools.probe,
          hosted: this.hosted,
          locks: this.pieceLocks,
          onWait: () => void this.reporter.send(),
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
      error: (code, detail) => new PartError(code, detail),
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
    // Check parts give each failed check words in `message`, beside the interface's fields; only plain ones reach the card.
    const said = verdict.checks.find((c) => c.status === 'fail') as { code?: unknown; message?: unknown } | undefined;
    const message = typeof said?.message === 'string' ? said.message : '';
    const detail = plainWords(message, CHECK_FAILED, this.idNames());
    this.deps.log.write('warn', 'the final check failed', { check: typeof said?.code === 'string' ? said.code : null, message, detail });
    this.reportFailure('layer-check', 'check_failed', detail);
    await this.reporter.flush();
    this.run.status = 'failed';
    await this.saveRun();
    return { status: 'failed', message: 'The video didn’t pass the final check, so it wasn’t sent. Nothing more will be charged for it.' };
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
    const final = path.join(this.layout.final, 'final.mp4');
    await copyFile(result.cut.path, final);
    if (result.captions) await copyFile(result.captions.path, path.join(this.layout.final, 'captions.vtt'));
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
    };
  }

  /** Upload, our server's check, and one fix after a first failed check. */
  private async upload(result: { cut: FileRef; captions?: FileRef; verdict: CheckVerdict; steps: Record<string, string> }): Promise<MakeResult> {
    let current = result;
    this.at = 'upload';
    for (;;) {
      const final = (await this.writeFinal(current, current.verdict))!;
      const data = await readFile(final);
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
      this.book.note = 'Sending your video for its final check';
      this.run.status = 'uploading';
      await this.saveRun();
      void this.reporter.send(true);

      let check: UploadCheck;
      try {
        check = await this.sendUpload(sha256, data, captions_vtt, this.manifestFor(current.steps));
      } catch (error) {
        if (error instanceof LineError) throw new KitStop(lineWords(error), error.next === 'update_kit' ? 'update_kit' : error.next === 'change_request' ? 'change_request' : 'stop', error.code);
        throw error;
      }
      this.run.upload_attempt = check.attempt;
      if (check.result === 'pass') {
        this.run.status = 'done';
        await this.saveRun();
        await this.cleanTmp();
        return { status: 'done', message: `Your video is ready. It passed the final check. Saved here: ${final}` };
      }
      const reasons = check.reasons.map((r) => r.message).filter(Boolean).join(' ');
      const serverFixUsed = (this.run.fixes ?? []).some((f) => f.from === 'server');
      const fix = check.fixes_left > 0 && !serverFixUsed ? this.fixFrom(current.verdict, check.reasons.map((r) => r.check), 'server') : null;
      if (!fix) {
        this.run.status = 'failed';
        await this.saveRun();
        return { status: 'failed', message: `The video didn’t pass our check. ${reasons}`.trim() };
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
    const { line } = this.deps;
    type Stage = { upload_id: string; attempt: 1 | 2; sha256: string; quote_id: string; stage: 'requested' | 'put' | 'done'; result?: 'pass' | 'fail' };
    const saved = (await this.store.readUpload<{ uploads: Stage[] }>()) ?? { uploads: [] };
    const finish = async (stage: Stage): Promise<UploadCheck> => {
      this.book.note = 'Checking your video';
      this.run.status = 'checking';
      await this.saveRun();
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

  private async cleanTmp(): Promise<void> {
    for (const key of this.parts.keys()) await rm(path.join(this.store.stepDir(key), 'out', '.tmp'), { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function makeVideo(videoId: string, deps: MakeDeps): Promise<MakeResult> {
  return new Maker(videoId, deps).make();
}
