// Rule: a custom video's style is a hidden style row (gooseworks-app #2024):
// id `custom-<projectId>`, version `1.0.<plan revision>`, and a package that is
// a subset of its seed style's files, copied byte for byte, under a new
// manifest. The kit takes it like any other style, refuses it when one byte
// differs, and on a re-run reuses every finished step, so nothing is paid twice.
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ASSEMBLY_FORMAT, CONTENT_DIMENSIONS, assemblyTimelineRevision } from '../../src/kit/core/assembly-timeline';
import { canonicalHash, canonicalJson } from '../../src/kit/core/canonical';
import { KitStop } from '../../src/kit/core/errors';
import type { LoadedPart } from '../../src/kit/core/host';
import { runLayout, stepFolder } from '../../src/kit/core/paths';
import { checkStyle, fetchStyle, styleHash } from '../../src/kit/core/style';
import type { PartContext } from '../../src/kit/part-interface';
import { API, VIDEO, fakeLine, fileSchema, lineRoute, manifest, realTools, runMake, style as baseStyle, tempHome, testParts } from './harness';

const ffmpeg = process.env.TEST_FFMPEG || 'ffmpeg';
const withFfmpeg = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 ? it : it.skip;

/** Runs ffmpeg for a fixture; a fixture that can't be encoded fails the test that needs it. */
function encode(args: string[]): void {
  const result = spawnSync(ffmpeg, ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'fixture could not be encoded');
}

/**
 * A real two-second edit: a moving test picture and a noise bed (sound, not a tone), muxed into the
 * final. The picture and the bed are its sources, declared in the source-linked timeline.
 */
function realEdit(dir: string, flawed = false): { picture: string; bed: string; final: string } {
  const picture = path.join(dir, 'picture.mp4');
  const bed = path.join(dir, 'bed.wav');
  const final = path.join(dir, 'final.mp4');
  // The flawed edit is the audit's worst case: a still card over a sine "music" bed.
  encode(['-f', 'lavfi', '-i', flawed ? 'color=c=blue:s=160x288:r=30:d=2' : 'testsrc2=s=160x288:r=30:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', picture]);
  encode(['-f', 'lavfi', '-i', flawed ? 'sine=frequency=440:sample_rate=48000:duration=2' : 'anoisesrc=color=pink:amplitude=0.3:sample_rate=48000:duration=2', '-ac', '1', bed]);
  encode(['-i', picture, '-i', bed, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest', final]);
  return { picture, bed, final };
}

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
function customPackage(frameBytes: Buffer = seedFiles[FRAME], pinned: Record<string, unknown> = customStyle) {
  const styleBytes = Buffer.from(JSON.stringify(pinned));
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
  const ref = { style_id: CUSTOM_ID, version: CUSTOM_VERSION, style_hash: styleHash(pinned), url: `${API}/pkg/view`, sha256: view.sha256 };
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
  function customLine(pinned: Record<string, unknown> = customStyle, extraPart = 'frame-finish') {
    const { ref, served } = customPackage(seedFiles[FRAME], pinned);
    const line = fakeLine({
      style: pinned,
      lock: (lock) => ({
        ...lock,
        style: { id: CUSTOM_ID, version: CUSTOM_VERSION },
        parts: { ...lock.parts, [extraPart]: { version: '1.0.0', files: {}, models: [], kit: '>=1.0.0' } },
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
    // These fake files can't be measured, and a custom final that can't be measured is never sent.
    expect(resumed.status).toBe('stopped');
    expect(resumed.code).toBe('final_measure_failed');
    expect(resumed.message).toContain('could not be measured');
    const measured = JSON.parse(readFileSync(path.join(runLayout(home, VIDEO).final, 'final-measure.json'), 'utf8'));
    expect(measured).toMatchObject({ format: 'gooseworks-final-measure/1', checks: [] });
    expect(typeof measured.error).toBe('string');
    expect(lineRoute(second.seen, '/upload')).toHaveLength(0);
    expect(second.pieces).toHaveLength(0);
    expect(clipRuns).toBe(1);
    expect(finishRuns).toBe(runsBefore + 1);
    expect(recordOf('clips').step_hash).toBe(firstClips.step_hash);
    expect(recordOf('finish').status).toBe('done');
  });
});

describe('a reviewed custom video', () => {
  const editStyle = {
    ...baseStyle,
    id: CUSTOM_ID,
    version: CUSTOM_VERSION,
    timeline: [{ id: 'edit', part: { id: 'edit-maker', version: '1.0.0' }, inputs: {} }],
    layers: { brand: false, captions: false, sound: false, check: true },
    assets: { fonts: [], frames: [] },
  };

  function customLine() {
    const { ref, served } = customPackage(seedFiles[FRAME], editStyle);
    const line = fakeLine({
      style: editStyle,
      lock: (lock) => ({ ...lock, style: { id: CUSTOM_ID, version: CUSTOM_VERSION }, parts: { ...lock.parts, 'edit-maker': { version: '1.0.0', files: {}, models: [], kit: '>=1.0.0' } } }),
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

  /** The edit step: the real final, its two sources, and the timeline that links them. */
  function editParts(files: { picture: string; bed: string; final: string }): Record<string, LoadedPart> {
    const edit: LoadedPart = {
      source: 'published',
      dir: '/parts/edit-maker/1.0.0',
      manifest: manifest('edit-maker', {
        kind: 'compose',
        inputs: { type: 'object', additionalProperties: false, properties: {} },
        outputs: { type: 'object', additionalProperties: false, required: ['video', 'timeline'], properties: { video: fileSchema('video'), timeline: { type: 'object' }, sources: { type: 'array' }, assembly_timeline: { type: 'object' } } },
      }),
      run: (async (_inputs: any, ctx: PartContext) => {
        copyFileSync(files.picture, path.join(ctx.workDir, 'picture.mp4'));
        copyFileSync(files.bed, path.join(ctx.workDir, 'bed.wav'));
        copyFileSync(files.final, path.join(ctx.workDir, 'final.mp4'));
        const picture = await ctx.file('picture.mp4', 'video');
        const bed = await ctx.file('bed.wav', 'audio');
        return {
          video: await ctx.file('final.mp4', 'video'),
          timeline: { duration_s: 2, width: 160, height: 288, fps: 30, scenes: [], speech: [] },
          sources: [picture, bed],
          assembly_timeline: {
            format: ASSEMBLY_FORMAT,
            creative_contract_revision: 'c'.repeat(64),
            duration_ms: 2000,
            speech_mode: 'none',
            soundtrack_modes: ['music'],
            segments: [{ id: 'seg-1', scene_id: 's1', start_ms: 0, end_ms: 2000, video: { asset_id: 'picture', sha256: picture.sha256, path: picture.path, in_ms: 0, out_ms: 2000, speed: 1 }, speech_mode: 'none', depicts_speech: false, native_audio: 'muted' }],
            audio_cues: [{ id: 'bed', role: 'music', source: { asset_id: 'bed', sha256: bed.sha256, in_ms: 0, out_ms: 2000, speed: 1 }, start_ms: 0, end_ms: 2000, gain_db: 0, loop: false }],
            pauses: [],
            required_cue_ids: ['bed'],
          },
        };
      }) as LoadedPart['run'],
    };
    return { ...testParts(), 'edit-maker': edit };
  }

  withFfmpeg('uploads once its saved review matches the exact final, keeping local paths off the server', async () => {
    const home = tempHome();
    const files = realEdit(mkdtempSync(path.join(os.tmpdir(), 'c1-real-edit-')));
    const parts = editParts(files);
    const tools = realTools();

    const first = customLine();
    const stopped = await runMake({ home, line: first, parts, tools });
    expect([stopped.status, stopped.code]).toEqual(['stopped', 'content_review_incomplete']);
    expect(lineRoute(first.seen, '/upload')).toHaveLength(0);
    const final = runLayout(home, VIDEO).final;
    const request = JSON.parse(readFileSync(path.join(final, 'review-request.json'), 'utf8'));
    expect(request.template.capabilities).toEqual({ audio: 'measured', motion: 'measured' });

    // The reviewer fills the template in for these exact bytes and the same command resumes.
    writeFileSync(path.join(final, 'content-review.json'), JSON.stringify({
      ...request.template,
      reviewer: 'Akhil',
      verdict: 'approved',
      capabilities: { audio: 'listened', motion: 'watched' },
      coverage: [{ start_ms: 0, end_ms: request.measured_duration_ms }],
      unresolved_issues: [{ severity: 'p2', message: 'The noise bed could be quieter.' }],
      dimensions: Object.fromEntries(CONTENT_DIMENSIONS.map((name) => [name, { status: ['lip_sync', 'voice_performance', 'pronunciation'].includes(name) ? 'not_applicable' : 'pass', note: 'Played end to end with sound.' }])),
    }));
    const second = customLine();
    const done = await runMake({ home, line: second, parts, tools });
    expect(done).toMatchObject({ status: 'done', final: path.join(final, 'final.mp4') });
    const measured = JSON.parse(readFileSync(path.join(final, 'final-measure.json'), 'utf8'));
    expect(measured.checks.filter((c: { result: string }) => c.result === 'fail')).toEqual([]);
    const [upload] = lineRoute(second.seen, '/upload');
    expect(upload.body.sha256).toBe(request.output_sha256);
    const sent = upload.body.manifest;
    expect(sent.content_review_status).toBe('approved');
    expect(sent.final_measure).toEqual(measured);
    expect(sent.final_measure).toMatchObject({ format: 'gooseworks-final-measure/1', output_sha256: request.output_sha256, measured_duration_ms: request.measured_duration_ms });
    expect(sent.content_review.capabilities).toEqual({ audio: 'listened', motion: 'watched' });
    expect(sent.assembly_evidence).toMatchObject({ status: 'complete', revision: request.timeline_revision, output_sha256: request.output_sha256 });
    // Local paths stay on this computer, and the revision the server recomputes is unchanged by that.
    expect(JSON.stringify(sent.assembly_timeline)).not.toContain('"path"');
    expect(JSON.stringify(sent)).not.toContain(home);
    expect(assemblyTimelineRevision(sent.assembly_timeline)).toBe(request.timeline_revision);
    // Nothing was made twice: the edit step was reused from the first run.
    expect(second.pieces).toHaveLength(0);
  }, 60_000);

  withFfmpeg('never sends a final that fails its measurements, and says where', async () => {
    const home = tempHome();
    const parts = editParts(realEdit(mkdtempSync(path.join(os.tmpdir(), 'c1-flawed-edit-')), true));
    const line = customLine();
    const stopped = await runMake({ home, line, parts, tools: realTools() });
    expect([stopped.status, stopped.code]).toEqual(['stopped', 'final_measure_failed']);
    expect(stopped.message).toContain('failed its measured checks');
    expect(stopped.message).toMatch(/tone only: .*0\.0–2\.0 s/);
    expect(stopped.message).toMatch(/frozen picture: The picture is frozen/);
    expect(lineRoute(line.seen, '/upload')).toHaveLength(0);
    const measured = JSON.parse(readFileSync(path.join(runLayout(home, VIDEO).final, 'final-measure.json'), 'utf8'));
    expect(measured.checks.filter((c: { result: string }) => c.result === 'fail').map((c: { id: string }) => c.id)).toEqual(['tone_only', 'frozen_picture']);
  }, 60_000);
});
