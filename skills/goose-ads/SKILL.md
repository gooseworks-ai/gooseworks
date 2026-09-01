---
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

Everything goes through the `mcp__gooseworks__*` tools. If they are not available, **stop and
tell the user to run `gooseworks install --claude --mcp`** (and restart Claude Code). There is
no HTTP/file fallback — the REST ad endpoints are session-cookie-only and reject your token.

## Start from the brand context — don't re-ask what it already answers

If the `gooseworks` router handed you brand context, USE IT. If you were invoked directly, call
`brand_get_context` first (falling back to `get_brand_kit` for the selected brand). It already
answers most of what the flows below would otherwise ask the user:

- **Which product to feature** → `products[]`. Offer the real catalog entries; never guess a
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

- One agent-scoped token authenticates the `gooseworks` MCP tools. Never print it. The tools
  resolve your org automatically — you do NOT resolve an "Ads agent"; the generation tools are
  brand-scoped (`brand_id`), not agent-targeted.
- **Credits are handled entirely by the backend.** `ads_generate` reserves the estimated
  cost up front (it errors with `insufficient_credits` if the wallet is short — relay the
  message and stop) and bills only the images that actually complete. Call
  `ads_generate` with `dry_run: true` first to tell the user the cost; `gooseworks credits` shows balance.

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
   with `gooseworks log`.

## The generation tools (the new, single-workflow surface)

- `ads_generate` — **the one call that makes ads.** Inspect its live schema and supply
  the required brand/source inputs (`source.template_ids` for templates; Community ads and own
  creatives go in `source.community_ad_ids` / `source.creative_ids`) plus any choices the user
  explicitly made.
  Returns `batch` with a `links` block (`brand_url` + per-creative `app_url`). If the brand's
  research isn't finished yet the batch comes back `status: "queued"` — it auto-runs the moment
  research completes; tell the user it'll appear shortly, don't error.
- `ads_generate` with `dry_run: true` — cost preview (returns `estimate`). Reserves nothing. Use
  it to quote the cost first and check whether every selected source resolved before submitting.
- `job_get { job_id: <batch id>, kind: "ads_batch" }` — poll status. Its `result` is the batch:
  each creative with its renders and
  `completed`/`failed`/`pending` counts, plus `links`. A creative is done when its `pending` is 0
  — NOT when `current_render_url` is set (during a regenerate that field still points at the prior
  image). Each render carries `age_seconds` (since queued) and `elapsed_seconds` (time generating):
  use them to tell a slow-but-healthy render from a stuck one. A render only failed when its
  `status` is `"failed"` — never assume a stall and re-submit, that double-bills.
- `ads_creative_list` — the brand's gallery feed (newest
  first) + `brand_url`. Alternative poll target; also use to show everything made for a brand.
- `ads_template_search` with `mode: "surprise"` — the **"Surprise me" recommender**. Picks
  remixable Community creations (SAME logic as the web /create "Surprise me" button), shuffled
  so picks stay fresh. It does not use the retired curated third-party catalog.
  Returns the picked templates in `items` (id, slug, title, image, ratio) AND a ready-to-open `create_url`
  (the /create page with `cli=true` and the picks pre-selected). This is how you recommend
  templates — do NOT hand-pick from the raw catalog yourself (see "Picking templates" below).
- `ads_creative_edit` with `action: "regenerate"` — edit or re-roll one existing creative
  (`creative_id`) through the same pipeline.
  Inspect the live schema to select the supported `regenerate.mode` and required source inputs.
  Returns a single-item `batch`; poll it with `job_get`.
- `ads_creative_update` — record the user's reaction to a generated image via
  `patch.feedback: { render_id, rating?, comment?, reasons? }`. Use it whenever
  the user reacts; inspect the schema for the current rating and reason choices.

### Plan mode — review the plan BEFORE generating (optional)

For users who want to approve each ad's plan before spending credits (the app's "Plan it" flow):

- Use `ads_generate` with `mode: "plan"` — it composes each creative's plan and PAUSES.
  **No credits are reserved and no image renders** until you approve.
- `ads_approval_list` — poll this. While a creative is
  `composing`, wait; once `awaiting_approval`, show its `plan` (composed prompt + refs + quality)
  to the user.
- `ads_approval_decide` with `decision: "revise"` (`creative_id` + `revise.message`) — recompose
  from a chat steer, still
  free. Poll `ads_approval_list` until it's `awaiting_approval` again.
- `ads_approval_decide` with `decision: "approve"` — approve one creative (`creative_id`) or the
  whole batch (`batch_id`) using the live schema.
  **This is the step that reserves credits and renders.** Then poll
  `job_get` and hand back links as usual.

Only offer plan mode when the user asks to review/approve first — the default path generates
immediately.

## Reading the brand & picking inputs (still MCP, read-only)

- `brand_get_context { brand_id, sections: ["summary", "kit"] }` — read the canonical brand
  context (`kit`) and available products/assets.
- `brand_list` / `brand_get_context` — find and fetch the active brand.
- `ads_template_search` with `mode: "mine"` — list the org's own uploads and
  imported ads. `mode: "mine"` is the user's own ads;
  `mode: "competitor"` is research/inspiration, never proof that the user owns the ad.
- `ads_template_search` with `mode: "query"` — search remixable Community generations. The
  retired curated third-party catalog is not returned.
- `ads_template_get` — resolve a source already owned by
  the org, including an own upload or a snapshotted Community creative. It does not resolve the
  retired curated third-party catalog.
- Remixing a Community creative: a Community ad id is an `ad_project` id, not a
  template id. Pass it in `ads_generate`'s `source.community_ad_ids: [{ community_id }]` — the
  backend snapshots it into a private template at submit time (no separate snapshot call).
- `ads_template_create` — upload a source image as a private template
  (`source: { type: "workspace", path }`). Answer any
  ownership/rights input only from the user's explicit confirmation. Never claim rights for a
  competitor ad or an image found online.
- `ads_creative_get` / `video_project_update` (`patch.message`) — inspect a creative / leave a
  note on its project thread.

## Keep the brand kit in sync — reconcile, then update (ASK first)

The brand kit is the source of truth every generation reads. During ANY task, when the user
**tells you something about the brand or asks to change something brand-level** — a different
tagline, audience, voice, a product's name/price/description, "our logo is X", "we don't sell Y
anymore", a new product photo — treat it as a possible kit update, don't just use it for this one
ad and forget it:

1. **Check it against the kit.** Call `brand_get_context` (the `kit` section) for the active brand and see whether what the user said
   matches, is missing from, or contradicts the kit.
2. **If it's already in the kit and matches** — nothing to do; proceed.
3. **If it's new or different — ASK before writing.** Confirm in one line: *"Want me to update
   the brand kit so this sticks for future ads?"* Only persist on a yes (or when the user clearly
   asked you to change the brand). Don't silently mutate the kit, and don't nag on trivia.
4. **Persist with the write tools** (partial — only the fields you pass are touched; each edit is
   recorded as a user override that later re-research won't clobber):
   - `brand_update` with `patch.kit` — structured brand fields.
   - `brand_update` with `patch.products` — products (set `delete: true` on an entry to remove it).
   - `media_upload` / `media_update` — product and reference photos (upload with
     `scope: "product" | "brand"`, `kind: "reference"`; remove/unlink via `media_update`).
   Inspect each live schema and send only the fields needed for the confirmed change.
5. **Confirm what changed** and continue the task. (Logo, colors, and fonts are owned by the
   backend research pass — prefer `brand_update` with `patch.brand` / the research flow for those, not free text.)

This is the parity gap the app closes in-product: a brand fact the user gives mid-task should be
able to flow back into the kit — with their ok — instead of being lost.

## Picking source ads — use approved sources, not the retired catalog

When the user wants to make ads but has NOT named a specific template (id/slug/Community
ad/upload), do NOT silently browse the raw catalog and hand-pick for them. Instead run this
short ask flow — it mirrors the web app and keeps the human in the loop:

1. **Ask what kind of ads they want** — the angle/offer/theme/season. **The brand context already
   gives you the vibe (voice), the audience, and the product catalog — do NOT ask for those.**
   Offer the real `products[]` to pick from rather than asking "which product?", and derive the
   tone from the brand's voice. This shapes both the source choice and your steering `prompt`.
   Keep it to one quick question about campaign intent.
2. **Ask how to pick a source: their own ads, Community, upload, or "Surprise me".**
   - **Their own ads** → use `ads_template_search` with `mode: "mine"` to load the active brand's
     own sources and let them choose from the results.
   - **Community** → `ads_template_search` with `mode: "query"`, let them choose, then pass the
     chosen ids in `ads_generate`'s `source.community_ad_ids` when submitting.
   - **Upload** → upload through the workspace and call `ads_template_create`. If its live
     schema requires an ownership or permission answer, only supply it after explicit confirmation.
   - **Surprise me** (they want you/the app to pick) → call `ads_template_search` with
     `mode: "surprise"` for the active brand and hand the user the returned `create_url`.
     It opens /create in **CLI mode** with the picks pre-selected, a preview modal, and the
     **copyable remix prompt at the bottom** (in place of the Generate input). They can swap
     picks and copy that prompt. If they'd rather you "just make them" without reviewing in the
     app, you MAY submit the surprise-mode picks directly (skip to submit).
   - **Browse in the app** → hand the user this URL, with the
     active brand's slug filled in:
     `https://make.gooseworks.ai/create?brand=<brand-slug>&cli=true`
     In CLI mode the app shows the copyable remix prompt at the bottom (dismissable / switchable
     back to the UI composer). They browse the available own/Community sources and copy the prompt.
3. **Close the loop.** When the user **pastes back the copyable remix prompt** from the app
   (it names the brand + the templates they chose), THAT is your cue to generate: resolve the
   named source(s), inspect `ads_generate`, and collect only its unresolved required inputs.

If the user already named an owned source (id/slug), a Community ad, or an upload, skip the source
choice. Competitor ads may inform the angle or structure, but describe them as inspiration, never
claim ownership, and never attest rights for the user.

## Workflow — make ads from a template

1. **Resolve the brand.** Use `brand_list` by name/site, then call
   `brand_get_context { brand_id, sections: ["summary", "kit"] }` for the selected brand. If the
   kit's `researchStatus` isn't `complete`, you can still submit (the batch queues and runs when
   research finishes) — just tell the user. Use the kit to pick `product_name` (a real entry from
   `products[]`, not a guess) and, if the user supplied product photos, `reference_image_urls`.
2. **Pick the source ad(s) via the ask flow above.** Once you have concrete ids:
   call `ads_template_get` for each.
   A Community ad goes straight into `source.community_ad_ids`; for an uploaded image,
   `ads_template_create` first.
3. **(Optional) Craft the steering prompt.** The `prompt` is OPTIONAL — this is where the skill
   adds value: turn the user's intent (from step 1) into a concise steering note (e.g. tone,
   season, emphasis). Don't over-specify; the backend pipeline + brand kit handle palette, fonts,
   product swap.
4. **Quote the cost.** Inspect and call `ads_generate` with `dry_run: true`, then tell the user.
5. **Submit ONE batch.** Inspect the current `ads_generate` schema, fill known required
   inputs, ask only for unresolved user decisions, and omit unspecified optional settings. Keep
   the returned batch's id and `links`.
6. **Poll until done.** Call `job_get { job_id: <batch id>, kind: "ads_batch" }` (or use
   `ads_creative_list`) every ~20-30s
   until every creative's `pending` is 0. Most images finish in a few minutes; text-heavy templates
   and `quality: high` take longer. Read each render's `elapsed_seconds` rather than guessing — a
   render that's still `running` is healthy; do NOT re-submit thinking it stalled (that double-bills).
7. **Hand back the links** from the batch's `links` block — `brand_url` (gallery) and each
   creative's `app_url` — copied verbatim. Never end on just "done" or a file path.

## Workflow — edit an existing ad

User wants to tweak a creative they already made → use `ads_creative_edit` with
`action: "regenerate"`. Infer whether they
want another take, a targeted edit, or an exact instructed change from their request. Then inspect
the live schema, ask only for any required source or instruction that is still missing, submit,
poll with `job_get`, and hand back the links.

## Brand research

Prefer the backend's result: call `brand_get_context` (the `kit` section) for the selected brand.
If `researchStatus` is `complete`, REUSE it — never re-research.

**The split — backend owns visuals, you own the qualitative depth:**

- **Backend LIGHT pass (automatic).** `brand_create` with a `website_url` kicks off the same
  backend research the web app uses, in `mode: "light"`: it resolves the **authoritative logo,
  colors, and fonts** (Brandfetch + context.dev) plus a baseline kit, then flips
  `research_status` to `complete` — usually under a minute. You can't reproduce those visual
  signals locally, so **never re-derive logo/colors/fonts.** (Web onboarding via `/api/ads/onboard`
  runs the full thing; nothing to do but read it.)
- **Your DEEP pass (local, agentic).** You add the qualitative depth the light pass leaves thin —
  positioning, audience segments, voice, brandType, value props, proof points, products — grounded
  on the actual site.

**CLI brand-research flow:**

1. Inspect and call `brand_create` with the known brand identity and website, then keep its id
   and slug. The brand comes back with
   `research_status: "pending"` (light pass in flight).
2. **Wait for the backend light pass:** poll `brand_get_context` (the `kit` section) for that
   brand until `researchStatus`
   is `complete` (usually <60s). Now the kit has authoritative logo/colors/fonts + a baseline.
   At this point generation is already unblocked — but do the deep pass to make it good.
3. **Deep research locally:** `gooseworks fetch brand-research` and follow its phases. **Ground
   every fact on the fetched site** — if the site can't be read, say so and ask the user; never
   guess a category from the brand name alone.
4. **Write the pack** with `file_write` under `agent-config/brands/<slug>/`:
   - the `brand-research/*.md` docs + `brand-assets/manifest.json` (human-readable pack), AND
   - `brand-research/kit-patch.json` — the STRUCTURED fields the web UI renders. Field-for-field
     contract; only what you put here reaches the kit. Shape:
     `{ positioning?: string, audience?: string, voice?: string, brandType?: string, tagline?: string, valueProps?: string[], proofPoints?: string[], products?: [{ name, description?, link?, pricing?, imageUrls?: string[] }] }`
     (`brandType` ∈ product | saas | service | agency | restaurant | fashion | beauty | fitness |
     finance | education | health). Only URLs already in our storage for product images.
   - **Do NOT set logo / colors / fonts here** — the backend light pass already owns those.
5. **Persist it:** call `brand_update { brand_id, patch: { finalize_research: true } }` for the
   brand. It merges `kit-patch.json` into the kit
   NON-CLOBBERINGLY (it will NOT overwrite the backend's visuals or any user edit), then re-confirms
   `research_status: complete`.
6. **Verify:** call `brand_get_context` again and confirm the qualitative fields you wrote are
   present before generating.

**If the brand has NO website**, the backend light pass can't run (nothing to fetch) — do the whole
thing locally (steps 3–6) and finalize; an un-finalized brand has no kit for generation and leaves
no artifact to debug a wrong run (this is how a bad local classification, e.g. mislabelling a SaaS
as a "drink company", used to vanish without a trace).

## Analyze / intelligence (fetched recipes — NOT generation)

These are analysis recipes you fetch from goose-skills with `gooseworks fetch <slug>` and
follow; they do NOT touch the generation tools or credits-for-images. Pick the closest match;
if unsure, `gooseworks search "<what the user wants>"` first:
- **Campaign performance diagnosis** ("why is my Meta/Google campaign underperforming",
  creative fatigue, learning phase, pacing, auction overlap) → `gooseworks fetch meta-ads-analyzer`
  (or `ad-campaign-analyzer` for cross-platform).
- **Lead/CAC quality** ("are these ads driving qualified leads", true CAC vs vanity CPA,
  Scale/Keep/Investigate/Cut) → `gooseworks fetch ad-lead-quality-analyzer`.
- **Competitor ad intelligence** ("what ads are competitors running") →
  `gooseworks fetch competitor-ad-intelligence` (Meta Ad Library: `meta-ad-scraper`;
  Google: `google-ad-scraper`).
- **Creative ideation** (ad angles, winning hooks) → `gooseworks fetch ad-angle-miner` /
  `gooseworks fetch trending-ad-hook-spotter`.
- **Policy / landing-page checks** → `gooseworks fetch meta-ad-policy-checker` /
  `gooseworks fetch ad-to-landing-page-auditor`.

Save their scripts to `/tmp/gooseworks-scripts/<slug>/` and follow their instructions. These
run through the `gooseworks` CLI (`gooseworks fetch` / `gooseworks call`), like the GTM skills.

## Rules

- **MCP required** — if `mcp__gooseworks__*` is unavailable, stop and tell the user to run
  `gooseworks install --claude --mcp`.
- **One backend workflow** — generation is `ads_generate` / `ads_creative_edit` ONLY.
  Do NOT call FAL, the media proxy, `submit_render`, `update_render_status`, or upload render
  files yourself; do NOT `gooseworks fetch` a local remix recipe to generate. The backend owns it.
- **Always end a successful run with the links** from the batch's `links` block (`brand_url` +
  each creative's `app_url`), copied verbatim. Never end on just "done" or a file path.
- **Quote cost before generating** when it's non-trivial (use `ads_generate` with
  `dry_run: true`), and
  relay `insufficient_credits` plainly if the submit is rejected — don't retry blindly.
- **Use approved source paths.** If the user didn't name a source, run the ask flow (own ads,
  Community, upload, Surprise me, or browse in the app). "Surprise me" goes through
  `ads_template_search` (`mode: "surprise"`); browsing uses `/create?brand=<slug>&cli=true`.
  Never use the retired
  curated third-party catalog.
  Generate when they paste the app's copyable remix prompt back (or submit the surprise picks
  directly if they'd rather not review).
- **Treat competitor ads as inspiration** — never attest rights, imply ownership, or promise to
  copy a competitor's distinctive expression.
- **Reconcile brand facts into the kit** — when the user states or changes something brand-level
  mid-task, check it against `brand_get_context` and, with their ok, persist it via `brand_update`
  (`patch.kit` / `patch.products`) / `media_upload` so it sticks for future ads. Ask first;
  never silently mutate the kit.
- **Record feedback** — when the user reacts to a generated image, inspect and call
  `ads_creative_update` (`patch.feedback`) so the quality loop learns.
- **Plan mode is opt-in** — only use `mode: "plan"`, then `ads_approval_list` and
  `ads_approval_decide`, when the user wants to review before spending credits; otherwise generate
  immediately.
- **Don't busy-loop** — poll `job_get` on a sensible interval (~20-30s); a `queued`
  batch is waiting on research and will start on its own.
- **Report problems so we can fix them** — when a batch fails/is rejected and you can't resolve it,
  a required brand input/asset is missing, or a recipe/instruction is ambiguous or contradictory,
  run `gooseworks log` (`--event-type error|blocker|missing_input|confusion`, with the real error
  + step in `--details`) so the team gets visibility. Still tell the user too. Without a CLI
  (cowork / hosted chat) there is no logging channel — just tell the user.
