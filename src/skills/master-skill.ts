/**
 * The CLI installs two vendored ENTRY skills into ~/.agents/skills/:
 *   - `gooseworks`  — the PARENT router (getMasterSkillContent): GTM/data toolkit
 *     PLUS a domain router that hands ads/graphics/video work to the dedicated
 *     `goose-*` skills below.
 *   - `goose-ads`   — the ads entry/contract (getGooseAdsSkillContent): ad creative
 *     (remix, brand research) AND ad analytics/intelligence. Formerly `ads-remix`.
 * Each is a separate Claude Code skill; Claude auto-loads whichever matches the
 * task by its description. They are domain-scoped on purpose — do NOT merge them.
 *
 * Sibling domain skills NOT vendored here (fetched live from goose-skills):
 *   - `goose-graphics` — charts/slides/infographics/branded visuals. Installed via
 *     `gooseworks install --with goose-graphics` or fetched on demand.
 *   - `goose-video`    — video ad remix: fetches the per-format recipe by slug,
 *     renders LOCALLY (Playwright + ffmpeg + media proxies), mirrors a script for
 *     in-app review, saves the MP4 back over MCP (getGooseVideoSkillContent).
 *
 * Recipe skills (remix-graphic-ad-from-reference, brand-research, meta-ads-analyzer,
 * …) are NOT vendored here — they live in goose-skills and are fetched live on
 * demand via `gooseworks fetch <slug>`, so they're always current.
 */
export interface EntrySkill {
  /** Install dir name under ~/.agents/skills/ AND the skill `name`. */
  name: string;
  content: string;
}

/** Every entry skill the CLI vendors + installs. */
export function getEntrySkills(): EntrySkill[] {
  return [
    { name: 'gooseworks', content: getMasterSkillContent() },
    { name: 'goose-ads', content: getGooseAdsSkillContent() },
    { name: 'goose-video', content: getGooseVideoSkillContent() },
  ];
}

/**
 * Returns the GTM master SKILL.md content (the `gooseworks` entry skill).
 * It teaches the coding agent how to discover and use GooseWorks skills on
 * demand via the `gooseworks` CLI commands.
 *
 * The CLI handles credentials loading internally, so the agent does not
 * need to read ~/.gooseworks/credentials.json or set environment
 * variables — every command auto-loads the API key.
 */
export function getMasterSkillContent(): string {
  return `---
name: gooseworks
slug: gooseworks
description: >
  GooseWorks data toolkit. Search and scrape Twitter/X, Reddit, LinkedIn, websites, and the web.
  Find people, emails, and company info. Enrich contacts and companies.
  GTM tasks: lead generation, prospect research, ICP identification, competitor analysis, outbound list building.
  LinkedIn scraping: extract post engagers, commenters, profile data, and job postings.
  Reach for it when you need data at scale, sources behind auth, or a specific provider — not as
  a replacement for your built-in web search/fetch on quick, one-off lookups.
category: general
version: 1.0.0
author: GooseWorks
tags: [gooseworks, data, scraping, search, reddit, twitter, linkedin, email, people, research, gtm, leads, prospecting]
---

# GooseWorks

You have access to GooseWorks — a toolkit with 100+ data skills for scraping, research, lead generation, enrichment, and more. Reach for a GooseWorks skill when it's the right tool: data at scale, sources behind auth, or specific providers (Twitter/X, Reddit, LinkedIn, people/company enrichment).

This skill is also the **parent router** for the GooseWorks family. Data/GTM work you handle here (see "How to Use"); specialized work you hand off to a dedicated \`goose-*\` skill.

## Route to the right skill FIRST

Before anything else, check whether the request belongs to a specialized domain. If so, **switch to that skill** instead of the data flow below:

| If the user wants… | Route to | How |
| --- | --- | --- |
| Remix/make an ad, research a brand for ads, OR analyze ad performance — Meta/Google ad campaigns, creative fatigue, CAC/lead quality, competitor ad intel, ad angles & hooks | **\`goose-ads\`** | Installed locally as an entry skill. Just use it. If unavailable, run \`gooseworks install --claude\`. |
| Charts, infographics, slides, social graphics, branded visual designs from a style/format | **\`goose-graphics\`** | If installed locally, use it. Otherwise \`gooseworks fetch goose-graphics\` (or \`gooseworks install --claude --with goose-graphics\`). |
| Make a **video** ad — remix a video ad template (e.g. iMessage chat-reveal), or "make the video for project <id>" | **\`goose-video\`** | Installed locally as an entry skill. Just use it. If unavailable, run \`gooseworks install --claude\`. |
| Anything else — scraping, research, lead gen, enrichment, any data lookup | (stay here) | Follow "How to Use" below. |

Examples — all of these route to \`goose-ads\`, not the data flow: "remix this ad with project id 123", "make an ad for my product", "research my brand", "why is my Meta campaign underperforming", "which creatives should I cut".

## Setup

All commands below auto-load credentials from \`~/.gooseworks/credentials.json\`. If a command exits with "Not logged in", tell the user to run: \`npx gooseworks login\`. To log out: \`npx gooseworks logout\`.

To check credit balance:
\`\`\`bash
gooseworks credits
\`\`\`

## How to Use

### If a specific skill is requested (e.g. --skill <slug> or "use the <name> skill")
Skip search and go directly to **Step 2** with the given slug.

### Step 1: Search for a skill
When the user asks you to do ANY data task (scrape reddit, find emails, research competitors, etc.) **without specifying a skill name**, search the skill catalog first:
\`\`\`bash
gooseworks search "reddit scraping"
\`\`\`

### Step 2: Fetch the skill
Once you have a skill slug, fetch its full content and scripts:
\`\`\`bash
gooseworks fetch <slug>
\`\`\`

This prints a JSON object with:
- **content**: The skill's instructions (SKILL.md) — follow these step by step
- **scripts**: Python scripts the skill uses — save them locally and run them
- **files**: Extra files the skill needs (configs, shared tools like \`tools/apify_guard.py\`) — save them relative to \`/tmp/gooseworks-scripts/\`
- **requiresSkills**: Array of dependency skill slugs (for composite skills)
- **dependencySkills**: Full content and scripts for each dependency

### Step 3: Set up dependency skills (if any)
If the response includes \`dependencySkills\` (non-empty array), set up each dependency BEFORE running the main skill:
1. For each dependency in \`dependencySkills\`:
   - Save its scripts to \`/tmp/gooseworks-scripts/<dep-slug>/\`
   - Install any pip dependencies it needs
2. When the main skill's instructions reference a dependency script (e.g. \`python3 skills/reddit-scraper/scripts/scrape_reddit.py\`), run it from \`/tmp/gooseworks-scripts/<dep-slug>/\` instead

### Step 4: Set up and run the skill
Follow the instructions in the skill's \`content\` field. **Save ALL files from both \`scripts\` AND \`files\` before running anything:**

> **Credential translation rule:** Individual skill instructions may contain a legacy \`## Setup\` block with \`export GOOSEWORKS_API_KEY=$(python3 ...)\` and raw \`curl\` commands. **Replace those with the clean equivalents below.**
> - **Credentials (only needed before running Python scripts, NOT before gooseworks commands):** replace the python one-liner exports with \`eval $(gooseworks env)\`. Skip entirely if you are only using \`gooseworks call\` — it loads credentials automatically.
> - **Orthogonal run:** replace \`curl ... /v1/proxy/orthogonal/run ... -d '{"api":"X","path":"/Y","body":{...}}'\` with \`gooseworks call X /Y --body='{...}'\`
> - **Direct proxy:** replace \`curl ... /v1/proxy/<provider>/<path> ... -d '{...}'\` with \`gooseworks call <provider> <path> --body='{...}'\`
> - **Orthogonal search:** replace \`curl ... /v1/proxy/orthogonal/search ... -d '{"prompt":"..."}'\` with \`gooseworks orthogonal find "..."\`

1. Save each script from \`scripts\` to \`/tmp/gooseworks-scripts/<slug>/scripts/\` — **NEVER save scripts into the user's project directory**
2. **IMPORTANT: Also save everything from \`files\`** — these contain required modules (like \`tools/apify_guard.py\`) that scripts import at runtime:
   - Files starting with \`tools/\` → save to \`/tmp/gooseworks-scripts/tools/\` (shared path, NOT inside the skill dir)
   - All other files → save to \`/tmp/gooseworks-scripts/<slug>/<path>\`
   - **If you skip this step, scripts will crash with ImportError**
3. Install any required pip dependencies mentioned in the instructions
4. Run the script with the parameters described in the instructions
5. When instructions reference dependency scripts, use paths from Step 3: \`/tmp/gooseworks-scripts/<dep-slug>/<script>\`

## Raw API Discovery (fallback)

If no GooseWorks skill matches the user's request, you can discover and call **any API** through the Orthogonal gateway. This gives you access to 300+ APIs (Hunter, Clearbit, PDL, ZoomInfo, etc.) without needing separate API keys.

### Search for an API
Find APIs that can handle the task:
\`\`\`bash
gooseworks orthogonal find "find email by name and company"
\`\`\`
Returns matching APIs with endpoint descriptions and per-call pricing.

### Get endpoint details
Before calling an API, check its parameters:
\`\`\`bash
gooseworks orthogonal describe hunter /v2/email-finder
\`\`\`

### Call the API
Execute the API call (billed per call based on provider cost):
\`\`\`bash
gooseworks call hunter /v2/email-finder --query='{"domain":"stripe.com","first_name":"John"}'
\`\`\`
- Use \`--body='{...}'\` for POST body parameters
- Use \`--query='{...}'\` for query string parameters
- Output: JSON response data, followed by a \`Cost: <N> credits\` line when applicable
- **Always tell the user the cost** after each call

The same \`gooseworks call\` command also handles direct-proxy providers (apify, apollo, crustdata):
\`\`\`bash
gooseworks call apify acts/parseforge~reddit-posts-scraper/runs --body='{"subreddit":"ClaudeAI"}'
\`\`\`

### Workflow
1. Search first (\`gooseworks orthogonal find\`) — pick the best API + endpoint
2. Get details (\`gooseworks orthogonal describe\`) — understand required parameters
3. Call (\`gooseworks call\`) — invoke with the right parameters
4. Parse the JSON output for the actual API result

## Working Directory & Output Files

- **Scripts** always go to \`/tmp/gooseworks-scripts/<slug>/\` — NEVER the user's project directory
- **Output files** (CSVs, reports, data exports) go to a **GooseWorks working directory**:
  1. If the user specifies where to save results, use that location
  2. Otherwise, default to \`~/Gooseworks/\` — create it if it doesn't exist
  3. **Before saving output**, confirm with the user: *"I'll save the results to ~/Gooseworks/<filename>. Would you like a different location?"*
  4. Organize outputs in subfolders by task type when it makes sense (e.g. \`~/Gooseworks/reddit-scrapes/\`, \`~/Gooseworks/research/\`)
- **Never overwrite existing files** without asking. If a file already exists, append a timestamp or ask the user

## External Endpoints

The \`gooseworks\` CLI sends authenticated requests (Bearer \`GOOSEWORKS_API_KEY\`) to:

| Endpoint | Method | Wrapped by |
|----------|--------|------------|
| \`$GOOSEWORKS_API_BASE/api/skills/search\` | POST | \`gooseworks search\` |
| \`$GOOSEWORKS_API_BASE/api/skills/catalog/:slug\` | GET | \`gooseworks fetch\` |
| \`$GOOSEWORKS_API_BASE/v1/credits\` | GET | \`gooseworks credits\` |
| \`$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/search\` | POST | \`gooseworks orthogonal find\` |
| \`$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/details\` | POST | \`gooseworks orthogonal describe\` |
| \`$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/run\` | POST | \`gooseworks call\` (orthogonal-routed providers) |
| \`$GOOSEWORKS_API_BASE/v1/proxy/{apify,apollo,crustdata}/*\` | Various | \`gooseworks call\` (direct-proxy providers) |

## Security & Privacy

- All API calls are authenticated via Bearer token stored locally in \`~/.gooseworks/credentials.json\` (file mode 0600)
- No credentials are hardcoded or sent to third parties
- API keys for external services (Apify, Apollo, etc.) are managed server-side — your token never touches them
- Scripts run locally on your machine; only API requests go through GooseWorks servers. Skill scripts are open source (github.com/gooseworks-ai/goose-skills) — read or pin them before running
- Credit usage is tracked per-call and visible via \`gooseworks credits\`

## Rules

1. **Consider a GooseWorks skill when it fits the task** — scraping, research, lead gen, enrichment, especially at scale, behind auth, or from a specific source. For a quick lookup your built-in tools are fine; use your judgement and pick the best tool for the user.
2. **Before paid operations**, tell the user the estimated credit cost
3. **If a \`gooseworks\` command exits with "Not logged in"**: tell the user to run \`npx gooseworks login\`
4. **Parse JSON responses** and present data in a readable format to the user
5. **When running scripts**: save to \`/tmp/gooseworks-scripts/\`, install pip deps, then execute. NEVER pollute the user's project directory
6. **Output files default to \`~/Gooseworks/\`** — always confirm with the user before saving
7. **Prefer \`gooseworks call\` over raw curl** — if it returns an error, first fix the parameters (check types, required fields, format) and retry. Only fall back to raw curl if you have strong reason to believe it is a CLI bug, not a parameter issue.
`;
}

/**
 * Returns the goose-ads entry SKILL.md content (the `goose-ads` entry skill,
 * formerly `ads-remix`).
 *
 * This is the ads domain skill and a THIN WRAPPER over the backend's single ad
 * generation workflow (adRemixBatchesService, exposed via the new
 * mcp__gooseworks__*_remix_batch / regenerate_creative tools — the SAME workflow
 * the ads frontend uses). The skill no longer generates images, manages renders,
 * or uploads files itself; the backend reserves credits, runs the cloud pipeline,
 * and bills. The skill ALSO routes ad analytics/intelligence to recipe skills
 * fetched on demand from goose-skills. It is SEPARATE from the `gooseworks` GTM
 * skill — different domain, different tools — and Claude loads it (or the
 * `gooseworks` parent router hands off to it) when the user wants to make/edit an
 * ad, research a brand for ads, or analyze ad performance.
 */
export function getGooseAdsSkillContent(): string {
  return `---
name: goose-ads
slug: goose-ads
description: >
  GooseWorks ads skill — create, edit, AND analyze ad creative. Remix a static (image) ad
  template into a branded ad for the user's product, edit/re-roll an existing creative,
  research a brand for ads, OR analyze ad performance (Meta/Google campaign diagnostics,
  creative fatigue, CAC & lead quality, competitor ad intelligence, ad angles & hooks). Use
  when the user says "remix this ad", references a static ad template id/slug, asks to "make
  an ad", "edit this ad", "research my brand", or asks to analyze/diagnose ad campaigns.
  Generation runs through the GooseWorks backend's single cloud workflow (the same one the ads
  app uses) — credits are reserved and billed server-side. Analytics recipes are fetched from
  goose-skills on demand.
category: ads
version: 2.0.0
author: GooseWorks
tags: [gooseworks, ads, remix, static-ad, brand, creative, image, analytics, meta-ads, performance]
---

# GooseWorks Ads — create, edit & analyze

The GooseWorks ads skill. Two jobs:

1. **Create / edit ad creative** — a **thin wrapper** over the backend's single generation
   workflow. You pick the brand + template(s) and submit ONE batch; the **backend** runs the
   whole pipeline (compose → generate → persist → judge), reserves and bills credits, and
   stores the renders. You do NOT generate images, call FAL, manage render rows, or upload
   files — those are gone. This is the exact same workflow the GooseWorks ads app uses, so the
   skill and the app can never drift.
2. **Analyze ad performance** — fetch ad-analytics recipes from goose-skills on demand
   (these are unrelated to generation; see "Analyze / intelligence" below).

## Prerequisite — the GooseWorks MCP server is REQUIRED

Everything goes through the \`mcp__gooseworks__*\` tools. If they are not available, **stop and
tell the user to run \`gooseworks install --claude --mcp\`** (and restart Claude Code). There is
no HTTP/file fallback — the REST ad endpoints are session-cookie-only and reject your token.

## Identity & credits

- One agent-scoped token authenticates the \`gooseworks\` MCP tools. Never print it. The tools
  resolve your org automatically — you do NOT resolve an "Ads agent" or pass \`target\` for the
  generation tools.
- **Credits are handled entirely by the backend.** \`submit_remix_batch\` reserves the estimated
  cost up front (it errors with \`insufficient_credits\` if the wallet is short — relay the
  message and stop) and bills only the images that actually complete. Call
  \`estimate_remix_batch\` first to tell the user the cost; \`gooseworks credits\` shows balance.

## Defaults — match the app (priority: frontend, then backend)

When the user doesn't specify, submit with the **ads app's** defaults so skill output matches
what they'd get in the UI. **Pass these explicitly:**

- \`variants\`: **1** per template
- \`ratios\`: **["4:5"]** (Meta feed vertical)
- \`engine\`: **"gpt_image_2"**
- \`quality\`: **"medium"**
- \`preserve_source_styling\`: **true** (keep the template's own colours/fonts; only restyle to
  the brand palette if the user explicitly asks to "match my brand colours")

If the user asks for something the app exposes (more variants, a different ratio like 1:1 or
9:16, a faster engine, higher quality), pass that instead. Omitting a field lets backend policy
decide — fine, but prefer sending the app defaults for predictable parity.

## The generation tools (the new, single-workflow surface)

- \`submit_remix_batch { brand_id, items, prompt?, product_name?, preserve_source_styling?,
  reference_image_urls?, allow_without_product_image?, engine?, quality? }\` — **the one call
  that makes ads.** \`items\` is \`[{ template_id, variants?, ratios? }]\` (≤20 templates).
  Returns the batch with a \`links\` block (\`brand_url\` + per-creative \`app_url\`). If the brand's
  research isn't finished yet the batch comes back \`status: "queued"\` — it auto-runs the moment
  research completes; tell the user it'll appear shortly, don't error.
- \`estimate_remix_batch { items, engine?, quality? }\` — cost preview (images, credits_per_image,
  total_credits, available_credits). \`template_id\` accepts a uuid OR a slug. Reserves nothing. Use
  to quote the cost first. Check \`unknown_template_ids\` in the response — any token there didn't
  resolve (submit would 404 on it); don't quote a cost that silently dropped a bad id.
- \`get_remix_batch { batch_id }\` — poll status. Returns each creative with its renders and
  \`completed\`/\`failed\`/\`pending\` counts, plus \`links\`. A creative is done when its \`pending\` is 0
  — NOT when \`current_render_url\` is set (during a regenerate that field still points at the prior
  image). Each render carries \`age_seconds\` (since queued) and \`elapsed_seconds\` (time generating):
  use them to tell a slow-but-healthy render from a stuck one. A render only failed when its
  \`status\` is \`"failed"\` — never assume a stall and re-submit, that double-bills.
- \`list_brand_creatives { brand_id, limit?, offset? }\` — the brand's gallery feed (newest
  first) + \`brand_url\`. Alternative poll target; also use to show everything made for a brand.
- \`regenerate_creative { project_id, mode?, prompt?, source_render_id?, ... }\` — **edit / re-roll
  one existing creative** through the same pipeline. \`mode: "variation"\` (default) re-rolls from
  the template; \`"edit"\` makes a targeted change to a specific render (\`prompt\` + \`source_render_id\`
  required); \`"exact"\` runs \`prompt\` verbatim against that render's references. Returns a
  single-item batch — poll it with \`get_remix_batch\`.

## Reading the brand & picking inputs (still MCP, read-only)

- \`get_brand_kit { brand_id }\` — the CANONICAL brand context (name, description, audience,
  voice, brandType, valueProps, colors, typography, logoUrl, \`products[]\`, presigned
  \`referenceImages[]\`). Read this to choose \`product_name\` and any \`reference_image_urls\`.
- \`list_ad_brands { query? }\` / \`get_ad_brand { brand_id }\` — find/fetch a brand. Pass \`query\` to
  filter by name (case-insensitive) instead of listing every brand; rows are lean (no \`brand_kit\` —
  read \`get_brand_kit\` for the full kit).
- \`get_static_ad_template { template_id }\` — resolve a template (slug OR uuid; public catalog
  AND your org's private templates). Confirms it exists before you submit.
- \`remix_community_ad { community_id }\` — a **Community** ad id is an \`ad_project\` id, not a
  template id. Call this FIRST to snapshot it into a private template, then use the returned
  template \`id\` in \`items\`.
- \`create_user_ad_template { workspace_path }\` — "bring your own ad": upload the user's own
  image as a private template, then remix it like any other.
- \`get_ad_project\` / \`append_project_message\` — inspect a creative / leave a note on its thread.

## Workflow — make ads from a template

1. **Resolve the brand.** \`list_ad_brands\` by name/site → \`get_brand_kit { brand_id }\`. If the
   kit's \`researchStatus\` isn't \`complete\`, you can still submit (the batch queues and runs when
   research finishes) — just tell the user. Use the kit to pick \`product_name\` (a real entry from
   \`products[]\`, not a guess) and, if the user supplied product photos, \`reference_image_urls\`.
2. **Resolve the template(s).** \`get_static_ad_template { template_id }\` for each. For a Community
   ad, \`remix_community_ad\` first; for an uploaded image, \`create_user_ad_template\` first.
3. **(Optional) Craft the steering prompt.** The \`prompt\` is OPTIONAL — this is where the skill
   adds value: turn the user's intent into a concise steering note (e.g. tone, season, emphasis).
   Don't over-specify; the backend pipeline + brand kit handle palette, fonts, product swap.
4. **(Optional) Quote the cost.** \`estimate_remix_batch { items, engine, quality }\` → tell the user.
5. **Submit ONE batch.** \`submit_remix_batch { brand_id, items, prompt?, product_name?, engine,
   quality, preserve_source_styling }\` using the app defaults above. Keep the returned \`batch_id\`
   and \`links\`.
6. **Poll until done.** \`get_remix_batch { batch_id }\` (or \`list_brand_creatives\`) every ~20-30s
   until every creative's \`pending\` is 0. Most images finish in a few minutes; text-heavy templates
   and \`quality: high\` take longer. Read each render's \`elapsed_seconds\` rather than guessing — a
   render that's still \`running\` is healthy; do NOT re-submit thinking it stalled (that double-bills).
7. **Hand back the links** from the batch's \`links\` block — \`brand_url\` (gallery) and each
   creative's \`app_url\` — copied verbatim. Never end on just "done" or a file path.

## Workflow — edit an existing ad

User wants to tweak a creative they already made → \`regenerate_creative\`:
- "make another version / different take" → \`mode: "variation"\` (optionally new \`prompt\`,
  \`product_name\`, \`ratios\`).
- "change X in this exact image" → \`mode: "edit"\`, \`source_render_id\` = the render to edit,
  \`prompt\` = the change.
- "run exactly this prompt on the product" → \`mode: "exact"\`, \`source_render_id\` + \`prompt\`.
Then poll with \`get_remix_batch\` and hand back the links, same as above.

## Brand research

Research normally runs in the GooseWorks backend (on onboarding). Just read the result with
\`get_brand_kit\`. If a brand doesn't exist yet, you may \`create_ad_brand\` and let backend
research run; you don't need to research locally. (A standalone local recipe still exists via
\`gooseworks fetch brand-research\` if the user explicitly wants the agent to do it.)

## Analyze / intelligence (fetched recipes — NOT generation)

These are analysis recipes you fetch from goose-skills with \`gooseworks fetch <slug>\` and
follow; they do NOT touch the generation tools or credits-for-images. Pick the closest match;
if unsure, \`gooseworks search "<what the user wants>"\` first:
- **Campaign performance diagnosis** ("why is my Meta/Google campaign underperforming",
  creative fatigue, learning phase, pacing, auction overlap) → \`gooseworks fetch meta-ads-analyzer\`
  (or \`ad-campaign-analyzer\` for cross-platform).
- **Lead/CAC quality** ("are these ads driving qualified leads", true CAC vs vanity CPA,
  Scale/Keep/Investigate/Cut) → \`gooseworks fetch ad-lead-quality-analyzer\`.
- **Competitor ad intelligence** ("what ads are competitors running") →
  \`gooseworks fetch competitor-ad-intelligence\` (Meta Ad Library: \`meta-ad-scraper\`;
  Google: \`google-ad-scraper\`).
- **Creative ideation** (ad angles, winning hooks) → \`gooseworks fetch ad-angle-miner\` /
  \`gooseworks fetch trending-ad-hook-spotter\`.
- **Policy / landing-page checks** → \`gooseworks fetch meta-ad-policy-checker\` /
  \`gooseworks fetch ad-to-landing-page-auditor\`.

Save their scripts to \`/tmp/gooseworks-scripts/<slug>/\` and follow their instructions. These
run through the \`gooseworks\` CLI (\`gooseworks fetch\` / \`gooseworks call\`), like the GTM skills.

## Rules

- **MCP required** — if \`mcp__gooseworks__*\` is unavailable, stop and tell the user to run
  \`gooseworks install --claude --mcp\`.
- **One backend workflow** — generation is \`submit_remix_batch\` / \`regenerate_creative\` ONLY.
  Do NOT call FAL, the media proxy, \`submit_render\`, \`update_render_status\`, or upload render
  files yourself; do NOT \`gooseworks fetch\` a local remix recipe to generate. The backend owns it.
- **Always end a successful run with the links** from the batch's \`links\` block (\`brand_url\` +
  each creative's \`app_url\`), copied verbatim. Never end on just "done" or a file path.
- **Quote cost before generating** when it's non-trivial (use \`estimate_remix_batch\`), and
  relay \`insufficient_credits\` plainly if the submit is rejected — don't retry blindly.
- **Don't busy-loop** — poll \`get_remix_batch\` on a sensible interval (~20-30s); a \`queued\`
  batch is waiting on research and will start on its own.
`;
}

/**
 * Returns the goose-video entry SKILL.md content (the `goose-video` entry skill).
 *
 * Unlike `goose-ads` (static images, generated 100% server-side via the remix
 * batch tools), VIDEO ads render LOCALLY in the user's own Claude Code: the app
 * pre-creates the project and hands the user a paste prompt; this skill fetches
 * the per-format recipe by slug from goose-skills, renders on the user's machine
 * (Playwright + ffmpeg + the GooseWorks media proxies), mirrors the script for a
 * free in-app review, then saves the finished MP4 back over MCP. The app is the
 * viewer + review surface. The `gooseworks` parent router hands video here; Claude
 * also loads it by description.
 */
export function getGooseVideoSkillContent(): string {
  return `---
name: goose-video
slug: goose-video
description: >
  GooseWorks video ads — remix a video ad template (iMessage chat-reveal, more coming) into a
  branded video ad for the user's product. Renders LOCALLY on the user's machine (Playwright +
  ffmpeg + GooseWorks media proxies) and saves the finished MP4 back to the project over MCP.
  Use when the user says "make the video for project <id>", references a video ad project or
  template, or asks to remix a video ad. Unlike goose-ads (static images, generated server-side),
  video renders locally and reports progress + the result back through the gooseworks MCP tools.
category: ads
version: 0.1.0
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, local-render, byoa]
---

# GooseWorks Video Ads — local remix runtime

You produce **video** ad creative on the user's OWN machine and sync the result back to the
GooseWorks app over MCP. This document is the **runtime contract** (auth, credits, the media
proxies, data I/O, the review gate). A separate **recipe skill** — fetched per format — tells
you *what to make*; read both, and this doc wins on any conflict about the environment.

You run inside the user's own Claude Code session (they pasted an instruction with a project
id). The app NEVER runs you — it is the viewer + review surface; you are the renderer.

## Prerequisite — MCP + a local toolchain (Phase 0 preflight)

- The \`mcp__gooseworks__*\` tools are REQUIRED. If they're unavailable, stop and tell the user
  to run \`gooseworks install --claude --mcp\` and restart Claude Code. There is no REST fallback.
- This is a LOCAL render. Run \`gooseworks doctor\` FIRST — it checks login, the MCP server,
  **ffmpeg** + **ffprobe**, and **Playwright Chromium** in one shot. If it reports any ✗, relay
  the exact fix it prints (e.g. \`brew install ffmpeg\`, \`npx playwright install chromium\`) and
  stop — don't half-render.

## Identity, token, credits

- Read \`~/.gooseworks/credentials.json\` → \`api_key\` (your agent token), \`api_base\`, \`agent_id\`.
  Never print the token.
- **CRITICAL — target the org-default Ads agent on EVERY file op.** The app serves project files
  (the render-file route) from the org's DEFAULT agent, but MCP file writes default to your
  token's pinned agent — which can be a DIFFERENT agent, so a render written with the default
  scope is **invisible in the app**. First resolve the Ads agent: \`list_accessible_scopes\` → the
  scope with \`is_org_default: true\` → its \`agent_id\` is \`ADS_AGENT\`. Then pass
  \`target: { type: "agent", agent_id: ADS_AGENT }\` on EVERY \`get_upload_url\` / \`get_download_url\`
  / \`write_file\` / \`list_directory\` / \`read_file\` — NEVER omit \`target\`.
- Media generation (FAL / ElevenLabs) is billed to the agent through the GooseWorks proxies.
  \`submit_render { kind: "full" }\` debits **1 ad credit at row creation** — so sequence it LAST
  (render + verify a good MP4 first), and never re-submit on a guess (that double-bills). Call
  \`get_ad_credits\` first; the user can check \`gooseworks credits\`.

## Step 1 — resolve the project, source, brand

1. \`get_ad_project { project_id }\` → keep \`brand_id\`, \`source_sample_id\`, \`name\`, \`status\`.
2. \`get_ad_template { template_id: source_sample_id }\` → the source video: \`media_url\`,
   \`recipe\`, \`format\` (e.g. "imessage"), \`extracted_script\`, \`how_to\`, \`remix_spec\`.
3. Brand gate: \`get_brand_kit { brand_id }\`. If \`researchStatus\` is \`complete\`, REUSE it —
   never re-research. If not, run brand research first (\`gooseworks fetch brand-research\`,
   follow it, then \`finalize_brand_research { brand_id }\`) before continuing.

## Step 2 — fetch the recipe + its pack skills for the format

The video-ad format skills live in the goose-skills **\`video-ad-formats\`** pack. Map the project's
\`format\` to its recipe slug:

| format | recipe slug | renderer + atoms it drives |
| --- | --- | --- |
| \`imessage\` | \`remix-imessage-ad-from-sample\` | create-imessage-video-ad, create-imessage-mockup, stitch-videos-ffmpeg, mix-master, watch |
| \`chatgpt\` | \`remix-chatgpt-ad-from-sample\` | create-chatgpt-video-ad, create-chatgpt-mockup, render-ios-keyboard, stitch-videos-ffmpeg, watch |
| \`apple-notes\` | \`remix-apple-notes-ad-from-sample\` | create-apple-notes-video-ad, create-apple-notes-mockup, stitch-videos-ffmpeg, watch |

(photo-grid + music-video coming.) Pack skills are fetchable individually by slug but do NOT
auto-resolve dependencies (no \`dependencySkills\`), so \`gooseworks fetch\` the recipe **and** each
skill in its row — e.g. for iMessage:

\`\`\`bash
for s in remix-imessage-ad-from-sample create-imessage-video-ad create-imessage-mockup \\
         stitch-videos-ffmpeg mix-master watch; do gooseworks fetch "$s"; done
\`\`\`

Each prints \`{ content, scripts, files }\`. Save each skill's scripts + files under
\`/tmp/gooseworks-scripts/<slug>/\` and FOLLOW the recipe's SKILL.md — it orchestrates the others.
The renderer (the \`create-*-mockup\` atom for the format) is a Node package —
\`npm install\` in its folder so its \`generate.js\` + Playwright resolve, and point the recorder's
\`NODE_PATH\` at it.

## Step 3 — prepare ALL the ingredients, then review ONCE (always, before any paid render)

This is a **review-once** flow: prepare every ingredient the video needs, show the whole set to
the user in the app, get ONE approval, then render. Never render before approval, and don't drip
ingredients out one at a time.

1. **Generate every ingredient the format needs — not just the script.** For an iMessage video
   that's typically: the **script** (the bubble thread), the **image(s)** shown in the conversation
   (one or more), and the **end card**. Richer templates add more (hook frame, background, product
   shots, music bed…). Read the recipe for the exact ingredient list. Generate the visuals NOW
   (media proxies / recipe), and \`get_upload_url\` each preview asset to \`working/review/<name>\`.
   You may ask the user a couple of clarifying questions about the generation first if the recipe
   calls for it (angle, which product, offer/code) — batch them, then prepare everything.
2. **Mirror the whole ingredient set for review** — \`update_ad_project_script { project_id,
   script_drafts, script }\`. \`script_drafts\` is a structured payload of **container-tagged
   ingredients** so the app renders each piece the right way:
   \`{ format, scenes?, ingredients: [{ container, label, subtitle?, path?, text? }] }\`. Each
   ingredient's \`container\` tells the app HOW to show it:
   - \`image\` (a frame shown in the video), \`endcard\` (the end card), \`avatar\` (a character
     headshot), \`background\` → rendered as an image tile.
   - \`voice\` (a voiceover clip — put the voice NAME in \`subtitle\`), \`music\` (the bed),
     \`audio\` → rendered as an audio player.
   - \`video\` (a clip) → a video player. \`text\` (a copy line like the CTA) → a text tile.
   - \`script\` / \`thread\` / \`note\` / \`conversation\` → the written script (or set \`scenes[]\`
     for the podcast shape, or pass the readable \`script\` string).
   \`path\` = \`working/review/<name>\` (upload the preview asset first via \`get_upload_url\`); \`url\`
   works too. **Label every ingredient** ("Hook image", "End card", "Voiceover", "Background
   music", "HER"). This writes NO render and costs NO credits — it populates the review panel.
3. **STOP and ask the user to approve the ingredients in THIS Claude Code session.** Do not render
   until they say go. If they want changes, regenerate the affected ingredient, call
   \`update_ad_project_script\` again, and re-ask. Only AFTER approval do Step 4.

## Step 4 — render locally, report stages, publish

1. Render per the recipe (Playwright record → ffmpeg stitch → \`mix-master\` audio). Generate any
   hook / background / end-card assets through the media proxies (below).
2. Open the row LAST: \`submit_render { project_id, kind: "full" }\` → keep \`render_id\`, then
   \`update_render_status { render_id, status: "running" }\`. The render row tracks status only
   (queued / running / complete / failed) — narrate fine-grained progress with
   \`append_project_message\` instead.
3. QC by watching: run the \`watch\` skill on the master — verify bubble/beat order + SFX, that
   the brand's product (not the source's) is shown, the end card has the real wordmark + code,
   and the duration is within ~20% of the source.
4. Publish: \`get_upload_url { target: { type: "agent", agent_id: ADS_AGENT } }\` → PUT the master
   to \`working/final.mp4\` and a poster to \`working/final-thumb.jpg\`. **Always target ADS_AGENT**
   (see Identity — a file on your token's own agent is invisible to the app). Verify servable:
   \`get_download_url { target: ADS_AGENT, path: "working/final.mp4" }\` must return a non-empty URL.
   Then \`update_render_status { render_id, status: "complete", output_url, thumbnail_url }\` where
   **output_url MUST be the durable render-file URL**
   \`/api/ads/projects/<project_id>/render-file?path=working/final.mp4\` (the app re-presigns it on
   every view) — NEVER a raw proxy/CDN URL (those expire). Same for \`thumbnail_url\`.
5. \`set_final_render { project_id, render_id }\` to pin it, then return the \`app_url\` +
   \`brand_url\` (from the project/links) verbatim. Never end on just "done" or a file path.

Narrate each long step in one line via \`append_project_message { project_id, role: "agent",
content }\` — never sit silent on a queue > 90s.

## Media generation — the GooseWorks proxies (queue loop)

Media APIs go through GooseWorks proxies with your agent token; do NOT use an SDK's default host
(your token isn't a FAL/ElevenLabs token → 401). Base = \`<api_base>/api/internal/<proxy>\`; pass
\`?token=<api_key>&agent_id=<agent_id>\` (agent_id bills the Ads agent). FAL = \`fal-proxy\` (+
\`fal-storage-proxy\` to host a local image and get a CDN URL); ElevenLabs = \`elevenlabs-proxy\`
(VO / music bed).

**FAL queue gotcha** (#1 waste of generations): submit returns \`status_url\`/\`response_url\` on
\`queue.fal.run\` (the real host, not the proxy). Polling those 401s forever — rewrite their host
to the proxy base (keep the path), re-add \`?token=&agent_id=\`. Only the final \`*.fal.media\`
image is a real public URL. Helper:

\`\`\`python
import json, os, pathlib, time, requests
from urllib.parse import urlparse

def _cfg():
    c = json.loads(pathlib.Path(os.path.expanduser("~/.gooseworks/credentials.json")).read_text())
    return c["api_base"].rstrip("/"), c["api_key"], c.get("agent_id")

def _params(tok, agent):
    p = {"token": tok}
    if agent: p["agent_id"] = agent
    return p

def fal_generate(model_path, payload, timeout_s=180, poll_s=3):
    """model_path e.g. 'fal-ai/nano-banana-2/edit' (the recipe names the model).
    Returns the result image URL (a public *.fal.media CDN URL)."""
    api_base, tok, agent = _cfg()
    base = api_base + "/api/internal/fal-proxy"
    sub = requests.post(f"{base}/{model_path}", params=_params(tok, agent), json=payload).json()
    to_proxy = lambda u: base + urlparse(u).path
    status_url, response_url = to_proxy(sub["status_url"]), to_proxy(sub["response_url"])
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        st = requests.get(status_url, params=_params(tok, agent)).json()
        if st.get("status") == "COMPLETED":
            return requests.get(response_url, params=_params(tok, agent)).json()["images"][0]["url"]
        if st.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(f"FAL failed: {st}")
        time.sleep(poll_s)
    raise TimeoutError("FAL polling exceeded timeout")
\`\`\`

ElevenLabs (VO / music) is the same shape against \`<api_base>/api/internal/elevenlabs-proxy\`
with \`?token=&agent_id=\`. Feed FAL a local image by storing it (\`get_upload_url\`) and passing its
\`get_download_url\` presigned URL as an \`image_urls\` entry, or POST the bytes to \`fal-storage-proxy\`.

## Rules

- **MCP + ffmpeg + Playwright required** — run \`gooseworks doctor\` in Phase 0; stop with the
  exact fix it prints if anything is ✗.
- **Prepare ALL ingredients first** (script + every visual: image(s) + end card + whatever else
  the template needs), mirror the whole set with \`update_ad_project_script\`, and get the user's
  approval in-session BEFORE rendering — always (review-once).
- **submit_render LAST**; \`output_url\` = the durable render-file URL, never a CDN URL.
- **Verify a real, non-empty MP4** (watch it) before marking the render complete.
- **Reuse the brand** when its research is complete; never re-research.
- On a hard error (auth/quota/model/timeout) set the render \`failed\` with a short
  \`error_message\` and stop — don't ship the source unchanged.
- Always end a successful run with \`app_url\` + \`brand_url\`, verbatim.
`;
}
