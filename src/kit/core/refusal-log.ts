// One line in the video's log for a refusal that comes before the run has its own log.
import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { runLayout } from './paths';
import { redact } from './secrets';

/** Written straight to the video's log file, so it needs no run lock and no attached KitLog. */
export function recordRefusal(home: string, videoId: string, what: string, error: { code: string; status: number; next: string }): void {
  try {
    const file = runLayout(home, videoId).log;
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const entry = { at: new Date().toISOString(), level: 'warn', message: what, fields: { code: error.code, status: error.status, next: error.next } };
    appendFileSync(file, redact(JSON.stringify(entry)) + '\n', { mode: 0o600 });
  } catch {
    // An invalid id has no video folder; the refusal is still printed.
  }
}
