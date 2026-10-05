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
    expect(preflight).toContain('use its returned `brand_context.digest`');
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
});
