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
import { renderDomainRouteTable, renderBrandGrowthTable } from './routes';

export interface EntrySkill {
  /** Install dir name under ~/.agents/skills/ AND the skill `name`. */
  name: string;
  content: string;
}

/**
 * THE registry of entry skills (GOOSE-3190) — one list, four consumers:
 *   - `gooseworks install` / `update` / login-refresh write exactly these dirs,
 *   - `npm run generate:skills` regenerates exactly these `skills/<name>/SKILL.md`,
 *   - `skills/names.ts` derives which dirs the CLI is allowed to delete,
 *   - the backend raw-fetches these paths for hosted connectors.
 *
 * `goose-product-photos` used to be a hand-maintained `skills/…/SKILL.md` that
 * was on disk and served by the backend but absent here — so it was never
 * regenerated and never refreshed on install. Adding it closes that drift.
 */
export function getEntrySkills(): EntrySkill[] {
  return [
    { name: 'gooseworks', content: getMasterSkillContent() },
    { name: 'goose-ads', content: getGooseAdsSkillContent() },
    { name: 'goose-video', content: getGooseVideoSkillContent() },
    { name: 'goose-product-photos', content: getGooseProductPhotosSkillContent() },
  ];
}

/** Just the directory names, for callers that don't need the bodies. */
export function getEntrySkillNames(): string[] {
  return getEntrySkills().map((s) => s.name);
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
  GooseWorks growth coworker and specialist-skill router. Research brands, customers, competitors,
  creators, markets, and prospects; analyze ads and performance; create ads, product photos,
  graphics, and video; search and scrape public web and social data; find and enrich leads.
  Use it as the single GooseWorks entry point for brand growth, B2B, sales, research, and GTM work.
category: general
version: 1.0.0
author: GooseWorks
tags: [gooseworks, data, scraping, search, reddit, twitter, linkedin, email, people, research, gtm, leads, prospecting]
---

# GooseWorks

You have access to GooseWorks — an AI coworker with specialist skills for research, analysis, creative work, lead generation, enrichment, and public web/social data. Use the right specialist when the request needs brand context, a managed creative workflow, data at scale, a source behind authentication, or a specific provider.

This skill is also the **parent router** for the GooseWorks family. Data/GTM work you handle here (see "How to Use"); specialized work you hand off to a dedicated \`goose-*\` skill.

## Route to the right skill FIRST

First apply the **Common company onboarding** gate below. Preserve the user's original request while onboarding, then continue with it as soon as onboarding is complete. Then load the brand context (**"Load the brand context FIRST"**, immediately below). After that, check whether the request belongs to a specialized domain. If so, **switch to that skill** instead of the data flow below:

| If the user wants… | Route to | How |
| --- | --- | --- |
${renderDomainRouteTable()}
| Anything else — scraping, research, lead gen, enrichment, any data lookup | (stay here) | Follow "How to Use" below. |

Examples — all of these route to \`goose-ads\`, not the data flow: "remix this ad with project id 123", "make an ad for my product", "research my brand", "why is my Meta campaign underperforming", "which creatives should I cut".

## Load the brand context FIRST (mandatory — before you route, and before you ask anything)

**Call \`brand_get_context\` before the first substantive step of ANY task**, and before you route to a specialist skill. It is a cheap, read-only call that returns the brand's canonical facts:

| It returns | Use it for |
| --- | --- |
| **voice** — tone, style, banned phrasing | Any copy, script, caption, hook, or headline. Don't ask "what tone?" |
| **products** — names, descriptions, pricing, links, imagery | Picking the product to feature. Don't ask "which product?" — offer the list. |
| **audience** — segments, demographics, jobs-to-be-done | Targeting, angles, creator fit. Don't ask "who is this for?" |
| **positioning** — category, value props, proof points, tagline | Angles, offers, competitive framing. Don't ask "what makes you different?" |
| **research status** — whether the brand's research pass has completed | Whether the facts are trustworthy yet, or still being filled in. |

Then:

1. **Pass what it returned INTO the routed skill.** When you hand off to \`goose-ads\`, \`goose-video\`, \`goose-product-photos\`, \`goose-graphics\`, or a fetched Brand Growth recipe, carry the voice / products / audience / positioning with you. Do **not** make the routed skill re-derive them, and do **not** re-run brand research when the context is already there.
2. **Never re-ask the user for something the brand context already answers.** If a routed skill's own prose asks a question the context answers, the context wins — answer it yourself and move on. Ask only for what is genuinely missing or ambiguous.
3. **If research status is not complete**, say so in one line, use what you have, and continue. Only run brand research when the context comes back empty or the user asks for it.
4. **If \`brand_get_context\` is unavailable** (no MCP connection), fall back to \`get_brand_kit\` for the selected brand and treat its fields the same way. If neither is available, tell the user the GooseWorks MCP connection is needed rather than guessing brand facts.
5. **Treat it as read-only.** Writing brand facts back is the reconciliation flow in \`goose-ads\` (ask first, then \`update_brand_kit\`) — not something this router does.

Never invent a brand fact. If it isn't in the brand context and the user hasn't said it, ask.

## Setup

All commands below auto-load credentials from \`~/.gooseworks/credentials.json\`. If a command exits with "Not logged in", tell the user to run: \`npx gooseworks login\`. To log out: \`npx gooseworks logout\`.

### Choose the available runtime — MCP first, then CLI

Skills may describe a managed provider request as an environment-neutral operation with
\`provider\`, \`method\`, \`path\`, and optional \`query\` or \`body\`. Execute the operation through
the first available runtime:

1. If the matching GooseWorks MCP tool is registered, use it. For ScrapeCreators, pass the
   operation directly to \`call_data_provider\`. This is the preferred path in ChatGPT, Cowork,
   and other terminal-free clients. Do not shell out and do not ask for a separate provider key.
2. Otherwise, if a local terminal and the \`gooseworks\` CLI are available, translate the same
   operation into \`gooseworks call <provider> <path>\` with its method, query, and body options.
3. Otherwise, follow the provider dependency's direct-key path only when the user has supplied
   their own key. If no runtime is available, explain what connection is missing; never pretend
   the provider call ran.

The same selection applies to catalog and account operations. When the CLI is unavailable but the
\`mcp__gooseworks__*\` tools are connected, use these equivalents:
- \`gooseworks search <q>\` → the **\`search_skills\`** MCP tool.
- \`gooseworks fetch <slug>\` → the **\`fetch_skill\`** MCP tool (same content/scripts/files/deps).
- \`gooseworks credits\` → the **\`get_ad_credits\`** MCP tool.

Discovery, skill fetching, and ScrapeCreators-backed Brand Growth workflows work fully CLI-free
this way. Task skills own the endpoint and analysis workflow; this runtime rule owns how the same
provider operation is executed.

To check credit balance:
\`\`\`bash
gooseworks credits
\`\`\`

## Common company onboarding

Onboarding happens inside the current coding agent and is the first-run gate for every GooseWorks task. The user does not need to type **\`/gooseworks onboard me\`**. Before routing or executing their request, check their onboarding state and:

- start onboarding when no company/brand record exists;
- resume only the missing steps when onboarding is incomplete;
- continue immediately when onboarding is already complete.

Keep the user's original task pending and resume it immediately after onboarding. The explicit **\`/gooseworks onboard me\`** command remains a way to start or resume the same flow, but it is not required.

In these tools, a “brand” is the company, organization, or client the user works on. It does not need to be a DTC or ecommerce brand. For B2B and other GTM users, create or reuse the relevant company/client workspace and infer its products or services from the website. Do not require a product catalog, ad account, or creative assets unless the user's task needs them.

The CLI and GooseWorks Ads share one brand-scoped questionnaire through these MCP tools:

- \`list_ad_brands\` and \`create_ad_brand\` — select or create the company/brand.
- \`get_brand_onboarding { brand_id }\` — load completed answers and \`missing_fields\` before asking anything.
- \`update_brand_onboarding { brand_id, ...answers }\` — save each group of answers and the final first-task choice.

If these tools are unavailable, tell the user that onboarding needs the GooseWorks MCP connection. Do not send them to another UI and do not fall back to a separate context record.

### Resume rules

1. Run \`list_ad_brands\`. Reuse the only brand automatically. If there are multiple brands, ask which one to use.
2. If there is no brand, ask for the company or brand website, research it, and use \`create_ad_brand { name, website_url }\`. If the domain matches an existing brand, reuse it.
3. Call \`get_brand_onboarding\` and ask only the returned missing questions.
4. Save after each small group so an interrupted interview can resume.
5. If the record is complete, confirm the brand and continue; do not repeat the interview.

### Shared questions and answer values

Use the host's native question controls. Keep the labels below; the values in backticks are the stable values accepted by \`update_brand_onboarding\`.

1. **What is your role?** Founder / Business Owner · C-Suite · VP / Director · Performance / Growth Marketing · Brand / Content Marketing · Creative / Design · Agency · Consultant / Freelancer · Other.
2. **How much do you spend on paid ads right now?** \`zero\` · \`under_10k\` · \`10k_30k\` · \`30k_100k\` · \`100k_plus\`.
3. **What are your goals?** Multi-select: create ads \`make_creatives\` · analyze ads \`analyze_ads\` · manage/optimize ads \`ai_manage\` · competitor or customer research \`research_competitors\` · creators and social trends \`creators_trends\` · content \`content_growth\` · lead generation \`lead_generation\` · data work \`data_work\` · work with an expert team \`expert_team\`.
4. **Who makes your ad creatives right now?** and **Who manages your ads right now?** Use the shared values returned in the tool schema. Skip both when ad spend is \`zero\` and no advertising goal was selected.
5. **Which platforms or channels do you use or want help with?** Multi-select: \`meta\` · \`tiktok\` · \`google\` · \`chatgpt\` · \`x\` · \`linkedin\` · \`reddit\` · \`other\`.
6. **Where did you find GooseWorks?** Use the shared discovery-source values returned in the tool schema.

Do not add CLI-only questions about business type, products, or audience. Infer them from the website and ask one clarification only when the research is materially uncertain.

### Research while onboarding

Do useful setup work, not only form collection:

1. Fetch \`brand-research\` and research the website, products/services, audiences, competitors, offers, and messaging evidence.
2. Reuse existing Brand Kit/Core data. For an ecommerce store, import the relevant catalog with \`import_product\` and poll \`get_product_import\` rather than submitting duplicates.
3. When ads are relevant, offer to import existing creative. This is optional.
4. Suggest evidence-backed messaging angles. Approval is optional and never blocks completion.
5. Show the researched profile for confirmation: products/services, audience, competitors, imported ads, and suggested angles. Clearly label uncertainty.

### First task

Finish with **What do you want to do first?**

- Connect my tools and data — \`connect_tools\`
- Research customers, competitors, creators, or trends — \`research\`
- Analyze ads, content, landing pages, or performance — \`analyze\`
- Create ads, product images, or social content — \`create\`

Save the choice as \`first_task\`, then start that job. If the user already stated a concrete job, save the matching value and start without showing the menu.

## Brand Growth discovery

Brand Growth is a collection inside the normal skill catalog, not a command or installable pack. Use these known routes when relevant, while preserving all existing B2B, sales, research, lead-generation, and data behavior:

| Job | Skill |
| --- | --- |
${renderBrandGrowthTable()}

Fetch the named public skill before following it. You already called \`brand_get_context\` — hand the brand's voice, products, audience, and positioning to the fetched skill instead of letting it re-derive or re-ask them. Provider helpers such as \`scrapecreators-api\` and \`transcript-intelligence\` are dependencies, not user-facing results.

For a multi-part request, repeat this routing check before each new job. Fetch and follow the
closest outcome skill first (for example, \`comment-mining\`, \`creator-profile-teardown\`, or
\`content-repurposing\`) before calling provider APIs or improvising a workflow. Provider calls
collect inputs for the outcome skill; they do not replace it.

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
> - **ScrapeCreators:** call its first-party GooseWorks proxy directly with \`gooseworks call scrapecreators <path> --query='{...}'\`. Use ScrapeCreators' official OpenAPI for endpoint parameters; do not use Orthogonal as its endpoint catalog. GET is the default; add \`--method POST --body='{...}'\` only for an official POST operation.
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

The same \`gooseworks call\` command also handles direct-proxy providers (apify, apollo, crustdata, scrapecreators):
\`\`\`bash
gooseworks call apify acts/parseforge~reddit-posts-scraper/runs --body='{"subreddit":"ClaudeAI"}'
gooseworks call scrapecreators /v2/instagram/post/comments --query='{"url":"https://www.instagram.com/p/POST_ID/"}'
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
| \`$GOOSEWORKS_API_BASE/v1/proxy/{apify,apollo,crustdata,scrapecreators}/*\` | Various | \`gooseworks call\` (direct-proxy providers; ScrapeCreators uses its managed first-party key) |

## Security & Privacy

- All API calls are authenticated via Bearer token stored locally in \`~/.gooseworks/credentials.json\` (file mode 0600)
- No credentials are hardcoded or sent to third parties
- API keys for external services (Apify, Apollo, etc.) are managed server-side — your token never touches them
- Scripts run locally on your machine; only API requests go through GooseWorks servers. Skill scripts are open source (github.com/gooseworks-ai/goose-skills) — read or pin them before running
- Credit usage is tracked per-call and visible via \`gooseworks credits\`

## Rules

0. **Call \`brand_get_context\` before anything else**, pass what it returns into whatever skill you route to, and never re-ask the user for a fact it already answers (see "Load the brand context FIRST").
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
  GooseWorks ads skill — create, edit, AND analyze ad creative. Turn an approved source ad
  into a branded ad for the user's product, edit/re-roll an existing creative,
  research a brand for ads, OR analyze ad performance (Meta/Google campaign diagnostics,
  creative fatigue, CAC & lead quality, competitor ad intelligence, ad angles & hooks). Use
  when the user says "remix this ad", references a static ad template id/slug, asks to "make
  an ad", "edit this ad", "research my brand", or asks to analyze/diagnose ad campaigns.
  Generation runs through the GooseWorks backend's single cloud workflow (the same one the ads
  app uses) — credits are reserved and billed server-side. Analytics recipes are fetched from
  goose-skills on demand.
category: ads
version: 2.4.0
author: GooseWorks
tags: [gooseworks, ads, remix, static-ad, brand, creative, image, analytics, meta-ads, performance]
---

# GooseWorks Ads — create, edit & analyze

The GooseWorks ads skill. Two jobs:

1. **Create / edit ad creative** — a **thin wrapper** over the backend's single generation
   workflow. You pick the brand + approved source ad(s) and submit ONE batch; the **backend** runs the
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

## Start from the brand context — don't re-ask what it already answers

If the \`gooseworks\` router handed you brand context, USE IT. If you were invoked directly, call
\`brand_get_context\` first (falling back to \`get_brand_kit\` for the selected brand). It already
answers most of what the flows below would otherwise ask the user:

- **Which product to feature** → \`products[]\`. Offer the real catalog entries; never guess a
  product name and never ask the user to list their products.
- **The vibe / tone of the copy** → the brand's **voice**. Use it; don't ask "what tone?".
- **Who the ad is for** → the brand's **audience**. Don't ask "who's the target?".
- **The angle, offer framing, and what to claim** → **positioning**, value props, proof points.
- **Logo, colors, fonts** → owned by the backend research pass. **Never re-derive them.**
- **Whether the facts are trustworthy yet** → **research status**. If it isn't complete, say so in
  one line and continue; the batch queues and runs when research finishes.

Ask only for what the context genuinely doesn't answer: the specific campaign intent (season,
promo, which of several angles), the source ad, and anything the user must consent to.

## Identity & credits

- One agent-scoped token authenticates the \`gooseworks\` MCP tools. Never print it. The tools
  resolve your org automatically — you do NOT resolve an "Ads agent" or pass \`target\` for the
  generation tools.
- **Credits are handled entirely by the backend.** \`submit_remix_batch\` reserves the estimated
  cost up front (it errors with \`insufficient_credits\` if the wallet is short — relay the
  message and stop) and bills only the images that actually complete. Call
  \`estimate_remix_batch\` first to tell the user the cost; \`gooseworks credits\` shows balance.

## Live MCP contract — inspect it before asking

The currently registered MCP tool schemas are the source of truth for inputs, supported choices,
and defaults. Do not copy an exhaustive input list from this skill or rely on remembered fields.

Before each tool call:

1. Inspect the live schema for the tool you are about to use.
2. Fill required inputs already known from the Brand Kit, selected source, or conversation.
3. Ask the user only for required inputs that cannot be inferred and for choices that materially
   change the result. Do not turn every optional field into a questionnaire.
4. Omit unspecified optional settings so the backend applies its current app defaults.
5. If the live schema conflicts with this workflow, follow the live schema and report the drift
   with \`log_cli_event\`.

## The generation tools (the new, single-workflow surface)

- \`submit_remix_batch\` — **the one call that makes ads.** Inspect its live schema and supply
  the required brand/source inputs plus any choices the user explicitly made.
  Returns the batch with a \`links\` block (\`brand_url\` + per-creative \`app_url\`). If the brand's
  research isn't finished yet the batch comes back \`status: "queued"\` — it auto-runs the moment
  research completes; tell the user it'll appear shortly, don't error.
- \`estimate_remix_batch\` — cost preview. Reserves nothing. Use it to quote the cost first and
  check whether every selected source resolved before submitting.
- \`get_remix_batch\` — poll status. Returns each creative with its renders and
  \`completed\`/\`failed\`/\`pending\` counts, plus \`links\`. A creative is done when its \`pending\` is 0
  — NOT when \`current_render_url\` is set (during a regenerate that field still points at the prior
  image). Each render carries \`age_seconds\` (since queued) and \`elapsed_seconds\` (time generating):
  use them to tell a slow-but-healthy render from a stuck one. A render only failed when its
  \`status\` is \`"failed"\` — never assume a stall and re-submit, that double-bills.
- \`list_brand_creatives\` — the brand's gallery feed (newest
  first) + \`brand_url\`. Alternative poll target; also use to show everything made for a brand.
- \`surprise_me_templates\` — the **"Surprise me" recommender**. Picks
  remixable Community creations (SAME logic as the web /create "Surprise me" button), shuffled
  so picks stay fresh. It does not use the retired curated third-party catalog.
  Returns the picked templates (id, slug, title, image, ratio) AND a ready-to-open \`create_url\`
  (the /create page with \`cli=true\` and the picks pre-selected). This is how you recommend
  templates — do NOT hand-pick from the raw catalog yourself (see "Picking templates" below).
- \`regenerate_creative\` — edit or re-roll one existing creative through the same pipeline.
  Inspect the live schema to select the supported mode and required source inputs. Returns a
  single-item batch; poll it with \`get_remix_batch\`.
- \`set_creative_feedback\` — record the user's reaction to a generated image. Use it whenever
  the user reacts; inspect the schema for the current rating and reason choices.

### Plan mode — review the plan BEFORE generating (optional)

For users who want to approve each ad's plan before spending credits (the app's "Plan it" flow):

- Use the approval option exposed by \`submit_remix_batch\` — it composes each creative's plan and PAUSES.
  **No credits are reserved and no image renders** until you approve.
- \`list_ad_approvals\` — poll this. While a creative is
  \`composing\`, wait; once \`awaiting_approval\`, show its \`plan\` (composed prompt + refs + quality)
  to the user.
- \`revise_ad_plan\` — recompose from a chat steer, still
  free. Poll \`list_ad_approvals\` until it's \`awaiting_approval\` again.
- \`approve_ad_plan\` — approve one creative or the whole batch using the live schema.
  **This is the step that reserves credits and renders.** Then poll
  \`get_remix_batch\` and hand back links as usual.

Only offer plan mode when the user asks to review/approve first — the default path generates
immediately.

## Reading the brand & picking inputs (still MCP, read-only)

- \`get_brand_kit\` — read the canonical brand context and available products/assets.
- \`list_ad_brands\` / \`get_ad_brand\` — find and fetch the active brand.
- \`list_user_ad_templates\` — list the org's own uploads and
  imported ads. Prefer \`relationship: "self"\` when the user wants to reuse their own ads;
  \`relationship: "competitor"\` is research/inspiration, never proof that the user owns the ad.
- \`search_ad_templates\` — search remixable Community generations. The
  retired curated third-party catalog is not returned.
- \`get_static_ad_template\` — resolve a source already owned by
  the org, including an own upload or a snapshotted Community creative. It does not resolve the
  retired curated third-party catalog.
- \`remix_community_ad\` — turn a selected Community creative into a private remix source before
  submitting it. A Community ad id is an \`ad_project\` id, not a
  template id. Call this FIRST to snapshot it into a private template, then use the returned
  template \`id\` in \`items\`.
- \`create_user_ad_template\` — upload a source image as a private template. Answer any
  ownership/rights input only from the user's explicit confirmation. Never claim rights for a
  competitor ad or an image found online.
- \`get_ad_project\` / \`append_project_message\` — inspect a creative / leave a note on its thread.

## Keep the brand kit in sync — reconcile, then update (ASK first)

The brand kit is the source of truth every generation reads. During ANY task, when the user
**tells you something about the brand or asks to change something brand-level** — a different
tagline, audience, voice, a product's name/price/description, "our logo is X", "we don't sell Y
anymore", a new product photo — treat it as a possible kit update, don't just use it for this one
ad and forget it:

1. **Check it against the kit.** Call \`get_brand_kit\` for the active brand and see whether what the user said
   matches, is missing from, or contradicts the kit.
2. **If it's already in the kit and matches** — nothing to do; proceed.
3. **If it's new or different — ASK before writing.** Confirm in one line: *"Want me to update
   the brand kit so this sticks for future ads?"* Only persist on a yes (or when the user clearly
   asked you to change the brand). Don't silently mutate the kit, and don't nag on trivia.
4. **Persist with the write tools** (partial — only the fields you pass are touched; each edit is
   recorded as a user override that later re-research won't clobber):
   - \`update_brand_kit\` — structured brand fields.
   - \`upsert_brand_product\` / \`delete_brand_product\` — products.
   - \`add_brand_product_image\` / \`remove_brand_reference_image\` — product and reference photos.
   Inspect each live schema and send only the fields needed for the confirmed change.
5. **Confirm what changed** and continue the task. (Logo, colors, and fonts are owned by the
   backend research pass — prefer \`update_ad_brand\` / the research flow for those, not free text.)

This is the parity gap the app closes in-product: a brand fact the user gives mid-task should be
able to flow back into the kit — with their ok — instead of being lost.

## Picking source ads — use approved sources, not the retired catalog

When the user wants to make ads but has NOT named a specific template (id/slug/Community
ad/upload), do NOT silently browse the raw catalog and hand-pick for them. Instead run this
short ask flow — it mirrors the web app and keeps the human in the loop:

1. **Ask what kind of ads they want** — the angle/offer/theme/season. **The brand context already
   gives you the vibe (voice), the audience, and the product catalog — do NOT ask for those.**
   Offer the real \`products[]\` to pick from rather than asking "which product?", and derive the
   tone from the brand's voice. This shapes both the source choice and your steering \`prompt\`.
   Keep it to one quick question about campaign intent.
2. **Ask how to pick a source: their own ads, Community, upload, or "Surprise me".**
   - **Their own ads** → use \`list_user_ad_templates\` to load the active brand's own sources and
     let them choose from the results.
   - **Community** → \`search_ad_templates\`, let them choose, then call \`remix_community_ad\`
     before submitting.
   - **Upload** → upload through the workspace and call \`create_user_ad_template\`. If its live
     schema requires an ownership or permission answer, only supply it after explicit confirmation.
   - **Surprise me** (they want you/the app to pick) → call \`surprise_me_templates\` for the active
     brand and hand the user the returned \`create_url\`.
     It opens /create in **CLI mode** with the picks pre-selected, a preview modal, and the
     **copyable remix prompt at the bottom** (in place of the Generate input). They can swap
     picks and copy that prompt. If they'd rather you "just make them" without reviewing in the
     app, you MAY submit the \`surprise_me_templates\` picks directly (skip to submit).
   - **Browse in the app** → hand the user this URL, with the
     active brand's slug filled in:
     \`https://make.gooseworks.ai/create?brand=<brand-slug>&cli=true\`
     In CLI mode the app shows the copyable remix prompt at the bottom (dismissable / switchable
     back to the UI composer). They browse the available own/Community sources and copy the prompt.
3. **Close the loop.** When the user **pastes back the copyable remix prompt** from the app
   (it names the brand + the templates they chose), THAT is your cue to generate: resolve the
   named source(s), inspect \`submit_remix_batch\`, and collect only its unresolved required inputs.

If the user already named an owned source (id/slug), a Community ad, or an upload, skip the source
choice. Competitor ads may inform the angle or structure, but describe them as inspiration, never
claim ownership, and never attest rights for the user.

## Workflow — make ads from a template

1. **Resolve the brand.** Use \`list_ad_brands\` by name/site, then call \`get_brand_kit\` for the
   selected brand. If the
   kit's \`researchStatus\` isn't \`complete\`, you can still submit (the batch queues and runs when
   research finishes) — just tell the user. Use the kit to pick \`product_name\` (a real entry from
   \`products[]\`, not a guess) and, if the user supplied product photos, \`reference_image_urls\`.
2. **Pick the source ad(s) via the ask flow above.** Once you have concrete ids:
   call \`get_static_ad_template\` for each.
   For a Community ad, \`remix_community_ad\` first; for an uploaded image, \`create_user_ad_template\`
   first.
3. **(Optional) Craft the steering prompt.** The \`prompt\` is OPTIONAL — this is where the skill
   adds value: turn the user's intent (from step 1) into a concise steering note (e.g. tone,
   season, emphasis). Don't over-specify; the backend pipeline + brand kit handle palette, fonts,
   product swap.
4. **Quote the cost.** Inspect and call \`estimate_remix_batch\`, then tell the user.
5. **Submit ONE batch.** Inspect the current \`submit_remix_batch\` schema, fill known required
   inputs, ask only for unresolved user decisions, and omit unspecified optional settings. Keep
   the returned \`batch_id\` and \`links\`.
6. **Poll until done.** Call \`get_remix_batch\` for the returned batch (or use
   \`list_brand_creatives\`) every ~20-30s
   until every creative's \`pending\` is 0. Most images finish in a few minutes; text-heavy templates
   and \`quality: high\` take longer. Read each render's \`elapsed_seconds\` rather than guessing — a
   render that's still \`running\` is healthy; do NOT re-submit thinking it stalled (that double-bills).
7. **Hand back the links** from the batch's \`links\` block — \`brand_url\` (gallery) and each
   creative's \`app_url\` — copied verbatim. Never end on just "done" or a file path.

## Workflow — edit an existing ad

User wants to tweak a creative they already made → use \`regenerate_creative\`. Infer whether they
want another take, a targeted edit, or an exact instructed change from their request. Then inspect
the live schema, ask only for any required source or instruction that is still missing, submit,
poll with \`get_remix_batch\`, and hand back the links.

## Brand research

Prefer the backend's result: call \`get_brand_kit\` for the selected brand. If \`researchStatus\` is
\`complete\`, REUSE it — never re-research.

**The split — backend owns visuals, you own the qualitative depth:**

- **Backend LIGHT pass (automatic).** \`create_ad_brand\` with a \`website_url\` kicks off the same
  backend research the web app uses, in \`mode: "light"\`: it resolves the **authoritative logo,
  colors, and fonts** (Brandfetch + context.dev) plus a baseline kit, then flips
  \`research_status\` to \`complete\` — usually under a minute. You can't reproduce those visual
  signals locally, so **never re-derive logo/colors/fonts.** (Web onboarding via \`/api/ads/onboard\`
  runs the full thing; nothing to do but read it.)
- **Your DEEP pass (local, agentic).** You add the qualitative depth the light pass leaves thin —
  positioning, audience segments, voice, brandType, value props, proof points, products — grounded
  on the actual site.

**CLI brand-research flow:**

1. Inspect and call \`create_ad_brand\` with the known brand identity and website, then keep its id
   and slug. The brand comes back with
   \`research_status: "pending"\` (light pass in flight).
2. **Wait for the backend light pass:** poll \`get_brand_kit\` for that brand until \`researchStatus\`
   is \`complete\` (usually <60s). Now the kit has authoritative logo/colors/fonts + a baseline.
   At this point generation is already unblocked — but do the deep pass to make it good.
3. **Deep research locally:** \`gooseworks fetch brand-research\` and follow its phases. **Ground
   every fact on the fetched site** — if the site can't be read, say so and ask the user; never
   guess a category from the brand name alone.
4. **Write the pack** with \`write_file\` under \`agent-config/brands/<slug>/\`:
   - the \`brand-research/*.md\` docs + \`brand-assets/manifest.json\` (human-readable pack), AND
   - \`brand-research/kit-patch.json\` — the STRUCTURED fields the web UI renders. Field-for-field
     contract; only what you put here reaches the kit. Shape:
     \`{ positioning?: string, audience?: string, voice?: string, brandType?: string, tagline?: string, valueProps?: string[], proofPoints?: string[], products?: [{ name, description?, link?, pricing?, imageUrls?: string[] }] }\`
     (\`brandType\` ∈ product | saas | service | agency | restaurant | fashion | beauty | fitness |
     finance | education | health). Only URLs already in our storage for product images.
   - **Do NOT set logo / colors / fonts here** — the backend light pass already owns those.
5. **Persist it:** call \`finalize_brand_research\` for the brand. It merges \`kit-patch.json\` into the kit
   NON-CLOBBERINGLY (it will NOT overwrite the backend's visuals or any user edit), then re-confirms
   \`research_status: complete\`.
6. **Verify:** call \`get_brand_kit\` again and confirm the qualitative fields you wrote are present
   before generating.

**If the brand has NO website**, the backend light pass can't run (nothing to fetch) — do the whole
thing locally (steps 3–6) and finalize; an un-finalized brand has no kit for generation and leaves
no artifact to debug a wrong run (this is how a bad local classification, e.g. mislabelling a SaaS
as a "drink company", used to vanish without a trace).

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
- **Use approved source paths.** If the user didn't name a source, run the ask flow (own ads,
  Community, upload, Surprise me, or browse in the app). "Surprise me" goes through
  \`surprise_me_templates\`; browsing uses \`/create?brand=<slug>&cli=true\`. Never use the retired
  curated third-party catalog.
  Generate when they paste the app's copyable remix prompt back (or submit the surprise picks
  directly if they'd rather not review).
- **Treat competitor ads as inspiration** — never attest rights, imply ownership, or promise to
  copy a competitor's distinctive expression.
- **Reconcile brand facts into the kit** — when the user states or changes something brand-level
  mid-task, check it against \`get_brand_kit\` and, with their ok, persist it via \`update_brand_kit\`
  / \`upsert_brand_product\` / \`add_brand_product_image\` so it sticks for future ads. Ask first;
  never silently mutate the kit.
- **Record feedback** — when the user reacts to a generated image, inspect and call
  \`set_creative_feedback\` so the quality loop learns.
- **Plan mode is opt-in** — only use the live approval option, then \`list_ad_approvals\` and
  \`approve_ad_plan\`, when the user wants to review before spending credits; otherwise generate
  immediately.
- **Don't busy-loop** — poll \`get_remix_batch\` on a sensible interval (~20-30s); a \`queued\`
  batch is waiting on research and will start on its own.
- **Report problems so we can fix them** — when a batch fails/is rejected and you can't resolve it,
  a required brand input/asset is missing, or a recipe/instruction is ambiguous or contradictory,
  call the **\`log_cli_event\`** MCP tool (\`event_type\`: \`error\`/\`blocker\`/\`missing_input\`/\`confusion\`,
  with the real error + step in \`details\`) so the team gets visibility. Still tell the user too.
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
  Use when the user says "make the video for project <id>", "for video batch <id>", references a
  video ad project/batch or template, or asks to remix a video ad. Unlike goose-ads (static images,
  generated server-side), video renders locally and reports progress + the result back through the
  gooseworks MCP tools.
category: ads
version: 0.3.0
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, local-render, byoa]
---

# GooseWorks Video Ads — local remix runtime

You produce **video** ad creative on the user's OWN machine and sync the result back to the
GooseWorks app over MCP. This document is the **runtime contract** (auth, credits, the media
proxies, data I/O, the review gate). A separate **recipe skill** — fetched per format — tells you
*what to make* (the pieces, prompts, models, order of assembly).

**Division of authority — read both, but when they disagree THIS doc wins on the environment AND the
review/approval flow.** The recipe governs WHAT to make; this doc governs WHEN you pause, generate,
and spend. In particular: a recipe may spell out a **multi-phase, multi-gate** flow — "generate the
still [GATE] → approve → author the prompt [GATE] → approve → render [GATE] → approve", several
separate pauses. **Do NOT run it that way.** Collapse every one of those gates into the single
**review-once** flow below: one review set, one approval (Step 3). Take the recipe's pieces, prompts
and models; ignore its intermediate pauses. This is the exact contradiction that confused past runs
(GOOSE-2542) — there is no ambiguity: review-once wins.

You run inside the user's own Claude Code session (they pasted an instruction with a project
id). The app NEVER runs you — it is the viewer + review surface; you are the renderer.

## CLI-free environments (cowork / headless)

You may be running WITHOUT the \`gooseworks\` CLI binary (e.g. Anthropic cowork). The
\`mcp__gooseworks__*\` tools work over the MCP connection regardless, so wherever this skill
says to shell out, use the MCP equivalent:

- \`gooseworks fetch <slug>\` → the **\`fetch_skill\`** MCP tool (returns the same content/scripts/
  files/dependencySkills). \`gooseworks search <q>\` → **\`search_skills\`**.
- \`gooseworks credits\` → the **\`get_ad_credits\`** MCP tool.
- \`gooseworks doctor\` → do the manual toolchain check in the preflight below.

## Report problems so we can fix them (telemetry — do this, don't skip it)

If anything blocks or degrades this run — a media/proxy call fails or errors, a required input or
asset is missing, a recipe instruction is ambiguous or contradictory, the render toolchain won't set
up, or you hit a bug you can't work around — **report it** so the team gets visibility and can fix
the skill. It's fire-and-forget, never counts against you, and never blocks your work.

- **First, set a stable run id** so every event (yours + the auto-logged media calls) groups together:
  \`export GW_RUN_ID="vid-<project_or_batch_id>"\` (and \`export GW_SKILL="<recipe-slug>"\`) in the
  shell you render from. The media proxies read \`GW_RUN_ID\` automatically.
- **CLI present →** \`gooseworks log "<what happened>" --event-type <type> --level error --details '{"error":"...","step":"...","model":"..."}'\`
- **No CLI (cowork / headless) →** the **\`log_cli_event\`** MCP tool with the same fields (pass \`run_id\`).
- \`--event-type\`: \`api_failure\` (a proxy/model call failed) · \`missing_input\` · \`blocker\` ·
  \`confusion\` (unclear/contradictory instruction) · \`error\` (a bug) · \`step\`/\`info\` (progress notes).
- Put the **real error text + the step you were on** in \`--details\`. Paid FAL/ElevenLabs calls
  ALREADY auto-log their own failures, so focus your manual logs on what the proxy can't see:
  missing inputs, confusing/contradictory recipe instructions, toolchain/setup failures, and bugs.
- Logging is FOR US — it does not replace telling the user. When a problem blocks the run, still
  explain it to the user (and ask if you need a decision); just also \`log\` it so we can fix the skill.

## Prerequisite — MCP + a render toolchain (Phase 0 preflight)

- The \`mcp__gooseworks__*\` tools are REQUIRED. If they're unavailable, stop and tell the user
  to connect the GooseWorks MCP server (or run \`gooseworks install --claude --mcp\` on the CLI)
  and restart. There is no REST fallback.
- **The render runs wherever THIS agent runs, and it needs a real toolchain: \`ffmpeg\` +
  \`ffprobe\` + a Playwright **Chromium**.** Establish it in this priority order, and do NOT start
  rendering until one is confirmed:
  1. **CLI present →** run \`gooseworks doctor\` (checks login, MCP, ffmpeg/ffprobe, Playwright
     Chromium in one shot). Fix any ✗ with the command it prints, then continue.
  2. **No CLI →** check the toolchain yourself: \`ffmpeg -version\`, \`ffprobe -version\`, and a
     Playwright Chromium probe (\`npx playwright --version\` and, if needed, \`npx playwright install
     chromium\`). If all resolve, continue.
  3. **Docker available →** this is the most reliable way to get the toolchain in a sandbox that
     lacks it: run the render steps inside the prebuilt image
     **\`ghcr.io/gooseworks-ai/goose-video-render\`** (ffmpeg + ffprobe + Playwright Chromium baked
     in), mounting the project working directory. Use Docker whenever the host is missing ffmpeg or
     Chromium and \`docker\` is on PATH. (Note: nested Docker is usually disabled inside managed
     sandboxes like cowork — treat this as an option, not a guarantee.)
  4. **None of the above works →** STOP and tell the user plainly, e.g.: *"Video rendering needs
     ffmpeg + a Playwright Chromium (or Docker) on the machine running this agent. This environment
     doesn't have them and I can't install them here. Options: (a) enable/allow Docker so I can use
     the goose-video-render image, (b) install ffmpeg + \`npx playwright install chromium\`, or
     (c) run this skill locally in your own Claude Code where the toolchain is available."* Do not
     half-render or fake a result. Static image ads (the \`goose-ads\` skill) do NOT need any of this
     and work anywhere — offer that as the fallback if they just want an ad now.

## Identity, token, credits

- Read \`~/.gooseworks/credentials.json\` → \`api_key\` (your agent token), \`api_base\`, \`agent_id\`.
  Never print the token.
- **CRITICAL — target the org-default Ads agent on EVERY file op.** The app serves project files
  (the render-file route) from the org's DEFAULT agent, but MCP file writes default to your
  token's pinned agent — which can be a DIFFERENT agent, so a render written with the default
  scope is **invisible in the app**. First resolve the Ads agent: \`list_accessible_scopes\` → the
  scope with \`is_org_default: true\` (the ORG default — NOT the \`is_default\` / \`default_agent_id\`
  fields, which are the *user's* default agent and are often a DIFFERENT agent). Its \`agent_id\` is
  \`ADS_AGENT\` (name "Ads agent", slug \`org-default\`; usually also the \`agent_id\` in
  credentials.json). Then pass \`target: { type: "agent", agent_id: ADS_AGENT }\` on EVERY
  \`get_upload_url\` / \`get_download_url\` / \`write_file\` / \`list_directory\` / \`read_file\` — NEVER
  omit \`target\`.
- **CRITICAL — publish under the PROJECT FOLDER, not the workspace root (the #1 "video renders but
  is invisible" bug).** \`get_upload_url\` stores at \`<ADS_AGENT>/files/<path>\` verbatim, but the
  render-file route reads from
  \`<ADS_AGENT>/files/agent-config/brands/<brand_slug>/projects/<project_id>/<path>\`
  (see backend \`resolveProjectFileKey\`). So EVERY publish/preview \`path\` MUST be prefixed with
  \`agent-config/brands/<brand_slug>/projects/<project_id>/\` — e.g. upload to
  \`agent-config/brands/<brand_slug>/projects/<project_id>/working/final.mp4\`, NEVER bare
  \`working/final.mp4\`. A bare path 404s in the app even though the render row AND a bare-path
  \`get_download_url\` both "succeed" (they resolve the wrong key). The render \`output_url\` still
  stays the project-relative \`...render-file?path=working/final.mp4\` — the route re-prepends the
  prefix itself. Always verify with \`get_download_url\` on the FULL \`agent-config/...\` path (must
  be non-empty; curl it for HTTP 200) BEFORE marking the render complete.
- Media generation (FAL / ElevenLabs) through the GooseWorks proxies is the **REAL spend** — billed
  to the agent per call as you generate (Step 4). \`submit_render { kind: "full" }\` additionally
  debits **1 nominal ad credit when the render ROW is opened** (a bookkeeping fee, NOT the render's
  true cost) — so open it only once you actually have a rendered master (Step 4.1/4.2), and never
  re-submit on a guess (that double-bills). The final-video QC gate (Step 4.3) then sits between
  that master and PINNING it. Call \`get_ad_credits\` first; the user can check \`gooseworks credits\`.

## Step 0 — project id, or video BATCH id? (fan out before anything else)

The handoff you were pasted is EITHER a single \`project <id>\` OR a \`video batch <id>\`. A batch is
the app's "N concepts" flow: one composer submission fans out into **N independent concept projects**
(the user picked a concept count, default 3), and the app expects EACH to be rendered. **Handle both:**

- **\`project <id>\`** → you have one project. Treat it as a batch of one and continue to Step 1.
- **\`video batch <id>\`** → call \`get_ad_video_batch { video_batch_id }\`. It returns every child
  concept under \`projects[]\` — each is a normal project with its own \`id\`, \`variant_index\`
  (Concept 1..N), and its own \`creative_brief\` (the per-concept angle/hook/offer/message). **You
  MUST process every concept, not just the first** — dropping concepts 2..N is the #1 batch bug.

**Loop shape (one agent, sequential, ONE approval for the whole batch):**
1. Run **Step 1 + Step 1.5 + Step 2 + Step 3-assemble** for EACH concept project (each has its own
   \`project_id\`, brief, and \`working/\` folder — never cross-write between concepts).
2. Mirror EVERY concept's review set (Step 3's \`update_ad_project_script\` per project), then stop
   for **ONE** approval that covers all concepts — show the per-concept credit estimate and the
   batch total. Set the batch to \`review\` (\`update_ad_video_batch { status: "review" }\`).
3. On approval, set the batch to \`rendering\` and run **Step 4 (the expensive render)** for each
   concept **sequentially** (finish Concept 1's master before starting Concept 2 — one machine can't
   render them in parallel). Deliver each (Step 5). When all concepts are pinned, set the batch to
   \`complete\`.

If a single concept fails, keep going with the rest, mark that concept blocked, and report which
ones shipped — never abort the whole batch on one bad concept. Everything below (Steps 1–5) is
written per-project; a batch just runs it N times with the shared approval gate above.

## Step 1 — resolve the project, source, brand

1. \`get_ad_project { project_id }\` → keep \`brand_id\`, \`source_sample_id\`, \`name\`, \`status\`, the
   **top-level** \`app_url\` + \`brand_url\` (returned alongside \`project\`, NOT inside it — the links
   you hand the user for the in-app review in Step 3 and delivery in Step 5), AND the user's
   **\`creative_brief\`**, project **\`assets\`**, \`character_id\`, \`default_voice_id\` — these are the
   authoritative inputs the user chose in the composer (see Step 1.5). Do NOT discard them.

### Step 1.5 — the project brief is AUTHORITATIVE (honor it; don't re-ask)

The composer already collected the user's creative direction onto the project. **Read it and treat
it as ground truth — it OVERRIDES the template recipe's defaults, and it REPLACES the clarifying
questions you would otherwise ask.** Only fall back to the recipe default (then, last, to asking)
for a field the brief leaves empty. Map the fields you WILL honor:

- \`creative_brief.productName\` / \`.offer\` / \`.angle\` → the product, offer/code, and angle. Do
  **not** ask "which product / what offer / what angle" if these are set.
- \`creative_brief.concept\` (on a batch child) → this concept's **\`angle\` / \`hook\` / \`offer\` /
  \`message\` / \`note\`** — the per-concept differentiator. Honor it verbatim; it's WHY the user asked
  for N concepts. \`angle: "auto"\` or empty means "you choose."
- Project \`assets\` + \`creative_brief.reference_image_urls\` → the user's **own reference images**.
  Use them as the product/brand refs (alongside the brand kit), don't ignore them for generic recipe
  assets.
- \`character_id\` → the avatar/creator to use. \`default_voice_id\` → the voice for any VO (put its
  NAME in the review \`subtitle\`). Use these instead of picking your own.
- \`creative_brief.ratio\` / \`.durationSeconds\` → target aspect ratio + length. Honor when the
  format's render pipeline supports it; if the format physically can't (e.g. a fixed phone-mockup
  aspect), keep the format's native value and note the constraint in the review rather than silently
  ignoring the request.
- \`polish_policy\` (\`standard\` | \`extra\`) → \`extra\` means spend the extra pass on QC/polish.
2. \`get_ad_template { template_id: source_sample_id }\` → the source video: \`media_url\`,
   \`recipe\`, \`format\` (e.g. "imessage"), \`extracted_script\`, \`how_to\`, \`remix_spec\`.
3. Brand gate: \`get_brand_kit { brand_id }\`. If \`researchStatus\` is \`complete\`, REUSE it —
   never re-research. If not, run brand research first (\`gooseworks fetch brand-research\`,
   follow it, then \`finalize_brand_research { brand_id }\`) before continuing.

## Step 2 — read the template's recipe (it carries everything; NO hardcoded format map)

The ad format is a **template (data) in the ad_sample DB**, not a per-format skill.
\`get_ad_template(source_sample_id)\` returns the template's \`recipe\` — a self-contained brief you
read and execute. **Do NOT map \`format\` to a hardcoded recipe slug** (there is no such table):

- \`recipe.format\` — the format label (e.g. \`vignette\`), for display only.
- \`recipe.atoms\` — the **capabilities** this template composes (e.g. \`create-video-seedance-2-fal\`,
  \`create-image-gpt-image-fal\`, \`review-ugc-render\`, \`watch\`). \`gooseworks fetch <name>\` each — they
  live in \`skills/ads/capabilities/\` and are reused across templates (so they cache).
- \`recipe.instructions\` — the **playbook** to follow: \`instructions.inline\` prose, or
  \`instructions.doc_url\` (an S3 markdown doc — fetch it).
- \`recipe.config\` — every param (prompts, layout, timings, palette, model choices).
- \`recipe.inputs\` — the brand-asset contract (which product / logo / offer this template needs).
- \`recipe.assets\` — reference material as S3 links (reference render, style guide, example frames) —
  fetch as needed.

Runtime: **read the recipe → \`gooseworks fetch\` each capability in \`recipe.atoms\` → follow
\`recipe.instructions\` with \`recipe.config\` + the brand's bound \`inputs\`.** The template IS the recipe;
there is no \`format → recipe-slug\` table and no per-format skill to fetch.

Save each fetched capability's scripts + files under \`/tmp/gooseworks-scripts/<name>/\`. If a capability
is a Node package (a phone-mockup renderer), \`npm install\` in its folder so its \`generate.js\` +
Playwright resolve, and point the recorder's \`NODE_PATH\` at it.

> **Migration note:** older phone-mockup formats (\`imessage\` / \`chatgpt\` / \`apple-notes\`) whose DB
> recipe does not yet carry \`atoms\` / \`instructions\` still hold the legacy \`recipe.thread\` payload;
> migrate them to this shape (capabilities + instructions in the DB) — do not reintroduce a CLI map.

## Step 3 — assemble the review set, then get ONE approval in the app (before the expensive render)

This is a **review-once** flow: put the whole review set in the app, get ONE approval, then run the
expensive render + any remaining paid work end-to-end. Never spend on the expensive render before
approval, and don't drip pieces out one at a time and re-pause.

**What goes in the review — show the REAL cheap pieces, PROMPT only the expensive render.** Split
every piece three ways by cost, NOT just "free vs paid":
- **FREE** (an iMessage / Apple-Notes HTML mockup, a text/CTA line — rendered locally, no proxy
  call) → generate NOW and mirror the real asset.
- **CHEAP paid** — a single still/image, the creator/avatar frame, the end card, a short voiceover
  or music bed (each costs cents → roughly **≤ 100 credits**) → **generate these NOW too** and
  mirror the real asset. The few credits buy a real review: the user SEES the actual creator face
  and end card and HEARS the VO, instead of judging a prompt. **This OVERRIDES any recipe rule that
  says to gate ALL paid calls** — only the expensive render below is gated.
- **EXPENSIVE paid** — the video take / final AI render (hundreds of credits) → do NOT generate.
  Put its **exact prompt/spec** (+ ref image URLs) in the tile. This is the ONE thing approved as a
  prompt (you can't preview a hundreds-of-credits video for free); it's generated only in Step 4.

**The expensive render's exact prompt must be in the panel BEFORE you ask for approval** — so a
single "go" runs it (plus any remaining paid work) without re-pausing mid-run.

**Show every cost in CREDITS, never dollars.** 1 credit = $0.01 and media generations bill at
provider-cost × 1.2, so **credits ≈ round-up(provider-$ × 120)** per generation, plus a flat
**200-credit base per video**. Convert any $ figures to credits and show ONLY credits to the user —
never print a "$…" amount.

**Never assemble/stitch the finished video for review.** The review is of the individual pieces (or
their prompts) — never a "full cascade" / "approved cut" clip. Building the whole video before
approval defeats the gate (the user opens the review to an already-finished video) and wastes the
render (GOOSE-2542). The full video is assembled ONLY in Step 4, after approval. A \`video\`
ingredient here is only a genuinely separate SOURCE clip the format needs (e.g. supplied b-roll).

1. **Assemble every piece the format needs — not just the script.** Read the recipe for the exact
   list. For an iMessage video that's the **script** (bubble thread), the **conversation image(s)**,
   and the **end card**; richer templates add a hook frame, background, product shots, music bed, a
   creator/avatar, a voiceover… For each piece, decide FREE / CHEAP-paid / EXPENSIVE-paid (above):
   - **FREE or CHEAP paid** (≤ ~100 credits — HTML mockups, a still, the creator frame, the end
     card, a short VO/music bed) → generate it now and \`get_upload_url\` the asset to the project
     folder \`agent-config/brands/<brand_slug>/projects/<project_id>/working/review/<name>\` (same
     path-prefix rule as final publish — a bare \`working/review/<name>\` won't render in the panel);
     set that piece's \`path\` in \`script_drafts\` to the project-relative \`working/review/<name>\`.
   - **EXPENSIVE paid** (the video take / final render, hundreds of credits) → do NOT generate. Put
     the **exact prompt/spec** (and any ref image URLs) in the tile's \`text\` / \`subtitle\` so the
     user reviews what will be spent on. No \`path\` yet — it's generated in Step 4.
   Include the **estimated cost in CREDITS** (never dollars) of the cheap pieces already generated +
   the pending render, so the user approves knowing the total spend. **Answer clarifying questions
   from the project brief FIRST (Step 1.5)** — only ask the user for a field (angle, which product,
   offer/code) the \`creative_brief\` leaves empty AND the recipe can't default. Do not re-ask for
   anything the composer already captured.
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
   music", "HER"). The \`update_ad_project_script\` call itself writes no render and costs no credits
   (the cheap pieces you already generated above have their own small cost) — it just populates the
   review panel.
3. **STOP — the review happens in the APP's review panel, NOT in this chat.** You've mirrored the
   ingredients (3.2); now hand the user the project's \`app_url\` (from \`get_ad_project\`) and tell
   them to review the pieces there and hit **"Approve & render"**. That button gives them a short
   message to paste back into this session — THAT is your go-ahead. Do NOT paste the
   script/ingredients into the chat for a thumbs-up, and do NOT render until that approval comes
   back from the app. If they want changes (via the app's comments or here), regenerate the
   affected ingredient, call \`update_ad_project_script\` again, tell them it's refreshed in the
   app, and wait for a fresh approval. Only AFTER the app approval do Step 4. A single approval
   authorises the WHOLE remaining chain — generate every paid piece, render, self-QC, publish —
   with NO further pauses (that is exactly why every paid prompt must already be in the panel).

## Step 4 — render locally, report stages, publish

1. Now generate every PAID piece you showed as a prompt in Step 3 — the AI stills/video, voice,
   music, the end-card render — through the media proxies (below), each from its approved prompt.
   Then assemble per the recipe (Playwright record where needed → ffmpeg stitch → \`mix-master\`
   audio).
2. Open the row LAST: \`submit_render { project_id, kind: "full" }\` → keep \`render_id\`, then
   \`update_render_status { render_id, status: "running" }\`. The render row tracks status only
   (queued / running / complete / failed) — narrate fine-grained progress with
   \`append_project_message\` instead.
3. **MANDATORY final-video QC gate — YOU review EVERY finished master before \`set_final_render\`,
   whatever the format (UGC or not).** This is your own automated quality check, separate from the
   user's Step-3 approval — it does not go back to the user. The render row is already open (its
   nominal credit spent, \`submit_render\` in 4.2);
   this gate stands between a rendered master and PINNING/publishing it, so a bad render never gets
   set as final. A master that looks fine on a still can still have a mis-voiced word, a caption
   drifting off its line, a beat out of order, or a deformation — review the actual VIDEO, not
   stills. Run the passes that APPLY to this format:
   - **Audio ↔ script** — any master with SPEECH (VO or native/Seedance voice); **skip for
     music-only / no-speech formats.** \`review-ugc-render\` is format-agnostic despite the name —
     a deterministic Whisper transcript-vs-script diff, not UGC-specific: persist the approved
     spoken lines to \`working/approved-script.txt\`, then \`gooseworks fetch review-ugc-render\` and
     run \`review_render.py --video <master>.mp4 --script-file working/approved-script.txt --json
     working/review-verdict.json\` (exit 0 PASS / 2 FAIL / 3 ERROR). It blocks a mis-voiced word
     (approved "human-vetted" → "human witted"), a dropped phrase, or silence. It routes Whisper
     through the gooseworks proxy when \`OPENAI_BASE_URL\` is set; with no backend at all, run
     \`fal-ai/whisper\` via \`fal-proxy\` (upload the audio, pass its \`get_download_url\` as \`audio_url\`)
     and diff the transcript yourself.
   - **Captions / subtitles** — ANY captioned format (the most common non-UGC defect); **skip for
     UGC/Seedance masters, which carry no subtitle track.** Concrete check: diff the caption file
     you burned (SRT/ASS) against the SAME Whisper transcript + word timings from the audio pass —
     every caption line must match the heard/scripted words and sit within ~0.3s of when they're
     spoken; then in the visual pass below, OCR-read the burned caption off 4–5 sampled frames to
     confirm it's actually on screen at that time and not colliding with a hyperframe or the end
     card. Mismatched text or >0.3s drift fails the gate.
   - **Visual + structure** — always: run the \`watch\` skill on the master — beat/scene order + SFX,
     the brand's product (not the source's) is shown, the end card has the real wordmark + code, no
     deformation/artifact, duration within ~20% of the source.
   If ANY applicable pass fails, FIX it (regenerate/stitch the offending window, rebuild captions)
   and re-review — only a clean pass proceeds to \`set_final_render\`. **This gate is universal: it
   runs from the master skill for every format, so a recipe never has to opt in.**
4. Publish: \`get_upload_url { target: { type: "agent", agent_id: ADS_AGENT } }\` → PUT the master
   and poster **under the project folder** (see Identity's path-prefix rule) — to
   \`agent-config/brands/<brand_slug>/projects/<project_id>/working/final.mp4\` and
   \`.../working/final-thumb.jpg\`. **Always target ADS_AGENT AND use the full project-folder path**
   — a bare \`working/final.mp4\`, even on the right agent, 404s in the app. Verify servable:
   \`get_download_url { target: ADS_AGENT, path: "agent-config/brands/<brand_slug>/projects/<project_id>/working/final.mp4" }\`
   must return a non-empty URL (curl it for HTTP 200).
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
\`?token=<api_key>&agent_id=<agent_id>&project_id=<project_id>\` (agent_id bills the Ads agent;
\`project_id\` = the id of the project you're rendering — it attributes this generation's credits to
that ad project so the user sees per-project spend in the app. ALWAYS pass it). FAL = \`fal-proxy\`
(+ \`fal-storage-proxy\` to host a local image and get a CDN URL); ElevenLabs = \`elevenlabs-proxy\`
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

def _params(tok, agent, project_id=None):
    p = {"token": tok}
    if agent: p["agent_id"] = agent
    if project_id: p["project_id"] = project_id  # attributes the spend to this ad project
    return p

def fal_generate(model_path, payload, project_id=None, timeout_s=180, poll_s=3):
    """model_path e.g. 'fal-ai/nano-banana-2/edit' (the recipe names the model).
    Pass project_id = the ad project you're rendering so credits attribute to it.
    Returns the result image URL (a public *.fal.media CDN URL)."""
    api_base, tok, agent = _cfg()
    base = api_base + "/api/internal/fal-proxy"
    sub = requests.post(f"{base}/{model_path}", params=_params(tok, agent, project_id), json=payload).json()
    to_proxy = lambda u: base + urlparse(u).path
    status_url, response_url = to_proxy(sub["status_url"]), to_proxy(sub["response_url"])
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        st = requests.get(status_url, params=_params(tok, agent, project_id)).json()
        if st.get("status") == "COMPLETED":
            return requests.get(response_url, params=_params(tok, agent, project_id)).json()["images"][0]["url"]
        if st.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(f"FAL failed: {st}")
        time.sleep(poll_s)
    raise TimeoutError("FAL polling exceeded timeout")
\`\`\`

ElevenLabs (VO / music) is the same shape against \`<api_base>/api/internal/elevenlabs-proxy\`
with \`?token=&agent_id=&project_id=\`. Feed FAL a local image by storing it (\`get_upload_url\`) and passing its
\`get_download_url\` presigned URL as an \`image_urls\` / \`audio_url\` entry — this is the reliable
path. (\`fal-storage-proxy\` may 404 depending on the install; don't block on it — prefer the
\`get_download_url\` presigned URL.)

## Rules

- **MCP + ffmpeg + Playwright required** — run \`gooseworks doctor\` in Phase 0; stop with the
  exact fix it prints if anything is ✗.
- **Assemble the whole review set first**, mirror it with \`update_ad_project_script\`, and get the
  user's approval **in the app's review panel** (the "Approve & render" button) BEFORE the expensive
  render — never ask for a thumbs-up in this chat (review-once, in-app).
- **Show the REAL cheap pieces; PROMPT only the expensive render.** Generate the FREE + CHEAP-paid
  pieces (≤ ~100 credits — stills, creator frame, end card, short VO/music) and mirror the real
  assets; put ONLY the expensive video take/render in the panel as its exact prompt. That prompt
  must be in the panel before you ask to approve, so a single "go" runs the render + any remaining
  paid work (→ QC → publish) with no re-pausing.
- **Costs in CREDITS, never dollars.** credits ≈ round-up(provider-$ × 120) per generation + a flat
  200-credit base per video; never show a "$…" figure to the user.
- **Never assemble the full video before approval.** The review shows the
  individual PIECES, never the finished cut (or their prompts) — not a
  stitched/composited cut; do not add a "full cascade" / finished-video clip
  as a review ingredient (GOOSE-2542). The assembled video is produced only in
  Step 4.
- **submit_render only after the master is rendered** (Step 4.2), never on a guess; \`output_url\` =
  the durable render-file URL, never a CDN URL.
- **Always pass \`project_id\` on media-proxy calls** (fal / ElevenLabs) so the credits attribute
  to this ad project — that's what lets the user see per-project spend in the app.
- **Verify a real, non-empty MP4** (watch it) before marking the render complete.
- **Reuse the brand** when its research is complete; never re-research.
- On a hard error (auth/quota/model/timeout) set the render \`failed\` with a short
  \`error_message\` and stop — don't ship the source unchanged. **Also \`log\` it** (\`gooseworks log\`
  / \`log_cli_event\`, \`--event-type api_failure|error\`) so we can see + fix it (see "Report problems").
- **Report blockers/bugs/confusing instructions via telemetry** (\`gooseworks log\` or the
  \`log_cli_event\` MCP tool) — not just to the user. Set \`GW_RUN_ID\` once so events group.
- Always end a successful run with \`app_url\` + \`brand_url\`, verbatim.
`;
}

/**
 * Returns the goose-product-photos entry SKILL.md content.
 *
 * GOOSE-3190: this skill already existed on disk (`skills/goose-product-photos/
 * SKILL.md`, hand-maintained) and was already served by the backend to hosted
 * connectors — but it was NOT in `getEntrySkills()`, so `npm run generate:skills`
 * never regenerated it and `install` / `update` / login-refresh never wrote or
 * refreshed it on a user's machine. Moving the body here makes the registry the
 * one source: one command emits all four entry skills.
 */
export function getGooseProductPhotosSkillContent(): string {
  return `---
name: goose-product-photos
slug: goose-product-photos
description: >
  GooseWorks Product Photos — turn a brand's product images into publish-ready photography
  (clean studio shots, lifestyle scenes, on-model looks) while keeping the product faithful
  (silhouette, materials, logo, colorway). You pick a brand + product and submit; the GooseWorks
  backend runs the SAME server-side pipeline the Product Photos studio uses (compose → generate →
  judge → auto-retry) and bills credits. Use when the user says "make product photos", "shoot my
  product", "studio/lifestyle/on-model photo of <product>", "generate product photography", or
  references a product to photograph. Unlike goose-ads (ad creative) this produces clean PRODUCT
  photos that can then feed the ad workflow.
category: ads
version: 0.2.0
author: GooseWorks
tags: [gooseworks, ads, product-photos, photoshoot, product, ecommerce, studio, lifestyle, on-model]
---

# GooseWorks Product Photos — branded product photography

The GooseWorks Product Photos skill. You **pick a brand + product and submit one generation**;
the **backend** runs the whole pipeline (compose the shot prompt → generate on \`gpt_image_2\` →
judge for product fidelity → auto-retry a few times for free) and stores the results. You do NOT
generate images, call a model, or manage files — this is the exact same workflow the Product
Photos studio uses, so the skill and the app can never drift. The point is to **enrich a brand's
usable product imagery** — approved photos join the brand kit and can then feed the ad workflow
(\`goose-ads\`).

## Prerequisite — the GooseWorks MCP server is REQUIRED

Everything goes through the \`mcp__gooseworks__*\` tools. If they are not available, **stop and
tell the user to run \`gooseworks install --claude --mcp\`** (and restart Claude Code). There is no
HTTP/file fallback.

## Start from the brand context — don't re-ask what it already answers

If the \`gooseworks\` router handed you brand context, USE IT. If you were invoked directly, call
\`brand_get_context\` yourself first. It answers most of the setup questions below, so **do not ask
the user for them**:

- **Which product?** — the context's \`products[]\` are the real catalog entries. Offer them; never
  invent a product or ask the user to describe one you can already see.
- **What does it look like / what is it made of?** — grounded in the product's stored images and
  description. Never guess a material, colorway, or silhouette.
- **What vibe / who is it for?** — the context's voice, positioning, and audience already say. Let
  them shape the scene and styling instead of asking "what mood do you want?".
- **Brand look** — logo, colors, and fonts are owned by the backend research pass. Read them, never
  re-derive them.

Ask only for the genuinely open choices: the shot \`category\`, how many photos, quality, and
whether a human model is wanted (which needs explicit consent — see the rules).

## Identity & credits

- One agent-scoped token authenticates the tools; they resolve your org automatically. Never
  print the token. (You may pass an optional \`target\` to operate on a specific agent/org, exactly
  as the other GooseWorks tools; omit it to use your pinned scope.)
- **Credits are handled by the backend.** \`generate_product_photos\` reserves the estimated cost up
  front and bills only the photos that pass the judge — **automatic retries are free**, and a photo
  the judge can't get right (\`flagged\`) is shown but **never billed**. Call
  \`estimate_product_photos\` first to quote the cost; \`get_ad_credits\` shows the balance.

## The tools

**Pick the brand + product**
- \`list_ad_brands\` — the user's ad brands (get a \`brand_id\`; also carries \`slug\`).
- \`list_brand_products { brand_id, search?, page?, page_size? }\` — the brand's imported products.
  Pick a \`product_id\` to shoot. \`search\` matches name / type / variant / SKU.
- \`import_product { brand_id, kind, url, product_name? }\` — import a product if it isn't in the
  catalog yet. \`kind\` is \`product_url\` (a single product page), \`shopify_store\` (a store URL →
  imports the catalog), or \`image_url\` (a direct image; requires \`product_name\`). Returns an import
  row with an \`id\`; if its \`status\` isn't \`complete\`, poll \`get_product_import\` until it is, then
  \`list_brand_products\` to find the new product. (File uploads aren't available over MCP — use a URL.)
- \`get_product_import { import_id }\` — poll an import until \`status\` is \`complete\` or \`failed\`.

**Generate**
- \`estimate_product_photos { count, quality? }\` — cost preview (per-photo + total credits). \`count\`
  is 1, 2, 4, or 8; \`quality\` is \`low\` | \`medium\` | \`high\` (default \`medium\`). Reserves nothing.
- \`generate_product_photos { brand_id, product_id, variant_id?, category, controls?, prompt?,
  count?, quality?, reference_image_urls?, attestation_accepted? }\` — **the one call that makes
  photos.** \`category\` is \`apparel\` | \`beauty\` | \`cpg\` (seeds sensible scene/framing defaults).
  Omit \`controls\` to use the category preset; pass \`prompt\` as free-text steering **added on top of**
  the settings (it doesn't replace them). Returns a generation with an \`id\` **immediately** — poll
  \`get_product_photo_generation\` until done, then read each \`outputs[].final_image_url\`.
  **If you request a human model** (\`controls.model.presence\` is not \`none\`) you MUST pass
  \`attestation_accepted: true\` to confirm the user has the rights for model imagery.
- \`get_product_photo_generation { generation_id }\` — poll until \`status\` is \`complete\`,
  \`partial_failure\`, or \`failed\`. Each \`outputs[]\` entry has its own \`status\` and, once ready, a
  \`final_image_url\`. A \`flagged\` output is the best attempt but wasn't billed.

**Use the results**
- \`list_product_photos { brand_id, archived? }\` — the brand's generated photos (\`archived: false\`
  = active, \`true\` = archived).
- \`approve_product_photo { output_id }\` — approve a photo: links it to the product and makes it
  available in the **brand kit**, so \`goose-ads\` can use it. **Photos are not used anywhere until
  approved.**
- \`archive_product_photo { output_id, reason? }\` — archive a photo; archived photos are **excluded**
  from ad generation.

## Workflow — shoot a product

1. **Load the brand context** (\`brand_get_context\`, or reuse what the router passed you) and
   **resolve the brand + product.** \`list_ad_brands\` → \`brand_id\`. \`list_brand_products\` → pick a
   \`product_id\` from the catalog you already know about. If the product genuinely isn't there,
   \`import_product\` (poll \`get_product_import\`).
2. **Quote the cost.** \`estimate_product_photos { count, quality }\` → tell the user credits.
3. **Generate.** \`generate_product_photos { brand_id, product_id, category, count, quality, prompt? }\`.
   Build \`prompt\` from the brand's voice/positioning you already have — don't interview the user for it.
   Returns a generation \`id\` right away.
4. **Poll.** \`get_product_photo_generation { generation_id }\` until terminal; hand back each
   \`final_image_url\`.
5. **Approve the keepers.** Show the results and let the user pick; \`approve_product_photo\` the ones
   they'd publish (that's what puts them in the brand kit for ads), \`archive_product_photo\` the rest.

## Rules

- **Never invent product facts.** The backend grounds the shot on the product's real images; don't
  describe a product you can't see.
- **Use the brand context instead of interviewing the user.** Product, audience, voice, positioning,
  logo/colors/fonts all come from \`brand_get_context\` / the brand kit. Ask only for the shot
  category, count, quality, and model consent.
- **Ask before spending.** Quote the estimate and confirm \`count\` / \`quality\` before
  \`generate_product_photos\` — it reserves credits.
- **Poll, don't re-submit.** A generation that's still \`running\` is not stuck; re-submitting
  double-bills. Only a \`failed\` generation should be retried.
- **Model imagery needs consent.** Only set a human model when the user asks, and pass
  \`attestation_accepted: true\`.
- **Approval is the hand-off to ads.** Remind the user that only **approved** photos reach the brand
  kit / ad workflow; archived ones never do.
`;
}
