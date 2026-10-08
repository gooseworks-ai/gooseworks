// Sends progress to the line after every piece and step, and at least once a
// minute while anything runs (a slow piece must never look quiet). A progress
// answer that says the video stopped stops the run.
import { LineError, type VideoLine } from '../line/client';
import type { KitLog } from './log';
import type { ProgressBook } from './progress';

export class ProgressReporter {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  private last = 0;
  private soon: NodeJS.Timeout | null = null;
  private paused = false;

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
    try {
      const answer = await this.line.progress(this.videoId, this.book.request(), this.signal);
      if (answer.stop === true || answer.stage === 'stopped') this.onStop('This video was stopped.', 'stop');
    } catch (error) {
      if (error instanceof LineError && error.next !== 'retry') {
        this.onStop([error.message, error.fix].filter(Boolean).join(' '), error.next, error.code);
        return;
      }
      this.log.write('warn', 'progress could not be sent', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
