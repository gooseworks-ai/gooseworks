import {
  getMasterSkillContent,
  getGooseAdsSkillContent,
  getGooseVideoSkillContent,
  getGooseProductPhotosSkillContent,
  getEntrySkills,
  getEntrySkillNames,
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

    it('routes product photos and image animation without a separate collection command', () => {
      expect(content).toContain('goose-product-photos');
      expect(content).toContain('animate-image');
      expect(content).toContain('Brand Growth is a collection inside the normal skill catalog');
      expect(content).not.toContain('/goose-dtc');
    });

    it('routes ScrapeCreators through MCP in terminal-free clients', () => {
      expect(content).toContain('call_data_provider');
      expect(content).toMatch(/Choose the available runtime.*MCP first/i);
      expect(content).toMatch(/environment-neutral operation/i);
      expect(content).toMatch(/Do not shell out.*separate provider key/i);
      expect(content).toMatch(/gooseworks call <provider> <path>/i);
      expect(content).not.toMatch(/paid data[\s\S]*still requires the CLI for now/i);
    });
  });

  describe('common onboarding', () => {
    it('runs onboarding before the first task and resumes missing fields', () => {
      expect(content).toContain('brand_get_context { brand_id, sections: ["summary", "onboarding"] }');
      expect(content).toContain('patch: { onboarding');
      expect(content).toContain('missing_fields');
      expect(content).toContain('first-run gate for every GooseWorks task');
      expect(content).toMatch(/does not need to type[\s\S]*\/gooseworks onboard me/i);
      expect(content).toContain('start onboarding when no company/brand record exists');
      expect(content).toContain('resume only the missing steps when onboarding is incomplete');
      expect(content).toContain('continue immediately when onboarding is already complete');
      expect(content).toContain("Keep the user's original task pending");
      expect(content).toContain('It does not need to be a DTC or ecommerce brand');
      expect(content).not.toContain('get_user_context');
      expect(content).not.toContain('update_user_context');
    });

    it('contains the shared questions, conditional ads fields, and first task', () => {
      expect(content).toContain('How much do you spend on paid ads right now?');
      expect(content).toContain('Who makes your ad creatives right now?');
      expect(content).toContain('ad spend is `zero` and no advertising goal was selected');
      expect(content).toContain('What do you want to do first?');
      expect(content).toContain('connect_tools');
      expect(content).toContain('first_task');
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
    expect(ads).toContain('ads_generate');
    expect(ads).toContain('ads_creative_edit');
    expect(ads).toContain('job_get');
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

  it('treats the live MCP schema as the tool input contract', () => {
    expect(ads).toContain('Live MCP contract');
    expect(ads).toMatch(/registered MCP tool schemas are the source of truth/i);
    expect(ads).toMatch(/Ask the user only for required inputs/i);
    expect(ads).toMatch(/Omit unspecified optional settings/i);
  });

  it('recommends templates via ads_template_search surprise mode instead of hand-picking the catalog', () => {
    expect(ads).toContain('ads_template_search');
    expect(ads).toContain('mode: "surprise"');
    expect(ads).toContain('create_url');
    // Explicitly tells the agent NOT to freelance a pick from the raw catalog.
    expect(ads).toMatch(/do NOT .*hand-pick|Don't hand-pick templates/i);
  });

  it('routes browsing to the /create page in CLI mode', () => {
    expect(ads).toContain('/create?brand=<brand-slug>&cli=true');
    expect(ads).toContain('Browse in the app');
    expect(ads).toContain('Surprise me');
    // The app surfaces the copyable remix prompt the user pastes back to close the loop.
    expect(ads).toMatch(/copyable remix prompt|paste/i);
  });

  it('does not carry removed styling controls in the skill contract', () => {
    expect(ads).not.toContain('Keep original');
    expect(ads).not.toContain('Match brand');
    expect(ads).not.toContain('preserve_source_styling');
    expect(ads).not.toContain('apply_brand_colors');
    expect(ads).not.toContain('apply_brand_font');
  });

  it('uses legally safer source paths from GOOSE-2979', () => {
    expect(ads).toContain('mode: "mine"');
    expect(ads).toContain('mode: "query"');
    expect(ads).toContain('source.community_ad_ids');
    expect(ads).toMatch(/ownership\/rights input/i);
    expect(ads).toMatch(/retired curated third-party catalog/i);
    expect(ads).toMatch(/Treat competitor ads as inspiration/i);
  });

  it('exposes plan mode (compose → review/approve → generate) for parity with the app', () => {
    expect(ads).toMatch(/`ads_generate` with `mode: "plan"`/i);
    expect(ads).toContain('ads_approval_list');
    expect(ads).toContain('decision: "revise"');
    expect(ads).toContain('decision: "approve"');
    // It must be opt-in, not the default path.
    expect(ads).toMatch(/opt-in|only offer plan mode|only when the user asks/i);
  });

  it('records the user’s reaction to a creative via ads_creative_update feedback', () => {
    expect(ads).toContain('ads_creative_update');
    expect(ads).toContain('patch.feedback');
  });

  it('reconciles brand facts back into the kit — ask first, then update', () => {
    expect(ads).toContain('Keep the brand kit in sync');
    expect(ads).toContain('patch.kit');
    expect(ads).toContain('patch.products');
    // Must ask permission, not silently mutate the kit.
    expect(ads).toMatch(/ASK first|Ask first|ASK before writing|never silently mutate/i);
  });
});

describe('skills/getEntrySkills', () => {
  // GOOSE-3190: the registry is the ONE source — goose-product-photos used to be
  // a hand-maintained SKILL.md on disk that this list never emitted or refreshed.
  it('vendors all four entry skills (not ads-remix)', () => {
    const names = getEntrySkills().map(s => s.name);
    expect(names).toEqual(['gooseworks', 'goose-ads', 'goose-video', 'goose-product-photos']);
    expect(getEntrySkillNames()).toEqual(names);
  });

  it('every entry skill has non-empty content with matching frontmatter', () => {
    for (const skill of getEntrySkills()) {
      expect(skill.content.length).toBeGreaterThan(0);
      expect(skill.content).toMatch(/^---\n/);
      expect(skill.content).toContain(`slug: ${skill.name}`);
    }
  });
});

describe('skills/brand-aware router preamble (GOOSE-3193)', () => {
  it('the router mandates brand_get_context BEFORE routing', () => {
    const master = getMasterSkillContent();
    expect(master).toContain('brand_get_context');
    expect(master).toContain('Load the brand context FIRST');
    // The five things the preamble must carry into the routed skill.
    for (const field of ['voice', 'products', 'audience', 'positioning', 'research status']) {
      expect(master.toLowerCase()).toContain(field);
    }
    expect(master).toContain('Never re-ask the user for something the brand context already answers');
  });

  it.each([
    ['goose-ads', getGooseAdsSkillContent()],
    ['goose-product-photos', getGooseProductPhotosSkillContent()],
  ])('%s tells the agent to use the brand context instead of asking', (_name, skill) => {
    expect(skill).toContain('brand_get_context');
    expect(skill).toContain("don't re-ask what it already answers");
  });
});

describe('skills/getGooseProductPhotosSkillContent', () => {
  const photos = getGooseProductPhotosSkillContent();

  it('is named/slugged goose-product-photos', () => {
    expect(photos).toContain('name: goose-product-photos');
    expect(photos).toContain('slug: goose-product-photos');
  });

  it('keeps the MCP-only product-photo contract (new-catalog names)', () => {
    expect(photos).toContain('photos_generate');
    // The estimate is the same tool in dry-run form, not a separate one.
    expect(photos).toContain('dry_run: true');
    expect(photos).toContain('photos_get');
    expect(photos).toContain('photos_update');
    expect(photos).toContain('attestation_accepted');
  });

  it('names no retired product-photo tool', () => {
    for (const retired of [
      'generate_product_photos',
      'estimate_product_photos',
      'get_product_photo_generation',
      'list_product_photos',
      'approve_product_photo',
    ]) {
      expect(photos).not.toContain(retired);
    }
  });
});

describe('skills/getGooseVideoSkillContent', () => {
  const video = getGooseVideoSkillContent();

  it('is named/slugged goose-video', () => {
    expect(video).toContain('name: goose-video');
    expect(video).toContain('slug: goose-video');
  });

  it('is the LOCAL render contract with a free review gate (not the static backend batch)', () => {
    // Local render lifecycle (transitional old names until WS2-8) + the free
    // in-app review mirror (video_project_update patch.script).
    expect(video).toContain('submit_render');
    expect(video).toContain('update_render_status');
    expect(video).toContain('video_project_update');
    expect(video).toContain('set_final_render');
    // DB-driven: reads the template's recipe (catalog_fetch → recipe.atoms /
    // recipe.instructions) instead of mapping format → a hardcoded recipe slug.
    expect(video).toContain('catalog_fetch');
    expect(video).toContain('recipe.atoms');
    expect(video).not.toContain('remix-imessage-ad-from-sample');
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

  it('forbids assembling the full video before approval (GOOSE-2542)', () => {
    // The review must show the individual PIECES, not an already-stitched cut —
    // otherwise the user sees a finished video under "Review before rendering".
    expect(video).toContain('individual PIECES, never the finished cut');
    expect(video).toMatch(/never assemble the full video/i);
    expect(video).toMatch(/full cascade/i);
    // The prohibition is cross-referenced to the ticket so it can't silently regress.
    expect(video).toContain('GOOSE-2542');
  });
});
