// Pilot proof: each pilot style's timeline step on html-frames renders a real
// 3-second sample that a player reads at the right length and size. The frames
// are the recipes' own looks rewritten for the maker (fixtures); the pictures
// are test drawings, not the recipes' media.
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeVideo } from '../../../src/kit/maker/make';
import { DESIGN_SIZE, type Aspect } from '../../../src/kit/maker/inputs';
import { FIXTURES, describeMedia, ffprobe, fileRef, partContext } from './helpers';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** The plan's and brand's file names become files, as the core downloads and hands them over. */
function withFiles(value: Json, key = ''): unknown {
  if (typeof value === 'string' && /^media\/.+\.svg$/.test(value) && ['images', 'picture', 'logo'].includes(key)) return fileRef(path.join(FIXTURES, value));
  if (Array.isArray(value)) return value.map((item) => withFiles(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withFiles(v, k)]));
  return value;
}

/** Binds a step's inputs the way the style file says: plan., brand. and asset references. */
function bind(value: unknown, scope: { plan: Record<string, unknown>; brand: unknown; styleDir: string }): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const ref = value as Record<string, unknown>;
    if (typeof ref.asset === 'string') return fileRef(path.join(scope.styleDir, ref.asset));
    if (typeof ref.from === 'string') {
      const [head, ...rest] = ref.from.split('.');
      let node: unknown = head === 'plan' ? scope.plan : head === 'brand' ? scope.brand : undefined;
      for (const segment of rest) node = (node as Record<string, unknown> | undefined)?.[segment];
      return node;
    }
    return Object.fromEntries(Object.entries(ref).map(([k, v]) => [k, bind(v, scope)]));
  }
  if (Array.isArray(value)) return value.map((item) => bind(item, scope));
  return value;
}

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Json;

describeMedia('pilot styles on html-frames', () => {
  it.each(['logo-equation-card', 'search-grid', 'photo-grid-promo-card'])('%s renders a 3-second sample', async (style) => {
    const styleDir = path.join(FIXTURES, 'pilots', style);
    const step = read(path.join(styleDir, 'step.json')) as { part: { id: string }; inputs: Record<string, unknown> };
    expect(step.part.id).toBe('html-frames');
    const plan = withFiles(read(path.join(styleDir, 'plan.json'))) as Record<string, unknown>;
    const brand = withFiles(read(path.join(FIXTURES, 'brand.json')));
    const inputs = bind(step.inputs, { plan, brand, styleDir }) as Record<string, unknown>;
    // The sample is 3 seconds; everything else is the style's own step.
    delete inputs.scene_s;
    inputs.duration_s = 3;

    const root = mkdtempSync(path.join(os.tmpdir(), `c2-pilot-${style}-`));
    try {
      const made = await makeVideo(inputs, partContext(root).ctx);
      const fps = (inputs.fps as number | undefined) ?? 30;
      const size = DESIGN_SIZE[plan.aspect as Aspect];
      const probe = ffprobe(made.video.path);
      expect(probe).toMatchObject({ width: size.width, height: size.height, codec: 'h264', pix_fmt: 'yuv420p', frames: 3 * fps });
      expect(Math.abs(probe.duration - 3)).toBeLessThanOrEqual(1 / fps);
      expect(made.seconds).toBe(3);
      // The timeline covers the video with the plan's scenes, back to back.
      const scenes = made.timeline.scenes;
      expect(scenes.map((s) => s.id)).toEqual((plan.scenes as Array<{ id: string }>).map((s) => s.id));
      expect(scenes[0].start_s).toBe(0);
      expect(scenes[scenes.length - 1].end_s).toBe(3);
      scenes.slice(1).forEach((scene, i) => expect(scene.start_s).toBe(scenes[i].end_s));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});
