// Rules for an edited step: `video step <id> <step> --edit` takes out the exact locked part,
// `video make <id> --patched <step>` sends the edit with every hand-over, runs the edited copy for
// that step only (and every step after it again), and names the edit in the upload. A changed
// part.json, a file the part never had, or an edit of another version is refused before anything runs.
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unifiedDiff } from '../../src/kit/core/diff';
import { KitStop } from '../../src/kit/core/errors';
import type { KitHost, LoadedPart } from '../../src/kit/core/host';
import { MAX_PATCH_DIFF_CHARS, patchSha256, readPatch, takeOutStep } from '../../src/kit/core/patch';
import { runLayout } from '../../src/kit/core/paths';
import type { PartLoader, PartLoadRequest } from '../../src/kit/parts/loader';
import { VIDEO, fakeLine, lineRoute, runMake, tempHome, testHost, testParts } from './harness';

const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

const PART_JSON = '{"id":"clip-maker","version":"1.0.0"}\n';
const PART_MJS = ['export async function run(inputs, ctx) {', '  const a = 1;', '  const b = 2;', '  return join(a, b);', '}', ''].join('\n');
const lockedFiles = { 'part.json': sha(PART_JSON), 'part.mjs': sha(PART_MJS) };

/** The harness lock with real hashes for the paid clip maker. */
const withFiles = (lock: any) => ({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], files: lockedFiles } } });

/** A loader for the take-out: the published part as a verified folder. */
function publishedLoader(): PartLoader & { requests: PartLoadRequest[] } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'c1-published-'));
  writeFileSync(path.join(dir, 'part.json'), PART_JSON);
  writeFileSync(path.join(dir, 'part.mjs'), PART_MJS);
  const requests: PartLoadRequest[] = [];
  return {
    requests,
    load: async (request) => {
      requests.push(request);
      return { manifest: {} as never, dir, run: async () => ({}), source: 'published' };
    },
  };
}

async function madeOnce(home: string) {
  const line = fakeLine({ lock: withFiles });
  expect((await runMake({ home, line })).status).toBe('done');
}

async function stopped(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(KitStop);
    return (error as Error).message;
  }
  throw new Error('it went through');
}

describe('unifiedDiff', () => {
  it('writes hunks as diff -u does', () => {
    const before = Buffer.from(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', ''].join('\n'));
    const after = Buffer.from(['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', ''].join('\n'));
    expect(unifiedDiff('part.mjs', before, after)).toBe(
      ['--- a/part.mjs', '+++ b/part.mjs', '@@ -1,5 +1,5 @@', ' a', '-b', '+B', ' c', ' d', ' e', '@@ -11,3 +11,4 @@', ' k', ' l', ' m', '+n', ''].join('\n'),
    );
  });

  it('joins changes six unchanged lines apart into one hunk, and numbers an empty side by the line before', () => {
    const lines = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const changed = ['x', ...lines.slice(1, 7), 'y'];
    expect(unifiedDiff('f', Buffer.from(lines.join('\n') + '\n'), Buffer.from(changed.join('\n') + '\n')).split('\n').filter((l) => l.startsWith('@@'))).toEqual(['@@ -1,8 +1,8 @@']);
    expect(unifiedDiff('f', Buffer.from(''), Buffer.from('new\n'))).toBe('--- a/f\n+++ b/f\n@@ -0,0 +1,1 @@\n+new\n');
  });

  it('names a binary file instead of diffing it', () => {
    expect(unifiedDiff('a.bin', Buffer.from([0, 1]), Buffer.from([0, 2]))).toBe('Binary file a.bin changed\n');
  });
});

describe('video step --edit', () => {
  it('copies the exact locked part of a step into the video folder, and keeps the edits on a second take-out', async () => {
    const home = tempHome();
    await madeOnce(home);
    const loader = publishedLoader();
    const taken = await takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader });
    expect(taken).toMatchObject({ part: { id: 'clip-maker', version: '1.0.0' }, kept: false, dir: path.join(runLayout(home, VIDEO).patches, 'clips') });
    // The published part is loaded through the checked loader, against the video's own lock.
    expect(loader.requests[0]).toMatchObject({ ref: { id: 'clip-maker', version: '1.0.0' }, dev: false });
    expect(loader.requests[0].lock?.parts['clip-maker'].files).toEqual(lockedFiles);
    expect(readFileSync(path.join(taken.dir, 'part.mjs'), 'utf8')).toBe(PART_MJS);

    writeFileSync(path.join(taken.dir, 'part.mjs'), PART_MJS.replace('const b = 2;', 'const b = 3;'));
    const again = await takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader });
    expect(again.kept).toBe(true);
    expect(readFileSync(path.join(taken.dir, 'part.mjs'), 'utf8')).toContain('const b = 3;');
  });

  it('refuses a step the video does not have, and a video never made on this computer', async () => {
    const home = tempHome();
    expect(await stopped(takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader: publishedLoader() }))).toMatch(/not been made on this computer/);
    await madeOnce(home);
    expect(await stopped(takeOutStep({ home, videoId: VIDEO, step: 'nope', env: {}, loader: publishedLoader() }))).toMatch(/no step "nope".*clips/);
  });
});

describe('reading an edit', () => {
  async function takenOut() {
    const home = tempHome();
    await madeOnce(home);
    const taken = await takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader: publishedLoader() });
    return { home, dir: taken.dir, layout: runLayout(home, VIDEO) };
  }

  it('names each changed file with its locked and new hash, a diff, and a fingerprint without the diff', async () => {
    const { dir, layout } = await takenOut();
    const edited = PART_MJS.replace('const b = 2;', 'const b = 3;');
    writeFileSync(path.join(dir, 'part.mjs'), edited);
    const patch = await readPatch(layout, ['clips']);
    expect(patch.steps).toEqual([
      {
        step: 'clips',
        part: { id: 'clip-maker', version: '1.0.0' },
        files: [{ path: 'part.mjs', original_sha256: sha(PART_MJS), patched_sha256: sha(edited) }],
        diff: expect.stringContaining('-  const b = 2;\n+  const b = 3;'),
        diff_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        diff_truncated: false,
      },
    ]);
    expect(patch.sha256).toBe(patchSha256(patch.steps));
  });

  it('refuses a changed part.json, a new file, a missing file, no change, and a touched original', async () => {
    const { dir, layout } = await takenOut();
    expect(await stopped(readPatch(layout, ['clips']))).toMatch(/Nothing changed/);
    writeFileSync(path.join(dir, 'part.json'), '{"id":"clip-maker","version":"1.0.0","needs":{}}');
    expect(await stopped(readPatch(layout, ['clips']))).toMatch(/part\.json/);
    writeFileSync(path.join(dir, 'part.json'), PART_JSON);
    writeFileSync(path.join(dir, 'extra.mjs'), 'export {}');
    expect(await stopped(readPatch(layout, ['clips']))).toMatch(/remove extra\.mjs/);
    const original = path.join(layout.patches, 'clips.original', 'part.mjs');
    chmodSync(original, 0o600);
    writeFileSync(original, 'changed');
    expect(await stopped(readPatch(layout, ['clips']))).toMatch(/untouched copy/);
    expect(await stopped(readPatch(layout, ['cut']))).toMatch(/has not been taken out/);
  });

  it('cuts a non-ASCII diff on a character edge within the byte budget', async () => {
    const { dir, layout } = await takenOut();
    const long = Array.from({ length: 6000 }, (_, i) => `const s${i} = '日本語のテキスト';`).join('\n');
    writeFileSync(path.join(dir, 'part.mjs'), long);
    const [step] = (await readPatch(layout, ['clips'])).steps;
    expect(Buffer.byteLength(JSON.stringify(step.diff), 'utf8')).toBeLessThanOrEqual(MAX_PATCH_DIFF_CHARS);
    expect(step.diff).not.toContain('\uFFFD');
    expect(step.diff_truncated).toBe(true);
  });

  it('makes a damaged untouched copy again when the step is taken out again, keeping the edits', async () => {
    const { home, dir, layout } = await takenOut();
    const edited = PART_MJS.replace('const b = 2;', 'const b = 3;');
    writeFileSync(path.join(dir, 'part.mjs'), edited);
    const original = path.join(layout.patches, 'clips.original', 'part.mjs');
    chmodSync(original, 0o600);
    writeFileSync(original, 'changed');
    expect(await stopped(readPatch(layout, ['clips']))).toMatch(/untouched copy/);
    const again = await takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader: publishedLoader() });
    expect(again.kept).toBe(true);
    expect(readFileSync(path.join(dir, 'part.mjs'), 'utf8')).toBe(edited);
    expect((await readPatch(layout, ['clips'])).steps[0].files).toEqual([{ path: 'part.mjs', original_sha256: sha(PART_MJS), patched_sha256: sha(edited) }]);
  });

  it('cuts a long diff to fit, keeping the whole diff’s hash', async () => {
    const { dir, layout } = await takenOut();
    const long = Array.from({ length: 6000 }, (_, i) => `const line${i} = ${i};`).join('\n');
    writeFileSync(path.join(dir, 'part.mjs'), long);
    const [step] = (await readPatch(layout, ['clips'])).steps;
    // The cut is measured as the request carries it: UTF-8 bytes of the JSON string.
    const sent = Buffer.byteLength(JSON.stringify(step.diff), 'utf8');
    expect(sent).toBeLessThanOrEqual(MAX_PATCH_DIFF_CHARS);
    expect(sent).toBeGreaterThan(MAX_PATCH_DIFF_CHARS - 8);
    expect(step.diff_truncated).toBe(true);
    expect(step.diff_sha256).toBe(sha(unifiedDiff('part.mjs', Buffer.from(PART_MJS), Buffer.from(long))));
  });
});

describe('video make --patched', () => {
  it('sends the edit with every hand-over, runs the edited copy for that step and names the edit in the upload', async () => {
    const home = tempHome();
    await madeOnce(home);
    const taken = await takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader: publishedLoader() });
    writeFileSync(path.join(taken.dir, 'part.mjs'), PART_MJS.replace('const b = 2;', 'const b = 3;'));

    const parts = testParts();
    const requests: PartLoadRequest[] = [];
    const base = testHost(parts);
    let editedRan = 0;
    const host: KitHost = {
      browser: base.browser,
      loader: {
        load: async (request) => {
          requests.push(request);
          const part = await base.loader.load(request);
          if (!request.patched) return part;
          // The edited code joins the same clips differently: same paid requests, another cut.
          const edited: LoadedPart = {
            ...part,
            run: async (inputs, ctx) => {
              editedRan++;
              const out = (await part.run(inputs, ctx)) as { video: { path: string } };
              writeFileSync(path.join(ctx.workDir, 'cut.mp4'), Buffer.concat([readFileSync(out.video.path), Buffer.from('joined right')]));
              return { ...out, video: await ctx.file('cut.mp4', 'video') };
            },
          };
          return edited;
        },
      },
    };
    const line = fakeLine({ lock: withFiles });
    expect((await runMake({ home, line, host, patched: ['clips'] })).status).toBe('done');

    const handOvers = lineRoute(line.seen, '/device');
    expect(handOvers.length).toBeGreaterThan(0);
    const sent = handOvers[0].body.patch;
    expect(sent.steps.map((s: any) => s.step)).toEqual(['clips']);
    expect(handOvers.every((h) => h.body.patch?.sha256 === sent.sha256)).toBe(true);
    // Only the edited step loads its edited copy, with the lock's hashes and the edit's new one.
    const patched = requests.filter((r) => r.patched);
    expect(patched.map((r) => r.ref.id)).toEqual(['clip-maker']);
    expect(patched[0].patched).toEqual({ dir: taken.dir, files: { 'part.json': sha(PART_JSON), 'part.mjs': sent.steps[0].files[0].patched_sha256 } });
    // The edited step ran again; its paid requests are the same, so nothing new was ordered.
    expect(editedRan).toBe(1);
    expect(line.pieces).toHaveLength(0);
    expect(lineRoute(line.seen, '/upload')[0].body.manifest.patch).toEqual({ sha256: sent.sha256, steps: [{ step: 'clips', part: 'clip-maker@1.0.0' }] });

    // Without --patched the video runs only the published parts again.
    const plain = fakeLine({ lock: withFiles });
    await runMake({ home, line: plain });
    expect(lineRoute(plain.seen, '/device').every((h) => h.body.patch === undefined)).toBe(true);
  });

  it('stops before the hand-over when the step was never taken out, and when the line moved the part', async () => {
    const home = tempHome();
    await madeOnce(home);
    const never = fakeLine({ lock: withFiles });
    const result = await runMake({ home, line: never, patched: ['clips'] });
    expect(result.status).toBe('failed');
    expect(result.message).toMatch(/has not been taken out/);
    expect(lineRoute(never.seen, '/device')).toHaveLength(0);

    const taken = await takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader: publishedLoader() });
    writeFileSync(path.join(taken.dir, 'part.mjs'), 'export async function run() { return {}; }\n');
    const moved = fakeLine({ lock: (lock) => withFiles({ ...lock, parts: { ...lock.parts, 'clip-maker': { ...lock.parts['clip-maker'], version: '1.0.1' } } }) });
    const refused = await runMake({ home, line: moved, patched: ['clips'] });
    expect(refused.status).not.toBe('done');
    expect(moved.pieces).toHaveLength(0);
    expect(existsSync(path.join(taken.dir, 'part.mjs'))).toBe(true);
  });
});

it('keeps an edit of an older version aside instead of deleting it', async () => {
  const home = tempHome();
  await madeOnce(home);
  const layout = runLayout(home, VIDEO);
  mkdirSync(path.join(layout.patches, 'clips'), { recursive: true });
  writeFileSync(path.join(layout.patches, 'clips', 'part.mjs'), 'old edit');
  const taken = await takeOutStep({ home, videoId: VIDEO, step: 'clips', env: {}, loader: publishedLoader() });
  expect(taken.movedAside).not.toBeNull();
  expect(readFileSync(path.join(taken.movedAside!, 'part.mjs'), 'utf8')).toBe('old edit');
});
