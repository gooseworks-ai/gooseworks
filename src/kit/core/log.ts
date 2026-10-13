// The kit's structured log, secrets redacted: one file per run of `video make`
// under the run folder's runs/, and one index line per run in log.ndjson.
// Lines meant for the person go through `say`; part logs stay in the file.
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import type { JsonObject, PartLogger } from '../part-interface';
import { redact } from './secrets';

export type Redactor = (text: string) => string;

export class KitLog {
  private file: string | null = null;
  /** On every entry: which run wrote it, and which GooseWorks package ran. */
  private tags: { run: string; package_version: string } | null = null;

  constructor(
    private readonly print: (line: string) => void,
    private readonly redactor: Redactor = (text) => redact(text),
  ) {}

  /** Writes to this file, such as the video's log.ndjson for a refusal before any run starts. */
  attach(file: string): void {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.file = file;
  }

  /**
   * Starts this run's own log, `<dir>/<name>.ndjson` (a new name if that one is taken), and
   * notes it with one line in `index`. Returns the run's name and its file.
   */
  attachRun(opts: { index: string; dir: string; name: string; packageVersion: string; fields?: Record<string, unknown> }): { run: string; file: string } {
    mkdirSync(opts.dir, { recursive: true, mode: 0o700 });
    let run = opts.name;
    for (let n = 2; existsSync(path.join(opts.dir, `${run}.ndjson`)); n++) run = `${opts.name}-${n}`;
    const file = path.join(opts.dir, `${run}.ndjson`);
    this.tags = { run, package_version: opts.packageVersion };
    this.file = opts.index;
    this.write('info', 'run started', { file: path.relative(path.dirname(opts.index), file), ...(opts.fields ?? {}) });
    this.file = file;
    return { run, file };
  }

  clean(text: string): string {
    return redact(this.redactor(text));
  }

  /** A line for the person running the kit (and the worker's output tail). */
  say(line: string): void {
    const text = this.clean(line);
    this.print(text);
    this.write('info', text);
  }

  write(level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void {
    if (!this.file) return;
    const entry = { at: new Date().toISOString(), level, ...(this.tags ?? {}), message, ...(fields ? { fields } : {}) };
    try {
      appendFileSync(this.file, this.clean(JSON.stringify(entry)) + '\n', { mode: 0o600 });
    } catch {
      // A full disk must not hide the real error.
    }
  }

  /** The logger a part gets: file only, tagged with its step. */
  forStep(step: string): PartLogger {
    const at = (level: 'debug' | 'info' | 'warn' | 'error') => (message: string, fields?: JsonObject) =>
      this.write(level, String(message).slice(0, 4000), { step, ...(fields ?? {}) });
    return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
  }
}
