/**
 * Shared helpers for the styles/formats command families.
 *
 * Exit codes follow the spec:
 *   0 = success
 *   1 = transient or auth error (network, 401, 5xx)
 *   2 = user error (bad input, 400, 403, 404, declined 409)
 */

import * as readline from 'readline';
import { getCredentials, type Credentials } from '../../auth/credentials';
import { API_BASE } from '../../config';
import { ApiError, NetworkError } from '../../lib/graphics-api';
import * as logger from '../../utils/logger';

export const EXIT_OK = 0;
export const EXIT_TRANSIENT = 1;
export const EXIT_USER_ERROR = 2;

export function requireCredentials(): Credentials {
  const creds = getCredentials();
  if (!creds) {
    process.stderr.write('Not authenticated. Run `gooseworks login` first.\n');
    process.exit(EXIT_TRANSIENT);
  }
  return creds;
}

export function getOptionalCredentials(): Credentials | null {
  return getCredentials();
}

/**
 * Build the api-client options for read-only commands. Falls back to the
 * compiled-in API_BASE when the user is not logged in, so anonymous reads
 * still work.
 */
export function clientOpts(): { apiBase: string; apiKey: string | null } {
  const creds = getOptionalCredentials();
  return {
    apiBase: creds?.api_base ?? API_BASE,
    apiKey: creds?.api_key ?? null,
  };
}

/** Build api-client options for commands that require auth (publish/update/delete). */
export function authedClientOpts(): { apiBase: string; apiKey: string } {
  const creds = requireCredentials();
  return { apiBase: creds.api_base, apiKey: creds.api_key };
}

/**
 * Parse a non-negative integer command-line option. Exits with the user-error
 * code if the value is malformed.
 */
export function parseIntOpt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0) {
    process.stderr.write(`--${name} must be a non-negative integer\n`);
    process.exit(EXIT_USER_ERROR);
  }
  return n;
}

/**
 * Translate a thrown error from the API client into a stderr message + exit
 * code. Never re-throws.
 */
export function reportApiErrorAndExit(err: unknown): never {
  if (err instanceof NetworkError) {
    process.stderr.write(`Network error: ${err.message}\n`);
    process.exit(EXIT_TRANSIENT);
  }
  if (err instanceof ApiError) {
    if (err.status === 401) {
      process.stderr.write(
        'Not authenticated. Run `gooseworks login` first.\n'
      );
      process.exit(EXIT_TRANSIENT);
    }
    if (err.status >= 500) {
      process.stderr.write(`Server error (${err.status}). Please try again later.\n`);
      process.exit(EXIT_TRANSIENT);
    }
    if (err.status === 403) {
      process.stderr.write(`${err.message || 'Forbidden'}\n`);
      process.exit(EXIT_USER_ERROR);
    }
    if (err.status === 404) {
      process.stderr.write(`Not found: ${err.message}\n`);
      process.exit(EXIT_USER_ERROR);
    }
    process.stderr.write(`Error (${err.status}): ${err.message}\n`);
    process.exit(EXIT_USER_ERROR);
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(EXIT_TRANSIENT);
}

export function promptYesNo(question: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // Non-interactive context with no --yes — refuse rather than hang.
    return Promise.resolve(false);
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  return new Promise<boolean>((resolve) => {
    rl.question(`${question} ${suffix} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '') resolve(defaultYes);
      else resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

interface ColumnDef<T> {
  header: string;
  get: (row: T) => string;
  pad?: 'left' | 'right';
}

export function renderTable<T>(rows: T[], columns: ColumnDef<T>[]): string {
  if (rows.length === 0) return '';
  const widths = columns.map((c) =>
    Math.max(c.header.length, ...rows.map((r) => c.get(r).length))
  );
  const renderRow = (cells: string[]) =>
    cells
      .map((cell, i) => {
        const pad = columns[i].pad ?? 'right';
        return pad === 'left'
          ? cell.padStart(widths[i])
          : cell.padEnd(widths[i]);
      })
      .join('  ');
  const headerLine = renderRow(columns.map((c) => c.header));
  const separatorLine = widths.map((w) => '─'.repeat(w)).join('  ');
  const bodyLines = rows.map((r) => renderRow(columns.map((c) => c.get(r))));
  return [headerLine, separatorLine, ...bodyLines].join('\n');
}

export function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
