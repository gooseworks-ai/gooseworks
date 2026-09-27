/** One server-vetted local operation. This module never invokes a media provider. */
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'fs/promises';
import * as path from 'path';

const SHA256 = /^[a-f0-9]{64}$/i;
const ID = /^[a-zA-Z0-9_-]{1,160}$/;
export const MAX_CAPTION_SOURCE_BYTES = 150 * 1024 * 1024;

export interface CaptionsPackage {
  version: 1;
  operation: 'captions';
  source_video_url: string;
  source_video_sha256: string;
  ass_text: string;
  edl: { width: number; height: number; segments: Array<{ dur_s: number }> };
  [key: string]: unknown;
}

export interface CaptionClaim {
  claim_id: string;
  lease_token: string;
  lease_expires_at: string;
  package_digest: string;
  package: CaptionsPackage;
}

export interface CaptionTransport {
  next(projectId: string, workerId: string): Promise<CaptionClaim | null>;
  status(claimId: string, leaseToken: string): Promise<CaptionClaimStatus>;
  heartbeat(claimId: string, leaseToken: string): Promise<void>;
  complete(claimId: string, leaseToken: string, outputPath: string, sha256: string): Promise<void>;
}

export type CaptionClaimStatus =
  | { status: 'claimed'; package_digest: string; package: CaptionsPackage; lease_expires_at: string }
  | { status: 'completed'; output_sha256: string; output_url: string }
  | { status: 'offered' | 'fallback' };

export interface MediaProbe { width: number; height: number; duration_s: number }
export interface CaptionRuntime {
  download(url: string, target: string, expectedSha256?: string): Promise<string>;
  preflight(): Promise<string>;
  render(source: string, ass: string, output: string): Promise<void>;
  probe(output: string): Promise<MediaProbe>;
}

export type CaptionPhase = 'claimed' | 'downloaded' | 'rendered' | 'completed';
export interface CaptionJournal {
  claim_id: string;
  project_id: string;
  package_digest: string;
  lease_token: string;
  lease_expires_at: string;
  ffmpeg_version: string;
  phase: CaptionPhase;
  source_sha256?: string;
  output_sha256?: string;
}

async function findPendingJournal(workRoot: string, projectId: string): Promise<{ filePath: string; journal: CaptionJournal } | null> {
  let dirs: string[];
  try { dirs = await readdir(workRoot); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const matches: Array<{ filePath: string; journal: CaptionJournal }> = [];
  const unscoped: string[] = [];
  for (const dir of dirs) {
    if (!ID.test(dir)) continue;
    const filePath = path.join(workRoot, dir, 'journal.json');
    try {
      const journal = JSON.parse(await readFile(filePath, 'utf8')) as CaptionJournal;
      if (journal.project_id === projectId && journal.phase !== 'completed') matches.push({ filePath, journal });
      else if (!journal.project_id && journal.phase !== 'completed') unscoped.push(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (matches.length > 1) throw new Error('Multiple unfinished caption claims exist; inspect the private journals before continuing');
  if (unscoped.length) throw new Error(`An older caption journal has no project binding; inspect it before requesting new work: ${unscoped[0]}`);
  return matches[0] ?? null;
}

export function validateCaptionClaim(claim: CaptionClaim): { expectedDuration: number } {
  if (!claim || !ID.test(claim.claim_id) || !claim.lease_token ||
      !SHA256.test(claim.package_digest) || !Number.isFinite(Date.parse(claim.lease_expires_at))) {
    throw new Error('Invalid local caption claim identity or lease');
  }
  const pack = claim.package;
  if (!pack || pack.version !== 1 || pack.operation !== 'captions' ||
      typeof pack.source_video_url !== 'string' || !pack.source_video_url ||
      typeof pack.ass_text !== 'string' || !pack.ass_text || pack.ass_text.length > 1024 * 1024 ||
      !pack.ass_text.includes('[Script Info]') || !pack.ass_text.includes('[Events]')) {
    throw new Error('Incomplete or unsupported local captions package');
  }
  const sourceUrl = new URL(pack.source_video_url);
  if (sourceUrl.protocol !== 'https:' && !(sourceUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname))) {
    throw new Error('Caption source must use HTTPS (or local development HTTP)');
  }
  if (!SHA256.test(pack.source_video_sha256)) {
    throw new Error('Missing or invalid source checksum');
  }
  const edl = pack.edl;
  if (!edl || !Number.isInteger(edl.width) || !Number.isInteger(edl.height) ||
      edl.width < 16 || edl.height < 16 || edl.width > 8192 || edl.height > 8192 ||
      !Array.isArray(edl.segments) || !edl.segments.length) {
    throw new Error('Invalid expected caption dimensions or timeline');
  }
  const expectedDuration = edl.segments.reduce((sum, segment) => sum + segment.dur_s, 0);
  if (!Number.isFinite(expectedDuration) || expectedDuration < 0.25 || expectedDuration > 70) {
    throw new Error('Invalid expected caption duration');
  }
  return { expectedDuration };
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function saveJournal(filePath: string, journal: CaptionJournal): Promise<void> {
  const pending = `${filePath}.pending`;
  await writeFile(pending, JSON.stringify(journal, null, 2), { mode: 0o600 });
  await rename(pending, filePath);
}

/** Recover the prior lease/output before asking for new work. Never silently rerender an
 * uncertain completion or let /next hide a still-active claim. */
export async function executeNextCaptionClaim(args: {
  projectId: string;
  workerId: string;
  workRoot: string;
  transport: CaptionTransport;
  runtime: CaptionRuntime;
  heartbeatMs?: number;
}): Promise<{ claimId: string; outputSha256: string; journalPath: string } | null> {
  if (!ID.test(args.projectId) || !ID.test(args.workerId)) throw new Error('Invalid project or worker ID');
  const pending = await findPendingJournal(args.workRoot, args.projectId);
  let claim: CaptionClaim | null;
  let resumedJournal: CaptionJournal | null = null;
  if (pending) {
    const journal = pending.journal;
    if (!ID.test(journal.claim_id) || !SHA256.test(journal.package_digest) || !journal.lease_token) {
      throw new Error('Local caption recovery journal is invalid; inspect it before requesting new work');
    }
    let status: CaptionClaimStatus;
    try {
      status = await args.transport.status(journal.claim_id, journal.lease_token);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not verify prior caption claim ${journal.claim_id} (${reason}). Do not request new work; retain the journal and rerun after server recovery: ${pending.filePath}`);
    }
    if (status.status === 'completed') {
      if (!SHA256.test(status.output_sha256) ||
          (journal.output_sha256 && journal.output_sha256 !== status.output_sha256)) {
        throw new Error('Completed caption receipt does not match the recovery journal');
      }
      journal.output_sha256 = status.output_sha256;
      journal.phase = 'completed';
      await saveJournal(pending.filePath, journal);
      return { claimId: journal.claim_id, outputSha256: status.output_sha256, journalPath: pending.filePath };
    }
    if (status.status === 'offered') {
      const renewed = await args.transport.next(args.projectId, args.workerId);
      if (!renewed) throw new Error(`Caption claim ${journal.claim_id} is not reclaimable yet. Rerun after the server offers it. Recovery journal: ${pending.filePath}`);
      if (renewed.claim_id !== journal.claim_id || renewed.package_digest !== journal.package_digest) {
        throw new Error(`Server offered a different caption claim; inspect the old recovery journal: ${pending.filePath}`);
      }
      claim = renewed;
      journal.lease_token = renewed.lease_token;
      resumedJournal = journal;
    } else if (status.status === 'claimed') {
      if (status.package_digest !== journal.package_digest ||
          !Number.isFinite(Date.parse(status.lease_expires_at)) || Date.parse(status.lease_expires_at) <= Date.now()) {
        throw new Error(`Caption claim ${journal.claim_id} changed or its lease expired; stop and inspect the recovery journal: ${pending.filePath}`);
      }
      await args.transport.heartbeat(journal.claim_id, journal.lease_token);
      claim = { claim_id: journal.claim_id, lease_token: journal.lease_token,
        lease_expires_at: status.lease_expires_at, package_digest: status.package_digest, package: status.package };
      resumedJournal = journal;
    } else {
      throw new Error(`Caption claim ${journal.claim_id} is in server fallback; no local upload is allowed. Recovery journal: ${pending.filePath}`);
    }
  } else {
    claim = await args.transport.next(args.projectId, args.workerId);
  }
  if (!claim) return null;
  const { expectedDuration } = validateCaptionClaim(claim);
  const claimDir = path.join(args.workRoot, claim.claim_id);
  await mkdir(claimDir, { recursive: true, mode: 0o700 });
  const journalPath = path.join(claimDir, 'journal.json');
  try {
    const existing = JSON.parse(await readFile(journalPath, 'utf8')) as CaptionJournal;
    if (existing.package_digest !== claim.package_digest) throw new Error('Claim package changed; refusing old local state');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const journal: CaptionJournal = resumedJournal ?? {
    claim_id: claim.claim_id, project_id: args.projectId, package_digest: claim.package_digest,
    lease_token: claim.lease_token, lease_expires_at: claim.lease_expires_at,
    ffmpeg_version: 'pending preflight', phase: 'claimed',
  };
  journal.lease_expires_at = claim.lease_expires_at;
  await saveJournal(journalPath, journal);
  if (journal.phase !== 'rendered') {
    journal.ffmpeg_version = await args.runtime.preflight();
    await saveJournal(journalPath, journal);
  }
  let heartbeatError: Error | null = null;
  let heartbeatBusy = false;
  const timer = setInterval(() => {
    if (heartbeatBusy || heartbeatError) return;
    heartbeatBusy = true;
    void args.transport.heartbeat(claim.claim_id, claim.lease_token)
      .catch((error: unknown) => { heartbeatError = error instanceof Error ? error : new Error(String(error)); })
      .finally(() => { heartbeatBusy = false; });
  }, args.heartbeatMs ?? 60_000);
  try {
    const sourcePath = path.join(claimDir, 'source.mp4');
    const assPath = path.join(claimDir, 'captions.ass');
    const outputPath = path.join(claimDir, 'captioned.mp4');
    if (journal.phase !== 'rendered') {
      journal.source_sha256 = await args.runtime.download(
        claim.package.source_video_url, sourcePath, claim.package.source_video_sha256,
      );
      journal.phase = 'downloaded';
      await saveJournal(journalPath, journal);
      await writeFile(assPath, claim.package.ass_text, { mode: 0o600 });
      await args.runtime.render(sourcePath, assPath, outputPath);
    } else {
      const info = await stat(outputPath).catch(() => null);
      if (!info?.isFile() || !journal.output_sha256 ||
          await sha256File(outputPath) !== journal.output_sha256) {
        throw new Error('Rendered caption output is missing or differs from its journal; refusing upload');
      }
    }
    if (heartbeatError) throw heartbeatError;
    const probe = await args.runtime.probe(outputPath);
    if (probe.width !== claim.package.edl.width || probe.height !== claim.package.edl.height ||
        probe.duration_s < Math.max(0.25, expectedDuration - 1) ||
        probe.duration_s > Math.min(70, expectedDuration + 2)) {
      throw new Error('Caption output dimensions or duration do not match the server package');
    }
    journal.output_sha256 = await sha256File(outputPath);
    journal.phase = 'rendered';
    await saveJournal(journalPath, journal);
    await args.transport.heartbeat(claim.claim_id, claim.lease_token);
    if (heartbeatError) throw heartbeatError;
    await args.transport.complete(claim.claim_id, claim.lease_token, outputPath, journal.output_sha256);
    journal.phase = 'completed';
    await saveJournal(journalPath, journal);
    return { claimId: claim.claim_id, outputSha256: journal.output_sha256, journalPath };
  } finally {
    clearInterval(timer);
  }
}
