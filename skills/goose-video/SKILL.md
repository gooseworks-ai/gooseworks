---
name: goose-video
slug: goose-video
description: >
  Start a video ad in the same chat. Resolve the brand and suggest supported formats with a
  picker or the returned text choices. An agent with a verified shell makes the video with
  goose-video-local; a chat host hands the same project to the GooseWorks coworker. Review
  one complete template plan and total credits before production. Custom videos retain two authenticated review gates in this chat.
category: ads
version: 3.0.1
author: GooseWorks
tags: [gooseworks, ads, video, local-render, coworker, chat]
---

# GooseWorks Video Ads — choose, review, make

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

## Purpose

Resolve the brand, show supported formats and create one saved project. An agent with a verified
shell follows **`goose-video-local`**. A chat host delegates that same project to the GooseWorks
coworker, which renders in its sandbox. This is agent execution, not a recipe server-order API.

**Cards and execution are separate capabilities.** A terminal may render without drawing a
picker; a chat host may draw a picker while the coworker renders. Follow `card.display_hint`
and `available_here`, never a guess from the host's name. Template-remix review stays in this
chat. Custom videos use separate authenticated script and ingredient approvals in this same chat.
Studio is an optional review surface.

## Prepare the video workflow and brand before creative work

**Installed entry files are bootstrap instructions.** For new work started from an installed
file or an old chat, fetch `catalog_fetch { type: "skill", slug: "goose-video" }` on the selected
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
bypass preparation.

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

## Custom videos: route before formats

For an original brief without a reference template, an Instagram reel/post URL or a direct video URL to study, fetch `catalog_fetch { type: "skill", slug: "make-custom-video" }` and follow it in this same session. It creates format:"custom", custom_mode:"generate" with the brief and optional reference_url. Growth executes in its managed sandbox; connected agents use their shell. Script and actual ingredients are reviewed and separately approved in the same chat before paid production; Studio is optional. Do not force a template choice or import the reference as a finished video.

## Route first: is this a new video?

Hand off to **`goose-video-local`** now, and stop following this skill, for:

- an existing **project** id or a **video batch** id;
- the app's copy-for-Claude command (it names `goose-video-local`);
- "remix this video ad template" for a specific app template.

Load the current `goose-video-local` entry with
`catalog_fetch { type: "skill", slug: "goose-video-local" }` on the GooseWorks MCP (older clients:
`fetch_skill("goose-video-local")`), unless already fetched on this connection in this run.
It reads the project first and retains an approved run's recorded recipe packages.

When they ask **what** to make ("give me video ad ideas", "what angles should I use?", "what's
working for my competitors?"), fetch **`ad-angle-miner`** (`catalog_fetch { type: "skill", slug: "ad-angle-miner" }`,
using its advertised tools) and run it with the **video** output. It returns ranked
video ideas mapped to formats and hands the picked ones to `goose-video-local`.

Everything else, including "make me a video ad for <brand>", starts at step 1 below.

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

## Inputs

- A brand, usually named in the request. Resolve it from the accessible brands; one brand needs no question.
- The customer's goal, occasion, audience, selected angle and constraints when supplied; otherwise propose defaults from the verified kit.
- The selected format's required assets. Presence does not prove suitability; uncertain assets remain “needs review.”

## Save durable brand answers, then verify them

Read the selected brand with `brand_read { brand_id, sections: ["summary", "kit", "products", "learnings", "onboarding"] }`
(fallback: `brand_get_context` with the same sections). Keep founder answers, user corrections,
research and your own hypotheses distinct. Reuse matching saved answers; ask only about gaps.

When the user asks to remember a rule, answers a brand interview, or explicitly corrects a
standing fact, save that answer in the same turn. The capture request authorizes those answers;
do not ask for approval again. A direction for this one video stays in its brief. If the scope
is genuinely ambiguous, ask whether it applies to future videos before saving a standing rule.

Use the **live registered schema**. Where supported, call `brand_update` with
`knowledge_intent: "user_correction"` and `user_statement` containing the user's exact,
verbatim answer, not your paraphrase or researched text.
For an inference or suggested improvement, use `knowledge_intent: "agent_proposal"`. Show the
before/after change from your prior read and proposed value; retain the returned proposal IDs
and say the user must accept it in the app. Link only a review surface actually returned by a
tool; the compact `knowledge_updates` response does not itself contain a diff or URL.
A pending proposal is not a saved fact. Never call an unavailable
tool or silently relabel research or your inference as something the user said.

The safe structured shape is `patch: { knowledge: { positioning?, audience?, voice?,
instructions?, brandType?, tagline?, valueProps? } }`, using only fields present in the live
schema. Inferred rules/taste go in an `instructions` proposal with a rationale, never in
`patch.facts`. Prefix every video-only preference in that proposed text with "Video preference:"
so it remains production direction after acceptance. Preserve unrelated instructions when
proposing a merged replacement.

| User answer | Canonical write |
| --- | --- |
| Primary audience, positioning or voice correction | `patch.knowledge: { audience/positioning/voice: <answer> }` (one actual key). During onboarding, `brand_onboarding { action: "review_research", review: { action: "correct", field, value } }` writes these existing corrections with provenance. |
| Founder story, customer pains, objections, buying trigger or useful audience detail without a structured field | `patch.facts: [{ kind: "insight", text }]`; retain attribution such as "Founder reports: …" rather than turn a belief into a verified result. |
| Required wording or pronunciation | `patch.facts: [{ kind: "must", text }]`; pronunciation is exactly `Pronounce "<term>" as "<say_as>"`. |
| Forbidden claim, word or visual | `patch.facts: [{ kind: "dont", text }]`. |
| Durable visual, voice or pacing preference | `patch.facts: [{ kind: "do", text }]` for a preference; `dont` for an avoidance; `template_hint` for a preferred format. Prefix video-only preferences with "Video preference:". |

Facts are existing `ad_brand_learning` rows with user provenance; they are not a second profile.
Update a matching rule by its returned `id` instead of adding duplicates. Preserve unrelated
rules and the user's exact meaning. Only use the legacy facts shape for explicitly user-authored
answers when the live schema lacks intent fields; agent suggestions still need a proposal path.

**Claims and plans have separate gates.** A founder assertion or proof point is not an approved,
evidence-backed claim or consent to quote a customer. Use the existing evidence/claims and
operating-plan tools only if registered, following their proposal, evidence and confirmation
requirements. Never encode a spend cap, approver or emergency stop as a learning. If that write
path is missing, report the specific unsaved item and keep it pending for the supported review
surface; do not claim it was saved or create a parallel local profile.

After every write, **read back before saying saved**: use `brand_read` with `kit`, `learnings`
or `onboarding` as appropriate, or `brand_onboarding { action: "status", brand_id }` after an
onboarding answer. Verify the intended field/rule, its source and the absence of a conflicting
duplicate. A generic success response, pending proposal, ignored key or truncated result is not
proof. Report partial saves honestly. Carry the verified rules into the current task and the
routed skill; claims still pass their own safety gate.

## Video taste — reuse examples and preferences

When asked to capture video taste, or when the user volunteers a durable video preference,
first read the saved learnings and `media_list { brand_id, scope: "brand", scope_id: brand_id,
tags: ["video-taste"], limit: 100 }`. Follow `next_cursor` before deciding an example is absent.
Do not force a taste interview before an unrelated task or ask again for an existing preference.

Save what the user has already supplied first. Then ask only the missing useful question, for
example: "What do you like about this video—its pace, voice, captions, or look?" An inaccessible
link can still be saved as a link with the user's explanation; do not pretend you watched it.

- **Direct clip or video file:** register with `media_upload { brand_id, scope: "brand",
  scope_id: brand_id, kind: "video", source: { type: "url", url }, tags: ["video-taste", "reference-only"],
  metadata: { purpose: "video_taste", source_url: url, provenance: "user", captured_at: <ISO timestamp>,
  preference: <the user's explanation> } }`. For a file use the live file/bytes upload flow and
  `media_confirm` after a presigned upload. Registration of a URL does not copy or inspect it.
- **Instagram/post/page link:** the same registration with `kind: "document"`; it is a link
  bookmark, not downloadable footage or an indexed transcript. Do not fabricate a direct clip URL.
- **Preferences:** save the user's reasons, likes and dislikes through the facts mapping above.
  Read and preserve existing facts before updating one. Do not invent `video_preferences` or
  new `video_lab` keys; the live kit patch accepts only its documented asset fields.
- **Deduplicate:** reuse a matching returned media row, then `media_update` its title/tags/metadata
  if needed; preserve existing metadata and tags. Do not create another row for the same example.
  Read back with `media_list` and `brand_read` learnings before claiming it was saved.
  Check the returned row belongs to this brand: URL deduplication may return another brand's
  existing row. Do not relabel that row or claim success unless the current brand's scoped read
  actually returns it. Report an unsaved association if no supported attach path is available.

Never put third-party taste examples into kit reference images: `kind: "reference"` at brand
scope writes there. The tags and metadata above record purpose and provenance; **they do not
grant or enforce usage rights**. Study the structure, pacing and look only. Never use the example's
footage, face, product, testimonial or claims in a new ad without independently verified permission.

Read video-only entries prefixed `Video preference:` from both saved learnings and
`kit.instructions`, including accepted proposals. Keep them out of required or forbidden
dialogue. Build a brief from the verified readback: preferred pace, voice, caption treatment, visual style,
formats to favour/avoid, reference links and the user's reasons. Say what is still unknown.
Pass it with the brand rules into the existing video workflow. A one-video request overrides a
default for that project; it does not silently rewrite the brand's standing preference.

## Composed Atoms

Use the live canonical schemas: brand_read, brand_create, video_catalog_list,
video_project_upsert, video_project_read, catalog_fetch, goose_run_task and job_cancel.
An old tool name in a recipe is not grounds for terminal-update advice in a chat host.

## Paid media: images, clips, voice

**No FAL_KEY, ElevenLabs key or `fal_client` is ever needed.** Use
`data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">, body: <model input>, project_id }`
then `job_get { job_id }`; voice/music use provider:"elevenlabs". Upload local inputs through
media_upload first. **A missing key is never a blocker.** `photos_generate` is **not** a general
image tool: it photographs physical catalog products only. Use goose-video-local for the
runtime, paid approval, asset saving and quality checks.

## Workflow

### 1. Resolve the brand, quietly when you can

Call brand_read without brand_id to list accessible brands. Resolve the customer's name from
actual returned names. One brand, or exactly one match: state it and continue. Several possible
brands: show names and websites and ask once. No match: show accessible brands and offer to add
one only when the customer asks and supplies its website; never guess the URL.

Read `brand_read { brand_id, sections: ["summary","kit","products","learnings"] }` before
choosing a format. Reconcile explicit brand corrections through the durable capture rules.
A direct video request does not require first-campaign acceptance. Follow any returned
request-specific setup requirement; never mark research complete or accept a campaign to
bypass setup. Keep the original request.

### 2. Keep the goal and propose defaults

Never ask what the ad is for before showing formats. Keep the customer's exact direction.
Otherwise propose defaults from the verified kit's products, audience, offer and voice. Show
those defaults in the saved plan so any can be changed. Never invent proof or product facts.
Idea requests still follow ad-angle-miner with the video output.

### 3. Show the picker or its text fallback

Call `video_catalog_list { kind: "formats", brand_id }`. On the customer's computer, when you
can actually execute shell commands, include `client: { shell: true }`; in a chat host omit
that claim. Inside a coworker sandbox follow its reported capabilities, never claim to be the
customer's computer. Respect requested limit and next_cursor for more item pages; the card may
contain a full picker independently of the item page.

- **card.display_hint:"widget"**: the picker replaces a format table. Write at most one short
  acknowledgement, print no table or list of the formats, and wait for the selection.
- **Otherwise**: print card.text_summary as returned. Without a card, show returned rows with
  names, faithful descriptions, needs and demo links, respecting the requested page size.
  Write "no demo yet" when absent. Never put links only in a question control.
- A format whose card contradicts what they asked for is never Suggested. Never offer
  available_here:false as an executable choice. Relay not_available_here in one short line.
- Missing required assets are missing; unknown suitability is “needs review.” Inspect the
  selected format's candidates before spending. Never promise an unverified asset is ready.
- Template formats use **one plan, one approval with the total in credits**, not approval for
  each paid step. Custom videos retain separate authenticated script/ingredient/budget gates in this chat.

### 4. Check this machine can render it

- **Chat host without a shell:** skip local checks and delegate an available format in Step 5.
  Never tell a chat host it needs Claude Code to start. Browser-only formats remain unavailable
  here; give computer setup guidance only if asked how to make one.
- **Local shell:** run `gooseworks doctor --no-browser` for common setup (auth/MCP, Node 18+,
  ffmpeg with libx264 + libass, ffprobe). Then fetch the selected template and its capabilities,
  and install documented dependencies in its fetched folder. Do not guess a renderer from a
  format name. For each Node renderer using default Playwright Chromium, run
  `gooseworks doctor --renderer-script "/absolute/path/to/the/fetched/scripts/record.js"` with
  the exact environment used to render, including NODE_PATH and PLAYWRIGHT_BROWSERS_PATH.
  Use the actual script path. Custom browser launch settings need their equivalent exact-runtime
  check. Non-browser capabilities need only their documented runtime checks.
  Never create paid ingredients before the selected renderer passes. Repair and recheck under
  existing setup permissions. If it cannot be fixed, re-list with client:{shell:false} and
  delegate only a format available to the coworker; never silently change the selected format.
- **Coworker sandbox:** you are the renderer. Follow goose-video-local's sandbox checks; never
  hand off recursively or claim browser capability that the sandbox lacks.

### 5. Create the project and hand it off, in this session

1. `video_project_upsert { brand_id, name, format: <template_id> }` with no brief (a brief creates
   a concept batch). Include client:{shell:true} only for real local execution. Default
   creation_intent:"format" keeps the style with this brand's content; source_remix requires an
   explicit choice to use source content.
   If they already chose a campaign/concept, include its verified campaign_id and optional
   campaign_concept_id. Read the IDs from that brand's saved campaign; the concept must belong
   to it. Omit unknown IDs and never infer a link or create a campaign solely to file a video.
2. **Verified local shell or coworker sandbox:** load
   `catalog_fetch { type: "skill", slug: "goose-video-local" }` and follow it on the same project_id.
   Carry the customer's words, verified defaults, campaign and selected angle into its brief.
3. **Chat host:** `goose_run_task { brand_id, project_id, message }` with the request, selected
   format and defaults. Keep task_id. Continue questions/edits with the same task and project.
   A saved free draft is not a started worker or a complete plan. Follow actual saved state.
4. When follow.card_follows is true, the card follows progress: do not re-read it in a loop.
   Read again on a customer reply, card action or requested update. A failure or missing saved
   plan needs the returned recovery action; never claim completion or approve an empty plan.
   Approval requires the current complete plan and total. Insufficient balance: offer a shorter
   video or top-up. “Not now” keeps the saved plan.

Do not hand the customer a command to paste somewhere else.

## Decision Rules

- One sentence is a complete request. Resolve the brand and show formats without a goal interview.
- One brand in the org: never ask which brand. Cards decide presentation; checks decide execution.
- Use canonical tools. Preserve campaign context, selected script angles and custom authenticated review gates.
- Never fabricate readiness, completion, approval or a second project.

## Output

One project, one current saved plan in this chat, then the finished video. With a widget write one
line and do not add app_url, brand_url or duplicate video links. A text host gets text_summary
and its usable delivery link.

## Quality Checks

- No forced goal question, duplicate table or unsupported shell claim.
- The exact renderer passed before local paid ingredients; uncertain assets stay uncertain.
- Selected campaign and angle survive; a single template project has no brief.
- Current complete plan and total precede approval. Custom script and ingredient gates remain independent; Studio is optional.

## Failure Modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Picker plus table | Ignored display_hint | Widget: one line; otherwise text_summary |
| Terminal loses formats | Confused cards with execution | Declare real shell capability and check renderer |
| Chat told it cannot start | Only local execution considered | Create once and delegate to coworker |
| Worker ends without a plan | Assumed completion means ready | Follow actual failure/recovery state |
| Two projects for one video | Recreated instead of resuming | Continue same project and task |

## Use uploaded footage

When the customer asks to use existing footage, check the actual advertised schemas. Use `media_search` with purpose `production`, kind `video`, the brand and current project when needed. Omit query spend for free retrieval. Read facts/scenes with `media_analyze`, then use `media_excerpt` action `inspect` to review actual bounded frames and timed transcript before selecting. A description or thumbnail URL alone is not visual review.

Freeze `source_excerpt:{asset_id,analysis_revision,scene_id,start_ms,end_ms,audio_mode}`. Revision is the original-byte SHA, scene may be null for a known user trim, bounds use integer milliseconds, and audio is original or muted. Call `media_excerpt` action `attach` with that exact selection and a stable idempotency key. The returned project remains unfinished and unapproved. Open its existing Studio review; preserve user locks and requested format, and keep footage separate from image packshot indexes. An incompatible format requires an explicit choice before changing it.

For custom production, fetch the current shared `video-production-harness` and follow script/ingredient gates. Download the verified original and trim its exact selected window at normal speed with the approved audio. Recheck current revision and production permission before consumption and final upload/completion. Save excerpt lineage in plan and ingredient readback. Missing optional semantics does not require another upload; known user-selected stored footage remains usable. Research and competitor references never become production footage. Selected originals require no paid generation; only newly generated/replaced ingredients consume the approved budget.
