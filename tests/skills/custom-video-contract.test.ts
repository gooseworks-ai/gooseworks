import { getMakeCustomVideoSkillContent } from '../../src/skills/master-skill';

const examples = [...getMakeCustomVideoSkillContent().matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map((match) => JSON.parse(match[1]));

describe('custom video documented API payloads', () => {
  it('uses character entries and distinct manifest/clip scene ID types', () => {
    const production = examples.find((example) => example.patch?.production)?.patch.production;
    expect(production).toBeDefined();
    expect(production.version).toBe(1);
    expect(production.pipeline.length).toBeGreaterThan(0);
    expect(Array.isArray(production.characters)).toBe(true);
    for (const character of production.characters) {
      expect(Object.keys(character).sort()).toEqual(['name', 'prompt']);
      expect(typeof character.name).toBe('string');
      expect(character.name.length).toBeGreaterThan(0);
      expect(typeof character.prompt).toBe('string');
      expect(character.prompt.length).toBeGreaterThan(0);
    }
    for (const scene of production.scenes) {
      expect(typeof scene.id).toBe('string');
      expect(scene.id).toMatch(/^[1-9]\d*$/);
    }
    for (const clip of production.clips) {
      expect(Number.isInteger(clip.scene)).toBe(true);
      expect(clip.scene).toBeGreaterThan(0);
      expect(production.scenes.some((scene: { id: string }) => scene.id === String(clip.scene))).toBe(true);
      expect(new URL(clip.url).protocol).toBe('https:');
      expect(clip.checks.map((check: { check: string }) => check.check).sort()).toEqual([
        'brand', 'duration_and_ratio', 'product', 'visual_artifacts', 'voice_and_script',
      ]);
      // The shape example must not present unperformed inspection as passing QC.
      expect(clip.checks.every((check: { status: string }) => check.status === 'fail')).toBe(true);
    }
  });

  it('contains every final QC field and keeps illustrative evidence blocked', () => {
    const render = examples.find((example) => example.render?.quality_report)?.render;
    expect(render).toBeDefined();
    expect(render.status).toBe('failed');
    expect(render.quality_status).toBe('blocked');
    const report = render.quality_report;
    expect(report.version).toBe(1);
    expect(typeof report.summary).toBe('string');
    expect(Object.keys(report.checks).sort()).toEqual([
      'brand', 'captions', 'duration_and_ratio', 'endcard_and_cta', 'hook_and_scene_order',
      'product', 'source', 'visual_artifacts', 'voice_and_script',
    ]);
    for (const check of Object.values(report.checks) as { status: string; note: string }[]) {
      expect(check.status).toBe('fail');
      expect(typeof check.note).toBe('string');
    }
    expect(report.detected_issues.length).toBeGreaterThan(0);
    expect(Array.isArray(report.repair_actions)).toBe(true);
    expect(Number.isNaN(Date.parse(report.checked_at))).toBe(false);
  });
});
