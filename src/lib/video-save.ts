/** Finished-video recovery. No render-open, provider, or authentication operations. */
import { createHash, randomUUID } from 'crypto';
import { open, readFile, rename, unlink, mkdir, stat } from 'fs/promises';
import * as path from 'path';
import { SaveToolError } from './video-save-mcp';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,160}$/;
const MAX_BYTES = 200 * 1024 * 1024;
const CHECKS = ['source', 'brand', 'product', 'hook_and_scene_order', 'voice_and_script',
  'captions', 'endcard_and_cta', 'duration_and_ratio', 'visual_artifacts'];
type Obj = Record<string, any>;
export interface SaveTransport {
  call(name: 'account_whoami' | 'video_project_read' | 'media_list' | 'media_upload' |
    'media_confirm' | 'video_render_run' | 'video_project_upsert', args: Obj): Promise<Obj>;
  put(url: string, headers: Record<string, string>, bytes: Buffer): Promise<void>;
  download(url: string, maxBytes: number): Promise<Buffer>;
}
export interface SaveManifest {
  brand_id: string; project_id: string; render_id: string; input_digest: string;
  final_path: string; poster_path: string;
  qc: { final_sha256: string; poster_sha256: string; report_path: string; evidence_paths: string[] };
}
interface Fingerprint { path: string; sha256: string; bytes: number }
interface Identity { environment: { name: string; api_origin: string }; user_id: string; organization_id: string }
interface SavedFile extends Fingerprint { upload_path: string; ingredient_key: string; kind: string; mime: string }
export interface SaveCheckpoint {
  version: 1;
  binding: Identity & {
    brand_id: string; project_id: string; project_organization_id: string; render_id: string; input_digest: string;
    final: SavedFile; poster: SavedFile; report: Fingerprint; evidence: Fingerprint[];
    quality_report: Obj; review_digest: string; initial_final_render_id: string | null;
  };
  binding_sha256: string;
  progress: {
    final?: { media_id: string; stage: 'requested' | 'put' | 'confirmed' };
    poster?: { media_id: string; stage: 'requested' | 'put' | 'confirmed' };
    completion: 'pending' | 'unknown' | 'complete'; selection: 'pending' | 'unknown' | 'selected';
  };
}

function fail(message: string): never { throw new Error(message); }
function object(value: unknown): value is Obj { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Obj, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Unexpected checkpoint or quality field');
}
function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function digest(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function sha(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function origin(value: unknown): string {
  if (typeof value !== 'string') fail('Missing environment origin');
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !['https:', 'http:'].includes(url.protocol)) fail('Invalid public environment origin');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) fail('Environment requires HTTPS');
  return url.origin;
}
function identity(account: Obj): Identity {
  if (!object(account.environment) || !['production', 'staging', 'local'].includes(account.environment.name) ||
      typeof account.user?.id !== 'string' || typeof account.organization?.id !== 'string' ||
      !ID.test(account.user.id) || !ID.test(account.organization.id)) fail('Unknown account/environment; reconnect on the original connection');
  return { environment: { name: account.environment.name, api_origin: origin(account.environment.api_origin) },
    user_id: account.user.id, organization_id: account.organization.id };
}
function quality(report: unknown): Obj {
  if (!object(report)) fail('Missing quality report');
  keys(report, ['version', 'summary', 'checks', 'detected_issues', 'repair_actions', 'checked_at']);
  if (report.version !== 1 || typeof report.summary !== 'string' || !report.summary.trim() || report.summary.length > 2000 ||
      !object(report.checks) || Object.keys(report.checks).length !== CHECKS.length) fail('Invalid structured quality report');
  for (const name of CHECKS) {
    const check = report.checks[name];
    if (!object(check)) fail(`Missing quality check: ${name}`);
    keys(check, ['status', 'note']);
    if (!['pass', 'not_applicable'].includes(check.status) ||
        (check.note !== undefined && (typeof check.note !== 'string' || check.note.length > 1000)) ||
        (check.status === 'not_applicable' && !check.note?.trim())) fail(`Quality check has not passed: ${name}`);
  }
  for (const name of ['source', 'brand', 'hook_and_scene_order', 'endcard_and_cta', 'duration_and_ratio', 'visual_artifacts']) {
    if (report.checks[name].status !== 'pass') fail(`Always-required quality check has not passed: ${name}`);
  }
  for (const [key, limit] of [['detected_issues', 25], ['repair_actions', 10]] as const) {
    if (report[key] !== undefined && (!Array.isArray(report[key]) || report[key].length > limit ||
        report[key].some((v: unknown) => typeof v !== 'string' || v.length > 1000))) fail('Invalid quality issue/action list');
  }
  if (report.checked_at !== undefined && (typeof report.checked_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(report.checked_at) ||
      !Number.isFinite(Date.parse(report.checked_at)))) fail('Invalid quality timestamp');
  if (JSON.stringify(report).length > 32 * 1024) fail('Quality report is too large');
  return { ...report, detected_issues: report.detected_issues ?? [], repair_actions: report.repair_actions ?? [] };
}
async function file(filePath: string): Promise<Fingerprint> {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) fail('Use absolute local file paths');
  const info = await stat(filePath);
  if (!info.isFile() || info.size < 1 || info.size > MAX_BYTES) fail('Missing/empty/oversized finished file or quality evidence');
  const bytes = await readFile(filePath);
  return { path: filePath, sha256: sha(bytes), bytes: bytes.length };
}
function validFile(value: any, saved = false): void {
  if (!object(value)) fail('Invalid file binding');
  keys(value, ['path', 'sha256', 'bytes', ...(saved ? ['upload_path', 'ingredient_key', 'kind', 'mime'] : [])]);
  if (typeof value.path !== 'string' || !path.isAbsolute(value.path) || !HASH.test(value.sha256) ||
      !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_BYTES) fail('Invalid file fingerprint');
}
function validate(checkpoint: unknown): asserts checkpoint is SaveCheckpoint {
  if (!object(checkpoint)) fail('Malformed save checkpoint');
  keys(checkpoint, ['version', 'binding', 'binding_sha256', 'progress']);
  const b = checkpoint.binding;
  if (checkpoint.version !== 1 || !object(b) || !object(checkpoint.progress) || digest(b) !== checkpoint.binding_sha256) fail('Malformed or changed save checkpoint');
  keys(b, ['environment', 'user_id', 'organization_id', 'brand_id', 'project_id', 'project_organization_id', 'render_id', 'input_digest',
    'final', 'poster', 'report', 'evidence', 'quality_report', 'review_digest', 'initial_final_render_id']);
  identity({ environment: b.environment, user: { id: b.user_id }, organization: { id: b.organization_id } });
  keys(b.environment, ['name', 'api_origin']);
  if (![b.brand_id, b.project_id, b.project_organization_id, b.render_id].every(id => typeof id === 'string' && ID.test(id)) ||
      !/^[a-f0-9]{8,128}$/.test(b.input_digest) || !HASH.test(b.review_digest) ||
      !(b.initial_final_render_id === null || (typeof b.initial_final_render_id === 'string' && ID.test(b.initial_final_render_id)))) fail('Invalid render binding');
  validFile(b.final, true); validFile(b.poster, true); validFile(b.report);
  if (!Array.isArray(b.evidence) || b.evidence.length < 1 || b.evidence.length > 25) fail('Missing quality evidence');
  b.evidence.forEach((v: unknown) => validFile(v));
  quality(b.quality_report);
  for (const role of ['final', 'poster'] as const) {
    const f = b[role];
    if (f.upload_path !== `working/final-${b.render_id}${role === 'final' ? '.mp4' : '-thumb.jpg'}` ||
        f.ingredient_key !== (role === 'final' ? 'final' : 'final-thumb') ||
        f.kind !== (role === 'final' ? 'render' : 'thumbnail') || f.mime !== (role === 'final' ? 'video/mp4' : 'image/jpeg')) fail('Changed upload destination');
    const receipt = checkpoint.progress[role];
    if (receipt !== undefined) {
      if (!object(receipt)) fail('Invalid stage receipt');
      keys(receipt, ['media_id', 'stage']);
      if (typeof receipt.media_id !== 'string' || !ID.test(receipt.media_id) || !['requested', 'put', 'confirmed'].includes(receipt.stage)) fail('Invalid stage receipt');
    }
  }
  keys(checkpoint.progress, ['final', 'poster', 'completion', 'selection']);
  if (!['pending', 'unknown', 'complete'].includes(checkpoint.progress.completion) ||
      !['pending', 'unknown', 'selected'].includes(checkpoint.progress.selection)) fail('Invalid saving stage');
}

/** Same-directory rename + fsync: a process interruption leaves either full old or full new JSON. */
export async function writeCheckpoint(target: string, checkpoint: SaveCheckpoint): Promise<void> {
  validate(checkpoint);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomUUID()}.pending`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(checkpoint, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  try {
    await rename(temp, target);
    const directory = await open(path.dirname(target), 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await unlink(temp).catch(() => undefined); }
}
export async function loadCheckpoint(target: string): Promise<SaveCheckpoint> {
  const info = await stat(target);
  if (!info.isFile() || info.size > 1024 * 1024) fail('Malformed save checkpoint');
  const checkpoint: unknown = JSON.parse(await readFile(target, 'utf8'));
  validate(checkpoint);
  return checkpoint;
}
function reviewDigest(p: Obj): string { return digest({ script: p.script ?? null, script_drafts: p.script_drafts ?? null }); }
function inspectProject(state: Obj, ids: Pick<SaveManifest, 'brand_id' | 'project_id' | 'render_id'>): { project: Obj; render: Obj } {
  const project = state.project;
  const render = Array.isArray(state.renders) && state.renders.find((r: Obj) => r.id === ids.render_id);
  if (!object(project) || project.id !== ids.project_id || project.brand_id !== ids.brand_id ||
      !object(render) || render.project_id !== ids.project_id) fail('Project/render identity mismatch or missing render; no new render was opened');
  if (state.order || state.creative_plan || project.custom_video_state?.mode === 'generate') fail('This is not a client-side recipe render; use its existing order workflow');
  if (!['queued', 'running', 'complete'].includes(render.status) || render.stop_requested_at ||
      project.stop_requested_at || ['stopped', 'capped'].includes(project.status) ||
      render.workflow_stage === 'blocked' || render.quality_status === 'blocked') fail('Render is stopped, capped, failed or blocked; save-only recovery cannot reopen it');
  return { project, render };
}
async function projectRead(transport: SaveTransport, ids: Pick<SaveManifest, 'brand_id' | 'project_id' | 'render_id'>) {
  return inspectProject(await transport.call('video_project_read', {
    brand_id: ids.brand_id, project_id: ids.project_id, include: ['renders'],
  }), ids);
}
export async function prepareSave(target: string, manifest: SaveManifest, transport: SaveTransport): Promise<SaveCheckpoint> {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const lock = await open(`${target}.lock`, 'wx', 0o600).catch(() => fail('Save checkpoint is locked by another process'));
  try {
    if (await stat(target).catch(() => null)) fail('Checkpoint already exists; resume it instead of replacing finished-video evidence');
    if (!manifest || ![manifest.brand_id, manifest.project_id, manifest.render_id].every(v => typeof v === 'string' && ID.test(v)) ||
        !/^[a-f0-9]{8,128}$/.test(manifest.input_digest) || !object(manifest.qc) ||
        !Array.isArray(manifest.qc.evidence_paths) || manifest.qc.evidence_paths.length < 1 || manifest.qc.evidence_paths.length > 25) fail('Invalid finished-video manifest');
    const owner = identity(await transport.call('account_whoami', {}));
    const { project } = await projectRead(transport, manifest);
    if (typeof project.organization_id !== 'string' || !ID.test(project.organization_id)) fail('Unknown project ownership');
    const final = await file(manifest.final_path); const poster = await file(manifest.poster_path);
    if (final.sha256 !== manifest.qc.final_sha256 || poster.sha256 !== manifest.qc.poster_sha256) fail('Finished bytes differ from the quality check; review these exact files first');
    const report = await file(manifest.qc.report_path);
    const qualityReport = quality(JSON.parse(await readFile(report.path, 'utf8')));
    const checkpoint: SaveCheckpoint = {
      version: 1, binding: { ...owner, brand_id: manifest.brand_id, project_id: manifest.project_id, project_organization_id: project.organization_id,
        render_id: manifest.render_id, input_digest: manifest.input_digest,
        final: { ...final, upload_path: `working/final-${manifest.render_id}.mp4`, ingredient_key: 'final', kind: 'render', mime: 'video/mp4' },
        poster: { ...poster, upload_path: `working/final-${manifest.render_id}-thumb.jpg`, ingredient_key: 'final-thumb', kind: 'thumbnail', mime: 'image/jpeg' },
        report, evidence: await Promise.all(manifest.qc.evidence_paths.map(file)), quality_report: qualityReport,
        review_digest: reviewDigest(project), initial_final_render_id: project.final_render_id ?? null,
      }, binding_sha256: '', progress: { completion: 'pending', selection: 'pending' },
    };
    checkpoint.binding_sha256 = digest(checkpoint.binding);
    await writeCheckpoint(target, checkpoint);
    return checkpoint;
  } finally { await lock.close(); await unlink(`${target}.lock`); }
}
function durableUrl(b: SaveCheckpoint['binding'], f: SavedFile): string {
  return `/api/ads/projects/${b.project_id}/render-file?path=${encodeURIComponent(f.upload_path)}`;
}
function sameUrl(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string' || !actual.startsWith('/')) return false;
  const a = new URL(actual, 'https://local.invalid'); const e = new URL(expected, 'https://local.invalid');
  return a.origin === e.origin && !a.hash && a.pathname === e.pathname && a.searchParams.getAll('path').length === 1 && a.searchParams.get('path') === e.searchParams.get('path') &&
    [...a.searchParams.keys()].every(k => k === 'path');
}

export async function resumeSave(target: string, transport: SaveTransport): Promise<SaveCheckpoint> {
  // Exclusive local writer. A stale lock is reported, never silently stolen.
  const lock = await open(`${target}.lock`, 'wx', 0o600).catch(() => fail('Save checkpoint is locked; verify the prior process exited before removing its .lock file'));
  try {
    const checkpoint = await loadCheckpoint(target); const b = checkpoint.binding;
    const owner = identity(await transport.call('account_whoami', {}));
    if (stable(owner) !== stable({ environment: b.environment, user_id: b.user_id, organization_id: b.organization_id })) fail('Account/environment mismatch; reconnect to the original connection');
    for (const expected of [b.final, b.poster, b.report, ...b.evidence]) {
      const actual = await file(expected.path);
      if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) fail('Finished file or quality evidence changed; saving stopped without generation');
    }
    if (digest(quality(JSON.parse(await readFile(b.report.path, 'utf8')))) !== digest(b.quality_report)) fail('Quality report mismatch');
    const read = async () => {
      const state = await projectRead(transport, b);
      if (state.project.organization_id !== b.project_organization_id) fail('Project ownership changed');
      if (reviewDigest(state.project) !== b.review_digest) fail('The saved review set changed; diagnose before selecting this video');
      const pin = state.project.final_render_id ?? null;
      if (pin !== b.initial_final_render_id && pin !== b.render_id) fail('Another version was selected; recovery will not overwrite that choice');
      return state;
    };
    await read();
    for (const role of ['final', 'poster'] as const) {
      const f = b[role];
      const listed = await transport.call('media_list', { brand_id: b.brand_id, scope: 'video_project', scope_id: b.project_id,
        ingredient_key: f.ingredient_key, input_digest: b.input_digest, limit: 100 });
      if (!Array.isArray(listed.items) || listed.next_cursor) fail('Uncertain media lookup; no upload was attempted');
      let media = listed.items.find((m: Obj) => m.path === f.upload_path && m.input_digest === b.input_digest && m.ingredient_key === f.ingredient_key);
      const receipt = checkpoint.progress[role];
      if (receipt && (!media || media.id !== receipt.media_id)) fail('Saved media identity changed or disappeared; no upload was attempted');
      if (media && (!ID.test(media.id) || !['pending', 'approved'].includes(media.status) || media.kind !== f.kind)) fail('Unexpected saved-media state');
      if (media?.status === 'pending') {
        // A PUT/confirm reply may have been lost. Inspect stored bytes first; a missing object
        // is the only reason to request a fresh PUT. Never infer success from a local receipt.
        const pendingId = media.id;
        await read();
        try {
          const result = await transport.call('media_confirm', { brand_id: b.brand_id, media_id: pendingId });
          if (result.media?.id !== pendingId || result.media?.status !== 'approved') fail('Upload confirmation is incomplete');
        } catch (error) {
          if (!(error instanceof SaveToolError) || error.code !== 'not_found') throw error;
          const again = await transport.call('media_list', { brand_id: b.brand_id, scope: 'video_project', scope_id: b.project_id,
            ingredient_key: f.ingredient_key, input_digest: b.input_digest, limit: 100 });
          if (again.next_cursor || !again.items?.some((m: Obj) => m.id === pendingId && m.path === f.upload_path && m.status === 'pending')) fail('Pending media disappeared; diagnose before refreshing its upload');
          // The scoped pending row still exists and storage has no object. A fresh URL/row
          // at the identical render path is safe; this does not generate a replacement.
          media = undefined;
          delete checkpoint.progress[role];
          await writeCheckpoint(target, checkpoint);
        }
        if (media) {
          const refreshed = await transport.call('media_list', { brand_id: b.brand_id, scope: 'video_project', scope_id: b.project_id,
            ingredient_key: f.ingredient_key, input_digest: b.input_digest, limit: 100 });
          if (refreshed.next_cursor) fail('Uncertain confirmed-media lookup');
          media = refreshed.items?.find((m: Obj) => m.id === pendingId);
          if (!media) fail('Confirmed media disappeared');
        }
      }
      if (!media) {
        const state = await read();
        if (state.render.status === 'complete') fail('Completed render has missing media; diagnose without replacing its files');
        const result = await transport.call('media_upload', { brand_id: b.brand_id, scope: 'video_project', scope_id: b.project_id,
          kind: f.kind, path: f.upload_path, ingredient_key: f.ingredient_key, input_digest: b.input_digest,
          source: { type: 'file', filename: path.basename(f.upload_path), content_type: f.mime } });
        if (typeof result.media?.id !== 'string' || !ID.test(result.media.id) || result.upload?.method !== 'PUT' ||
            !sameUrl(result.upload.render_file_url, durableUrl(b, f)) || !object(result.upload.required_headers)) fail('Invalid upload receipt');
        checkpoint.progress[role] = { media_id: result.media.id, stage: 'requested' };
        await writeCheckpoint(target, checkpoint);
        const bytes = await readFile(f.path);
        if (bytes.length !== f.bytes || sha(bytes) !== f.sha256) fail('Finished file changed before upload');
        await read();
        await transport.put(result.upload.url, result.upload.required_headers, bytes);
        checkpoint.progress[role]!.stage = 'put'; await writeCheckpoint(target, checkpoint);
        await read();
        const confirmed = await transport.call('media_confirm', { brand_id: b.brand_id, media_id: result.media.id });
        if (confirmed.media?.id !== result.media.id || confirmed.media?.status !== 'approved') fail('Upload confirmation is incomplete');
        const refreshed = await transport.call('media_list', { brand_id: b.brand_id, scope: 'video_project', scope_id: b.project_id,
          ingredient_key: f.ingredient_key, input_digest: b.input_digest, limit: 100 });
        if (refreshed.next_cursor) fail('Uncertain confirmed-media lookup');
        media = refreshed.items?.find((m: Obj) => m.id === result.media.id);
      }
      if (!media || media.status !== 'approved' || media.path !== f.upload_path || media.kind !== f.kind ||
          media.input_digest !== b.input_digest || media.ingredient_key !== f.ingredient_key ||
          media.bytes !== f.bytes || sha(await transport.download(media.url, MAX_BYTES)) !== f.sha256) fail('Stored bytes do not match the quality-checked final/poster');
      checkpoint.progress[role] = { media_id: media.id, stage: 'confirmed' }; await writeCheckpoint(target, checkpoint);
    }
    let state = await read();
    if (state.render.status !== 'complete') {
      checkpoint.progress.completion = 'unknown'; await writeCheckpoint(target, checkpoint);
      await transport.call('video_render_run', { brand_id: b.brand_id, project_id: b.project_id,
        render: { render_id: b.render_id, status: 'complete', workflow_stage: 'ready', quality_status: 'passed',
          quality_report: b.quality_report, output_url: durableUrl(b, b.final), thumbnail_url: durableUrl(b, b.poster) } });
      state = await read();
    }
    if (state.render.status !== 'complete' || state.render.quality_status !== 'passed' ||
        digest(quality(state.render.quality_report)) !== digest(b.quality_report) ||
        !sameUrl(state.render.render_file_path ?? state.render.output_url, durableUrl(b, b.final)) ||
        !sameUrl(state.render.thumbnail_file_path ?? state.render.thumbnail_url, durableUrl(b, b.poster))) fail('Completed render does not match this checkpoint');
    checkpoint.progress.completion = 'complete'; await writeCheckpoint(target, checkpoint);
    if (state.project.final_render_id !== b.render_id) {
      checkpoint.progress.selection = 'unknown'; await writeCheckpoint(target, checkpoint);
      await transport.call('video_project_upsert', { brand_id: b.brand_id, project_id: b.project_id, patch: { final_render_id: b.render_id } });
      state = await read();
    }
    if (state.project.final_render_id !== b.render_id) fail('Final selection was not saved; reconnect and resume the same checkpoint');
    checkpoint.progress.selection = 'selected'; await writeCheckpoint(target, checkpoint);
    return checkpoint;
  } finally { await lock.close(); await unlink(`${target}.lock`); }
}
