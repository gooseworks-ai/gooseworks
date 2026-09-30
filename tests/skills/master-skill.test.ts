import {
  getMasterSkillContent,
  getGooseAdsSkillContent,
  getGooseVideoSkillContent,
  getGooseProductPhotosSkillContent,
  getGooseVideoLocalSkillContent,
  getGooseVideoAnglesSkillContent,
  getEntrySkills,
  getEntrySkillNames,
  RENDER_ROW_TOOL,
  RENDER_OPEN_ARGS,
  RENDER_UPDATE_KEY,
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
  it('vendors all six entry skills (not ads-remix)', () => {
    const names = getEntrySkills().map(s => s.name);
    expect(names).toEqual(['gooseworks', 'goose-ads', 'goose-video', 'goose-video-angles', 'goose-video-local', 'goose-product-photos']);
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

  it('remakes a Community remix from its remix block and finished reference video', () => {
    expect(local).toContain('Step 1.6 — a remix of a FINISHED video');
    expect(local).toMatch(/top-level `remix` block/);
    expect(local).toMatch(/Watch the reference video first/);
    expect(local).toMatch(/never write them, and never reuse their claims/);
  });

  it('saves the final review set before pinning, so post-approval changes are kept', () => {
    const save = local.indexOf('Save the final review set BEFORE pinning');
    const pin = local.indexOf('Pin it: `video_project_upsert { brand_id, project_id, patch: { final_render_id');
    expect(save).toBeGreaterThan(-1);
    expect(pin).toBeGreaterThan(save);
    expect(local).toMatch(/ANY change the user asked for in this chat/);
  });

  // GOOSE-3731: a dead sandbox must not lose paid work — save each piece as it
  // passes QC, and every run starts by reusing what is already saved.
  it('saves every piece as it goes and resumes from saved ingredients', () => {
    expect(local).toContain('## Save as you go — and resume (never pay twice for a piece)');
    // Save: upload right after QC, tagged with key + digest, into working/<role>/.
    expect(local).toContain('After EACH piece is generated AND passes its own QC, upload it right away');
    expect(local).toContain('path:\n"working/<role>/<file>", ingredient_key, input_digest');
    expect(local).toContain('from media_proxy import input_digest');
    // Record media_id + path in the ingredients list, batching the script patch.
    expect(local).toContain('Put the piece\'s `media_id` (`media.id`), `path`');
    expect(local).toMatch(/Batch this\s+script patch every 3–5 pieces/);
    // Resume: one media_list at start, reuse only on a matching digest.
    expect(local).toContain('ingredient_key_prefix: "",\nlimit: 100 }');
    expect(local).toContain('AND the same `input_digest`, **download it instead of\ngenerating**');
    // Download via the presigned url, never the session-auth render-file route.
    expect(local).toContain('curl -fsSL "$URL"');
    expect(local).toMatch(/Never fetch the\s+`\/api\/ads\/projects\/<id>\/render-file\?path=…` route from the sandbox/);
    // Working files on local /tmp, not the s3fs mount.
    expect(local).toContain('never the s3fs workspace mount');
    // The final master is an ingredient too.
    expect(local).toContain('ingredient_key: "final", input_digest');
  });

  it('is named/slugged goose-video-local, with exactly one frontmatter block', () => {
    expect(local).toMatch(/^---\nname: goose-video-local\nslug: goose-video-local\n/);
    expect(local).not.toContain('name: goose-video\n');
    expect(local.match(/^---$/gm)).toHaveLength(2);
    expect(local).toContain('# GooseWorks Video Ads — local remix runtime');
  });

  it('is the LOCAL render contract with a free review gate (not the static backend batch)', () => {
    // Local render lifecycle + the free in-app review tool.
    expect(local).toContain('Playwright');
    // The classic false pass: the package resolves, the browser was never downloaded.
    expect(local).toMatch(/Chromium is actually DOWNLOADED/);
    expect(local).toContain('node --version');
    // GOOSE-3726: canonical tools drive every step.
    expect(local).toContain('video_project_upsert { brand_id, project_id,\n   patch: { script: { script_drafts, script } } }');
    expect(local).toContain('patch: { final_render_id: render_id }');
    expect(local).toContain(`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_OPEN_ARGS} }`);
    expect(local).toContain(`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status: "complete", output_url, thumbnail_url } }`);
    expect(local).toContain('quality_status: "passed"');
    // DB-driven: reads the template's recipe (catalog_fetch type template →
    // recipe.atoms / recipe.instructions) instead of mapping format → a slug.
    expect(local).toContain('catalog_fetch { type: "template", slug: <source_sample_id> }');
    expect(local).toContain('recipe.atoms');
    expect(local).toContain('recipe.choices');
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

  it('uses canonical MCP tools, keeping legacy names only as a fallback column (GOOSE-3726)', () => {
    for (const tool of ['video_project_read', 'video_project_upsert', 'catalog_fetch', 'media_upload', 'media_confirm', 'account_whoami', 'brand_get_context']) {
      expect(local).toContain(tool);
    }
    // Every legacy name appears only in the fallback table / the CreativeSpec
    // prohibition, never as an instruction to call it.
    for (const legacy of ['get_upload_url', 'get_download_url', 'get_ad_credits', 'get_brand_kit', 'append_project_message']) {
      const lines = local.split('\n').filter((l) => l.includes(legacy));
      for (const line of lines) expect(line.startsWith('|')).toBe(true);
    }
    expect(local).not.toContain('list_accessible_scopes →');
    expect(local).toContain('`scope: "video_project"`');
    expect(local).toContain('upload.render_file_url');
  });

  it('works in a GooseWorks sandbox without the CLI or credentials.json (GOOSE-3726)', () => {
    const sandbox = local.indexOf('## Running in a GooseWorks sandbox');
    expect(sandbox).toBeGreaterThan(-1);
    expect(sandbox).toBeLessThan(local.indexOf('## Prerequisite — MCP + a render toolchain'));
    expect(local).toContain('[ -n "$GW_MEDIA_PROXY_TOKEN" ]');
    expect(local).toContain('pip install --quiet pillow');
    expect(local).toContain('export GW_PROJECT_ID=<project_id>');
    expect(local).toMatch(/Never call a provider with a raw key/);
    expect(local).toMatch(/no Chromium/i);
    expect(local).toMatch(/stop before any spend/);
    expect(local).toMatch(/true taste call/);
    expect(local).toContain('/tmp/gooseworks-scripts/<slug>/scripts/<name>');
    expect(local).toMatch(/CLI and credentials\.json are optional/);
    // The proxy helper falls back to the sandbox env before credentials.json.
    const helper = local.slice(local.indexOf('tok = os.environ.get("GW_MEDIA_PROXY_TOKEN")'));
    expect(helper.indexOf('GW_MEDIA_PROXY_TOKEN')).toBeLessThan(helper.indexOf('credentials.json'));
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

  it('checks project type before any local work and stops on a paused server order', () => {
    const guard = local.indexOf('## Mandatory route check before any local work or spend');
    const preflight = local.indexOf('## Prerequisite — MCP + a render toolchain');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(preflight);
    expect(local).toContain('video_project_read { brand_id, project_id }');
    expect(local).toContain('creative_plan');
    expect(local).toContain('creative_spec_revision_id');
    expect(local).toContain('script_drafts.recipe');
    expect(local).toContain('Server video orders are paused');
    expect(local).toContain('no vetted local node-execution API');
    expect(local).toContain('catalog_fetch { type: "skill", slug: "goose-video" }');
    expect(local).toContain('fetch_skill("goose-video")');
    expect(local).toMatch(/Continue below only for a verified client-side format or template remix/);
    // The server three-gate flow is gone from the local skill too.
    expect(local).not.toContain('three-gate flow');
  });

  // A client-side agent with no memory said it could not make a laptop mockup:
  // an atom asked for FAL_KEY, and photos_generate was the only tool named like
  // an image generator. The MCP route was documented only as the exit-3 relay.
  it('makes the direct MCP call the default for a one-off image, and no key a blocker', () => {
    const media = local.indexOf('### Paid media over the MCP: no key, no CLI needed');
    expect(media).toBeGreaterThan(-1);
    expect(media).toBeLessThan(local.indexOf('## MCP tools — canonical names'));
    expect(local).toContain('You\nnever need FAL_KEY, an ElevenLabs key or `fal_client`.');
    expect(local).toContain('**A one-off image or clip — call the MCP directly.**');
    expect(local).toContain('data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">');
    expect(local).toContain('job_get { job_id }');
    expect(local).toMatch(/`photos_generate` is \*\*not\*\* a general image tool/);
    // The direct call comes before the relay, which stays for atom scripts.
    expect(local.indexOf('**A one-off image or clip')).toBeLessThan(local.indexOf('**Atom scripts — the MCP relay.**'));
    expect(local).toContain('exits with code 3');
    expect(local).toContain('**A missing key is never a blocker.**');
  });
});

describe('skills/getGooseVideoSkillContent (the front door)', () => {
  const video = getGooseVideoSkillContent();

  it('is named/slugged goose-video, with exactly one frontmatter block', () => {
    expect(video).toMatch(/^---\nname: goose-video\nslug: goose-video\n/);
    expect(video.match(/^---$/gm)).toHaveLength(2);
  });

  // Server video orders are paused on the public MCP (gooseworks-app #1549):
  // the skill must not teach the quote / gate / CreativeSpec server flow.
  it('carries no server-render ordering flow', () => {
    for (const gone of ['kind: "partial"', 'gate_step_idx', 'CreativeSpec', 'approved_quote_digest',
      'execution_choice', 'kind: "redraft"', 'Do not fetch template atoms, call media']) {
      expect(video).not.toContain(gone);
    }
    expect(video).toContain('The GooseWorks server does not render\nvideos right now.');
    expect(video).toContain('**Never order a server render.**');
  });

  it('runs brand → goal → every format in a table → machine check → project → goose-video-local', () => {
    const order = ['### 1. Resolve the brand', '### 2. Ask what the ad is for', '### 3. Show every format in a table',
      '### 4. Check this machine can render it', '### 5. Create the project and hand it off'].map((h) => video.indexOf(h));
    for (let i = 0; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(-1);
      if (i) expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
    expect(video).toContain('video_catalog_list { kind: "formats", brand_id }');
    expect(video).toMatch(/gooseworks doctor/);
    expect(video).toContain('video_project_upsert { brand_id, name, format: <template_id> }');
    expect(video).toContain('catalog_fetch { type: "skill", slug: "goose-video-local" }');
    expect(video).toMatch(/needs Claude Code, Codex or Cursor/);
  });

  it('routes existing projects and batches to goose-video-local first', () => {
    const route = video.indexOf('## Route first');
    expect(route).toBeGreaterThan(-1);
    expect(route).toBeLessThan(video.indexOf('### 1. Resolve the brand'));
    expect(video).toContain('fetch_skill("goose-video-local")');
  });

  it('keeps the table rules: every row, quoted cards, demo links, table before the question', () => {
    expect(video).toContain('with **every row** the tool returned');
    expect(video).toContain('**"What it looks like" is `card.description`, quoted.**');
    expect(video).toContain('A format whose card contradicts what they asked for is never Suggested');
    expect(video).toContain('**Print the table in your message, THEN ask which one.**');
    expect(video).toContain('"no demo yet"');
  });

  it('names the keyless fal route and scopes photos_generate', () => {
    expect(video).toContain('**No FAL_KEY, ElevenLabs key or `fal_client` is ever needed.**');
    expect(video).toContain('data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">');
    expect(video).toContain('job_get { job_id }');
    expect(video).toMatch(/`photos_generate` is \*\*not\*\* a general image tool/);
    expect(video).toContain('**A missing key is never a blocker.**');
  });

  it('carries no goose-lab-only syntax (wikilinks, ticket ids, lab frontmatter)', () => {
    expect(video).not.toMatch(/\[\[/);
    expect(video).not.toMatch(/GOOSE-\d+/);
    expect(video).not.toMatch(/^owner:|^level:|^variant-of:/m);
  });
});

// GOOSE-3743: "what should I make?" — ranked video ideas, each mapped to a
// catalogue format with paid/earned-labelled references, handed to goose-video-local.
describe('skills/getGooseVideoAnglesSkillContent', () => {
  const angles = getGooseVideoAnglesSkillContent();
  const video = getGooseVideoSkillContent();

  it('is named/slugged goose-video-angles, with exactly one frontmatter block', () => {
    expect(angles).toMatch(/^---\nname: goose-video-angles\nslug: goose-video-angles\n/);
    expect(angles.match(/^---$/gm)).toHaveLength(2);
  });

  it('chains all four inputs: brand, competitor ads, social listening, the user\'s terms', () => {
    expect(angles).toContain('brand_read { brand_id, sections:');
    expect(angles).toContain('ads_template_read { brand_id, mode: "competitor", filters: { format: "video" } }');
    expect(angles).toContain('competitor_search_mentions');
    expect(angles).toContain('/v1/tiktok/search/keyword');
    expect(angles).toContain('/v2/instagram/reels/search');
    expect(angles).toMatch(/customer's own terms first/);
  });

  it('asks once before any paid listening', () => {
    expect(angles).toContain('### 3. Paid social listening — ask once, then run');
    expect(angles).toContain('**Ask once before paid listening.**');
  });

  it('keeps paid boosts apart from earned reach', () => {
    expect(angles).toContain('### 4. Label every reference paid or earned');
    expect(angles).toContain("**Never treat a paid post's view count as proof.**");
    expect(angles).toMatch(/caps at 6/);
  });

  it('maps every idea to a catalogue format and cites real links', () => {
    expect(angles).toContain('video_catalog_list { kind: "formats", brand_id }');
    expect(angles).toContain('**Every idea cites at least one real link you actually retrieved.**');
    expect(angles).toContain('At least 10 ideas');
  });

  it('hands picked ideas to goose-video-local with no manual step', () => {
    const table = angles.indexOf('### 7. Show the ideas as one table');
    const handoff = angles.indexOf('### 8. "Make these"');
    expect(table).toBeGreaterThan(-1);
    expect(handoff).toBeGreaterThan(table);
    expect(angles).toContain('video_project_upsert { brand_id, name: "<hook, short>", format: <template_id> }');
    expect(angles).toContain('catalog_fetch { type: "skill", slug: "goose-video-local" }');
    expect(angles).toContain('gooseworks doctor');
  });

  it('goose-video offers it when the customer is not sure what to make', () => {
    expect(video).toContain('catalog_fetch { type: "skill", slug: "goose-video-angles" }');
    expect(video).toMatch(/find ideas first\s+with `goose-video-angles`/);
  });

  it('carries no goose-lab-only syntax (wikilinks, ticket ids, lab frontmatter)', () => {
    expect(angles).not.toMatch(/\[\[/);
    expect(angles).not.toMatch(/GOOSE-\d+/);
    expect(angles).not.toMatch(/^owner:|^level:|^variant-of:/m);
  });
});
