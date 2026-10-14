// Rule: a custom video's style is a hidden style row (gooseworks-app #2024):
// id `custom-<projectId>`, version `1.0.<plan revision>`, and a package that is
// a subset of its seed style's files, copied byte for byte, under a new
// manifest. The kit takes it like any other style, refuses it when one byte
// differs, and on a re-run reuses every finished step, so nothing is paid twice.
import { createHash, randomUUID } from 'crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { canonicalHash, canonicalJson } from '../../src/kit/core/canonical';
import { KitStop } from '../../src/kit/core/errors';
import type { LoadedPart } from '../../src/kit/core/host';
import { runLayout, stepFolder } from '../../src/kit/core/paths';
import { checkStyle, fetchStyle, styleHash } from '../../src/kit/core/style';
import type { PartContext } from '../../src/kit/part-interface';
import { API, VIDEO, fakeLine, fileSchema, lineRoute, manifest, runMake, style as baseStyle, tempHome, testParts } from './harness';

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

const CUSTOM_ID = `custom-${randomUUID()}`;
const CUSTOM_VERSION = '1.0.7';
const FRAME = 'frames/ugc-take.prompt.json';

/** The seed style's package files; the custom package carries only some of them. */
const seedFiles: Record<string, Buffer> = {
  'frames/creator.prompt.json': Buffer.from('{"prompt":"A creator holding {product}"}\n'),
  [FRAME]: Buffer.from('{"prompt":"One take: {line}","seconds":5}\n'),
};

/** The custom style: two steps, a paid clip maker, then a free step that reads the copied frame. */
const customStyle = {
  ...baseStyle,
  id: CUSTOM_ID,
  version: CUSTOM_VERSION,
  timeline: [
    { id: 'clips', part: { id: 'clip-maker', version: '1.0.0' }, inputs: { scenes: { from: 'plan.scenes' } } },
    { id: 'finish', part: { id: 'frame-finish', version: '1.0.0' }, inputs: { video: { from: 'step.clips.video' }, timeline: { from: 'step.clips.timeline' }, frame: { asset: FRAME } } },
  ],
  assets: { fonts: [], frames: [FRAME] },
};

/** The package as the server writes it: style.json, the copied frame, and a new manifest. */
function customPackage(frameBytes: Buffer = seedFiles[FRAME]) {
  const styleBytes = Buffer.from(JSON.stringify(customStyle));
  const listed = [
    { path: 'style.json', sha256: sha(styleBytes), bytes: styleBytes.length },
    // The manifest lists the seed's bytes; `frameBytes` is what the download actually serves.
    { path: FRAME, sha256: sha(seedFiles[FRAME]), bytes: seedFiles[FRAME].length },
  ];
  const manifestBytes = Buffer.from(canonicalJson({ style_id: CUSTOM_ID, version: CUSTOM_VERSION, files: listed }));
  const served = new Map<string, Buffer>([
    [`${API}/pkg/manifest`, manifestBytes],
    [`${API}/pkg/files/style.json`, styleBytes],
    [`${API}/pkg/files/${FRAME}`, frameBytes],
  ]);
  const view = {
    package_id: `${CUSTOM_ID}@${CUSTOM_VERSION}`,
    url: `${API}/pkg/manifest`,
    sha256: sha(manifestBytes),
    content_sha256: canonicalHash(listed),
    files: listed.map((f) => ({ ...f, url: `${API}/pkg/files/${f.path}` })),
    expires_at: null,
  };
  served.set(`${API}/pkg/view`, Buffer.from(JSON.stringify({ package: view })));
  const ref = { style_id: CUSTOM_ID, version: CUSTOM_VERSION, style_hash: styleHash(customStyle), url: `${API}/pkg/view`, sha256: view.sha256 };
  return { ref, served };
}

/** The download the kit is given: served files by URL (the project id query is ignored). */
function downloader(served: Map<string, Buffer>, urls: string[] = []) {
  return async (url: string) => {
    const u = new URL(url);
    urls.push(url);
    const data = served.get(`${u.origin}${u.pathname}`);
    if (!data) throw new Error(`not served: ${url}`);
    return data;
  };
}

describe('a custom style package', () => {
  it('passes fetchStyle and checkStyle with a custom id, a 1.0.<revision> version and a subset of the seed’s files', async () => {
    const { ref, served } = customPackage();
    const dir = mkdtempSync(path.join(os.tmpdir(), 'c1-custom-style-'));
    const urls: string[] = [];
    const loaded = await fetchStyle({ ref, projectId: VIDEO, dir, download: downloader(served, urls) });

    expect(loaded.style.id).toBe(CUSTOM_ID);
    expect(loaded.style.version).toBe(CUSTOM_VERSION);
    expect([...loaded.assets.keys()]).toEqual([FRAME]);
    expect(loaded.assets.get(FRAME)!.sha256).toBe(sha(seedFiles[FRAME]));
    // The copied frame is the seed's file, byte for byte; the seed file it left out never came down.
    expect(readFileSync(path.join(dir, FRAME)).equals(seedFiles[FRAME])).toBe(true);
    expect(urls.some((u) => u.includes('creator.prompt.json'))).toBe(false);
    expect(new URL(urls[0]).searchParams.get('project_id')).toBe(VIDEO);

    expect(checkStyle(JSON.parse(readFileSync(path.join(dir, 'style.json'), 'utf8')), { id: CUSTOM_ID, version: CUSTOM_VERSION, hash: ref.style_hash }).id).toBe(CUSTOM_ID);
  });

  it('is refused when one byte of the frame differs from its manifest', async () => {
    const changed = Buffer.from(seedFiles[FRAME]);
    changed[changed.length - 2] ^= 1;
    const { ref, served } = customPackage(changed);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'c1-custom-style-'));
    const refused = fetchStyle({ ref, projectId: VIDEO, dir, download: downloader(served) });
    await expect(refused).rejects.toBeInstanceOf(KitStop);
    await expect(refused).rejects.toThrow('A file in the style package does not match its checksum.');
  });

  it('is refused when the pin names another custom version', () => {
    expect(() => checkStyle(customStyle, { id: CUSTOM_ID, version: '1.0.8', hash: styleHash(customStyle) })).toThrow('The style file is not the version this video pinned.');
  });
});

describe('a custom video made on the kit', () => {
  /** The fake line, handing over the custom style and serving its package. */
  function customLine() {
    const { ref, served } = customPackage();
    const line = fakeLine({
      style: customStyle,
      lock: (lock) => ({
        ...lock,
        style: { id: CUSTOM_ID, version: CUSTOM_VERSION },
        parts: { ...lock.parts, 'frame-finish': { version: '1.0.0', files: {}, models: [], kit: '>=1.0.0' } },
      }),
      handOver: (handed) => ({ ...handed, plan: { ...handed.plan, style_id: CUSTOM_ID, style_version: CUSTOM_VERSION }, style_package: ref }),
    });
    const inner = line.fetch;
    const fetchImpl = (async (input: any, init: any = {}) => {
      const u = new URL(String(input));
      const data = u.origin === API && u.pathname.startsWith('/pkg/') ? served.get(`${u.origin}${u.pathname}`) : undefined;
      return data ? new Response(data, { status: 200 }) : inner(input, init);
    }) as typeof fetch;
    return { ...line, fetch: fetchImpl };
  }

  it('reuses the finished paid step on a re-run and orders nothing again', async () => {
    const home = tempHome();
    let clipRuns = 0;
    let finishRuns = 0;
    let finishBreaks = true;
    const parts = testParts();
    const clip = parts['clip-maker'];
    const finish: LoadedPart = {
      source: 'published',
      dir: '/parts/frame-finish/1.0.0',
      manifest: manifest('frame-finish', {
        inputs: { type: 'object', additionalProperties: false, required: ['video', 'timeline', 'frame'], properties: { video: fileSchema('video'), timeline: { type: 'object' }, frame: fileSchema('json') } },
        outputs: { type: 'object', additionalProperties: false, required: ['video', 'timeline'], properties: { video: fileSchema('video'), timeline: { type: 'object' } } },
      }),
      run: (async (inputs: any, ctx: PartContext) => {
        finishRuns++;
        if (finishBreaks) throw new Error('the machine went to sleep');
        writeFileSync(path.join(ctx.workDir, 'final.mp4'), Buffer.concat([readFileSync(inputs.frame.path), Buffer.from(inputs.video.sha256)]));
        return { video: await ctx.file('final.mp4', 'video'), timeline: inputs.timeline };
      }) as LoadedPart['run'],
    };
    const counted: Record<string, LoadedPart> = {
      ...parts,
      'clip-maker': { ...clip, run: (async (inputs: any, ctx: PartContext) => { clipRuns++; return clip.run(inputs, ctx); }) as LoadedPart['run'] },
      'frame-finish': finish,
    };

    // First run: the paid step finishes (two pieces), then the next step breaks.
    const first = customLine();
    expect((await runMake({ home, line: first, parts: counted })).status).not.toBe('done');
    expect(first.pieces.map((p) => p.piece_key)).toEqual(['clips.scene-1', 'clips.scene-2']);
    expect(clipRuns).toBe(1);
    const recordOf = (step: string) => JSON.parse(readFileSync(path.join(stepFolder(runLayout(home, VIDEO), step), 'record.json'), 'utf8'));
    const firstClips = recordOf('clips');
    expect(firstClips.status).toBe('done');

    // Same command again: the paid step is reused by its step hash; only the broken step runs.
    finishBreaks = false;
    const runsBefore = finishRuns;
    const second = customLine();
    const resumed = await runMake({ home, line: second, parts: counted });
    expect(resumed.status).toBe('stopped');
    expect(resumed.code).toBe('content_review_incomplete');
    const reviewRequest = JSON.parse(readFileSync(path.join(runLayout(home, VIDEO).final, 'review-request.json'), 'utf8'));
    expect(reviewRequest.content_review_problems.length).toBeGreaterThan(0);
    expect(lineRoute(second.seen, '/upload')).toHaveLength(0);
    expect(second.pieces).toHaveLength(0);
    expect(clipRuns).toBe(1);
    expect(finishRuns).toBe(runsBefore + 1);
    expect(recordOf('clips').step_hash).toBe(firstClips.step_hash);
    expect(recordOf('finish').status).toBe('done');
  });
});
