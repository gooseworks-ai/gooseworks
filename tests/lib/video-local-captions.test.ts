import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { executeNextCaptionClaim, validateCaptionClaim, type CaptionClaim, type CaptionRuntime, type CaptionTransport } from '../../src/lib/video-local-captions';
import { createCaptionRuntime, createCaptionTransport, ffmpegCaptionArgs, LOCAL_UPLOAD_TIMEOUT_MS } from '../../src/lib/video-local-runtime';

const claim = (): CaptionClaim => ({
  claim_id: 'claim-1', lease_token: 'secret-lease', lease_expires_at: new Date(Date.now() + 900_000).toISOString(),
  package_digest: 'a'.repeat(64),
  package: {
    version: 1, operation: 'captions', source_video_url: 'https://media.example.test/source.mp4',
    source_video_sha256: 'b'.repeat(64),
    ass_text: '[Script Info]\nTitle: Test\n[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Hello',
    edl: { width: 1080, height: 1920, segments: [{ dur_s: 2 }, { dur_s: 3 }] },
  },
});

describe('local captions executor', () => {
  let workRoot: string;
  beforeEach(async () => { workRoot = await mkdtemp(path.join(os.tmpdir(), 'goose-captions-test-')); });
  afterEach(async () => { await rm(workRoot, { recursive: true, force: true }); });

  it('claims once, journals its lease and ffmpeg version, verifies output, and uploads once', async () => {
    const order: string[] = [];
    const transport: CaptionTransport = {
      next: jest.fn(async () => { order.push('claim'); return claim(); }),
      status: jest.fn(),
      heartbeat: jest.fn(async () => { order.push('heartbeat'); }),
      complete: jest.fn(async () => { order.push('complete'); }),
    };
    const runtime: CaptionRuntime = {
      preflight: jest.fn(async () => { order.push('preflight'); return 'ffmpeg version 7.1'; }),
      download: jest.fn(async (_url, target) => { order.push('download'); await writeFile(target, 'source'); return 'b'.repeat(64); }),
      render: jest.fn(async (_source, _ass, output) => { order.push('render'); await writeFile(output, Buffer.alloc(2048, 1)); }),
      probe: jest.fn(async () => { order.push('probe'); return { width: 1080, height: 1920, duration_s: 5 }; }),
    };
    const result = await executeNextCaptionClaim({ projectId: 'project-1', workerId: 'worker-1', workRoot, transport, runtime });
    expect(result?.claimId).toBe('claim-1');
    expect(order).toEqual(['claim', 'preflight', 'download', 'render', 'probe', 'heartbeat', 'complete']);
    expect(transport.complete).toHaveBeenCalledWith('claim-1', 'secret-lease', expect.stringContaining('captioned.mp4'), result?.outputSha256);
    const journal = JSON.parse(await readFile(result!.journalPath, 'utf8'));
    expect(journal).toMatchObject({ phase: 'completed', claim_id: 'claim-1', lease_token: 'secret-lease',
      package_digest: 'a'.repeat(64), ffmpeg_version: 'ffmpeg version 7.1', output_sha256: result?.outputSha256 });
  });

  it('fails closed when server package omits source/ASS', () => {
    const incomplete = claim();
    incomplete.package.source_video_url = '';
    expect(() => validateCaptionClaim(incomplete)).toThrow('Incomplete');
    incomplete.package.source_video_url = 'https://media.example.test/source.mp4';
    incomplete.package.ass_text = '';
    expect(() => validateCaptionClaim(incomplete)).toThrow('Incomplete');
    incomplete.package.ass_text = claim().package.ass_text;
    incomplete.package.source_video_sha256 = '';
    expect(() => validateCaptionClaim(incomplete)).toThrow('source checksum');
  });

  it('does not upload output with wrong dimensions or duration', async () => {
    const transport: CaptionTransport = {
      next: async () => claim(), status: jest.fn(), heartbeat: jest.fn(async () => undefined), complete: jest.fn(async () => undefined),
    };
    const runtime: CaptionRuntime = {
      preflight: async () => 'ffmpeg version 7.1',
      download: async (_url, target) => { await writeFile(target, 'source'); return 'b'.repeat(64); },
      render: async (_source, _ass, output) => { await writeFile(output, Buffer.alloc(2048)); },
      probe: async () => ({ width: 720, height: 1280, duration_s: 5 }),
    };
    await expect(executeNextCaptionClaim({ projectId: 'project-1', workerId: 'worker-1', workRoot, transport, runtime }))
      .rejects.toThrow('dimensions or duration');
    expect(transport.complete).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(workRoot, 'claim-1', 'journal.json'), 'utf8')).phase).toBe('downloaded');
  });

  it('records the lease even when ffmpeg preflight fails', async () => {
    const transport: CaptionTransport = {
      next: async () => claim(), status: jest.fn(), heartbeat: jest.fn(async () => undefined), complete: jest.fn(async () => undefined),
    };
    const runtime: CaptionRuntime = {
      preflight: async () => { throw new Error('libass unavailable'); },
      download: jest.fn(), render: jest.fn(), probe: jest.fn(),
    };
    await expect(executeNextCaptionClaim({ projectId: 'project-1', workerId: 'worker-1', workRoot, transport, runtime }))
      .rejects.toThrow('libass unavailable');
    expect(JSON.parse(await readFile(path.join(workRoot, 'claim-1', 'journal.json'), 'utf8')))
      .toMatchObject({ phase: 'claimed', lease_token: 'secret-lease', ffmpeg_version: 'pending preflight' });
    expect(transport.complete).not.toHaveBeenCalled();
  });

  it('keeps heartbeating while a slow upload is in progress', async () => {
    let heartbeats = 0;
    const transport: CaptionTransport = {
      next: async () => claim(),
      status: jest.fn(),
      heartbeat: async () => { heartbeats++; },
      complete: async () => { await new Promise((resolve) => setTimeout(resolve, 55)); },
    };
    const runtime: CaptionRuntime = {
      preflight: async () => 'ffmpeg version 7.1',
      download: async (_url, target) => { await writeFile(target, 'source'); return 'b'.repeat(64); },
      render: async (_source, _ass, output) => { await writeFile(output, Buffer.alloc(2048)); },
      probe: async () => ({ width: 1080, height: 1920, duration_s: 5 }),
    };
    await executeNextCaptionClaim({ projectId: 'project-1', workerId: 'worker-1', workRoot, transport, runtime, heartbeatMs: 5 });
    expect(heartbeats).toBeGreaterThan(1);
  });

  it('resumes a rendered journal under its active lease before requesting another claim', async () => {
    const next = jest.fn(async () => claim());
    let uploadAttempts = 0;
    const transport: CaptionTransport = {
      next,
      status: jest.fn(async () => ({ status: 'claimed' as const, package_digest: 'a'.repeat(64),
        package: claim().package, lease_expires_at: claim().lease_expires_at })),
      heartbeat: jest.fn(async () => undefined),
      complete: jest.fn(async () => { if (++uploadAttempts === 1) throw new Error('upload timed out'); }),
    };
    const render = jest.fn(async (_source: string, _ass: string, output: string) => { await writeFile(output, Buffer.alloc(2048)); });
    const runtime: CaptionRuntime = {
      preflight: async () => 'ffmpeg version 7.1',
      download: async (_url, target) => { await writeFile(target, 'source'); return 'b'.repeat(64); },
      render,
      probe: async () => ({ width: 1080, height: 1920, duration_s: 5 }),
    };
    const args = { projectId: 'project-1', workerId: 'worker-1', workRoot, transport, runtime };
    await expect(executeNextCaptionClaim(args)).rejects.toThrow('upload timed out');
    expect(JSON.parse(await readFile(path.join(workRoot, 'claim-1', 'journal.json'), 'utf8')).phase).toBe('rendered');
    await expect(executeNextCaptionClaim(args)).resolves.toMatchObject({ claimId: 'claim-1' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(transport.status).toHaveBeenCalledWith('claim-1', 'secret-lease');
    expect(uploadAttempts).toBe(2);
  });

  it('reconciles an uncertain successful completion without a second upload', async () => {
    const dir = path.join(workRoot, 'claim-1');
    await mkdir(dir);
    await writeFile(path.join(dir, 'journal.json'), JSON.stringify({
      claim_id: 'claim-1', project_id: 'project-1', package_digest: 'a'.repeat(64), lease_token: 'secret-lease',
      lease_expires_at: claim().lease_expires_at, ffmpeg_version: 'ffmpeg version 7.1', phase: 'rendered',
      output_sha256: 'b'.repeat(64),
    }));
    const transport: CaptionTransport = {
      next: jest.fn(),
      status: jest.fn(async () => ({ status: 'completed' as const, output_sha256: 'b'.repeat(64), output_url: 'https://media.example.test/done.mp4' })),
      heartbeat: jest.fn(), complete: jest.fn(),
    };
    const runtime = { preflight: jest.fn(), download: jest.fn(), render: jest.fn(), probe: jest.fn() } as CaptionRuntime;
    await expect(executeNextCaptionClaim({ projectId: 'project-1', workerId: 'worker-1', workRoot, transport, runtime }))
      .resolves.toMatchObject({ claimId: 'claim-1', outputSha256: 'b'.repeat(64) });
    expect(transport.next).not.toHaveBeenCalled();
    expect(transport.complete).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(dir, 'journal.json'), 'utf8')).phase).toBe('completed');
  });

  it('retains a pending journal and gives a recovery instruction when status cannot be verified', async () => {
    const dir = path.join(workRoot, 'claim-1');
    await mkdir(dir);
    await writeFile(path.join(dir, 'journal.json'), JSON.stringify({
      claim_id: 'claim-1', project_id: 'project-1', package_digest: 'a'.repeat(64), lease_token: 'secret-lease',
      lease_expires_at: claim().lease_expires_at, ffmpeg_version: 'ffmpeg version 7.1', phase: 'rendered',
      output_sha256: 'b'.repeat(64),
    }));
    const transport: CaptionTransport = {
      next: jest.fn(), status: async () => { throw new Error('HTTP 409'); },
      heartbeat: jest.fn(), complete: jest.fn(),
    };
    const runtime = { preflight: jest.fn(), download: jest.fn(), render: jest.fn(), probe: jest.fn() } as CaptionRuntime;
    await expect(executeNextCaptionClaim({ projectId: 'project-1', workerId: 'worker-1', workRoot, transport, runtime }))
      .rejects.toThrow(/Do not request new work; retain the journal/);
    expect(transport.next).not.toHaveBeenCalled();
  });

  it('uses fixed reviewed ffmpeg flags with no package-supplied arguments', () => {
    expect(ffmpegCaptionArgs()).toEqual(expect.arrayContaining(['-vf', 'ass=captions.ass', '-c:v', 'libx264', '-c:a', 'copy']));
    expect(ffmpegCaptionArgs()).not.toContain('-filter_complex_script');
  });
});

describe('video-local HTTP transport', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('uses cal_ bearer auth and the scoped claim/heartbeat/multipart endpoints', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ status: 'success', data: requests.length === 1 ? claim()
        : requests.length === 2 ? { status: 'claimed', package_digest: 'a'.repeat(64), package: claim().package,
          lease_expires_at: claim().lease_expires_at } : {} }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const dir = await mkdtemp(path.join(os.tmpdir(), 'goose-captions-http-'));
    try {
      const output = path.join(dir, 'out.mp4');
      await writeFile(output, Buffer.alloc(2048));
      const transport = createCaptionTransport('https://api.example.test', 'cal_secret');
      expect(await transport.next('project-1', 'worker-1')).toMatchObject({ claim_id: 'claim-1' });
      expect(await transport.status('claim-1', 'secret-lease')).toMatchObject({ status: 'claimed' });
      await transport.heartbeat('claim-1', 'secret-lease');
      await transport.complete('claim-1', 'secret-lease', output, 'b'.repeat(64));
      expect(requests.map((item) => item.url)).toEqual([
        'https://api.example.test/api/ads/video-local/claims/next?project_id=project-1&worker_id=worker-1',
        'https://api.example.test/api/ads/video-local/claims/claim-1',
        'https://api.example.test/api/ads/video-local/claims/claim-1/heartbeat',
        'https://api.example.test/api/ads/video-local/claims/claim-1/complete',
      ]);
      for (const item of requests) expect((item.init.headers as Record<string, string>).Authorization).toBe('Bearer cal_secret');
      expect((requests[1].init.headers as Record<string, string>)['X-Video-Local-Lease']).toBe('secret-lease');
      expect(JSON.parse(requests[2].init.body as string)).toEqual({ lease_token: 'secret-lease' });
      const upload = requests[3].init;
      expect((upload.headers as Record<string, string>)['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
      expect((upload as RequestInit & { duplex: string }).duplex).toBe('half');
      const parts: Buffer[] = [];
      for await (const part of upload.body as unknown as AsyncIterable<Buffer>) parts.push(Buffer.from(part));
      const multipart = Buffer.concat(parts).toString('utf8');
      expect(multipart).toContain('name="lease_token"\r\n\r\nsecret-lease');
      expect(multipart).toContain(`name="sha256"\r\n\r\n${'b'.repeat(64)}`);
      expect(multipart).toContain('filename="captioned.mp4"');
      expect(Number((upload.headers as Record<string, string>)['Content-Length'])).toBe(Buffer.concat(parts).length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-cal_ tokens before any request', () => {
    expect(() => createCaptionTransport('https://api.example.test', 'other')).toThrow('cal_');
  });

  it('allows a bounded upload longer than the read timeout and shorter than the lease', () => {
    expect(LOCAL_UPLOAD_TIMEOUT_MS).toBeGreaterThan(30_000);
    expect(LOCAL_UPLOAD_TIMEOUT_MS).toBeLessThan(15 * 60_000);
  });

  it('checks a declared source SHA256 before rendering', async () => {
    global.fetch = jest.fn(async () => new Response(Buffer.alloc(2048, 1), { status: 200 })) as typeof fetch;
    const dir = await mkdtemp(path.join(os.tmpdir(), 'goose-captions-download-'));
    try {
      await expect(createCaptionRuntime().download('https://media.example.test/source.mp4', path.join(dir, 'source.mp4'), '0'.repeat(64)))
        .rejects.toThrow('checksum mismatch');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
