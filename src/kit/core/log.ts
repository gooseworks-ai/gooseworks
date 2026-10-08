// The kit's structured log: log.ndjson in the run folder, secrets redacted.
// Lines meant for the person go through `say`; part logs stay in the file.
import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import type { JsonObject, PartLogger } from '../part-interface';
import { redact } from './secrets';

export type Redactor = (text: string) => string;

export class KitLog {
  private file: string | null = null;

  constructor(
    private readonly print: (line: string) => void,
    private readonly redactor: Redactor = (text) => redact(text),
  ) {}

  /** Start writing log.ndjson in the run folder. */
  attach(file: string): void {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.file = file;
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
    const entry = { at: new Date().toISOString(), level, message, ...(fields ? { fields } : {}) };
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
