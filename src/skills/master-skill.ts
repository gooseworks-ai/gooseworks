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
 *
 * Video (vendored here, GOOSE-3677):
 *   - `goose-video`       — the front door for a new video ad: brand → goal →
 *     format table → machine check → project → hand off to goose-video-local
 *     (getGooseVideoSkillContent). The only full copy of that body.
 *   - `goose-video-local` — render an existing app project/batch LOCALLY
 *     (Playwright + ffmpeg + media proxies) (getGooseVideoLocalSkillContent).
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
    { name: 'goose-video-local', content: getGooseVideoLocalSkillContent() },
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

Onboarding happens inside the current agent and is the first-run gate for every GooseWorks task. It uses the exact same saved state and step order as the web onboarding. The user does not need to type **\`/gooseworks onboard me\`**; that explicit command only starts or resumes the same flow.

Keep the user's original task pending. Call **\`brand_onboarding { action: "status" }\`** before routing or executing it, then:

- follow only the returned \`next_step\`;
- save each answer immediately with \`brand_onboarding\` so web, Claude, Codex, ChatGPT, and Cowork can resume one another;
- continue the original request immediately when \`onboarding_completed\` is true.

If \`brand_onboarding\` is unavailable, explain that the GooseWorks MCP connection must be enabled. Do not write a parallel local profile and do not run the retired role / discovery-source / ad-owner questionnaire.

When onboarding returns a review link, show that single link and ask the user to review the creatives and reply \`done\`. When they reply \`done\`, do not restart onboarding: continue the task they originally asked for. If there was no earlier task, ask: **“Let’s start your next campaign. What are you promoting, and what result do you want?”** Use the same preserved-task-or-campaign handoff if onboarding completes while the creatives are still being prepared or could not be generated.

### Shared flow

Use the host's native question controls. Ask one short group at a time and rely on the live tool schema for accepted values.

1. **Start** — If status returns \`start\`, ask for the company website or Apple App Store URL. Also offer the optional hero product URL and “Where do you do your work?” choices: Slack, WhatsApp, iMessage, Claude Code, Claude, Codex, and ChatGPT. Call \`action: "start"\`; server-side research begins immediately. If status returns \`select_brand\`, ask which company/client to use. Otherwise reuse the only brand automatically.
2. **Your coworker** — Ask what they want to name their Growth Coworker. A text-only client may keep the default avatar; do not block on an image. Save with \`action: "save_coworker"\`.
3. **Your company** — Use the returned \`company_draft\` as the starting point and ask the user to verify or edit: what they sell (\`marketCategory\`), where people buy (\`appPlatforms\`), primary customer, customer problem, promised outcome, and optional differentiator. Save with \`action: "save_company"\`.
4. **Your taste** — In a terminal or CLI host, use the returned \`taste_url\`: open it when the host supports opening links and always show one clickable **Choose your taste in GooseWorks** link. Ask the user to heart or skip ads on that page, click **Continue** or **Skip this**, return to the agent, and reply \`done\`. Do not print, enumerate, or summarize \`taste_deck\` in the terminal. After \`done\`, call \`brand_onboarding { action: "status" }\` again and follow the refreshed \`next_step\`. In a chat host that renders images, show only the one image attached by the tool and save each Love/Skip decision with \`action: "save_taste"\`; send \`complete: true\` after three hearts or an explicit skip.
5. **First campaign** — Ask **“What’s happening right now?”**: launch \`launch\`, promotion \`promo\`, seasonal moment \`seasonal\`, or nothing special \`nothing\`, plus an optional note. Call \`action: "propose_campaign"\`, show the returned editable card (name, objective, offer, audience, 2–3 angles, CTA, and product URL), and save edits with \`action: "save_campaign"\`. Send \`accept: true\` only after approval; acceptance can start the complimentary first creatives.
6. **Where you are** — Ask monthly ad spend (\`none\`, \`under_1k\`, \`1k_5k\`, \`5k_25k\`, \`25k_plus\`), annual revenue (\`under_1m\`, \`1m_10m\`, \`10m_100m\`, \`100m_plus\`), the 90-day goal, current channels (an empty list is a valid “nothing yet”), and at least one channel they are willing to use. Channel values: \`paid_social\`, \`search_ads\`, \`content\`, \`creators\`, \`seo\`, \`communities\`, \`referrals\`, \`partnerships\`, \`outbound\`, \`app_stores\`, \`other\`. Save with \`action: "save_progress"\`.
7. **Review** — Show the returned founder, researched, and inferred facts with their provenance. The user may correct positioning, audience, voice, value propositions, proof points, or competitors through \`action: "review_research"\`. Complete the review even when research is still running, failed, or sparse; never trap the user waiting for it.
8. **Channels** — If \`channel_connected\` is already true, this is complete automatically. Otherwise ask whether they want to connect Slack, WhatsApp, or iMessage later, or skip for now. An explicit skip is valid; call \`action: "complete_channels"\`.

Do not ask for role, discovery source, who makes creatives, who manages ads, or a separate “what do you want to do first?” menu. Those belonged to the retired CLI questionnaire. The task the user already asked for is their first task.

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
 * Returns the goose-video entry SKILL.md content (GOOSE-3677).
 *
 * The front door for a NEW video ad: "make me a video ad for <brand>" → brand →
 * what it's for → a table of every format with demos → a machine check
 * (`gooseworks doctor`) → the project → `goose-video-local` in the same session.
 * Server-rendered video orders are paused on the public MCP (gooseworks-app
 * server-video-orders.ts): the catalogue lists only client-side formats, so this
 * skill no longer carries the quote / gate / CreativeSpec server flow. If server
 * orders come back, restore it from git history (before goose-video 2.0.0).
 *
 * This is the ONLY full copy of the body. goose-lab's `order-video` is a stub
 * that points here; edit the ordering flow in this function.
 */
export function getGooseVideoSkillContent(): string {
  return `---
name: goose-video
slug: goose-video
description: >
  Start a video ad without leaving the chat. Use it when the user says "make me a video ad for
  <brand>", "I want a video ad", or asks for a UGC / iMessage / explainer / product-demo video.
  One sentence is enough: it picks the brand, asks what the ad is for, shows every video format in
  a table with demo links, checks this machine can render, creates the project and hands it to
  goose-video-local, which makes the video here and saves it back to the app. Every format runs on
  the customer's own machine (Claude Code, Codex or Cursor); a hosted connector (ChatGPT,
  claude.ai, Cowork) can show the formats but cannot render one.
category: ads
version: 2.0.0
author: GooseWorks
tags: [gooseworks, ads, video, client-side, local-render]
---

# GooseWorks Video Ads — pick a format, then make it here

## Purpose

Gets a customer from one sentence ("make me a video ad for Bioma") to a video project with the
right format, then hands that project to **\`goose-video-local\`**, which makes the video on this
machine and saves it back to the app.

**Every video format runs on the customer's machine.** The GooseWorks server does not render
videos right now. It lists the formats, stores the project, bills each paid step through its media
proxy and keeps the finished video. There is no server quote, no server script preview and no
server render to order: \`video_catalog_list\` returns only client-side formats
(\`execution: "client"\`), and a server-format project is refused with \`format_unavailable\`.

**The whole job happens in the chat.** Choosing, approving and receiving the video all happen here,
as text and links the customer can click. The app is for **payment and nothing else**.

## Route first: is this a new video?

Hand off to **\`goose-video-local\`** now, and stop following this skill, for:

- an existing **project** id or a **video batch** id;
- the app's copy-for-Claude command (it names \`goose-video-local\`);
- "remix this video ad template" for a specific app template.

Use \`goose-video-local\` if it is installed; otherwise load it with
\`catalog_fetch { type: "skill", slug: "goose-video-local" }\` on the GooseWorks MCP (older clients:
\`fetch_skill("goose-video-local")\`). It reads the project first and says what to do with it.

Everything else, including "make me a video ad for <brand>", starts at step 1 below.

## Inputs

- A brand, usually named in the opening sentence. Resolved to \`brand_id\`; with one brand in the org it needs no input.
- What the ad is for, in the customer's words (optional; asked once, never forced). It becomes the brief \`goose-video-local\` works from.
- Anything else they volunteer: who it's for, names or terms it must say, things to stay away from. Never asked for; kept when offered.
- What the picked format needs from the brand (\`card.needs\`): usually a clean product photo, a screen recording or their own footage.

## Composed Atoms

MCP tools; \`goose-video-local\` does the making.

- \`brand_list\`: brand NAME → \`brand_id\`. Pass \`query\` when they named one.
- \`brand_create { name, website_url }\`: only when the customer asks to add a brand that isn't there. Free.
- \`brand_get_context { brand_id }\`: research status, logo, product photos.
- \`video_catalog_list { kind: "formats", brand_id }\`: every format that can be made. Each row has \`template_id\`, \`card.description\`, \`card.best_for\`, \`card.needs\` and \`examples[]\` (demo videos). The response carries a \`client_formats_note\` with the machine checks.
- \`video_project_upsert { brand_id, name, format: <template_id> }\`: creates the project. Free.
- \`catalog_fetch { type: "skill", slug: "goose-video-local" }\`: the skill that makes it.

## Paid media: images, clips, voice

Every paid generation — a creator still, a product cutout, a screen-recording frame placed in a
laptop, an animated clip, a voiceover, a music bed — goes through the GooseWorks media proxy and is
billed per call to the project. **No FAL_KEY, ElevenLabs key or \`fal_client\` is ever needed.**
A recipe, atom or open-source skill that says "needs FAL_KEY" is satisfied by the proxy; it is
never a blocker. With the GooseWorks MCP alone:

- **Image or clip, any fal model** (Nano Banana, GPT-image, Seedream, Seedance, Kling):
  \`data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">, body: <model input>, project_id }\`,
  then poll \`job_get { job_id }\` until \`complete\`; the \`*.fal.media\` URLs are in \`result\`.
- **Voice or music:** \`data_post_provider { provider: "elevenlabs", … , project_id }\`.
- **A local file as an input** (a frame, a screenshot): \`media_upload\` it first and pass the returned public URL.

\`photos_generate\` is **not** a general image tool: it only photographs a physical catalog product
(apparel, beauty, CPG). A software screenshot or app mockup is a fal image edit. \`goose-video-local\`
has the full rules (atoms, the relay, saving each piece as it passes QC).

## Workflow

The opening is fixed: **brand → what it's for → format table → machine check → project → hand off.**
Do each step without waiting for the customer to ask for it.

### 1. Resolve the brand, quietly when you can

Call \`brand_list\`, with \`query\` when they named a brand. \`query\` is a case-insensitive substring match, so "Kolkata Chai" also finds "Kolkata Chai Co". If it finds nothing, call \`brand_list\` once more with no query before deciding.

- **The org has exactly one brand** → use it. Say which in one line ("Making this for **Bioma**.") and move on. Don't ask.
- **The name they said matches exactly one brand** → use it. Say which.
- **Several match, or they named none and the org has several** → show a table (name, website) and ask.
- **Nothing matches** → say so, list the brands they do have in a table, and offer to add the new one here: "Or send me its website and I'll add it." With a website, call \`brand_create { name, website_url }\` (free). It starts brand research, which fills in the logo and colours in a few minutes. Carry on from step 2 while it runs. Never create a brand they didn't ask for, and never guess the website.

If the GooseWorks MCP's own instructions have you check onboarding first and it turns out unfinished, finish it, then come back here with the customer's original sentence.

### 2. Ask what the ad is for, in one open question

Unless the opening sentence already said it, ask **one** plain question and wait:

> What's this ad for? For example: launching something, a sale, explaining how it works, or showing real results. Anything you tell me helps me pick the right format.

This is a free-text question: **no menu, no table, no list of formats yet.** Take whatever they say, even "not sure". Never ask it twice, and never block on it.

**Keep the answer, as they said it.** It is the brief \`goose-video-local\` works from in step 5. If their words also say who the ad is for, a name or term the ad must say, or something to stay away from, note those too. Never ask for those and never fill them with a guess.

Skip the question when the opening already names a goal ("…a video ad for our summer sale") or a format ("…an iMessage video ad"). With a format named, go to the table with that format first and marked.

### 3. Show every format in a table, best fit first

\`video_catalog_list { kind: "formats", brand_id }\`, then **always a markdown table in your message**, with **every row** the tool returned.

Order the rows by how well each format fits their answer. Judge fit from \`card.description\` and \`card.best_for\` against what they said. **A format whose card contradicts what they asked for is never Suggested**, however well its keywords match. When nothing fits, say so before the table ("None of our formats does X; the closest is Y, which gives up Z") and still show the table. Mark **exactly one** row **Suggested** with a few words on why; a close second can be **Also good**.

| | Format | What it looks like | Needs | Demo |
|---|---|---|---|---|
| **Suggested** | Split-screen creator demo | A creator reacts on top while your app plays below | a screen recording of your product | [watch](https://…) |
| **Also good** | Creator product review | An AI creator reviews your product to camera, holding it | a clean photo of the real product | [watch](https://…) |

- **"What it looks like" is \`card.description\`, quoted.** Copy it word for word; you may cut it at a sentence boundary, never re-word it. A paraphrase once turned "narrates how it gets beaten" into "narrates the fix", which made a villain format look right for a no-villain brief.
- **Needs** is \`card.needs\` in plain words. Judge logo and product photos from the \`brand_list\` row; treat anything you can't see as missing rather than make extra calls. A format that needs something the brand lacks goes last; don't hide it, don't suggest it.
- **Match the product to the format.** A format built around a creator HOLDING a physical product is a poor fit for a software product; one built on a screen recording is a poor fit for a physical one. Say so in the row.
- **Demo** is \`examples[0].output_url\`. When a format has none, write "no demo yet"; never leave it blank.
- **Price:** say once, under the table, that each paid step (a creator still, a clip, a voice) is billed per call and approved before it runs. There is no single up-front quote.

**Print the table in your message, THEN ask which one.** Never put the formats only inside a structured question control: it renders plain option labels, not links, so the customer would be picking a format they were never able to watch.

### 4. Check this machine can render it

- **Hosted connector** (ChatGPT, claude.ai, Cowork: no shell) → say plainly that the video is made on their own machine and needs Claude Code, Codex or Cursor. Stop there; do not create a project you cannot finish.
- **Terminal host** → run \`gooseworks doctor\` (or, with no CLI, the manual checks in \`client_formats_note\`). It checks Node 18+, ffmpeg with libx264 + libass, ffprobe, and that Playwright's Chromium is actually downloaded. Anything fails → show the exact fix command and ask them to run it, then check again. Never start on a machine that failed the check.

Then say plainly, in one short paragraph: it renders on this machine; paid steps are billed per call and each is approved before it runs; it needs what \`card.needs\` says.

### 5. Create the project and hand it off, in this session

1. \`video_project_upsert { brand_id, name, format: <template_id> }\` with **no \`brief\`** (a brief makes a concept batch).
2. Load \`goose-video-local\` (installed, or \`catalog_fetch { type: "skill", slug: "goose-video-local" }\`) and follow it on that \`project_id\` now. Their step-2 answer and anything they volunteered is the brief for its Step 1.5: use it, don't ask again.

Do not hand the customer a command to paste somewhere else.

## Decision Rules

- **One sentence is a complete request.** Never answer "make me a video ad for X" by asking which format, which tool or what to do next. Run steps 1–3 and let the table do the asking.
- **One brand in the org → never ask which brand.** State the one you used.
- **Open question first, table second.** The goal question comes before any list, and the table comes ordered, with one suggestion.
- **More than two options → table in the message.** A question control may capture the answer after the table, never instead of it.
- **Quote cards, never paraphrase them.** A reworded card can promise something the format cannot do.
- **A contradiction with the card outranks every keyword match.**
- **They asked for a format that isn't in the catalogue** → it isn't available yet. Say so, show the table, and don't improvise one.
- **A missing key is never a blocker.** Paid media goes through \`data_post_provider\` (see "Paid media"); never ask anyone to set FAL_KEY.
- **Never order a server render.** There is none right now; every format is made here by \`goose-video-local\`.

## Output

A created video project on the picked format, handed to \`goose-video-local\` in the same session, which delivers the finished video in the chat.

## Quality Checks

- A one-sentence opening got: the brand resolved (unasked when there is one), one open goal question, then a table of every format with demo links and one suggestion.
- Every "What it looks like" cell is the card's own words; no Suggested format's card contradicts what they asked for.
- The machine check ran and passed before the project was created; a hosted connector was told it needs Claude Code, Codex or Cursor.
- The project was created with no brief, and \`goose-video-local\` ran on it in the same session with the customer's step-2 answer as its brief.
- No one was asked for a FAL_KEY or any provider key.

## Failure Modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Make me a video ad for X" got back "which format / what would you like?" | Treated the one-liner as incomplete | Run steps 1–3 unprompted |
| Asked which brand in a one-brand org | Skipped the count check in step 1 | Use the only brand and say which |
| Demo links invisible to the customer | The choices went only into the structured question control | Table in the message first; the control only takes the answer |
| \`format_unavailable\` | A server-rendered format, paused right now | Re-read the catalogue; offer what's in it |
| "I can't generate the image: FAL_KEY isn't set / fal_client isn't installed" | Read an atom's or open-source skill's environment line as a requirement | Use \`data_post_provider { provider: "fal", … }\` + \`job_get\`; no key is needed |
| "The only image tool is photos_generate and it wants a product_id" | \`photos_generate\` is for physical catalog products only | Any other image is a fal call through \`data_post_provider\` |
| \`gooseworks doctor\` fails | A missing toolchain piece | Show its fix command, re-check; never start anyway |
| Video not on this plan | Lite and trial have no video entitlement | Say so and point at the upgrade; this is the one app trip that's allowed |
| Two projects for one video | A second project was created instead of continuing the first | Continue on the SAME \`project_id\` |

`;
}

/**
 * The canonical render-row actions for a client/agent-rendered video
 * (GOOSE-3725): `video_render_run kind:"full"` (no dry_run) on a sample-remix
 * project OPENS a queued ad_render row and returns `render_id`;
 * `video_render_run { render: { render_id, status, ... } }` UPDATES it
 * (← update_render_status). If those names change, edit ONLY these constants:
 * every mention in the goose-video-local skill text is built from them.
 */
export const RENDER_ROW_TOOL = 'video_render_run';
export const RENDER_OPEN_ARGS = 'kind: "full"';
export const RENDER_UPDATE_KEY = 'render';

/**
 * Returns the goose-video-local entry SKILL.md content (GOOSE-3677, GOOSE-3726).
 *
 * The local-render runtime. VIDEO projects made in the app (template remixes,
 * concept batches, anything that is not a recipe order) render wherever the
 * agent runs: the user's own Claude Code (with or without the gooseworks CLI)
 * OR an agent inside the GooseWorks E2B workspace sandbox (canonical MCP tools
 * + Bash, no CLI, no credentials.json; media proxies via GW_MEDIA_PROXY_TOKEN).
 * It fetches the per-format recipe, renders (ffmpeg, PIL, Playwright where
 * available), mirrors the review set for a free in-app review, then saves the
 * finished MP4 back over MCP using the canonical tools (video_project_*,
 * catalog_fetch, media_upload, the video_render_run render-row actions).
 */
export function getGooseVideoLocalSkillContent(): string {
  return `---
name: goose-video-local
slug: goose-video-local
description: >
  Render an EXISTING GooseWorks video ad project or video batch with ffmpeg (plus Playwright for
  phone-mockup formats) and the GooseWorks media proxies, then save the finished MP4 back to the
  project over MCP. Runs on the user's own machine (Claude Code / desktop app, with or without the
  gooseworks CLI) OR inside a GooseWorks workspace sandbox (canonical MCP tools + Bash, no CLI).
  Use for a client-side format project (created by goose-video), a template-remix project or a
  video batch. A copy-for-Claude command or project id must first be checked with
  video_project_read. Not for a hosted connector with no shell. To start a NEW video ad in chat,
  use goose-video first.
category: ads
version: 0.5.0
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, podcast, ugc, local-render, sandbox, byoa]
---

# GooseWorks Video Ads — local remix runtime

## Mandatory route check before any local work or spend

For every existing \`project_id\` (including one supplied by the app's copy-for-Claude command),
call \`video_project_read { brand_id, project_id }\` **before** template lookup, toolchain setup,
media-proxy calls, or a review-set upload. For a batch, inspect each child project.

- **A server-rendered order** — the response has \`creative_plan\`,
  \`project.creative_spec_revision_id\`, \`order.creative_spec_revision_id\`, a planning
  \`lifecycle\`, or an \`order\` / \`script_drafts.recipe\` on a server format → **stop.**
  Server video orders are paused, and there is **no vetted local node-execution API** for them:
  do not rebuild one locally. Tell the customer this project was made for the server flow, which
  is paused; offer to start the same ad on a client-side format (\`goose-video\`, fetched with
  \`catalog_fetch { type: "skill", slug: "goose-video" }\`, older clients:
  \`fetch_skill("goose-video")\`). An order already holding credits can be released with
  \`job_cancel\`.
- **A client-side format or template remix** (a \`source_sample_id\` / \`template_id\` and none of
  the above) → continue below.
- **Unclear** → read again or ask; never guess and generate. A copy prompt that names this skill
  is not proof of which kind the project is.

Continue below only for a verified client-side format or template remix.

For client-side formats and template remixes, you produce **video** ad creative wherever THIS agent runs and sync
the result back to the GooseWorks app over MCP. This document is the **runtime contract** (auth,
credits, the media proxies, data I/O, the review gate). A separate **recipe** — the template's
\`recipe\`, plus the capability skills it names — tells you *what to make* (the pieces, prompts,
models, order of assembly).

**Division of authority: read both, but when they disagree THIS doc wins on the environment AND the
review/approval flow.** The recipe governs WHAT to make; this doc governs WHEN you pause, generate,
and spend. In particular: a recipe may spell out a **multi-phase, multi-gate** flow — "generate the
still [GATE] → approve → author the prompt [GATE] → approve → render [GATE] → approve", several
separate pauses. **Do NOT run it that way.** Collapse every one of those gates into the single
**review-once** flow below: one review set, one approval (Step 3). Take the recipe's pieces, prompts
and models; ignore its intermediate pauses. This is the exact contradiction that confused past runs
(GOOSE-2542) — there is no ambiguity: review-once wins.

The app NEVER runs this skill by itself — it is the viewer + review surface; you are the renderer.

## Where am I running? (decide once, first)

Check in Bash, without printing any secret value:

\`\`\`bash
[ -n "$GW_MEDIA_PROXY_TOKEN" ] && echo sandbox || echo local
command -v gooseworks >/dev/null && echo cli || echo no-cli
\`\`\`

| Mode | How you know | Skills / atoms | Media-proxy auth |
|---|---|---|---|
| **GooseWorks sandbox** | \`GW_MEDIA_PROXY_TOKEN\` is set | \`catalog_fetch { type: "skill" }\` | env: \`GW_MEDIA_PROXY_TOKEN\` + \`GW_*_PROXY_URL\` |
| **Local, CLI installed** | \`gooseworks\` on PATH | \`gooseworks fetch <slug>\` or \`catalog_fetch\` | \`~/.gooseworks/credentials.json\` |
| **Local, no CLI** (Claude desktop app / Codex without login) | neither | \`catalog_fetch { type: "skill" }\` | \`~/.gooseworks/credentials.json\` if present, else **paid media over the MCP** (below) |

The \`gooseworks\` CLI and \`~/.gooseworks/credentials.json\` are **optional**. Everything this skill
needs from the app goes through the GooseWorks MCP tools below; the atoms' \`media_proxy.py\` reads
credentials.json when it exists and falls back to the \`GW_MEDIA_PROXY_TOKEN\` env otherwise.

### Paid media over the MCP: no key, no CLI needed

Every paid generation goes through the GooseWorks media proxy and is billed to the project. **You
never need FAL_KEY, an ElevenLabs key or \`fal_client\`.** An atom, a recipe or an open-source
skill that lists \`FAL_KEY\` in its environment is describing a standalone setup; here the proxy
satisfies it. Never stop, and never ask anyone to set a key, because one is missing.

**A one-off image or clip — call the MCP directly.** A frame placed in a laptop, a product cutout,
a creator still, a restyle, an animated shot, with any fal model (Nano Banana, GPT-image, Seedream,
Seedance, Kling). No atom script is needed:

1. A local input (a frame pulled from a screen recording, a screenshot) must be a public URL first:
   \`media_upload { brand_id, scope: "video_project", scope_id: project_id, source: { type: "file" | "bytes", … } }\`
   (no \`path\`) and use the returned \`media.url\`.
2. \`data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">, body: <model input>, project_id }\`
   returns \`{ job_id: "fal:<request_id>" }\`. Pass an \`idempotency_key\` so a retry isn't billed twice.
3. Poll \`job_get { job_id }\` every few seconds until \`complete\`; the \`*.fal.media\` URLs are in
   \`result\`. Download each and QC it (open the image) before using it.

For a set that must match (every laptop shot, every creator still), use ONE prompt and the same
model for all of them and change only the input image. Voice and music:
\`data_post_provider { provider: "elevenlabs", path: "/v1/text-to-speech/{voice_id}" | "/v1/music", body, project_id }\`
(synchronous; the audio lands in the project folder).

\`photos_generate\` is **not** a general image tool: it only photographs a physical catalog
product (apparel, beauty, CPG) and needs a \`product_id\`. A software screenshot or app mockup is a
fal image edit, above.

**Atom scripts — the MCP relay.** With neither \`GW_MEDIA_PROXY_TOKEN\` nor
\`~/.gooseworks/credentials.json\`, the atoms' \`media_proxy.py\` RELAYS each paid call through you
instead of calling the proxies over HTTP. Before running any atom,
\`export GW_PROJECT_ID=<project_id> GW_BRAND_ID=<brand_id>\` (every call is billed to that
project). When a script **exits with code 3** it wrote a request file under
\`working/mcp-requests/\`: make exactly that MCP call — fal:
\`data_post_provider { provider: "fal", path, body, project_id }\` then \`job_get { job_id }\` until
\`complete\`, saving \`result.output\`; ElevenLabs: \`data_post_provider { provider: "elevenlabs", … }\`,
saving the reply; a local file: \`media_upload\` with its bytes, saving \`{"url": …}\`. Write that JSON
to the request's \`save_result_to\` and **re-run the same command**; repeat until the script
finishes. Same server proxy and price as the CLI path. If the CLI is logged in to a DIFFERENT
environment than this MCP connector (prod vs staging), set \`GW_MEDIA_VIA=mcp\` so the spend lands
where the project lives.

## MCP tools — canonical names (use these)

Use the canonical GooseWorks MCP tools. Legacy names are listed only as a fallback for an older
client that does not expose the canonical tool; never mix both for one step.

| Step | Canonical tool (use this) | Legacy fallback |
|---|---|---|
| Read a project / batch | \`video_project_read { brand_id, project_id }\` / \`video_project_read { brand_id, batch_id }\` | \`get_ad_project\` / \`get_ad_video_batch\` |
| Template recipe | \`catalog_fetch { type: "template", slug: <source_sample_id> }\` | \`get_ad_template\` |
| Capability skill (atom) + its scripts | \`catalog_fetch { type: "skill", slug }\` | \`gooseworks fetch <slug>\` / \`fetch_skill\` |
| Brand kit, products, rules | \`brand_read { brand_id, sections: ["summary","kit","products","learnings"] }\` | \`brand_get_context\` / \`get_brand_kit\` |
| Save a brand rule (a correction) | \`brand_update { brand_id, patch: { facts: [{ id?, kind, text }] } }\` | none |
| Mirror the review set | \`video_project_upsert { brand_id, project_id, patch: { script: { script_drafts, script } } }\` | \`update_ad_project_script\` |
| Project assets | \`video_project_upsert { …, patch: { assets: [...] } }\` | \`update_ad_project_asset\` |
| Progress note | \`video_project_upsert { …, patch: { message: { role: "agent", content } } }\` | \`append_project_message\` |
| Batch status | \`video_project_upsert { brand_id, batch_id, patch: { batch: { status } } }\` | \`update_ad_video_batch\` |
| Upload a file to the project | \`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path, source: { type: "file", filename, content_type } }\` → PUT (no confirm for \`path\` uploads) | \`get_upload_url\` / \`get_ad_upload_url\` |
| Save / find a finished piece (resume) | \`media_upload { …, path, ingredient_key, input_digest }\` / \`media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key_prefix: "" }\` (see "Save as you go") | none |
| Open the render row | \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_OPEN_ARGS} }\` (no \`dry_run\`; returns \`render_id\`) | \`submit_render { project_id, kind: "full" }\` |
| Update the render row | \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status, output_url?, thumbnail_url?, error_message?, quality_status?, quality_report? } }\` | \`update_render_status\` |
| Pin the final render | \`video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }\` | \`set_final_render\` |
| Credits / identity | \`account_whoami\` | \`get_ad_credits\` |

\`list_accessible_scopes\` and the \`target: { type: "agent", agent_id }\` dance are **not needed**:
\`media_upload\` with \`scope: "video_project"\` derives the right storage key (org-default Ads agent
+ brand slug + project folder) on the server.

## Running in a GooseWorks sandbox

You are an agent inside the user's GooseWorks workspace sandbox (Claude Code harness, Bash, the
GooseWorks MCP with canonical tools only). There is **no \`gooseworks\` CLI** and **no
\`~/.gooseworks/credentials.json\`**. The environment carries \`GW_MEDIA_PROXY_TOKEN\`, \`GW_API_BASE\`,
\`GW_FAL_PROXY_URL\`, \`GW_FAL_STORAGE_PROXY_URL\`, \`GW_ELEVENLABS_PROXY_URL\`, \`GW_WHISPER_PROXY_URL\`
and usually \`GW_PROJECT_ID\`.

- **Formats:** only formats that need **no Chromium** run here — podcast skits and UGC /
  talking-head formats (ffmpeg + PIL assembly). If the template's recipe or an atom needs
  Playwright/Chromium with no PIL fallback (iMessage / ChatGPT / Notes phone mockups,
  hyperframes, HTML recorders), **stop before any spend** and say so plainly: "This format needs
  a browser renderer that this workspace doesn't have. Run it in your own Claude Code with the
  GooseWorks CLI (\`goose-video-local\`), or pick a podcast/UGC format." Do not half-render.
- **Toolchain:** check \`ffmpeg -version\` and \`ffprobe -version\`. Install Python deps only when an
  atom needs them: \`pip install --quiet pillow\` when a render atom uses PIL (captions, end card),
  \`pip install --quiet requests\` if \`import requests\` fails. Never \`npx playwright install\` here.
- **Atoms:** \`catalog_fetch { type: "skill", slug }\` returns \`content\`, \`scripts\`, \`files\` and
  \`dependencySkills\`. Write \`content\` to \`/tmp/gooseworks-scripts/<slug>/SKILL.md\`, each
  \`scripts\` entry to \`/tmp/gooseworks-scripts/<slug>/scripts/<name>\` and each \`files\` entry to
  \`/tmp/gooseworks-scripts/<slug>/<name>\` (keep the key as the relative path; do the same for
  each dependency skill). Run scripts from their \`scripts/\` folder so \`import media_proxy\` resolves.
- **Project attribution:** \`export GW_PROJECT_ID=<project_id>\` in the shell **before running any
  atom** for that project (re-export per concept in a batch). The proxies bill the workspace
  agent and attribute spend to that project.
- **Never call a provider with a raw key.** All FAL / ElevenLabs / Whisper traffic goes through
  the \`GW_*_PROXY_URL\` bases with \`GW_MEDIA_PROXY_TOKEN\`. \`FAL_KEY\` / \`ELEVENLABS_API_KEY\` in
  this environment are proxy tokens, not provider keys — never send them to \`fal.run\`,
  \`queue.fal.run\` or \`api.elevenlabs.io\` directly. Never print any token.
- **Whisper for QC:** \`export OPENAI_BASE_URL="$GW_WHISPER_PROXY_URL/v1"\` before running
  \`review-ugc-render\` / \`watch\` transcripts.
- **The operator may be absent.** Keep every quality gate and checkpoint below, but decide
  defaults yourself from the project brief and the recipe, and record them in the review set.
  Ask in the chat **only for a true taste call** (a creative choice the brief and recipe leave
  open and that changes the ad), never for a mechanical or recoverable decision. The Step 3
  approval still applies: the approval may arrive in this chat or from the app's
  "Approve & render" button.
- **Outputs:** keep working files under \`/tmp/gooseworks-video/<project_id>/\` (local disk — never
  the s3fs workspace mount, which is slow and can drop writes); anything the user must see goes to
  the project via \`media_upload\` (never leave the result only in the sandbox). Every paid piece is
  also SAVED to the project as soon as it passes QC — see "Save as you go — and resume".

## Report problems so we can fix them (telemetry — do this, don't skip it)

If anything blocks or degrades this run — a media/proxy call fails or errors, a required input or
asset is missing, a recipe instruction is ambiguous or contradictory, the render toolchain won't set
up, or you hit a bug you can't work around — **report it** so the team gets visibility and can fix
the skill. It's fire-and-forget, never counts against you, and never blocks your work.

- **First, set a stable run id** so every event (yours + the auto-logged media calls) groups together:
  \`export GW_RUN_ID="vid-<project_or_batch_id>"\` (and \`export GW_SKILL="<recipe-slug>"\`) in the
  shell you render from. The media proxies read \`GW_RUN_ID\` automatically.
- **CLI present →** \`gooseworks log "<what happened>" --event-type <type> --level error --details '{"error":"...","step":"...","model":"..."}'\`
- **No CLI (sandbox / cowork) →** from any atom's \`scripts/\` folder:
  \`python3 -c 'from media_proxy import gw_log; gw_log("<what happened>", event_type="blocker", level="error", details={"step": "..."})'\`
  (or the \`log_cli_event\` MCP tool if your client has it).
- Event types: \`api_failure\` (a proxy/model call failed) · \`missing_input\` · \`blocker\` ·
  \`confusion\` (unclear/contradictory instruction) · \`error\` (a bug) · \`step\`/\`info\` (progress notes).
- Put the **real error text + the step you were on** in the details. Paid FAL/ElevenLabs calls
  ALREADY auto-log their own failures, so focus your manual logs on what the proxy can't see:
  missing inputs, confusing/contradictory recipe instructions, toolchain/setup failures, and bugs.
- Logging is FOR US — it does not replace telling the user. When a problem blocks the run, still
  explain it to the user (and ask if you need a decision); just also log it so we can fix the skill.

## Prerequisite — MCP + a render toolchain (Phase 0 preflight)

- The GooseWorks MCP tools are REQUIRED. If they're unavailable, stop and tell the user
  to connect the GooseWorks MCP server (or run \`gooseworks install --claude --mcp\` on the CLI)
  and restart. There is no REST fallback.
- **The render runs wherever THIS agent runs, and it needs a real toolchain:** \`ffmpeg\` +
  \`ffprobe\` always, plus a Playwright **Chromium** for browser-rendered formats (phone mockups,
  HTML end cards without a PIL fallback). Establish it in this priority order, and do NOT start
  rendering until one is confirmed:
  1. **Sandbox →** see "Running in a GooseWorks sandbox": ffmpeg + ffprobe (+ PIL on demand); no
     Chromium, so browser formats stop there.
  2. **CLI present →** run \`gooseworks doctor\` (checks login, MCP, Node 18+, ffmpeg with
     libx264 + libass, ffprobe, and that Playwright's Chromium is actually DOWNLOADED, in one
     shot). Fix any ✗ with the command it prints, then continue.
  3. **No CLI →** check the toolchain yourself: \`node --version\` (18+), \`ffmpeg -version\`,
     \`ffprobe -version\`, and the Chromium browser itself — \`npx --no-install playwright install
     --dry-run chromium\` prints the install location; if that folder is missing, run
     \`npx playwright install chromium\`. A resolvable \`playwright\` package with no browser
     downloaded is the classic false pass. The \`watch\` QC step later needs the same ffmpeg and,
     for transcripts, a Whisper backend — without one it degrades to frames only.
  4. **Docker available →** the most reliable way to get the toolchain on a host that lacks it:
     run the render steps inside the prebuilt image
     **\`ghcr.io/gooseworks-ai/goose-video-render\`** (ffmpeg + ffprobe + Playwright Chromium baked
     in), mounting the project working directory. (Nested Docker is usually disabled inside
     managed sandboxes — treat this as an option, not a guarantee.)
  5. **None of the above works →** STOP and tell the user plainly, e.g.: *"Video rendering needs
     ffmpeg (and, for this format, a Playwright Chromium) on the machine running this agent. This
     environment doesn't have them and I can't install them here. Options: (a) enable Docker so I
     can use the goose-video-render image, (b) install ffmpeg + \`npx playwright install chromium\`,
     or (c) run this skill in your own Claude Code where the toolchain is available."* Do not
     half-render or fake a result. Static image ads (the \`goose-ads\` skill) do NOT need any of this
     and work anywhere — offer that as the fallback if they just want an ad now.

## Identity, token, credits

- **Sandbox:** the token is \`GW_MEDIA_PROXY_TOKEN\` (already scoped to this workspace's agent and
  org); the API base is \`GW_API_BASE\`. Never print either.
- **Local:** read \`~/.gooseworks/credentials.json\` → \`api_key\` (your agent token), \`api_base\`,
  \`agent_id\`. Never print the token.
- **Uploads go through \`media_upload\` with \`scope: "video_project"\`** — pass \`path\` = the
  project-relative path (\`working/final.mp4\`, \`working/review/end-card.png\`). The server stores it
  in the project folder of the org-default Ads agent (where the app's render-file route reads) and
  returns \`upload.url\` (presigned PUT), \`upload.required_headers\` and
  \`upload.render_file_url\`. PUT the bytes with exactly those headers. **Do NOT call
  \`media_confirm\` for a \`path\` upload** — it is a workspace-file upload and the server rejects
  confirm on it ("not created through a presigned upload"); \`media_confirm\` is only for a
  path-less upload. Never hand-build storage paths or agent prefixes; a bare workspace upload is
  invisible in the app.
- Media generation (FAL / ElevenLabs) through the GooseWorks proxies is the **REAL spend** — billed
  per call as you generate (Step 4). The render row (\`${RENDER_ROW_TOOL} ${RENDER_OPEN_ARGS}\`) charges the flat
  **video base fee once, when a full render is reported \`complete\`** — so open it only once you
  actually have a rendered master (Step 4.1/4.2), and never open a second row on a guess (a second
  completed row bills again). The final-video QC gate (Step 4.3) then sits between
  that master and PINNING it. Call \`account_whoami\` first to see the credit balance.

## Save as you go — and resume (never pay twice for a piece)

A sandbox can die mid-run (timeout, restart, a new session picks the project up). Anything that
lives only in \`/tmp\` is then gone, and regenerating it pays again. So: **save every piece to the
project the moment it passes its QC, and start every run by loading what is already saved.**
Working files stay in \`/tmp/gooseworks-video/<project_id>/\` (never the s3fs workspace mount);
the project is the durable copy.

**Ingredient keys.** Give every planned piece a stable key before you generate it, the same on
every run: \`vo/scene-03\`, \`vo/sample-her\`, \`still/her-base\`, \`still/scene-05\`,
\`clip/scene-05\` (a lipsync / video clip), \`music/bed\`, \`endcard\`, \`captions\`, \`final\`,
\`final-thumb\`. Upload path = \`working/<role>/<file>\` (\`working/vo/scene-03.mp3\`,
\`working/clip/scene-05.mp4\`); the review set keeps its \`working/review/<name>\` paths.

**Input digest.** Name the exact inputs of each generation with \`input_digest\` from
\`media_proxy\` (in every media capability's \`scripts/\` folder):

\`\`\`python
from media_proxy import input_digest
digest = input_digest(model_path, args)   # the model + the EXACT payload you send
\`\`\`

Hash only what decides the output (prompt, voice_id, model_id, seed, duration, aspect…). An input
that is a presigned or proxy URL changes every run, so swap it for that input's own identity
before hashing, e.g. \`{**args, "image_url": {"ingredient": "still/her-base", "digest": her_digest}}\`
— then a changed still correctly invalidates every clip made from it. For a piece you build
locally (ffmpeg stitch, PIL end card, captions) use \`input_digest("local/<step>", {params,
inputs: {key: digest, …}})\`.

**1. At the START of every run (first run, resume, new sandbox), load what exists — one call:**
\`media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key_prefix: "",
limit: 100 }\`. It returns ONE compact row per \`ingredient_key\` (the newest):
\`{ id, ingredient_key, input_digest, kind, status, mime, bytes, url, path, created_at }\`. Every
status except archived is included (project-path uploads stay \`pending\` — that is normal).
Page with \`cursor\` if \`next_cursor\` is set (keep the first row you see per key — it is the newest). Also read \`script_drafts.ingredients\` from
\`video_project_read\`: it records which pieces were already approved in the review.

**2. For each planned piece:** compute its digest from the args you WOULD send now. If a saved row
has the same \`ingredient_key\` AND the same \`input_digest\`, **download it instead of
generating**:

\`\`\`bash
curl -fsSL "$URL" -o /tmp/gooseworks-video/<project_id>/<path>   # URL = that row's \`url\`
\`\`\`

That \`url\` is a short-lived (~15 min) presigned S3 GET the server signs for you, so it needs no
auth header — download right after listing (list again if it expired). **Never fetch the
\`/api/ads/projects/<id>/render-file?path=…\` route from the sandbox:** it needs the app's
browser session and answers 401 to a token. Check the file is non-empty and plays (ffprobe for
audio/video, open the image); if the download fails or the file is broken, regenerate the piece.
Only generate what is missing or whose digest changed — a changed digest means the inputs changed,
so the old file is stale.

**Pass the digest to the proxy too:** \`fal_generate(..., input_digest=digest)\` (and
\`fal_generate_video\` / \`fal_whisper\`). A piece that was generated but never saved (the sandbox
died between the fal result and the upload) is then handed back by the proxy instead of paid for
again, even though its input URLs changed. Only pass \`new_take=True\` when the user wants a
different take of the same inputs.

**3. After EACH piece is generated AND passes its own QC, upload it right away** — don't batch
the uploads to the end:
\`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path:
"working/<role>/<file>", ingredient_key, input_digest, source: { type: "file", filename,
content_type } }\` → PUT the bytes to \`upload.url\` with \`upload.required_headers\` (no
\`media_confirm\` for a \`path\` upload). Kind: \`audio\` (VO), \`music\`, \`image\` (a still),
\`video\` (a clip), \`endcard\`, \`document\` (captions / a JSON sidecar), \`render\` (the master),
\`thumbnail\`. Re-uploading the same key is fine — the newest wins. A piece that FAILED QC is never
uploaded under its key. **Save a piece's sidecars with it** under \`<key>.<name>\` — e.g. the VO's
char-level timestamps as \`vo/scene-03.timestamps\` (\`kind: "document"\`, same digest). Captions are
built from them; without them a resumed run has to fall back to Whisper timings, which mis-case
brand names.

**4. Record it in the ingredients list.** Put the piece's \`media_id\` (\`media.id\`), \`path\`
and \`ingredient_key\` on its entry in \`script_drafts.ingredients\` and mirror with
\`video_project_upsert { brand_id, project_id, patch: { script: { script_drafts } } }\`. Batch this
script patch every 3–5 pieces (and always once more when a stage ends) to limit calls — the
\`media_upload\` itself is what makes a piece safe, so it is never batched.

The \`final\` master and \`final-thumb\` poster (Step 4.4) carry \`ingredient_key\` too, so a
resumed run that finds a passing \`final\` with the same digest only needs to publish.

## Step 0 — project id, or video BATCH id? (fan out before anything else)

The handoff is EITHER a single \`project <id>\` OR a \`video batch <id>\`. A batch is
the app's "N concepts" flow: one composer submission fans out into **N independent concept projects**
(the user picked a concept count, default 3), and the app expects EACH to be rendered. **Handle both:**

- **\`project <id>\`** → you have one project. Treat it as a batch of one and continue to Step 1.
- **\`video batch <id>\`** → call \`video_project_read { brand_id, batch_id }\`. It returns every child
  concept under \`projects[]\` — each is a normal project with its own \`id\`, \`variant_index\`
  (Concept 1..N), and its own \`creative_brief\` (the per-concept angle/hook/offer/message). **You
  MUST process every concept, not just the first** — dropping concepts 2..N is the #1 batch bug.

**Loop shape (one agent, sequential, ONE approval for the whole batch):**
1. Run **Step 1 + Step 1.5 + Step 2 + Step 3-assemble** for EACH concept project (each has its own
   \`project_id\`, brief, \`GW_PROJECT_ID\` and \`working/\` folder — never cross-write between concepts).
   The brand read (Step 1 item 3) and \`brand-rules.json\` (Step 1.7) are per BRAND: do them once for
   the batch and copy the file into each concept's \`working/\`. The read is ~90K characters.
2. Mirror EVERY concept's review set (Step 3's \`video_project_upsert patch.script\` per project),
   then stop for **ONE** approval that covers all concepts — show the per-concept credit estimate
   and the batch total. Set the batch to \`review\` (\`video_project_upsert { brand_id, batch_id,
   patch: { batch: { status: "review" } } }\`).
3. On approval, set the batch to \`rendering\` and run **Step 4 (the expensive render)** for each
   concept **sequentially** (finish Concept 1's master before starting Concept 2 — one machine can't
   render them in parallel). Deliver each (Step 5). When every concept is pinned, set the batch to
   \`complete\`. A concept the Step 4.3 gate leaves \`blocked\` cannot be pinned (a batch concept
   needs \`passed\`): finish the others, set the batch to \`blocked\`, and tell the user which
   concepts passed and which are blocked, with each one's failing checks.

If a single concept fails, keep going with the rest, mark that concept blocked, and report which
ones shipped — never abort the whole batch on one bad concept. Everything below (Steps 1–5) is
written per-project; a batch just runs it N times with the shared approval gate above.

## Step 1 — resolve the project, source, brand

1. \`video_project_read { brand_id, project_id }\` → keep \`brand_id\`, \`source_sample_id\`, \`name\`,
   \`status\`, the **top-level** \`app_url\` + \`brand_url\` (the links you hand the user for the in-app
   review in Step 3 and delivery in Step 5), AND the user's **\`creative_brief\`**, project
   **\`assets\`**, \`character_id\`, \`default_voice_id\` — these are the authoritative inputs the user
   chose in the composer (see Step 1.5). Do NOT discard them. Then \`export GW_PROJECT_ID=<project_id>\`.

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
- \`creative_brief.durationSeconds\` → target length; honor it when the format allows.
  \`creative_brief.ratio\` → video ads are ALWAYS 9:16 (1080×1920). If the brief asks for another
  ratio, make 9:16 anyway and say so in the review; never export another size (a recipe's
  "also 1:1" option included).
- \`polish_policy\` (\`standard\` | \`extra\`) → \`extra\` means spend the extra pass on QC/polish.

2. \`catalog_fetch { type: "template", slug: <source_sample_id> }\` → the source video: \`media_url\`,
   \`recipe\`, \`format\` (e.g. "podcast-skit", "imessage"), \`extracted_script\`, \`how_to\`, \`remix_spec\`.
3. Brand gate: \`brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }\`
   (older clients: \`brand_get_context\` with the same sections). Ask for all four: the default
   leaves out the kit and the brand's saved rules, and a video made without them is off-brand.
   If the kit's \`researchStatus\` (or the brand's \`research_status\`) is \`complete\`, REUSE it —
   never re-research. If not, run brand research first (\`catalog_fetch { type: "skill", slug:
   "brand-research" }\`, follow it, then \`brand_update { brand_id, patch: { kit_patch,
   finalize_research: true } }\`) before continuing. Then do Step 1.7.

### Step 1.6 — a remix of a FINISHED video (the project read has a \`remix\` block)

A project made from **Community videos** remakes another customer's finished video for THIS brand.
Its \`video_project_read\` returns a top-level \`remix\` block
(\`{ remix_of_project_id, instruction, direction }\`), and \`reference_video_url\` is that finished video.

- **Watch the reference video first** (download \`reference_video_url\`, pull frames + the transcript).
  It is the target: match its structure, beat order, pacing, framing, look, voice and tone.
- **\`remix.direction\` is its approved review set** (scenes and lines, set/look notes, take prompts,
  captions, music, voice). Start your review set from it instead of the template's defaults; it
  already carries every change that customer made to the template.
- **Rewrite everything for THIS brand.** "[source brand]", "[source product]", "[link]", "[email]"
  and "[code]" mark the other customer's details: never write them, and never reuse their claims,
  numbers, URLs, offers or CTA. Every product, claim, name, image and CTA comes from this brand's
  kit, products and media. Their footage (screen recordings, product shots) and their creator face
  are NOT carried over: use this brand's own assets and make a new creator from the description.
- Precedence: this project's own \`creative_brief\` and assets (Step 1.5) > \`remix.direction\` >
  the template recipe's defaults.
- In the Step 3 review, say it is a remix of that video and list what you kept vs. changed.

### Step 1.7 — the brand rules file and the brand assets (every run, before any writing)

Write \`working/brand-rules.json\` from the Step 1 brand read. Every later step reads THIS file,
not your memory of the chat:

\`\`\`json
{
  "name": "Acme",
  "pronunciations": [{ "term": "Acme", "say_as": "ak-mee", "learning_id": "…" }],
  "must_say": [{ "text": "…", "learning_id": "…" }],
  "never_say": [{ "text": "Never claim it cures insomnia", "learning_id": "…" }],
  "products": [{ "id": "…", "name": "…", "facts": ["size, flavour, price, ingredients as stored"], "images": ["…"] }],
  "logo": { "url": "…", "confidence": "<kit.logoConfidence>" },
  "fonts": ["…"],
  "palette": ["#…"]
}
\`\`\`

- **Sources.** \`learnings\` are the brand's saved rules (the user's past corrections among them):
  \`must\` / \`do\` → \`must_say\`, \`dont\` → \`never_say\`, and a \`must\` whose text reads
  \`Pronounce "<term>" as "<say_as>"\` (straight or curly quotes) → \`pronunciations\`. Add \`kit.instructions\` (free-text
  standing rules) to \`must_say\` / \`never_say\` as they read.
- **Which product.** The one the brief names (\`creative_brief.productName\`); with none, the row
  whose name matches the product the user asked for, or the brand itself for a one-product
  brand. Product lists often hold other brands' items or old ads saved as products: if more than
  one row could be it, ask in the choices round. Never mix facts across rows.
- **Product facts** come from that row (name, description, variant, price) and, when the row is
  empty, from the kit (\`valueProps\`, \`description\`, \`tagline\`): nothing else. Write them to
  \`products[].facts\`; the script may only state what is there.
- **Logo.** Download the kit's logo FILE (\`kit.logoUrl\`, else \`kit.logos[0]\`) to \`working/brand/\`,
  keeping its real extension (an SVG stays \`.svg\`; rasterise it to a 1024px-wide PNG with
  \`rsvg-convert\` or \`cairosvg\` when a renderer needs pixels). It is used as-is on every scene and
  end card that shows a logo: **never generate, redraw, re-letter or restyle a logo with an image
  model.** If the kit's \`logoConfidence\` says favicon-grade, or the file's long side is under
  256 px (or it is under 40,000 px²), it is a site favicon, not a logo: do not upscale it. Ask the user for a real logo (or offer the brand name
  set as text in the brand font) in the SAME question round as the recipe's \`choices\`.
- **Font.** \`kit.typography.heading\` when its \`source\` is \`user\` (the user chose it), else
  \`kit.fonts.heading\`. Download the font file (the kit's own, or the same family from Google
  Fonts) to \`working/brand/\` and use it for every on-screen line. With no match, use the closest
  free font and say so in the review.
- **No wordmark file.** When a recipe wants a wordmark SVG and the kit has only a logo image, set
  the brand name as text in the brand font beside the logo file. Never generate one.
- Record in \`brand-rules.json\` which logo the video will actually composite (\`logo.file\`), or
  \`"logo": { "mode": "text" }\` when it will show only the brand name set in the brand font.
- **Product images.** Download this product's own images to \`working/brand/\`. Use only images of
  THIS product: never a catalogue image of another product, a mascot, a lifestyle photo of a
  person, or a stand-in. If the product has no usable image, ask in the choices round.

### Brand corrections stick — save them to the brand the moment they are made

When the user corrects something about the BRAND in chat — how a name is said, a claim that may
not be made, a product fact, a visual rule ("never use red", "the logo goes top-left") — save it
in the SAME turn, before anything else:

\`brand_update { brand_id, patch: { facts: [{ kind, text }] } }\`

| Correction | \`kind\` | \`text\` |
|---|---|---|
| Pronunciation | \`must\` | \`Pronounce "Acme" as "ak-mee"\` (exactly this form) |
| A claim or word to avoid | \`dont\` | \`Never say or imply: <the claim>\` |
| Something that must be said | \`must\` | \`<the rule>\` |
| A product fact | \`must\` | \`<product name>: <the fact>\` |
| A visual rule | \`do\` / \`dont\` | \`<the rule>\` |

- If it changes an EXISTING rule (a new pronunciation for the same term), update that rule by id
  (\`facts: [{ id: <learning_id>, text }]\`) instead of adding a second one.
- Then tell the user in one line: "Saved to your brand: every future video will use it." Update
  \`working/brand-rules.json\` and apply the rule to THIS video too.
- A one-off note about this video ("make it shorter", "use the blue background here") is NOT a
  brand rule: don't save it.

## Step 2 — read the template's recipe (it carries everything; NO hardcoded format map)

The ad format is a **template (data) in the ad_sample DB**, not a per-format skill.
\`catalog_fetch { type: "template" }\` returns the template's \`recipe\` — a self-contained brief you
read and execute. **Do NOT map \`format\` to a hardcoded recipe slug** (there is no such table):

- \`recipe.format\` — the format label (e.g. \`vignette\`), for display only.
- \`recipe.atoms\` — the **capabilities** this template composes (e.g. \`create-vo-elevenlabs\`,
  \`create-image-gpt-image-fal\`, \`render-podcast-skit\`, \`review-ugc-render\`, \`watch\`). Fetch each
  with \`catalog_fetch { type: "skill", slug }\` (or \`gooseworks fetch <name>\` when the CLI is
  installed) — they are reused across templates.
- \`recipe.instructions\` — the **playbook** to follow: \`instructions.inline\` prose, or
  \`instructions.doc_url\` (an S3 markdown doc — fetch it).
- \`recipe.config\` — every param (prompts, layout, timings, palette, model choices).
- \`recipe.inputs\` — the brand-asset contract (which product / logo / offer this template needs).
- \`recipe.choices\` — the creative calls the USER makes (who is on screen, narrator, tone, setting,
  art style, music). Ask every unanswered one in ONE round before any paid step, with its options plus
  "you pick". Its \`reference\` is what the demo used: an example, never the default.
- \`recipe.assets\` — reference material as S3 links (reference render, style guide, example frames) —
  fetch as needed.

Runtime: **read the recipe → fetch each capability in \`recipe.atoms\` → follow
\`recipe.instructions\` with \`recipe.config\` + the brand's bound \`inputs\`.** The template IS the recipe;
there is no \`format → recipe-slug\` table and no per-format skill to fetch.

Save each fetched capability's content, scripts + files under \`/tmp/gooseworks-scripts/<name>/\`
(layout in "Running in a GooseWorks sandbox"). If a capability is a Node package (a phone-mockup
renderer), \`npm install\` in its folder so its \`generate.js\` + Playwright resolve, and point the
recorder's \`NODE_PATH\` at it — local machines only; in a sandbox that format stops (no Chromium).

> **Migration note:** older phone-mockup formats (\`imessage\` / \`chatgpt\` / \`apple-notes\`) whose DB
> recipe does not yet carry \`atoms\` / \`instructions\` still hold the legacy \`recipe.thread\` payload;
> migrate them to this shape (capabilities + instructions in the DB) — do not reintroduce a CLI map.

## Step 3 — assemble the review set, then get ONE approval (before the expensive render)

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
- **EXPENSIVE paid** — the video take / final AI render / per-line lipsync clips (hundreds of
  credits) → do NOT generate. Put its **exact prompt/spec** (+ ref image URLs) in the tile. This is
  the ONE thing approved as a prompt (you can't preview a hundreds-of-credits video for free); it's
  generated only in Step 4.

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
   list. For a podcast skit that's the **script** (both hosts' lines), the two **host stills**,
   one **voice sample per host**, and the **end card**; an iMessage video has the bubble thread,
   the conversation image(s) and the end card. For each piece, decide FREE / CHEAP-paid /
   EXPENSIVE-paid (above):
   - **FREE or CHEAP paid** (≤ ~100 credits) → generate it now and upload it with
     \`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path:
     "working/review/<name>", ingredient_key, input_digest, source: { type: "file", filename:
     "<name>", content_type } }\` → PUT (no \`media_confirm\` for a \`path\` upload); set that
     piece's \`path\` (+ \`media_id\`, \`ingredient_key\`) in \`script_drafts\` to the project-relative
     \`working/review/<name>\`. First check "Save as you go" — a piece already saved with the same
     digest is downloaded, not regenerated.
   - **EXPENSIVE paid** → do NOT generate. Put the **exact prompt/spec** (and any ref image URLs)
     in the tile's \`text\` / \`subtitle\` so the user reviews what will be spent on. No \`path\` yet —
     it's generated in Step 4.
   Include the **estimated cost in CREDITS** (never dollars) of the cheap pieces already generated +
   the pending render, so the user approves knowing the total spend.
   **Brand check of the script, before it goes in the panel:** every line, caption and on-screen
   text is checked against \`working/brand-rules.json\`. Nothing in \`never_say\` appears, in words or
   in meaning (a paraphrase of a banned claim is still banned). Every product detail (name,
   flavour, size, price, ingredient, result) comes from \`products[]\` or the kit: anything else is
   cut, not invented. Add a \`note\` ingredient labelled "Brand rules applied" that lists the
   pronunciations used and the rules the script respects, so the user sees them.
   **Answer clarifying questions
   from the project brief FIRST (Step 1.5)** — only ask the user for a field (angle, which product,
   offer/code) the \`creative_brief\` leaves empty AND the recipe can't default. Do not re-ask for
   anything the composer already captured.
2. **Mirror the whole ingredient set for review** — \`video_project_upsert { brand_id, project_id,
   patch: { script: { script_drafts, script } } }\`. \`script_drafts\` is a structured payload of
   **container-tagged ingredients** so the app renders each piece the right way:
   \`{ format, scenes?, ingredients: [{ container, label, subtitle?, path?, url?, text? }], render_estimate? }\`.
   Each ingredient's \`container\` tells the app HOW to show it:
   - \`image\` (a frame shown in the video), \`endcard\` (the end card), \`avatar\` (a character
     headshot), \`background\` → rendered as an image tile.
   - \`voice\` (a voiceover clip — put the voice NAME in \`subtitle\`), \`music\` (the bed),
     \`audio\` → rendered as an audio player.
   - \`video\` (a clip) → a video player. \`text\` (a copy line like the CTA) → a text tile.
   - \`script\` / \`thread\` / \`note\` / \`conversation\` → the written script (or set \`scenes[]\`
     for the podcast shape, or pass the readable \`script\` string).
   **Label every ingredient** ("Hook image", "End card", "Voiceover", "Host A", "HER"). The upsert
   writes no render and costs no credits — it just populates the review panel.
3. **STOP for ONE approval.** Hand the user the project's \`app_url\` and tell them to review the
   pieces there and hit **"Approve & render"** (that button gives them a short message to paste
   back). In a **GooseWorks sandbox** the chat you are in is the app: post a short summary (pieces,
   total credits, the expensive prompt) plus \`app_url\`, and accept approval from this chat or from
   the button. Do NOT render until that approval arrives. If they want changes, regenerate the
   affected ingredient, upsert the review set again, say it's refreshed, and wait for a fresh
   approval. Only AFTER the approval do Step 4. A single approval authorises the WHOLE remaining
   chain — generate every paid piece, render, self-QC, publish — with NO further pauses (that is
   exactly why every paid prompt must already be in the panel).

## Step 4 — render, report stages, publish

1. **Open the render row FIRST** — right after the Step 3 approval, before any paid generation:
   \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_OPEN_ARGS} }\` (no \`dry_run\`; returns
   \`render_id\`) → keep \`render_id\`, then mark it running:
   \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status: "running",
   workflow_stage: "preparing", progress_note: "starting", progress_percent: 5 } }\`. The user sees this
   live in the app and gets a WhatsApp "started" message automatically — don't message them yourself
   about start / blocked / complete.
2. Now generate every PAID piece you showed as a prompt in Step 3 — the AI stills/video, lipsync
   clips, voice, music — through the media proxies (below), each from its approved prompt, with
   \`GW_PROJECT_ID\` exported. **Save as you go** (section above): skip any piece already saved
   with the same \`input_digest\` (download it), and upload each new piece with its
   \`ingredient_key\` + \`input_digest\` the moment it passes QC.
   A voiceover made with \`data_post_provider\` (ElevenLabs \`…/with-timestamps\`) returns its
   \`alignment\` only in the reply: write it to \`working/vo/<scene>.timestamps.json\` at once
   (captions are timed from it) and record the returned \`media_id\` on the ingredient.
   **Brand pronunciations in every voiceover:** the text sent to the voice has each
   \`pronunciations[].term\` replaced by its \`say_as\` (\`create-vo-elevenlabs\`:
   \`gen_vo.py … --rules working/brand-rules.json\`; when a render atom calls the voice itself,
   swap the terms in the text you hand it). Captions, on-screen text and the review keep the
   written name. Write \`working/approved-script.txt\` (the Step 4.3 audio check) with the SPOKEN
   form. **Logo, font, product:** every logo is the file from Step 1.7 composited as-is; every
   product shot uses the Step 1.7 product images as its reference.
   Then assemble per the recipe (ffmpeg stitch; PIL captions / end card;
   Playwright record only where the format needs it and the host has Chromium → \`mix-master\` audio).
   **Report progress at each milestone** — about one update per milestone, never per poll:
   \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status: "running", workflow_stage, progress_note, progress_percent } }\`
   (\`progress_note\` = plain words, ≤200 chars):
   - voiceovers done → \`"preparing"\`, \`"voiceovers done"\`, 20
   - stills done → \`"preparing"\`, \`"stills done"\`, 35
   - each lipsync / video clip → \`"rendering"\`, e.g. \`"lipsync 5/8"\`, 35–75
   - assembly → \`"rendering"\`, \`"assembling the cut"\`, 85
   - QC (4.3) → \`"checking"\`, \`"watching the final"\`, 95
   **Hard stop that needs the user** → \`{ render_id, status: "running", workflow_stage: "blocked",
   error_message: "<what's wrong + what you need>" }\`; an unrecoverable failure → \`status: "failed"\`
   + \`error_message\`. Completing (4.4) sets the bar to 100.
3. **MANDATORY final-video QC gate — YOU review EVERY finished master before pinning it
   (\`patch.final_render_id\`), whatever the format (UGC or not).** This is your own automated quality
   check, separate from the user's Step-3 approval — it does not go back to the user. The render row
   is already open (4.1); this gate stands between a rendered master and PINNING/publishing it, so a
   bad render never gets set as final. A master that looks fine on a still can still have a
   mis-voiced word, a caption drifting off its line, a beat out of order, or a deformation — review
   the actual VIDEO, not stills. Run the passes that APPLY to this format:
   - **Audio ↔ script** — any master with SPEECH (VO or native/Seedance voice); **skip for
     music-only / no-speech formats.** \`review-ugc-render\` is format-agnostic despite the name —
     a deterministic Whisper transcript-vs-script diff: persist the approved spoken lines to
     \`working/approved-script.txt\`, fetch \`review-ugc-render\` (\`catalog_fetch\`) and run
     \`review_render.py --video <master>.mp4 --script-file working/approved-script.txt --json
     working/review-verdict.json\` (exit 0 PASS / 2 FAIL / 3 ERROR). For each brand pronunciation add
     \`--brand-term "<term>"\`, plus \`--brand-term\` for each word of \`say_as\` that is not an
     everyday word (the flag strips those tokens from the WHOLE diff, so never pass "a", "one",
     "works" alone): Whisper spells a respelled name back as the brand word ("Goose Works" heard
     as "Gooseworks"), so the diff must accept it. The proof of
     HOW it was said is the text you sent to the voice (keep it in the review), not the transcript. It blocks a mis-voiced word
     (approved "human-vetted" → "human witted"), a dropped phrase, or silence. It routes Whisper
     through the gooseworks proxy when \`OPENAI_BASE_URL\` is set (sandbox:
     \`$GW_WHISPER_PROXY_URL/v1\`); with no backend at all, run \`fal-ai/whisper\` via the FAL proxy
     and diff the transcript yourself.
   - **Captions / subtitles** — ANY captioned format (the most common non-UGC defect); **skip for
     UGC/Seedance masters, which carry no subtitle track.** Diff the caption file you burned
     (SRT/ASS/PNG cue list) against the SAME Whisper transcript + word timings — every caption line
     must match the heard/scripted words and sit within ~0.3s of when they're spoken; then in the
     visual pass below, read the burned caption off 4–5 sampled frames to confirm it's on screen at
     that time and not colliding with the end card. Mismatched text or >0.3s drift fails the gate.
   - **Visual + structure** — always: run the \`watch\` skill on the master — beat/scene order + SFX,
     the brand's product (not the source's) is shown, the end card has the brand's logo file (or its name set in the brand font) + code, no
     deformation/artifact, duration within ~20% of the source.
   - **Finished ad + brand fidelity** — always: fetch \`review-finished-ad\` (\`catalog_fetch\`,
     \`pip install --quiet numpy pillow\` if needed) and run
     \`review_finished_ad.py --video <master>.mp4 --json working/review/finished-ad.json
     --sheet working/review/finished-ad-sheet.png --logo <the logo file the video composites>
     --palette "<kit palette, comma-separated>" --product-images <the Step 1.7 images>
     --font <brand font file> --brand-name "<name>" --endcard-s <end card length>\`. Pass the
     file that is ACTUALLY on screen (the kit logo, or the recipe's wordmark file). When the video
     shows only the brand name as text (\`"logo": {"mode": "text"}\`), omit \`--logo\` and judge the
     text on the sheet. Add \`--no-speech\` for a format with no VO or dialogue, \`--logo-at <s>\` for
     each mid-video logo, and any gate flags the recipe's instructions name (a chat format's
     reading holds need a longer \`--max-freeze-s\`). Exit 0 PASS / 2 FAIL / 3 ERROR. It
     checks size, hook, pacing, dead air, black frames, the kit logo on the end card
     (a wrong, redrawn or favicon logo fails) and the palette. **Then open the sheet it writes
     and judge every line of its \`judge_on_sheet\`:** captions/CTA/logo outside the red safe
     zones, the brand font, every product shot matching the product images, the product the same
     in every scene, the logo unaltered. A failed eye check is a FAIL like any other.
   - **Output size** — always **1080×1920 (9:16)**. Video ads are only ever 9:16. Lipsync / video
     models often return 720p or odd sizes — scale (and pad if the aspect differs) every clip to
     1080×1920 BEFORE the concat, never ship the model's native size.
   If ANY applicable pass fails, FIX it (regenerate/stitch the offending window, re-composite the
   end card from the real logo file, rebuild captions) and re-run the passes — only a clean pass
   proceeds to pinning. **At most 2 repair rounds.** If a pass still fails after them, do NOT pin
   and do NOT present the video as finished: upload it (4.4) and close the row with exactly
   \`video_render_run { brand_id, project_id, render: { render_id, status: "complete",
   workflow_stage: "blocked", quality_status: "blocked", repair_pass_count: 2, output_url,
   thumbnail_url, quality_report } }\` (the failing checks as \`fail\` in the report), and tell the user plainly in
   chat which checks failed, what you tried, and the choices (fix a specific thing, re-roll, or
   use it anyway). Pin it only if they say to use it anyway. The app shows a blocked render as
   "Needs attention". **This gate is universal: it runs from this skill for every format, so a
   recipe never has to opt in.**
4. Publish: \`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind: "render",
   path: "working/final.mp4", ingredient_key: "final", input_digest, source: { type: "file", filename: "final.mp4", content_type:
   "video/mp4" } }\` → PUT the master to \`upload.url\` with \`upload.required_headers\` (no
   \`media_confirm\` — path uploads don't take one). Same for the poster (\`kind: "thumbnail"\`, \`path: "working/final-thumb.jpg"\`, \`ingredient_key: "final-thumb"\`).
   Keep each \`upload.render_file_url\`. Verify the PUT returned 2xx and the file you uploaded is a
   real, non-empty MP4 (ffprobe it) BEFORE marking the render complete.
   Then \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status: "complete", output_url, thumbnail_url } }\` (attach the Step 4.3 verdict as \`quality_status: "passed"\` (or
   \`"blocked"\` when the gate still fails after 2 repair rounds) + \`quality_report\` — ALWAYS
   attach it; a batch concept cannot complete without a passing one; exact shape, strict (no extra keys):
   \`{ version: 1, summary: string, checks: { source, brand, product, hook_and_scene_order,
   voice_and_script, captions, endcard_and_cta, duration_and_ratio, visual_artifacts }, detected_issues?:
   string[], repair_actions?: string[] }\` where EVERY check is \`{ status: "pass"|"fail"|"not_applicable",
   note?: string }\`). Fill each check from the Step 4.3 passes: \`brand\` ← logo_asset + logo +
   palette + font + logo unaltered; \`product\` ← product likeness + product consistency;
   \`hook_and_scene_order\` ← hook + pacing + the \`watch\` beat order; \`voice_and_script\` ← the
   Whisper diff (pronunciations included) + no \`never_say\` line; \`captions\` ← the caption diff +
   safe zones; \`duration_and_ratio\` ← ratio + duration; \`visual_artifacts\` ← black frames +
   frozen stretches + the \`watch\` pass; \`endcard_and_cta\` ← the end card holds the real logo +
   CTA. Put each failing check's note in \`detected_issues\` and each fix in \`repair_actions\`.
   **output_url MUST be the durable render-file URL**
   (\`upload.render_file_url\`, i.e. \`/api/ads/projects/<project_id>/render-file?path=working/final.mp4\`
   — the app re-presigns it on every view) — NEVER a raw proxy/CDN/presigned URL (those expire).
   Same for \`thumbnail_url\`.
5. **Save the final review set BEFORE pinning** — it must describe the video you actually rendered.
   If anything changed after the Step 3 approval (a line reworded, a clip or take swapped, a look,
   timing, caption or music change, a QC repair, or ANY change the user asked for in this chat),
   upsert the review set again: \`video_project_upsert { brand_id, project_id, patch: { script: {
   script_drafts, script } } }\` with the final lines, final pieces (mark generated takes as done, not
   "not generated yet") and the settings you used. The project keeps this, not your chat: it is
   what the app shows, and what a Community remix of this video copies. Instructions that live only
   in this conversation are lost when it ends.
6. Pin it — only a \`passed\` render (or a \`blocked\` one the user said to use anyway):
   \`video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }\`,
   then return the \`app_url\` + \`brand_url\` (from the project) verbatim. Never end on just "done" or
   a file path.

Narrate each long step in one line via \`video_project_upsert { brand_id, project_id, patch:
{ message: { role: "agent", content } } }\` — never sit silent on a queue > 90s.

## Media generation — the GooseWorks proxies (queue loop)

Media APIs go through GooseWorks proxies; do NOT use an SDK's default host (your token isn't a
FAL/ElevenLabs token → 401, and in a sandbox a raw provider call is never allowed). Prefer the
atoms' own \`media_proxy.py\` (\`fal_generate\`, \`fal_generate_video\`, \`eleven_music\`, …) — it already
handles auth, the queue host-swap, project attribution (\`GW_PROJECT_ID\`) and failure logging.

- **Sandbox:** FAL base = \`$GW_FAL_PROXY_URL\`, ElevenLabs = \`$GW_ELEVENLABS_PROXY_URL\`, FAL
  storage = \`$GW_FAL_STORAGE_PROXY_URL\`; auth = \`?token=$GW_MEDIA_PROXY_TOKEN\` (or
  \`Authorization: Bearer\`), plus \`&project_id=$GW_PROJECT_ID\`. The token already names the agent.
- **Local:** base = \`<api_base>/api/internal/<proxy>\` (\`fal-proxy\`, \`fal-storage-proxy\`,
  \`elevenlabs-proxy\`); pass \`?token=<api_key>&agent_id=<agent_id>&project_id=<project_id>\`
  (agent_id bills the Ads agent; project_id attributes the spend to this ad project so the user
  sees per-project spend in the app. ALWAYS pass it).

**FAL queue gotcha** (#1 waste of generations): submit returns \`status_url\`/\`response_url\` on
\`queue.fal.run\` (the real host, not the proxy). Polling those 401s forever — rewrite their host
to the proxy base (keep the path), re-add the auth params. Only the final \`*.fal.media\`
file is a real public URL. Helper (works in both modes):

\`\`\`python
import json, os, pathlib, time, requests
from urllib.parse import urlparse

def _cfg():
    """(fal_base, token, agent_id). Sandbox env first, then ~/.gooseworks/credentials.json."""
    tok = os.environ.get("GW_MEDIA_PROXY_TOKEN")
    if tok:
        base = os.environ.get("GW_FAL_PROXY_URL") or os.environ["GW_API_BASE"].rstrip("/") + "/api/internal/fal-proxy"
        return base.rstrip("/"), tok, None
    c = json.loads(pathlib.Path(os.path.expanduser("~/.gooseworks/credentials.json")).read_text())
    return c["api_base"].rstrip("/") + "/api/internal/fal-proxy", c["api_key"], c.get("agent_id")

def _params(tok, agent):
    p = {"token": tok}
    if agent: p["agent_id"] = agent
    pid = os.environ.get("GW_PROJECT_ID")
    if pid: p["project_id"] = pid  # attributes the spend to this ad project
    return p

def fal_generate(model_path, payload, timeout_s=180, poll_s=3):
    """model_path e.g. 'fal-ai/nano-banana-2/edit' (the recipe names the model).
    Export GW_PROJECT_ID first. Returns the result image URL (a public *.fal.media URL)."""
    base, tok, agent = _cfg()
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

ElevenLabs (VO / music) is the same shape against the ElevenLabs proxy base. To feed FAL a local
file (a product image, a VO track), it must be a PUBLIC URL: upload it with \`media_upload\`
(\`scope: "video_project"\`, source \`file\`, no \`path\`) → PUT → \`media_confirm\` and use the returned
\`media.url\` if it is a public https URL (curl it: HTTP 200 without auth), or host it through the
FAL storage proxy. Never pass a \`render-file\` URL to a provider — it needs app auth.

## Rules

- **Canonical MCP tools first** (\`video_project_read\`, \`video_project_upsert\`, \`catalog_fetch\`,
  \`media_upload\` + \`media_confirm\`, the \`video_render_run\` render-row actions, \`account_whoami\`);
  legacy names only when the client lacks the canonical tool.
- **A missing key is never a blocker.** Paid media goes through the proxy: a one-off image or clip
  is \`data_post_provider { provider: "fal", … }\` + \`job_get\` (see "Paid media over the MCP");
  never ask for FAL_KEY, never use \`photos_generate\` for anything but a physical product.
- **The CLI and credentials.json are optional.** In a GooseWorks sandbox (\`GW_MEDIA_PROXY_TOKEN\`
  set) use the env proxies and \`catalog_fetch\`; never call a provider with a raw key.
- **No Chromium in a sandbox** — a browser-rendered format stops there, before any spend, and says so.
- **Toolchain before spend** — \`gooseworks doctor\` (CLI) or the manual check; stop with the exact
  fix if anything is missing.
- **Assemble the whole review set first**, mirror it with \`video_project_upsert patch.script\`, and
  get ONE approval BEFORE the expensive render (review-once).
- **Show the REAL cheap pieces; PROMPT only the expensive render.** Generate the FREE + CHEAP-paid
  pieces (≤ ~100 credits — stills, creator frame, end card, short VO/music) and mirror the real
  assets; put ONLY the expensive video take/render in the panel as its exact prompt. That prompt
  must be in the panel before you ask to approve, so a single "go" runs the render + any remaining
  paid work (→ QC → publish) with no re-pausing.
- **Operator may be absent (sandbox):** decide mechanical choices yourself; ask in chat only for a
  true taste call.
- **Costs in CREDITS, never dollars.** credits ≈ round-up(provider-$ × 120) per generation + a flat
  200-credit base per video; never show a "$…" figure to the user.
- **Never assemble the full video before approval.** The review shows the
  individual PIECES, never the finished cut (or their prompts) — not a
  stitched/composited cut; do not add a "full cascade" / finished-video clip
  as a review ingredient (GOOSE-2542). The assembled video is produced only in
  Step 4.
- **Open the render row at the start of Step 4** (4.1, after the approval) and keep its stage /
  progress current; mark it \`complete\` only after the master passes QC. \`output_url\` = the
  durable render-file URL, never a CDN URL.
- **Always export \`GW_PROJECT_ID\`** (and pass \`project_id\` on hand-rolled proxy calls) so the
  credits attribute to this ad project.
- **Verify a real, non-empty MP4** (watch it) before marking the render complete.
- **Reuse the brand** when its research is complete; never re-research.
- **Brand rules first:** load kit + products + learnings (Step 1), write \`working/brand-rules.json\`
  (Step 1.7), and follow it: pronunciations in every voiceover, nothing from \`never_say\`, product
  facts only from the product rows, the kit's logo FILE (never a generated or favicon logo), the
  brand font, this product's own images.
- **Save brand corrections** from chat with \`brand_update patch.facts\` in the same turn, and say so.
- **Finished-ad gate on every master** (\`review-finished-ad\` + the sheet); at most 2 repair
  rounds, then publish as \`blocked\` with the report and warn the user — never pass off a failing
  video as finished.
- On a hard error (auth/quota/model/timeout) set the render \`failed\` with a short
  \`error_message\` (\`${RENDER_ROW_TOOL} { …, ${RENDER_UPDATE_KEY}: { render_id, status: "failed", error_message } }\`) and stop — don't ship the source unchanged. **Also log
  it** (see "Report problems") so we can see + fix it.
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
