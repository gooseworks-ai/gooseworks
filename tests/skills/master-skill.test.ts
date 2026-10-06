import {
  getMasterSkillContent,
  getGooseAdsSkillContent,
  getGooseVideoSkillContent,
  getGooseProductPhotosSkillContent,
  getGooseVideoLocalSkillContent,
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

    it('routes new video ads to goose-video and existing app projects to goose-video-local', () => {
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
      expect(content).not.toContain('**Where you are** — Ask');
      expect(content).toContain('Review');
      expect(content).toContain('Channels');
      expect(content).toContain('under_10k');
      expect(content).toContain('not_sure');
      expect(content).toContain('revenue / 90-day-goal / `save_progress` screen is retired');
      expect(content).toContain('taste: { hearted_ids, skipped_ids, complete }');
      expect(content).toContain('review: { action: "correct", field, value }');
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

  it('reconciles authorized user corrections and leaves inferred improvements pending', () => {
    expect(ads).toContain('Keep the brand kit in sync');
    expect(ads).toContain('knowledge_intent: "user_correction"');
    expect(ads).toContain('knowledge_intent: "agent_proposal"');
    expect(ads).toContain('read back before saying saved');
    expect(ads).not.toContain('update_brand_kit');
    expect(ads).not.toContain('upsert_brand_product');
  });
});

describe('skills/getEntrySkills', () => {
  // GOOSE-3190: the registry is the ONE source — goose-product-photos used to be
  // a hand-maintained SKILL.md on disk that this list never emitted or refreshed.
  it('vendors all five entry skills (not ads-remix)', () => {
    const names = getEntrySkills().map(s => s.name);
    expect(names).toEqual(['gooseworks', 'goose-ads', 'goose-video', 'goose-video-local', 'make-custom-video', 'goose-product-photos']);
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
  it('the router mandates brand_read BEFORE routing', () => {
    const master = getMasterSkillContent();
    expect(master).toContain('brand_read');
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
    expect(skill).toContain('brand_read');
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

// GOOSE-3677: goose-video is the client-side format picker (server ordering is
// paused); the local-render runtime makes the video, for new projects and the
// app's existing projects/batches.
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
    const pin = local.indexOf('7. Pin it');
    expect(save).toBeGreaterThan(-1);
    expect(pin).toBeGreaterThan(save);
    expect(local).toMatch(/ANY change the user asked for in this chat/);
    // GOOSE-3851: the final save keeps the approved detail instead of summarising it.
    expect(local).toMatch(/Keep the approved detail\*\*: never shorten a piece to a\s+summary/);
  });

  // GOOSE-3851: HOW the video was made is saved with the project, and a remix reuses it.
  it('saves the production manifest before pinning, with models, full prompts and fixes', () => {
    const manifest = local.indexOf('Save the production manifest');
    const pin = local.indexOf('7. Pin it');
    expect(manifest).toBeGreaterThan(local.indexOf('Save the final review set BEFORE pinning'));
    expect(pin).toBeGreaterThan(manifest);
    expect(local).toMatch(/patch: \{ production:\s+\{ version: 1, pipeline: \[\{ step, model/);
    expect(local).toMatch(/exact models and prompts you sent \(full text, guards\s+included\)/);
    expect(local).toMatch(/list every fix you had to make/);
  });

  it('starts a remix from the source implementation and applies its fixes', () => {
    expect(local).toMatch(/`remix\.direction\.implementation`, when present, is HOW it was made/);
    expect(local).toMatch(/apply every `fix` up front/);
  });

  // GOOSE-3758: the brand's saved rules reach the video, and corrections are saved back.
  it('loads kit, products and learnings, and builds the brand rules file before writing', () => {
    expect(local).toMatch(/brand_read \{ brand_id, sections: \["summary", "kit", "products", "learnings"\] \}/);
    expect(local).toContain('Step 1.7 — the brand rules file and the brand assets');
    expect(local).toContain('working/brand-rules.json');
    expect(local).toMatch(/Pronounce "<term>" as "<say_as>"/);
    expect(local.indexOf('Step 1.7')).toBeLessThan(local.indexOf('## Step 3'));
  });

  it('checks the script against the brand rules and swaps pronunciations in the voiceover only', () => {
    expect(local).toMatch(/Nothing in `never_say` appears, in words or\s+in meaning/);
    expect(local).toMatch(/comes from `products\[\]` or the kit/);
    expect(local).toMatch(/gen_vo\.py … --rules working\/brand-rules\.json/);
    expect(local).toMatch(/Captions, on-screen text and the review keep the\s+written name/);
  });

  it('saves a brand correction with brand_update facts in the same turn', () => {
    expect(local).toContain('Brand corrections stick');
    expect(local).toMatch(/brand_update \{ brand_id, knowledge_intent: "user_correction", user_statement:[^\n]+patch: \{ facts: \[\{ kind, text \}\] \} \}/);
    expect(local).toMatch(/Read\s+`brand_read` learnings back and verify/);
    expect(local).toMatch(/is NOT a\s+brand rule: don't save it/);
  });

  // GOOSE-3761 + GOOSE-3762: brand fidelity and the finished-ad gate in the final QC gate.
  it('never regenerates the logo and refuses a favicon-grade logo', () => {
    expect(local).toMatch(/never generate, redraw, re-letter or restyle a logo/);
    expect(local).toMatch(/favicon-grade, or the file's long side is under\s+256 px/);
    expect(local).toMatch(/omit `--logo` and judge the\s+text on the sheet/);
  });

  it('runs review-finished-ad on every master, caps repairs at 2, and warns instead of passing off a failure', () => {
    const gate = local.slice(local.indexOf('MANDATORY final-video QC gate'), local.indexOf('4. Publish'));
    expect(gate).toContain('review_finished_ad.py --video');
    expect(gate).toMatch(/judge every line of its `judge_on_sheet`/);
    expect(gate).toMatch(/always \*\*1080×1920 \(9:16\)\*\*/);
    expect(gate).not.toMatch(/unless the recipe says otherwise/);
    expect(gate).toMatch(/At most 2 repair rounds/);
    expect(gate).toMatch(/workflow_stage: "blocked", quality_status: "blocked", repair_pass_count: 2/);
    expect(local).toMatch(/Pin it — only a `passed` render/);
    // A blocked batch concept can't be pinned, so the batch ends blocked, not "complete".
    expect(local).toMatch(/set the batch to `blocked`, and tell the user which\s+concepts passed/);
    // The brief's ratio never produces a non-9:16 export.
    expect(local).toMatch(/video ads are ALWAYS 9:16 \(1080×1920\)/);
  });

  // GOOSE-3731: a dead sandbox must not lose paid work — save each piece as it
  // passes QC, and every run starts by reusing what is already saved.
  it('saves every piece as it goes and resumes from saved ingredients', () => {
    expect(local).toContain('## Save as you go — and resume (never pay twice for a piece)');
    // Save: upload right after QC, tagged with key + digest, into working/<role>/.
    expect(local).toContain('After EACH piece is generated AND passes its own QC, upload it right away');
    expect(local).toContain('path:\n"working/<role>/<file>", ingredient_key, input_digest');
    expect(local).toContain('from media_proxy import input_digest');
    // Confirmed keyed media persists resume state without clearing the approved review.
    expect(local).toContain("Record each confirmed piece's\n`media_id`, `path`, `ingredient_key` and `input_digest` locally");
    expect(local).toContain('Before approval, mirror the draft ingredients');
    expect(local).toContain('After approval, do NOT write `patch.script`');
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
    // Readiness belongs to the fetched renderer, not the calling project's package/cache.
    expect(local).toContain('gooseworks doctor --no-browser');
    expect(local).toContain('gooseworks doctor --renderer-script');
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

  it('checks the selected fetched browser before script review or any paid ingredient', () => {
    const fetched = local.indexOf('Save each fetched capability');
    const selected = local.indexOf('**Selected browser readiness');
    const script = local.indexOf('## Step 2.5');
    expect(selected).toBeGreaterThan(fetched);
    expect(selected).toBeLessThan(script);
    expect(local).toContain('before ANY paid ingredient');
    expect(local).toContain('including an HTML end-card renderer if used');
    expect(local).toContain('NODE_PATH');
    expect(local).toContain('PLAYWRIGHT_BROWSERS_PATH');
    expect(local).toContain("createRequire(require('node:path').resolve(actualRendererScript))");
    expect(local).toContain('chromium.launch({ timeout: 15000 })');
    expect(local).toContain('stop its own process tree on failure or timeout');
    expect(local).toContain('never combine `--no-browser` with `--renderer-script`');
    expect(local).not.toContain('--dry-run chromium');
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

  it('uses card capability independently of local execution', () => {
    expect(video).toContain('card.display_hint');
    expect(video).toContain('client: { shell: true }');
    expect(video).toContain('print no table or list of the formats');
    expect(video).toContain('print card.text_summary as returned');
    expect(video).toContain('Never offer\n  available_here:false');
    expect(video).not.toContain('always a markdown table');
    expect(video).not.toContain('Every video format runs on the customer');
  });

  it('runs brand → defaults → picker → exact runtime check → one project', () => {
    const order = ['### 1. Resolve the brand', '### 2. Keep the goal', '### 3. Show the picker',
      '### 4. Check this machine', '### 5. Create the project'].map(h => video.indexOf(h));
    order.forEach((position, i) => {
      expect(position).toBeGreaterThan(-1);
      if (i) expect(position).toBeGreaterThan(order[i - 1]);
    });
    expect(video).toContain('Never ask what the ad is for before showing formats');
    expect(video).toContain('video_project_upsert { brand_id, name, format: <template_id> }');
    expect(video).toContain('request-specific setup requirement');
    expect(video).not.toContain('finish it, then come back here');
  });

  it('preserves renderer-specific checks and falls back without silent format changes', () => {
    const setup = video.slice(video.indexOf('### 4. Check this machine'), video.indexOf('### 5. Create the project'));
    for (const required of ['gooseworks doctor --no-browser', 'fetch the selected template and its capabilities',
      'gooseworks doctor --renderer-script', 'Do not guess a renderer from a', 'exact-runtime',
      'Non-browser capabilities need only their documented runtime checks',
      'Never create paid ingredients before the selected renderer passes', 'never silently change the selected format']) {
      expect(setup).toContain(required);
    }
    expect(setup).toContain('client:{shell:false}');
  });

  it('routes existing projects first and delegates chat execution without claiming readiness', () => {
    expect(video.indexOf('## Route first')).toBeLessThan(video.indexOf('### 1. Resolve the brand'));
    expect(video).toContain('goose_run_task { brand_id, project_id, message }');
    expect(video).toContain('Never tell a chat host it needs Claude Code to start');
    expect(video).toContain('A saved free draft is not a started worker or a complete plan');
    expect(video).toContain('never claim completion or approve an empty plan');
    expect(video).toContain('Read again on a customer reply, card action or requested update');
  });

  it('preserves readiness, text demos and the complete-plan credit gate', () => {
    expect(video).toContain('A format whose card contradicts what they asked for is never Suggested');
    expect(video).toMatch(/unknown suitability is “needs review[.”]/);
    expect(video).toContain('"no demo yet"');
    expect(video).toContain('one plan, one approval with the total in credits');
    expect(video).toContain('Custom videos retain separate authenticated script/ingredient/budget gates in this chat');
  });

  it('names the keyless fal route and scopes photos_generate', () => {
    expect(video).toContain('**No FAL_KEY, ElevenLabs key or `fal_client` is ever needed.**');
    expect(video).toContain('data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">');
    expect(video).toContain('job_get { job_id }');
    expect(video).toMatch(/`photos_generate` is \*\*not\*\* a general\s+image tool/);
    expect(video).toContain('**A missing key is never a blocker.**');
  });

  it('carries no goose-lab-only syntax (wikilinks, ticket ids, lab frontmatter)', () => {
    expect(video).not.toMatch(/\[\[/);
    expect(video).not.toMatch(/GOOSE-\d+/);
    expect(video).not.toMatch(/^owner:|^level:|^variant-of:/m);
  });
});

// GOOSE-3743: idea requests go to goose-skills' ad-angle-miner (video output).
describe('skills/goose-video named formats before custom (GOOSE-3909)', () => {
  it('checks the catalog for a named format before routing to custom', () => {
    const video = getGooseVideoSkillContent();
    expect(video).toContain('Go custom only when no format fits');
    expect(video.indexOf('First check the catalog')).toBeLessThan(video.indexOf('slug: "make-custom-video"'));
  });
});

describe('skills/goose-video → ad-angle-miner', () => {
  const video = getGooseVideoSkillContent();

  it('routes "what should I make?" to ad-angle-miner with the video output', () => {
    expect(video).toContain('catalog_fetch { type: "skill", slug: "ad-angle-miner" }');
    expect(video).toMatch(/run it with the \*\*video\*\* output/);
  });

  it('keeps idea requests on ad-angle-miner without forcing a goal interview', () => {
    expect(video).toContain('Idea requests still follow ad-angle-miner with the video output');
  });
});

describe('every entry skill tells the agent how to talk to the customer', () => {
  // A local run narrated render tools, media proxies, model names and uploads to
  // a non-technical customer. The shared rule must reach every entry skill.
  it.each(getEntrySkills().map((s) => [s.name, s.content]))('%s', (_name, body) => {
    expect(body).toContain('## How to talk to the customer');
    expect(body).toMatch(/Update them only at milestones/);
    expect(body).toMatch(/Never "the cheap\s+pieces" or "the expensive render"/);
  });
});


describe('local video script research handoff', () => {
  const content = getGooseVideoLocalSkillContent();
  const strategy = content.slice(content.indexOf('## Step 2.5'), content.indexOf('## Step 3 —'));

  it('carries the miner bank, selection and full recipe into strict script checks', () => {
    expect(strategy).toContain('ad-angle-miner');
    expect(strategy).toContain('video-angle-bank.v1');
    expect(strategy).toContain('angle-context.json');
    expect(strategy).toContain('strict rule check');
    expect(strategy).toContain('selected angle id');
    expect(strategy).toContain('available assets');
  });

  it('includes silent strategy and rejects silent quality degradation', () => {
    expect(strategy).toContain('Skip speech writing and spoken checks, not the strategy step');
    expect(strategy).toContain('Never report a failed check as a pass');
    expect(strategy).not.toContain("Don't mention it to the user");
    expect(strategy).not.toContain('skip this step');
  });
});

describe('make-custom-video shared harness connection', () => {
  it('fetches shared production while keeping the GooseWorks approval and storage contract', () => {
    const { getMakeCustomVideoSkillContent } = require('../../src/skills/master-skill');
    const body = getMakeCustomVideoSkillContent();
    expect(body).toContain('expected_plan_revision');
    expect(body).toContain('preview_estimate');
    expect(body).toContain('custom_review.ingredients_approved');
    expect(body).toContain('claim');
    expect(body).toContain('requires_skills: [video-production-harness]');
    expect(body).toContain('slug:"video-production-harness"');
    expect(body).toContain('script_drafts.harness.content_hash');
    expect(body).toContain('never fall back to a vendored playbook');
    expect(body).toContain('every detailed step invoked by the orchestrator');
    expect(body).not.toContain('def assemble(');
    expect(body).not.toContain('### State 0');
    expect(body).not.toContain('Canonical content SHA256');
    expect(body).toContain('confirmed');
    expect(body).not.toContain('/Users/');
  });
  it('routes original briefs and references before template-only execution', () => {
    const { getGooseVideoSkillContent, getGooseVideoLocalSkillContent } = require('../../src/skills/master-skill');
    expect(getGooseVideoSkillContent()).toContain('make-custom-video');
    expect(getGooseVideoLocalSkillContent()).toContain('make-custom-video');
    expect(getGooseVideoLocalSkillContent()).toContain('custom_video_state');
  });
  it('records chat approval against the exact custom phase, review token and cumulative budget', () => {
    const { getMakeCustomVideoSkillContent } = require('../../src/skills/master-skill');
    const body = getMakeCustomVideoSkillContent();
    expect(body).toContain('phase:custom_review.approval_quote.phase');
    expect(body).toContain('review_token:custom_review.approval_quote.review_token');
    expect(body).toContain('total_credits:custom_review.approval_quote.total_credits');
    expect(body).toContain('custom_review.committed_credits plus the remaining quoted operations');
    expect(body).toContain('custom_review.script_token or custom_review.ingredient_token');
    expect(body).toContain('never silently attach the earlier yes to a newer token or amount');
    expect(body).toContain('require script_approved:true');
    expect(body).toContain('require ingredients_approved:true');
    expect(body).toContain('Only the authenticated customer-facing connection');
    expect(body).toContain('It cannot call patch.approve to approve its own work');
    expect(body).toContain('do not require Chrome, browser unlocks or Studio access');
    expect(body).not.toContain('A chat reply, local artifact or shared auto mode cannot replace either token');
    expect(body).not.toContain('The Studio creative page is the human review surface');
  });
  it('uses provider quotes and server-measured source duration without a priced-model list', () => {
    const { getMakeCustomVideoSkillContent } = require('../../src/skills/master-skill');
    const body = getMakeCustomVideoSkillContent();
    expect(body).toContain('supported provider estimates');
    expect(body).toContain('instead of a skill-maintained priced-model list');
    expect(body).toContain('authorized media metadata or a bounded probe');
    expect(body).toContain('do not add invented duration fields to the provider body');
    expect(body).not.toContain('Unknown/token/GPU pricing and unsupported parameter combinations are refused');
  });
});


describe('current template approval and follow-up contract', () => {
  const local = getGooseVideoLocalSkillContent();
  it('records the current full total for a single project and preserves custom gates', () => {
    expect(local).toContain('render_estimate.total_credits');
    expect(local).toContain('A single project requires recorded approval');
    expect(local).not.toContain('returns\n   `approval_not_required: true`');
    expect(local).toContain('Record independent authenticated script/ingredient approvals in this chat');
  });
  it('checks stop between paid actions and binds fixes/remixes to the watched render', () => {
    expect(local).toContain('After EVERY progress callback inspect stop');
    expect(local).toContain('SPEND_CAP_REACHED');
    expect(local).toContain('scope:"raise_cap"');
  });
  it('raises a budget only after a real limit stop, by the server quote, on a fresh yes', () => {
    expect(local).toContain("Never raise a video's budget on your own judgment");
    expect(local).toContain('say cost.raise_quote in one line');
    expect(local).toContain('scope:"raise_cap", total_credits: <to_credits>');
    expect(local).toContain('total_credits is the new budget itself, never credits to\n   add');
    expect(local).not.toContain('raise_cap_credits: <by_credits>');
    expect(local).toContain('already_raised: carry on');
    expect(local).toContain('cap_raise_total_required means read the\n   project again and send total_credits equal to cost.raise_quote.to_credits');
    expect(local).toContain('"I don\'t care\n   about the cost", is not approval of a new budget');
    expect(local).toContain('do not send raise_cap_credits for one video');
    expect(local).toContain('If cost.raise_quote is null because the plan was saved\n   again since its approval');
    expect(local).toContain('otherwise the approved budget already covers the work: carry on, do not ask');
    expect(local).toContain('After a raise, open a new render that reuses the saved pieces');
    expect(local).toContain('cap_raise_not_needed');
    expect(local).toContain('cap_raise_changed');
    expect(local).toContain('approve the plan again');
    expect(local).toContain('Never replace a supplied\n  watched render with the final');
    expect(local).toContain('fix_of_render_id');
    expect(local).toContain('remix_of_render_id');
    expect(local).toContain('retry_after_seconds');
  });
});


describe('hosted existing-video handoff and render timeline', () => {
  const local = getGooseVideoLocalSkillContent();
  it('routes projects and batches before handing off with mutually exclusive ids', () => {
    expect(local).toContain('First perform the mandatory route check below');
    expect(local).toContain('goose_run_task { brand_id, batch_id, message }');
    expect(local).toContain('never send both ids');
    expect(local).toContain('Generated custom children keep their separate make-custom-video flow');
  });
  it('opens one render after approval and before production, never after assembling the master', () => {
    expect(local).toContain('after recorded approval, BEFORE paid production');
    expect(local).toContain('reuse that render_id for progress');
    expect(local).not.toContain('open it only once you\n  actually have a rendered master');
  });
  it('preserves approval while confirmed media and progress provide resume state', () => {
    expect(local).toContain('Keep the approved review unchanged during production');
    expect(local).toContain('do NOT write `patch.script` or `script_drafts` during any');
    expect(local).toContain('confirmed media rows\nand render progress are the durable resume record');
    expect(local).not.toContain('script patch every 3–5 pieces');
    expect(local).toContain('Never reuse the earlier yes for a changed plan');
  });
  it('settles production before the final review write and preserves guarded same-render saving', () => {
    expect(local).toContain('Only after all paid production, QC, repairs and pending provider work are finished and settled');
    expect(local).toContain('Never relabel a changed plan as provenance or silently reuse approval');
    expect(local).toContain('After this write, do not start new paid work');
    expect(local).toContain('complete the same render with its existing finishing allowance and guards');
    expect(local).toContain('Save the final review set BEFORE pinning');
    expect(local).toContain('expected_review_digest');
    expect(local).toContain('a stopped/capped/failed/blocked render require diagnosis');
  });
});
