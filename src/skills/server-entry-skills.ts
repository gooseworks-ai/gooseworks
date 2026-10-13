// The entry skill text our server builds, copied here because the CLI
// cannot import gooseworks-app. Do not edit by hand.
//
// Source: gooseworks-app akhil/vq-wp7a2-custom-kit-handoff @ 036fa8393
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
export const SERVER_RULEBOOK_VERSION = '1.3.2';

export const SERVER_VIDEO_ENTRY_SKILLS = {
  'goose-video': `---
name: goose-video
description: "Make a video ad in this chat. Study a supplied video reference before comparing styles; follow the next_step in every answer."
version: 4.4.4
---

# GooseWorks video

From an installed entry, first catalog_fetch type skill goose-video on this same connection and follow that body. An entry already fetched in this run needs no repeat fetch.

For a video already started, call video_read and follow its next_step.

Explicit custom: skip steps 5–6. Keep their mechanics and assets; research the brand/product, study the reference and follow the custom rule below.

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
If no available style fits, or they explicitly want custom, catalog_fetch type skill make-custom-video on this connection before a project write and follow it: its full harness, current schemas, two authenticated approvals, cumulative budgets and verified execution. If anything is unavailable, say so and keep the brief; never run a template's renderer and call it custom, import the reference as a finished video, use retired actions or switch environments. Fetching a skill proves no execution capability.

## Rules

- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except a video's make command when a next_step gives it (its last line says who starts it; original videos follow their own). Never give any other command, sign-in step or setting, and never ask them a technical question.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; never decide it for them, and pass on a yes only once they gave it to that total.
- A yes is to the credit total the customer was shown: their press on the plan card, or their yes in chat sent with that total.
- Where the app shows no card, print the plan and its price and ask for the customer's yes here; never send them to a website to approve.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
`,
  'make-custom-video': `---
name: make-custom-video
description: "Make a custom video from its brief and studied reference, with authenticated script and ingredient reviews."
version: 3.5.1
requires_skills: [video-production-harness]
harness_binding: gooseworks/video-actions/v1
---

# Human version

The owner approves the script, then actual storyboard/ingredients and budget. Both authenticated reviews must pass before production.

---

# Agent version

Installed entry: catalog_fetch type skill make-custom-video here once. Check live custom schemas before writes. Keep this environment; no retired actions or reference-as-final import.

## Load the production harness

Require the complete video-production-harness (content, scripts, files, version, contentHash). An inline read lists it by slug only, so get it with catalog_fetch delivery archive (making needs that shell anyway), unpack it, then read its SKILL.md and follow the reading order it gives (each step file when you reach that step). Save safe paths separately with hashes/dependencies. Incomplete/mixed packages block work. Resume recorded packages, inputs and jobs.

## Keep the brief and study the reference

Explicit custom skips video_formats and the picker. Keep requested mechanics/assets; animated text and product photos must not become a creator montage. Implicit references use goose-video to watch and compare template constraints; custom follows no match or their choice.
Read brand_read (kit, products, rules), then knowledge_search. Use supported claims, real photos/logo. Watch the reference by playback, or timed frames spanning it plus audio/transcript, and log its beats as the harness says; URLs/thumbnails are not viewing. Missing access needs an accessible source or explicit brief-only choice.
Before video_create, catalog_fetch type template for the style nearest the brief and use its plan as your skeleton (harness design brief); with no customer reference, create with its demo video (media_url) as reference_url. Never run a template's renderer or unchanged style and call it custom.

## Create or resume

New: video_create with brand_id, style custom, request and a required agent-generated UUID idempotency_key; retain products, name, reference_url and campaign. Reuse that key on retries. Resume with video_read the same project: retain plan_revision, custom_review, brand_context, production_manifest and execution; never create a replacement.
Reference resolve takes direct files and starts no paid social lookup. If it fails, attach the file you watched as next_step says; skip needs the customer's brief-only user_quote. A pending/failed reference blocks approval. A resolved one also needs draft.reference_observation (what you saw and heard); it binds the script token.

## Save script and ingredients

Follow the harness phases for the actual scenes; reuse suitable product photos and deterministic text animation. Bind operations to this project and approved scene/script revisions.
video_change needs expected_revision (plan_revision), custom draft and optional script. Bind brand_context_digest to the returned bundle; never author server context. Keep packages outside the review payload. Price each paid request free with estimate_only=1 and save preview_estimate/render_estimate, with its redo allowance, for the work still to buy (harness design brief); the server adds committed_credits. Never edit a field the owner approved: the save sets their approval aside until the approved text is back. Missing price/unsupported inputs blocks production; no guessed rates/direct keys.

## Two authenticated owner reviews

Show the complete saved script and exact cumulative budget on the authenticated review card. Only the owner's actual signed button press approves. Chat yes, OAuth, user_quote, widget origin or a copied token is not proof; never manufacture a click or self-approve. Text-only/large reviews use returned authenticated Studio phase buttons and approval_surface URL.
Reread video_read after owner actions. Script approval permits quoted previews only. Save the actual storyboard, playable ingredients and render budget; ingredient approval permits clips. Require current script_approved/ingredients_approved, matching tokens/revision and budget. Changed reviews need renewed approval. A prior yes does not authorize changed work.

## Execute, check and deliver

When the nearest template's parts fit every scene, save the harness's kit block in the ingredients draft; after ingredient approval, follow video_make's next_step (the kit makes, checks and finishes the video; send no render state), then read the final back with video_read. Otherwise require execution.local from a verified customer shell (no cloud, API host, worker or coworker sandbox), or report the gap.
When you build it yourself, video_make needs expected_revision and custom render state. Resume the same render with approved tokens; report running/failed/complete honestly and honor Stop. Report running with a progress_note after each paid piece and at least every 15 minutes. Send each generated clip to custom clip_check and redo a failed one once inside the allowance (harness clip step). Save actual prompts, settings, every scene and clip checks through video_change custom production. Watch the full output against the approved script, product and brand; save its full quality report. Export an MP4 (H.264 + AAC) and complete with output_url set to the output_url media_confirm returned for it; GooseWorks checks the file, so report complete again while it says still checking. Pin only the checked complete render. Read back manifest/final before delivery. Repairs need affected assets only and renewed approvals/budget.

When you build it yourself, completion also needs the rebuild recipe saved as custom production source: the harness's references/recipe-format.md and the next_step give the steps.

Use plain words and returned credits. No invented claims, approvals, assets or passing checks.
`,
} as const;

export type ServerVideoEntrySlug = keyof typeof SERVER_VIDEO_ENTRY_SKILLS;

/** renderEntrySkillRules(product) for the products the CLI's own entry skills cover. */
export const SERVER_ENTRY_SKILL_RULES = {
  all: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except a video's make command when a next_step gives it (its last line says who starts it; original videos follow their own). Never give any other command, sign-in step or setting, and never ask them a technical question.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; never decide it for them, and pass on a yes only once they gave it to that total.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  ads: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except a video's make command when a next_step gives it (its last line says who starts it; original videos follow their own). Never give any other command, sign-in step or setting, and never ask them a technical question.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; never decide it for them, and pass on a yes only once they gave it to that total.
- Before choosing an angle, claim, product or source, or asking a brand fact, brand_read then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  photos: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except a video's make command when a next_step gives it (its last line says who starts it; original videos follow their own). Never give any other command, sign-in step or setting, and never ask them a technical question.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; never decide it for them, and pass on a yes only once they gave it to that total.
- Before choosing an angle, claim, product or source, or asking a brand fact, brand_read then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
} as const;
