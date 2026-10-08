/**
 * The parts loader's rules: a part runs only when every file matches the
 * video's lock, its models and kit range match the lock and the published
 * index, and its version is not withdrawn. A refused part is never imported.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PartsLock } from '../../../src/kit/part-interface';
import { createPartLoader, PartLoadError } from '../../../src/kit/parts/loader';

const RAW = 'https://raw.example.test/goose-skills/video-merged';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const manifest = {
  interface: 1,
  id: 'music-elevenlabs',
  version: '1.2.0',
  kind: 'generate_music',
  title: 'Music',
  summary: 'Makes a music bed.',
  runtime: 'node',
  entry: 'part.mjs',
  files: ['part.mjs', 'assets/fade.json'],
  kit: '>=1.0.0 <2.0.0',
  needs: { browser: false, ffmpeg: true, network: true, models: [{ provider: 'elevenlabs', model: 'music_v1' }] },
};
const files: Record<string, string> = {
  'part.json': JSON.stringify(manifest),
  'part.mjs': 'export async function run() { return {}; }\n',
  'assets/fade.json': '{"seconds":1.5}',
};
const hashes = () => Object.fromEntries(Object.entries(files).map(([f, body]) => [f, sha(body)]));

function lockWith(entry: Partial<{ files: Record<string, string>; models: unknown; kit: string }> = {}): PartsLock {
  return {
    lock: 1,
    interface: 1,
    video_id: 'v_123',
    style: { id: 'photo-grid-promo-card', version: '1.0.0' },
    kit_min: '1.0.0',
    parts: {
      'music-elevenlabs': { version: '1.2.0', files: hashes(), models: manifest.needs.models, kit: manifest.kit, ...entry } as never,
    },
    layers: {} as never,
  };
}

let home: string;
let index: unknown;
let withdrawn: unknown;
let requested: string[];
let importModule: jest.Mock;
/** Bytes the origin serves in place of the real file (a changed copy on the way). */
let tampered: Record<string, string>;

const fetchImpl = async (url: string) => {
  requested.push(url);
  const respond = (body: string) => new Response(body, { status: 200 });
  if (url === `${RAW}/parts/index.json`) return respond(JSON.stringify(index));
  if (url === `${RAW}/parts/withdrawn.json`) return respond(JSON.stringify(withdrawn));
  const prefix = `${RAW}/parts/music-elevenlabs/1.2.0/`;
  const file = decodeURIComponent(url.slice(prefix.length));
  if (url.startsWith(prefix) && tampered[file] !== undefined) return respond(tampered[file]);
  if (url.startsWith(prefix) && files[file] !== undefined) return respond(files[file]);
  return new Response('missing', { status: 404 });
};

function load(lock: PartsLock | null, env: NodeJS.ProcessEnv = { GOOSE_SKILLS_RAW_BASE: RAW }, dev = false) {
  const loader = createPartLoader({ kitVersion: '1.0.0', fetch: fetchImpl, importModule });
  return loader.load({ ref: { id: 'music-elevenlabs', version: '1.2.0' }, lock, dev, home, env, signal: new AbortController().signal });
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PartLoadError);
    return (error as PartLoadError).code;
  }
  throw new Error('the part was loaded');
}

const cached = (file: string) => path.join(home, 'kit', 'parts', 'music-elevenlabs', '1.2.0', file);

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-parts-'));
  index = { interface: 1, parts: [{ id: 'music-elevenlabs', version: '1.2.0', kind: 'generate_music', kit: manifest.kit, files: hashes(), models: manifest.needs.models }] };
  withdrawn = { withdrawn: [] };
  requested = [];
  tampered = {};
  importModule = jest.fn(async () => ({ run: async () => ({}) }));
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it('loads a part whose files, models and kit range all match, and drops files the lock does not list', async () => {
  fs.mkdirSync(path.dirname(cached('x')), { recursive: true });
  fs.writeFileSync(cached('planted.js'), 'not in the lock');
  const loaded = await load(lockWith());
  expect(loaded.manifest.id).toBe('music-elevenlabs');
  expect(importModule).toHaveBeenCalledTimes(1);
  expect(importModule.mock.calls[0][0]).toContain(`part.mjs?sha256=${sha(files['part.mjs'])}`);
  expect(fs.readFileSync(cached('assets/fade.json'), 'utf8')).toBe(files['assets/fade.json']);
  expect(fs.existsSync(cached('planted.js'))).toBe(false);
});

it('refuses a part whose bytes do not match the lock before it is imported, and keeps no bad file', async () => {
  tampered['part.mjs'] = 'export async function run() { steal(); }';
  expect(await refusal(load(lockWith()))).toBe('hash_mismatch');
  expect(importModule).not.toHaveBeenCalled();
  expect(fs.existsSync(cached('part.mjs'))).toBe(false);
});

it('re-checks a cached file on every load', async () => {
  await load(lockWith());
  importModule.mockClear();
  fs.writeFileSync(cached('part.mjs'), 'export async function run() { steal(); }');
  tampered['part.mjs'] = 'export async function run() { steal(); }';
  expect(await refusal(load(lockWith()))).toBe('hash_mismatch');
  expect(importModule).not.toHaveBeenCalled();
});

it('refuses a withdrawn version before downloading or importing it', async () => {
  withdrawn = { withdrawn: [{ id: 'music-elevenlabs', version: '1.2.0', reason: 'wrong loudness' }] };
  expect(await refusal(load(lockWith()))).toBe('withdrawn');
  expect(requested.filter((url) => url.includes('/music-elevenlabs/'))).toEqual([]);
  expect(importModule).not.toHaveBeenCalled();
});

it('refuses when the withdrawn list cannot be read', async () => {
  withdrawn = [{ id: 'music-elevenlabs', version: '1.2.0' }];
  expect(await refusal(load(lockWith()))).toBe('unreachable');
  expect(importModule).not.toHaveBeenCalled();
});

it.each([
  ['the lock allows other models than part.json', () => lockWith({ models: [{ provider: 'fal', model: 'fal-ai/kling-video/v2.1/pro/image-to-video' }] }), () => undefined, 'index_mismatch'],
  ['the lock and part.json disagree on models while the index agrees with the lock', () => lockWith({ models: [{ provider: 'elevenlabs', model: 'music_v2' }] }), () => {
    index = { interface: 1, parts: [{ id: 'music-elevenlabs', version: '1.2.0', kind: 'generate_music', kit: manifest.kit, files: hashes(), models: [{ provider: 'elevenlabs', model: 'music_v2' }] }] };
  }, 'manifest_mismatch'],
  ['the published index lists other files', () => lockWith(), () => {
    index = { interface: 1, parts: [{ id: 'music-elevenlabs', version: '1.2.0', kind: 'generate_music', kit: manifest.kit, files: { ...hashes(), 'part.mjs': sha('other') }, models: manifest.needs.models }] };
  }, 'index_mismatch'],
  ['the version is not in the published index', () => lockWith(), () => { index = { interface: 1, parts: [] }; }, 'not_published'],
  ['the kit range leaves this kit out', () => lockWith({ kit: '>=2.0.0' }), () => undefined, 'kit_range'],
  ['the lock does not list the part', () => ({ ...lockWith(), parts: {} }), () => undefined, 'not_locked'],
])('refuses before import when %s', async (_case, lock, arrange, code) => {
  arrange();
  expect(await refusal(load(lock()))).toBe(code);
  expect(importModule).not.toHaveBeenCalled();
});

it('loads from a local parts folder only against staging or a local server', async () => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-checkout-'));
  try {
    const dir = path.join(checkout, 'parts', 'music-elevenlabs', '1.2.0');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'part.json'), files['part.json']);
    fs.writeFileSync(path.join(dir, 'part.mjs'), files['part.mjs']);
    const prod = { GOOSE_KIT_PARTS_DIR: checkout, GOOSEWORKS_API_BASE: 'https://api.gooseworks.ai' };
    expect(await refusal(load(null, prod, true))).toBe('dev_refused');
    expect(importModule).not.toHaveBeenCalled();
    const local = { GOOSE_KIT_PARTS_DIR: checkout, GOOSEWORKS_API_BASE: 'http://localhost:5999' };
    expect((await load(null, local, true)).source).toBe('dev');
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
  }
});
