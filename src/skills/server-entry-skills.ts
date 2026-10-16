// Server-backed entry snapshots for the CLI. Custom production guidance includes
// the quality release below and the current in-chat approval backport.
// Regenerate committed skills from these snapshots; do not edit their output.
//
// Source: gooseworks-app akhil/vq-wp7a2-custom-kit-handoff @ 036fa8393
//   apps/api/src/services/playbooks/entry-skill.ts      buildVideoEntrySkill(slug)
//   apps/api/src/app-mcp-server/lib/video-policy.ts     renderEntrySkillRules(product)
//
// Approval fragments: gooseworks-app PR #2047, captured 2026-10-14.
// goose-video 4.5.0 (custom-first: a found or supplied reference ad by default) is copied whole from
// gooseworks-app akhil/custom-first-default @ b229eec47 (PR athina-ai/gooseworks-app#2076), rules block included (rulebook 1.5.1).
// make-custom-video 3.8.0 (custom-first: video_references find and pick when no reference is given; price check and
// Standard/Best prices included) is copied whole from gooseworks-app akhil/custom-first-default @ 50472f801 (PR #2076).
// Custom review wording keeps approvals in this chat.
// Other entries and rule blocks retain the earlier source above.
// Video entries combine the recorded server snapshots above. The rules blocks are
// the rulebook's entry-skill rules for the skills the CLI writes itself
// (gooseworks, goose-ads, goose-product-photos), so no skill restates a rule
// by hand. tests/skills/server-entry-skills.test.ts checks this file against
// tests/fixtures/server-entry-skills.json, and that fixture against a
// gooseworks-app checkout when GOOSEWORKS_APP_DIR points at one.

/** The rulebook version of the unchanged shared rules snapshot. */
export const SERVER_RULEBOOK_VERSION = '1.3.2';

export const SERVER_VIDEO_ENTRY_SKILLS = {
  'goose-video': `---
name: goose-video
description: "Make a video ad in this chat from a real reference ad, found or theirs; styles are the fallback. Follow every answer's next_step."
version: 4.5.0
---

# GooseWorks video

From an installed entry, first catalog_fetch type skill goose-video on this same connection and follow that body. An entry already fetched in this run needs no repeat fetch.

For a video already started, call video_read and follow its next_step.

New videos default to a real reference ad remade for the brand (custom); ready-made styles are the fallback. Start with get_started (wants video, request). A card is not a pick or proof of viewing.

1. The request. If they haven't said what the video is about, ask in one short question.
2. The brand. Ask which brand only when brand_read lists several; with one, use it.
3. The product. Named or none wanted: find its id with brand_read (sections: products), or use []. Otherwise the product card asks: say one line and wait. Without cards, ask which product by name; use the only one, or go on with none. Never ask again after a pick.
4. Research. Read the kit, learnings and selected products with brand_read, then knowledge_search. Verify product size/use from facts and size-reference photos; resolve essential unknowns before planning. Note what to say and avoid.
5. The reference. Their own video ad: video_create with style custom, request, products, its reference_url and a new UUID idempotency_key, then the custom rule. Otherwise, custom asked or not, video_references (action find) with the request and products ([] for none); it's free and reuses the brand's saved list unless they want new ideas (fresh: true). Show it as the answer says; they pick.
6. The pick. video_references (action pick) with candidate_id, request, products and a new UUID idempotency_key starts the custom video. Then the custom rule.
7. Styles, only if no found ad fits or they ask for a style or template: video_formats with the request and products; they pick. Card on screen: one line and wait; else print its table as it is. Then video_create with that style and the products.

## A supplied video reference comes first

Watch the whole video with sound before choosing a style or writing a custom plan, or use the server's measured reference profile. URLs, titles, thumbnails and frames are not viewing. Log the hook, scene order, pace, speech, framing, product interactions, text and ending with timestamps and gaps. Unreadable essentials need an accessible video or their brief-only choice; never claim a viewing.
Styles vs a reference: fetch plausible templates and compare plan_note, scenes, duration, cast, sound and assets; titles and rankings prove no fit.
Custom route (a picked or supplied reference, or explicit custom): catalog_fetch type skill make-custom-video on this connection before a project write and follow it: full harness, current schemas, two authenticated approvals, cumulative budgets, verified execution. Keep their mechanics and assets. If anything is unavailable, say so and keep the brief; never run a template's renderer as custom, import the reference as a finished video, use retired actions or switch environments. Fetching a skill proves no execution capability.

## Rules

- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except a video's make command when a next_step gives it; its last line says who starts it, and where this app does, never show it to them (original videos follow their own). Never give any other command, sign-in step or setting, and never ask them a technical question.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; never decide it for them, and pass on a yes only once they gave it to that total.
- If you can run commands on the customer's computer, ask for the yes with the answer's own question: it says the video is then made on their computer, so that one yes covers starting it.
- A yes is to the credit total the customer was shown: their press on the plan card, or their yes in chat sent with that total.
- Every video approval, including a higher price or a priced fix, can happen in this chat. Show the plan and its price here when no card is visible; cards and websites are optional for approval.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
`,
  'make-custom-video': `---
name: make-custom-video
description: "Create a custom video with sourced product accuracy, explicit sound routing and exact-final audiovisual review."
version: 3.8.0
requires_skills: [video-production-harness]
harness_binding: gooseworks/video-actions/v1
---

# Human version

The owner approves the script, then the actual ingredients and budget, in this chat; cards and Studio are optional. Production keeps the reference's format, the product and the sound. GooseWorks measures and judges the final itself.

---

# Agent version

## Non-negotiables

1. Watch every reference end to end with sound, or use the server's measured reference profile, and save the evidence before any script.
2. Write the script with write-video-ad-script (catalog_fetch it; scripts without it are refused).
3. Keep the reference's format: people stay people, demos stay demos, sound type stays. Otherwise list the change in changes_from_reference.
4. The voice is the master clock. Never cut or retime sound apart from a talking face.
5. Always real sound. No silent or tone tracks unless the owner asked for silence.
6. Show the product correctly, at real size, from real photos.
7. The review is listened or measured, never claimed.
8. Under a deadline, deliver fewer correct videos. Never downgrade a format.

Read one file per call; if output says truncated, re-read in parts. Fetch make-custom-video on this connection and read live schemas before writes. Keep this environment; no retired actions or reference-as-final import.

## Load and resume

Fetch the complete video-production-harness with catalog_fetch delivery archive; read SKILL.md and its phase references and keep version/contentHash/files. Mixed or incomplete packages block work. Resume recorded jobs with video_read; never resend a batch instead of polling.
Custom skips the style picker. With a supplied reference, create once with style custom, its reference_url and a UUID idempotency_key reused on retries. Without one, run video_references find with the request and products and show the list; the owner's pick goes to video_references pick, which creates the project. Never use a template's demo as the reference. Keep requested mechanics, assets, products and campaign. Resume the same project, plan_revision, approvals and production_manifest.

## Reference, product and creative contract

Read brand_read and knowledge_search. Source product geometry, colour, label, allowed use and scale; size-sensitive shots need dimensions or a known-scale photo. Never guess capacity or invent a real process.
Save reference_observation bound to media_id/media_revision with duration, full coverage, audio_perception (listened, or measured from the server's sound profile), motion_perception and timed picture/audio findings. Skipping a reference needs the owner's brief-only user_quote.
Save draft.creative_contract: speech_mode, soundtrack_modes, required_features, reference_map per scene (beat/action/proof/sound), sourced product_grounding, voice_plan and changes_from_reference. Native speech keeps source audio; external speech over a speaking face needs exact-audio lip sync. No detected words never authorizes mute.
Default capture: a phone, deep focus, a lived-in room, no retouching. People come from create-creator-takes-h3's make_character.py; real people and products use gpt-image-2 edit, packaging from the real photo.

## Save and review twice

video_change needs expected_revision and the current brand_context_digest; never author server context. Price paid requests free and read-only with data_price_provider (up to 20 per call; follow any price_unknown entry's next_step first). Save the shot_list with the script so the server prices Standard and Best, and put picture-upgrade money (about two pictures at high) in render_estimate.upgrade_allowance; it pays for no clip.
Show the full saved script, then the actual playable ingredients and exact cumulative budget, here. At the script, show both approval_quote.tier_quotes totals as given, with no math of your own, and let the owner pick. Seedance is in neither total: offer each seedance_addons price, and only the owner's yes adds it. After the owner's explicit yes, call video_approve with the custom phase, review_token and total_credits from custom_review.approval_quote (with their quality_tier and its total when there are two), expected_revision and their words as user_quote. Never infer consent or approve yourself. Honor Stop.

## Produce, assemble and deliver

With fitting parts, save the kit block and follow video_make after ingredient approval; otherwise run on the customer's verified shell, never a cloud sandbox. Report progress per paid piece.
Review the first take and the riskiest product action before batching. Send every clip to clip_check; the final may use only checked bytes. Save full prompts/settings and source-byte clip reviews as custom production.
Build the source-linked assembly_timeline: native picture and audio ranges stay together, pauses and freezes are declared, real soundtrack cues. Edits invalidate affected evidence.
Review the exact final at normal speed: listen, or rely on the server's final_measure and frame judge (measured). Save quality_report.content_review with final SHA-256, timeline and creative_contract revisions, reviewer, capabilities, full coverage and per-dimension findings. Serious defects block delivery.
Direct builds also need the stored rebuild recipe (references/recipe-format.md). Complete with the confirmed same-project H.264/AAC MP4 URL and report complete again while server checks run. Kit uploads follow the saved review request. Pin only the checked version.

Use plain words and returned credits. Never invent claims, approvals, assets or passing checks.
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
