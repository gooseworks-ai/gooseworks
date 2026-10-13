---
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

Require complete video-production-harness content/scripts/files/version/contentHash. An inline read lists it by slug only, so get it with catalog_fetch delivery archive (making needs that shell anyway), unpack it and read each file. Read its orchestrator, phases and editorial/specialist guides. Save safe paths separately with hashes/dependencies. Incomplete/mixed packages block work. Resume recorded packages, inputs and jobs.

## Keep the brief and study the reference

Explicit custom skips video_formats and the picker. Keep requested mechanics/assets; animated text and product photos must not become a creator montage. Implicit references use goose-video to watch and compare template constraints; custom follows no match or their choice.
Read brand_read (kit, products, rules), then knowledge_search. Use supported claims, real photos/logo. Watch playback, or timed frames spanning the video plus audio/transcript. Record hook, scene order, pace, framing, dialogue, text, product interactions and ending with times/gaps. URLs/thumbnails are not viewing. Missing access needs an accessible source or explicit brief-only choice.
Start from the nearest template's plan. Before writing scenes, call catalog_fetch (type template) for the style closest to the brief and reuse its scene count, pacing, shot list and timeline as your skeleton; change only what the brief needs. Never run a template's renderer or its unchanged style and call the result custom. If the customer gave no reference video, use the nearest template's demo video (its media_url) as reference_url when you create the custom video, so it is watched like any reference.

## Create or resume

New: video_create with brand_id, style custom, request and a required agent-generated UUID idempotency_key; retain products, name, reference_url and campaign. Reuse that key on retries. Resume with video_read the same project: retain plan_revision, custom_review, brand_context, production_manifest and execution; never create a replacement.
Reference resolve accepts direct files; social links cause no automatic paid lookup. If GooseWorks can't download it, upload the file you watched into this project (media_upload scope video_project, media_confirm), wait for media_analyze read to show its duration, then video_change custom reference attach with asset_id and its current_revision as analysis_revision; each refusal names the condition to fix. Skip needs explicit brief-only user_quote. Pending/failed reference blocks approval; a URL is not viewing.
A resolved reference also needs draft.reference_observation: the project's reference source_url, real duration_s, evidence_mode playback or frames_and_audio, observed_through_s covering 95%, and summary: what happens with times and gaps, as text or a list of {t, what}. Its data binds the script token. Resolve/attach is not watching.

## Save script and ingredients

Follow the harness phases. Discover specialists for the actual scenes; check inputs, outputs, dependencies and managed execution. Reuse suitable product photos and deterministic text animation. Bind operations to this project and approved scene/script revisions.
video_change needs expected_revision (plan_revision), custom draft and optional script. Bind brand_context_digest to the returned bundle; never author server context. Keep packages outside the review payload. Quote paid operations: send the exact paid request with estimate_only=1; it returns the credits that request will book, free. Save preview_estimate/render_estimate for the work still to buy; the server adds committed_credits. Put one redo per generated scene, at that scene's clip price, in render_estimate.reroll_allowance (part of its total; none on a kit draft). Never edit a field the owner approved: the save sets their approval aside until the approved text is back. Missing price/unsupported inputs blocks production; no guessed rates/direct keys.

## Two authenticated owner reviews

Show the complete saved script and exact cumulative budget on the authenticated review card. Only the owner's actual signed button press approves. Chat yes, OAuth, user_quote, widget origin or a copied token is not proof; never manufacture a click or self-approve. Text-only/large reviews use returned authenticated Studio phase buttons and approval_surface URL.
Reread video_read after owner actions. Script approval permits quoted previews only. Save the actual storyboard, playable ingredients and render budget; ingredient approval permits clips. Require current script_approved/ingredients_approved, matching tokens/revision and budget. Changed reviews need renewed approval. A prior yes does not authorize changed work.

## Execute, check and deliver

If the nearest template's parts and frames can make every scene, save the kit block the harness describes in the ingredients draft. After the owner's ingredient approval the kit makes the video: follow the next_step video_make returns and run the make command it gives. Otherwise build it yourself: require execution.local from a verified customer shell (no cloud, API host, worker or coworker sandbox), or report the gap.
When you build it, video_make needs expected_revision and custom render state. Resume the same render with approved tokens; report running/failed/complete honestly and honor Stop. While making it, report running with a short progress_note after every paid piece and at least every 15 minutes. After each generated clip, upload it and send video_change custom clip_check {scene, url}, then read clip_checks with video_read; on suggest_kill redo that clip once with reroll_scene=<scene> on the paid call and check it again; if it still fails, tell the customer in one line and continue. Save actual prompts, settings, every scene and clip checks through video_change custom production. Watch the full output against the approved script, product and brand; save its full quality report. Export an MP4 (H.264 + AAC). When you report complete, GooseWorks checks the file itself; if it says the video is still being checked, wait a minute and report complete again; if it refuses, fix what it names. Complete with output_url set to the output_url media_confirm returned for the final; completion also needs the rebuild recipe here. Pin only the checked complete render. Read back manifest/final before delivery. Repairs need affected assets only and renewed approvals/budget.

Rebuild recipe: every input the build reads, uploaded here or a linked Library original, plus recipe/source.json; prove a clean-folder rebuild, then save it as custom production source. The harness's references/recipe-format.md gives the format; its scripts/pack_recipe.py writes it and scripts/check_recipe.py proves it. After a recipe fix, upload it again and send only custom production_source.

Use plain words and returned credits. No invented claims, approvals, assets or passing checks.
