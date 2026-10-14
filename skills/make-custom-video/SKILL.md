---
name: make-custom-video
description: "Make a custom video from its brief and studied reference, with authenticated script and ingredient reviews."
version: 3.5.3
requires_skills: [video-production-harness]
harness_binding: gooseworks/video-actions/v1
---

# Human version

Approve the script, then actual storyboard/ingredients and budget in this chat. Both reviews are required; cards and Studio are optional.

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

## Two owner reviews

Show the full saved script or actual playable ingredients and exact cumulative budget here. After the owner's explicit yes, call video_approve with custom phase, review_token and total_credits from custom_review.approval_quote, expected_revision from custom_review.plan_revision, and their words as user_quote. Never infer consent or approve yourself. Cards and Studio are optional.
Reread video_read after owner actions. Script approval permits quoted previews only. Save the actual storyboard, playable ingredients and render budget; ingredient approval permits clips. Require current script_approved/ingredients_approved, matching tokens/revision and budget. Changed reviews need renewed approval. A prior yes does not authorize changed work.

## Execute, check and deliver

When the nearest template's parts fit every scene, save the harness's kit block in the ingredients draft; after ingredient approval, follow video_make's next_step (the kit makes, checks and finishes the video; send no render state), then read the final back with video_read. Otherwise require execution.local from a verified customer shell (no cloud, API host, worker or coworker sandbox), or report the gap.
When you build it yourself, video_make needs expected_revision and custom render state. Resume the same render with approved tokens; report running/failed/complete honestly and honor Stop. Report running with a progress_note after each paid piece and at least every 15 minutes. Send each generated clip to custom clip_check and redo a failed one once inside the allowance (harness clip step). Save actual prompts, settings, every scene and clip checks through video_change custom production. Watch the full output against the approved script, product and brand; save its full quality report. Export an MP4 (H.264 + AAC) and complete with output_url set to the output_url media_confirm returned for it; GooseWorks checks the file, so report complete again while it says still checking. Pin only the checked complete render. Read back manifest/final before delivery. Repairs need affected assets only and renewed approvals/budget.

When you build it yourself, completion also needs the rebuild recipe saved as custom production source: the harness's references/recipe-format.md and the next_step give the steps.

Use plain words and returned credits. No invented claims, approvals, assets or passing checks.
