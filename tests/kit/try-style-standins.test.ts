import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { FakeProvider, type ProviderContext, type ProviderAnswer } from '../../scripts/try-style/providers';
import { fakeTakeKeysFor, type FakeTake } from '../../scripts/try-style/fake-takes';

const available = spawnSync('ffmpeg', ['-version']).status === 0;
const mediaTest = available ? it : it.skip;
const dir = mkdtempSync(path.join(os.tmpdir(), 'standin-quality-'));
function context(key: string, take?: FakeTake): ProviderContext {
  return { piece_key: key, idempotency_key: key, planLines: ['Hello there.', 'Goodbye.'], workDir: dir,
    hosted: () => null, publish: (f) => f, mirror: (f) => f,
    tools: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', drawtext: false, font: null },
    ...(take ? { fakeTake: async () => take } : {}) };
}
function video(answer: ProviderAnswer): string {
  if (answer.kind !== 'done') throw new Error(JSON.stringify(answer));
  return (answer.json as any).video.url;
}
function decode(file: string, args: string[]) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, ...args, '-'], { maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return r.stdout;
}
function rms(buf: Buffer) {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4) sum += buf.readFloatLE(i) ** 2;
  return Math.sqrt(sum / (buf.length / 4));
}
mediaTest('different pieces have independently measured distinct opening pictures, stable on replay', async () => {
  const provider = new FakeProvider();
  const call = { provider: 'fal', path: 'fal-ai/veo3.1/fast/image-to-video', body: { duration: '1', resolution: '360p', aspect_ratio: '9:16', generate_audio: false } };
  const a = video(await provider.order(call, context('clips.s1')));
  const b = video(await provider.order(call, context('clips.s2')));
  const frame = (f: string) => decode(f, ['-vf', 'scale=64:64,format=gray', '-frames:v', '1', '-f', 'rawvideo']);
  const x = frame(a), y = frame(b);
  const difference = x.reduce((sum, v, i) => sum + Math.abs(v - y[i]), 0) / x.length;
  expect(difference).toBeGreaterThan(6);
  const again = video(await provider.order(call, context('clips.s1')));
  expect(frame(again)).toEqual(x);
});
mediaTest('native take audio and Whisper words share actual beat windows, with a quiet bed in silent beats', async () => {
  const take: FakeTake = { offset: 0, seconds: 4, beats: [
    { line: 'Hello there.', start: 0, end: 1.5 }, { line: null, start: 1.5, end: 2.5 }, { line: 'Goodbye.', start: 2.5, end: 4 },
  ] };
  const provider = new FakeProvider();
  const file = video(await provider.order({ provider: 'fal', path: 'bytedance/seedance-2.0/reference-to-video', body: { duration: '4', resolution: '360p', aspect_ratio: '9:16', generate_audio: true } }, context('takes.take-t1', take)));
  const samples = (start: number, end: number) => decode(file, ['-vn', '-af', `atrim=start=${start}:end=${end}`, '-ar', '48000', '-ac', '1', '-f', 'f32le']);
  const quiet = 20 * Math.log10(rms(samples(1.8, 2.2)));
  const spoken = 20 * Math.log10(rms(samples(0.35, 0.55)));
  expect(quiet).toBeGreaterThan(-60);
  expect(quiet).toBeLessThan(-45);
  expect(spoken - quiet).toBeGreaterThan(25);
  const ctx = context('heard.whisper');
  ctx.fakeTakeKeys = () => ['takes.take-t1'];
  ctx.hosted = () => ({ path: file, mime: 'audio/wav', bytes: 1, sha256: 'x' });
  // A resumed runner has a new provider instance and replays the completed video piece.
  const heard = await new FakeProvider().order({ provider: 'fal', path: 'fal-ai/whisper', body: { audio_url: 'gooseworks-file:audio' } }, ctx);
  if (heard.kind !== 'done') throw new Error(JSON.stringify(heard));
  const chunks = (heard.json as any).chunks;
  expect(chunks.map((c: any) => c.text.trim())).toEqual(['Hello', 'there.', 'Goodbye.']);
  expect(chunks[0].timestamp[0]).toBeGreaterThanOrEqual(0);
  expect(chunks[1].timestamp[1]).toBeLessThan(1.5);
  expect(chunks[2].timestamp[0]).toBeGreaterThan(2.5);
  expect(chunks[2].timestamp[1]).toBeLessThan(4);
});

mediaTest('an all-silent native take produces only a quiet ambience bed', async () => {
  const take: FakeTake = { offset: 0, seconds: 4, beats: [{ line: null, start: 0, end: 4 }] };
  const provider = new FakeProvider();
  const file = video(await provider.order({ provider: 'fal', path: 'bytedance/seedance-2.0/reference-to-video', body: { duration: '4', resolution: '360p', generate_audio: true } }, context('silent.take', take)));
  const db = 20 * Math.log10(rms(decode(file, ['-vn', '-ar', '48000', '-ac', '1', '-f', 'f32le'])));
  expect(db).toBeGreaterThan(-60);
  expect(db).toBeLessThan(-45);
  const ctx = context('heard.silent'); ctx.planLines = []; ctx.fakeTakeKeys = () => ['silent.take'];
  ctx.hosted = () => ({ path: file, mime: 'audio/wav', bytes: 1, sha256: 'x' });
  const heard = await new FakeProvider().order({ provider: 'fal', path: 'fal-ai/whisper', body: { audio_url: 'gooseworks-file:a' } }, ctx);
  expect(heard.kind === 'done' && (heard.json as any).chunks).toEqual([]);
});
mediaTest('changed-window replay selects current piece identity and excludes superseded sidecars', async () => {
  const provider = new FakeProvider();
  const call = { provider: 'fal', path: 'bytedance/seedance-2.0/reference-to-video', body: { duration: '4', resolution: '360p', generate_audio: true } };
  const old = context('replay.take', { offset: 0, seconds: 4, beats: [{ line: 'Hello there.', start: 0, end: 1.5 }] }); old.idempotency_key = 'old-inputs';
  await provider.order(call, old);
  const current = context('replay.take', { offset: 0, seconds: 4, beats: [{ line: null, start: 0, end: 2.5 }, { line: 'Hello there.', start: 2.5, end: 4 }] }); current.idempotency_key = 'new-inputs';
  const file = video(await provider.order(call, current));
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'active-fake-takes-'));
  mkdirSync(path.join(runRoot, 'steps', 'takes'), { recursive: true });
  writeFileSync(path.join(runRoot, 'run.json'), JSON.stringify({ steps: { takes: { status: 'done' } } }));
  writeFileSync(path.join(runRoot, 'steps', 'takes', 'record.json'), JSON.stringify({ status: 'done', part: { id: 'video-seedance-2' }, inputs: { mode: 'takes' }, pieces: [{ idempotency_key: 'new-inputs' }] }));
  const ctx = context('heard.replay'); ctx.planLines = ['Hello there.']; ctx.fakeTakeKeys = () => fakeTakeKeysFor(runRoot);
  ctx.hosted = () => ({ path: file, mime: 'audio/wav', bytes: 1, sha256: 'x' });
  const heard = await new FakeProvider().order({ provider: 'fal', path: 'fal-ai/whisper', body: { audio_url: 'gooseworks-file:a' } }, ctx);
  if (heard.kind !== 'done') throw new Error(JSON.stringify(heard));
  const chunks = (heard.json as any).chunks;
  expect(chunks.map((c: any) => c.text.trim())).toEqual(['Hello', 'there.']);
  expect(chunks[0].timestamp[0]).toBeGreaterThan(2.5);
  expect(chunks[1].timestamp[1]).toBeLessThan(4);
});
