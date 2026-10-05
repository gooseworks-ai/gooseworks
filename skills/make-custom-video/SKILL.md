---
name: make-custom-video
slug: make-custom-video
description: Connect the shared video production harness to GooseWorks projects, script and ingredient approvals, managed media generation, budgets and final delivery. Use for original briefs, Instagram/video references and resumed custom projects.
category: ads
version: 2.1.0
author: GooseWorks
requires_skills: [video-production-harness]
harness_binding: gooseworks/v2
---

# Human version

This adapter connects the production playbook and specialist skill catalog to GooseWorks. It matches each scene to existing creator, footage, graphics, audio and review tools. Customers review their script, actual ingredients and budget in Studio; the agent saves the checked final video to the same project.

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

## Use current instructions for new work

Before a new task in a terminal host, run `gooseworks skills status` once. It compares the
installed entry files, running CLI and published npm release. An older CLI needs a package
upgrade before `gooseworks update`; update alone only uses that CLI's bundled instructions.
Preserve local edits or unknown install provenance. Review/back up before explicitly replacing
modified files; never quietly reinstall over them. If the release check is unavailable, report
that freshness is unknown rather than claiming the local copy is latest.

For a new recipe run, fetch its package from the connected catalog. Retain the returned
`version` / `contentHash` and every dependency's hash with the saved package. When reusing a
saved fetch JSON, `gooseworks fetch <slug> --saved-package <file>` returns the current package
and a hash comparison without changing that file. With MCP, if the advertised `catalog_fetch`
schema accepts them, send `saved_content_hash` and `saved_dependency_hashes`; otherwise fetch
normally and compare the returned hashes yourself. Missing hashes mean unknown, not current.
The server cannot inspect a client's saved files; hash metadata does not certify later edits.
Fetch current packages into a new run directory and report stale saved instructions. Preserve
an existing approved run's recorded package; changing that harness requires a reviewed change
and approval before spending. Hosted installed snapshots use the existing Skills Update action.
Skill content and a host's cached MCP tool schemas are separate: refreshing one does not refresh
the other. Check the actual advertised tools before using new fields.

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

## Discover specialists for the actual scenes

Custom means composing available capabilities around the brief. Before the design/tool plan,
match each scene and finishing step to the current skill catalog. Repeat this check when a
new requirement or repair appears, before writing a helper or making a provider call. The
shared harness owns the sequence; specialist skills supply implementations inside its phases.

Use the known routes below as starting points. Fetch the relevant skill, read its instructions
and failure modes, and inspect its returned scripts/files/dependencies before choosing it.
For an unmatched need, use the advertised catalog_search {type:"skill",query:"<capability>"},
or search_skills on a connection exposing that alias; CLI: gooseworks search "<capability>".
Use short separate queries such as "creator", "footage", "motion" or "captions": search words
are ANDed. Do not restrict discovery to category "ads"; video helpers also live under
"general" and "content". Follow returned pagination when relevant results are not on the
first page. Fetch by returned slug with catalog_fetch {type:"skill",slug:"<slug>"}, fetch_skill,
or gooseworks fetch <slug>. Inspect the selected connection's advertised schemas first.

| Scene or operation | Specialist to fetch | How it fits custom production |
| --- | --- | --- |
| Evidence-backed hook, script or script rewrite | [[composes::write-video-ad-script]] | Supply the actual custom scene/tool plan and brand evidence in place of a fixed template recipe. Keep the harness script review and lock. |
| Generated creator saying an exact script across takes | [[composes::create-creator-takes-h3]] | Plan on line boundaries, preserve approved face/room/dialogue, review the first take alone and carry its native voice to later takes. |
| Real product footage, screen recordings or screenshots | [[composes::footage-cutlist]] | Inspect source windows, map each proof shot to its line, review the cut list and render the product layer. |
| Creator beside, over or between product footage | [[composes::compose-creator-layer]] | Combine the inspected creator track and product layer per beat. Preserve the creator's dialogue as the master audio. |
| Native multi-cut performance or general generated B-roll | [[composes::create-video-seedance-2-fal]] or [[composes::create-video-fal]] | Choose from the actual supported endpoint/schema and quoted operations; use H3 when a continuous exact-script creator track is the better fit. |
| Character anchors, grounded product edits or scene stills | [[composes::create-image-fal]] or [[composes::create-image-gpt-image-fal]] | Reuse approved identity and real product references. Check preview eligibility and bounded pricing for the exact endpoint. |
| Separate narrator or voice audition | [[composes::create-vo-elevenlabs]] | Use the host-approved voice and locked copy. Do not add a second narration over native creator speech. |
| Music bed or song | [[composes::create-music-elevenlabs]] | Include its actual quote in the phase budget; preserve the approved audio strategy and lyric/beat timing. |
| Branded text cards, graphics or end card | [[composes::goose-graphics]] | Start from a fitting layout/style and real logo. It produces graphics; animation still requires an actual local renderer. |
| Narration-led zoom/pan on an existing demo | [[composes::video-polish]] | Use its measured zoom targets only with the installed Remotion/transcription capabilities required by this route. |
| Conventional clip stitching or overlays | [[composes::stitch-videos-ffmpeg]] | Use its local implementation when it fits the edit; the shared harness assembly helper remains available for ordinary concat/mix. |
| Word timing and final caption treatment | [[composes::caption-burn]] | Inspect the actual transcript against locked copy. Caption only after picture and mix polish, then repeat final review. |
| Replace a defective silent B-roll window in a UGC master | [[composes::ugc-fixloop]] | Keep the original continuous dialogue; this repair does not fix a talking shot's lips or voice. |
| Complete-video observation and finished-ad checks | [[composes::watch]] and [[composes::review-finished-ad]] | Supply real frames/audio, brand assets and timestamps. Their results support the shared final QC; they do not grant approval. |

For format-specific motion, chat, podcast, product or music layouts, search the catalog for
the matching render-* capability and inspect its config and inputs. Reuse a compatible
renderer or phase implementation without changing the custom project into a fixed template.
Do not call a template's one-shot driver, create a second project, or replace the shared
production sequence just to use one of its helpers. The table is a starting map, not an
exhaustive catalog or a promise that every published skill is executable on this connection.

## Bind and retain the selected specialists

A fetched package proves that instructions exist; it does not prove that its provider,
pricing, dependencies or local renderer are available. Check each selected route before
spending. Materialize all returned scripts, files and dependency packages in separate,
run-specific package folders, preserving relative paths and rejecting paths outside the
package. Do not save several skills into one scripts folder: helpers with the same filename
would overwrite each other. Read the installed media-proxy dependency before running any
paid helper. Every paid submit must propagate this project's project_id / GW_PROJECT_ID
through the managed transport on the selected connection and pass the normal quote and
approval checks. A helper that cannot carry that context is unavailable for paid custom work.
Never run its direct-key path or substitute a guessed endpoint or price.

Use specialist craft and executable helpers inside the corresponding shared phase. This
adapter's project state, supported providers, authenticated script/ingredient gates and
budget override a specialist's legacy setup, dollar estimate or standalone approval flow.
Captions remain last even if a renderer normally burns them earlier: choose its uncaptioned
output or use another compatible implementation. Verify the returned scripts implement any
requested setting; prose alone is not an executable capability.

For H3, the creator still is a script-approved image preview, while the first native-speaking
take is a video and requires ingredient approval and its quoted budget. Review that take's
voice before the remaining takes; do not spend on it as an image/voice audition. Native H3
speech is not a selected ElevenLabs voice: do not invent a voice_id or replace its audio with
separate TTS. Save the actual audio strategy and take/reference provenance in extra draft
fields. Use selected voice roles and playable auditions when the route actually uses them.

Save a compact script_drafts.capability_plan with each selected operation's purpose,
scene numbers (or "final"), skill_slug, version, content_hash, package_path, dependency
identities, inputs, expected outputs and supported execution route. Keep full packages in the
run's durable workspace, outside the 256 KB review payload. On resume, reuse the recorded
packages and existing jobs; do not silently fetch latest over an approved run. A missing
package must be restored, and a changed route/model/input must be quoted and reviewed through
the affected custom gate before spending. If a required capability is unavailable, record
the limitation and propose a supported revision instead of improvising a bypass.

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

Save through video_project_upsert {brand_id,project_id,patch:{script:{script_drafts,script,expected_plan_revision}}}. script_drafts contains format:"custom", title, duration_target_sec (<=180), aspect_ratio, scenes:[{scene:1,time:"0–5s",text,caption,direction}], preview_estimate:{total_credits,basis,operations:["Describe each priced operation as a string"]}, optional render_estimate in the same shape, voices:{narrator:{voice_id,name}} and ingredients:[{container,label,subtitle,url,text,note,pending}]. script_drafts.scenes[].scene is a positive integer such as 1; production scene IDs use the separate string shape described below. The plain script is joined spoken copy. Read project.plan_revision and pass it as expected_plan_revision on every existing-draft save; a stale write is refused. Store concept, reference_analysis, continuity, planned operations and job/asset provenance as extra draft fields; keep the review set under 256 KB.

Each estimate requires total_credits (a nonnegative number, at most 3,000), basis (a nonempty string) and operations (1–100 nonempty strings, each at most 500 characters). Do not put operation objects in either estimate. Keep detailed model/settings/cost rows in a separate extra field such as planned_operations. voices is an optional object keyed by role, never an array; each selected role is {voice_id, name?}. Keep unselected audition candidates in a separate extra field. Copy actual catalog voice IDs into the selected roles; every selected role later needs a matching playable voice ingredient.

For example, a narrator selection is voices:{narrator:{voice_id:"<actual catalog ID>",name:"<catalog name>"}}. A preview estimate is preview_estimate:{total_credits:100,basis:"One presenter image and two voice auditions",operations:["Presenter image: fixed-price supported model","Two voice auditions: the saved script"]}. These values illustrate the shape; quote the actual supported operations for the run.

Before saving either preview_estimate or render_estimate, quote each remaining paid media operation through data_post_provider with its exact supported path, body and project_id plus query:{quote_only:true}. Before sending this flag, read a fresh data_post_provider tool description from the selected connection. It must explicitly advertise query:{quote_only:true}, maximum_credits and no generation, reservation or debit. Alternatively, require explicit environment-owner evidence that this same selected app-MCP runtime has deployed free quote support. An extensible query schema or a newer fetched skill is not evidence. If the description is old and no verified runtime evidence exists, stop before the call and request the backend rollout and connector refresh; an older server can treat this flag as a paid generation request. The quote requires no approval and generates no media. This mode is MCP-only; do not send quote_only to an HTTP generation proxy.

```json
{
  "provider": "fal",
  "path": "fal-ai/kling-video/v3/standard/image-to-video",
  "body": {
    "image_url": "https://example.com/approved-anchor.png",
    "duration": "5",
    "generate_audio": false
  },
  "project_id": "<this project ID>",
  "query": {
    "quote_only": true
  }
}
```

Require quote_only:true, a finite positive maximum_credits and cost.credits:0 in the result. If the server returns a job, audio, a charge or any non-quote result, stop and report the tool/runtime mismatch; never retry it as a quote. Unknown or unbounded prices block planning. Do not substitute public unit prices or guessed billed discounts for maximum_credits: the custom reservation includes conservative quantity, size, audio and preset bounds, while actual settlement can be lower.

Sum maximum_credits for all remaining operations in the phase into that estimate's total_credits, including every concurrently planned job. Keep local free assembly/QC operations at zero. The approved project cap includes custom_review.committed_credits plus the remaining quoted estimate; committed includes both settled spend and outstanding reservations. Read the current review again before approval, avoid counting an already reserved job twice, and quote any changed model/body before seeking revised approval. Quotes are not approval tokens or locked prices; real submission rechecks its current conservative bound and the approved budget.

Before script approval, only plan/save free text. preview_estimate quotes future storyboard images and voice auditions. custom_review.script_approved permits priced image previews on supported fal image endpoints and ElevenLabs text-to-speech auditions. Unknown endpoints require ingredient approval. Use catalog voice previews when possible; do not silently select a paid model outside the preview allowlist.

Upload actual previews with media_upload/media_confirm. Put public/durable URLs on image/avatar/background/endcard/voice/audio/video ingredients. Text containers can carry inline text; a voice or image description cannot replace its preview. Save a render_estimate for remaining clips/assembly and show the complete ingredients. Stop until custom_review.ingredients_approved. Script and ingredient tokens are independent; do not infer approval from project.status.

## Paid execution and resume

Every managed media call carries project_id (GW_PROJECT_ID in scripts) and a stable input fingerprint. Use the managed fal/ElevenLabs endpoints and credentials supplied by Growth; never request customer provider keys. Do not expose those credentials in logs. Recheck custom_review before dispatch. The backend reserves estimated outstanding costs atomically, enforces the approved total (maximum3,000 credits) and prevents duplicate submissions. At most a20% overrun can be newly approved; this is not automatic permission to spend above the customer's selected limit.

Preview eligibility and price support are separate checks. Use an exact endpoint in the backend preview allowlist and confirm its current request schema and fixed per-image/megapixel price. For an original presenter image, prefer supported fal-ai/flux/dev or fal-ai/flux/schnell when suitable. A model-family label such as gpt-image-1 does not authorize a different /text-to-image or edit route: the official gpt-image-1/text-to-image path is not a script-preview endpoint in the current backend. Mixed token/GPU pricing is refused even when a family appears in the allowlist. Do not try an unpriced endpoint or move a preview to the ingredient phase to bypass the script gate. A400 model/path failure costs no authorized job; unknown pricing/model support must be resolved before spending. Final clip models require ingredient approval. Existing-job polls remain permitted after edits; retrieval does not authorize new media.

Save provider request IDs and actual uploaded URLs promptly. Custom operations with known rejection can retry safely; ambiguous timeouts keep their authorization until reconciled. Media spend is metered through the shared gateway. Custom videos have no extra template base render fee. Imported finished files still file for zero credits.

## Clips, assembly and quality

Use the selected packages in script_drafts.capability_plan for each scene and operation. Recheck specialist discovery for new requirements or repairs before improvising a helper. Keep anchors and exact lines fixed. Use the Python assembly helper returned in the shared harness scripts for actual existing clips. It needs only Python, FFmpeg and FFprobe; it does not call a provider or require Chromium. Inspect generated clips before assembly, and watch the final export after assembly/captions.

Open a render with video_render_run {brand_id,project_id,kind:"full"}; executor:"cloud_agent" for Growth when exposed by the current schema. Report live workflow_stage/progress_note/progress_percent while producing it. Upload the final file to scope:"video_project", scope_id:project_id. The tool opens/reports a client-executed render; fixed server orders remain paused.

Save patch.production as a production manifest with version:1 and a nonempty pipeline array. Each pipeline item requires step and model; purpose and settings are optional. production.characters is an optional array, never a record/object: each entry requires both name and prompt strings. Store anchor media IDs, URLs, actual appearance and other extra provenance in script_drafts; character entries accept name and the full design prompt.

production.scenes[].id is a string containing the corresponding script scene number, for example "1". script_drafts.scenes[].scene and production.clips[].scene remain positive integers, for example 1. Map production scene IDs with String(scriptScene.scene); do not convert clip.scene or script scene IDs to strings. Each scene can also carry line, still_prompt, motion_prompt, duration_s and notes. style is an object; voice and music are objects when present; assembly is an object; fixes is an array of {problem,fix}.

Each clip requires a numeric scene, a stored URL and exactly one of each named check: visual_artifacts, brand, product, voice_and_script, duration_and_ratio. Each clip check is {check,status:"pass"|"fail",note?}; not_applicable is not valid for clip checks. Save exactly one checked clip per approved script scene before final completion, with every check passing. Before clips exist, omit clips from an ingredient-preparation save.

The following is a one-scene JSON shape example. Replace all placeholders with actual saved values. Its failed QC statuses are deliberately unapproved; never copy a passing status without performing the shared review.

```json
{
  "patch": {
    "production": {
      "version": 1,
      "pipeline": [
        {
          "step": "Scene clips",
          "model": "<actual supported model>",
          "settings": {}
        }
      ],
      "style": {
        "prompt": "<shared visual direction>",
        "negative": "<shared guards>"
      },
      "characters": [
        {
          "name": "Presenter",
          "prompt": "<exact full character design prompt>"
        }
      ],
      "scenes": [
        {
          "id": "1",
          "line": "<approved spoken line>",
          "still_prompt": "<exact full still prompt>",
          "motion_prompt": "<exact full motion prompt and guards>",
          "duration_s": 5
        }
      ],
      "voice": {
        "voice_id": "<selected catalog voice ID>",
        "name": "<selected voice name>",
        "model": "<actual voice model>",
        "settings": {}
      },
      "assembly": {
        "ratio": "9:16",
        "fps": 30
      },
      "fixes": [],
      "clips": [
        {
          "scene": 1,
          "url": "https://example.com/confirmed-scene-1.mp4",
          "checks": [
            {
              "check": "visual_artifacts",
              "status": "fail",
              "note": "<actual observation; pass only after inspection>"
            },
            {
              "check": "brand",
              "status": "fail",
              "note": "<actual observation; pass only after inspection>"
            },
            {
              "check": "product",
              "status": "fail",
              "note": "<actual observation; pass only after inspection>"
            },
            {
              "check": "voice_and_script",
              "status": "fail",
              "note": "<actual observation; pass only after inspection>"
            },
            {
              "check": "duration_and_ratio",
              "status": "fail",
              "note": "<actual observation; pass only after inspection>"
            }
          ]
        }
      ]
    }
  }
}
```

Complete with video_render_run {brand_id,project_id,render:{render_id,status:"complete",output_url,quality_status:"passed",quality_report:{version:1,summary,checks:{source,brand,product,hook_and_scene_order,voice_and_script,captions,endcard_and_cta,duration_and_ratio,visual_artifacts},detected_issues:[],repair_actions:[],checked_at}}}. Each final check is {status:"pass"|"fail"|"not_applicable",note}; brand/product/scene order/duration/visual artifacts must pass. Save a failed candidate as blocked/failed with its issue, not complete. Final completion binds approval revisions, output and quality evidence to the render; pin with patch.final_render_id only after passing.

All nine named final checks above are required, including source, voice_and_script, captions and endcard_and_cta when they are not applicable. A final check uses status:"pass"|"fail"|"not_applicable" and an optional note. The five mandatory passing checks are brand, product, hook_and_scene_order, duration_and_ratio and visual_artifacts; no final check may fail and detected_issues must be empty to complete. Record why a permitted check is not_applicable. Keep actual repair_actions and use the actual ISO 8601 checked_at time. The backend report is a minimum; it does not replace the full shared watch, claim verification or craft review.

This blocked report illustrates every required field. Replace its findings and example timestamp with actual evidence. Only after repairs and the shared final review pass may the render be reported complete with quality_status:"passed", its confirmed output_url and no unresolved issues.

```json
{
  "render": {
    "render_id": "<existing render ID>",
    "status": "failed",
    "quality_status": "blocked",
    "error_message": "<actual unresolved issue>",
    "quality_report": {
      "version": 1,
      "summary": "<actual full-video review summary>",
      "checks": {
        "source": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "brand": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "product": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "hook_and_scene_order": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "voice_and_script": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "captions": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "endcard_and_cta": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "duration_and_ratio": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        },
        "visual_artifacts": {
          "status": "fail",
          "note": "<actual finding from the shared review>"
        }
      },
      "detected_issues": [
        "<actual unresolved issue>"
      ],
      "repair_actions": [],
      "checked_at": "2026-10-03T00:00:00Z"
    }
  }
}
```

## Feedback and delivery

Studio saves script/ingredient/video feedback before continuation and invalidates the affected approvals. Read custom_review.feedback on every turn. Replace only the affected assets; save revised estimates and stop for renewed approval. Deliver the playable current_render_url with render_artifact kind:"video" in Growth, show the Studio app_url and actual project spend. Keep final history; never create another project just because an agent restarted.

## Reviewed snapshot, voices and supported pricing

custom_review returns script_drafts and plan_revision from the same saved snapshot as its tokens. Studio renders that snapshot and uses the revision for edits. Spoken copy (text) and on-screen copy (caption) are separate fields. Voice audition ingredients carry role and voice_id; script_drafts.voices maps each role to its selected voice_id/name. Every selected role needs an actual matching playable preview before approval.

A pending/processing/failed reference blocks script approval. The human can explicitly choose Continue from brief without reference in Studio; this saves skipped and fences the older worker. Do not silently replace a requested reference with brief-only production.

Custom provider submits require a conservative request-price bound, including quantity and supported dimensions/audio. Unknown/token/GPU pricing and unsupported parameter combinations are refused before dispatch; choose a supported fixed per-image/megapixel or fixed per-second text/image-to-video model and update the quote. Motion-control and source-duration video routes are refused until the source duration can be bounded reliably. A conservative reservation is released to actual charged spend when the provider result settles. Final output must be a confirmed, stored video_asset in this exact organization/project, and completion binds its media_id to the render. External hotlinks cannot be pinned as generated custom finals. The portable helper checks FFmpeg's libass capability before local captions, rejects clips shorter than their timeline and validates video-stream duration.
