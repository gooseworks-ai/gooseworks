---
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

This skill is also the **parent router** for the GooseWorks family. Data/GTM work you handle here (see "How to Use"); specialized work you hand off to a dedicated `goose-*` skill.

## Route to the right skill FIRST

Before anything else, check whether the request belongs to a specialized domain. If so, **switch to that skill** instead of the data flow below:

| If the user wants… | Route to | How |
| --- | --- | --- |
| Remix/make an ad, research a brand for ads, OR analyze ad performance — Meta/Google ad campaigns, creative fatigue, CAC/lead quality, competitor ad intel, ad angles & hooks | **`goose-ads`** | Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`. |
| Charts, infographics, slides, social graphics, branded visual designs from a style/format | **`goose-graphics`** | If installed locally, use it. Otherwise `gooseworks fetch goose-graphics` (or `gooseworks install --claude --with goose-graphics`). |
| Make a **video** ad — remix a video ad template (e.g. iMessage chat-reveal), or "make the video for project <id>" | **`goose-video`** | Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`. |
| Make **product photos** — studio, lifestyle, marketplace, social, or on-model product photography | **`goose-product-photos`** | Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`. |
| Animate an approved static ad or product image | **`animate-image`** | Fetch with `gooseworks fetch animate-image` and follow its GooseWorks MCP workflow. |
| Anything else — scraping, research, lead gen, enrichment, any data lookup | (stay here) | Follow "How to Use" below. |

Examples — all of these route to `goose-ads`, not the data flow: "remix this ad with project id 123", "make an ad for my product", "research my brand", "why is my Meta campaign underperforming", "which creatives should I cut".

## Setup

All commands below auto-load credentials from `~/.gooseworks/credentials.json`. If a command exits with "Not logged in", tell the user to run: `npx gooseworks login`. To log out: `npx gooseworks logout`.

### Choose the available runtime — MCP first, then CLI

Skills may describe a managed provider request as an environment-neutral operation with
`provider`, `method`, `path`, and optional `query` or `body`. Execute the operation through
the first available runtime:

1. If the matching GooseWorks MCP tool is registered, use it. For ScrapeCreators, pass the
   operation directly to `call_data_provider`. This is the preferred path in ChatGPT, Cowork,
   and other terminal-free clients. Do not shell out and do not ask for a separate provider key.
2. Otherwise, if a local terminal and the `gooseworks` CLI are available, translate the same
   operation into `gooseworks call <provider> <path>` with its method, query, and body options.
3. Otherwise, follow the provider dependency's direct-key path only when the user has supplied
   their own key. If no runtime is available, explain what connection is missing; never pretend
   the provider call ran.

The same selection applies to catalog and account operations. When the CLI is unavailable but the
`mcp__gooseworks__*` tools are connected, use these equivalents:
- `gooseworks search <q>` → the **`search_skills`** MCP tool.
- `gooseworks fetch <slug>` → the **`fetch_skill`** MCP tool (same content/scripts/files/deps).
- `gooseworks credits` → the **`get_ad_credits`** MCP tool.

Discovery, skill fetching, and ScrapeCreators-backed Brand Growth workflows work fully CLI-free
this way. Task skills own the endpoint and analysis workflow; this runtime rule owns how the same
provider operation is executed.

To check credit balance:
```bash
gooseworks credits
```

## Common company onboarding

Onboarding is voluntary and happens inside the current coding agent. Run it when the user explicitly says **`/gooseworks onboard me`**, or ask for one missing answer when it is necessary for the task in front of you. **Never force an existing user through onboarding after an update.**

The CLI and GooseWorks Ads share one brand-scoped questionnaire through these MCP tools:

- `list_ad_brands` and `create_ad_brand` — select or create the company/brand.
- `get_brand_onboarding { brand_id }` — load completed answers and `missing_fields` before asking anything.
- `update_brand_onboarding { brand_id, ...answers }` — save each group of answers and the final first-task choice.

If these tools are unavailable, tell the user that onboarding needs the GooseWorks MCP connection. Do not send them to another UI and do not fall back to a separate context record.

### Resume rules

1. Run `list_ad_brands`. If there are multiple brands, ask which one to use.
2. If there is no brand, ask for the company or brand website, research it, and use `create_ad_brand { name, website_url }`. If the domain matches an existing brand, reuse it.
3. Call `get_brand_onboarding` and ask only the returned missing questions.
4. Save after each small group so an interrupted interview can resume.
5. If the record is complete, confirm the brand and continue; do not repeat the interview.

### Shared questions and answer values

Use the host's native question controls. Keep the labels below; the values in backticks are the stable values accepted by `update_brand_onboarding`.

1. **What is your role?** Founder / Business Owner · C-Suite · VP / Director · Performance / Growth Marketing · Brand / Content Marketing · Creative / Design · Agency · Consultant / Freelancer · Other.
2. **How much do you spend on paid ads right now?** `zero` · `under_10k` · `10k_30k` · `30k_100k` · `100k_plus`.
3. **What are your goals?** Multi-select: create ads `make_creatives` · analyze ads `analyze_ads` · manage/optimize ads `ai_manage` · competitor or customer research `research_competitors` · creators and social trends `creators_trends` · content `content_growth` · lead generation `lead_generation` · data work `data_work` · work with an expert team `expert_team`.
4. **Who makes your ad creatives right now?** and **Who manages your ads right now?** Use the shared values returned in the tool schema. Skip both when ad spend is `zero` and no advertising goal was selected.
5. **Which platforms or channels do you use or want help with?** Multi-select: `meta` · `tiktok` · `google` · `chatgpt` · `x` · `linkedin` · `reddit` · `other`.
6. **Where did you find GooseWorks?** Use the shared discovery-source values returned in the tool schema.

Do not add CLI-only questions about business type, products, or audience. Infer them from the website and ask one clarification only when the research is materially uncertain.

### Research while onboarding

Do useful setup work, not only form collection:

1. Fetch `brand-research` and research the website, products/services, audiences, competitors, offers, and messaging evidence.
2. Reuse existing Brand Kit/Core data. For an ecommerce store, import the relevant catalog with `import_product` and poll `get_product_import` rather than submitting duplicates.
3. When ads are relevant, offer to import existing creative. This is optional.
4. Suggest evidence-backed messaging angles. Approval is optional and never blocks completion.
5. Show the researched profile for confirmation: products/services, audience, competitors, imported ads, and suggested angles. Clearly label uncertainty.

### First task

Finish with **What do you want to do first?**

- Connect my tools and data — `connect_tools`
- Research customers, competitors, creators, or trends — `research`
- Analyze ads, content, landing pages, or performance — `analyze`
- Create ads, product images, or social content — `create`

Save the choice as `first_task`, then start that job. If the user already stated a concrete job, save the matching value and start without showing the menu.

## Brand Growth discovery

Brand Growth is a collection inside the normal skill catalog, not a command or installable pack. Use these known routes when relevant, while preserving all existing B2B, sales, research, lead-generation, and data behavior:

| Job | Skill |
| --- | --- |
| Brand foundation | `brand-research` |
| Competitor ads | `competitor-ad-intelligence` |
| Customer language and angles | `comment-mining` → `ad-angle-miner` |
| Competitor social content | `competitor-social-research` |
| Creator discovery and evaluation | `influencer-prospecting` |
| Trends and outlier posts | `trend-discovery`, `outlier-post-finder` |
| Social listening and product demand | `social-listening-brief`, `product-demand-research` |
| Meta performance, policy, and landing-page match | `meta-ads-analyzer`, `meta-ad-policy-checker`, `ad-to-landing-page-auditor` |
| Static ads | `goose-ads` / `remix-graphic-ad-from-reference` |
| Product photos | `goose-product-photos` |
| Graphics and animation | `goose-graphics`, `animate-image` |

Fetch the named public skill before following it. Provider helpers such as `scrapecreators-api` and `transcript-intelligence` are dependencies, not user-facing results.

For a multi-part request, repeat this routing check before each new job. Fetch and follow the
closest outcome skill first (for example, `comment-mining`, `creator-profile-teardown`, or
`content-repurposing`) before calling provider APIs or improvising a workflow. Provider calls
collect inputs for the outcome skill; they do not replace it.

## How to Use

### If a specific skill is requested (e.g. --skill <slug> or "use the <name> skill")
Skip search and go directly to **Step 2** with the given slug.

### Step 1: Search for a skill
When the user asks you to do ANY data task (scrape reddit, find emails, research competitors, etc.) **without specifying a skill name**, search the skill catalog first:
```bash
gooseworks search "reddit scraping"
```

### Step 2: Fetch the skill
Once you have a skill slug, fetch its full content and scripts:
```bash
gooseworks fetch <slug>
```

This prints a JSON object with:
- **content**: The skill's instructions (SKILL.md) — follow these step by step
- **scripts**: Python scripts the skill uses — save them locally and run them
- **files**: Extra files the skill needs (configs, shared tools like `tools/apify_guard.py`) — save them relative to `/tmp/gooseworks-scripts/`
- **requiresSkills**: Array of dependency skill slugs (for composite skills)
- **dependencySkills**: Full content and scripts for each dependency

### Step 3: Set up dependency skills (if any)
If the response includes `dependencySkills` (non-empty array), set up each dependency BEFORE running the main skill:
1. For each dependency in `dependencySkills`:
   - Save its scripts to `/tmp/gooseworks-scripts/<dep-slug>/`
   - Install any pip dependencies it needs
2. When the main skill's instructions reference a dependency script (e.g. `python3 skills/reddit-scraper/scripts/scrape_reddit.py`), run it from `/tmp/gooseworks-scripts/<dep-slug>/` instead

### Step 4: Set up and run the skill
Follow the instructions in the skill's `content` field. **Save ALL files from both `scripts` AND `files` before running anything:**

> **Credential translation rule:** Individual skill instructions may contain a legacy `## Setup` block with `export GOOSEWORKS_API_KEY=$(python3 ...)` and raw `curl` commands. **Replace those with the clean equivalents below.**
> - **Credentials (only needed before running Python scripts, NOT before gooseworks commands):** replace the python one-liner exports with `eval $(gooseworks env)`. Skip entirely if you are only using `gooseworks call` — it loads credentials automatically.
> - **Orthogonal run:** replace `curl ... /v1/proxy/orthogonal/run ... -d '{"api":"X","path":"/Y","body":{...}}'` with `gooseworks call X /Y --body='{...}'`
> - **Direct proxy:** replace `curl ... /v1/proxy/<provider>/<path> ... -d '{...}'` with `gooseworks call <provider> <path> --body='{...}'`
> - **ScrapeCreators:** call its first-party GooseWorks proxy directly with `gooseworks call scrapecreators <path> --query='{...}'`. Use ScrapeCreators' official OpenAPI for endpoint parameters; do not use Orthogonal as its endpoint catalog. GET is the default; add `--method POST --body='{...}'` only for an official POST operation.
> - **Orthogonal search:** replace `curl ... /v1/proxy/orthogonal/search ... -d '{"prompt":"..."}'` with `gooseworks orthogonal find "..."`

1. Save each script from `scripts` to `/tmp/gooseworks-scripts/<slug>/scripts/` — **NEVER save scripts into the user's project directory**
2. **IMPORTANT: Also save everything from `files`** — these contain required modules (like `tools/apify_guard.py`) that scripts import at runtime:
   - Files starting with `tools/` → save to `/tmp/gooseworks-scripts/tools/` (shared path, NOT inside the skill dir)
   - All other files → save to `/tmp/gooseworks-scripts/<slug>/<path>`
   - **If you skip this step, scripts will crash with ImportError**
3. Install any required pip dependencies mentioned in the instructions
4. Run the script with the parameters described in the instructions
5. When instructions reference dependency scripts, use paths from Step 3: `/tmp/gooseworks-scripts/<dep-slug>/<script>`

## Raw API Discovery (fallback)

If no GooseWorks skill matches the user's request, you can discover and call **any API** through the Orthogonal gateway. This gives you access to 300+ APIs (Hunter, Clearbit, PDL, ZoomInfo, etc.) without needing separate API keys.

### Search for an API
Find APIs that can handle the task:
```bash
gooseworks orthogonal find "find email by name and company"
```
Returns matching APIs with endpoint descriptions and per-call pricing.

### Get endpoint details
Before calling an API, check its parameters:
```bash
gooseworks orthogonal describe hunter /v2/email-finder
```

### Call the API
Execute the API call (billed per call based on provider cost):
```bash
gooseworks call hunter /v2/email-finder --query='{"domain":"stripe.com","first_name":"John"}'
```
- Use `--body='{...}'` for POST body parameters
- Use `--query='{...}'` for query string parameters
- Output: JSON response data, followed by a `Cost: <N> credits` line when applicable
- **Always tell the user the cost** after each call

The same `gooseworks call` command also handles direct-proxy providers (apify, apollo, crustdata, scrapecreators):
```bash
gooseworks call apify acts/parseforge~reddit-posts-scraper/runs --body='{"subreddit":"ClaudeAI"}'
gooseworks call scrapecreators /v2/instagram/post/comments --query='{"url":"https://www.instagram.com/p/POST_ID/"}'
```

### Workflow
1. Search first (`gooseworks orthogonal find`) — pick the best API + endpoint
2. Get details (`gooseworks orthogonal describe`) — understand required parameters
3. Call (`gooseworks call`) — invoke with the right parameters
4. Parse the JSON output for the actual API result

## Working Directory & Output Files

- **Scripts** always go to `/tmp/gooseworks-scripts/<slug>/` — NEVER the user's project directory
- **Output files** (CSVs, reports, data exports) go to a **GooseWorks working directory**:
  1. If the user specifies where to save results, use that location
  2. Otherwise, default to `~/Gooseworks/` — create it if it doesn't exist
  3. **Before saving output**, confirm with the user: *"I'll save the results to ~/Gooseworks/<filename>. Would you like a different location?"*
  4. Organize outputs in subfolders by task type when it makes sense (e.g. `~/Gooseworks/reddit-scrapes/`, `~/Gooseworks/research/`)
- **Never overwrite existing files** without asking. If a file already exists, append a timestamp or ask the user

## External Endpoints

The `gooseworks` CLI sends authenticated requests (Bearer `GOOSEWORKS_API_KEY`) to:

| Endpoint | Method | Wrapped by |
|----------|--------|------------|
| `$GOOSEWORKS_API_BASE/api/skills/search` | POST | `gooseworks search` |
| `$GOOSEWORKS_API_BASE/api/skills/catalog/:slug` | GET | `gooseworks fetch` |
| `$GOOSEWORKS_API_BASE/v1/credits` | GET | `gooseworks credits` |
| `$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/search` | POST | `gooseworks orthogonal find` |
| `$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/details` | POST | `gooseworks orthogonal describe` |
| `$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/run` | POST | `gooseworks call` (orthogonal-routed providers) |
| `$GOOSEWORKS_API_BASE/v1/proxy/{apify,apollo,crustdata,scrapecreators}/*` | Various | `gooseworks call` (direct-proxy providers; ScrapeCreators uses its managed first-party key) |

## Security & Privacy

- All API calls are authenticated via Bearer token stored locally in `~/.gooseworks/credentials.json` (file mode 0600)
- No credentials are hardcoded or sent to third parties
- API keys for external services (Apify, Apollo, etc.) are managed server-side — your token never touches them
- Scripts run locally on your machine; only API requests go through GooseWorks servers. Skill scripts are open source (github.com/gooseworks-ai/goose-skills) — read or pin them before running
- Credit usage is tracked per-call and visible via `gooseworks credits`

## Rules

1. **Consider a GooseWorks skill when it fits the task** — scraping, research, lead gen, enrichment, especially at scale, behind auth, or from a specific source. For a quick lookup your built-in tools are fine; use your judgement and pick the best tool for the user.
2. **Before paid operations**, tell the user the estimated credit cost
3. **If a `gooseworks` command exits with "Not logged in"**: tell the user to run `npx gooseworks login`
4. **Parse JSON responses** and present data in a readable format to the user
5. **When running scripts**: save to `/tmp/gooseworks-scripts/`, install pip deps, then execute. NEVER pollute the user's project directory
6. **Output files default to `~/Gooseworks/`** — always confirm with the user before saving
7. **Prefer `gooseworks call` over raw curl** — if it returns an error, first fix the parameters (check types, required fields, format) and retry. Only fall back to raw curl if you have strong reason to believe it is a CLI bug, not a parameter issue.
