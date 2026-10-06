import {
  getGooseAdsSkillContent,
  getGooseVideoSkillContent,
  getGooseVideoLocalSkillContent,
  getMakeCustomVideoSkillContent,
  getMasterSkillContent,
} from '../../src/skills/master-skill';

// A fresh agent asked to "create ads" read the Kit and then asked the user for
// angles and proof that the Brand Brain already held: no entry made the search
// a step, and several told it to ask. These checks keep the search ahead of
// every creative choice or question. They prove the instruction order, not that
// an agent follows it; recorded fresh-agent traces cover behaviour.
const BRAIN = '## Search the Brand Brain, then propose';

const entries = [
  ['gooseworks', getMasterSkillContent(), '## Load the brand context FIRST', ['## Setup', '## Guided brand capture']],
  ['goose-ads', getGooseAdsSkillContent(), '## Start from the brand context', ['## Picking source ads', '## Workflow — make ads from a template']],
  ['goose-video', getGooseVideoSkillContent(), '## Prepare the video workflow and brand', ['## Custom videos:', '### 2. Keep the goal', '### 3. Show the picker']],
  ['goose-video-local', getGooseVideoLocalSkillContent(), '## Prepare the video workflow and brand', ['## Step 2.5']],
  ['make-custom-video', getMakeCustomVideoSkillContent(), '## Prepare the video workflow and brand', ['## Carry the sourced brief']],
] as const;

describe('Brain-first entry', () => {
  it.each(entries)('%s searches the Brain after the brand read and before creative work', (_slug, body, brandLoad, downstream) => {
    const load = body.indexOf(brandLoad);
    const brain = body.indexOf(BRAIN);
    expect(load).toBeGreaterThan(-1);
    expect(brain).toBeGreaterThan(load);
    for (const section of downstream) {
      expect(body.indexOf(section)).toBeGreaterThan(brain);
    }
    const block = body.slice(brain, body.indexOf('\n## ', brain + BRAIN.length));
    expect(block).toContain('knowledge_search { brand_id, query }');
    expect(block).toContain('before you ask the user for any brand fact');
    expect(block).toContain('source_types: ["evidence", "claim", "learning", "creative", "document"]');
    expect(block).toContain('no\napproval');
    expect(block).toContain('**Propose; don\'t interview.**');
    expect(block).toContain('**Carry an evidence brief**');
  });

  it('keeps empty, not-ready, failed and empty-Kit states distinct', () => {
    const block = getGooseAdsSkillContent();
    const rows = block.slice(block.indexOf(BRAIN)).split('\n').filter((line) => line.startsWith('| '));
    expect(rows.find((r) => r.includes('`status: "empty"`'))).toContain('never "the brand has no proof"');
    // refresh_required returns current results with stale sources dropped: usable, not "not ready".
    expect(rows.find((r) => r.includes('`refresh_required`'))).toContain('Use them; search again shortly');
    expect(rows.find((r) => r.startsWith('| `building`'))).toContain('Retry once shortly');
    expect(rows.find((r) => r.includes('not registered'))).toContain('treat evidence as unchecked');
    expect(rows.find((r) => r.includes('An empty Kit field'))).toContain('still search before asking');
  });

  // The kit's proofPoints are already limited to proof an ad may state (backend
  // QA-03), so they are claim-grade as written; free Kit prose is not.
  it('approved claims and kit proof points are claim-grade; other Kit text is context', () => {
    const ads = getGooseAdsSkillContent();
    expect(ads).toContain('Claim-grade proof is a result with `approved_ad_claim: true` or the kit\'s\n   `approvedClaims`');
    expect(ads).toContain('the kit\'s `proofPoints` are what the\n   backend allows an ad to state, used as written');
    expect(ads).toContain('Never invent an offer, price or result.');
    expect(ads).toContain('**What to claim** → only claim-grade proof');
    expect(ads).not.toContain('**The angle, offer framing, and what to claim** → **positioning**');
    expect(ads).not.toContain('Kit proof points, documents and performance numbers are context');
    const router = getMasterSkillContent();
    expect(router).toContain('Kit proof points are proof an ad may state as written');
    expect(router).not.toContain('Kit proof points are context, not approved ad claims.');
  });

  it('keeps chosen directions and lets pickers carry the recommendation', () => {
    const block = getGooseVideoSkillContent();
    expect(block).toContain('Keep directions already chosen (the user\'s words, a project\'s creative brief, handed-off\n   defaults, approved plans)');
    expect(block).toContain('When a\n   returned card or picker presents the choice, your recommendation is its one acknowledgement\n   line');
    expect(getGooseVideoLocalSkillContent()).toContain('use the Brain search\'s\nevidence brief first, then the recipe default, then (last) asking');
  });

  it('keeps queries within the search limit', () => {
    expect(getGooseAdsSkillContent()).toContain('Run one short query (under 500 characters)');
  });

  it('removes the instructions that sent agents to ask instead of search', () => {
    const router = getMasterSkillContent();
    const ads = getGooseAdsSkillContent();
    expect(router).not.toContain("If it isn't in the brand context and the user hasn't said it, ask.");
    expect(router).toContain('search\nthe Brand Brain next');
    expect(ads).not.toContain('which of several angles');
    expect(ads).not.toContain('Ask what kind of ads they want');
    expect(ads).toContain('send **one\nproposal**');
    expect(ads).toContain('**Do NOT ask what kind of ads they want, which product,\n   or the vibe.**');
  });

  it('goose-ads loads learnings in its own workflow, not the kit alone', () => {
    const ads = getGooseAdsSkillContent();
    const step = ads.slice(ads.indexOf('## Workflow — make ads from a template'), ads.indexOf('## Workflow — edit an existing ad'));
    expect(step).toContain('summary, kit, products and\n   learnings and search the Brand Brain');
    expect(step).not.toContain('then call `get_brand_kit` for the');
  });

  it('video writers take the evidence brief as their first source', () => {
    expect(getGooseVideoLocalSkillContent()).toContain("The Brain search's evidence brief (citations, the\n  state of each query and open gaps) is the first source");
    expect(getMakeCustomVideoSkillContent()).toContain("brand/product evidence (the Brain search's evidence brief");
    expect(getGooseVideoSkillContent()).toContain("Brain search's evidence brief (proven angles, saved rules, approved claims)");
  });
});
