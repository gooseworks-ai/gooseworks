// The entry skill text our server builds, copied here because the CLI
// cannot import gooseworks-app. Do not edit by hand.
//
// Source: gooseworks-app codex/custom-video-adapter @ 2245c00ee42ff2ce2224e2fe9fe2a1fa15fa9be6
//   apps/api/src/services/playbooks/entry-skill.ts      buildVideoEntrySkill(slug)
//   apps/api/src/app-mcp-server/lib/video-policy.ts     renderEntrySkillRules(product)
//
// The video entry skills are the server's whole SKILL.md. The rules blocks are
// the rulebook's entry-skill rules for the skills the CLI writes itself
// (gooseworks, goose-ads, goose-product-photos), so no skill restates a rule
// by hand. tests/skills/server-entry-skills.test.ts checks this file against
// tests/fixtures/server-entry-skills.json, and that fixture against a
// gooseworks-app checkout when GOOSEWORKS_APP_DIR points at one.

/** The rulebook version this text was built from. */
export const SERVER_RULEBOOK_VERSION = '1.3.0';

export const SERVER_VIDEO_ENTRY_SKILLS = {
  'goose-video': `---
name: goose-video
description: "Make a video ad in this chat. Study a supplied video reference before comparing styles; follow the next_step in every answer."
version: 4.4.3
---

# GooseWorks video

From an installed entry, first catalog_fetch type skill goose-video on this same connection and follow that body. An entry already fetched in this run needs no repeat fetch.

For a video already started, call video_read and follow its next_step.

Explicit custom: skip video_formats and steps 5–6. Keep their mechanics and assets; research the brand/product and study the reference for its custom plan. Check current custom support before any write.

For other new videos start with get_started (wants video, request). A card is not a style choice or proof of viewing. Follow the reference rule before style selection or a plan.

1. The request. If they haven't said what the video is about, ask in one short question.
2. The brand. Ask which brand only when brand_read lists several; with one, use it.
3. The product. Named or none wanted: find its id with brand_read (sections: products), or use []. Otherwise the product card asks: say one line and wait. Without cards, ask which product by name; use the only one, or go on with none. Never ask again after a pick.
4. Research. Read the brand kit, learnings and the chosen products with brand_read (sections kit and learnings, plus the products' ids), then knowledge_search for them. Note what to say and avoid.
5. The styles. Call video_formats with the request and the products' ids ([] for none). The customer picks; never recommend one. A style they named that the answer lists as available is their pick. Otherwise, with the style card on screen, say one short line and wait; without one, print the style table from the answer as it is and ask nothing else.
6. The plan. Call video_create with the picked style and the products; its next_step says what follows.

## A supplied video reference comes first

Watch the actual video before choosing a style or writing a custom plan. Play through it, or inspect timestamped frames spanning it plus its audio/transcript. A URL, title, caption or thumbnail is not a viewing. Record the hook, scene order, pacing, narration/dialogue, framing, product interactions, text and ending, with timestamps and gaps. If access or sampling cannot answer an essential detail, ask for an accessible video or their choice to continue from the brief; never claim it was watched.
When they have not chosen custom, call video_formats after brand research. For plausible matches, catalog_fetch type template returns the style's plan_note, scenes, duration, cast, sound and assets. Compare these against the observed reference and their essential choices. A similar title or high brand ranking does not prove a match. Explain fit or mismatch before they choose. Keep an explicit style choice; do not quietly change constraints or over-adapt it. Reassess a later reference before creating or rewriting a plan.
If no available style fits, or they explicitly want custom, catalog_fetch type skill make-custom-video on this connection before a project write. Require its complete production-harness dependency and current custom schemas. Follow its separate authenticated script and ingredient approvals, cumulative budgets and verified execution capability. If anything is unavailable, say so and keep the brief; do not substitute a template, import the reference as a finished video, use retired actions or switch environments. Fetching a skill alone proves no execution capability.

## Rules

- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- A yes counts only for the price the customer was shown: their press on the plan card, or their yes in chat sent with that price.
- Where the app shows no card, print the plan and its price and ask for the customer's yes here; never send them to a website to approve.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
`,
  'make-custom-video': `---
name: make-custom-video
description: "Make a custom video from its brief and studied reference, with authenticated script and ingredient reviews."
version: 3.4.3
requires_skills: [video-production-harness]
harness_binding: gooseworks/video-actions/v1
---

# Human version

The owner approves the script, then actual storyboard/ingredients and budget. Both authenticated reviews must pass before production.

---

# Agent version

Installed entry: catalog_fetch type skill make-custom-video here once. Check live custom schemas before writes. Keep this environment; no retired actions, template fallback or reference-as-final import.

## Load the production harness

Require complete video-production-harness content/scripts/files/version/contentHash. Read its orchestrator, phases and editorial/specialist guides. Save safe paths separately with hashes/dependencies. Incomplete/mixed packages block work. Resume recorded packages, inputs and jobs.

## Keep the brief and study the reference

Explicit custom skips video_formats and the picker. Keep requested mechanics/assets; animated text and product photos must not become a creator montage. Implicit references use goose-video to watch and compare template constraints; custom follows no match or their choice.
Read brand_read (kit, products, rules), then knowledge_search. Use supported claims, real photos/logo. Watch playback, or timed frames spanning the video plus audio/transcript. Record hook, scene order, pace, framing, dialogue, text, product interactions and ending with times/gaps. URLs/thumbnails are not viewing. Missing access needs an accessible source or explicit brief-only choice.

## Create or resume

New: video_create with brand_id, style custom, request and stable idempotency_key; retain products, name, reference_url and campaign. On timeout/resume, video_read the same project: retain plan_revision, custom_review, brand_context, production_manifest and execution; never create a replacement.
Reference resolve accepts direct files; social links cause no automatic paid lookup. After watching stored media, video_change custom reference attach uses asset_id and original analysis_revision. Skip needs explicit brief-only user_quote. Pending/failed reference blocks approval; a URL is not viewing.
A resolved reference also needs draft.reference_observation: exact source_url, real duration_s, evidence_mode playback or frames_and_audio, observed_through_s covering 95%, and a timed picture/audio summary with gaps. Its data binds the script token. Resolve/attach is not watching.

## Save script and ingredients

Follow the harness phases. Discover specialists for the actual scenes; check inputs, outputs, dependencies and managed execution. Reuse suitable product photos and deterministic text animation. Never substitute a template driver. Bind operations to this project and approved scene/script revisions.
video_change needs expected_revision (plan_revision), custom draft and optional script. Bind brand_context_digest to the returned bundle; never author server context. Keep packages outside the review payload. Quote paid operations through the live managed estimate path with real inputs/project. Save cumulative preview_estimate/render_estimate including committed spend. Missing price/unsupported inputs blocks production; no guessed rates/direct keys.

## Two authenticated owner reviews

Show the complete saved script and exact cumulative budget on the authenticated review card. Only the owner's actual signed button press approves. Chat yes, OAuth, user_quote, widget origin or a copied token is not proof; never manufacture a click or self-approve. Text-only/large reviews use returned authenticated Studio phase buttons and approval_surface URL.
Reread video_read after owner actions. Script approval permits quoted previews only. Save the actual storyboard, playable ingredients and render budget; ingredient approval permits clips. Require current script_approved/ingredients_approved, matching tokens/revision and budget. Changed reviews need renewed approval. A prior yes does not authorize changed work.

## Execute, check and deliver

Require execution.local from a verified customer shell. No cloud, style-only kit, API host, worker or coworker sandbox. Otherwise report the gap.
video_make needs expected_revision and custom render state. Resume the same render with approved tokens; report running/failed/complete honestly and honor Stop. Save actual prompts, settings, every scene and clip checks through video_change custom production. Watch the full output against the approved script, product and brand; save its full quality report. Completion needs a confirmed upload in this project; pin only the checked complete render. Read back manifest/final before delivery. Repairs need affected assets only and renewed approvals/budget.

Use plain words and returned credits. No invented claims, approvals, assets or passing checks.
`,
} as const;

export type ServerVideoEntrySlug = keyof typeof SERVER_VIDEO_ENTRY_SKILLS;

/** renderEntrySkillRules(product) for the products the CLI's own entry skills cover. */
export const SERVER_ENTRY_SKILL_RULES = {
  all: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  ads: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- Before choosing an angle, claim, product or source, or asking a brand fact, brand_read then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  photos: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- Before choosing an angle, claim, product or source, or asking a brand fact, brand_read then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
} as const;
