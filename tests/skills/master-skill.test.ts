import {
  getMasterSkillContent,
  getGooseAdsSkillContent,
  getGooseVideoSkillContent,
  getGooseProductPhotosSkillContent,
  getGooseVideoLocalSkillContent,
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

    it('routes video orders to goose-video and existing app projects to goose-video-local', () => {
      expect(content).toContain('goose-video');
      expect(content).toContain('goose-video-local');
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
      expect(content).toContain('brand_onboarding { action: "status" }');
      expect(content).toContain('next_step');
      expect(content).toContain('first-run gate for every GooseWorks task');
      expect(content).toMatch(/does not need to type[\s\S]*\/gooseworks onboard me/i);
      expect(content).toContain('same saved state and step order as the web onboarding');
      expect(content).toContain('continue the original request immediately');
      expect(content).toContain("Keep the user's original task pending");
      expect(content).toContain('reply `done`');
      expect(content).toContain('do not restart onboarding');
      expect(content).toContain('start your next campaign');
      expect(content).toContain('What are you promoting');
      expect(content).not.toContain('get_user_context');
      expect(content).not.toContain('update_user_context');
    });

    it('matches the current web steps and has none of the retired questions', () => {
      expect(content).toContain('Your coworker');
      expect(content).toContain('Your company');
      expect(content).toContain('Your taste');
      expect(content).toContain('taste_url');
      expect(content).toContain('Choose your taste in GooseWorks');
      expect(content).toContain('Do not print, enumerate, or summarize');
      expect(content).toMatch(/After `done`[\s\S]*brand_onboarding \{ action: "status" \}/i);
      expect(content).toContain('First campaign');
      expect(content).toContain('Where you are');
      expect(content).toContain('Review');
      expect(content).toContain('Channels');
      expect(content).toContain('under_1k');
      expect(content).toContain('revenue');
      expect(content).toContain('90-day goal');
      expect(content).not.toContain('Who makes your ad creatives right now?');
      expect(content).not.toContain('Where did you find GooseWorks?');
      expect(content).not.toContain('connect_tools');
      expect(content).not.toContain('first_task');
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

  it('treats the live MCP schema as the tool input contract', () => {
    expect(ads).toContain('Live MCP contract');
    expect(ads).toMatch(/registered MCP tool schemas are the source of truth/i);
    expect(ads).toMatch(/Ask the user only for required inputs/i);
    expect(ads).toMatch(/Omit unspecified optional settings/i);
  });

  it('recommends templates via surprise_me_templates instead of hand-picking the catalog', () => {
    expect(ads).toContain('surprise_me_templates');
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
    expect(ads).toContain('list_user_ad_templates');
    expect(ads).toContain('search_ad_templates');
    expect(ads).toContain('remix_community_ad');
    expect(ads).toMatch(/ownership\/rights input/i);
    expect(ads).toMatch(/retired curated third-party catalog/i);
    expect(ads).toMatch(/Treat competitor ads as inspiration/i);
  });

  it('exposes plan mode (compose → review/approve → generate) for parity with the app', () => {
    expect(ads).toMatch(/approval option exposed by `submit_remix_batch`/i);
    expect(ads).toContain('list_ad_approvals');
    expect(ads).toContain('revise_ad_plan');
    expect(ads).toContain('approve_ad_plan');
    // It must be opt-in, not the default path.
    expect(ads).toMatch(/opt-in|only offer plan mode|only when the user asks/i);
  });

  it('records the user’s reaction to a creative via set_creative_feedback', () => {
    expect(ads).toContain('set_creative_feedback');
  });

  it('reconciles brand facts back into the kit — ask first, then update', () => {
    expect(ads).toContain('Keep the brand kit in sync');
    expect(ads).toContain('update_brand_kit');
    expect(ads).toContain('upsert_brand_product');
    // Must ask permission, not silently mutate the kit.
    expect(ads).toMatch(/ASK first|Ask first|ASK before writing|never silently mutate/i);
  });
});

describe('skills/getEntrySkills', () => {
  // GOOSE-3190: the registry is the ONE source — goose-product-photos used to be
  // a hand-maintained SKILL.md on disk that this list never emitted or refreshed.
  it('vendors all five entry skills (not ads-remix)', () => {
    const names = getEntrySkills().map(s => s.name);
    expect(names).toEqual(['gooseworks', 'goose-ads', 'goose-video', 'goose-video-local', 'goose-product-photos']);
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

  it('keeps the MCP-only product-photo contract', () => {
    expect(photos).toContain('generate_product_photos');
    expect(photos).toContain('estimate_product_photos');
    expect(photos).toContain('get_product_photo_generation');
    expect(photos).toContain('approve_product_photo');
    expect(photos).toContain('attestation_accepted');
  });
});

// GOOSE-3677: goose-video is the server-rendered ORDERING flow; the local-render
// runtime lives on, under its own name, for the app's existing projects/batches.
describe('skills/getGooseVideoLocalSkillContent', () => {
  const local = getGooseVideoLocalSkillContent();

  it('is named/slugged goose-video-local, with exactly one frontmatter block', () => {
    expect(local).toMatch(/^---\nname: goose-video-local\nslug: goose-video-local\n/);
    expect(local).not.toContain('name: goose-video\n');
    expect(local.match(/^---$/gm)).toHaveLength(2);
    expect(local).toContain('# GooseWorks Video Ads — local remix runtime');
  });

  it('is the LOCAL render contract with a free review gate (not the static backend batch)', () => {
    // Local render lifecycle + the free in-app review tool.
    expect(local).toContain('Playwright');
    expect(local).toContain('submit_render');
    expect(local).toContain('update_render_status');
    expect(local).toContain('update_ad_project_script');
    expect(local).toContain('set_final_render');
    // DB-driven: reads the template's recipe (get_ad_template → recipe.atoms /
    // recipe.instructions) instead of mapping format → a hardcoded recipe slug.
    expect(local).toContain('get_ad_template');
    expect(local).toContain('recipe.atoms');
    expect(local).not.toContain('remix-imessage-ad-from-sample');
    // Single review-once gate over the full ingredient set (script + visuals),
    // mirrored as container-tagged ingredients.
    expect(local).toMatch(/review/i);
    expect(local).toContain('ingredients');
    expect(local).toContain('container');
    expect(local).toMatch(/end card/i);
    // Durable render-file URL, never a CDN URL.
    expect(local).toContain('render-file?path=');
    // It is NOT the static backend-batch wrapper.
    expect(local).not.toContain('submit_remix_batch');
  });

  it('forbids assembling the full video before approval (GOOSE-2542)', () => {
    // The review must show the individual PIECES, not an already-stitched cut —
    // otherwise the user sees a finished video under "Review before rendering".
    expect(local).toContain('individual PIECES, never the finished cut');
    expect(local).toMatch(/never assemble the full video/i);
    expect(local).toMatch(/full cascade/i);
    // The prohibition is cross-referenced to the ticket so it can't silently regress.
    expect(local).toContain('GOOSE-2542');
  });
});

describe('skills/getGooseVideoSkillContent (the ordering flow)', () => {
  const video = getGooseVideoSkillContent();

  it('is named/slugged goose-video, with exactly one frontmatter block', () => {
    expect(video).toMatch(/^---\nname: goose-video\nslug: goose-video\n/);
    expect(video.match(/^---$/gm)).toHaveLength(2);
  });

  it('orders on the server through the video_* tools and renders nothing locally', () => {
    for (const tool of ['brand_list', 'video_catalog_list', 'video_project_upsert', 'video_render_run', 'video_project_read', 'job_cancel']) {
      expect(video).toContain(tool);
    }
    expect(video).not.toContain('Playwright');
    expect(video).not.toContain('submit_render');
    expect(video).not.toContain('set_final_render');
  });

  it('routes existing app projects and batches to goose-video-local first', () => {
    const route = video.indexOf('## Route first');
    expect(route).toBeGreaterThan(-1);
    expect(route).toBeLessThan(video.indexOf('### 1. Resolve the brand'));
    expect(video).toContain('fetch_skill("goose-video-local")');
    expect(video).toContain('script_drafts.recipe');
  });

  it('carries no goose-lab-only syntax (wikilinks, ticket ids, lab frontmatter)', () => {
    expect(video).not.toMatch(/\[\[/);
    expect(video).not.toMatch(/GOOSE-\d+/);
    expect(video).not.toMatch(/^owner:|^level:|^variant-of:/m);
  });

  // THE invariants. goose-lab keeps only a stub, so this test is what stops the
  // ordering flow drifting into spending a customer's money on the wrong terms.
  describe('never-drift rules', () => {
    it('the SCRIPT is approved before the expensive render', () => {
      expect(video).toContain('No approval of the SCRIPT → do not call `kind: "full"`');
      const preview = video.indexOf('kind: "partial" }`.');
      const full = video.indexOf('Only after they approve the script: `video_render_run { brand_id, project_id, kind: "full" }`');
      expect(preview).toBeGreaterThan(-1);
      expect(full).toBeGreaterThan(preview);
    });

    it('the price shown is the server quote, never a number from the page or catalogue', () => {
      expect(video).toContain('Show the price the draft returned (the `quote`), **never a number from this page or the catalogue**');
      expect(video).toContain('The quote you showed came from the server');
    });

    it('one project is one order: never a second project, never the charging tool as a status probe', () => {
      expect(video).toContain('Never create a second project; that is a second charge.');
      expect(video).toContain('Never use the charging tool as a status probe.');
    });

    // Staging shipped videos whose copy the customer had written out line by
    // line. The skill routed EVERY change through `kind: "redraft"` and never
    // mentioned `kind: "edit"`, so their lines went into the redraft `reason` —
    // where they steer the writer instead of being the script. A redraft re-runs
    // the writer by design, so the words were replaced, and charged for. This is
    // the same class as the three rules above: the customer paid for something
    // they did not agree to.
    it('verbatim customer copy goes to `edit`, never to a `redraft` reason', () => {
      // NOT a bare `toContain('kind: "edit"')`: the name already appears in a
      // failure-mode row ("use `kind: "edit"` where the format lists it"), so
      // that assertion passes on a body that never tells the agent to reach for
      // it. What has to hold is that step 6 ROUTES to it.
      expect(video).toContain('→ \`video_render_run { kind: "edit", edit: { script: { … } } }\`');
      // The choice is made on ONE question, before any tool is named, and the
      // stakes of getting it wrong are stated.
      expect(video).toContain('did they give you the actual WORDS, or did they tell you what is wrong?');
      expect(video).toContain('Only the first route below keeps their words.');
      expect(video).toContain('is a silent rewrite when they wanted what they wrote');
      // `edit` is the only word-preserving route…
      expect(video).toContain('**This is the only route that keeps copy verbatim.**');
      // …and every route that replaces the words says so IN ITS OWN BRANCH.
      // The brief-patch route is the easiest to mistake for word-preserving:
      // the customer is handing over text either way.
      expect(video).toContain('**A redraft RE-RUNS the writer: every word, and the picture on a character format, is replaced.**');
      expect(video).toContain('so **the words will be new** — this changes the instructions, not the script');
      expect(video).toContain('Their reason steers the next draft; it is not copied into it.');
      expect(video).toMatch(/Never put exact lines in `reason` expecting them back/);
      // A hard rule too, so it survives a future rewrite of step 6's prose.
      expect(video).toContain('**Their words go in an \`edit\`, never in a \`redraft\` reason.**');

      // ORDERING IS LOAD-BEARING. An agent reads step 6 in sequence and takes the
      // first branch that matches; routing verbatim copy through `redraft` is what
      // rewrote a customer's script. So the word-preserving branch must come
      // before BOTH branches that replace the words.
      const edit = video.indexOf('**They gave you the words**');
      const brief = video.indexOf('**They changed the BRIEF, not the copy**');
      const redraft = video.indexOf('**They only said what is wrong**') >= 0
        ? video.indexOf('**They only said what is wrong**')
        : video.indexOf('**They only said what\'s wrong**');
      expect(edit).toBeGreaterThan(-1);
      expect(brief).toBeGreaterThan(edit);
      expect(redraft).toBeGreaterThan(edit);

      // A format that cannot take copy must be declared at the table, not
      // discovered after the customer has handed their script over.
      expect(video).toContain('**Say which formats won\'t take their words.**');
      // And the refusal must never be answered by paraphrasing into a redraft.
      expect(video).toContain('do not paraphrase their lines into a redraft');
    });

    it('delivers the project page first and the raw mp4 second', () => {
      // The raw CloudFront mp4 was the only link a customer got: a file, not a
      // place — nothing to come back to and nothing to edit from.
      expect(video).toContain('**Lead with `video_url`**');
      expect(video).toContain('**Deliver the page, not the file.** `video_url` leads, `mp4_url` follows.');
      expect(video).toContain('`video_url` (the project page) first, `mp4_url` (the file) second');
      // Never invented: both come from the poll, once the order is done.
      expect(video).toContain('`order.status` is `done`');
    });

    // There was no never-drift case for the picture gate, which is how nobody
    // noticed customers were approving a generated face they had never been shown:
    // the backend returned `anchor_images` and the chat showed only text.
    //
    // NOT assertions on `order.preview.anchor_images` or `stage: "image"` alone —
    // both of those strings already existed in the paragraph this change rewrote,
    // so they pass on a body that still hardcodes a stale list of format names and
    // still never says what approving costs. Same trap as the bare
    // `toContain('kind: "edit"')` above. What has to hold is the BRANCH KEY, the
    // show instruction, and the three things said around it.
    it('keys the picture branch on `stage`, not on a list of format names', () => {
      // The branch header itself: resolved by the field the backend sets, so a new
      // image-anchored format joins without a skill edit.
      expect(video).toContain('**Any preview with \`order.preview.stage: "image"\`**');
      expect(video).toContain('never by a list of format names');
      expect(video).toContain('it follows what the recipe\'s steps produce');
      // The instruction is to show the URLs, not to describe the picture.
      expect(video).toContain('Show every URL in \`order.preview.anchor_images\` as a link');
      // The voiceless format reaches this branch with no spoken script at all, so
      // an agent reading it must be told not to report an empty script. Pinned
      // INSIDE the branch, not merely present somewhere in the body — a render-time
      // table row naming the format would otherwise satisfy this.
      const branch = video.indexOf('**Any preview with \`order.preview.stage: "image"\`**');
      const dance = video.indexOf('voiceless dance story');
      expect(dance).toBeGreaterThan(branch);
      expect(dance).toBeLessThan(branch + 700);
      expect(video).toContain('its stills and \`detail\` ARE the draft');
    });

    it('says what approving the picture COSTS, not only that cancelling is free', () => {
      // The old paragraph said cancelling releases the hold and stopped there. A
      // pause with no reason given reads as a broken order, and "approve" read as
      // the only way forward.
      expect(video).toContain('nothing has been rendered yet and the pause is deliberate');
      expect(video).toContain('approving starts the render and commits the credits already held');
      expect(video).toContain('cancelling instead releases the whole hold');
      expect(video).toMatch(/A pause with no reason given reads as a broken order/);

      // ORDERING IS LOAD-BEARING, for the same reason as the edit/redraft routing
      // above: an agent works step 6 in sequence. The picture has to be SHOWN
      // before it is offered any way to change or approve the draft, or the
      // customer is choosing about something they were never shown.
      const show = video.indexOf('Show every URL in \`order.preview.anchor_images\` as a link');
      const change = video.indexOf('did they give you the actual WORDS, or did they tell you what is wrong?');
      expect(show).toBeGreaterThan(-1);
      expect(change).toBeGreaterThan(show);
    });

    it('never lets a generated face go unapproved, anchor image or not', () => {
      // The chat formats draw their selfie inside the script step, so it has no
      // anchor image and the stage stays `script`. The old line ("show the
      // generated selfie or avatar as a link too, if the format made one") named
      // no field and was trivially skipped.
      expect(video).toContain('\`selfie_url\` is a generated face — show it as a link.');
      expect(video).toContain('it never appears in \`anchor_images\`');
      expect(video).toContain('It is still a face that will be in the ad, so it still needs their yes.');
      expect(video).not.toContain('Show the generated selfie or avatar as a link too, if the format made one.');
    });
  });
});
