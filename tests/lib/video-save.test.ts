import { mkdtemp, writeFile, readFile, rm, stat, readdir } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { digest, loadCheckpoint, prepareSave, resumeSave, writeCheckpoint, SaveManifest, SaveTransport } from '../../src/lib/video-save';
import { SaveToolError } from '../../src/lib/video-save-mcp';
import { createHash } from 'crypto';
const files = jest.requireActual<typeof import('fs/promises')>('fs/promises');

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const CHECKS = ['source', 'brand', 'product', 'hook_and_scene_order', 'voice_and_script', 'captions',
  'endcard_and_cta', 'duration_and_ratio', 'visual_artifacts'];
const report = () => ({ version: 1, summary: 'Reviewed exact final, frames and audio',
  checks: Object.fromEntries(CHECKS.map(key => [key, { status: 'pass' }])) });
class Fixture implements SaveTransport {
  calls: Array<{ name: string; args: any }> = [];
  account = { environment: { name: 'local', api_origin: 'http://127.0.0.1:6200' },
    user: { id: 'user-1' }, organization: { id: 'org-1' }, token: { prefix: 'never-store-this' } };
  project: any = { id: 'project-1', brand_id: 'brand-1', organization_id: 'org-1', final_render_id: null,
    script: 'approved words', script_drafts: { ingredients: ['approved take'], approved: true } };
  render: any = { id: 'render-1', project_id: 'project-1', status: 'running', quality_status: 'pending' };
  media: any[] = []; objects = new Map<string, Buffer>(); puts = 0; completions = 0; baseFees = 0; selections = 0;
  lost?: string; before?: string; nextId = 0;
  async call(name: any, args: any) {
    this.calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    if (this.before === name) { this.before = undefined; throw new Error('injected before side effect'); }
    let result: any;
    if (name === 'account_whoami') result = this.account;
    else if (name === 'video_project_read') result = { project: this.project, renders: [this.render] };
    else if (name === 'media_list') result = { items: this.media.filter(m => m.ingredient_key === args.ingredient_key && m.input_digest === args.input_digest).slice(-1), next_cursor: null };
    else if (name === 'media_upload') {
      const media = { id: `media-${++this.nextId}`, ingredient_key: args.ingredient_key, input_digest: args.input_digest,
        kind: args.kind, status: 'pending', path: args.path, url: `https://fixture.invalid/${args.path}?signature=temporary` };
      this.media.push(media);
      result = { media, upload: { url: media.url, required_headers: { 'Content-Type': args.source.content_type },
        method: 'PUT', render_file_url: `/api/ads/projects/project-1/render-file?path=${encodeURIComponent(args.path)}` } };
    } else if (name === 'media_confirm') {
      const media = this.media.find(m => m.id === args.media_id);
      const bytes = this.objects.get(media.url);
      if (!bytes) throw new SaveToolError('not_found');
      media.status = 'approved'; media.bytes = bytes.length;
      result = { media };
    } else if (name === 'video_render_run') {
      expect(Object.keys(args).sort()).toEqual(['brand_id', 'project_id', 'render']);
      expect(args.render.render_id).toBe('render-1');
      this.completions++; if (this.render.status !== 'complete') this.baseFees++;
      this.render = { ...this.render, ...args.render };
      result = this.render;
    } else if (name === 'video_project_upsert') {
      expect(args.patch).toEqual({ final_render_id: 'render-1' });
      this.project.final_render_id = args.patch.final_render_id; this.selections++;
      result = { project: this.project };
    } else throw new Error(`Unexpected provider/render-open call: ${name}`);
    if (this.lost === name) { this.lost = undefined; throw new Error('injected lost reply'); }
    return JSON.parse(JSON.stringify(result));
  }
  async put(url: string, _headers: any, bytes: Buffer) {
    this.puts++; this.objects.set(url, bytes);
    if (this.lost === 'put') { this.lost = undefined; throw new Error('injected lost PUT reply'); }
  }
  async download(url: string) { const bytes = this.objects.get(url); if (!bytes) throw new Error('missing object'); return bytes; }
}

describe('finished-video checkpoint and save-only recovery', () => {
  let dir: string; let target: string; let input: SaveManifest; let fixture: Fixture;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'goose-save-test-')); target = path.join(dir, 'save.json'); fixture = new Fixture();
    const final = Buffer.from('owned fake final bytes, no provider media'); const poster = Buffer.from('owned fake poster');
    await writeFile(path.join(dir, 'final.mp4'), final); await writeFile(path.join(dir, 'poster.jpg'), poster);
    await writeFile(path.join(dir, 'quality.json'), JSON.stringify(report())); await writeFile(path.join(dir, 'frames.json'), '{"review":"fixture evidence"}');
    input = { brand_id: 'brand-1', project_id: 'project-1', render_id: 'render-1', input_digest: 'a'.repeat(64),
      final_path: path.join(dir, 'final.mp4'), poster_path: path.join(dir, 'poster.jpg'),
      qc: { final_sha256: hash(final), poster_sha256: hash(poster), report_path: path.join(dir, 'quality.json'), evidence_paths: [path.join(dir, 'frames.json')] } };
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
  const prepare = () => prepareSave(target, input, fixture);
  test('normal save checkpoints before side effects, saves exact bytes and preserves standard keys', async () => {
    await prepare(); expect(fixture.puts).toBe(0);
    const done = await resumeSave(target, fixture);
    expect(done.progress.selection).toBe('selected'); expect(fixture.puts).toBe(2); expect(fixture.baseFees).toBe(1);
    expect(fixture.media.map(m => m.ingredient_key)).toEqual(['final', 'final-thumb']);
    expect(fixture.media.every(m => m.path.includes('render-1'))).toBe(true);
    const raw = await readFile(target, 'utf8');
    expect(raw).not.toContain('signature'); expect(raw).not.toContain('never-store-this'); expect(raw).not.toContain('https://fixture');
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });
  test.each(['media_upload', 'put', 'media_confirm', 'video_render_run', 'video_project_upsert'])(
    'lost %s reply reads current state and resumes the same render without regeneration', async step => {
      await prepare(); fixture.lost = step;
      await expect(resumeSave(target, fixture)).rejects.toThrow('injected');
      const before = fixture.completions;
      const done = await resumeSave(target, fixture);
      expect(done.progress.selection).toBe('selected'); expect(fixture.baseFees).toBe(1);
      if (step === 'video_render_run' || step === 'video_project_upsert') expect(fixture.completions).toBe(before);
      expect(fixture.calls.filter(c => c.name === 'video_render_run').every(c => !!c.args.render && c.args.render.render_id === 'render-1')).toBe(true);
      expect(fixture.calls.some(c => /provider|job|generate/.test(c.name))).toBe(false);
    });
  test('interrupt before PUT refreshes an expired request only after confirming missing storage', async () => {
    await prepare(); fixture.before = 'media_confirm'; fixture.lost = 'media_upload';
    await expect(resumeSave(target, fixture)).rejects.toThrow('injected'); fixture.before = undefined;
    await resumeSave(target, fixture); expect(fixture.puts).toBe(2); expect(fixture.media).toHaveLength(3);
  });
  test('before completion interruption resumes without duplicate uploads', async () => {
    await prepare(); fixture.before = 'video_render_run';
    await expect(resumeSave(target, fixture)).rejects.toThrow('injected');
    await resumeSave(target, fixture); expect(fixture.puts).toBe(2); expect(fixture.completions).toBe(1);
  });
  test('a finished checkpoint rereads success, with no writes or duplicate fee', async () => {
    await prepare(); await resumeSave(target, fixture); const callCount = fixture.calls.length;
    await resumeSave(target, fixture);
    expect(fixture.calls.slice(callCount).every(c => ['account_whoami', 'video_project_read', 'media_list'].includes(c.name))).toBe(true);
    expect(fixture.completions).toBe(1); expect(fixture.baseFees).toBe(1); expect(fixture.selections).toBe(1);
  });
  test.each(['final.mp4', 'poster.jpg', 'quality.json', 'frames.json'])('changed %s stops without a save mutation', async name => {
    await prepare(); await writeFile(path.join(dir, name), 'changed'); const calls = fixture.calls.length;
    await expect(resumeSave(target, fixture)).rejects.toThrow('changed');
    expect(fixture.calls.slice(calls).every(c => c.name === 'account_whoami')).toBe(true); expect(fixture.puts).toBe(0);
  });
  test('missing finished file stops without generation', async () => {
    await prepare(); await rm(input.final_path); await expect(resumeSave(target, fixture)).rejects.toThrow(); expect(fixture.puts).toBe(0);
  });
  test.each(['stopped', 'capped', 'failed'])('%s render cannot be reopened', async status => {
    await prepare(); fixture.render.status = status;
    await expect(resumeSave(target, fixture)).rejects.toThrow('cannot reopen'); expect(fixture.puts).toBe(0); expect(fixture.completions).toBe(0);
  });
  test('stop request in an active render blocks saving', async () => {
    await prepare(); fixture.render.stop_requested_at = new Date().toISOString();
    await expect(resumeSave(target, fixture)).rejects.toThrow('cannot reopen'); expect(fixture.puts).toBe(0);
  });
  test.each(['user', 'organization', 'environment'])('%s identity mismatch stops before media writes', async field => {
    await prepare();
    if (field === 'environment') fixture.account.environment.api_origin = 'http://127.0.0.1:6201';
    else fixture.account[field as 'user' | 'organization'].id = 'different';
    await expect(resumeSave(target, fixture)).rejects.toThrow('mismatch'); expect(fixture.puts).toBe(0);
  });
  test('changed project owner is rejected', async () => {
    await prepare(); fixture.project.organization_id = 'different-org';
    await expect(resumeSave(target, fixture)).rejects.toThrow('ownership changed'); expect(fixture.puts).toBe(0);
  });
  test('changed review or selected version is not overwritten', async () => {
    await prepare(); fixture.project.script = 'changed'; await expect(resumeSave(target, fixture)).rejects.toThrow('review set changed');
    fixture.project.script = 'approved words'; fixture.project.final_render_id = 'new-choice';
    await expect(resumeSave(target, fixture)).rejects.toThrow('Another version'); expect(fixture.puts).toBe(0);
  });
  test.each(['broken-json', 'changed-binding', 'unknown-field', 'bad-stage'])('malformed %s checkpoint makes no tool calls', async mode => {
    await prepare(); const cp: any = await loadCheckpoint(target);
    if (mode === 'broken-json') await writeFile(target, '{');
    else {
      if (mode === 'changed-binding') cp.binding.render_id = 'different';
      if (mode === 'unknown-field') cp.credentials = 'secret';
      if (mode === 'bad-stage') cp.progress.completion = 'garbage';
      await writeFile(target, JSON.stringify(cp));
    }
    const calls = fixture.calls.length; await expect(resumeSave(target, fixture)).rejects.toThrow(); expect(fixture.calls).toHaveLength(calls);
  });
  test.each(['fail', 'missing-check', 'all-na', 'stale-hash', 'no-evidence'])('invalid QC %s cannot create a checkpoint', async mode => {
    const q: any = report();
    if (mode === 'fail') q.checks.captions.status = 'fail';
    if (mode === 'missing-check') delete q.checks.brand;
    if (mode === 'all-na') CHECKS.forEach(key => { q.checks[key] = { status: 'not_applicable', note: 'skip' }; });
    if (mode === 'stale-hash') input.qc.final_sha256 = 'b'.repeat(64);
    if (mode === 'no-evidence') input.qc.evidence_paths = [];
    await writeFile(input.qc.report_path, JSON.stringify(q)); await expect(prepare()).rejects.toThrow(); expect(fixture.puts).toBe(0);
    await expect(stat(target)).rejects.toThrow();
  });
  test('server confirmed bytes must still match the quality-checked output', async () => {
    await prepare(); fixture.lost = 'media_confirm'; await expect(resumeSave(target, fixture)).rejects.toThrow();
    const media = fixture.media[0]; fixture.objects.set(media.url, Buffer.alloc(media.bytes, 8));
    await expect(resumeSave(target, fixture)).rejects.toThrow('Stored bytes'); expect(fixture.completions).toBe(0);
  });
  test('copied authorization or signed-URL material in QC notes is never checkpointed', async () => {
    const q: any = report(); q.checks.source.note = 'Copied Authorization: Bearer owned-fixture-secret';
    await writeFile(input.qc.report_path, JSON.stringify(q));
    await expect(prepare()).rejects.toThrow('no credentials');
    await expect(stat(target)).rejects.toThrow(); expect(fixture.puts).toBe(0);
  });
  test('completed remote quality mismatch is not overwritten or pinned', async () => {
    await prepare(); fixture.lost = 'video_render_run'; await expect(resumeSave(target, fixture)).rejects.toThrow();
    fixture.render.quality_report.summary = 'different';
    await expect(resumeSave(target, fixture)).rejects.toThrow('does not match'); expect(fixture.completions).toBe(1); expect(fixture.selections).toBe(0);
  });
  test('atomic writes retain a complete checkpoint and leave no pending file', async () => {
    const cp = await prepare(); cp.progress.completion = 'unknown'; await writeCheckpoint(target, cp);
    expect((await loadCheckpoint(target)).progress.completion).toBe('unknown');
    expect((await readdir(dir)).filter(name => name.includes('.pending') || name.endsWith('.lock'))).toEqual([]);
    await expect(prepare()).rejects.toThrow('already exists');
  });
  test('a failure before atomic rename leaves the previous complete checkpoint readable', async () => {
    const cp = await prepare(); cp.progress.completion = 'unknown';
    const rename = jest.spyOn(files, 'rename').mockRejectedValueOnce(new Error('injected rename interruption'));
    try { await expect(writeCheckpoint(target, cp)).rejects.toThrow('injected rename'); }
    finally { rename.mockRestore(); }
    expect((await loadCheckpoint(target)).progress.completion).toBe('pending');
    expect((await readdir(dir)).some(name => name.includes('.pending'))).toBe(false);
  });
  test('a lost refreshed-upload reply can be discovered without replacing the same-render destination', async () => {
    await prepare(); fixture.lost = 'media_upload'; await expect(resumeSave(target, fixture)).rejects.toThrow('injected');
    fixture.lost = 'media_upload'; await expect(resumeSave(target, fixture)).rejects.toThrow('injected');
    await resumeSave(target, fixture); expect(fixture.puts).toBe(2); expect(fixture.baseFees).toBe(1);
    expect(fixture.media.filter(m => m.kind === 'render').every(m => m.path === 'working/final-render-1.mp4')).toBe(true);
  });
  test('identity-mismatched remote media cannot be reused', async () => {
    await prepare(); fixture.lost = 'media_confirm'; await expect(resumeSave(target, fixture)).rejects.toThrow();
    fixture.media[0].id = 'another-media';
    await expect(resumeSave(target, fixture)).rejects.toThrow('media identity changed'); expect(fixture.completions).toBe(0);
  });
  test('an exclusive writer lock cannot be stolen', async () => {
    await prepare(); await writeFile(`${target}.lock`, 'owned process');
    await expect(resumeSave(target, fixture)).rejects.toThrow('locked'); expect(await readFile(`${target}.lock`, 'utf8')).toBe('owned process');
  });
});
