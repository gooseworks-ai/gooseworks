// scripts/try-style: the fake line stays local, the providers' answers keep the
// line's shapes, and real mode never spends past its caps or writes a key.
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { styleHash } from '../../src/kit/core/style';
import { API, tryLine } from '../../scripts/try-style/line';
import { FixtureFiles, freezeBrand, planBody } from '../../scripts/try-style/fixtures';
import { callKind, evenAlignment, falUnits, isFalQueueUrl, RealProvider, SpendLedger, spreadChunks, usdEstimate, type Provider, type ProviderAnswer, type RealOptions } from '../../scripts/try-style/providers';
import { fileSha, passingFakeRuns, readEnvKeys, realGateProblems } from '../../scripts/try-style/gates';
import { stageStyle } from '../../scripts/try-style/dev-styles';
import { KitLog } from '../../src/kit/core/log';
import { makeVideo } from '../../src/kit/core/run';
import type { LoadedPart } from '../../src/kit/core/host';
import { VideoLine } from '../../src/kit/line/client';
import type { PartContext } from '../../src/kit/part-interface';
import { fileSchema, MODEL, partsLock, runLogs, style as harnessStyle, testHost, testParts, tools as harnessTools } from './harness';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'try-style-'));
const style = { id: 'demo', version: '1.0.0', timeline: [], layers: { brand: false, captions: false, sound: true, check: true }, duration: { min_seconds: 1, max_seconds: 9 }, aspects: ['9:16'] };
const tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', drawtext: false, font: null };

function line(provider: Provider, dir = tmp()) {
  return tryLine({
    videoId: 'try_demo',
    style,
    body: { aspect: '9:16', scenes: [{ id: 's1', line: 'Hello there friend' }] },
    brand: { name: 'B' },
    layers: { check: { id: 'check-layer', version: '1.2.0' } },
    planFiles: new Map(),
    provider,
    tools,
    workDir: dir,
    pieceLog: path.join(dir, 'pieces.jsonl'),
  });
}

const stub = (answer: (call: any, ctx: any) => ProviderAnswer | Promise<ProviderAnswer>): Provider => ({ mode: 'fake', order: async (call, ctx) => answer(call, ctx) });
const js = async (r: Response | Promise<Response>): Promise<any> => (await r).json();
const post = (l: ReturnType<typeof line>, route: string, body?: unknown) =>
  l.fetch(`${API}/v1/video-line/try_demo${route}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

describe('try-style fake line', () => {
  it('refuses every address but its own', async () => {
    const l = line(stub(() => ({ kind: 'done' })));
    await expect(l.fetch('https://queue.fal.run/fal-ai/whisper', { method: 'POST' })).rejects.toThrow(/refused/);
    await expect(l.fetch('https://api.gooseworks.ai/v1/video-line/x/device', { method: 'POST' })).rejects.toThrow(/refused/);
    expect(l.refused).toHaveLength(2);
  });

  it('hands over the plan with the style hash and no parts lock', async () => {
    const l = line(stub(() => ({ kind: 'done' })));
    const answer = await js(post(l, '/device', { device: { device_id: 'd1' } }));
    expect(answer.line.parts_lock).toBeNull();
    expect(answer.line.plan.style_hash).toBe(styleHash(style));
    expect(answer.line.style_package.style_hash).toBe(styleHash(style));
    expect(answer.line.plan.body.scenes[0].line).toBe('Hello there friend');
  });

  it('hosts a file and hands the provider its bytes', async () => {
    let seen: string | null = null;
    const l = line(
      stub((call, ctx) => {
        seen = readFileSync(ctx.hosted(call.body.image_url)!.path, 'utf8');
        return { kind: 'done', json: { images: [{ url: `${API}/out/x.png` }] } };
      }),
    );
    const slot = await js(post(l, '/files', { sha256: 'x', bytes: 3, content_type: 'image/png', filename: 'a.png' }));
    await l.fetch(slot.put.url, { method: 'PUT', body: Buffer.from('abc') });
    const done = await js(post(l, `/files/${slot.file_id}/done`));
    expect(done.ref).toBe(`gooseworks-file:${slot.file_id}`);
    const answer = await js(post(l, '/pieces', { idempotency_key: 'k1', piece_key: 'stills.image-a', call: { provider: 'fal', path: 'fal-ai/nano-banana/edit', body: { image_url: done.ref } } }));
    expect(seen).toBe('abc');
    expect(answer.status).toBe('done');
    expect(answer.result.json.images[0].url).toContain('/out/');
  });

  it('serves a provider file as file_url, and a refusal as a stop', async () => {
    const dir = tmp();
    const audio = path.join(dir, 'a.mp3');
    writeFileSync(audio, 'mp3');
    const l = line(stub((call) => (call.path === '/v1/music' ? { kind: 'done', file: { path: audio, mime: 'audio/mpeg' } } : { kind: 'refused', code: 'over_run_cap', message: 'too much' })), dir);
    const done = await js(post(l, '/pieces', { idempotency_key: 'k1', piece_key: 'music.bed', call: { provider: 'elevenlabs', path: '/v1/music', body: { model_id: 'music_v1' } } }));
    expect(await (await l.fetch(done.result.file_url)).text()).toBe('mp3');
    const refused = await post(l, '/pieces', { idempotency_key: 'k2', piece_key: 'x.y', call: { provider: 'fal', path: 'fal-ai/veo3', body: {} } });
    expect(refused.status).toBe(402);
    expect((await js(refused)).error).toMatchObject({ code: 'over_run_cap', next: 'stop' });
  });
});

describe('try-style providers', () => {
  it('knows each call the parts make', () => {
    expect(callKind({ provider: 'elevenlabs', path: '/v1/text-to-speech/abc/with-timestamps', body: {} })).toBe('tts_timestamps');
    expect(callKind({ provider: 'elevenlabs', path: '/v1/music/detailed', body: {} })).toBe('song');
    expect(callKind({ provider: 'elevenlabs', path: '/v1/sound-generation', body: {} })).toBe('sfx');
    expect(callKind({ provider: 'fal', path: 'fal-ai/whisper', body: {} })).toBe('whisper');
    expect(callKind({ provider: 'fal', path: 'fal-ai/birefnet/v2', body: {} })).toBe('cutout');
    expect(callKind({ provider: 'fal', path: 'veed/fabric-1.0', body: {} })).toBe('lipsync');
    expect(callKind({ provider: 'fal', path: 'bytedance/seedance-2.0/image-to-video', body: {} })).toBe('video');
    expect(callKind({ provider: 'fal', path: 'minimax/h3-max/reference-to-video', body: {} })).toBe('video');
    expect(callKind({ provider: 'fal', path: 'openai/gpt-image-2/edit', body: {} })).toBe('image');
    expect(callKind({ provider: 'fal', path: 'some/other-model', body: {} })).toBe('unknown');
  });

  it('prices calls before they are sent, and has no price for an unknown model', () => {
    expect(usdEstimate({ provider: 'elevenlabs', path: '/v1/music', body: { music_length_ms: 60_000 } })).toBeCloseTo(0.15);
    expect(usdEstimate({ provider: 'elevenlabs', path: '/v1/text-to-speech/v/with-timestamps', body: { text: 'x'.repeat(1000) } })).toBeCloseTo(0.1);
    expect(usdEstimate({ provider: 'fal', path: 'bytedance/seedance-2.0/reference-to-video', body: { duration: 5, resolution: '1080p' } })).toBeCloseTo(3.5);
    expect(usdEstimate({ provider: 'fal', path: 'fal-ai/flux/dev', body: {} })).toBeNull();
  });

  it('spreads timings evenly, like the shapes the parts read', () => {
    const a = evenAlignment('abcd', 2);
    expect(a.character_start_times_seconds).toEqual([0, 0.5, 1, 1.5]);
    expect(a.character_end_times_seconds.at(-1)).toBe(2);
    const chunks = spreadChunks(['one two', 'three four'], 0, 4);
    expect(chunks.map((c) => c.text)).toEqual(['one', 'two', 'three', 'four']);
    expect(chunks[2].timestamp[0]).toBe(2);
  });
});

describe('try-style real mode caps', () => {
  const call = { provider: 'elevenlabs', path: '/v1/music', body: { music_length_ms: 30_000, model_id: 'music_v1' } };
  const ctx = (dir: string) => ({ piece_key: 'music.bed', idempotency_key: 'k', hosted: () => null, planLines: [], workDir: dir, publish: (f: string) => f, mirror: (u: string) => u, tools });
  const real = (dir: string, over: Partial<RealOptions> = {}) =>
    new RealProvider({
      capUsd: 1,
      nightCapUsd: 200,
      ledger: new SpendLedger(path.join(dir, 'spend.jsonl')),
      run_id: 'r1',
      style_id: 'demo',
      style_sha: 'abc',
      keys: { elevenlabs: 'sk-secret-value', fal: 'fal-secret-value' },
      fetch: jest.fn() as any,
      sleep: async () => undefined,
      ...over,
    });

  it('refuses a call past the run cap and never sends it', async () => {
    const dir = tmp();
    const fetchImpl = jest.fn();
    const r = real(dir, { capUsd: 0.05, fetch: fetchImpl as any });
    expect(await r.order(call, ctx(dir))).toMatchObject({ kind: 'refused', code: 'over_run_cap' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses past the night cap counted from the ledger, old lines included', async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'spend.jsonl'), `${JSON.stringify({ time: 'x', piece: 'p', model: 'm', usd_estimate: 199.95, status: 'done', run: 'other:x' })}\n`);
    const fetchImpl = jest.fn();
    const r = real(dir, { capUsd: 5, fetch: fetchImpl as any });
    expect(await r.order(call, ctx(dir))).toMatchObject({ kind: 'refused', code: 'over_night_cap' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.runSpentUsd).toBe(0);
  });

  it('refuses to spend against a ledger it cannot read', async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, 'spend.jsonl'), 'not json\n');
    const fetchImpl = jest.fn();
    expect(await real(dir, { fetch: fetchImpl as any }).order(call, ctx(dir))).toMatchObject({ kind: 'refused', code: 'ledger_unusable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('writes the reserve before the call and done after, without the key', async () => {
    const dir = tmp();
    const ledgerFile = path.join(dir, 'spend.jsonl');
    let atSend = '';
    const fetchImpl = jest.fn(async () => {
      atSend = readFileSync(ledgerFile, 'utf8');
      return new Response(Buffer.from('ID3audio'), { status: 200 });
    });
    const r = real(dir, { fetch: fetchImpl as any });
    const answer = await r.order(call, ctx(dir));
    expect(answer.kind).toBe('done');
    expect(JSON.parse(atSend.trim())).toMatchObject({ event: 'reserve', est_usd: 0.075, style_id: 'demo', style_sha: 'abc', run_id: 'r1', step: 'music', piece_key: 'music.bed', provider: 'elevenlabs', model: 'music_v1' });
    const sent = (fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((sent.headers as Record<string, string>)['xi-api-key']).toBe('sk-secret-value');
    const text = readFileSync(ledgerFile, 'utf8');
    expect(text).not.toContain('secret-value');
    expect(text.trim().split('\n').map((l) => JSON.parse(l).event)).toEqual(['reserve', 'done']);
    expect(new SpendLedger(ledgerFile).total()).toBeCloseTo(0.075);
    expect(r.runSpentUsd).toBeCloseTo(0.075);
  });

  it('keeps a reserve counted when the call fails, and releases one refused at submit', async () => {
    const dir = tmp();
    const ledger = new SpendLedger(path.join(dir, 'spend.jsonl'));
    await real(dir, { ledger, fetch: jest.fn(async () => new Response('busy', { status: 503 })) as any }).order(call, ctx(dir));
    expect(ledger.total()).toBeCloseTo(0.075);
    await real(dir, { ledger, reason: 'retry', fetch: jest.fn(async () => new Response('bad', { status: 422 })) as any }).order(call, ctx(dir));
    expect(ledger.total()).toBeCloseTo(0.075);
  });

  it('accepts a music bed priced exactly at the style budget (apple-notes: 34 s, $0.085)', async () => {
    const dir = tmp();
    const fetchImpl = jest.fn(async () => new Response(Buffer.from('ID3audio'), { status: 200 }));
    const bed = { provider: 'elevenlabs', path: '/v1/music', body: { music_length_ms: 34_000, model_id: 'music_v1' } };
    expect(await real(dir, { capUsd: 0.085, fetch: fetchImpl as any }).order(bed, ctx(dir))).toMatchObject({ kind: 'done' });
  });

  it('refuses a second run of a style that started spending meanwhile, unless given a reason', async () => {
    const dir = tmp();
    const ledger = new SpendLedger(path.join(dir, 'spend.jsonl'));
    ledger.add({ ts: 't', run_id: 'other-run', style_id: 'demo', style_sha: 'abc', step: 'music', piece_key: 'music.bed', provider: 'elevenlabs', model: 'm', est_usd: 0.01, event: 'reserve' });
    const fetchImpl = jest.fn(async () => new Response(Buffer.from('ID3audio'), { status: 200 }));
    expect(await real(dir, { ledger, fetch: fetchImpl as any }).order(call, ctx(dir))).toMatchObject({ kind: 'refused', code: 'second_real_run' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await real(dir, { ledger, reason: 'a fix', fetch: fetchImpl as any }).order(call, ctx(dir))).toMatchObject({ kind: 'done' });
  });

  it('stops at once when fal ends a job without completing it', async () => {
    const dir = tmp();
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.startsWith('https://api.fal.ai/')) return new Response(JSON.stringify({ prices: [] }));
      if (url.endsWith('/status')) return new Response(JSON.stringify({ status: 'FAILED' }));
      return new Response(JSON.stringify({ request_id: '1', status_url: 'https://queue.fal.run/x/requests/1/status', response_url: 'https://queue.fal.run/x/requests/1' }));
    });
    const answer = await real(dir, { fetch: fetchImpl as any }).order({ provider: 'fal', path: 'fal-ai/nano-banana', body: { prompt: 'x' } }, ctx(dir));
    expect(answer).toMatchObject({ kind: 'failed', code: 'provider_failed' });
    expect(fetchImpl.mock.calls.filter((c) => String(c[0]).endsWith('/status'))).toHaveLength(1);
  });

  it('refuses with no key', async () => {
    const dir = tmp();
    expect(await real(dir, { keys: {} }).order(call, ctx(dir))).toMatchObject({ kind: 'refused', code: 'no_key' });
  });

  it('sends the fal key only to fal\'s own queue origin', async () => {
    expect(isFalQueueUrl('https://queue.fal.run/x/requests/1/status')).toBe(true);
    expect(isFalQueueUrl('https://queue.fal.run.evil.example/x')).toBe(false);
    expect(isFalQueueUrl('https://queue.fal.run@evil.example/x')).toBe(false);
    expect(isFalQueueUrl('http://queue.fal.run/x')).toBe(false);
    const dir = tmp();
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.startsWith('https://api.fal.ai/v1/models/pricing')) return new Response(JSON.stringify({ prices: [{ endpoint_id: 'fal-ai/nano-banana', unit_price: 0.0398, unit: 'images', currency: 'USD' }] }));
      return new Response(JSON.stringify({ request_id: '1', status_url: 'https://queue.fal.run.evil.example/s', response_url: 'https://queue.fal.run.evil.example/r' }));
    });
    const answer = await real(dir, { fetch: fetchImpl as any }).order({ provider: 'fal', path: 'fal-ai/nano-banana', body: { prompt: 'x' } }, ctx(dir));
    expect(answer).toMatchObject({ kind: 'failed', code: 'provider_failed' });
    expect(fetchImpl.mock.calls.map((c) => String(c[0])).some((u) => u.includes('evil'))).toBe(false);
  });

  it('prices a fal call at the live list price times its units, else its own table', async () => {
    const dir = tmp();
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({ prices: [{ endpoint_id: 'fal-ai/kling-video/v3/standard/image-to-video', unit_price: 0.5, unit: 'seconds', currency: 'USD' }] })));
    const r = real(dir, { fetch: fetchImpl as any });
    const video = { provider: 'fal', path: 'fal-ai/kling-video/v3/standard/image-to-video', body: { duration: '5' } };
    expect(await r.estimate(video, ctx(dir), 'k')).toBeCloseTo(2.5);
    const down = jest.fn(async () => new Response('', { status: 503 }));
    expect(await real(dir, { fetch: down as any }).estimate(video, ctx(dir), 'k')).toBeCloseTo(0.75);
    expect(falUnits('images', { provider: 'fal', path: 'fal-ai/nano-banana', body: { num_images: 2 } }, null)).toBe(2);
    expect(falUnits('1000 tokens', video, null)).toBeNull();
    const unknown = jest.fn(async () => new Response('{}', { status: 500 }));
    expect(await real(dir, { fetch: unknown as any }).estimate({ provider: 'fal', path: 'some/model-x', body: {} }, ctx(dir), 'k')).toBeNull();
  });
});

describe('try-style real mode gates', () => {
  const style = { id: 'demo', version: '1.0.0', cost: { high_usd: 2 } };
  function fakeRun(parent: string, name: string, over: Record<string, unknown> = {}, checks = [{ code: 'a', status: 'pass' }]) {
    const dir = path.join(parent, name);
    mkdirSync(path.join(dir, 'final'), { recursive: true });
    writeFileSync(path.join(dir, 'final', 'final.mp4'), 'mp4');
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ providers: 'fake', style_id: 'demo', style_sha: 'sha1', status: 'done', ...over }));
    writeFileSync(path.join(dir, 'verdict.json'), JSON.stringify({ pass: true, checks }));
    return dir;
  }
  const gate = (parent: string, over: Partial<Parameters<typeof realGateProblems>[0]> = {}) =>
    realGateProblems({ style, styleId: 'demo', styleSha: 'sha1', out: path.join(parent, 'demo-real-1'), capUsd: 2, nightCapUsd: 200, reason: null, ledger: new SpendLedger(path.join(parent, 'spend.jsonl')), ...over });

  it('refuses without a passing stand-in run of the same style file next to the run', () => {
    const parent = tmp();
    expect(gate(parent).join()).toMatch(/No passing stand-in run/);
    fakeRun(parent, 'demo-fake-1', { style_sha: 'other' });
    fakeRun(parent, 'demo-fake-2', {}, [{ code: 'a', status: 'fail' }]);
    fakeRun(parent, 'demo-fake-3', { providers: 'real' });
    fakeRun(parent, 'demo-fake-4', { status: 'failed' });
    expect(passingFakeRuns(path.join(parent, 'demo-real-1'), 'demo', 'sha1')).toEqual([]);
    fakeRun(parent, 'demo-fake-5');
    expect(gate(parent)).toEqual([]);
  });

  it('refuses a cap above the style\'s high_usd, above $40, or with no high_usd', () => {
    const parent = tmp();
    fakeRun(parent, 'demo-fake-1');
    expect(gate(parent, { capUsd: 2.5 }).join()).toMatch(/above the style's cost.high_usd/);
    expect(gate(parent, { capUsd: 41, style: { cost: { high_usd: 100 } } }).join()).toMatch(/\$40 limit/);
    expect(gate(parent, { style: { id: 'demo' } }).join()).toMatch(/no cost.high_usd/);
    expect(gate(parent, { capUsd: null }).join()).toMatch(/needs --cap-usd/);
    expect(gate(parent, { nightCapUsd: 500 }).join()).toMatch(/no higher than 200/);
  });

  it('allows one real run per style unless a reason is given', () => {
    const parent = tmp();
    fakeRun(parent, 'demo-fake-1');
    const ledger = new SpendLedger(path.join(parent, 'spend.jsonl'));
    ledger.add({ ts: 't', run_id: 'r0', style_id: 'demo', style_sha: 'sha1', step: 'music', piece_key: 'music.bed', provider: 'elevenlabs', model: 'm', est_usd: 0.1, event: 'reserve' });
    expect(gate(parent, { ledger }).join()).toMatch(/needs --reason/);
    expect(gate(parent, { ledger, reason: 'music failed; fixed the prompt' })).toEqual([]);
    const legacy = new SpendLedger(path.join(parent, 'legacy.jsonl'));
    writeFileSync(legacy.file, `${JSON.stringify({ time: 'x', piece: 'p', model: 'm', usd_estimate: 0.1, status: 'done', run: 'demo:demo-real-1' })}\n`);
    expect(legacy.hasRealRun('demo')).toBe(true);
    expect(legacy.hasRealRun('other')).toBe(false);
  });

  it('reads only the two keys from an env file, FAL_API_KEY as FAL_KEY', () => {
    const dir = tmp();
    const file = path.join(dir, '.env');
    writeFileSync(file, 'OTHER=1\nFAL_API_KEY="fal-123"\nexport ELEVENLABS_API_KEY=el-456 # note\n');
    expect(readEnvKeys(file)).toEqual({ fal: 'fal-123', elevenlabs: 'el-456' });
    expect(fileSha(file)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('try-style line resume', () => {
  it('replays a finished piece from disk in a new process instead of ordering it again', async () => {
    const dir = tmp();
    const audio = path.join(dir, 'pieces', 'a.mp3');
    mkdirSync(path.dirname(audio), { recursive: true });
    writeFileSync(audio, 'mp3');
    const order = jest.fn(async (): Promise<ProviderAnswer> => ({ kind: 'done', file: { path: audio, mime: 'audio/mpeg' }, json: { remote: 'https://v3.fal.media/x.mp4' } }));
    const provider: Provider = { mode: 'real', order: async (_c, c) => ({ ...(await order()), json: { remote: c.mirror('https://v3.fal.media/x.mp4') } }) };
    const request = { idempotency_key: 'music.bed:h1:1', piece_key: 'music.bed', inputs_hash: 'h1abcdef01', call: { provider: 'elevenlabs', path: '/v1/music', body: {} } };
    const first = await js(post(line(provider, dir), '/pieces', request));
    await new Promise((r) => setTimeout(r, 20));
    const again = line(provider, dir);
    const second = await js(post(again, '/pieces', request));
    expect(order).toHaveBeenCalledTimes(1);
    expect(second.result).toEqual(first.result);
    expect(await (await again.fetch(second.result.file_url)).text()).toBe('mp3');
    expect(second.result.json.remote).toMatch(/^http:\/\/127\.0\.0\.1:47999\/mirror\/[a-f0-9]{24}$/);
  });
});

describe('try-style fixtures', () => {
  it('turns media ids into frozen files and asset ids into hosted files', () => {
    const root = tmp();
    mkdirSync(path.join(root, 'media'));
    writeFileSync(path.join(root, 'media', 'p.png'), 'png-bytes');
    writeFileSync(path.join(root, 'media', 'f.mp4'), 'mp4-bytes');
    writeFileSync(path.join(root, 'media', 'index.json'), JSON.stringify({ media: { 'fx-p': { file: 'media/p.png', mime: 'image/png' }, 'fx-f': { file: 'media/f.mp4', mime: 'video/mp4' } } }));
    const files = new FixtureFiles([root]);
    const body = planBody(
      { scenes: [{ id: 's1', line: null, image_asset_id: 'fx-p' }], products: [{ id: 'p', name: 'P', images: ['fx-p'] }], footage: [{ asset_id: 'fx-f', start_ms: 0, end_ms: 1000 }] },
      { aspects: ['9:16'] },
      files,
      root,
    ) as any;
    expect(files.missing).toEqual([]);
    expect(body.products[0].images[0]).toMatchObject({ url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:47999\/f\/[a-f0-9]{64}$/), bytes: 9, mime: 'image/png' });
    expect(body.scenes[0].image).toMatchObject({ ref: expect.stringMatching(/^gooseworks-file:m[a-f0-9]{20}$/), mime: 'image/png' });
    expect(Object.keys(body.footage[0].file).sort()).toEqual(['bytes', 'file_id', 'mime', 'ref', 'sha256']);
    expect(body.music).toBeNull();
    const brand = freezeBrand({ name: 'B', logo: { url: 'media/p.png', sha256: 'wrong', bytes: 9, mime: 'image/png' } }, files, root);
    expect((brand.logo as any).url).toContain('/f/');
    expect(files.problems).toEqual(['media/p.png does not match its sha256']);
  });
});

describe('try-style style folder', () => {
  // A step that sends one of the style's own files to a provider (whiteboard-explainer's
  // style_refs picture). The kit hosts only files inside the video's folder, so the runner
  // hands the kit a copy of the style under <run folder>/dev-styles/.
  const refStyle = {
    ...harnessStyle,
    id: 'ref-style',
    timeline: [{ id: 'clips', part: { id: 'clip-maker', version: '1.0.0' }, inputs: { scenes: { from: 'plan.scenes' }, style_refs: [{ asset: 'frames/ref.png' }] } }],
    assets: { fonts: [], frames: ['frames/ref.png'] },
  };
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d60000000049454e44ae426082', 'hex');

  function stylesFolder(): string {
    const dir = tmp();
    mkdirSync(path.join(dir, refStyle.id, 'frames'), { recursive: true });
    writeFileSync(path.join(dir, refStyle.id, 'style.json'), JSON.stringify(refStyle));
    writeFileSync(path.join(dir, refStyle.id, 'frames', 'ref.png'), PNG);
    return dir;
  }

  async function make(stylesDir: (runRoot: string) => string) {
    const out = tmp();
    const home = path.join(out, 'home');
    const work = path.join(out, 'line');
    mkdirSync(work, { recursive: true });
    const sent: Buffer[] = [];
    const clip = path.join(work, 'clip.mp4');
    writeFileSync(clip, 'mp4');
    const provider: Provider = {
      mode: 'fake',
      order: async (call, ctx) => {
        for (const ref of call.body.style_refs as string[]) sent.push(readFileSync(ctx.hosted(ref)!.path));
        return { kind: 'done', file: { path: clip, mime: 'video/mp4' } };
      },
    };
    const l = tryLine({
      videoId: 'try_ref-style',
      style: refStyle,
      body: { aspect: '9:16', scenes: [{ id: 's1', line: 'One line', on_screen: null, picture: null }], products: [], voice: null, music: null, cast: [], answers: {}, footage: [] },
      brand: { name: 'B', logo: null, colors: {}, fonts: {}, pronunciations: [], cta: null },
      layers: partsLock().layers,
      planFiles: new Map(),
      provider,
      tools,
      workDir: work,
      pieceLog: path.join(out, 'pieces.jsonl'),
    });
    const parts = testParts({
      clip: { inputs: { type: 'object', additionalProperties: false, required: ['scenes', 'style_refs'], properties: { scenes: { type: 'array' }, style_refs: { type: 'array', items: fileSchema('image') } } } },
      clipRun: (async (inputs: any, ctx: PartContext) => {
        const got = await ctx.line!.order({ piece: 'scene-1', provider: 'fal', path: MODEL, body: { style_refs: inputs.style_refs }, results: [{ pointer: '/file_url', name: 'scene-1.mp4', media: 'video' }] });
        writeFileSync(path.join(ctx.workDir, 'cut.mp4'), Buffer.from(got.files['scene-1.mp4'].sha256));
        return { video: await ctx.file('cut.mp4', 'video'), timeline: { duration_s: 5, width: 1080, height: 1920, fps: 30, scenes: [], speech: [] } };
      }) as LoadedPart['run'],
    });
    const client = new VideoLine({ apiBase: API, deviceId: '11111111-2222-4333-8444-555555555555', login: 'try-style-local', fetch: l.fetch, sleep: async () => undefined });
    const result = await makeVideo('try_ref-style', {
      home,
      // No parts lock, as the runner hands over: the parts folder only has to be set (the test host loads the parts).
      env: { GOOSE_KIT_PARTS_DIR: tmp(), GOOSE_KIT_STYLES_DIR: stylesDir(path.join(home, 'videos', 'try_ref-style')) },
      line: client,
      host: testHost(parts),
      log: new KitLog(() => undefined, (text) => client.redact(text)),
      environment: 'local',
      tools: harnessTools,
      sleep: async () => undefined,
      heartbeatMs: 3_600_000,
    });
    await l.settle();
    return { result, sent, log: runLogs(home, 'try_ref-style') };
  }

  it('orders a piece that sends a style file, from the copy in the run folder', async () => {
    const styles = stylesFolder();
    const original = fileSha(path.join(styles, refStyle.id, 'style.json'));
    const { result, sent, log } = await make((runRoot) => {
      const copy = stageStyle(styles, refStyle.id, runRoot);
      expect(copy).toBe(path.join(runRoot, 'dev-styles'));
      return copy;
    });
    expect(result.status).toBe('done');
    expect(log).not.toContain('outside this video');
    expect(sent).toEqual([PNG]);
    // The copy is byte for byte the style, so the sha the runner records is the original file's.
    expect(fileSha(path.join(styles, refStyle.id, 'style.json'))).toBe(original);
  });

  it('without the copy, the kit refuses to send a file from outside the video', async () => {
    const styles = stylesFolder();
    const { result, sent, log } = await make(() => styles);
    expect(result.status).not.toBe('done');
    expect(log).toContain('a file outside this video was named in a payload');
    expect(sent).toEqual([]);
  });

  it('copies afresh each run, so an edited style is what the kit reads', () => {
    const styles = stylesFolder();
    const runRoot = path.join(tmp(), 'videos', 'try_ref-style');
    stageStyle(styles, refStyle.id, runRoot);
    writeFileSync(path.join(styles, refStyle.id, 'frames', 'ref.png'), 'edited');
    stageStyle(styles, refStyle.id, runRoot);
    expect(readFileSync(path.join(runRoot, 'dev-styles', refStyle.id, 'frames', 'ref.png'), 'utf8')).toBe('edited');
    expect(() => stageStyle(styles, 'no-such-style', runRoot)).toThrow(/No style no-such-style/);
    for (const bad of ['..', '../x', 'a/b', '', '.hidden']) expect(() => stageStyle(styles, bad, runRoot)).toThrow(/Bad style name/);
  });
});
