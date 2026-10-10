// Sends progress to the line after every piece and step, and at least once a
// minute while anything runs (a slow piece must never look quiet). A progress
// answer that says the video stopped stops the run.
import { LineError, type VideoLine } from '../line/client';
import type { ProgressFailure } from '../line/types';
import type { KitLog } from './log';
import type { ProgressBook } from './progress';

export class ProgressReporter {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private last = 0;
  private soon: NodeJS.Timeout | null = null;
  private paused = false;
  private failure: ProgressFailure | null = null;
  private failureRefused = false;
  private lineRefused = false;

  constructor(
    private readonly line: VideoLine,
    private readonly videoId: string,
    private readonly book: ProgressBook,
    private readonly log: KitLog,
    private readonly onStop: (message: string, reason: 'stop' | 'update_kit' | 'change_request', code?: string) => void,
    private readonly heartbeatMs = 45_000,
    private readonly signal?: AbortSignal,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.send(true), this.heartbeatMs);
    this.timer.unref?.();
  }

  stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.soon) clearTimeout(this.soon);
    this.timer = null;
    this.soon = null;
  }

  /** While our server checks the upload, the check call is the sign of life: no progress goes out. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** The line refused a report, so the run is ending on the line's own words. */
  get refused(): boolean {
    return this.lineRefused;
  }

  /** Sends why the run gave up with the next report, once. Never throws. */
  fail(failure: ProgressFailure): Promise<void> {
    if (this.failureRefused) return this.send(true);
    this.failure = failure;
    this.paused = false;
    return this.send(true);
  }

  /** Sends now (or right after the call in flight, or within 1.5 s when one just went). Never throws. */
  send(force = false): Promise<void> {
    if (this.paused) return Promise.resolve();
    const wait = 1500 - (Date.now() - this.last);
    if (!force && wait > 0) {
      if (!this.soon && !this.inFlight) {
        this.soon = setTimeout(() => {
          this.soon = null;
          void this.send(true);
        }, wait);
        this.soon.unref?.();
      } else this.again = true;
      return this.inFlight ?? Promise.resolve();
    }
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.post().finally(() => {
      this.inFlight = null;
      if (this.again) {
        this.again = false;
        void this.send(true);
      }
    });
    return this.inFlight;
  }

  /** Waits for the call in flight, so the last word reaches the card before the kit exits. */
  async flush(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  private async post(): Promise<void> {
    if (this.paused) return;
    this.last = Date.now();
    const failure = this.failure;
    try {
      // The run's own stop signal may already be aborted when it gives up, so the last word goes without it.
      const request = failure ? { ...this.book.request(), failure } : this.book.request();
      const answer = await this.line.progress(this.videoId, request, failure ? undefined : this.signal);
      if (failure && this.failure === failure) this.failure = null;
      if (answer.stop === true || answer.stage === 'stopped') this.onStop('This video was stopped.', 'stop');
    } catch (error) {
      if (failure && error instanceof LineError && namesFailure(error)) {
        // An older line refuses the field it doesn't know: it gets the report without it, now and after.
        this.failure = null;
        this.failureRefused = true;
        this.log.write('warn', 'the line does not take a failure reason', { code: error.code });
        return this.post();
      }
      if (error instanceof LineError && error.next !== 'retry') {
        this.lineRefused = true;
        this.onStop([error.message, error.fix].filter(Boolean).join(' '), error.next, error.code);
        return;
      }
      this.log.write('warn', 'progress could not be sent', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/** A 400 that names the `failure` field: an unknown field, or a shape the line doesn't take. */
function namesFailure(error: LineError): boolean {
  if (error.status !== 400) return false;
  const fields = Array.isArray(error.details?.fields) ? (error.details.fields as unknown[]) : [];
  if (fields.some((f) => typeof f === 'string' && (f === 'failure' || f.startsWith('failure.')))) return true;
  return /\bfailure\b/.test(`${error.fix} ${error.message}`);
}
