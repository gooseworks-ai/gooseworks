// What real mode checks before it sends anything (MASTER-PLAN §0.4, §4.11):
// a passing stand-in run of the same style file next to this run, a run cap no
// higher than the style's own cost ceiling (and never above $40), one real run
// per style unless a reason is given, and keys read only from the env file.
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import * as path from 'path';
import type { SpendLedger } from './providers';

/** The most any one real run may spend, whatever the style says. */
export const MAX_RUN_CAP_USD = 40;
/** The most the whole night's ledger may reach (operator decision a). */
export const MAX_NIGHT_CAP_USD = 200;

/** sha256 (hex) of the style file's bytes. */
export function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * The two provider keys from a dotenv file: FAL_KEY (or FAL_API_KEY, used as
 * FAL_KEY) and ELEVENLABS_API_KEY. Nothing else is read, and nothing is put in
 * process.env.
 */
export function readEnvKeys(file: string): { fal?: string; elevenlabs?: string } {
  const found: Record<string, string> = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m || !['FAL_KEY', 'FAL_API_KEY', 'ELEVENLABS_API_KEY'].includes(m[1])) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (v) found[m[1]] = v;
  }
  return { fal: found.FAL_KEY ?? found.FAL_API_KEY, elevenlabs: found.ELEVENLABS_API_KEY };
}

export interface RunRecord {
  providers: 'fake' | 'real';
  style_id: string;
  style_sha: string;
  status: string;
}

/** Folders next to `out` that hold a finished stand-in run of this exact style file with no failed check. */
export function passingFakeRuns(out: string, styleId: string, styleSha: string): string[] {
  const parent = path.dirname(path.resolve(out));
  if (!existsSync(parent)) return [];
  const found: string[] = [];
  for (const name of readdirSync(parent)) {
    const dir = path.join(parent, name);
    if (dir === path.resolve(out)) continue;
    try {
      if (!statSync(dir).isDirectory()) continue;
      const run = JSON.parse(readFileSync(path.join(dir, 'run.json'), 'utf8')) as Partial<RunRecord>;
      const verdict = JSON.parse(readFileSync(path.join(dir, 'verdict.json'), 'utf8')) as { checks?: Array<{ status?: string }> };
      if (run.providers !== 'fake' || run.style_id !== styleId || run.style_sha !== styleSha || run.status !== 'done') continue;
      if (!Array.isArray(verdict.checks) || verdict.checks.some((c) => c?.status === 'fail')) continue;
      if (!existsSync(path.join(dir, 'final', 'final.mp4'))) continue;
      found.push(dir);
    } catch {
      // not a run folder
    }
  }
  return found;
}

export interface RealGateInput {
  style: Record<string, unknown>;
  styleId: string;
  styleSha: string;
  out: string;
  capUsd: number | null;
  nightCapUsd: number;
  reason: string | null;
  ledger: SpendLedger;
}

/** Every reason real mode must not start, in plain words; empty when it may. */
export function realGateProblems(g: RealGateInput): string[] {
  const problems: string[] = [];
  const high = (g.style.cost as { high_usd?: unknown } | undefined)?.high_usd;
  if (g.capUsd == null || !Number.isFinite(g.capUsd) || g.capUsd <= 0) problems.push('--providers real needs --cap-usd <dollars>.');
  else {
    if (g.capUsd > MAX_RUN_CAP_USD) problems.push(`--cap-usd ${g.capUsd} is above the $${MAX_RUN_CAP_USD} limit for one run.`);
    if (typeof high !== 'number' || !Number.isFinite(high) || high <= 0) problems.push(`The style has no cost.high_usd, so no cap can be checked against it.`);
    else if (g.capUsd > high) problems.push(`--cap-usd ${g.capUsd} is above the style's cost.high_usd (${high}).`);
  }
  if (!Number.isFinite(g.nightCapUsd) || g.nightCapUsd <= 0 || g.nightCapUsd > MAX_NIGHT_CAP_USD) problems.push(`--night-cap-usd must be a positive number no higher than ${MAX_NIGHT_CAP_USD}.`);
  if (!passingFakeRuns(g.out, g.styleId, g.styleSha).length) {
    problems.push(`No passing stand-in run of this exact style file sits next to ${g.out} (a sibling folder with run.json providers "fake", the same style_sha, status done, verdict.json with no fail). Run the stand-in first.`);
  }
  try {
    const spent = g.ledger.total();
    if (spent >= g.nightCapUsd) problems.push(`The spend ledger already holds $${spent.toFixed(2)}, at or past the night cap of $${g.nightCapUsd}.`);
    if (!g.reason && g.ledger.hasRealRun(g.styleId)) problems.push(`The ledger already has a real run of ${g.styleId}. A second one needs --reason "<why>".`);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : 'The spend ledger could not be read.');
  }
  return problems;
}
