import { getMakeCustomVideoSkillContent } from '../../src/skills/master-skill';

const examples = [...getMakeCustomVideoSkillContent().matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map((match) => JSON.parse(match[1]));

describe('custom video documented API payloads', () => {
  it('requires actual final recipe persistence, readback and fresh remix approvals', () => {
    const content = getMakeCustomVideoSkillContent();
    expect(content).toContain('remix.direction.implementation');
    expect(content).toContain('fresh approvals');
    expect(content).toContain('actual production recipe');
    expect(content).toContain('before showing its preview or pausing for review');
    expect(content).toContain('exact current spoken line');
    expect(content).toContain('production_manifest');
    expect(content).toContain('read-back');
  });
  it('requires explicit live quote support before sending a quote flag', () => {
    const content = getMakeCustomVideoSkillContent();
    expect(content).toContain('read a fresh data_post_provider tool description from the selected connection');
    expect(content).toContain('An extensible query schema or a newer fetched skill is not evidence');
    expect(content).toContain('an older server can treat this flag as a paid generation request');
  });

  it('uses an explicit free MCP quote with the actual generation inputs', () => {
    const quote = examples.find((example) => example.query?.quote_only === true);
    expect(quote).toBeDefined();
    expect(quote.provider).toBe('fal');
    expect(quote.query).toEqual({ quote_only: true });
    expect(typeof quote.project_id).toBe('string');
    expect(quote.path).toMatch(/\/image-to-video$/);
    expect(new URL(quote.body.image_url).protocol).toBe('https:');
    expect(Number(quote.body.duration)).toBe(5);
    expect(quote.body.generate_audio).toBe(false);
  });

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
    // GOOSE-3909: the example is a render waiting for the customer, not a failure.
    expect(render.status).toBe('running');
    expect(render.workflow_stage).toBe('blocked');
    expect(render.quality_status).toBe('blocked');
    expect(new URL(render.output_url).protocol).toBe('https:');
    expect(render.choices.length).toBeGreaterThan(0);
    expect(render.choices.length).toBeLessThanOrEqual(4);
    for (const choice of render.choices) {
      expect(choice.label.length).toBeLessThanOrEqual(60);
      expect(choice.message.length).toBeLessThanOrEqual(200);
    }
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

  it('separates waiting for the customer from failure', () => {
    const c = getMakeCustomVideoSkillContent();
    expect(c).toContain('### Render run states');
    expect(c).toContain('Waiting for the customer is not a failure');
    expect(c).toContain('valid only while the approval it rests on is current');
    expect(c).toContain('failure_code review_expired');
    expect(c).toContain('Opening a new render stops the older open render of this video with stop_reason "superseded"');
    expect(c).toContain('treat a render left at "running" with workflow_stage "blocked" as a pending customer decision');
    expect(c).toContain('complete that same render; a candidate needs no separate approval phase');
    expect(c).toContain('If your own render shows stop_reason "superseded"');
    expect(c).not.toContain('Save a failed candidate as blocked/failed');
    expect(c).not.toContain('Use exactly one of these four');
    expect(c).toContain('output_url when an uploaded candidate exists');
    // A stop (customer or spending limit) is reported as stopped, never failed.
    expect(c).toMatch(/\| Stop requested: a progress callback returned stop:true because the customer stopped the video or a paid step hit the spending limit \| "stopped" \|/);
    expect(c).not.toMatch(/\| Real failure:[^\n]*customer stopped/);
    expect(c).toContain('When stop:true comes with stop_reason "superseded", report nothing further on that render');
    expect(c).toContain('include:["assets","renders"]');
  });

  it('finalizes an existing candidate only through a new render bound to the current approval', () => {
    const c = getMakeCustomVideoSkillContent();
    expect(c).toContain('### Finalize an existing candidate after re-approval');
    expect(c).toContain('If the script changed, save it and record the customer\'s script approval first');
    expect(c).toContain('save the candidate as a video ingredient');
    expect(c).toContain('Open a new render with video_render_run');
    expect(c).toContain('Do not regenerate or re-upload');
    expect(c).toContain('one checked clip per scene');
  });

  it('matches a named format and runs its selector before going custom', () => {
    const c = getMakeCustomVideoSkillContent();
    expect(c).toContain('## Match a named format before going custom');
    expect(c).toContain('python3 scripts/prepare_script_context.py --brief <brief.json> --out <context.json>');
    expect(c).toContain('it is a stop, not permission to go custom');
    // A device showing the app is a prop: guessing stays unsupported (T-STR-3).
    expect(c).toContain('A laptop, phone or other device showing software is a prop, not a physical product: offering_type stays digital or service');
    expect(c).toMatch(/conversation \(mic-only, product-sample, concept-challenge\).*Preview only/);
    expect(c).toContain("keeps that format's hard constraints");
    expect(c).toContain('never continue past it silently');
    expect(c).toContain('[[composes::render-street-interview]]');
    // The route check comes before the harness and any paid preview.
    expect(c.indexOf('## Match a named format before going custom'))
      .toBeLessThan(c.indexOf('## Load the shared production harness first'));
  });

  it('makes people with the route builder, never by hand or with Flux', () => {
    const c = getMakeCustomVideoSkillContent();
    expect(c).toContain('## People in generated images');
    expect(c).toContain('[[composes::create-creator-takes-h3]] (scripts/make_character.py)');
    expect(c).toContain('--dry-run --payload-out');
    expect(c).toContain('without --dry-run and with GW_PROJECT_ID set to this project');
    expect(c).toContain('A hand-written generic prompt is not a substitute for the builder');
    expect(c).toContain('Never send a generated photoreal person still as a reference image');
    expect(c).toContain('crop each face, enlarge it 2×');
    expect(c).not.toMatch(/prefer supported fal-ai\/flux/);
    expect(c).not.toContain('| Character anchors, grounded product edits or scene stills |');
  });

  it('never tells custom videos to raise their budget with raise_cap', () => {
    const c = getMakeCustomVideoSkillContent();
    expect(c).not.toContain('raise_cap');
    expect(c).toContain('A custom video\'s budget grows only through a renewed approval');
    expect(c).toContain('On SPEND_CAP_REACHED the open render is asked to stop: report it "stopped"');
    expect(c).toContain('record the customer\'s approval of that total, and open a new render that reuses the saved pieces');
    expect(c).not.toContain('A spending-limit stop is waiting for the customer');
  });
});
