---
name: make-custom-video
slug: make-custom-video
description: Connect the shared video production harness to GooseWorks projects, script and ingredient approvals, managed media generation, budgets and final delivery. Use for original briefs, Instagram/video references and resumed custom projects.
category: ads
version: 2.4.0
author: GooseWorks
requires_skills: [video-production-harness]
harness_binding: gooseworks/v2
---

# Human version

This adapter connects the production playbook and specialist skill catalog to GooseWorks. It matches each scene to existing creator, footage, graphics, audio and review tools. Customers review and approve their script, actual ingredients and budget in the same chat. Studio is an optional review surface. The agent saves the checked final video to the same project.

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

## No GooseWorks tools in this session? Call them through the CLI

The GooseWorks tools named here (for example `account_whoami`, `brand_onboarding`,
`brand_read`) normally come from the GooseWorks connector. If they are not registered in this
session but you have a shell with the `gooseworks` CLI signed in (a cloud sandbox such as
ChatGPT agent, Meta AI or Grok), call the same tool from the shell:

```bash
npx gooseworks tool <name> '<arguments as a JSON object>'
```

- Run `npx gooseworks tool --list` once first. It prints the server's rules for using the tools
  and every tool name; `npx gooseworks tool <name> --schema` shows one tool's arguments.
- The result prints as JSON. When a tool answers with a one-line summary, the fields you act on
  (such as `next_step` and ids) follow under "Data:". It exits 1 when the tool reports an error.
- Nothing renders as a widget here, so tell the user the result in plain words.
- The same rules apply as over the connector: state the credit total and get the user's yes
  before paid work.
- If it says you are not logged in, run `npx gooseworks login --device --no-wait`, show the
  user the link and code it prints, and run `npx gooseworks login --device` once they approve.

When the tools are registered in this session, call them directly instead.

## Prepare the video workflow and brand before creative work

**Installed entry files are bootstrap instructions.** For new work started from an installed
file or an old chat, fetch `catalog_fetch { type: "skill", slug: "make-custom-video" }` on the selected
connection and read its returned content and dependencies before continuing. Use the already
fetched body when this entry came from that connection in this run; do not recursively fetch
the same entry. A CLI freshness warning does not block using the current connected package.
Keep the fetched package and hashes in a new run folder; do not replace edited installed files.
If current instructions cannot be loaded, resolve the connection before format suggestions,
script writing or production. Do not continue from an old installed workflow or session notes.

**Follow the connector's full-guide requirement when available.** Fetch
`catalog_fetch { type: "skill", slug: "gooseworks-guide" }` when the connector requires it.
The only older-server exception is below; it never removes brand preparation or approvals.

| Returned guide/workflow state on the selected connection | Required action |
| --- | --- |
| Guide returns `not_found`, and this same connection already returned the complete current matching video entry with its required dependencies | Continue with that authoritative entry's workflow, full brand preparation and existing approvals. |
| Guide has another error, no response, or incomplete content; or the matching entry/dependencies are missing, incomplete or from another connection | Stop before creative work, project writes or paid calls; resolve a compatible connection on this same environment. |

A missing custom entry or required custom tool/schema remains unavailable: never substitute
a template or an import to bypass it. Never hide other fetch errors or continue from cached
instructions merely because the guide was not found.

**For an existing project or batch, read `video_project_read` first.** Determine its actual
route and saved review state before fetching a recipe or doing local work. Resume an approved
run with its recorded packages, brand inputs, script and ingredients; do not silently replace
them with today's release or brand rules. Follow returned preparation requirements and use
the existing affected review/approval flow for an intentional change. Reads, free drafts,
imports and existing-job retrieval do not grant permission for new paid production.

**For every new plan, resolve the brand and call**
`brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }` **before**
suggesting formats, mining video angles, writing any script, creating a production plan or
handing the work to another agent. Use `brand_get_context` with those same four sections only
when advertised. Reuse a complete read from this run on the same connection and brand.
Onboarding completion, a summary-only response and earlier session notes do not supply the
kit, selected product facts or saved rules. If the full read is unavailable, resolve it before
creative work. Use known kit facts while research is incomplete; do not restart research
solely because its status is pending. Never invent a product fact or accept a campaign to
bypass preparation. Then search the Brand Brain (next section) before suggesting formats,
choosing an angle or asking the user for a brand fact.

Carry that context through custom/template/idea routing and delegation. Before writing, make
the workflow's brand-rules file from those sources: pronunciations, required spoken copy,
prohibited claims, real logo, font, palette and the selected product's supported facts.
Entries prefixed `Video preference:` and visual/pacing instructions are creative direction,
not spoken lines. Use the kit's audience, offer and voice as defaults without an interview.
The rules file mirrors context; it is not proof of a read or permission to spend. Keep the
route's existing script, ingredient and budget approvals, including its allowed previews.

**Use the server's brand bundle when the selected API returns it.** Project create/read may
return top-level
`brand_context`: `{ version: 1, brand_id, digest, loaded_at, sections, brand, kit, products,
learnings }`. Its sections cover summary, kit, products and learnings.

| Returned brand/project response on the selected connection | Required action |
| --- | --- |
| A complete authoritative version-1 `brand_context` is returned | Binding is required: use its contents for the plan/rules and include `script_drafts.brand_context_digest = brand_context.digest` with each new/changed script save. |
| An older API returns the actual four brand sections but no `brand_context` in either the brand read or project response | Prepare from those full sections, write the brand rules and follow the selected connection's existing approval flow and advertised fields. Do not fabricate a receipt or send nonexistent bundle/digest fields. |

An incomplete/malformed bundle or missing brand section is a preparation failure, never the
older-API exception. Once this connection returns an authoritative bundle, use its binding
contract. `script_drafts.video_brand_context` is server-owned: do not author, replace or forge
it, and do not invent a read receipt or hash local brand facts into one. Keep the full bundle
out of client review payloads. If managed generation returns HTTP 409
`video_brand_context_required`, reload the project and bind the plan to its returned bundle
through the normal review flow before retrying. That refusal never permits the older-API
fallback, skipping sections or retrying paid calls blindly. Unchanged approved legacy resumes
retain their package, context and approvals; an upgrade alone needs no extra approval.

**To apply a deliberate brand correction to a new or revised plan**, make a fresh, unfiltered
`brand_read` of those four sections. When it returns the authoritative bundle, use its
returned `brand_context.digest` in the complete revised `script_drafts` through the existing
`video_project_upsert` `patch.script` save; the server verifies the current brand and replaces
its snapshot with the saved plan. On an older API with no bundle contract, apply the actual
four-section correction and save the revised draft through its existing flow without inventing
digest fields. If a connection that already returned a bundle cannot supply the fresh bundle,
resolve that failure before rebinding. Review and approve the affected script, ingredients and
budget through the normal flow. Never refresh an ongoing approved run automatically; its
recorded package and brand inputs stay pinned until an intentional change.

## Search the Brand Brain, then propose — before any creative choice or question

The Brand Kit is a summary. The brand's saved knowledge (its Brain) holds what the Kit does not:
rules from past feedback, approved and rejected creatives, customer evidence, approved claims,
reports and documents. **After `brand_read`, and before you choose an angle, claim, hook,
product emphasis, format or source ad — and before you ask the user for any brand fact — call
`knowledge_search { brand_id, query }`** when it is registered. It is free and read-only: no
approval, no announcement to the customer and no questionnaire.

1. **Search for this task, not the whole Brain.** Run one short query (under 500 characters) in
   the user's own words plus the product (for example "ads for <product>: what worked, what to
   avoid") and one with
   `source_types: ["evidence", "claim", "learning", "creative", "document"]` for proof and past
   creative results. Add a query only for a specific open question. Reuse results from this run.
2. **Keep these states distinct** and record which one each query returned:

| Result | Means | Do |
| --- | --- | --- |
| `status: "ok"` with matches | Saved knowledge exists | Use it; keep each fact's citation in your working brief |
| `status: "empty"` | Nothing saved matches this query | Say "no saved evidence for <topic>", never "the brand has no proof" |
| `refresh_required` | The results shown are current; some changed sources were left out | Use them; search again shortly for anything missing |
| `building` | The index is not ready | Retry once shortly, then continue with the gap stated |
| An error, or the tool is not registered | Retrieval failed or is unavailable | Retry an error once, then continue from `brand_read` and treat evidence as unchecked |
| An empty Kit field | Only that field is blank | Not a search result: still search before asking |

3. **Let the findings change the plan.** A `dont`/`must` learning or a rejected creative rules
   options out; an approved or well-rated past creative is a proven angle to lead with; a report
   shows what worked. Claim-grade proof is a result with `approved_ad_claim: true` or the kit's
   `approvedClaims` within their stated applicability; the kit's `proofPoints` are what the
   backend allows an ad to state, used as written. Other Kit text, documents and performance
   numbers are context, never public claims. Never invent an offer, price or result. Judge
   relevance and skip results about another product or business.
4. **Propose; don't interview.** Lead with one recommended direction (angle, product, source or
   format) and a one-line reason naming what you found, with up to two alternatives. When several
   directions fit (two audiences, products or campaigns), pick the one the evidence favours, such
   as an active campaign or approved past creatives, and name the other as an alternative instead
   of asking. Ask only for a decision the brand read and the search cannot settle, or for spend
   approval. Never ask the user for a fact the Brain already answered.
   Keep directions already chosen (the user's words, a project's creative brief, handed-off
   defaults, approved plans): search only to fill empty fields and to apply saved rules. When a
   returned card or picker presents the choice, your recommendation is its one acknowledgement
   line and the saved plan's defaults, not a separate list.
5. **Carry an evidence brief** into the routed skill, writer or plan: findings with citations,
   the state of each query, what it ruled out and the open gaps. Tell the customer the findings
   in plain words; the citations stay in the brief.

On an approved resume, keep the saved brief and evidence; search again only for a new decision.

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

The generic production phases run in the Growth sandbox or with an agent that can run shell commands on the customer's computer. GooseWorks owns the project, approvals, budget, uploads and final selection. This adapter replaces Studio desktop files and Tauri approval events with the product contract below.

## Execution preflight

Who makes it: if you can run shell commands on the customer's own computer, you execute this custom project there. If you can't, create the project and hand it to the GooseWorks coworker with goose_run_task { brand_id, project_id, message: the customer's words }. Inside the GooseWorks coworker's own sandbox, make it yourself. Decide this yourself; the server needs no flag for it. Missing libass does not remove shell capability: fetch [[composes::caption-burn]], which uses Pillow and FFmpeg overlay. Fetch every selected specialist and the invoked harness step files before declaring a route unavailable.

For MCP-owned runs set GW_MEDIA_VIA=mcp and GW_PROJECT_ID before running any helper, even if CLI credentials exist. Record the selected account_whoami public API origin as GW_EXPECTED_API_ORIGIN; never open credential files to discover it. Use HTTP only after verifying the matching origin through supported CLI diagnostics. For large MCP relay bodies, use the helper's body_file without retyping: upload that JSON file to this same video project, confirm the returned asset, then call data_post_provider with body_asset_id and omit body when the tool advertises that argument. Its normal project, approval, budget and secret checks still apply. Older connectors must relay the exact saved JSON unchanged.

Before taking over a delegated project, cancel its delegate task and read back that it is detached. Do not request another approval while a stale delegate remains attached. If cancellation is unsupported, save the blocker; a Stop followed by reapproval can wake the same delegate again.

After a paid failure, reconcile the known job and actual charges. Stop after the first identical infrastructure failure; a failed coworker turn can still cost credits. Quotes are estimates, not actual spend. Preserve approved copy while changing cost explanations; show actual cumulative charges from the project ledger.

Run helpers from the run's working directory with explicit absolute input/output paths. For footage, save inspected source in/out bounds and fit:width, including screen.fit:width. A planned creator image may be absent during free take planning; use plan_takes --plan-only instead of generating a placeholder.

The writer's paid critic cannot run before custom script approval. Perform its rubric locally before script review and save that evidence. Only run an external critic when the host explicitly supports it in the current approved phase and budget; never bypass a spend gate or silently claim an independent critic ran.

## Check the connected tool contract first

Inspect the tool parameters exposed by the selected connection before creating or changing a custom project. catalog_fetch returns skill packages, not tool schemas. Use the host's registered tool definitions (MCP tools/list when available); do not assume that fetching a newer skill updates a connector's saved schema.

video_project_upsert must expose custom_mode and idempotency_key for creation, reference_url when a reference is requested, and patch.script.expected_plan_revision for review saves. Before approvals, require patch.approve fields user_quote, total_credits, phase and review_token, plus custom_review.approval_quote in video_project_read. Before later writes, check that the connected tool exposes every field required by that action, including production clip checks and final quality evidence. If a required field is missing, stop before project writes or paid calls and report that the connected tools and custom-video skill are out of sync. Keep any proposed script in chat and label it as an unsaved, unapproved proposal. Do not drop required fields, switch environments, import the reference as a finished file, or create an HTML review page to work around the mismatch.

The environment owner must confirm the app-MCP service rollout and refresh the connector's discovered tool schemas. Resume only when the required parameters are visible on the same selected connection. Review and approval stay in the current chat; the Studio creative page is optional. Custom generation requires separate authenticated script and ingredient approvals with their current review tokens and cumulative budgets. Template skills' one-approval instructions do not replace either custom gate. A missing approval field is a tool rollout mismatch, not a reason to require Chrome.

## Match a named format before going custom

Before creating a custom project, when the brief changes, and before any paid preview, check whether the request names or implies a catalog format: street interview / vox pop / man-on-the-street, street testimonial, podcast, iMessage or chat, split-screen creator, screen insert, listicle, and so on. Call video_catalog_list {kind:"formats", brand_id}, then fetch that format's renderer or recipe skill and run its own selector or checks.

For a street interview, fetch render-street-interview, read its street-script-writing guide, write a brief JSON with mode, offering_type (physical, service or digital), interaction_type and participants (people interviewed on screen, not counting the interviewer), and run python3 scripts/prepare_script_context.py --brief <brief.json> --out <context.json>. It exits 2 whenever the status is not ready-for-writing. Its route output is binding: route.support ("render" or "preview-only"), route.person_reference and route.max_participants. A status of unsupported-route lists route_gaps and alternatives; it is a stop, not permission to go custom: show the alternatives and go custom only if the customer picks it.

| Street route | On screen | Person image reference | Status |
| --- | --- | --- | --- |
| render-street-interview product-guess (physical product only) | Interviewer and up to four participants in one take | Forbidden: people are written in the prompt; the only reference is a standalone physical product photo | Renders |
| render-street-interview conversation (mic-only, product-sample, concept-challenge) | Interviewer and one participant | Forbidden: no reference images, no phone, screen or UI | Preview only in this format: script and prompt dry run, no paid render |
| ugc-street-testimonial format | One person, no interviewer | Required: the creator still that format's recipe prescribes | Template format |

If the request fits a route, use that format; a fitting template format is not a custom video. If nothing fits, tell the customer in plain words what is supported and what is preview only, and name the closest supported options (the selector's alternatives) and how each differs. Or propose custom and say why. Go custom only when the customer chooses it. A custom video built on a named format still keeps that format's hard constraints. For a street interview, those are:

- people described in text, never as uploaded person photos;
- one generation per interview take;
- deep focus;
- the first take at 720p;
- every caption and letter drawn locally.

A selector result of needs-reference or unsupported-route, a provisional creative review or an unobserved reference is unresolved. Report it and ask before script approval; never continue past it silently.

## Load the shared production harness first

This entry contains only the GooseWorks connection. Production sequencing, creative craft, reviews and repair loops are maintained in video-production-harness, published from the existing Studio harness. Do not invent a shorter local workflow.

For a new run, use the video-production-harness dependency returned by catalog_fetch or fetch_skill. If absent, fetch catalog_fetch {type:"skill",slug:"video-production-harness"}; CLI users can use gooseworks fetch video-production-harness. Require nonempty content, scripts, files, version and contentHash. Require the returned files references/editorial-review.md, references/specialist-handoff.md and references/hook-compatibility.md as nonempty text too; a coherent older release or version label does not supply missing guides. If unavailable, stop before new creative work, project writes or generation; never fall back to a vendored playbook. An unchanged approved resume keeps its recorded package and approvals.

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
| Street interview, vox pop or man-on-the-street | [[composes::render-street-interview]] | Run its selector first (see "Match a named format before going custom"). Keep its route contract: people in text, one take per interview, 720p first take, local captions, end card and ambience bed. Do not call its one-shot driver or create a second project. |
| A generated person in any still or as a video reference | [[composes::create-creator-takes-h3]] (scripts/make_character.py) | Follow "People in generated images" below. The selected route decides whether a person still is allowed at all. |
| Grounded product edits or scene stills without a person | [[composes::create-image-fal]] or [[composes::create-image-gpt-image-fal]] | Reuse approved product references. Check preview eligibility and bounded pricing for the exact endpoint. |
| Separate narrator or voice audition | [[composes::create-vo-elevenlabs]] | Use the host-approved voice and locked copy. Do not add a second narration over native creator speech. |
| Music bed or song | [[composes::create-music-elevenlabs]] | Include its actual quote in the phase budget; preserve the approved audio strategy and lyric/beat timing. |
| Branded text cards, graphics or end card | [[composes::goose-graphics]] | Start from a fitting layout/style and real logo. It produces graphics; animation still requires an actual local renderer. |
| Narration-led zoom/pan on an existing demo | [[composes::video-polish]] | Use its measured zoom targets only with the installed Remotion/transcription capabilities required by this route. |
| Conventional clip stitching or overlays | [[composes::stitch-videos-ffmpeg]] | Use its local implementation when it fits the edit; the shared harness assembly helper remains available for ordinary concat/mix. |
| Word timing and final caption treatment | [[composes::caption-burn]] | Inspect the actual transcript against locked copy. Caption only after picture and mix polish, then repeat final review. |
| Replace a defective silent B-roll window in a UGC master | [[composes::ugc-fixloop]] | Keep the original continuous dialogue; this repair does not fix a talking shot's lips or voice. |
| Complete-video observation and finished-ad checks | [[composes::watch]] and [[composes::review-finished-ad]] | Supply real frames/audio, brand assets and timestamps. Their results support the shared final QC; they do not grant approval. |

For format-specific motion, chat, podcast, street-interview, product or music layouts, search the catalog for
the matching render-* capability and inspect its config and inputs. Reuse a compatible
renderer or phase implementation without changing the custom project into a fixed template.
Do not call a template's one-shot driver, create a second project, or replace the shared
production sequence just to use one of its helpers. The table is a starting map, not an
exhaustive catalog or a promise that every published skill is executable on this connection.

## People in generated images

Apply this whenever a generated image or video shows a person: creator, presenter, interviewee or any face in focus. Customers reject smooth, airbrushed, AI-looking people and blurred backgrounds.

- The selected route decides first. When it forbids person references (every render-street-interview route), describe people in the video prompt and make no person stills. When it requires a person reference, make it with the builder that route prescribes. The ugc-street-testimonial recipe prescribes its own creator still.
- Otherwise, every generated person comes from create-creator-takes-h3's scripts/make_character.py. Fetch create-creator-takes-h3 and create-image-fal together, because the builder calls create-image-fal's gen_image.py. Pass the customer's six choices (age, gender, ethnicity, hair, wardrobe and scene) and keep its defaults: fal-ai/nano-banana-pro, 4K, phone capture with deep focus, head and upper chest, face filling 45 to 55 percent. Run it with --dry-run --payload-out <file> first: the file holds {model, body}, the exact request. Quote that body through data_post_provider with path set to its model and query:{quote_only:true}, as in "Saved review schema". Once the still is approved and quoted, run make_character.py again without --dry-run and with GW_PROJECT_ID set to this project, so the same body goes through the managed proxy.
- Never hand-write a person prompt, fill the generic avatar template by hand, or use fal-ai/flux/dev, fal-ai/flux/schnell or another Flux route for a face. A hand-written generic prompt is not a substitute for the builder. If the builder's request cannot be quoted, report a pricing blocker.
- Never send a generated photoreal person still as a reference image to bytedance/seedance-2.0/reference-to-video; its likeness gate refuses uploaded images of people. For an exact-script creator from an approved still, use create-creator-takes-h3's takes.
- Before showing ingredients, crop each face, enlarge it 2× and look. Fix it or report it when skin is waxy or glossy, pores are missing, the background is blurred or bokeh, hands or lettering are garbled, or the face is under about 300 px tall. Show the customer only stills that pass.

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

## Carry the sourced brief and verify the handoff

Before script writing, save the writer's documented creative-brief.json from the current brand/product evidence (the Brain search's evidence brief: cited findings, the state of each query and open gaps) and project directions. Include exact product/variant, buyer situation, supported mechanism/claims, offer/CTA, constraints, delivery intent, locked copy, applicable prior decisions and explicit unknowns with source references. Before using the writer, run its free python3 <saved-writer-package>/scripts/verify_handoff.py --package-dir <saved-writer-package> --out working/script/writer-handoff-check.json check against the actual fetched prepare/lint scripts and retain the result and script hashes. A missing checker, failed check or unsupported --brief command blocks the required writer route before saving or approving a new plan; keep any chat proposal unsaved and unapproved until the compatible package is available on this same connection. Do not remove the brief, strict check or requires_creative_brief requirement to run an older parser. Use the fetched write-video-ad-script preparation command with --brief working/script/creative-brief.json and its documented bank/brand/product/template arguments; set the new shape.requires_creative_brief to true. The writer and critic consume that same angle-context. Save only the concise brief/revision and workspace reference in script_drafts extra fields, never full research/package contents. A missing required brief fails the script check; do not rerun known research or rewrite user-locked wording silently.

Read references/specialist-handoff.md from the saved shared harness. For each selected UGC, product/demo or motion operation, extend the existing script_drafts.capability_plan entry with the exact approved brief/script revisions, mapped scene/beat numbers and timing, selected product/reference/source IDs and excerpt ranges, audio/performance choice, package/version/hash and expected returned artifact roles. These are existing extra draft/project artifacts, not new API parameters. Preserve the distinction between numeric script_drafts.scenes[].scene and string production scene IDs.

Check the actual returned package before executing: H3 plan_takes uses beats id/start/end/vo and character image/identity/environment/delivery; footage-cutlist uses sources and per-beat source/in/out/fit/why; goose-graphics returns static composition/PNG and still needs an actual motion renderer. Do not replace an unsupported helper with a guessed tool name. Preflight the real binary/import/browser and a free dry run, not just its presence. Existing-file skip behavior is not validity: probe saved media and verify fingerprints/approval/job results first, then reuse approved media on resume without new generation.

Validate returned media and provenance against the handoff before clip checks/assembly: exact scene/source revision, words/product/variant, visible proof, measured duration/ratio, selected voice/native speech and neighboring continuity. All speech requires actual isolated performance listening and full mixed-output listening; transcript/word timing only supports that judgment. Audition representative unresolved material and reuse valid approved takes. No mandatory faster delivery or louder climax.

## Hook changes and editorial review

Read references/hook-compatibility.md and references/editorial-review.md from this run's saved harness. Resolve the exact watched source/render and classify same-promise hook versus a new promise requiring different body/proof/payoff. Every changed opening gets new image/action/audio/text review, including visual-only restyles with unchanged words. Shortlist cheap ideas before media spend; keep a broader recut distinct from an isolated opening test.

For an isolated hook replacement, fetch the existing render-hook-replacement package and inspect its real preflight/config contract. A not-found/empty catalog response blocks that route before paid generation; an open source change is not proof of served availability. Preserve source/body/ending using its own verification, then play/listen to the complete candidates and register each separately. Recommendations are creative judgments, never unmeasured performance winners.

Run rough/fine/final review questions through the current Studio surfaces. First save what the actual cut communicates, then compare with the brief; concept review has no watched-cut verdict. Route unsupported promise to script/concept, missing proof to production, sequence problems to edit and local defects to repair. Unavailable required playback/listening is incomplete and cannot become quality_status passed.

Keep exact feedback text/source/time, intended effect and acceptance condition. Consolidate duplicate notes and record conflicting intentions plus the authorized owner's decision. Preserve changed versus verified dispositions in existing feedback/production metadata or linked project artifacts; executing a fix does not resolve it. Invalidate only affected script/assets/timings/captions/mix/approvals/derivatives, retain valid unrelated work, and rewatch each actual delivered file. Preserve editable timeline, stems, caption sources, selected/candidate versions, rejected options with reasons and scoped pronunciation/delivery history for the next run. Approval and model scores are not audience performance.

## GooseWorks capability binding

Read capabilities.md to bind shared instructions. GooseWorks is authoritative for project state and approvals; local working artifacts grant no spending permission.

- Brand facts and product assets: brand_get_context plus the saved brief/reference analysis.
- Durable state, concept/design/script/scene/continuity records and feedback: video_project_read and video_project_upsert. Save shared artifact roles in script_drafts extra fields and production metadata; translate spoken lines, captions and scenes into the review schema below.
- Human gates: discuss free creative choices in chat. Persist concept/design/script before authenticated script approval. Selected storyboard, playable voice auditions, characters, worlds and end card become actual ingredients. Stop for authenticated ingredient approval before any paid clip or preview video. Record the customer's explicit chat approval through patch.approve with the current phase, review token and cumulative budget; a reply alone, local artifact or shared auto mode does not record approval. A handed-off coworker cannot approve its own work. Changes require renewed approval.
- Provider access, bounded pricing and spend: managed fal/ElevenLabs tools and currently supported endpoints only. Do not switch to direct provider keys, Higgsfield or an unpriced fallback. A missing capability blocks its state until a supported equivalent is reviewed and quoted.
- Storage: media_upload and media_confirm with exact project ownership; use durable previews in ingredients.
- Assembly, probes, frame extraction, transcript comparison and continuous inspection: shared package scripts, FFmpeg/FFprobe/Python and available media review tools. A thumbnail or text description cannot satisfy video review.
- Render attempts, QC, history and promotion: video_render_run and video_project_upsert using the backend contract below. Shared QC still applies; the backend checklist is a minimum.

Growth and connected coding agents supply local execution. A terminal-free MCP client can prepare/review with connected tools, but must stop or continue through the project's Growth session when required local capabilities are absent. Never claim a render ran without execution.

## Start and resume

After the connected tool contract passes the checks above, for a new brief call video_project_upsert with brand_id, name, format:"custom", custom_mode:"generate", brief:{prompt, audience, objective, product_name, cta, ratio, duration_seconds}, optional reference_url and a stable idempotency_key. Use only brief fields present in the schema. Instagram references have a metered public-data lookup; direct files are downloaded, probed and stored. generated_video_url and media_id mean finished-file imports, never references. Do not use import mode to bypass a generation project's review gates.

Read video_project_read on every resume. When it returns remix.direction for this generated custom project, use remix.direction.implementation as the production starting point: keep the pipeline, full prompts and guards, timings, assembly settings and fixes. Watch the reference. Rewrite all spoken lines and bind products, claims, images and CTA to the target brand. Stay on this same custom project; obtain fresh approvals for its own script/ingredients and budget before any paid call. A source approval or source voice recording never authorizes this new run.

Read video_project_read on every resume. Its project and custom_review are authoritative. Growth creates and retains origin_session_id from trusted chat context. Show the saved review in this conversation and record the customer's explicit approval through the authenticated customer-facing connection as described below. Studio remains available when the customer wants it; never require Chrome to approve. Continue in Growth resumes the bound conversation. A handed-off production coworker prepares the review, ends its turn and waits for the customer-facing connection to record approval before it resumes the same project.

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

## Record each approval in this chat

There are two independent gates. Script approval permits the quoted image/voice previews. Ingredient approval permits the quoted clips and finishing work after the actual review set is ready. Keep both gates even when the customer prefers chat to Studio.

1. Read video_project_read. Show the current saved script or actual playable ingredients, the changes since any previous approval and the cumulative credit limit in custom_review.approval_quote. Explain that the limit includes custom_review.committed_credits plus the remaining quoted operations. An old estimate, approval from a previous revision or remaining-only amount is not the current budget.
2. Ask for the customer's explicit approval of that phase and amount in this conversation. Copy their actual words as user_quote; never invent consent or interpret a pricing-error complaint as approval of a changed creative plan or larger budget.
3. Read video_project_read again before recording the yes. Require the same review token, phase and total shown to the customer. If any changed, show the changed review and ask for approval of it; never silently attach the earlier yes to a newer token or amount.
4. Through the authenticated customer-facing connection call video_project_upsert {brand_id,project_id,patch:{approve:{user_quote:"<the customer's actual words>",phase:custom_review.approval_quote.phase,review_token:custom_review.approval_quote.review_token,total_credits:custom_review.approval_quote.total_credits}}}. This is the custom contract; template approvals without phase and review_token cannot authorize custom production. Do not combine this approval with a script edit.
5. Read back custom_review. For phase:"script", require script_approved:true and the matching script_token. For phase:"ingredients", require ingredients_approved:true and the matching ingredient_token. Check the approved max_credits covers the current cumulative total before dispatch. A tool error or merely sending patch.approve is not approval.

The approval_quote.phase is "script" or "ingredients". Its review_token is the matching custom_review.script_token or custom_review.ingredient_token from that saved snapshot. If approval_quote is missing or the requested phase's review is not ready, finish the free preparation or resolve the returned blocker; never guess a token, reuse the other phase's token or change the budget to force approval.

Only the authenticated customer-facing connection can record the customer's approval. A handed-off coworker with a production task prepares and displays the review, ends its turn, and waits. It cannot call patch.approve to approve its own work, forward a fabricated user_quote or treat the original brief as approval. After the customer-facing connection records and verifies approval, resume that same task/project with goose_run_task when required. Studio can record the same authenticated approvals if the customer chooses it; do not require Chrome, browser unlocks or Studio access just to approve in chat.

## Paid execution and resume

Every managed media call carries project_id (GW_PROJECT_ID in scripts) and a stable input fingerprint. Use the managed fal/ElevenLabs endpoints and credentials supplied by Growth; never request customer provider keys. Do not expose those credentials in logs. Recheck custom_review before dispatch. The backend reserves estimated outstanding costs atomically, enforces the approved total (maximum 3,000 credits) and prevents duplicate submissions. At most a 20% overrun can be newly approved; this is not automatic permission to spend above the customer's selected limit. A custom video's budget grows only through a renewed approval. On SPEND_CAP_REACHED the open render is asked to stop: report it "stopped" with what was kept (see "Render run states") and tell the customer what was made and spent. Then save a revised estimate, show the new custom_review.approval_quote with its current total, record the customer's approval of that total, and open a new render that reuses the saved pieces.

Preview eligibility and price support are separate checks. Use an exact endpoint permitted by the backend preview policy and confirm its current request schema and server quote. Model discovery and provider pricing can change: use the selected connection's actual quote, including supported provider estimates, instead of a skill-maintained priced-model list. A model-family name does not make every route eligible for script previews. Do not move a preview to another phase to bypass its approval gate. If pricing cannot be established, keep the saved request and report a system pricing blocker; do not ask the customer to choose when their choices are already approved. Final clip models require ingredient approval. Existing-job polls remain permitted after edits; retrieval does not authorize new media.

Save provider request IDs and actual uploaded URLs promptly. Custom operations with known rejection can retry safely; ambiguous timeouts keep their authorization until reconciled. Media spend is metered through the shared gateway. Custom videos have no extra template base render fee. Imported finished files still file for zero credits.

## Clips, assembly and quality

Use the selected packages in script_drafts.capability_plan for each scene and operation. Recheck specialist discovery for new requirements or repairs before improvising a helper. Keep anchors and exact lines fixed. Use the Python assembly helper returned in the shared harness scripts for actual existing clips. It needs only Python, FFmpeg and FFprobe; it does not call a provider or require Chromium. Inspect generated clips before assembly, and watch the final export after assembly/captions.

Open a render with video_render_run {brand_id,project_id,kind:"full"}; executor:"cloud_agent" for Growth when exposed by the current schema. Report live workflow_stage/progress_note/progress_percent while producing it. Upload the final file to scope:"video_project", scope_id:project_id. The tool opens/reports a client-executed render; fixed server orders remain paused.

### Render run states

Report the open render's state with video_render_run {brand_id,project_id,render:{render_id,...}}. Use the row that matches:

| Situation | status | workflow_stage | quality_status | Also send |
| --- | --- | --- | --- | --- |
| Producing, checking or repairing | "running" | preparing, rendering, checking, repairing or rechecking | "pending" | progress_note, progress_percent, steps |
| Waiting for the customer: they must approve a candidate, choose or give feedback, with or without an uploaded candidate | "running" | "blocked" | "blocked" | output_url when an uploaded candidate exists, error_message saying in plain words what you need from them, and choices (at most 4 buttons; put credits on any paid choice). A quality_report is optional while waiting; when sent, it carries the current findings |
| Stop requested: a progress callback returned stop:true because the customer stopped the video or a paid step hit the spending limit | "stopped" | omit | omit | progress_note saying in plain words what was kept. Start no new paid step; let a call already running finish. |
| Real failure: no usable candidate can be produced (provider refusal with no approved alternative, or a system blocker you cannot recover) | "failed" | omit (the server sets blocked) | "blocked" | error_message in plain words |
| Done | "complete" | omit (the server sets ready) | "passed" | output_url and the full quality_report, only after the final recipe is saved and read back as described below |

Waiting for the customer is not a failure, and neither is a stop. Never report "failed" because you are waiting for approval, a choice or feedback, or because the customer or the spending limit stopped the video. When stop:true comes with stop_reason "superseded", report nothing further on that render. The app shows a waiting render's candidate as "Needs your approval" and keeps it for up to 14 days; after that the server ends it as failed with failure_code review_expired. The uploaded file stays in the project either way.

A waiting state is valid only while the approval it rests on is current. A render can complete only under the approval it was opened with. After any script or ingredient edit (yours or the customer's), or after review_expired, the old render cannot be completed: read video_project_read {brand_id,project_id,include:["assets","renders"]}, show the changed review and the current custom_review.approval_quote in chat, record the customer's approval of each phase it asks for, then open a new render. Opening a new render stops the older open render of this video with stop_reason "superseded" ("Replaced by a newer version."). Report nothing more on a superseded render and start no paid step for it; continue on the new one. To deliver an unchanged candidate on the new render, follow "Finalize an existing candidate after re-approval" below.

When the customer approves a waiting candidate and nothing in the review changed, finish the shared final review and complete that same render; a candidate needs no separate approval phase. When they ask for changes, save the feedback and follow the normal edit and approval gates.

On resume, treat a render left at "running" with workflow_stage "blocked" as a pending customer decision. Read custom_review and custom_review.feedback before doing anything else. If your own render shows stop_reason "superseded", another run replaced it: read video_project_read {brand_id,project_id,include:["assets","renders"]} and continue on the newer render; do not open another one just to resume.

After each accepted generation or deterministic edit, update patch.production with the steps and settings that actually ran. Save and read back the actual candidate recipe before showing its preview or pausing for review, so an interrupted or waiting run does not leave only an early plan in the backend. Partial progress is allowed; pending creative approval or QC must stay explicit and must never be converted into passing clip evidence.

Before completing or pinning a candidate, replace the early planning manifest with the actual production recipe. Record every current script scene using its string scene number, exact current spoken line, measured duration and full generation prompts or deterministic rendering instructions. Record the actual pipeline/model settings, assembly/captions/audio settings, and repairs in fixes. Never leave blocked/pending planning statuses in a completed recipe. Preserve full prompts and guards; do not reduce them to summaries. Save partial progress while working, but an unfinished recipe is not a reusable final.

Save the final recipe through patch.production, then read video_project_read and compare production_manifest with what you just saved, including all scene IDs and spoken lines. If the save fails or the read-back is stale/incomplete, repair it before completion; do not describe the run as finished or remixable. Final completion freezes the actual recipe and reviewed script together for the next agent.

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

Complete with video_render_run {brand_id,project_id,render:{render_id,status:"complete",output_url,quality_status:"passed",quality_report:{version:1,summary,checks:{source,brand,product,hook_and_scene_order,voice_and_script,captions,endcard_and_cta,duration_and_ratio,visual_artifacts},detected_issues:[],repair_actions:[],checked_at}}}. Each final check is {status:"pass"|"fail"|"not_applicable",note}; brand/product/scene order/duration/visual artifacts must pass. A candidate that fails QC is never complete: keep it "running" with workflow_stage "repairing" while you fix it, report the waiting state above when the customer must decide, and use "failed" only for a real failure. Final completion binds approval revisions, output and quality evidence to the render; pin with patch.final_render_id only after passing.

All nine named final checks above are required, including source, voice_and_script, captions and endcard_and_cta when they are not applicable. A final check uses status:"pass"|"fail"|"not_applicable" and an optional note. The five mandatory passing checks are brand, product, hook_and_scene_order, duration_and_ratio and visual_artifacts; no final check may fail and detected_issues must be empty to complete. Record why a permitted check is not_applicable. Keep actual repair_actions and use the actual ISO 8601 checked_at time. The backend report is a minimum; it does not replace the full shared watch, claim verification or craft review.

This waiting-for-the-customer report illustrates every required field. Replace the URL, reason, choices, findings and example timestamp with actual evidence. Only after repairs and the shared final review pass may the render be reported complete with quality_status:"passed", its confirmed output_url and no unresolved issues.

```json
{
  "render": {
    "render_id": "<existing render ID>",
    "status": "running",
    "workflow_stage": "blocked",
    "quality_status": "blocked",
    "output_url": "https://example.com/confirmed-candidate-in-this-project.mp4",
    "error_message": "<what you need from the customer, in plain words>",
    "choices": [
      {
        "label": "Approve this version",
        "message": "I approve this version"
      },
      {
        "label": "Change something",
        "message": "I want to change something in this version"
      }
    ],
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

### Finalize an existing candidate after re-approval

Use this when an uploaded candidate (a confirmed video in this project) already shows and says exactly what the current script says, but its render can no longer complete: the script was amended to match the take, or the wait ended as review_expired. If any spoken line, caption, scene or ingredient differs from the current script, this route does not apply: repair or regenerate under the normal gates.

1. If the script changed, save it and record the customer's script approval first, as in "Record each approval in this chat". Then save the candidate as a video ingredient (its confirmed URL) in the review set, show the candidate and the current custom_review.approval_quote in chat, and record the ingredient approval. The earlier render was approved against the old review, and the server will not complete it.
2. Open a new render with video_render_run {brand_id,project_id,kind:"full"}. Start no provider call. The older waiting render stops as superseded.
3. Run the shared final review on the existing file against the current script. voice_and_script and captions must match the current lines.
4. Save and read back the final production recipe with the current lines and one checked clip per scene, as described in "Clips, assembly and quality". Reuse the clip records from the candidate's saved recipe, updated to the current lines.
5. Complete the new render with status:"complete", output_url set to the existing candidate's confirmed URL, quality_status:"passed" and the full quality_report. Do not regenerate or re-upload. No credits are spent.
6. Pin it with video_project_upsert patch.final_render_id (alias set_final_render).

## Feedback and delivery

Save customer script/ingredient/video feedback through the connected project tools before continuation; affected creative edits invalidate their approvals. Read custom_review.feedback on every turn, preserving the original watched render/time and text when provided. A selected final change never relocates an earlier note. Resolve only after the candidate satisfies the original intended effect and full-output recheck; keep incomplete or conflicting notes open. Replace only the affected assets; save revised estimates and show the changed review and cumulative budget in the same chat before recording renewed approval. Deliver the playable current_render_url with render_artifact kind:"video" in Growth and actual project spend. Include the Studio app_url when a text host or the customer needs it; do not require it for approval. Keep final history; never create another project just because an agent restarted.

## Reviewed snapshot, voices and supported pricing

custom_review returns script_drafts and plan_revision from the same saved snapshot as its tokens. Show that snapshot in chat; Studio can also render it. Use the revision for edits and the current approval_quote for each approval. Spoken copy (text) and on-screen copy (caption) are separate fields. Voice audition ingredients carry role and voice_id; script_drafts.voices maps each role to its selected voice_id/name. Every selected role needs an actual matching playable preview before approval.

A pending/processing/failed reference blocks script approval. If the customer explicitly chooses to continue from the brief without the reference, save that choice through the connected reference-review tool when exposed, or offer Studio's Continue from brief action when needed. This is a reference decision, not a requirement to approve in Chrome. Do not silently replace a requested reference with brief-only production.

Custom provider submits require a positive server quote, including quantity, supported dimensions/audio and any provider estimate. The server must establish source duration for audio/video-driven routes from authorized media metadata or a bounded probe; do not add invented duration fields to the provider body to force a quote. A provider estimate permits production within the approved budget even when exact final billing is unavailable. Missing source duration or an unavailable provider estimate is a system blocker to resolve on the saved project, not a model allowlist or a new creative choice. A conservative reservation is released to actual charged spend when the provider result settles. Final output must be a confirmed, stored video_asset in this exact organization/project, and completion binds its media_id to the render. External hotlinks cannot be pinned as generated custom finals. The portable helper checks FFmpeg's libass capability before local captions, rejects clips shorter than their timeline and validates video-stream duration.

## Use uploaded footage

When the customer asks to use existing footage, check the actual advertised schemas. Use `media_search` with purpose `production`, kind `video`, the brand and current project when needed. Omit query spend for free retrieval. Read facts/scenes with `media_analyze`, then use `media_excerpt` action `inspect` to review actual bounded frames and timed transcript before selecting. A description or thumbnail URL alone is not visual review.

Freeze `source_excerpt:{asset_id,analysis_revision,scene_id,start_ms,end_ms,audio_mode}`. Revision is the original-byte SHA, scene may be null for a known user trim, bounds use integer milliseconds, and audio is original or muted. Call `media_excerpt` action `attach` with that exact selection and a stable idempotency key. The returned project remains unfinished and unapproved. Open its existing Studio review; preserve user locks and requested format, and keep footage separate from image packshot indexes. An incompatible format requires an explicit choice before changing it.

For custom production, fetch the current shared `video-production-harness` and follow script/ingredient gates. Download the verified original and trim its exact selected window at normal speed with the approved audio. Recheck current revision and production permission before consumption and final upload/completion. Save excerpt lineage in plan and ingredient readback. Missing optional semantics does not require another upload; known user-selected stored footage remains usable. Research and competitor references never become production footage. Selected originals require no paid generation; only newly generated/replaced ingredients consume the approved budget.
