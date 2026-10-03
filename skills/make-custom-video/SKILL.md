---
name: make-custom-video
slug: make-custom-video
description: Connect the shared video production harness to GooseWorks projects, script and ingredient approvals, managed media generation, budgets and final delivery. Use for original briefs, Instagram/video references and resumed custom projects.
category: ads
version: 2.0.0
author: GooseWorks
requires_skills: [video-production-harness]
harness_binding: gooseworks/v2
---

# Human version

This adapter connects the production playbook to GooseWorks. Customers review their script, actual ingredients and budget in Studio. The agent continues in the same conversation and saves the checked final video to the project.

---

# Agent version

## How to talk to the customer (applies to every message you send them)

The customer is a marketer or founder, not an engineer. Everything in this skill about tools,
fields, files, polling, models and pipeline steps is for YOU. Never pass it on to them.

- **Say what they get and what they need to decide, never how it's made.**
  Bad: "Checking the media-proxy helpers for voiceover timestamps and lipsync." / "Generated with
  gpt-image-2 at high quality, mouth closed, passes QC."
  Good: "Recording the voices now." / "Here are your two hosts."
- **Never mention** tool, file or field names, ids, JSON, commands, scripts, installed software,
  uploads, model or vendor names, timings in seconds or frames, retries, polling, internal statuses
  or your own quality checks. Fix what you can quietly. If they ask how something works, explain it
  simply.
- **Update them only at milestones they care about**: choices confirmed, script and voices done,
  visuals done, ready to review, finished. One short line each, then stay quiet until the next
  milestone. No update for setup, downloads, uploads or saving.
- **Money is in credits, with a number**: "the full video uses about N credits". Never "the cheap
  pieces" or "the expensive render".
- **Problems:** say what it means for them and what they can do, in one or two sentences. No error
  codes or stack traces. Only raise a problem that changes something for them.
- **Use their words**: script, voice, hook, scene, host, ending, logo, the product shot.
- **No filler**: no "Great question!", "Certainly!", "I hope this helps!", no restating what they
  just said at length.

Example. Instead of a dozen lines about render tools, scripts, uploads and portraits, send:
"Got it: warm tone, home podcast studio, Brielle as the skeptic and Mark as the believer." then
"Script and voices are done (about 34 seconds)." then "Ready for you to review: the script, voices,
both hosts and the ending. You can also review your recipe ingredients in the app: <link>. Say go
here and I'll make the full video (about N credits)."

## Keep the selected connection for the whole run

Call `account_whoami` on the connection that owns the brand/project before the first write.
Keep `environment.name` and the public `environment.api_origin` with this run. Respect the
user's selected production or staging connection. If multiple connections are available and
none was selected, resolve that once. Missing or unknown identity is uncertainty, not
permission to switch. Never infer the environment from credits, billing links or Node mode.

Reads, project creation, uploads, generation, polling and final updates all use that same
connection. If a production request fails, resume or report the failure on production;
never retry it on staging or recreate the project there. Before retrying a timed-out write,
read back the existing project or paid request on the selected connection.

Local/CLI proxy origin must match `environment.api_origin`. If it differs, use the MCP
relay on the selected connection (`GW_MEDIA_VIA=mcp`) before paid calls. Do not change
credentials or API origins to recover a failed write. An explicit user-requested move is
a separate operation, with the existing project and paid requests reconciled first.

## Check assets for the selected format before spending

For a template, read its structured `asset_readiness` from
`video_catalog_list { kind: "formats", brand_id }`. `missing` names gaps;
`needs_review` means suitability is unverified, including older recipes without
structured requirements. `ready` describes assets only, not script or budget approval.
For a custom video, derive requirements from its actual approved scenes.

Inspect candidate files for the chosen product and format. A catalog photo can contain
multiple objects, other products or a person; its existence or approved status does not
make it a standalone image of the selected product. Check object count, framing, readable
print and real image bytes. A service conversation has no automatic packshot requirement.

Reuse a suitable approved image first. A free crop or cutout is a new file: keep the
original, inspect the result and include it in the normal ingredient review. When no
usable input exists, explain the gap before generation. Estimate any paid preparation
separately before spending. Record the selected asset and inspection in the project
review set; do not add a separate approval round.

## Make Custom Video

The generic production phases run in the Growth sandbox or a connected agent with a shell. GooseWorks owns the project, approvals, budget, uploads and final selection. This adapter replaces Studio desktop files and Tauri approval events with the product contract below.

## Check the connected tool contract first

Inspect the tool parameters exposed by the selected connection before creating or changing a custom project. catalog_fetch returns skill packages, not tool schemas. Use the host's registered tool definitions (MCP tools/list when available); do not assume that fetching a newer skill updates a connector's saved schema.

video_project_upsert must expose custom_mode and idempotency_key for creation, reference_url when a reference is requested, and patch.script.expected_plan_revision for review saves. Before later writes, check that the connected tool exposes every field required by that action, including production clip checks and final quality evidence. If a required field is missing, stop before project writes or paid calls and report that the connected tools and custom-video skill are out of sync. Keep any proposed script in chat and label it as an unsaved, unapproved proposal. Do not drop required fields, switch environments, import the reference as a finished file, or create an HTML review page to work around the mismatch.

The environment owner must confirm the app-MCP service rollout and refresh the connector's discovered tool schemas. Resume only when the required parameters are visible on the same selected connection. The Studio creative page remains the human review surface. Custom generation requires separate authenticated script and ingredient approvals; template skills' one-approval instructions and generic chat examples do not replace either custom gate.

## Load the shared production harness first

This entry contains only the GooseWorks connection. Production sequencing, creative craft, reviews and repair loops are maintained in video-production-harness, published from the existing Studio harness. Do not invent a shorter local workflow.

For a new run, use the video-production-harness dependency returned by catalog_fetch or fetch_skill. If absent, fetch catalog_fetch {type:"skill",slug:"video-production-harness"}; CLI users can use gooseworks fetch video-production-harness. Require nonempty content, scripts, files, version and contentHash. If unavailable, stop before generation; never fall back to a vendored playbook.

Read the returned content, orchestrator.md, capabilities.md and every detailed step invoked by the orchestrator. Materialize every returned script and file at its package-relative path in a run-specific video-production-harness folder. scripts are relative to its scripts directory; files are relative to the package root. Reject paths outside the package. Save the exact bundle only in the run's persistent workspace. Store only {slug,version,content_hash,package_path} as script_drafts.harness in the saved project; never inline the package content, files or scripts into the review draft. The review payload must stay below its 256,000-character limit. Keep the saved package in this run's durable folder, not a shared mutable installation.

On resume, read video_project_read and use the saved package matching script_drafts.harness.content_hash. Do not refetch latest or overwrite this run's package. If the package is missing, stop and restore that version before continuing; fetching today's release does not restore it. New projects load the current catalog release. This is an agent-held saved package, not a server-enforced immutable registry.

## GooseWorks capability binding

Read capabilities.md to bind shared instructions. GooseWorks is authoritative for project state and approvals; local working artifacts grant no spending permission.

- Brand facts and product assets: brand_get_context plus the saved brief/reference analysis.
- Durable state, concept/design/script/scene/continuity records and feedback: video_project_read and video_project_upsert. Save shared artifact roles in script_drafts extra fields and production metadata; translate spoken lines, captions and scenes into the review schema below.
- Human gates: discuss free creative choices in chat. Persist concept/design/script before authenticated script approval. Selected storyboard, playable voice auditions, characters, worlds and end card become actual ingredients. Stop for authenticated ingredient approval before any paid clip or preview video. A chat reply, local artifact or shared auto mode cannot replace either token. Changes require renewed approval.
- Provider access, bounded pricing and spend: managed fal/ElevenLabs tools and currently supported endpoints only. Do not switch to direct provider keys, Higgsfield or an unpriced fallback. A missing capability blocks its state until a supported equivalent is reviewed and quoted.
- Storage: media_upload and media_confirm with exact project ownership; use durable previews in ingredients.
- Assembly, probes, frame extraction, transcript comparison and continuous inspection: shared package scripts, FFmpeg/FFprobe/Python and available media review tools. A thumbnail or text description cannot satisfy video review.
- Render attempts, QC, history and promotion: video_render_run and video_project_upsert using the backend contract below. Shared QC still applies; the backend checklist is a minimum.

Growth and connected coding agents supply local execution. A terminal-free MCP client can prepare/review with connected tools, but must stop or continue through the project's Growth session when required local capabilities are absent. Never claim a render ran without execution.

## Start and resume

After the connected tool contract passes the checks above, for a new brief call video_project_upsert with brand_id, name, format:"custom", custom_mode:"generate", brief:{prompt, audience, objective, product_name, cta, ratio, duration_seconds}, optional reference_url and a stable idempotency_key. Use only brief fields present in the schema. Instagram references have a metered public-data lookup; direct files are downloaded, probed and stored. generated_video_url and media_id mean finished-file imports, never references. Do not use import mode to bypass a generation project's review gates.

Read video_project_read on every resume. Its project and custom_review are authoritative. Growth creates and retains origin_session_id from trusted chat context. The Studio creative page is the human review surface. Continue in Growth resumes that conversation. A connected agent can present the same app_url and poll for approvals; it cannot fabricate them using patch.approve/user_quote.

If reference preparation failed, explain custom_review.reference.error. Continue from the brief if requested, or retry with patch:{retry_reference:true}. A live preparation claim is protected for twenty minutes; after interruption an explicit retry reuses a saved resolved URL when possible. Never invent a reference analysis when no reference was viewed.

## Saved review schema

Save through video_project_upsert {brand_id,project_id,patch:{script:{script_drafts,script,expected_plan_revision}}}. script_drafts contains format:"custom", title, duration_target_sec (<=180), aspect_ratio, scenes:[{scene:1,time:"0–5s",text,caption,direction}], preview_estimate:{total_credits,basis,operations:["Describe each priced operation as a string"]}, optional render_estimate in the same shape, voices:{narrator:{voice_id,name}} and ingredients:[{container,label,subtitle,url,text,note,pending}]. Use numeric scene IDs consistently. The plain script is joined spoken copy. Read project.plan_revision and pass it as expected_plan_revision on every existing-draft save; a stale write is refused. Store concept, reference_analysis, continuity, planned operations and job/asset provenance as extra draft fields; keep the review set under 256 KB.

Each estimate requires total_credits (a nonnegative number, at most 3,000), basis (a nonempty string) and operations (1–100 nonempty strings, each at most 500 characters). Do not put operation objects in either estimate. Keep detailed model/settings/cost rows in a separate extra field such as planned_operations. voices is an optional object keyed by role, never an array; each selected role is {voice_id, name?}. Keep unselected audition candidates in a separate extra field. Copy actual catalog voice IDs into the selected roles; every selected role later needs a matching playable voice ingredient.

For example, a narrator selection is voices:{narrator:{voice_id:"<actual catalog ID>",name:"<catalog name>"}}. A preview estimate is preview_estimate:{total_credits:100,basis:"One presenter image and two voice auditions",operations:["Presenter image: fixed-price supported model","Two voice auditions: the saved script"]}. These values illustrate the shape; quote the actual supported operations for the run.

Before script approval, only plan/save free text. preview_estimate quotes future storyboard images and voice auditions. custom_review.script_approved permits priced image previews on supported fal image endpoints and ElevenLabs text-to-speech auditions. Unknown endpoints require ingredient approval. Use catalog voice previews when possible; do not silently select a paid model outside the preview allowlist.

Upload actual previews with media_upload/media_confirm. Put public/durable URLs on image/avatar/background/endcard/voice/audio/video ingredients. Text containers can carry inline text; a voice or image description cannot replace its preview. Save a render_estimate for remaining clips/assembly and show the complete ingredients. Stop until custom_review.ingredients_approved. Script and ingredient tokens are independent; do not infer approval from project.status.

## Paid execution and resume

Every managed media call carries project_id (GW_PROJECT_ID in scripts) and a stable input fingerprint. Use the managed fal/ElevenLabs endpoints and credentials supplied by Growth; never request customer provider keys. Do not expose those credentials in logs. Recheck custom_review before dispatch. The backend reserves estimated outstanding costs atomically, enforces the approved total (maximum3,000 credits) and prevents duplicate submissions. At most a20% overrun can be newly approved; this is not automatic permission to spend above the customer's selected limit.

Preview eligibility and price support are separate checks. Use an exact endpoint in the backend preview allowlist and confirm its current request schema and fixed per-image/megapixel price. For an original presenter image, prefer supported fal-ai/flux/dev or fal-ai/flux/schnell when suitable. A model-family label such as gpt-image-1 does not authorize a different /text-to-image or edit route: the official gpt-image-1/text-to-image path is not a script-preview endpoint in the current backend. Mixed token/GPU pricing is refused even when a family appears in the allowlist. Do not try an unpriced endpoint or move a preview to the ingredient phase to bypass the script gate. A400 model/path failure costs no authorized job; unknown pricing/model support must be resolved before spending. Final clip models require ingredient approval. Existing-job polls remain permitted after edits; retrieval does not authorize new media.

Save provider request IDs and actual uploaded URLs promptly. Custom operations with known rejection can retry safely; ambiguous timeouts keep their authorization until reconciled. Media spend is metered through the shared gateway. Custom videos have no extra template base render fee. Imported finished files still file for zero credits.

## Clips, assembly and quality

Fetch the supported model/provider skill when needed. Keep anchors and exact lines fixed. Use the Python assembly helper returned in the shared harness scripts for actual existing clips. It needs only Python, FFmpeg and FFprobe; it does not call a provider or require Chromium. Inspect generated clips before assembly, and watch the final export after assembly/captions.

Open a render with video_render_run {brand_id,project_id,kind:"full"}; executor:"cloud_agent" for Growth when exposed by the current schema. Report live workflow_stage/progress_note/progress_percent while producing it. Upload the final file to scope:"video_project", scope_id:project_id. The tool opens/reports a client-executed render; fixed server orders remain paused.

Save patch.production with version:1, pipeline:[{step,model,settings}], style, characters, scenes:[{id,line,still_prompt,motion_prompt,duration_s}], voice/music/assembly, fixes and clips:[{scene,url,checks:[{check,status,note}]}]. Each clip must include exactly these five named checks: visual_artifacts, brand, product, voice_and_script, duration_and_ratio. All must pass. Reuse the same numeric scene as script_drafts.scenes.

Complete with video_render_run {brand_id,project_id,render:{render_id,status:"complete",output_url,quality_status:"passed",quality_report:{version:1,summary,checks:{source,brand,product,hook_and_scene_order,voice_and_script,captions,endcard_and_cta,duration_and_ratio,visual_artifacts},detected_issues:[],repair_actions:[],checked_at}}}. Each final check is {status:"pass"|"fail"|"not_applicable",note}; brand/product/scene order/duration/visual artifacts must pass. Save a failed candidate as blocked/failed with its issue, not complete. Final completion binds approval revisions, output and quality evidence to the render; pin with patch.final_render_id only after passing.

## Feedback and delivery

Studio saves script/ingredient/video feedback before continuation and invalidates the affected approvals. Read custom_review.feedback on every turn. Replace only the affected assets; save revised estimates and stop for renewed approval. Deliver the playable current_render_url with render_artifact kind:"video" in Growth, show the Studio app_url and actual project spend. Keep final history; never create another project just because an agent restarted.

## Reviewed snapshot, voices and supported pricing

custom_review returns script_drafts and plan_revision from the same saved snapshot as its tokens. Studio renders that snapshot and uses the revision for edits. Spoken copy (text) and on-screen copy (caption) are separate fields. Voice audition ingredients carry role and voice_id; script_drafts.voices maps each role to its selected voice_id/name. Every selected role needs an actual matching playable preview before approval.

A pending/processing/failed reference blocks script approval. The human can explicitly choose Continue from brief without reference in Studio; this saves skipped and fences the older worker. Do not silently replace a requested reference with brief-only production.

Custom provider submits require a conservative request-price bound, including quantity and supported dimensions/audio. Unknown/token/GPU pricing and unsupported parameter combinations are refused before dispatch; choose a supported fixed per-image/megapixel or fixed per-second text/image-to-video model and update the quote. Motion-control and source-duration video routes are refused until the source duration can be bounded reliably. A conservative reservation is released to actual charged spend when the provider result settles. Final output must be a confirmed, stored video_asset in this exact organization/project, and completion binds its media_id to the render. External hotlinks cannot be pinned as generated custom finals. The portable helper checks FFmpeg's libass capability before local captions, rejects clips shorter than their timeline and validates video-stream duration.
