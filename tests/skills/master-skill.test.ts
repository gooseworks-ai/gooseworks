import {
  getMasterSkillContent,
  getGooseAdsSkillContent,
  getGooseVideoSkillContent,
  getEntrySkills,
} from '../../src/skills/master-skill';

describe('skills/master-skill', () => {
  const content = getMasterSkillContent();

  it('returns a non-empty string', () => {
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains YAML frontmatter with slug', () => {
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('slug: gooseworks');
  });

  it('uses gooseworks search wrapper for skill catalog search', () => {
    expect(content).toContain('gooseworks search');
  });

  it('uses gooseworks fetch wrapper for skill catalog fetch', () => {
    expect(content).toContain('gooseworks fetch');
  });

  it('uses gooseworks credits wrapper for credit balance', () => {
    expect(content).toContain('gooseworks credits');
  });

  it('does NOT instruct the agent to run raw curl or python json env-setup', () => {
    // The skill may mention "curl" in translation rule descriptions (replace X with Y),
    // but must never have a line where curl is the actual command being executed.
    const lines = content.split('\n');
    const executableCurlLine = lines.find(l => /^\s*curl\s/.test(l));
    expect(executableCurlLine).toBeUndefined();
    expect(content).not.toMatch(/python3 -c/);
  });

  describe('Raw API Discovery fallback', () => {
    it('contains the Raw API Discovery section', () => {
      expect(content).toContain('## Raw API Discovery (fallback)');
    });

    it('uses gooseworks orthogonal find wrapper', () => {
      expect(content).toContain('gooseworks orthogonal find');
    });

    it('uses gooseworks orthogonal describe wrapper', () => {
      expect(content).toContain('gooseworks orthogonal describe');
    });

    it('uses gooseworks call wrapper', () => {
      expect(content).toContain('gooseworks call');
    });

    it('instructs agent to tell user the cost', () => {
      expect(content).toContain('Always tell the user the cost');
    });

    it('describes the find-describe-call workflow', () => {
      expect(content).toMatch(/Search first/);
      expect(content).toMatch(/Get details/);
      expect(content).toMatch(/Call/);
    });
  });

  it('contains working directory instructions', () => {
    expect(content).toContain('## Working Directory & Output Files');
  });

  it('tells the user to run npx gooseworks login if not logged in', () => {
    expect(content).toContain('npx gooseworks login');
  });

  describe('domain router (parent skill)', () => {
    it('routes ads work to the goose-ads skill', () => {
      expect(content).toContain('goose-ads');
      expect(content).toMatch(/remix this ad with project id 123/);
    });

    it('routes graphics work to the goose-graphics skill', () => {
      expect(content).toContain('goose-graphics');
    });

    it('mentions goose-video as coming soon', () => {
      expect(content).toContain('goose-video');
    });
  });
});

describe('skills/goose-ads entry skill', () => {
  const ads = getGooseAdsSkillContent();

  it('is named/slugged goose-ads (renamed from ads-remix)', () => {
    expect(ads).toContain('name: goose-ads');
    expect(ads).toContain('slug: goose-ads');
    expect(ads).not.toContain('slug: ads-remix');
  });

  it('generates via the single backend workflow (MCP batch tools), not a local pipeline', () => {
    expect(ads).toContain('submit_remix_batch');
    expect(ads).toContain('regenerate_creative');
    expect(ads).toContain('get_remix_batch');
    // The old local-generation path must be gone (the skill no longer fetches a
    // local remix recipe or drives FAL itself). update_render_status / submit_render
    // are still NAMED — but only in a "do NOT call these" prohibition.
    expect(ads).not.toContain('remix-graphic-ad-from-reference');
    expect(ads).not.toContain('fal-proxy');
    expect(ads).toMatch(/Do NOT call FAL[\s\S]*update_render_status/);
  });

  it('still routes ad analytics to goose-skills recipes', () => {
    expect(ads).toContain('meta-ads-analyzer');
    expect(ads).toContain('ad-lead-quality-analyzer');
    expect(ads).toContain('competitor-ad-intelligence');
  });

  it('documents the app-matching defaults', () => {
    expect(ads).toContain('gpt_image_2');
    expect(ads).toContain('"4:5"');
    expect(ads).toContain('preserve_source_styling');
  });

  it('recommends templates via surprise_me_templates instead of hand-picking the catalog', () => {
    expect(ads).toContain('surprise_me_templates');
    expect(ads).toContain('create_url');
    // Explicitly tells the agent NOT to freelance a pick from the raw catalog.
    expect(ads).toMatch(/do NOT .*hand-pick|Don't hand-pick templates/i);
  });

  it('routes "choose explicitly" to the /create page in CLI mode', () => {
    expect(ads).toContain('/create?brand=<brand-slug>&cli=true');
    expect(ads).toContain('Choose explicitly');
    expect(ads).toContain('Surprise me');
    // The app surfaces the copyable remix prompt the user pastes back to close the loop.
    expect(ads).toMatch(/copyable remix prompt|paste/i);
  });

  it('asks the styling (keep original default vs match brand) before submitting', () => {
    expect(ads).toContain('Keep original');
    expect(ads).toContain('Match brand');
    expect(ads).toMatch(/default is "Keep original"/i);
  });
});

describe('skills/getEntrySkills', () => {
  it('vendors gooseworks + goose-ads + goose-video (not ads-remix)', () => {
    const names = getEntrySkills().map((s) => s.name);
    expect(names).toEqual(['gooseworks', 'goose-ads', 'goose-video']);
  });
});

describe('skills/getGooseVideoSkillContent', () => {
  const video = getGooseVideoSkillContent();

  it('is named/slugged goose-video', () => {
    expect(video).toContain('name: goose-video');
    expect(video).toContain('slug: goose-video');
  });

  it('is the LOCAL render contract with a free review gate (not the static backend batch)', () => {
    // Local render lifecycle + the free in-app review tool.
    expect(video).toContain('submit_render');
    expect(video).toContain('update_render_status');
    expect(video).toContain('update_ad_project_script');
    expect(video).toContain('set_final_render');
    // Fetches the per-format recipe by slug.
    expect(video).toContain('remix-imessage-ad-from-sample');
    // Single review-once gate over the full ingredient set (script + visuals),
    // mirrored as container-tagged ingredients.
    expect(video).toMatch(/review/i);
    expect(video).toContain('ingredients');
    expect(video).toContain('container');
    expect(video).toMatch(/end card/i);
    // Durable render-file URL, never a CDN URL.
    expect(video).toContain('render-file?path=');
    // It is NOT the static backend-batch wrapper.
    expect(video).not.toContain('submit_remix_batch');
  });
});
