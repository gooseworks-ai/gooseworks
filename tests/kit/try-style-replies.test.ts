// scripts/try-style: every stand-in answer has exactly the shape the private
// line gives the kit for that model (MASTER-PLAN §4.8), and real mode turns the
// providers' replies into those shapes too: the /v1/music/detailed multipart
// reply, the /with-timestamps base64 split, and payload files put in fal
// storage instead of being named by a link fal can't fetch.
//
// The contracts in fixtures/try-style-replies/ are copied from the W0-62
// recordings (fal's OpenAPI schemas, ElevenLabs' public OpenAPI, the line's own
// code). One test per model: a new model gets a fixture and a test.
import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { API, tryLine } from '../../scripts/try-style/line';
import { FakeProvider, parseMultipart, RealProvider, songReply, SpendLedger, type Provider, type RealOptions } from '../../scripts/try-style/providers';

jest.setTimeout(180_000);

const FIX = path.join(__dirname, 'fixtures', 'try-style-replies');
const fixture = (name: string) => JSON.parse(readFileSync(path.join(FIX, name), 'utf8'));
const CONTRACTS = readdirSync(FIX)
  .filter((f) => f.endsWith('.json') && !f.endsWith('.headers.json'))
  .sort();

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'try-replies-'));
const tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', drawtext: false, font: null };
const style = { id: 'demo', version: '1.0.0', timeline: [], layers: { brand: false, captions: false, sound: true, check: true }, duration: { min_seconds: 1, max_seconds: 9 }, aspects: ['9:16'] };
const js = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

function line(provider: Provider, dir: string, realFetch?: typeof fetch) {
  return tryLine({
    videoId: 'try_demo',
    style,
    body: { aspect: '9:16', scenes: [{ id: 's1', line: 'Meet the jacket that packs into its own pocket.' }] },
    brand: { name: 'B' },
    layers: { check: { id: 'check-layer', version: '1.2.0' } },
    planFiles: new Map(),
    provider,
    tools,
    workDir: dir,
    pieceLog: path.join(dir, 'pieces.jsonl'),
    realFetch,
  });
}
type Line = ReturnType<typeof line>;
const post = (l: Line, route: string, body?: unknown) => l.fetch(`${API}/v1/video-line/try_demo${route}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

/** Hosts a local file the way the kit does, and returns its `gooseworks-file:` ref. */
async function host(l: Line, file: string, mime: string): Promise<string> {
  const slot = await js(post(l, '/files', { sha256: 'x', bytes: 1, content_type: mime, filename: path.basename(file) }));
  await l.fetch(slot.put.url, { method: 'PUT', body: readFileSync(file) });
  return (await js(post(l, `/files/${slot.file_id}/done`))).ref;
}

/** Keys whose numbers are whole in the contract (ms, bytes, pixels, seeds). */
const WHOLE = new Set(['start_ms', 'end_ms', 'duration_ms', 'file_size', 'width', 'height', 'seed']);

/**
 * Where `got` differs in shape from the contract's `want`: the same keys in
 * the same order, the same JSON types, null where the contract has null,
 * whole numbers where the contract's are, and the same `content_type`.
 * Array items are each checked against the contract's first item.
 */
function shapeProblems(want: unknown, got: unknown, at = '', key = ''): string[] {
  if (want === null) return got === null ? [] : [`${at || '/'}: the contract has null, got ${JSON.stringify(got)?.slice(0, 40)}`];
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return [`${at}: the contract has an array`];
    if (want.length && !got.length) return [`${at}: the contract has items, got none`];
    return want.length ? got.flatMap((g, i) => shapeProblems(want[0], g, `${at}/${i}`, key)) : [];
  }
  if (typeof want === 'object') {
    if (!got || typeof got !== 'object' || Array.isArray(got)) return [`${at || '/'}: the contract has an object`];
    const wk = Object.keys(want as object);
    const gk = Object.keys(got as object);
    if (wk.join(',') !== gk.join(',')) return [`${at || '/'}: keys ${JSON.stringify(gk)}, the contract has ${JSON.stringify(wk)}`];
    return wk.flatMap((k) => shapeProblems((want as any)[k], (got as any)[k], `${at}/${k}`, k));
  }
  if (typeof want !== typeof got) return [`${at}: the contract has a ${typeof want}, got ${JSON.stringify(got)}`];
  if (typeof want === 'number' && WHOLE.has(key) && !Number.isInteger(got)) return [`${at}: the contract has a whole number, got ${got}`];
  if (key === 'content_type' && want !== got) return [`${at}: content_type ${got}, the contract has ${want}`];
  return [];
}

/** The value a JSON pointer names in `doc`. */
const atPointer = (doc: unknown, pointer: string): unknown =>
  pointer
    .split('/')
    .slice(1)
    .reduce((v: any, k) => (v == null ? undefined : v[k.replace(/~1/g, '/').replace(/~0/g, '~')]), doc);

/** The contract's example request with each example link swapped for a hosted file. */
function withRefs(value: unknown, refs: { image: string; audio: string }): unknown {
  if (typeof value === 'string' && value.startsWith('https://example.invalid/')) return value.endsWith('.mp3') ? refs.audio : refs.image;
  if (Array.isArray(value)) return value.map((v) => withRefs(v, refs));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withRefs(v, refs)]));
  return value;
}

/** The call a part makes for a contract: fal by endpoint id, ElevenLabs by path. */
function callFor(c: any, refs: { image: string; audio: string }) {
  const p = c.provider === 'fal' ? c.path : String(c.path).replace(/^POST\s+/, '').replace('{voice_id}', 'voice123');
  return { provider: c.provider, path: p, body: withRefs(c.request, refs) as Record<string, unknown> };
}

// The stand-ins and these tests make media with the ffmpeg on PATH. CI's `check`
// job has none, so they skip there; the `maker` job installs it and runs them.
const onPath = (name: string): boolean => spawnSync('which', [name], { encoding: 'utf8' }).status === 0;
const withFfmpeg = onPath('ffmpeg') && onPath('ffprobe') ? describe : describe.skip;

let media: { dir: string; png: string; mp3: string };
beforeAll(() => {
  if (!onPath('ffmpeg')) return;
  const dir = tmp();
  const png = path.join(dir, 'ref.png');
  const mp3 = path.join(dir, 'line.mp3');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=288x512', '-frames:v', '1', png]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=220:d=2.5', '-c:a', 'libmp3lame', '-b:a', '64k', mp3]);
  media = { dir, png, mp3 };
});

withFfmpeg('try-style stand-ins answer in the contract shape (one test per model)', () => {
  it('has a contract for every model in MASTER-PLAN §4.8', () => {
    expect(CONTRACTS).toHaveLength(20);
  });

  it.each(CONTRACTS)('%s', async (name) => {
    const c = fixture(name);
    const dir = tmp();
    const l = line(new FakeProvider(), dir);
    const refs = { image: await host(l, media.png, 'image/png'), audio: await host(l, media.mp3, 'audio/mpeg') };
    const answer = await js(post(l, '/pieces', { idempotency_key: `${name}:1`, piece_key: 'step.piece', inputs_hash: `h${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}`, call: callFor(c, refs) }));
    expect(answer.status).toBe('done');
    expect(shapeProblems(c.answer, answer.result)).toEqual([]);
    // The file the part's pointer names is served, and is not empty.
    if (c.pointer) {
      const url = atPointer(answer.result, c.pointer);
      expect(typeof url).toBe('string');
      const res = await l.fetch(url as string);
      expect(res.status).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } else {
      // Whisper: no file; the part reads the word chunks.
      expect(answer.result.json.chunks.length).toBeGreaterThan(0);
    }
    if (c.words_path) expect((atPointer(answer.result, c.words_path) as unknown[]).length).toBeGreaterThan(0);
  });

  it('notices a shape that drifts from the contract', () => {
    const want = { json: { video: { url: 'u', content_type: 'video/mp4', file_name: 'f', file_size: 1 } } };
    expect(shapeProblems(want, { json: { video: { url: 'u', content_type: 'video/mp4', file_name: 'f', file_size: 1 }, seed: 1 } })).toHaveLength(1);
    expect(shapeProblems(want, { json: { video: { url: 'u', content_type: 'video/mp4', file_name: 'f', file_size: 1.5 } } })).toHaveLength(1);
    expect(shapeProblems({ json: { words: [{ start_ms: 1 }] } }, { json: { words: [] } })).toHaveLength(1);
    expect(shapeProblems({ a: null }, { a: 0 })).toHaveLength(1);
  });
});

/** The loudest sample of an audio file, in dB (-Infinity for digital zero). */
function maxVolumeDb(file: string): number {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-inf|-?[\d.]+) dB/.exec(r.stderr);
  if (!m) throw new Error(`volumedetect printed no max_volume: ${r.stderr.slice(-300)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

withFfmpeg('try-style stand-ins: what can be heard', () => {
  // In a song style (song-driven-music-video, stopmotion-pack-film) the song is the only sound,
  // and the check layer fails `sound` on a silent track. A music bed sits under a voice, which the check judges instead.
  it('makes the song stand-in audible and keeps the music bed silent', async () => {
    const l = line(new FakeProvider(), tmp());
    const fileOf = async (name: string) => {
      const c = fixture(name);
      const answer = await js(post(l, '/pieces', { idempotency_key: `${name}:loud`, piece_key: 'music.track', inputs_hash: `h${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}loud`, call: callFor(c, { image: '', audio: '' }) }));
      expect(answer.status).toBe('done');
      const file = path.join(tmp(), 'track.mp3');
      writeFileSync(file, Buffer.from(await (await l.fetch(answer.result.file_url)).arrayBuffer()));
      return file;
    };
    expect(maxVolumeDb(await fileOf('elevenlabs-music-detailed.json'))).toBeGreaterThan(-40);
    // mp3 silence decodes to about -91 dB, not digital zero.
    expect(maxVolumeDb(await fileOf('elevenlabs-music.json'))).toBeLessThan(-60);
  });
});

// ---------------------------------------------------------------------------
// Real mode, with every provider stubbed: no network, no key, no spend.
// ---------------------------------------------------------------------------

const KEY = 'fal-secret-value';
const ELKEY = 'sk-secret-value';
function real(dir: string, fetchImpl: jest.Mock, over: Partial<RealOptions> = {}) {
  return new RealProvider({
    capUsd: 5,
    nightCapUsd: 200,
    ledger: new SpendLedger(path.join(dir, 'spend.jsonl')),
    run_id: 'r1',
    style_id: 'demo',
    style_sha: 'abc',
    keys: { fal: KEY, elevenlabs: ELKEY },
    fetch: fetchImpl as any,
    sleep: async () => undefined,
    ...over,
  });
}
const headersOf = (init: any): Record<string, string> => (init?.headers ?? {}) as Record<string, string>;
const sentWithKey = (calls: unknown[][], key: string) =>
  calls.filter((c) => Object.values(headersOf(c[1])).some((v) => String(v).includes(key))).map((c) => new URL(String(c[0])).origin);

withFfmpeg('try-style real mode: /v1/music/detailed', () => {
  const headers = fixture('elevenlabs-music-detailed.multipart.headers.json');
  const bytes = readFileSync(path.join(FIX, 'elevenlabs-music-detailed.multipart'));
  const contract = fixture('elevenlabs-music-detailed.json');

  it('parses the multipart reply into the JSON part verbatim and the audio part', () => {
    const parts = parseMultipart(headers.content_type, bytes)!;
    expect(parts.map((p) => p.headers['content-type'])).toEqual(['application/json', 'audio/mpeg']);
    const song = songReply(headers.content_type, bytes)!;
    expect(song.json).toEqual(contract.answer.json);
    expect(song.audio.bytes.length).toBe(headers.audio_part_bytes);
    expect(song.audio.mime).toBe('audio/mpeg');
  });

  it('finds the parts by type, not order, with LF line ends too; refuses a reply missing one', () => {
    const json = JSON.stringify(contract.answer.json);
    const lf = Buffer.from(`--b1\nContent-Type: audio/mpeg\nContent-Disposition: attachment; filename="s.mp3"\n\nID3abc\n--b1\nContent-Type: application/json; charset=utf-8\n\n${json}\n--b1--\n`);
    const song = songReply('multipart/mixed; boundary="b1"', lf)!;
    expect(song.json).toEqual(contract.answer.json);
    expect(song.audio.bytes.toString()).toBe('ID3abc');
    const noAudio = Buffer.from(`--b1\r\nContent-Type: application/json\r\n\r\n${json}\r\n--b1--\r\n`);
    expect(songReply('multipart/mixed; boundary=b1', noAudio)).toBeNull();
    expect(songReply('application/json', Buffer.from(json))).toBeNull();
  });

  it('reads replies the way the line does: no boundary parameter, a +json part, an audio/mp4 part', () => {
    const json = JSON.stringify(contract.answer.json);
    const body = Buffer.from(`--zz9\r\nContent-Type: application/vnd.song+json\r\n\r\n${json}\r\n--zz9\r\nContent-Type: audio/mp4\r\n\r\nM4Abytes\r\n--zz9--\r\n`);
    const song = songReply('multipart/mixed', body)!;
    expect(song.json).toEqual(contract.answer.json);
    expect(song.audio).toMatchObject({ mime: 'audio/mp4', ext: 'm4a' });
    expect(song.audio.bytes.toString()).toBe('M4Abytes');
    // An audio part's type is kept as sent, as the line keeps it.
    const mp3 = Buffer.from(`--zz9\nContent-Type: application/json\n\n${json}\n--zz9\nContent-Type: audio/mp3\n\nID3\n--zz9--\n`);
    expect(songReply('multipart/mixed; boundary=zz9', mp3)!.audio).toMatchObject({ mime: 'audio/mp3', ext: 'mp3' });
  });

  it('refuses, in both modes, every song the line refuses, before anything is reserved or sent', async () => {
    const plan = contract.request.composition_plan;
    const bad: Array<[string, string, Record<string, unknown>]> = [
      ['a query on the path', '/v1/music/detailed?output_format=mp3_44100_128', contract.request],
      ['a prompt beside the plan', '/v1/music/detailed', { ...contract.request, prompt: 'a song' }],
      ['force_instrumental beside the plan', '/v1/music/detailed', { ...contract.request, force_instrumental: false }],
      ['no sections (a music_v2 chunks plan)', '/v1/music/detailed', { ...contract.request, composition_plan: { chunks: [{ text: 'la', duration_ms: 8000 }] } }],
      ['a section under 3 s', '/v1/music/detailed', { ...contract.request, composition_plan: { ...plan, sections: [{ ...plan.sections[0], duration_ms: 2999 }] } }],
      ['a fractional section', '/v1/music/detailed', { ...contract.request, composition_plan: { ...plan, sections: [{ ...plan.sections[0], duration_ms: 8000.5 }] } }],
    ];
    for (const [why, p, body] of bad) {
      const dir = tmp();
      const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }));
      const realAnswer = await real(dir, fetchImpl).order({ provider: 'elevenlabs', path: p, body }, ctxFor(dir));
      expect([why, realAnswer.kind]).toEqual([why, expect.stringMatching(/^(failed|refused)$/)]);
      expect([why, fetchImpl.mock.calls.length]).toEqual([why, 0]);
      expect(existsSync(path.join(dir, 'spend.jsonl')) ? readFileSync(path.join(dir, 'spend.jsonl'), 'utf8').trim() : '').toBe('');
      const fakeAnswer = await new FakeProvider().order({ provider: 'elevenlabs', path: p, body }, ctxFor(dir) as any);
      expect([why, fakeAnswer.kind]).toEqual([why, expect.stringMatching(/^(failed|refused)$/)]);
    }
  });

  it('forwards the call and hands the kit {json, file_url} in the contract shape', async () => {
    const dir = tmp();
    const fetchImpl = jest.fn(async () => new Response(bytes, { status: 200, headers: { 'content-type': headers.content_type, ...headers.headers } }));
    const l = line(real(dir, fetchImpl), dir);
    const call = { provider: 'elevenlabs', path: '/v1/music/detailed', body: contract.request };
    const answer = await js(post(l, '/pieces', { idempotency_key: 'song:1', piece_key: 'song.track', inputs_hash: 'hsong00001', call }));
    expect(answer.status).toBe('done');
    expect(shapeProblems(contract.answer, answer.result)).toEqual([]);
    expect(answer.result.json).toEqual(contract.answer.json);
    expect((await (await l.fetch(answer.result.file_url)).arrayBuffer()).byteLength).toBe(headers.audio_part_bytes);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/music/detailed');
    expect(JSON.parse(String(init.body))).toEqual(contract.request);
    const ledger = readFileSync(path.join(dir, 'spend.jsonl'), 'utf8');
    expect(ledger.trim().split('\n').map((x) => JSON.parse(x).event)).toEqual(['reserve', 'done']);
    // Two 8 s sections at $0.15 a minute.
    expect(JSON.parse(ledger.split('\n')[0]).est_usd).toBeCloseTo(0.04);
    expect(ledger).not.toContain('secret-value');
  });

  it('refuses a plan sent with music_length_ms before anything is reserved or sent', async () => {
    const dir = tmp();
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }));
    const answer = await real(dir, fetchImpl).order({ provider: 'elevenlabs', path: '/v1/music/detailed', body: { ...contract.request, music_length_ms: 16000 } }, ctxFor(dir));
    expect(answer).toMatchObject({ kind: 'failed', code: 'provider_rejected', next: 'stop' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(existsSync(path.join(dir, 'spend.jsonl')) ? readFileSync(path.join(dir, 'spend.jsonl'), 'utf8').trim() : '').toBe('');
  });

  it('fails the piece when the reply is not the two-part song', async () => {
    const dir = tmp();
    const fetchImpl = jest.fn(async () => new Response(Buffer.from('ID3audio'), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    const answer = await real(dir, fetchImpl).order({ provider: 'elevenlabs', path: '/v1/music/detailed', body: contract.request }, ctxFor(dir));
    expect(answer).toMatchObject({ kind: 'failed', code: 'provider_failed' });
  });
});

function ctxFor(dir: string, hosted: Record<string, { path: string; mime: string }> = {}) {
  return {
    piece_key: 'step.piece',
    idempotency_key: 'k1',
    hosted: (ref: string) => {
      const f = hosted[ref];
      if (!f) return null;
      const data = readFileSync(f.path);
      return { ...f, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    },
    planLines: [],
    workDir: dir,
    publish: (f: string) => f,
    mirror: (u: string) => `${API}/mirror/${Buffer.from(u).toString('hex').slice(0, 24)}`,
    tools,
  };
}

withFfmpeg('try-style real mode: /with-timestamps', () => {
  it('splits the base64 audio from the alignment, exactly as the line does', async () => {
    const dir = tmp();
    const contract = fixture('elevenlabs-tts-with-timestamps.json');
    const reply = { ...contract.provider_reply, audio_base64: Buffer.from('ID3speech').toString('base64') };
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } }));
    const l = line(real(dir, fetchImpl), dir);
    const call = { provider: 'elevenlabs', path: '/v1/text-to-speech/voice123/with-timestamps', body: contract.request };
    const answer = await js(post(l, '/pieces', { idempotency_key: 'tts:1', piece_key: 'voice.line', inputs_hash: 'htts000001', call }));
    expect(answer.status).toBe('done');
    expect(shapeProblems(contract.answer, answer.result)).toEqual([]);
    expect(answer.result.json).toEqual(contract.answer.json);
    expect(await (await l.fetch(answer.result.file_url)).text()).toBe('ID3speech');
  });
});

withFfmpeg('try-style real mode: payload files go to fal storage', () => {
  const contract = fixture('openai--gpt-image-2--edit.json');
  const endpoint = 'openai/gpt-image-2/edit';

  /** A stubbed fal: price list, storage initiate, the signed upload, and the queue. */
  function stubFal(over: { initiate?: () => Response; put?: () => Response } = {}) {
    const puts: Array<{ url: string; bytes: Buffer; headers: Record<string, string> }> = [];
    let submitted: any = null;
    let n = 0;
    const fetchImpl = jest.fn(async (input: string, init: any = {}) => {
      const url = String(input);
      if (url.startsWith('https://api.fal.ai/v1/models/pricing')) return new Response(JSON.stringify({ prices: [{ endpoint_id: endpoint, unit_price: 0.2, unit: 'images', currency: 'USD' }] }));
      if (url === 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3') {
        if (over.initiate) return over.initiate();
        const { file_name } = JSON.parse(init.body);
        n += 1;
        return new Response(JSON.stringify({ upload_url: `https://upload.storage.example/put/${n}?signature=abc`, file_url: `https://v3b.fal.media/files/b/${n}/${file_name}` }));
      }
      if (url.startsWith('https://upload.storage.example/')) {
        puts.push({ url, bytes: Buffer.from(init.body), headers: headersOf(init) });
        return over.put ? over.put() : new Response(null, { status: 200 });
      }
      if (url === `https://queue.fal.run/${endpoint}`) {
        submitted = JSON.parse(init.body);
        return new Response(JSON.stringify({ request_id: '1', status_url: `https://queue.fal.run/${endpoint}/requests/1/status`, response_url: `https://queue.fal.run/${endpoint}/requests/1` }));
      }
      if (url.endsWith('/status')) return new Response(JSON.stringify({ status: 'COMPLETED' }));
      if (url === `https://queue.fal.run/${endpoint}/requests/1`) return new Response(JSON.stringify(contract.answer.json));
      throw new Error(`unexpected ${url}`);
    });
    return { fetchImpl, puts, submitted: () => submitted };
  }

  it('uploads each hosted file once, sends fal its storage links, and keeps the key off the signed upload link', async () => {
    const dir = tmp();
    const second = path.join(dir, 'product.png');
    writeFileSync(second, 'PNGproduct');
    const hosted = { 'gooseworks-file:cast': { path: media.png, mime: 'image/png' }, 'gooseworks-file:product': { path: second, mime: 'image/png' } };
    const fal = stubFal();
    const body = { ...contract.request, image_urls: ['gooseworks-file:cast', 'gooseworks-file:product', 'gooseworks-file:cast'] };
    const answer = await real(dir, fal.fetchImpl).order({ provider: 'fal', path: endpoint, body }, ctxFor(dir, hosted));
    expect(answer.kind).toBe('done');
    expect(fal.puts).toHaveLength(2);
    expect(fal.puts[0].bytes.equals(readFileSync(media.png))).toBe(true);
    expect(fal.puts[0].headers['content-type']).toBe('image/png');
    expect(fal.submitted().image_urls).toEqual(['https://v3b.fal.media/files/b/1/ref.png', 'https://v3b.fal.media/files/b/2/product.png', 'https://v3b.fal.media/files/b/1/ref.png']);
    expect(JSON.stringify(fal.submitted())).not.toMatch(/data:|gooseworks-file|127\.0\.0\.1/);
    expect([...new Set(sentWithKey(fal.fetchImpl.mock.calls as unknown[][], KEY))].sort()).toEqual(['https://api.fal.ai', 'https://queue.fal.run', 'https://rest.fal.ai']);
    // The answer keeps fal's shape; its links point at the local line.
    expect(shapeProblems(contract.answer.json, (answer as any).json)).toEqual([]);
    expect((answer as any).json.images[0].url.startsWith(`${API}/mirror/`)).toBe(true);
    const ledger = readFileSync(path.join(dir, 'spend.jsonl'), 'utf8');
    expect(ledger).not.toMatch(/secret-value|signature|upload\.storage/);
  });

  it('refuses a payload that names a link on this computer, before anything is reserved or sent', async () => {
    const dir = tmp();
    const fal = stubFal();
    const answer = await real(dir, fal.fetchImpl).order({ provider: 'fal', path: endpoint, body: { ...contract.request, image_urls: [`${API}/out/x.png`] } }, ctxFor(dir));
    expect(answer).toMatchObject({ kind: 'refused', code: 'payload_not_sendable' });
    expect(fal.fetchImpl.mock.calls.map((c) => String(c[0])).some((u) => u.startsWith('https://queue.fal.run') || u.startsWith('https://rest.fal.ai'))).toBe(false);
    expect(new SpendLedger(path.join(dir, 'spend.jsonl')).total()).toBe(0);
  });

  it('fails (to be retried) without reserving when fal storage will not take the file, and uploads again on the retry', async () => {
    const dir = tmp();
    const hosted = { 'gooseworks-file:cast': { path: media.png, mime: 'image/png' } };
    let fail = true;
    const fal = stubFal({ put: () => new Response(null, { status: fail ? 503 : 200 }) });
    const r = real(dir, fal.fetchImpl);
    const call = { provider: 'fal', path: endpoint, body: { ...contract.request, image_urls: ['gooseworks-file:cast'] } };
    expect(await r.order(call, ctxFor(dir, hosted))).toMatchObject({ kind: 'failed', code: 'provider_failed', next: 'retry' });
    expect(fal.submitted()).toBeNull();
    expect(new SpendLedger(path.join(dir, 'spend.jsonl')).total()).toBe(0);
    expect(r.runSpentUsd).toBe(0);
    fail = false;
    expect(await r.order(call, ctxFor(dir, hosted))).toMatchObject({ kind: 'done' });
    expect(fal.puts).toHaveLength(2);
  });

  it('never sends a non-https storage link to fal', async () => {
    const dir = tmp();
    const fal = stubFal({ initiate: () => new Response(JSON.stringify({ upload_url: 'http://upload.storage.example/x', file_url: 'https://v3b.fal.media/x.png' })) });
    const answer = await real(dir, fal.fetchImpl).order(
      { provider: 'fal', path: endpoint, body: { ...contract.request, image_urls: ['gooseworks-file:cast'] } },
      ctxFor(dir, { 'gooseworks-file:cast': { path: media.png, mime: 'image/png' } }),
    );
    expect(answer).toMatchObject({ kind: 'failed', next: 'retry' });
    expect(fal.puts).toHaveLength(0);
    expect(fal.submitted()).toBeNull();
  });
});
