import { createServer, Server } from 'http';
import { mkdtemp, writeFile, rm, readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { createSaveTransport, SaveToolError } from '../../src/lib/video-save-mcp';
import { prepareSave, resumeSave } from '../../src/lib/video-save';

describe('save-only canonical MCP wire transport (owned localhost fixture)', () => {
  let server: Server; let origin: string; let directory: string;
  let calls: any[]; let sessions: number; let errorCode: string | undefined; let httpStatus: number | undefined;
  let lostCompletion: boolean; let completed: boolean; let selected: boolean; let completions: number;
  let bytes: Map<string, Buffer>; let media: any[]; let advertisedGuard: boolean; let interleavedSelection: boolean;
  const user = 'user-1'; const org = 'org-1'; const projectId = 'project-1'; const renderId = 'render-1';
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'goose-save-wire-'));
    calls = []; sessions = 0; completed = false; selected = false; completions = 0; lostCompletion = false;
    errorCode = undefined; httpStatus = undefined; bytes = new Map(); media = []; advertisedGuard = true; interleavedSelection = false;
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks);
      if (req.url?.startsWith('/storage/')) {
        if (req.method === 'PUT') { bytes.set(req.url, raw); res.writeHead(200); res.end(); }
        else { const data = bytes.get(req.url); res.writeHead(data ? 200 : 404); res.end(data); }
        return;
      }
      expect(req.headers.authorization).toBe('Bearer owned-local-fixture-token');
      expect(req.url).toBe('/mcp');
      const envelope = JSON.parse(raw.toString()); calls.push(envelope);
      if (httpStatus) { res.writeHead(httpStatus); res.end(); return; }
      let result: any;
      if (envelope.method === 'initialize') {
        sessions++; result = { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'owned-fixture', version: '1' } };
        res.setHeader('mcp-session-id', `session-${sessions}`);
      } else {
        expect(req.headers['mcp-session-id']).toBe(`session-${sessions}`);
        if (envelope.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
        if (envelope.method === 'tools/list') {
          result = { tools: [{ name: 'video_project_upsert', inputSchema: { properties: { patch: { properties: advertisedGuard ? {
            final_selection_guard: { properties: { expected_final_render_id: { type: ['string', 'null'] }, expected_review_digest: { type: 'string' } },
              required: ['expected_final_render_id', 'expected_review_digest'] },
          } : {} } } } }] };
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: envelope.id, result })); return;
        }
        expect(envelope.method).toBe('tools/call');
        const { name, arguments: args } = envelope.params;
        let data: any;
        if (name === 'account_whoami') data = { environment: { name: 'local', api_origin: origin },
          user: { id: user }, organization: { id: org } };
        else if (name === 'video_project_read') data = {
          project: { id: projectId, brand_id: 'brand-1', organization_id: org, final_render_id: selected ? renderId : interleavedSelection && errorCode ? 'customer-choice' : null, script: 'final saved review' },
          renders: [{ id: renderId, project_id: projectId, status: completed ? 'complete' : 'running',
            ...(completed ? mediaRender : {}) }],
        };
        else if (name === 'media_list') data = { items: media.filter(m => m.ingredient_key === args.ingredient_key && m.input_digest === args.input_digest), next_cursor: null };
        else if (name === 'media_upload') {
          const item = { id: `media-${media.length + 1}`, status: 'pending', kind: args.kind, ingredient_key: args.ingredient_key,
            input_digest: args.input_digest, path: args.path, url: `${origin}/storage/${media.length + 1}` };
          media.push(item);
          data = { media: item, upload: { method: 'PUT', url: item.url, required_headers: { 'Content-Type': args.source.content_type },
            render_file_url: `/api/ads/projects/${projectId}/render-file?path=${encodeURIComponent(args.path)}` } };
        } else if (name === 'media_confirm') {
          const item = media.find(m => m.id === args.media_id); item.status = 'approved';
          item.bytes = bytes.get(new URL(item.url).pathname)!.length; data = { media: item };
        } else if (name === 'video_render_run') {
          expect(args.render.render_id).toBe(renderId); expect(args.kind).toBeUndefined();
          completions++; completed = true; mediaRender = args.render; data = args.render;
          if (lostCompletion) { lostCompletion = false; res.destroy(); return; }
        } else if (name === 'video_project_upsert') {
          expect(args.patch.final_render_id).toBe(renderId);
          expect(args.patch.final_selection_guard).toMatchObject({ expected_final_render_id: null });
          expect(args.patch.final_selection_guard.expected_review_digest).toMatch(/^[a-f0-9]{64}$/);
          if (interleavedSelection) { errorCode = 'final_selection_conflict'; data = {}; }
          else { selected = true; data = {}; }
        } else throw new Error(`Forbidden provider or render-open tool ${name}`);
        result = errorCode ? { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: errorCode, message: 'fixture' } }) }] }
          : { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
      const message = JSON.stringify({ jsonrpc: '2.0', id: envelope.id, result });
      // Exercise the Streamable HTTP SSE response form, not only JSON.
      res.setHeader('Content-Type', 'text/event-stream'); res.end(`event: message\ndata: ${message}\n\n`);
    });
    let mediaRender: any = {};
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  const credentials = () => ({ api_key: 'owned-local-fixture-token', email: 'fixture@example.invalid', agent_id: 'agent-1', api_base: origin, mcp_server_url: origin });
  const checkpoint = async () => {
    const final = Buffer.from('local wire fixture video bytes'); const poster = Buffer.from('local wire fixture poster');
    const report = { version: 1, summary: 'Fixture QA', checks: Object.fromEntries(['source', 'brand', 'product', 'hook_and_scene_order',
      'voice_and_script', 'captions', 'endcard_and_cta', 'duration_and_ratio', 'visual_artifacts'].map(k => [k, { status: 'pass' }])) };
    const finalPath = path.join(directory, 'final.mp4'); const posterPath = path.join(directory, 'poster.jpg'); const reportPath = path.join(directory, 'report.json');
    await writeFile(finalPath, final); await writeFile(posterPath, poster); await writeFile(reportPath, JSON.stringify(report));
    const target = path.join(directory, 'checkpoint.json');
    const transport = await createSaveTransport(credentials());
    await prepareSave(target, { brand_id: 'brand-1', project_id: projectId, render_id: renderId, input_digest: 'a'.repeat(64),
      final_path: finalPath, poster_path: posterPath, qc: { final_sha256: createHash('sha256').update(final).digest('hex'),
        poster_sha256: createHash('sha256').update(poster).digest('hex'), report_path: reportPath, evidence_paths: [reportPath] } }, transport);
    return { target, transport };
  };
  test('fresh authenticated initialization recovers a lost completion response on the same render', async () => {
    const { target, transport } = await checkpoint(); lostCompletion = true;
    await expect(resumeSave(target, transport)).rejects.toThrow('connection interrupted');
    expect(completed).toBe(true); expect(selected).toBe(false);
    const fresh = await createSaveTransport(credentials());
    const done = await resumeSave(target, fresh);
    expect(done.progress.selection).toBe('selected'); expect(completions).toBe(1); expect(media).toHaveLength(2); expect(sessions).toBe(2);
    expect(calls.filter(call => call.method === 'tools/call').every(call => !/provider|generate|job/.test(call.params.name))).toBe(true);
    expect(await readFile(target, 'utf8')).not.toContain('owned-local-fixture-token');
    expect(await readFile(target, 'utf8')).not.toContain('/storage/');
  });
  test('a final selected between project read and the MCP write is preserved with an unknown receipt', async () => {
    const { target, transport } = await checkpoint(); interleavedSelection = true;
    await expect(resumeSave(target, transport)).rejects.toThrow('without overwriting');
    expect(selected).toBe(false); expect(completions).toBe(1);
    const cp = JSON.parse(await readFile(target, 'utf8')); expect(cp.progress.selection).toBe('unknown');
    expect(calls.filter(c => c.method === 'tools/call' && c.params.name === 'video_project_upsert')).toHaveLength(1);
  });
  test('tool error codes stay distinguishable without replaying server text', async () => {
    const transport = await createSaveTransport(credentials()); errorCode = 'not_found';
    await expect(transport.call('account_whoami', {})).rejects.toBeInstanceOf(SaveToolError);
  });
  test.each([401, 403, 404])('HTTP %s requires normal reconnect and does not retry a write', async status => {
    const transport = await createSaveTransport(credentials()); httpStatus = status;
    await expect(transport.call('account_whoami', {})).rejects.toThrow(/normal|reconnect/);
    expect(calls.filter(c => c.method === 'tools/call')).toHaveLength(1);
  });
  test('wrong API origin is rejected even with a successful account reply', async () => {
    const transport = await createSaveTransport({ ...credentials(), api_base: 'http://127.0.0.1:1' });
    await expect(transport.call('account_whoami', {})).rejects.toThrow('origins differ');
  });
  test('transport refuses render-open and unrelated project writes', async () => {
    const transport = await createSaveTransport(credentials()); const count = calls.length;
    await expect(transport.call('video_render_run', { project_id: projectId, kind: 'full' })).rejects.toThrow('Save-only');
    await expect(transport.call('video_project_upsert', { project_id: projectId, patch: { script: {} } })).rejects.toThrow('Save-only');
    await expect(transport.call('video_project_upsert', { project_id: projectId, patch: { final_render_id: renderId } })).rejects.toThrow('Save-only');
    expect(calls).toHaveLength(count);
  });
  test('a server without the advertised atomic guard receives no saving writes', async () => {
    advertisedGuard = false;
    await expect(createSaveTransport(credentials())).rejects.toThrow('atomic final selection');
    expect(calls.some(c => c.method === 'tools/call')).toBe(false);
  });
});
