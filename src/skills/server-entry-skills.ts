// The entry skill text our server builds, copied here because the CLI
// cannot import gooseworks-app. Do not edit by hand.
//
// Source: gooseworks-app akhil/vq-wp7a2-custom-kit-handoff @ 036fa8393
//   apps/api/src/services/playbooks/entry-skill.ts      buildVideoEntrySkill(slug)
//   apps/api/src/app-mcp-server/lib/video-policy.ts     renderEntrySkillRules(product)
//
// Custom entry source: gooseworks-app codex/custom-video-quality-oct14 @ be9ae35eca60339116dce791d1fc3e96a6876799, version 3.6.0.
// Other entries and rule blocks retain the earlier source above.
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
description: "Create a custom video with sourced product accuracy, explicit sound routing and exact-final audiovisual review."
version: 3.6.0
requires_skills: [video-production-harness]
harness_binding: gooseworks/video-actions/v1
---

# Human version

The owner approves the script, then actual ingredients and budget. Production preserves the approved action, product and sound. File checks support a separate full audiovisual review.

---

# Agent version

Fetch make-custom-video on this connection and read live schemas before writes. Keep this environment; no retired actions or reference-as-final import.

## Load and resume

Fetch the complete video-production-harness with catalog_fetch delivery archive. Read SKILL.md and its phase references; retain version/contentHash/files/dependencies. Mixed or incomplete packages block work. Resume recorded packages and jobs with video_read; never resend a batch to replace missing polling.
Explicit custom skips the picker. Create once with style custom and an agent-generated UUID idempotency_key; reuse it on retries. Preserve requested mechanics, assets, products, reference_url and campaign. Resume the same project, plan_revision, approvals, brand_context and production_manifest.

## Reference, product and creative contract

Read brand_read and knowledge_search. Source product geometry, colour, label, allowed use and scale. Size-sensitive shots need dimensions or a known-scale photo; clarify essential missing facts. Inspect stills against those sources before animation. Never guess capacity from a label or illustrate a real process with invented actions.
Watch the complete reference with sound and continuous motion. Save reference_observation bound to media_id/media_revision, duration, full coverage, audio_perception and motion_perception, plus timed picture/audio findings. Frames/transcripts cannot prove listening, lip sync or motion. Missing capability stays incomplete. Resolve/attach needs no paid social lookup; skip requires the owner's explicit brief-only user_quote.
Fetch a relevant template for parts and constraints. The customer reference and brief control actions, scene count and pace. Never run an unchanged template renderer and call it custom.
Save draft.creative_contract: speech_mode, separate soundtrack_modes, required_features, scene reference_map (beat/action/proof/sound), sourced product_grounding and voice_plan. Follow the harness native/external decision: native speech keeps source audio; external speech over a speaking face needs exact-audio lip sync. No detected words does not authorize mute; no speech can still need music, ambience or SFX.
Use connected creator language and reference-appropriate pace. Reuse accepted character/voice/world/music/SFX/overlay examples with provenance. Emotion controls must fit the live schema. Candidates need qualification; never silently switch model families.

## Save and review twice

video_change needs expected_revision and current brand_context_digest. Never author server context. Estimate paid requests free with estimate_only=1; save preview/render estimates including redo allowance. No guessed rates or direct keys. Changing approved intent sets approval aside.
Show the complete saved script and cumulative budget on the authenticated card. Only the owner's signed button press approves; chat yes, OAuth, user_quote or copied tokens are not proof. Large reviews use returned Studio buttons/approval_surface. Script approval permits quoted previews only. Save actual playable ingredients, voice auditions and render budget for the second authenticated review. Reread video_read; require current script_approved/ingredients_approved, tokens/revision and budget. Honor Stop.

## Produce, assemble and deliver

When parts fit the requested actions, save the kit block and follow video_make after ingredient approval. Otherwise require execution.local on the customer's verified shell, never a cloud/API/worker/coworker sandbox. Report progress per paid piece and every 15 minutes.
Review the first actual take and riskiest product action before batching; queued is not accepted. Submit clip_check. Exclude failed/incomplete clips after bounded redo; continue independent work. Save full prompts/settings and exact source-byte clip reviews as custom production.
Use the harness source-linked assembly_timeline. Keep native picture/audio ranges and speed together; measure accepted speech. No detached voice retiming, clause padding, hidden action crops or music merely to satisfy loudness. Track intentional pauses, real soundtrack cues, aspect and product continuity. Edits invalidate affected evidence.
Watch the exact final at normal speed with actual listening, then targeted native-rate lips/actions and joins. Save quality_report.content_review with final SHA-256, timeline revision, returned creative_contract_revision, identified reviewer, capabilities, full coverage and per-dimension findings. Measurements, ASR and an average score cannot certify content. Incomplete review or serious defects block delivery.
Direct builds also need the stored rebuild recipe (references/recipe-format.md). Complete with the confirmed same-project H.264/AAC MP4 URL and real quality evidence; report complete again while server checks run. Kit uploads also require exact-final content evidence; follow the saved review-request, supply the reviewed record and resume the same cached run. Pin only the checked complete version and read final/manifest back. Repairs reuse accepted assets and renew changed approvals/budget.

Use plain words. Never invent claims, approvals, assets or passing checks.
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
