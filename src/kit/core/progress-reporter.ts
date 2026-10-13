// Sends progress to the line after every piece and step, and at least once a
// minute while anything runs (a slow piece must never look quiet). A progress
// answer that says the video stopped stops the run. Once the run ends the
// reporter is closed: one last word at most, on its own deadline.
import { LineError, lineWords, linkedSignal, type VideoLine } from '../line/client';
import type { ProgressFailure } from '../line/types';
import type { KitLog } from './log';
import type { ProgressBook } from './progress';

/** How long the last word may take before the kit exits and keeps it for the next run; with the exit grace, a run ends within 30 s. */
export const LAST_WORD_MS = 25_000;

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
  /** Set once the run gives up: from then on reports go without the run's stop signal, which may be aborted. */
  private lastWord = false;
  /** The run ended: no heartbeat, and no report but the last word. */
  private closed = false;
  /** The one last-word post after the close has gone out. */
  private lastWordGone = false;
  /** Cuts the post in flight short. */
  private current: AbortController | null = null;

  constructor(
    private readonly line: VideoLine,
    private readonly videoId: string,
    private readonly book: ProgressBook,
    private readonly log: KitLog,
    private readonly onStop: (message: string, reason: 'stop' | 'update_kit' | 'change_request', code?: string, next?: 'sign_in') => void,
    private readonly heartbeatMs = 45_000,
    private readonly signal?: AbortSignal,
    /** How long the last word and a flush may take; a failure not taken by then waits for the next run. */
    private readonly lastWordMs = LAST_WORD_MS,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.send(true), this.heartbeatMs);
    this.timer.unref?.();
  }

  /**
   * The run is over: the heartbeat stops and a report on its way is dropped, so the
   * failure (if any) is the only report left to send. Safe to call more than once.
   */
  close(): void {
    if (this.closed) return;
    if (this.timer) clearInterval(this.timer);
    if (this.soon) clearTimeout(this.soon);
    this.timer = null;
    this.soon = null;
    this.closed = true;
    this.again = false;
    if (!this.lastWord) this.current?.abort();
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
    this.lastWord = true;
    if (this.failureRefused) return this.send(true);
    this.failure = failure;
    this.paused = false;
    return this.send(true);
  }

  /** Sends now (or right after the call in flight, or within 1.5 s when one just went). Never throws. */
  send(force = false): Promise<void> {
    if (this.paused) return Promise.resolve();
    if (this.closed && (!this.lastWord || this.lastWordGone)) return this.inFlight ?? Promise.resolve();
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

  /** The failure report the line has not taken yet: it could not be reached. */
  get undelivered(): ProgressFailure | null {
    return this.failure;
  }

  /**
   * Waits for the call in flight, so the last word reaches the card before the kit exits, but
   * never past the deadline: a line that can't be reached must not keep the kit running.
   * False when a failure report is still unsent.
   */
  async flush(deadlineMs = this.lastWordMs): Promise<boolean> {
    const until = Date.now() + deadlineMs;
    while (this.inFlight) {
      const inFlight = this.inFlight;
      if (!(await settlesBy(inFlight, until))) {
        this.again = false;
        this.current?.abort();
        await inFlight;
        break;
      }
    }
    return this.failure === null;
  }

  /**
   * Sends an earlier run's failure report now: taken with its reason, refused for good (an
   * older line, or the line's own refusal), or unsent because the line could not be reached.
   */
  async replay(failure: ProgressFailure): Promise<'taken' | 'refused' | 'unsent'> {
    await this.fail(failure);
    const sent = await this.flush();
    this.failure = null;
    this.lastWord = false;
    if (!sent) return 'unsent';
    return this.failureRefused || this.lineRefused ? 'refused' : 'taken';
  }

  private async post(): Promise<void> {
    if (this.paused) return;
    this.last = Date.now();
    const failure = this.failure;
    const lastWord = this.lastWord;
    if (this.closed && lastWord) this.lastWordGone = true;
    const own = new AbortController();
    this.current = own;
    // The run's own stop signal may already be aborted when it gives up, so the last word goes without it, on its own deadline.
    const link = linkedSignal([own.signal, lastWord ? undefined : this.signal], lastWord ? this.lastWordMs : undefined);
    try {
      const request = failure ? { ...this.book.request(), failure } : this.book.request();
      const answer = await this.line.progress(this.videoId, request, link.signal);
      if (failure && this.failure === failure) this.failure = null;
      if (answer.stop === true || answer.stage === 'stopped') this.onStop('This video was stopped.', 'stop');
    } catch (error) {
      // The run stopped or ended while this report was on its way: that is not a report that failed.
      if (!lastWord && link.signal.aborted) return;
      if (failure && error instanceof LineError && namesFailure(error)) {
        // An older line refuses the field it doesn't know: it gets the report without it, now and after.
        this.failure = null;
        this.failureRefused = true;
        this.log.write('warn', 'the line does not take a failure reason', { code: error.code });
        return await this.post();
      }
      if (error instanceof LineError && error.next !== 'retry') {
        // The line's refusal ends the run on its own words; the report it refused is not kept to send again.
        if (failure && this.failure === failure) this.failure = null;
        this.lineRefused = true;
        const reason = error.next === 'update_kit' || error.next === 'change_request' ? error.next : 'stop';
        this.onStop(lineWords(error), reason, error.code, error.next === 'sign_in' ? 'sign_in' : undefined);
        return;
      }
      this.log.write('warn', 'progress could not be sent', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      link.done();
      if (this.current === own) this.current = null;
    }
  }
}

/** True when `work` settles before `until` (a Date.now() time). */
async function settlesBy(work: Promise<unknown>, until: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(until - Date.now(), 0));
  });
  try {
    return await Promise.race([work.then(() => true as const), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** A 400 that names the `failure` field: an unknown field, or a shape the line doesn't take. */
function namesFailure(error: LineError): boolean {
  if (error.status !== 400) return false;
  const fields = Array.isArray(error.details?.fields) ? (error.details.fields as unknown[]) : [];
  if (fields.some((f) => typeof f === 'string' && (f === 'failure' || f.startsWith('failure.')))) return true;
  return /\bfailure\b/.test(`${error.fix} ${error.message}`);
}
