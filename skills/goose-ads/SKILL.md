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
version: 2.3.0
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

## Identity & credits

- One agent-scoped token authenticates the `gooseworks` MCP tools. Never print it. The tools
  resolve your org automatically — you do NOT resolve an "Ads agent" or pass `target` for the
  generation tools.
- **Credits are handled entirely by the backend.** `submit_remix_batch` reserves the estimated
  cost up front (it errors with `insufficient_credits` if the wallet is short — relay the
  message and stop) and bills only the images that actually complete. Call
  `estimate_remix_batch` first to tell the user the cost; `gooseworks credits` shows balance.

## Defaults — match the app (priority: frontend, then backend)

When the user doesn't specify, submit with the **ads app's** defaults so skill output matches
what they'd get in the UI. **Pass these explicitly:**

- `variants`: **1** per template
- `ratios`: **["4:5"]** (Meta feed vertical)
- `engine`: **"gpt_image_2"**
- `quality`: **"medium"**
- `apply_brand_colors`: **true**
- `apply_brand_font`: **true**

Do not ask whether to match the source's original styling. That option was removed from the app.
The normal path always applies the user's brand colors and font. If the user explicitly asks for
one of the app's mixed treatments, use brand colors + source font (`true` / `false`) or source
colors + brand font (`false` / `true`). Never expose or send the both-false combination, and
never send the deprecated `preserve_source_styling` field.

If the user asks for something the app exposes (more variants, a different ratio like 1:1 or
9:16, a faster engine, higher quality), pass that instead. Omitting a field lets backend policy
decide — fine, but prefer sending the app defaults for predictable parity.

## The generation tools (the new, single-workflow surface)

- `submit_remix_batch { brand_id, items, prompt?, product_name?, apply_brand_colors?, apply_brand_font?,
  reference_image_urls?, allow_without_product_image?, engine?, quality? }` — **the one call
  that makes ads.** `items` is `[{ template_id, variants?, ratios? }]` (≤20 templates).
  Returns the batch with a `links` block (`brand_url` + per-creative `app_url`). If the brand's
  research isn't finished yet the batch comes back `status: "queued"` — it auto-runs the moment
  research completes; tell the user it'll appear shortly, don't error.
- `estimate_remix_batch { items, engine?, quality? }` — cost preview (images, credits_per_image,
  total_credits, available_credits). `template_id` accepts a uuid OR a slug. Reserves nothing. Use
  to quote the cost first. Check `unknown_template_ids` in the response — any token there didn't
  resolve (submit would 404 on it); don't quote a cost that silently dropped a bad id.
- `get_remix_batch { batch_id }` — poll status. Returns each creative with its renders and
  `completed`/`failed`/`pending` counts, plus `links`. A creative is done when its `pending` is 0
  — NOT when `current_render_url` is set (during a regenerate that field still points at the prior
  image). Each render carries `age_seconds` (since queued) and `elapsed_seconds` (time generating):
  use them to tell a slow-but-healthy render from a stuck one. A render only failed when its
  `status` is `"failed"` — never assume a stall and re-submit, that double-bills.
- `list_brand_creatives { brand_id, limit?, offset? }` — the brand's gallery feed (newest
  first) + `brand_url`. Alternative poll target; also use to show everything made for a brand.
- `surprise_me_templates { brand_id, count? }` — the **"Surprise me" recommender**. Picks
  remixable Community creations (SAME logic as the web /create "Surprise me" button), shuffled
  so picks stay fresh. It does not use the retired curated third-party catalog.
  Returns the picked templates (id, slug, title, image, ratio) AND a ready-to-open `create_url`
  (the /create page with `cli=true` and the picks pre-selected). This is how you recommend
  templates — do NOT hand-pick from the raw catalog yourself (see "Picking templates" below).
- `regenerate_creative { project_id, mode?, prompt?, source_render_id?, ... }` — **edit / re-roll
  one existing creative** through the same pipeline. `mode: "variation"` (default) re-rolls from
  the template; `"edit"` makes a targeted change to a specific render (`prompt` + `source_render_id`
  required); `"exact"` runs `prompt` verbatim against that render's references. Returns a
  single-item batch — poll it with `get_remix_batch`.
- `set_creative_feedback { render_id, rating?, comment?, reasons? }` — record the user's reaction
  to a generated image (the SAME happy/neutral/sad + comment + reason chips the app captures). Use
  it whenever the user reacts ("love this one" / "the logo is wrong"). `render_id` is a RENDER id
  from `get_remix_batch` / `list_brand_creatives`, not a project/batch id. `reasons` are quick
  chips (wrong_product, brand_or_logo_wrong, off_brand, text_garbled, weak_copy, ai_or_distorted).

### Plan mode — review the plan BEFORE generating (optional)

For users who want to approve each ad's plan before spending credits (the app's "Plan it" flow):

- `submit_remix_batch { ..., requires_approval: true }` — composes each creative's plan and PAUSES.
  **No credits are reserved and no image renders** until you approve.
- `list_ad_approvals { brand_id? }` — poll this; returns `{ items, counts }`. While a creative is
  `composing`, wait; once `awaiting_approval`, show its `plan` (composed prompt + refs + quality)
  to the user.
- `revise_ad_plan { project_id, message?, variant_label? }` — recompose from a chat steer, still
  free. Poll `list_ad_approvals` until it's `awaiting_approval` again.
- `approve_ad_plan { project_id | batch_id }` — approve ONE creative (`project_id`) or the whole
  batch (`batch_id`). **This is the step that reserves credits and renders.** Then poll
  `get_remix_batch` and hand back links as usual.

Only offer plan mode when the user asks to review/approve first — the default path generates
immediately.

## Reading the brand & picking inputs (still MCP, read-only)

- `get_brand_kit { brand_id }` — the CANONICAL brand context (name, description, audience,
  voice, brandType, valueProps, colors, typography, logoUrl, `products[]`, presigned
  `referenceImages[]`). Read this to choose `product_name` and any `reference_image_urls`.
- `list_ad_brands { query? }` / `get_ad_brand { brand_id }` — find/fetch a brand. Pass `query` to
  filter by name (case-insensitive) instead of listing every brand; rows are lean (no `brand_kit` —
  read `get_brand_kit` for the full kit).
- `list_user_ad_templates { brand_id?, relationship? }` — list the org's own uploads and
  imported ads. Prefer `relationship: "self"` when the user wants to reuse their own ads;
  `relationship: "competitor"` is research/inspiration, never proof that the user owns the ad.
- `search_ad_templates { query, brand_id? }` — search remixable Community generations. The
  retired curated third-party catalog is not returned.
- `get_static_ad_template { template_id }` — resolve a template (slug OR uuid) already owned by
  the org, including an own upload or a snapshotted Community creative. It does not resolve the
  retired curated third-party catalog.
- `remix_community_ad { community_id }` — a **Community** ad id is an `ad_project` id, not a
  template id. Call this FIRST to snapshot it into a private template, then use the returned
  template `id` in `items`.
- `create_user_ad_template { workspace_path, rights_attested? }` — upload a source image as a
  private template. Set `rights_attested: true` only after the user explicitly confirms they own
  it or have permission to use it. Never set it true for a competitor ad or an image found online.
- `get_ad_project` / `append_project_message` — inspect a creative / leave a note on its thread.

## Keep the brand kit in sync — reconcile, then update (ASK first)

The brand kit is the source of truth every generation reads. During ANY task, when the user
**tells you something about the brand or asks to change something brand-level** — a different
tagline, audience, voice, a product's name/price/description, "our logo is X", "we don't sell Y
anymore", a new product photo — treat it as a possible kit update, don't just use it for this one
ad and forget it:

1. **Check it against the kit.** `get_brand_kit { brand_id }` and see whether what the user said
   matches, is missing from, or contradicts the kit.
2. **If it's already in the kit and matches** — nothing to do; proceed.
3. **If it's new or different — ASK before writing.** Confirm in one line: *"Want me to update
   the brand kit so this sticks for future ads?"* Only persist on a yes (or when the user clearly
   asked you to change the brand). Don't silently mutate the kit, and don't nag on trivia.
4. **Persist with the write tools** (partial — only the fields you pass are touched; each edit is
   recorded as a user override that later re-research won't clobber):
   - `update_brand_kit { brand_id, description?, audience?, voice?, instructions?, brand_type?,
     value_props?, primary_color?, accent_color? }` — the structured kit fields.
   - `upsert_brand_product { brand_id, ... }` / `delete_brand_product` — manage products.
   - `add_brand_product_image { brand_id, ... }` / `remove_brand_reference_image` — product /
     reference photos.
5. **Confirm what changed** and continue the task. (Logo, colors, and fonts are owned by the
   backend research pass — prefer `update_ad_brand` / the research flow for those, not free text.)

This is the parity gap the app closes in-product: a brand fact the user gives mid-task should be
able to flow back into the kit — with their ok — instead of being lost.

## Picking source ads — use approved sources, not the retired catalog

When the user wants to make ads but has NOT named a specific template (id/slug/Community
ad/upload), do NOT silently browse the raw catalog and hand-pick for them. Instead run this
short ask flow — it mirrors the web app and keeps the human in the loop:

1. **Ask what kind of ads they want** — the angle/offer/theme/season, the vibe, and which
   product from the brand kit to feature. This shapes both the source choice and your steering
   `prompt`. Keep it to one or two quick questions.
2. **Ask how to pick a source: their own ads, Community, upload, or "Surprise me".**
   - **Their own ads** → `list_user_ad_templates { brand_id, relationship: "self" }` and let
     them choose from the results.
   - **Community** → `search_ad_templates`, let them choose, then call `remix_community_ad`
     before submitting.
   - **Upload** → upload through the workspace and call `create_user_ad_template`. Record
     `rights_attested: true` only after explicit confirmation of ownership/permission.
   - **Surprise me** (they want you/the app to pick) → call
     `surprise_me_templates { brand_id, count }` and hand the user the returned `create_url`.
     It opens /create in **CLI mode** with the picks pre-selected, a preview modal, and the
     **copyable remix prompt at the bottom** (in place of the Generate input). They can swap
     picks and copy that prompt. If they'd rather you "just make them" without reviewing in the
     app, you MAY submit the `surprise_me_templates` picks directly (skip to submit).
   - **Browse in the app** → hand the user this URL, with the
     active brand's slug filled in:
     `https://make.gooseworks.ai/create?brand=<brand-slug>&cli=true`
     In CLI mode the app shows the copyable remix prompt at the bottom (dismissable / switchable
     back to the UI composer). They browse the available own/Community sources and copy the prompt.
3. **Apply brand styling by default** — brand colors and brand font. Ask only when the user
   explicitly wants one of the supported mixed treatments described in Defaults.
4. **Close the loop.** When the user **pastes back the copyable remix prompt** from the app
   (it names the brand + the templates they chose), THAT is your cue to generate: resolve the
   named template(s), then `submit_remix_batch` with the app defaults + the styling they chose.

If the user already named an owned source (id/slug), a Community ad, or an upload, skip the source
choice. Do not ask a styling question; apply brand colors and font unless they requested a supported
mixed treatment. Competitor ads may inform the angle or structure, but describe them as inspiration,
never claim ownership, never promise an original-style match, and never attest rights for the user.

## Workflow — make ads from a template

1. **Resolve the brand.** `list_ad_brands` by name/site → `get_brand_kit { brand_id }`. If the
   kit's `researchStatus` isn't `complete`, you can still submit (the batch queues and runs when
   research finishes) — just tell the user. Use the kit to pick `product_name` (a real entry from
   `products[]`, not a guess) and, if the user supplied product photos, `reference_image_urls`.
2. **Pick the source ad(s) via the ask flow above.** Once you have concrete ids:
   `get_static_ad_template { template_id }` for each.
   For a Community ad, `remix_community_ad` first; for an uploaded image, `create_user_ad_template`
   first.
3. **(Optional) Craft the steering prompt.** The `prompt` is OPTIONAL — this is where the skill
   adds value: turn the user's intent (from step 1) into a concise steering note (e.g. tone,
   season, emphasis). Don't over-specify; the backend pipeline + brand kit handle palette, fonts,
   product swap.
4. **(Optional) Quote the cost.** `estimate_remix_batch { items, engine, quality }` → tell the user.
5. **Submit ONE batch.** `submit_remix_batch { brand_id, items, prompt?, product_name?, engine,
   quality, apply_brand_colors: true, apply_brand_font: true }` using the app defaults above.
   Change one styling flag only when the user explicitly requested a supported mixed treatment.
   Keep the returned `batch_id` and `links`.
6. **Poll until done.** `get_remix_batch { batch_id }` (or `list_brand_creatives`) every ~20-30s
   until every creative's `pending` is 0. Most images finish in a few minutes; text-heavy templates
   and `quality: high` take longer. Read each render's `elapsed_seconds` rather than guessing — a
   render that's still `running` is healthy; do NOT re-submit thinking it stalled (that double-bills).
7. **Hand back the links** from the batch's `links` block — `brand_url` (gallery) and each
   creative's `app_url` — copied verbatim. Never end on just "done" or a file path.

## Workflow — edit an existing ad

User wants to tweak a creative they already made → `regenerate_creative`:
- "make another version / different take" → `mode: "variation"` (optionally new `prompt`,
  `product_name`, `ratios`).
- "change X in this exact image" → `mode: "edit"`, `source_render_id` = the render to edit,
  `prompt` = the change.
- "run exactly this prompt on the product" → `mode: "exact"`, `source_render_id` + `prompt`.
Then poll with `get_remix_batch` and hand back the links, same as above.

## Brand research

Prefer the backend's result: `get_brand_kit { brand_id }`. If `researchStatus` is
`complete`, REUSE it — never re-research.

**The split — backend owns visuals, you own the qualitative depth:**

- **Backend LIGHT pass (automatic).** `create_ad_brand` with a `website_url` kicks off the same
  backend research the web app uses, in `mode: "light"`: it resolves the **authoritative logo,
  colors, and fonts** (Brandfetch + context.dev) plus a baseline kit, then flips
  `research_status` to `complete` — usually under a minute. You can't reproduce those visual
  signals locally, so **never re-derive logo/colors/fonts.** (Web onboarding via `/api/ads/onboard`
  runs the full thing; nothing to do but read it.)
- **Your DEEP pass (local, agentic).** You add the qualitative depth the light pass leaves thin —
  positioning, audience segments, voice, brandType, value props, proof points, products — grounded
  on the actual site.

**CLI brand-research flow:**

1. `create_ad_brand { name, website_url }` → keep `brand_id` + `slug`. The brand comes back with
   `research_status: "pending"` (light pass in flight).
2. **Wait for the backend light pass:** poll `get_brand_kit { brand_id }` until `researchStatus`
   is `complete` (usually <60s). Now the kit has authoritative logo/colors/fonts + a baseline.
   At this point generation is already unblocked — but do the deep pass to make it good.
3. **Deep research locally:** `gooseworks fetch brand-research` and follow its phases. **Ground
   every fact on the fetched site** — if the site can't be read, say so and ask the user; never
   guess a category from the brand name alone.
4. **Write the pack** with `write_file` under `agent-config/brands/<slug>/`:
   - the `brand-research/*.md` docs + `brand-assets/manifest.json` (human-readable pack), AND
   - `brand-research/kit-patch.json` — the STRUCTURED fields the web UI renders. Field-for-field
     contract; only what you put here reaches the kit. Shape:
     `{ positioning?: string, audience?: string, voice?: string, brandType?: string, tagline?: string, valueProps?: string[], proofPoints?: string[], products?: [{ name, description?, link?, pricing?, imageUrls?: string[] }] }`
     (`brandType` ∈ product | saas | service | agency | restaurant | fashion | beauty | fitness |
     finance | education | health). Only URLs already in our storage for product images.
   - **Do NOT set logo / colors / fonts here** — the backend light pass already owns those.
5. **Persist it:** `finalize_brand_research { brand_id }` merges `kit-patch.json` into the kit
   NON-CLOBBERINGLY (it will NOT overwrite the backend's visuals or any user edit), then re-confirms
   `research_status: complete`.
6. **Verify:** `get_brand_kit { brand_id }` — confirm the qualitative fields you wrote are present
   before generating.

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
- **One backend workflow** — generation is `submit_remix_batch` / `regenerate_creative` ONLY.
  Do NOT call FAL, the media proxy, `submit_render`, `update_render_status`, or upload render
  files yourself; do NOT `gooseworks fetch` a local remix recipe to generate. The backend owns it.
- **Always end a successful run with the links** from the batch's `links` block (`brand_url` +
  each creative's `app_url`), copied verbatim. Never end on just "done" or a file path.
- **Quote cost before generating** when it's non-trivial (use `estimate_remix_batch`), and
  relay `insufficient_credits` plainly if the submit is rejected — don't retry blindly.
- **Use approved source paths.** If the user didn't name a source, run the ask flow (own ads,
  Community, upload, Surprise me, or browse in the app). "Surprise me" goes through
  `surprise_me_templates`; browsing uses `/create?brand=<slug>&cli=true`. Never use the retired
  curated third-party catalog.
  Generate when they paste the app's copyable remix prompt back (or submit the surprise picks
  directly if they'd rather not review).
- **Apply brand styling** — send `apply_brand_colors: true` and `apply_brand_font: true` by
  default. Do not ask about matching original styling, do not send `preserve_source_styling`, and
  never send both brand-style flags as false.
- **Treat competitor ads as inspiration** — never attest rights, imply ownership, or promise to
  preserve a competitor's original styling.
- **Reconcile brand facts into the kit** — when the user states or changes something brand-level
  mid-task, check it against `get_brand_kit` and, with their ok, persist it via `update_brand_kit`
  / `upsert_brand_product` / `add_brand_product_image` so it sticks for future ads. Ask first;
  never silently mutate the kit.
- **Record feedback** — when the user reacts to a generated image, capture it with
  `set_creative_feedback { render_id, rating/comment/reasons }` so the quality loop learns.
- **Plan mode is opt-in** — only compose-and-pause (`requires_approval: true` → `list_ad_approvals`
  → `approve_ad_plan`) when the user wants to review before spending credits; otherwise generate
  immediately.
- **Don't busy-loop** — poll `get_remix_batch` on a sensible interval (~20-30s); a `queued`
  batch is waiting on research and will start on its own.
- **Report problems so we can fix them** — when a batch fails/is rejected and you can't resolve it,
  a required brand input/asset is missing, or a recipe/instruction is ambiguous or contradictory,
  call the **`log_cli_event`** MCP tool (`event_type`: `error`/`blocker`/`missing_input`/`confusion`,
  with the real error + step in `details`) so the team gets visibility. Still tell the user too.
