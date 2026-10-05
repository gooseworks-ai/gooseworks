import {
  getGooseVideoSkillContent,
  getGooseVideoLocalSkillContent,
  getMakeCustomVideoSkillContent,
  getMasterSkillContent,
} from '../../src/skills/master-skill';
import { DOMAIN_ROUTES } from '../../src/skills/routes';

// Instructions are the entry product. These structural checks catch bypass
// routes; they do not claim that an agent followed them or judged creative well.
describe('video entry prerequisite coverage', () => {
  const boundary = '## Prepare the video workflow and brand before creative work';
  const fullRead = 'brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }';

  it.each([
    ['goose-video', getGooseVideoSkillContent(), ['## Custom videos:', '## Route first:', '### 3. Show the picker']],
    ['goose-video-local', getGooseVideoLocalSkillContent(), ['## Chat hosts and cards', '## Where am I running?', '## Step 2.5']],
    ['make-custom-video', getMakeCustomVideoSkillContent(), ['## Discover specialists', '## Carry the sourced brief', '## Clips, assembly']],
  ] as const)('%s prepares the current workflow and full brand ahead of its creative/delegation routes', (slug, body, downstream) => {
    const preparation = body.indexOf(boundary);
    expect(preparation).toBeGreaterThan(-1);
    for (const section of downstream) {
      expect(body.indexOf(section)).toBeGreaterThan(preparation);
    }
    const preflight = body.slice(preparation, body.indexOf('\n## ', preparation + boundary.length));
    expect(preflight).toContain(`catalog_fetch { type: "skill", slug: "${slug}" }`);
    expect(preflight).toContain(fullRead);
    expect(preflight).toContain('Onboarding completion, a summary-only response');
    expect(preflight).toContain('kit, selected product facts or saved rules');
    expect(preflight).toContain('do not recursively fetch');
    expect(preflight).toContain('not spoken lines');
    expect(preflight).toContain('Resume an approved');
    expect(preflight).toContain('recorded packages, brand inputs, script and ingredients');
    expect(preflight).toContain('existing affected review/approval flow');
    expect(preflight).toContain('allowed previews');
    expect(preflight).toContain('script_drafts.brand_context_digest = brand_context.digest');
    expect(preflight).toContain('script_drafts.video_brand_context` is server-owned');
    expect(preflight).toContain('video_brand_context_required');
    expect(preflight).toContain('an upgrade alone needs no extra approval');
    expect(preflight).toContain('fresh, unfiltered');
    expect(preflight).toMatch(/use its\s+returned `brand_context.digest`/);
    expect(preflight).toContain('`patch.script` save');
    expect(preflight).toContain('Never refresh an ongoing approved run automatically');
    expect(preflight).toContain('normal flow');
    expect(preflight).not.toMatch(/brand_loaded|read: ?true|brand_read_receipt/);
  });

  it('the parent router fetches a video workflow before brand/default creative routing', () => {
    const body = getMasterSkillContent();
    const router = body.slice(body.indexOf('## Route to the right skill FIRST'), body.indexOf('## Setup'));
    expect(router.indexOf('load the current matching workflow')).toBeLessThan(router.indexOf('Then load the brand context'));
    expect(router).toContain('Onboarding facts alone are insufficient');
    expect(router).toContain('they are not lines to read aloud');
    expect(router).toContain('Guide returns `not_found`');
    expect(router).toContain('this same connection already returned the complete current matching video entry');
    expect(router).toContain('Stop before creative work, project writes or paid calls');
    for (const slug of ['goose-video', 'goose-video-local', 'make-custom-video']) {
      const route = DOMAIN_ROUTES.find((item) => item.skill === slug)!;
      expect(route.how).not.toContain('Just use it');
      expect(route.how).toContain('approved');
    }
  });

  it('local template preparation reads brand before fetching a new recipe and preserves saved rules on resume', () => {
    const body = getGooseVideoLocalSkillContent();
    const step = body.slice(body.indexOf('## Step 1 —'), body.indexOf('## Step 2 —'));
    expect(step.indexOf('2. Brand gate:')).toBeLessThan(step.indexOf('3. For a new plan,'));
    expect(step).toContain('instead of fetching today\'s recipe over the saved plan');
    expect(step).toContain('approved run\'s saved rules on resume');
    expect(step).toContain('A pending status alone does not require research');
  });

  // These fixtures capture selected-connection responses, including the old
  // production API. We verify the delivered policy for those shapes; a real
  // agent must still interpret it, and the backend owns paid admission.
  describe.each([
    ['goose-video', getGooseVideoSkillContent()],
    ['goose-video-local', getGooseVideoLocalSkillContent()],
    ['make-custom-video', getMakeCustomVideoSkillContent()],
  ])('%s selected API compatibility', (_slug, body) => {
    const preflight = body.slice(body.indexOf(boundary), body.indexOf('\n## ', body.indexOf(boundary) + boundary.length));
    const rows = preflight.split('\n').filter((line) => line.startsWith('| '));

    it('the old four-section/project payload without a receipt retains full preparation and ordinary approvals', () => {
      const brandRead = { brand: { id: 'brand-1' }, kit: { voice: 'Plain' }, products: { items: [], total: 0 }, learnings: [{ text: 'Video preference: animation' }] };
      const projectRead = { project: { id: 'project-1', brand_id: 'brand-1', source_sample_id: 'template-1', script_drafts: {} }, assets: [] };
      expect(brandRead).not.toHaveProperty('brand_context');
      expect(projectRead).not.toHaveProperty('brand_context');
      const row = rows.find((line) => line.includes('An older API returns the actual four brand sections'))!;
      expect(row).toContain('no `brand_context` in either the brand read or project response');
      expect(row).toContain('Prepare from those full sections, write the brand rules');
      expect(row).toContain('existing approval flow and advertised fields');
      expect(row).toContain('Do not fabricate a receipt or send nonexistent bundle/digest fields');
      expect(preflight.indexOf(fullRead)).toBeLessThan(preflight.indexOf(row));
      expect(preflight).toContain('missing brand section is a preparation failure');
    });

    it('a returned authoritative bundle requires the exact digest, while a 409 never permits legacy fallback', () => {
      const context = { version: 1, brand_id: 'brand-1', digest: 'a'.repeat(64), loaded_at: '2026-10-06T00:00:00Z', sections: ['summary', 'kit', 'products', 'learnings'], brand: { id: 'brand-1' }, kit: {}, products: { items: [], total: 0 }, learnings: [] };
      const projectRead = { project: { id: 'project-1', script_drafts: { video_brand_context: context } }, brand_context: context };
      expect(projectRead.brand_context.digest).toBe(projectRead.project.script_drafts.video_brand_context.digest);
      const row = rows.find((line) => line.includes('A complete authoritative version-1'))!;
      expect(row).toContain('Binding is required');
      expect(row).toContain('script_drafts.brand_context_digest = brand_context.digest');
      expect(row).toContain('each new/changed script save');
      const refusal = { error: { code: 'video_brand_context_required', status: 409 } };
      expect(preflight).toContain(`HTTP ${refusal.error.status}`);
      expect(preflight).toContain(refusal.error.code);
      expect(preflight).toContain('That refusal never permits the older-API');
      expect(preflight).toContain('fallback, skipping sections or retrying paid calls blindly');
    });

    it('only a not_found guide with the complete current same-connection entry can continue', () => {
      const guide = { error: { code: 'not_found' } };
      const entry = { connection: 'selected-production', content: body, dependencySkills: [] };
      const row = rows.find((line) => line.includes(`Guide returns \`${guide.error.code}\``))!;
      expect(entry.content).toContain(boundary);
      expect(row).toContain('this same connection already returned the complete current matching video entry with its required dependencies');
      expect(row).toContain('full brand preparation and existing approvals');
      const refused = rows.find((line) => line.includes('Guide has another error'))!;
      for (const condition of ['another error', 'no response', 'incomplete content', 'missing, incomplete or from another connection']) expect(refused).toContain(condition);
      expect(refused).toContain('Stop before creative work, project writes or paid calls');
      expect(preflight).toContain('A missing custom entry or required custom tool/schema remains unavailable');
      expect(preflight).toContain('never substitute\na template or an import to bypass it');
    });
  });
});
