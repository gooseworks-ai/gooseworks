---
name: goose-video-local
slug: goose-video-local
description: >
  Render an EXISTING GooseWorks video ad project or video batch with ffmpeg (plus Playwright for
  phone-mockup formats) and the GooseWorks media proxies, then save the finished MP4 back to the
  project over MCP. Runs on the user's own machine (Claude Code / desktop app, with or without the
  gooseworks CLI) OR inside a GooseWorks workspace sandbox (canonical MCP tools + Bash, no CLI).
  Use for a client-side format project (created by goose-video), a template-remix project or a
  video batch. A copy-for-Claude command or project id must first be checked with
  video_project_read. A hosted connector with no shell hands this same project to the GooseWorks coworker. To start a NEW video ad in chat,
  use goose-video first.
category: ads
version: 0.6.4
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, podcast, ugc, local-render, sandbox, byoa]
---

# GooseWorks Video Ads — local remix runtime

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

## Prepare the video workflow and brand before creative work

**Installed entry files are bootstrap instructions.** For new work started from an installed
file or an old chat, fetch `catalog_fetch { type: "skill", slug: "goose-video-local" }` on the selected
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

## Chat hosts and cards

First perform the mandatory route check below. Then, without a shell, hand a verified template
project to `goose_run_task { brand_id, project_id, message }`, or a verified template batch to
`goose_run_task { brand_id, batch_id, message }` (never send both ids). Keep task_id and the
same project or batch. Generated custom children keep their separate make-custom-video flow.
Inside a coworker sandbox you are the renderer: never delegate recursively.
With card.display_hint:"widget", say at most one line and never duplicate its plan, total or
links. Otherwise print card.text_summary. Read again on customer input, not in a polling loop.
A free saved draft is not proof that planning started or a complete plan exists.

## Mandatory route check before any local work or spend

For every existing `project_id` (including one supplied by the app's copy-for-Claude command),
call `video_project_read { brand_id, project_id }` **before** template lookup, toolchain setup,
media-proxy calls, or a review-set upload. For a batch, inspect each child project.

- **A server-rendered order** — the response has `creative_plan`,
  `project.creative_spec_revision_id`, `order.creative_spec_revision_id`, a planning
  `lifecycle`, or an `order` / `script_drafts.recipe` on a server format → **stop.**
  Server video orders are paused, and there is **no vetted local node-execution API** for them:
  do not rebuild one locally. Tell the customer this project was made for the server flow, which
  is paused; offer to start the same ad on a client-side format (`goose-video`, fetched with
  `catalog_fetch { type: "skill", slug: "goose-video" }`, older clients:
  `fetch_skill("goose-video")`). An order already holding credits can be released with
  `job_cancel`.
- **A client-side format or template remix** (a `source_sample_id` / `template_id` and none of
  the above) → continue below.
- **Generated custom video** (`project.custom_video_state.mode === "generate"`) → fetch `catalog_fetch { type: "skill", slug: "make-custom-video" }`, follow it on this same project and stop following the template flow. Record independent authenticated script/ingredient approvals in this chat with the current custom_review.approval_quote phase, review_token and cumulative total; Studio is optional. A handed-off coworker cannot self-approve; do not report approval_not_required.
- **Unclear** → read again or ask; never guess and generate. A copy prompt that names this skill
  is not proof of which kind the project is.

Continue below only for a verified client-side format or template remix.

For client-side formats and template remixes, you produce **video** ad creative wherever THIS agent runs and sync
the result back to the GooseWorks app over MCP. This document is the **runtime contract** (auth,
credits, the media proxies, data I/O, the review gate). A separate **recipe** — the template's
`recipe`, plus the capability skills it names — tells you *what to make* (the pieces, prompts,
models, order of assembly).

**Division of authority: read both, but when they disagree THIS doc wins on the environment AND the
review/approval flow.** The recipe governs WHAT to make; this doc governs WHEN you pause, generate,
and spend. In particular: a recipe may spell out a **multi-phase, multi-gate** flow — "generate the
still [GATE] → approve → author the prompt [GATE] → approve → render [GATE] → approve", several
separate pauses. **Do NOT run it that way.** Collapse every one of those gates into the single
**review-once** flow below: one review set, one approval (Step 3). Take the recipe's pieces, prompts
and models; ignore its intermediate pauses. This is the exact contradiction that confused past runs
(GOOSE-2542) — there is no ambiguity: review-once wins.

The app NEVER runs this skill by itself — it is the viewer + review surface; you are the renderer.

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

## Where am I running? (decide once, first)

Check in Bash, without printing any secret value:

```bash
[ -n "$GW_MEDIA_PROXY_TOKEN" ] && echo sandbox || echo local
command -v gooseworks >/dev/null && echo cli || echo no-cli
```

| Mode | How you know | Skills / atoms | Media-proxy auth |
|---|---|---|---|
| **GooseWorks sandbox** | `GW_MEDIA_PROXY_TOKEN` is set | `catalog_fetch { type: "skill" }` | env: `GW_MEDIA_PROXY_TOKEN` + `GW_*_PROXY_URL` |
| **Local, CLI installed** | `gooseworks` on PATH | `gooseworks fetch <slug>` or `catalog_fetch` | `~/.gooseworks/credentials.json` |
| **Local, no CLI** (Claude desktop app / Codex without login) | neither | `catalog_fetch { type: "skill" }` | `~/.gooseworks/credentials.json` if present, else **paid media over the MCP** (below) |

The `gooseworks` CLI and `~/.gooseworks/credentials.json` are **optional**. Everything this skill
needs from the app goes through the GooseWorks MCP tools below; the atoms' `media_proxy.py` reads
credentials.json when it exists and falls back to the `GW_MEDIA_PROXY_TOKEN` env otherwise.

### Paid media over the MCP: no key, no CLI needed

Every paid generation goes through the GooseWorks media proxy and is billed to the project. **You
never need FAL_KEY, an ElevenLabs key or `fal_client`.** An atom, a recipe or an open-source
skill that lists `FAL_KEY` in its environment is describing a standalone setup; here the proxy
satisfies it. Never stop, and never ask anyone to set a key, because one is missing.

**A one-off image or clip — call the MCP directly.** A frame placed in a laptop, a product cutout,
a creator still, a restyle, an animated shot, with any fal model (Nano Banana, GPT-image, Seedream,
Seedance, Kling). No atom script is needed:

1. A local input (a frame pulled from a screen recording, a screenshot) must be a public URL first:
   `media_upload { brand_id, scope: "video_project", scope_id: project_id, source: { type: "file" | "bytes", … } }`
   (no `path`). For a file, PUT its bytes to `upload.url` with `upload.required_headers`,
   then call `media_confirm { brand_id, media_id: media.id }`. Use the returned `media.url`.
2. `data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">, body: <model input>, project_id }`
   returns `{ job_id: "fal:<request_id>" }`. Pass an `idempotency_key` so a retry isn't billed twice.
3. Poll `job_get { job_id }` every few seconds until `complete`; the `*.fal.media` URLs are in
   `result`. Download each and QC it (open the image) before using it.

For a set that must match (every laptop shot, every creator still), use ONE prompt and the same
model for all of them and change only the input image. Voice and music:
`data_post_provider { provider: "elevenlabs", path: "/v1/text-to-speech/{voice_id}" | "/v1/music", body, project_id }`
(synchronous; the audio lands in the project folder).

`photos_generate` is **not** a general image tool: it only photographs a physical catalog
product (apparel, beauty, CPG) and needs a `product_id`. A software screenshot or app mockup is a
fal image edit, above.

**Atom scripts — the MCP relay.** With neither `GW_MEDIA_PROXY_TOKEN` nor
`~/.gooseworks/credentials.json`, the atoms' `media_proxy.py` RELAYS each paid call through you
instead of calling the proxies over HTTP. Before running any atom,
`export GW_PROJECT_ID=<project_id> GW_BRAND_ID=<brand_id>` (every call is billed to that
project). When a script **exits with code 3** it wrote a request file under
`working/mcp-requests/`: make exactly that MCP call — fal:
`data_post_provider { provider: "fal", path, body, project_id }` then `job_get { job_id }` until
`complete`, saving `result.output`; ElevenLabs: `data_post_provider { provider: "elevenlabs", … }`,
saving the reply; a local file: `media_upload` with its bytes, saving `{"url": …}`. Write that JSON
to the request's `save_result_to` and **re-run the same command**; repeat until the script
finishes. Same server proxy and price as the CLI path. If the CLI is logged in to a DIFFERENT
environment than this MCP connector (prod vs staging), set `GW_MEDIA_VIA=mcp` so the spend lands
where the project lives.

## MCP tools — canonical names (use these)

Use the canonical GooseWorks MCP tools. Legacy names are listed only as a fallback for an older
client that does not expose the canonical tool; never mix both for one step.

| Step | Canonical tool (use this) | Legacy fallback |
|---|---|---|
| Read a project / batch | `video_project_read { brand_id, project_id }` / `video_project_read { brand_id, batch_id }` | `get_ad_project` / `get_ad_video_batch` |
| Template recipe | `catalog_fetch { type: "template", slug: <source_sample_id> }` | `get_ad_template` |
| Capability skill (atom) + its scripts | `catalog_fetch { type: "skill", slug }` | `gooseworks fetch <slug>` / `fetch_skill` |
| Brand kit, products, rules | `brand_read { brand_id, sections: ["summary","kit","products","learnings"] }` | `brand_get_context` / `get_brand_kit` |
| Save a brand rule (a correction) | `brand_update { brand_id, knowledge_intent: "user_correction", user_statement: <the user's exact words>, patch: { facts: [{ id?, kind, text }] } }` | none |
| Mirror the review set | `video_project_upsert { brand_id, project_id, patch: { script: { script_drafts, script } } }` | `update_ad_project_script` |
| Project assets | `video_project_upsert { …, patch: { assets: [...] } }` | `update_ad_project_asset` |
| Progress note | `video_project_upsert { …, patch: { message: { role: "agent", content } } }` | `append_project_message` |
| Batch status | `video_project_upsert { brand_id, batch_id, patch: { batch: { status } } }` | `update_ad_video_batch` |
| Upload a file to the project | `media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path, source: { type: "file", filename, content_type } }` → PUT → `media_confirm { brand_id, media_id: media.id }` | `get_upload_url` / `get_ad_upload_url` |
| Save / find a finished piece (resume) | `media_upload { …, path, ingredient_key, input_digest }` / `media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key_prefix: "" }` (see "Save as you go") | none |
| Open the render row | `video_render_run { brand_id, project_id, kind: "full" }` (no `dry_run`; returns `render_id`) | `submit_render { project_id, kind: "full" }` |
| Update the render row | `video_render_run { brand_id, project_id, render: { render_id, status, output_url?, thumbnail_url?, error_message?, quality_status?, quality_report? } }` | `update_render_status` |
| Pin the final render | `video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }` | `set_final_render` |
| Credits / identity | `account_whoami` | `get_ad_credits` |

`list_accessible_scopes` and the `target: { type: "agent", agent_id }` dance are **not needed**:
`media_upload` with `scope: "video_project"` derives the right storage key (org-default Ads agent
+ brand slug + project folder) on the server.

## Running in a GooseWorks sandbox

You are an agent inside the user's GooseWorks workspace sandbox (Claude Code harness, Bash, the
GooseWorks MCP with canonical tools only). There is **no `gooseworks` CLI** and **no
`~/.gooseworks/credentials.json`**. The environment carries `GW_MEDIA_PROXY_TOKEN`, `GW_API_BASE`,
`GW_FAL_PROXY_URL`, `GW_FAL_STORAGE_PROXY_URL`, `GW_ELEVENLABS_PROXY_URL`, `GW_WHISPER_PROXY_URL`
and usually `GW_PROJECT_ID`.

- **Formats:** only formats that need **no Chromium** run here — podcast skits and UGC /
  talking-head formats (ffmpeg + PIL assembly). If the template's recipe or an atom needs
  Playwright/Chromium with no PIL fallback (iMessage / ChatGPT / Notes phone mockups,
  hyperframes, HTML recorders), **stop before any spend** and say so plainly: "This format needs
  a browser renderer that this workspace doesn't have. Run it in your own Claude Code with the
  GooseWorks CLI (`goose-video-local`), or pick a podcast/UGC format." Do not half-render.
- **Toolchain:** check `ffmpeg -version` and `ffprobe -version`. Install Python deps only when an
  atom needs them: `pip install --quiet pillow` when a render atom uses PIL (captions, end card),
  `pip install --quiet requests` if `import requests` fails. Never `npx playwright install` here.
- **Atoms:** `catalog_fetch { type: "skill", slug }` returns `content`, `scripts`, `files` and
  `dependencySkills`. Write `content` to `/tmp/gooseworks-scripts/<slug>/SKILL.md`, each
  `scripts` entry to `/tmp/gooseworks-scripts/<slug>/scripts/<name>` and each `files` entry to
  `/tmp/gooseworks-scripts/<slug>/<name>` (keep the key as the relative path; do the same for
  each dependency skill). Run scripts from their `scripts/` folder so `import media_proxy` resolves.
- **Project attribution:** `export GW_PROJECT_ID=<project_id>` in the shell **before running any
  atom** for that project (re-export per concept in a batch). The proxies bill the workspace
  agent and attribute spend to that project.
- **Never call a provider with a raw key.** All FAL / ElevenLabs / Whisper traffic goes through
  the `GW_*_PROXY_URL` bases with `GW_MEDIA_PROXY_TOKEN`. `FAL_KEY` / `ELEVENLABS_API_KEY` in
  this environment are proxy tokens, not provider keys — never send them to `fal.run`,
  `queue.fal.run` or `api.elevenlabs.io` directly. Never print any token.
- **Whisper for QC:** `export OPENAI_BASE_URL="$GW_WHISPER_PROXY_URL/v1"` before running
  `review-ugc-render` / `watch` transcripts.
- **The operator may be absent.** Keep every quality gate and checkpoint below, but decide
  defaults yourself from the project brief and the recipe, and record them in the review set.
  Ask in the chat **only for a true taste call** (a creative choice the brief and recipe leave
  open and that changes the ad), never for a mechanical or recoverable decision. The Step 3
  approval still applies: ask for it in this chat and record the yes with
  `video_project_upsert patch.approve`.
- **Outputs:** keep working files under `/tmp/gooseworks-video/<project_id>/` (local disk — never
  the s3fs workspace mount, which is slow and can drop writes); anything the user must see goes to
  the project via `media_upload` (never leave the result only in the sandbox). Every paid piece is
  also SAVED to the project as soon as it passes QC — see "Save as you go — and resume".

## Report problems so we can fix them (telemetry — do this, don't skip it)

If anything blocks or degrades this run — a media/proxy call fails or errors, a required input or
asset is missing, a recipe instruction is ambiguous or contradictory, the render toolchain won't set
up, or you hit a bug you can't work around — **report it** so the team gets visibility and can fix
the skill. It's fire-and-forget, never counts against you, and never blocks your work.

- **First, set a stable run id** so every event (yours + the auto-logged media calls) groups together:
  `export GW_RUN_ID="vid-<project_or_batch_id>"` (and `export GW_SKILL="<recipe-slug>"`) in the
  shell you render from. The media proxies read `GW_RUN_ID` automatically.
- **CLI present →** `gooseworks log "<what happened>" --event-type <type> --level error --details '{"error":"...","step":"...","model":"..."}'`
- **No CLI (sandbox / cowork) →** from any atom's `scripts/` folder:
  `python3 -c 'from media_proxy import gw_log; gw_log("<what happened>", event_type="blocker", level="error", details={"step": "..."})'`
  (or the `log_cli_event` MCP tool if your client has it).
- Event types: `api_failure` (a proxy/model call failed) · `missing_input` · `blocker` ·
  `confusion` (unclear/contradictory instruction) · `error` (a bug) · `step`/`info` (progress notes).
- Put the **real error text + the step you were on** in the details. Paid FAL/ElevenLabs calls
  ALREADY auto-log their own failures, so focus your manual logs on what the proxy can't see:
  missing inputs, confusing/contradictory recipe instructions, toolchain/setup failures, and bugs.
- Logging is FOR US — it does not replace telling the user. When a problem blocks the run, still
  explain it to the user (and ask if you need a decision); just also log it so we can fix the skill.

## Prerequisite — MCP + a render toolchain (Phase 0 preflight)

- The GooseWorks MCP tools are REQUIRED. If they're unavailable, stop and tell the user
  to connect the GooseWorks MCP server (or run `gooseworks install --claude --mcp` on the CLI)
  and restart. There is no REST fallback.
- **The render runs wherever THIS agent runs, and it needs a real toolchain:** `ffmpeg` +
  `ffprobe` always, plus a Playwright **Chromium** for browser-rendered formats (phone mockups,
  HTML end cards without a PIL fallback). Establish it in this priority order, and do NOT start
  rendering until one is confirmed:
  1. **Sandbox →** see "Running in a GooseWorks sandbox": ffmpeg + ffprobe (+ PIL on demand); no
     Chromium, so browser formats stop there.
  2. **CLI present →** run `gooseworks doctor --no-browser` for login, MCP, Node 18+, ffmpeg
     with libx264 + libass, and ffprobe. This is common setup only. After fetching the selected
     capabilities in Step 2, check each browser renderer's actual launch before ANY paid
     ingredient. An unscoped `gooseworks doctor` checks only the calling folder's browser;
     it cannot certify a different fetched renderer.
  3. **No CLI →** check the toolchain yourself: `node --version` (18+), `ffmpeg -version`,
     `ffprobe -version`, plus `ffmpeg -hide_banner -encoders` (libx264) and
     `ffmpeg -hide_banner -filters` (ass). After fetching, use the exact-package free launch
     check in Step 2; resolving a package or finding a cache folder does not prove its browser
     can launch. The `watch` QC step later needs the same ffmpeg and,
     for transcripts, a Whisper backend — without one it degrades to frames only.
  4. **Docker available →** the most reliable way to get the toolchain on a host that lacks it:
     run the render steps inside the prebuilt image
     **`ghcr.io/gooseworks-ai/goose-video-render`** (ffmpeg + ffprobe + Playwright Chromium baked
     in), mounting the project working directory. (Nested Docker is usually disabled inside
     managed sandboxes — treat this as an option, not a guarantee.)
  5. **None of the above works →** STOP and tell the user plainly, e.g.: *"Video rendering needs
     ffmpeg (and, for this format, a Playwright Chromium) on the machine running this agent. This
     environment doesn't have them and I can't install them here. Options: (a) enable Docker so I
     can use the goose-video-render image, (b) install ffmpeg + `npx playwright install chromium`,
     or (c) run this skill in your own Claude Code where the toolchain is available."* Do not
     half-render or fake a result. Static image ads (the `goose-ads` skill) do NOT need any of this
     and work anywhere — offer that as the fallback if they just want an ad now.

## Identity, token, credits

- **Sandbox:** the token is `GW_MEDIA_PROXY_TOKEN` (already scoped to this workspace's agent and
  org); the API base is `GW_API_BASE`. Never print either.
- **Local:** read `~/.gooseworks/credentials.json` → `api_key` (your agent token), `api_base`,
  `agent_id`. Never print the token.
- **Uploads go through `media_upload` with `scope: "video_project"`** — pass `path` = the
  project-relative path (`working/final.mp4`, `working/review/end-card.png`). The server stores it
  in the project folder of the org-default Ads agent (where the app's render-file route reads) and
  returns `upload.url` (presigned PUT), `upload.required_headers` and
  `upload.render_file_url`. PUT the bytes with exactly those headers, check the PUT returned
  2xx, then call `media_confirm { brand_id, media_id: media.id }` and require success before
  using the file in ingredients or completing a render. This applies to project-path and
  path-less file uploads. Confirmation verifies the stored file; Goose performs this tool step
  without asking the user for another approval. On failure, report or repair the upload before
  continuing. Never hand-build storage paths or agent prefixes; a bare workspace upload is
  invisible in the app.
- Media generation (FAL / ElevenLabs) through the GooseWorks proxies is the **REAL spend** — billed
  per call as you generate (Step 4). The render row (`video_render_run kind: "full"`) charges the flat
  **video base fee once, when a full render is reported `complete`**. Open one row immediately
  after recorded approval, BEFORE paid production (Step 4.1), and reuse that render_id for progress
  and completion. Never open a second row on a guess (a second completed row bills again). The final-video QC gate (Step 4.3) then sits between
  that master and PINNING it. Call `account_whoami` first to see the credit balance.

## Save as you go — and resume (never pay twice for a piece)

A sandbox can die mid-run (timeout, restart, a new session picks the project up). Anything that
lives only in `/tmp` is then gone, and regenerating it pays again. So: **save every piece to the
project the moment it passes its QC, and start every run by loading what is already saved.**
Working files stay in `/tmp/gooseworks-video/<project_id>/` (never the s3fs workspace mount);
the project is the durable copy.

**Ingredient keys.** Give every planned piece a stable key before you generate it, the same on
every run: `vo/scene-03`, `vo/sample-her`, `still/her-base`, `still/scene-05`,
`clip/scene-05` (a lipsync / video clip), `music/bed`, `endcard`, `captions`, `final`,
`final-thumb`. Upload path = `working/<role>/<file>` (`working/vo/scene-03.mp3`,
`working/clip/scene-05.mp4`); the review set keeps its `working/review/<name>` paths.

**Input digest.** Name the exact inputs of each generation with `input_digest` from
`media_proxy` (in every media capability's `scripts/` folder):

```python
from media_proxy import input_digest
digest = input_digest(model_path, args)   # the model + the EXACT payload you send
```

Hash only what decides the output (prompt, voice_id, model_id, seed, duration, aspect…). An input
that is a presigned or proxy URL changes every run, so swap it for that input's own identity
before hashing, e.g. `{**args, "image_url": {"ingredient": "still/her-base", "digest": her_digest}}`
— then a changed still correctly invalidates every clip made from it. For a piece you build
locally (ffmpeg stitch, PIL end card, captions) use `input_digest("local/<step>", {params,
inputs: {key: digest, …}})`.

**1. At the START of every run (first run, resume, new sandbox), load what exists — one call:**
`media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key_prefix: "",
limit: 100 }`. It returns ONE compact row per `ingredient_key` (the newest):
`{ id, ingredient_key, input_digest, kind, status, mime, bytes, url, path, created_at }`. Every
status except archived is included. Project-path uploads remain `pending` until
`media_confirm` succeeds. Confirm a pending project-path upload before reusing it; if
confirmation fails, repair the upload before treating it as a verified save.
Page with `cursor` if `next_cursor` is set (keep the first row you see per key — it is the newest). Also read `script_drafts.ingredients` from
`video_project_read`: it records which pieces were already approved in the review.

**2. For each planned piece:** compute its digest from the args you WOULD send now. If a saved row
has the same `ingredient_key` AND the same `input_digest`, **download it instead of
generating**:

```bash
curl -fsSL "$URL" -o /tmp/gooseworks-video/<project_id>/<path>   # URL = that row's `url`
```

That `url` is a short-lived (~15 min) presigned S3 GET the server signs for you, so it needs no
auth header — download right after listing (list again if it expired). **Never fetch the
`/api/ads/projects/<id>/render-file?path=…` route from the sandbox:** it needs the app's
browser session and answers 401 to a token. Check the file is non-empty and plays (ffprobe for
audio/video, open the image); if the download fails or the file is broken, regenerate the piece.
Only generate what is missing or whose digest changed — a changed digest means the inputs changed,
so the old file is stale.

**Pass the digest to the proxy too:** `fal_generate(..., input_digest=digest)` (and
`fal_generate_video` / `fal_whisper`). A piece that was generated but never saved (the sandbox
died between the fal result and the upload) is then handed back by the proxy instead of paid for
again, even though its input URLs changed. Only pass `new_take=True` when the user wants a
different take of the same inputs.

**3. After EACH piece is generated AND passes its own QC, upload it right away** — don't batch
the uploads to the end:
`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path:
"working/<role>/<file>", ingredient_key, input_digest, source: { type: "file", filename,
content_type } }` → PUT the bytes to `upload.url` with `upload.required_headers` →
`media_confirm { brand_id, media_id: media.id }`. Require a successful confirmation.
Kind: `audio` (VO), `music`, `image` (a still),
`video` (a clip), `endcard`, `document` (captions / a JSON sidecar), `render` (the master),
`thumbnail`. Re-uploading the same key is fine — the newest wins. A piece that FAILED QC is never
uploaded under its key. **Save a piece's sidecars with it** under `<key>.<name>` — e.g. the VO's
char-level timestamps as `vo/scene-03.timestamps` (`kind: "document"`, same digest). Captions are
built from them; without them a resumed run has to fall back to Whisper timings, which mis-case
brand names.

**4. Keep the approved review unchanged during production.** Record each confirmed piece's
`media_id`, `path`, `ingredient_key` and `input_digest` locally; the confirmed media rows
and render progress are the durable resume record. Before approval, mirror the draft ingredients
as part of Step 3. After approval, do NOT write `patch.script` or `script_drafts` during any
paid production, QC or repair step, or while provider work is pending. A review-set write clears
approval and can stop the next paid step, including a batch concept. Save the final descriptive
review once all paid work is finished and settled, as Step 4.5 requires.

Any material creative change or ANY change the user asked for in this chat must stop production:
save the changed complete plan and full credit total, then obtain fresh approval before continuing.
Never reuse the earlier yes for a changed plan. A repair that restores the approved choices can
continue within the existing allowance and Stop guards without rewriting the approved review.

The `final` master and `final-thumb` poster (Step 4.4) carry `ingredient_key` too, so a
resumed run that finds a passing `final` with the same digest only needs to publish.

## Finished video, interrupted saving — resume the same version

If the final already passed QC and the customer says **"finish saving this video"**, start here.
Do not restart the recipe, choose another format, open another render, generate a take, or run a
paid transcript check again. Saving uses the **same render_id**. The ordinary first-completion
video fee can still apply; its existing same-render idempotency prevents a duplicate fee. Never
promise that all saving is free.

**Before the first final upload**, save the final review set and production manifest from Step
4.5/4.6 (including any QC repairs) only after all paid work is finished and settled. Preserve the
approved creative choices; a material change requires the changed-plan approval flow first.
After that final save, start no new provider or render work: prepare the checkpoint and finish
the same opened render using its existing finishing allowance and guards. A released allowance
or stopped/capped render requires normal recovery; never reopen or bypass approval.
Write a durable local checkpoint outside the fetched-scripts cache. Keep the actual
final, JPEG poster, structured passing quality report, and review evidence files alongside it in
a retained local working folder. Record their SHA-256 **at the time those exact bytes pass QC**;
never attach an old verdict to a newly hashed replacement. A sandbox's local disk can disappear:
this checkpoint recovers connection interruptions, not lost storage. Save ingredients remotely
as above and tell the customer if the checked local output is no longer available.

With the current CLI and its normal login to the selected environment, write a manifest like:

```json
{
  "brand_id": "<owning brand>", "project_id": "<same project>", "render_id": "<already opened render>",
  "input_digest": "<assembly input digest>",
  "final_path": "/absolute/retained/working/final.mp4",
  "poster_path": "/absolute/retained/working/final-thumb.jpg",
  "qc": {
    "final_sha256": "<64 lowercase hex characters recorded during final QC>",
    "poster_sha256": "<64 lowercase hex characters recorded during poster review>",
    "report_path": "/absolute/retained/working/quality-report.json",
    "evidence_paths": ["/absolute/retained/working/review/finished-ad.json"]
  }
}
```

Run `gooseworks video-save prepare --manifest <manifest.json> --checkpoint <retained/save-<render_id>.json>`
before any upload, then `gooseworks video-save resume --checkpoint <same checkpoint>` for both
normal saving and recovery. The helper uses the saved login and canonical MCP connection; it does
not copy credentials or use a raw Ads REST fallback. Its atomic private checkpoint binds the
environment, account, project owner, project/render, final/poster bytes, assembly digest, passing
quality report, review set, evidence files and stage receipts. Preserve it until delivery. Never
edit the checkpoint to clear a failed check. Keep checkpoint and manifest files out of commits.

The helper reads remote state before writes. It keeps `final` / `final-thumb` ingredient keys
and writes per-render paths `working/final-<render_id>.mp4` / `working/final-<render_id>-thumb.jpg`
so saving this version cannot overwrite an older one. It confirms pending uploads, checks remote
bytes against the QC hashes, and reuses confirmed media. A request with missing stored bytes can
get a fresh upload URL at that same path. A lost completion reply is unknown until project read
confirms the same render's output and passing report; then only final selection remains.

**No CLI / a host-selected MCP connection:** keep the same protocol with the host's canonical
tools. Atomically write versioned JSON locally (write a private same-directory temporary file,
flush/fsync, rename, then fsync the directory) before any upload and between each upload request,
PUT, confirmation, completion and final selection. Persist only public environment identity,
account/owner/project/render IDs, file paths/sizes/hashes, input digest, exact quality report and
evidence fingerprints, saved-review digest, media IDs and stage states; **no tokens, session IDs,
signed URLs or auth headers**. On reconnect call `account_whoami`,
`video_project_read { brand_id, project_id, include: ["renders"] }` and
`media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key, input_digest }`
on the original connection. Compare identities, local/evidence hashes and saved review; verify
confirmed remote bytes too. Treat a lost reply as unknown and read back before retrying. Use only
the missing `media_upload` → PUT → `media_confirm`, same-render `video_render_run { render: … }`
callback and `video_project_upsert` with only `patch.final_render_id` and
`patch.final_selection_guard: { expected_final_render_id, expected_review_digest }`; never a
render-open call. The expected final is the last read's pin, including explicit `null`; the
review digest is SHA-256 of recursively sorted-key JSON
`{script: project.script ?? null, script_drafts: project.script_drafts ?? null}` saved at checkpoint
creation. First confirm the selected server advertises this guard in `tools/list`. If absent,
stop and request the normal server update/reconnect; an unguarded pin is unsafe. A
`final_selection_conflict` means the choice or review changed: keep the checkpoint and explain
that saving stopped without overwriting it. Retain the
strict Step 4.3/4.4 report and Step 4.5 review-set requirements.

If authorization expired, reconnect/sign in through the normal host/CLI flow on the original
connection, then resume. Missing tools are a reconnect requirement, not permission to switch
environments. Missing/changed files, stale/missing QC, changed account/owner/review, another final
selection, or a stopped/capped/failed/blocked render require diagnosis; do not reopen it or
regenerate automatically. If saving stops, say: **"Your video is finished locally, but saving to
Goose was interrupted."** Link the actual local file and preserve its checkpoint. Claim saved
delivery only after a fresh project read verifies completion and selection of that exact render.

## Step 0 — project id, or video BATCH id? (fan out before anything else)

The handoff is EITHER a single `project <id>` OR a `video batch <id>`. A batch is
the app's "N concepts" flow: one composer submission fans out into **N independent concept projects**
(the user picked a concept count, default 3), and the app expects EACH to be rendered. **Handle both:**

- **`project <id>`** → you have one project. Treat it as a batch of one and continue to Step 1.
- **`video batch <id>`** → call `video_project_read { brand_id, batch_id }`. It returns every child
  concept under `projects[]` — each is a normal project with its own `id`, `variant_index`
  (Concept 1..N), and its own `creative_brief` (the per-concept angle/hook/offer/message). **You
  MUST process every concept, not just the first** — dropping concepts 2..N is the #1 batch bug.

**Loop shape (ONE approval for the batch, isolated work per concept):**
1. Run **Step 1 + Step 1.5 + Step 2 + Step 2.5 + Step 3-assemble** for EACH concept project (each
   has its own `project_id`, brief, `GW_PROJECT_ID` and `working/` folder — never cross-write
   between concepts). The brand read (Step 1 item 2) and `brand-rules.json` (Step 1.7) are per
   BRAND: do them once for the batch and copy the file into each concept's `working/`. The read is
   ~90K characters. Step 2.5's angle bank is shared per brand AND product: load or build it once, and
   give every concept whose angle is `auto` a DIFFERENT angle from that list, so the batch is N
   different ads, not one ad N times.
2. Mirror EVERY concept's review set (Step 3's `video_project_upsert patch.script` per project),
   then stop for **ONE** approval in this chat that covers all concepts. Save each render_estimate.total_credits
   (previews + render + the 200 base fee) and the batch total. Widget: one line; text: card.text_summary. Set the batch to `review` (`video_project_upsert
   { brand_id, batch_id, patch: { batch: { status: "review" } } }`).
3. On an explicit yes, record it ONCE for the whole batch: `video_project_upsert { brand_id, batch_id,
   patch: { approve: { user_quote: "<their exact words>", total_credits: <the saved total> } } }`. Check its `not_ready` list is
   empty (a concept listed there has no saved review set: save it, show it, ask again). If they
   approve only some concepts ("1 and 3 are good, redo 2"), record each approved one with its
   `project_id` instead, and redo the rest. Then set the batch to `rendering` and run **Step 4 (the expensive render)** for each
   concept with up to 8 isolated workers when the machine can sustain them. Retry
   concurrency_limit after retry_after_seconds; reduce concurrency on a limited machine. Deliver each (Step 5). When every concept is pinned, set the batch to
   `complete`. A concept the Step 4.3 gate leaves `blocked` cannot be pinned (a batch concept
   needs `passed`): finish the others, set the batch to `blocked`, and tell the user which
   concepts passed and which are blocked, with each one's failing checks.

If a single concept fails, keep going with the rest, mark that concept blocked, and report which
ones shipped — never abort the whole batch on one bad concept. Everything below (Steps 1–5) is
written per-project; a batch just runs it N times with the shared approval gate above.

## Step 1 — resolve the project, source, brand

1. `video_project_read { brand_id, project_id }` → keep `brand_id`, `source_sample_id`, `name`,
   `status`, the **top-level** `app_url` + `brand_url` (the links you hand the user for the in-app
   review in Step 3 and delivery in Step 5), AND the user's **`creative_brief`**, project
   **`assets`**, `character_id`, `default_voice_id` — these are the authoritative inputs the user
   chose in the composer (see Step 1.5). Do NOT discard them. Then `export GW_PROJECT_ID=<project_id>`.
   Keep its saved `campaign_id` and `campaign_concept_id` too. If the customer explicitly
   wants to attach this existing video to a known campaign/concept, verify the IDs with the
   campaign read and use `video_project_upsert { brand_id, project_id, patch: {
   campaign_association: { campaign_id, campaign_concept_id? } } }` as a separate, sole-field
   patch. Read back the same project and confirm the saved IDs. Linking never needs a new
   project, render, generation call or approval. A conflicting saved link stays intact; explain
   it instead of silently moving the video. Leave unlinked legacy videos alone unless asked.

### Step 1.5 — the project brief is AUTHORITATIVE (honor it; don't re-ask)

The composer already collected the user's creative direction onto the project. **Read it and treat
it as ground truth — it OVERRIDES the template recipe's defaults, and it REPLACES the clarifying
questions you would otherwise ask.** For a field the brief leaves empty, use the Brain search's
evidence brief first, then the recipe default, then (last) asking. Map the fields you WILL honor:

- `creative_brief.productName` / `.offer` / `.angle` → the product, offer/code, and angle. Do
  **not** ask "which product / what offer / what angle" if these are set.
- `creative_brief.concept` (on a batch child) → this concept's **`angle` / `hook` / `offer` /
  `message` / `note`** — the per-concept differentiator. Honor it verbatim; it's WHY the user asked
  for N concepts. `angle: "auto"` or empty means "you choose."
- Project `assets` + `creative_brief.reference_image_urls` → the user's **own reference images**.
  Use them as the product/brand refs (alongside the brand kit), don't ignore them for generic recipe
  assets.
- `character_id` → the avatar/creator to use. `default_voice_id` → the voice for any VO (put its
  NAME in the review `subtitle`). Use these instead of picking your own.
- `creative_brief.durationSeconds` → target length; honor it when the format allows.
  `creative_brief.ratio` → video ads are ALWAYS 9:16 (1080×1920). If the brief asks for another
  ratio, make 9:16 anyway and say so in the review; never export another size (a recipe's
  "also 1:1" option included).
- `polish_policy` (`standard` | `extra`) → `extra` means spend the extra pass on QC/polish.

2. Brand gate: `brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }`
   (older clients: `brand_get_context` with the same sections). Ask for all four: the default
   leaves out the kit and the brand's saved rules, and a video made without them is off-brand.
   If the kit's `researchStatus` (or the brand's `research_status`) is `complete`, REUSE it —
   never re-research. A pending status alone does not require research; use verified stored
   facts and ask only for an actual gap. If the context is empty or the customer requests
   research, load `catalog_fetch { type: "skill", slug:
   "brand-research" }` and follow its stored-pack workflow. Only when that verified pack is
   saved in the supported research workspace, finalize with
   `brand_update { brand_id, patch: { finalize_research: true } }`, then read the brand back.
   Never send raw research JSON through `kit_patch`: the public tool accepts only the existing
   `video_lab` asset slot there. If there is no verified stored pack, submit researched facts
   through typed `patch.knowledge` / `patch.kit` as pending agent proposals; do not pretend
   research is finalized or its proposals are approved. Then do Step 1.7 with verified facts.
3. For a new plan, `catalog_fetch { type: "template", slug: <source_sample_id> }` → the source
   video: `media_url`, `recipe`, `format` (e.g. "podcast-skit", "imessage"),
   `extracted_script`, `how_to`, `remix_spec`. For an approved resume, restore the recorded
   package and dependencies instead of fetching today's recipe over the saved plan.

### Step 1.6 — a remix of a FINISHED video (the project read has a `remix` block)

A project made from **Community videos** remakes another customer's finished video for THIS brand.
Its `video_project_read` returns a top-level `remix` block
(`{ remix_of_project_id, instruction, direction }`), and `reference_video_url` is that finished video.

- **Watch the reference video first** (download `reference_video_url`, pull frames + the transcript).
  It is the target: match its structure, beat order, pacing, framing, look, voice and tone.
- **`remix.direction` is its approved review set** (scenes and lines, set/look notes, take prompts,
  captions, music, voice). Start your review set from it instead of the template's defaults; it
  already carries every change that customer made to the template.
- **`remix.direction.implementation`, when present, is HOW it was made**: the pipeline and the model
  each step used, the style and negative prompts, the character and per-scene still/motion prompts
  with their guards, voice and music settings, the mix, and `fixes` (what went wrong and how it was
  fixed). Reuse the same models, style/negative prompts and guards, rewrite the prompts' subjects for
  this brand, and apply every `fix` up front so you don't repeat the same mistake.
- **Rewrite everything for THIS brand.** "[source brand]", "[source product]", "[link]", "[email]"
  and "[code]" mark the other customer's details: never write them, and never reuse their claims,
  numbers, URLs, offers or CTA. Every product, claim, name, image and CTA comes from this brand's
  kit, products and media. Their footage (screen recordings, product shots) and their creator face
  are NOT carried over: use this brand's own assets and make a new creator from the description.
- Precedence: this project's own `creative_brief` and assets (Step 1.5) > `remix.direction` >
  the template recipe's defaults.
- In the Step 3 review, say it is a remix of that video and list what you kept vs. changed.

### Step 1.7 — the brand rules file and the brand assets (every run, before any writing)

Before new writing, write `working/brand-rules.json` from the Step 1 brand read. Preserve an
approved run's saved rules on resume; reconcile an intentional rule change through the existing
review gate. Every later step reads THIS file, not your memory of the chat:

```json
{
  "name": "Acme",
  "pronunciations": [{ "term": "Acme", "say_as": "ak-mee", "learning_id": "…" }],
  "must_say": [{ "text": "…", "learning_id": "…" }],
  "never_say": [{ "text": "Never claim it cures insomnia", "learning_id": "…" }],
  "products": [{ "id": "…", "name": "…", "facts": ["size, flavour, price, ingredients as stored"], "images": ["…"] }],
  "logo": { "url": "…", "confidence": "<kit.logoConfidence>" },
  "fonts": ["…"],
  "palette": ["#…"]
}
```

- **Video taste is direction, not dialogue.** Before mapping brand rules, extract entries
  prefixed `Video preference:` from both `learnings` and `kit.instructions` into the verified
  taste brief, including accepted proposals. They govern pacing, voices, captions, visuals and
  format choice; do not copy them into `must_say` / `never_say` or read them aloud. Carry the
  brief into the choices, scene planning and review.
- **Sources.** `learnings` are the brand's saved rules (the user's past corrections among them):
  `must` / `do` → `must_say`, `dont` → `never_say`, and a `must` whose text reads
  `Pronounce "<term>" as "<say_as>"` (straight or curly quotes) → `pronunciations`. Add `kit.instructions` (free-text
  standing rules) only when they require actual spoken wording or prohibit a claim. Production
  directions stay in the brief. A required spoken line or prohibited claim remains its own
  ordinary `must` / `dont` rule.
- **Which product.** The one the brief names (`creative_brief.productName`); with none, the row
  whose name matches the product the user asked for, or the brand itself for a one-product
  brand. Product lists often hold other brands' items or old ads saved as products: if more than
  one row could be it, ask in the choices round. Never mix facts across rows.
- **Product facts** come from that row (name, description, variant, price) and, when the row is
  empty, from the kit (`valueProps`, `description`, `tagline`): nothing else. Write them to
  `products[].facts`; the script may only state what is there.
- **Logo.** Download the kit's logo FILE (`kit.logoUrl`, else `kit.logos[0]`) to `working/brand/`,
  keeping its real extension (an SVG stays `.svg`; rasterise it to a 1024px-wide PNG with
  `rsvg-convert` or `cairosvg` when a renderer needs pixels). It is used as-is on every scene and
  end card that shows a logo: **never generate, redraw, re-letter or restyle a logo with an image
  model.** If the kit's `logoConfidence` says favicon-grade, or the file's long side is under
  256 px (or it is under 40,000 px²), it is a site favicon, not a logo: do not upscale it. Ask the user for a real logo (or offer the brand name
  set as text in the brand font) in the SAME question round as the recipe's `choices`.
- **Font.** `kit.typography.heading` when its `source` is `user` (the user chose it), else
  `kit.fonts.heading`. Download the font file (the kit's own, or the same family from Google
  Fonts) to `working/brand/` and use it for every on-screen line. With no match, use the closest
  free font and say so in the review.
- **No wordmark file.** When a recipe wants a wordmark SVG and the kit has only a logo image, set
  the brand name as text in the brand font beside the logo file. Never generate one.
- Record in `brand-rules.json` which logo the video will actually composite (`logo.file`), or
  `"logo": { "mode": "text" }` when it will show only the brand name set in the brand font.
- **Product images.** Download this product's own images to `working/brand/`. Use only images of
  THIS product: never a catalogue image of another product, a mascot, a lifestyle photo of a
  person, or a stand-in. If the product has no usable image, ask in the choices round.

### Brand corrections stick — save them to the brand the moment they are made

When the user corrects something about the BRAND in chat — how a name is said, a claim that may
not be made, a product fact, a visual rule ("never use red", "the logo goes top-left") — save it
in the SAME turn, before anything else:

`brand_update { brand_id, knowledge_intent: "user_correction", user_statement: <the user's exact correction>, patch: { facts: [{ kind, text }] } }`

| Correction | `kind` | `text` |
|---|---|---|
| Pronunciation | `must` | `Pronounce "Acme" as "ak-mee"` (exactly this form) |
| A claim or word to avoid | `dont` | `Never say or imply: <the claim>` |
| Something that must be said | `must` | `<the rule>` |
| A product fact | `must` | `<product name>: <the fact>` |
| A visual rule | `do` / `dont` | `<the rule>` |

- If it changes an EXISTING rule (a new pronunciation for the same term), update that rule by id
  (`facts: [{ id: <learning_id>, text }]`) instead of adding a second one.
- Use the correction intent and user's statement when supported, as described below. Read
  `brand_read` learnings back and verify the rule and source before claiming it was saved.
- Then tell the user in one line: "Saved to your brand for future videos." Update
  `working/brand-rules.json` and apply the rule to THIS video too.
- A one-off note about this video ("make it shorter", "use the blue background here") is NOT a
  brand rule: don't save it.

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

## Step 2 — read the template's recipe (it carries everything; NO hardcoded format map)

The ad format is a **template (data) in the ad_sample DB**, not a per-format skill.
`catalog_fetch { type: "template" }` returns the template's `recipe` — a self-contained brief you
read and execute. **Do NOT map `format` to a hardcoded recipe slug** (there is no such table):

- `recipe.format` — the format label (e.g. `vignette`), for display only.
- `recipe.atoms` — the **capabilities** this template composes (e.g. `create-vo-elevenlabs`,
  `create-image-gpt-image-fal`, `render-podcast-skit`, `review-ugc-render`, `watch`). Fetch each
  with `catalog_fetch { type: "skill", slug }` (or `gooseworks fetch <name>` when the CLI is
  installed) — they are reused across templates.
- `recipe.instructions` — the **playbook** to follow: `instructions.inline` prose, or
  `instructions.doc_url` (an S3 markdown doc — fetch it).
- `recipe.config` — every param (prompts, layout, timings, palette, model choices).
- `recipe.inputs` — the brand-asset contract (which product / logo / offer this template needs).
- `recipe.choices` — the creative calls the USER makes (who is on screen, narrator, tone, setting,
  art style, music). Ask every unanswered one in ONE round before any paid step, with its options plus
  "you pick". Its `reference` is what the demo used: an example, never the default.
- `recipe.assets` — reference material as S3 links (reference render, style guide, example frames) —
  fetch as needed.

Runtime: **read the recipe → fetch each capability in `recipe.atoms` → follow
`recipe.instructions` with `recipe.config` + the brand's bound `inputs`.** The template IS the recipe;
there is no `format → recipe-slug` table and no per-format skill to fetch.

Save each fetched capability's content, scripts + files under `/tmp/gooseworks-scripts/<name>/`
(layout in "Running in a GooseWorks sandbox"). If a capability is a Node package (a phone-mockup
renderer), install its documented dependencies in the folder containing its `package.json`,
and preserve the recorder's documented `NODE_PATH` — local machines only; in a sandbox that
format stops (no Chromium).

**Selected browser readiness — before ANY paid ingredient:** identify the actual browser script
from the fetched capability's instructions (including an HTML end-card renderer if used).
For Node scripts using `require('playwright')` with default `chromium.launch()`, run
`gooseworks doctor --renderer-script "/absolute/path/to/the/fetched/scripts/record.js"`.
Substitute the actual script, and keep the same cwd and environment as the render, including
`NODE_PATH` and `PLAYWRIGHT_BROWSERS_PATH`. It resolves Playwright relative to that script,
launches and closes Chromium with the default settings and bounded waits, and downloads nothing.
On failure, stop before spending, show its folder-specific repair and recheck after setup.
For non-browser formats use `doctor --no-browser` plus their documented runtime checks;
never combine `--no-browser` with `--renderer-script` or use it to bypass a browser renderer.

**No CLI or CLI without these flags:** run an equivalent free probe in a separate Node process: use
`require('node:module').createRequire(require('node:path').resolve(actualRendererScript))`
to load `playwright`; keep the render's cwd, environment and default launch settings. Await
`chromium.launch({ timeout: 15000 })`, then await `browser.close()` (bound close to 3 seconds).
Bound the whole process to 20 seconds and stop its own process tree on failure or timeout.
Report the resolved module path/version and error without credentials. Missing module, executable,
headless runtime or failed launch is a failed check; a cache folder, executablePath alone or
another project's browser is not a pass. Other browser packages, Python renderers or custom
launch settings need the same free launch/close check through their documented runtime and
actual settings. Do not replace their browser/channel/flags to get a pass. Setup is a separate
action under existing permissions; this check never silently installs or downloads anything.

> **Migration note:** older phone-mockup formats (`imessage` / `chatgpt` / `apple-notes`) whose DB
> recipe does not yet carry `atoms` / `instructions` still hold the legacy `recipe.thread` payload;
> migrate them to this shape (capabilities + instructions in the DB) — do not reintroduce a CLI map.

## Step 2.5 — plan words and visuals with `write-video-ad-script`

Every video concept gets creative strategy, including silent formats. Fetch
**`write-video-ad-script`** through the skill catalogue and follow it before assembling
review ingredients. It reuses or fetches **`ad-angle-miner`**, binds the researched promise
to this template's full recipe, writes words and visuals together, and checks product
claims and production fit. Its independent critic is a quality screen, not a forecast
of ad performance. The existing Step 3 review and approval remain unchanged.

- **Carry the research into the writer.** Pass the brand and exact product, audience,
  objective, offer, CTA, selected template recipe, available assets and the full miner
  bank or its readable workspace pointer. A selected miner idea includes its angle id,
  evidence and proof plan, not only its hook. Reuse the shared video-angle-bank.v1 from
  the brand's video-scripts workspace or this run. Prepare angle-context.json with the
  writer's preparation script with `--brief working/script/creative-brief.json` and use
  its strict rule check before review. First run the fetched writer's free
  `python3 <saved-writer-package>/scripts/verify_handoff.py --package-dir <saved-writer-package> --out working/script/writer-handoff-check.json` check against those
  actual saved prepare/lint scripts. Retain the result and script hashes with the run.
  A provided writer package with a missing checker, failed check or unsupported flag
  is incompatible: stop this handoff and refresh the package on the same connection.
  Never use the provisional agent path after a provided package fails validation.
  Only an actual `not_found` for an optional writer permits the explicit provisional
  agent check below; a required writer remains blocked. Never silently remove the brief,
  strict check or new shape requirement to run an older parser.
  Save the sourced brief in the writer's documented
  shape: exact product/variant, buyer situation, supported mechanism, offer/CTA, constraints,
  delivery intent, source references, locked copy, applicable prior decisions and unknowns.
  New custom/template shapes set `requires_creative_brief: true`; both writer and critic
  receive the same angle-context. Carry that brief revision into the scene/tool plan and
  production manifest; missing evidence stays explicit rather than becoming a claim.
- **Already decided stays decided.** The user's angle, hook, batch concept, recipe choice
  or remix direction is binding. Preserve the selected angle id. Compare executions or
  hooks inside it; do not reopen the angle choice. An incompatible promise needs a
  supported execution or an explicit format change before production.
- **The recipe owns the production contract.** Its story mechanism, speakers, timing,
  text limits and visual capabilities win. Inspect the actual recipe and available assets;
  a catalogue card alone cannot establish fit. An impossible essential visual blocks
  the proposal until repaired. Do not force a testimonial into every format.
- **Research only what is missing.** Fetching the miner does not spend or rerun research.
  Reuse current facts and prior evidence. The Brain search's evidence brief (citations, the
  state of each query and open gaps) is the first source for the brief's source references and
  prior decisions. If paid collection is needed, its permission
  rides in the existing choices round. A new product with no reviews can use verified
  facts and a feasible demo; do not require paid research merely to fill a quote quota.
- **Choose eligible concepts only.** Take the strongest supported concept and validated
  hook into review, with up to two viable alternatives when the direction is open.
  Do not pad three concepts or select the highest-ranked rejected one. If all fail,
  repair within the brief and recipe before Step 3.
- **Optional writer not found or unavailable research.** Only when the optional writer
  returns `not_found`, complete an explicit agent check of claim support, recipe limits,
  visual feasibility and hook payoff. Record missing provenance and say in the review when
  research is provisional. A provided incompatible writer or another fetch error stops
  the handoff. Never report a failed check as a pass.
- **The user's exact lines** remain verbatim; use report-only checks and raise material
  timing, claim or format conflicts without silently rewriting them.
- **No spoken words.** Still fit the visual promise, reveal, cards and CTA to the silent
  recipe. Skip speech writing and spoken checks, not the strategy step.
- **Keep private provenance separate.** Store source quotes and links in the research
  workspace; put only a concise strategy explanation in remixable review data.

## Shared editorial craft inside this template flow

Fetch `video-production-harness` and read its `references/editorial-review.md`,
`references/specialist-handoff.md` and `references/hook-compatibility.md`, plus the
review/edit/polish/promote/wrap steps when used. Verify every named file is returned as
nonempty text before relying on that package. A version/content hash alone cannot establish
that the required guides were published. Missing guides block new template creative work
before project writes or paid previews; resolve the package on this same connection. Keep
an unchanged approved resume on its recorded package and approvals.
Save the fetched version/content hash with this run's capability records. These supply
craft and evidence rules inside the template flow; this entry's existing review, paid
approval, storage and two-repair limit still apply.
Do not turn a template into a custom project or import the custom host's extra gates.

Before executing a fetched recipe atom, pass the exact brief/script revision, scene/beat IDs,
timing, selected product/assets/source windows, performance choice and expected output roles.
Check actual scripts/dependencies and free runtime readiness, then validate returned media
against that handoff. An interrupted run reuses valid approved media with matching digest;
a file merely existing does not prove validity. A missing package/required renderer blocks
that route before paid generation, with a concrete supported alternative for review.

Rough review asks what the cut communicates and whether the proof/payoff serves the hook;
fine review diagnoses performance, sequence and local execution; final review checks each
actual export. Save the received message from the cut before comparing with the brief where
possible. A technically clean incoherent cut returns to script/sequence work; a local caption
defect gets a local repair. These internal questions share existing review surfaces.

Before a hook change, classify same-promise compatible opening versus new-promise/body recut.
For example, an automatic report supports “stop copying campaign results”; it does not alone
prove “know where to spend the next dollar.” Propose required script/body/coverage changes for
the latter. Every restyled opening gets fresh image/action/audio/text review even when words
are unchanged. Fetch the existing `render-hook-replacement` before selecting that route;
a not-found/empty result stops it before generation. Use its actual preflight and preservation
checks when available; never build a duplicate renderer or infer publication from source.
Compare complete labeled candidates, retain source/body/ending and record the hypothesis.
No quality score or recommendation is an observed performance winner.

## Step 3 — assemble the review set, then get ONE approval (before the expensive render)

This is a **review-once** flow: save the whole review set to the project, get ONE approval in this
chat, then run the
expensive render + any remaining paid work end-to-end. Never spend on the expensive render before
approval, and don't drip pieces out one at a time and re-pause.

**What goes in the review — show the REAL cheap pieces, PROMPT only the expensive render.** Split
every piece three ways by cost, NOT just "free vs paid":
- **FREE** (an iMessage / Apple-Notes HTML mockup, a text/CTA line — rendered locally, no proxy
  call) → generate NOW and mirror the real asset.
- **CHEAP paid** — a single still/image, the creator/avatar frame, the end card, a short voiceover
  or music bed (each costs cents → roughly **≤ 100 credits**) → **generate these NOW too** and
  mirror the real asset. The few credits buy a real review: the user SEES the actual creator face
  and end card and HEARS the VO, instead of judging a prompt. **This OVERRIDES any recipe rule that
  says to gate ALL paid calls** — only the expensive render below is gated.
- **EXPENSIVE paid** — the video take / final AI render / per-line lipsync clips (hundreds of
  credits) → do NOT generate. Put its **exact prompt/spec** (+ ref image URLs) in the tile. This is
  the ONE thing approved as a prompt (you can't preview a hundreds-of-credits video for free); it's
  generated only in Step 4.

**The expensive render's exact prompt must be in the panel BEFORE you ask for approval** — so a
single "go" runs it (plus any remaining paid work) without re-pausing mid-run.

**Show every cost in CREDITS, never dollars.** 1 credit = $0.01 and media generations bill at
provider-cost × 1.2, so **credits ≈ round-up(provider-$ × 120)** per generation, plus a flat
**200-credit base per video**. Convert any $ figures to credits and show ONLY credits to the user —
never print a "$…" amount.

**Never assemble/stitch the finished video for review.** The review is of the individual pieces (or
their prompts) — never a "full cascade" / "approved cut" clip. Building the whole video before
approval defeats the gate (the user opens the review to an already-finished video) and wastes the
render (GOOSE-2542). The full video is assembled ONLY in Step 4, after approval. A `video`
ingredient here is only a genuinely separate SOURCE clip the format needs (e.g. supplied b-roll).

1. **Assemble every piece the format needs — not just the script.** Read the recipe for the exact
   list. For a podcast skit that's the **script** (both hosts' lines), the two **host stills**,
   one **voice sample per host**, and the **end card**; an iMessage video has the bubble thread,
   the conversation image(s) and the end card. For each piece, decide FREE / CHEAP-paid /
   EXPENSIVE-paid (above):
   - **FREE or CHEAP paid** (≤ ~100 credits) → generate it now and upload it with
     `media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path:
     "working/review/<name>", ingredient_key, input_digest, source: { type: "file", filename:
     "<name>", content_type } }` → PUT → `media_confirm { brand_id, media_id: media.id }`;
     after confirmation succeeds, set that
     piece's `path` (+ `media_id`, `ingredient_key`) in `script_drafts` to the project-relative
     `working/review/<name>`. First check "Save as you go" — a piece already saved with the same
     digest is downloaded, not regenerated.
   - **EXPENSIVE paid** → do NOT generate. Put the **exact prompt/spec** (and any ref image URLs)
     in the tile's `text` / `subtitle` so the user reviews what will be spent on. No `path` yet —
     it's generated in Step 4.
   Save **render_estimate.total_credits**: previews already spent + pending render + the 200 base fee.
   Use current server pricing, never a catalog range in place of the full total.
   **Brand check of the script, before it goes in the panel:** every line, caption and on-screen
   text is checked against `working/brand-rules.json`. Nothing in `never_say` appears, in words or
   in meaning (a paraphrase of a banned claim is still banned). Every product detail (name,
   flavour, size, price, ingredient, result) comes from `products[]` or the kit: anything else is
   cut, not invented. Add a `note` ingredient labelled "Brand rules applied" that lists the
   pronunciations used and the rules the script respects, so the user sees them.
   **Answer clarifying questions
   from the project brief FIRST (Step 1.5)** — only ask the user for a field (angle, which product,
   offer/code) the `creative_brief` leaves empty AND the recipe can't default. Do not re-ask for
   anything the composer already captured.
2. **Mirror the whole ingredient set for review** — `video_project_upsert { brand_id, project_id,
   patch: { script: { script_drafts, script } } }`. `script_drafts` is a structured payload of
   **container-tagged ingredients** so the app renders each piece the right way:
   `{ format, scenes?, ingredients: [{ container, label, subtitle?, path?, url?, text? }], render_estimate? }`.
   Each ingredient's `container` tells the app HOW to show it:
   - `image` (a frame shown in the video), `endcard` (the end card), `avatar` (a character
     headshot), `background` → rendered as an image tile.
   - `voice` (a voiceover clip — put the voice NAME in `subtitle`), `music` (the bed),
     `audio` → rendered as an audio player.
   - `video` (a clip) → a video player. `text` (a copy line like the CTA) → a text tile.
   - `script` / `thread` / `note` / `conversation` → the written script (or set `scenes[]`
     for the podcast shape, or pass the readable `script` string).
   **Label every ingredient** ("Hook image", "End card", "Voiceover", "Host A", "HER"). The upsert
   writes no render and costs no credits — it just populates the review panel.
3. **STOP for ONE approval, in this chat.** Only a complete current saved review set with
   render_estimate.total_credits can be approved. Widget: one line, no duplicate plan or app
   link; otherwise print card.text_summary. The choices are Approve, Change and Not now.
   “Not now” keeps the plan. In a coworker sandbox end the turn after saving the review set;
   the customer's approval arrives as the next message.
   Record the explicit yes with `video_project_upsert { brand_id, project_id, patch: { approve:
   { user_quote: "<their exact words>", total_credits: <the saved total> } } }` before rendering.
   A single project requires recorded approval too; never treat an absent approval as permission.
   Changes require an updated saved review, clearing prior approval, and approval of the new
   total. One yes authorizes the remaining approved chain. On insufficient_balance start
   nothing; offer a shorter video or top-up. Remove batch concepts with patch.concepts remove:true,
   then show the changed total before approval.

## Step 4 — render, report stages, publish

1. **Open the render row FIRST** — right after recording the Step 3 approval, before any paid
   generation (if this returns `approval_required`, the approval is missing or was cleared: go
   back to Step 3 and ask in this chat, don't retry):
   `video_render_run { brand_id, project_id, kind: "full" }` (no `dry_run`; returns
   `render_id`) → keep `render_id`, then mark it running:
   `video_render_run { brand_id, project_id, render: { render_id, status: "running",
   workflow_stage: "preparing", progress_note: "starting", progress_percent: 5 } }`. The user sees this
   live in the app and gets a WhatsApp "started" message automatically — don't message them yourself
   about start / blocked / complete.
After EVERY progress callback inspect stop. If true, start no new paid step; record
   status:"stopped" with a plain note and report what is kept and credits used. SPEND_CAP_REACHED
   stops the same way; raising the cap requires patch.approve scope:"raise_cap" and the customer's
   words. Send render.steps with the same neutral names each time and a live count only in the
   current detail; use render.choices when blocked.
2. Now generate every PAID piece you showed as a prompt in Step 3 — the AI stills/video, lipsync
   clips, voice, music — through the media proxies (below), each from its approved prompt, with
   `GW_PROJECT_ID` exported. **Save as you go** (section above): skip any piece already saved
   with the same `input_digest` (download it), and upload each new piece with its
   `ingredient_key` + `input_digest` the moment it passes QC.
   Keep the approved script and review unchanged throughout production and QC; confirmed media
   and progress preserve resume state. Stop and replan/reapprove any material creative change.
   A voiceover made with `data_post_provider` (ElevenLabs `…/with-timestamps`) returns its
   `alignment` only in the reply: write it to `working/vo/<scene>.timestamps.json` at once
   (captions are timed from it) and record the returned `media_id` on the ingredient.
   **Brand pronunciations in every voiceover:** the text sent to the voice has each
   `pronunciations[].term` replaced by its `say_as` (`create-vo-elevenlabs`:
   `gen_vo.py … --rules working/brand-rules.json`; when a render atom calls the voice itself,
   swap the terms in the text you hand it). Captions, on-screen text and the review keep the
   written name. Write `working/approved-script.txt` (the Step 4.3 audio check) with the SPOKEN
   form. **Logo, font, product:** every logo is the file from Step 1.7 composited as-is; every
   product shot uses the Step 1.7 product images as its reference.
   Then assemble per the recipe (ffmpeg stitch; PIL captions / end card;
   Playwright record only where the format needs it and the host has Chromium → `mix-master` audio).
   **Report progress at each milestone** — about one update per milestone, never per poll:
   `video_render_run { brand_id, project_id, render: { render_id, status: "running", workflow_stage, progress_note, progress_percent } }`
   (`progress_note` = plain words the customer reads in the app, ≤200 chars; no model, tool or
   step names):
   - voiceovers done → `"preparing"`, `"voices recorded"`, 20
   - stills done → `"preparing"`, `"scenes designed"`, 35
   - each lipsync / video clip → `"rendering"`, e.g. `"filming scene 5 of 8"`, 35–75
   - assembly → `"rendering"`, `"putting the video together"`, 85
   - QC (4.3) → `"final check"`, 95
   **Hard stop that needs the user** → `{ render_id, status: "running", workflow_stage: "blocked",
   error_message: "<what's wrong + what you need>" }`; an unrecoverable failure → `status: "failed"`
   + `error_message`. Completing (4.4) sets the bar to 100.
3. **MANDATORY final-video QC gate — YOU review EVERY finished master before pinning it
   (`patch.final_render_id`), whatever the format (UGC or not).** This is your own automated quality
   check, separate from the user's Step-3 approval — it does not go back to the user. The render row
   is already open (4.1); this gate stands between a rendered master and PINNING/publishing it, so a
   bad render never gets set as final. A master that looks fine on a still can still have a
   mis-voiced word, a caption drifting off its line, a beat out of order, or a deformation — review
   the actual VIDEO, not stills. Run the passes that APPLY to this format:
   - **Audio ↔ script** — any master with SPEECH (VO or native/Seedance voice); **skip for
     music-only / no-speech formats.** `review-ugc-render` is format-agnostic despite the name —
     a deterministic Whisper transcript-vs-script diff: persist the approved spoken lines to
     `working/approved-script.txt`, fetch `review-ugc-render` (`catalog_fetch`) and run
     `review_render.py --video <master>.mp4 --script-file working/approved-script.txt --json
     working/review-verdict.json` (exit 0 PASS / 2 FAIL / 3 ERROR). For each brand pronunciation add
     `--brand-term "<term>"`, plus `--brand-term` for each word of `say_as` that is not an
     everyday word (the flag strips those tokens from the WHOLE diff, so never pass "a", "one",
     "works" alone): Whisper spells a respelled name back as the brand word ("Goose Works" heard
     as "Gooseworks"), so the diff must accept it. The proof of
     intended delivery is the text/settings you sent (keep them in the review); actual
     pronunciation/performance requires isolated and mixed-audio listening at normal speed.
     Preserve pauses/emphasis and final consonants; never mandate faster or louder delivery.
     Verify a transcript mismatch against the actual audio before calling it a defect. It flags a mis-voiced word
     (approved "human-vetted" → "human witted"), a dropped phrase, or silence. It routes Whisper
     through the gooseworks proxy when `OPENAI_BASE_URL` is set (sandbox:
     `$GW_WHISPER_PROXY_URL/v1`); with no backend at all, run `fal-ai/whisper` via the FAL proxy
     and diff the transcript yourself.
   - **Captions / subtitles** — ANY captioned format (the most common non-UGC defect); **skip for
     UGC/Seedance masters, which carry no subtitle track.** Diff the caption file you burned
     (SRT/ASS/PNG cue list) against the SAME Whisper transcript + word timings — every caption line
     must match the heard/scripted words and sit within ~0.3s of when they're spoken; then in the
     visual pass below, inspect each cue and its start/end boundaries in actual frames, plus
     full-speed playback at destination size, to confirm reading time, product visibility,
     hierarchy and no duplicate overlay or end-card collision. Silent/text-led formats use
     approved visible wording and reading windows, not nonexistent speech timings. Mismatched text or >0.3s drift fails the gate.
   - **Visual + structure** — always: run the `watch` skill on the master — beat/scene order + SFX,
     the brand's product (not the source's) is shown, the end card has the brand's logo file (or its name set in the brand font) + code, no
     deformation/artifact, duration within ~20% of the source.
   - **Finished ad + brand fidelity** — always: fetch `review-finished-ad` (`catalog_fetch`,
     `pip install --quiet numpy pillow` if needed) and run
     `review_finished_ad.py --video <master>.mp4 --json working/review/finished-ad.json
     --sheet working/review/finished-ad-sheet.png --logo <the logo file the video composites>
     --palette "<kit palette, comma-separated>" --product-images <the Step 1.7 images>
     --font <brand font file> --brand-name "<name>" --endcard-s <end card length>`. Pass the
     file that is ACTUALLY on screen (the kit logo, or the recipe's wordmark file). When the video
     shows only the brand name as text (`"logo": {"mode": "text"}`), omit `--logo` and judge the
     text on the sheet. Add `--no-speech` for a format with no VO or dialogue, `--logo-at <s>` for
     each mid-video logo, and any gate flags the recipe's instructions name (a chat format's
     reading holds need a longer `--max-freeze-s`). Exit 0 PASS / 2 FAIL / 3 ERROR. It
     checks size, hook, pacing, dead air, black frames, the kit logo on the end card
     (a wrong, redrawn or favicon logo fails) and the palette. **Then open the sheet it writes
     and judge every line of its `judge_on_sheet`:** captions/CTA/logo outside the red safe
     zones, the brand font, every product shot matching the product images, the product the same
     in every scene, the logo unaltered. A failed eye check is a FAIL like any other.
   - **Output size** — always **1080×1920 (9:16)**. Video ads are only ever 9:16. Lipsync / video
     models often return 720p or odd sizes — scale (and pad if the aspect differs) every clip to
     1080×1920 BEFORE the concat, never ship the model's native size.
   Save exact output checksum/version, first-to-last normal-speed playback and full-audio
   coverage. Frame sheets, transcripts and process success do not substitute for listening or
   continuous motion. Missing required capability leaves review incomplete/blocked. Each
   supported crop, duration, language or caption derivative needs its own actual-file review;
   unsupported destination requirements need a reviewed route, never a silent export change.
   Honor intended silence, loops and endings rather than forcing music or fades on every ad.
   If ANY applicable pass fails, FIX it (regenerate/stitch the offending window, re-composite the
   end card from the real logo file, rebuild captions) and re-run the passes — only a clean pass
   proceeds to pinning. **At most 2 repair rounds.** If a pass still fails after them, do NOT pin
   and do NOT present the video as finished: upload it (4.4) and close the row with exactly
   `video_render_run { brand_id, project_id, render: { render_id, status: "complete",
   workflow_stage: "blocked", quality_status: "blocked", repair_pass_count: 2, output_url,
   thumbnail_url, quality_report } }` (the failing checks as `fail` in the report), and tell the user plainly in
   chat which checks failed, what you tried, and the choices (fix a specific thing, re-roll, or
   use it anyway). Pin it only if they say to use it anyway. The app shows a blocked render as
   "Needs attention". **This gate is universal: it runs from this skill for every format, so a
   recipe never has to opt in.**
4. **For a passing final, create the finished-video checkpoint first**, following "Finished video, interrupted saving"
   above. With the CLI, use its prepare/resume flow instead of duplicating the writes below; it
   saves the same already-opened render and pins only the checked output. Save the final review set
   and production manifest (Step 4.5/4.6) before preparing that checkpoint. Without it, follow the
   same durable protocol. A blocked version follows Step 4.3's existing upload/report-only path;
   never route it through the passing-final helper or pin it automatically.
   Publish: `media_upload { brand_id, scope: "video_project", scope_id: project_id, kind: "render",
   path: "working/final.mp4", ingredient_key: "final", input_digest, source: { type: "file", filename: "final.mp4", content_type:
   "video/mp4" } }` → PUT the master to `upload.url` with `upload.required_headers` →
   `media_confirm { brand_id, media_id: media.id }`. Same for the poster (`kind: "thumbnail"`, `path: "working/final-thumb.jpg"`, `ingredient_key: "final-thumb"`).
   Keep each `upload.render_file_url`. Verify the PUT returned 2xx and the file you uploaded is a
   real, non-empty MP4 (ffprobe it), and require both confirmations to succeed BEFORE marking
   the render complete.
   Then `video_render_run { brand_id, project_id, render: { render_id, status: "complete", output_url, thumbnail_url } }` (attach the Step 4.3 verdict as `quality_status: "passed"` (or
   `"blocked"` when the gate still fails after 2 repair rounds) + `quality_report` — ALWAYS
   attach it; a batch concept cannot complete without a passing one; exact shape, strict (no extra keys):
   `{ version: 1, summary: string, checks: { source, brand, product, hook_and_scene_order,
   voice_and_script, captions, endcard_and_cta, duration_and_ratio, visual_artifacts }, detected_issues?:
   string[], repair_actions?: string[] }` where EVERY check is `{ status: "pass"|"fail"|"not_applicable",
   note?: string }`). Fill each check from the Step 4.3 passes: `brand` ← logo_asset + logo +
   palette + font + logo unaltered; `product` ← product likeness + product consistency;
   `hook_and_scene_order` ← hook + pacing + the `watch` beat order; `voice_and_script` ← the
   Whisper diff (pronunciations included) + no `never_say` line; `captions` ← the caption diff +
   safe zones; `duration_and_ratio` ← ratio + duration; `visual_artifacts` ← black frames +
   frozen stretches + the `watch` pass; `endcard_and_cta` ← the end card holds the real logo +
   CTA. Put each failing check's note in `detected_issues` and each fix in `repair_actions`.
   **output_url MUST be the durable render-file URL**
   (`upload.render_file_url`, i.e. `/api/ads/projects/<project_id>/render-file?path=working/final.mp4`
   — the app re-presigns it on every view) — NEVER a raw proxy/CDN/presigned URL (those expire).
   Same for `thumbnail_url`.
5. **Save the final review set BEFORE pinning** — it must describe the video you actually rendered.
   Only after all paid production, QC, repairs and pending provider work are finished and settled,
   save one final descriptive/provenance update: confirmed pieces, exact settings and repairs that
   preserve the approved creative choices. Material creative changes, including changed lines,
   look, timing, captions or music, require a changed complete plan, total and fresh approval BEFORE
   the changed production. Never relabel a changed plan as provenance or silently reuse approval.
   In the checkpoint flow, save the final review before Step 4.4; do not rewrite it afterward merely
   to follow the numbered order. Resume checks that this reviewed set stayed unchanged.
   When final provenance needs updating, upsert the review set once:
   `video_project_upsert { brand_id, project_id, patch: { script: {
   script_drafts, script } } }` with the final lines, final pieces (mark generated takes as done, not
   "not generated yet") and the settings you used. The project keeps this, not your chat: it is
   what the app shows, and what a Community remix of this video copies. Instructions that live only
   in this conversation are lost when it ends. **Keep the approved detail**: never shorten a piece to a
   summary (e.g. per-scene prompts or their "no shake / no letterbox" guards). Only update what changed.
   After this write, do not start new paid work. Save the production manifest, prepare the final
   checkpoint and complete the same render with its existing finishing allowance and guards.
6. **Save the production manifest** — HOW you made it, so the next run (or a remix) starts from what
   worked instead of rediscovering it: `video_project_upsert { brand_id, project_id, patch: { production:
   { version: 1, pipeline: [{ step, model, purpose?, settings? }], style: { prompt, negative, notes? },
   characters: [{ name, prompt }], scenes: [{ id, line, still_prompt, motion_prompt, duration_s }],
   voice: { voice_id, name, model, settings }, music: { prompt, model, length_s }, assembly: { … },
   fixes: [{ problem, fix }], notes? } } }`. Use the exact models and prompts you sent (full text, guards
   included), and list every fix you had to make (e.g. "VO ran 47s → tightened four lines, voice 1.08x";
   "hair drifted → restated the hair colour"). No URLs, keys or raw logs; it must stay under 48 KB.
   In the checkpoint flow, save this before Step 4.4 too and skip the duplicate write afterward.
7. Pin it — only a `passed` render (or a `blocked` one the user said to use anyway):
   If checkpoint recovery already verified selection of this render, skip this duplicate write.
   An unfinished checkpoint must use the guarded selection protocol above; never replace it
   with an unguarded pin.
   `video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }`,
   then use the returned card: widget hosts get one line and no duplicate links; text hosts get
   card.text_summary and the returned delivery links verbatim. Never end with a local file path.

Narrate each long step in one line via `video_project_upsert { brand_id, project_id, patch:
{ message: { role: "agent", content } } }` — never sit silent on a queue > 90s. Write it for the
customer ("Filming the scenes, about 5 more minutes"), per "How to talk to the customer" above.

## Media generation — the GooseWorks proxies (queue loop)

Media APIs go through GooseWorks proxies; do NOT use an SDK's default host (your token isn't a
FAL/ElevenLabs token → 401, and in a sandbox a raw provider call is never allowed). Prefer the
atoms' own `media_proxy.py` (`fal_generate`, `fal_generate_video`, `eleven_music`, …) — it already
handles auth, the queue host-swap, project attribution (`GW_PROJECT_ID`) and failure logging.

- **Sandbox:** FAL base = `$GW_FAL_PROXY_URL`, ElevenLabs = `$GW_ELEVENLABS_PROXY_URL`, FAL
  storage = `$GW_FAL_STORAGE_PROXY_URL`; auth = `?token=$GW_MEDIA_PROXY_TOKEN` (or
  `Authorization: Bearer`), plus `&project_id=$GW_PROJECT_ID`. The token already names the agent.
- **Local:** base = `<api_base>/api/internal/<proxy>` (`fal-proxy`, `fal-storage-proxy`,
  `elevenlabs-proxy`); pass `?token=<api_key>&agent_id=<agent_id>&project_id=<project_id>`
  (agent_id bills the Ads agent; project_id attributes the spend to this ad project so the user
  sees per-project spend in the app. ALWAYS pass it).

**FAL queue gotcha** (#1 waste of generations): submit returns `status_url`/`response_url` on
`queue.fal.run` (the real host, not the proxy). Polling those 401s forever — rewrite their host
to the proxy base (keep the path), re-add the auth params. Only the final `*.fal.media`
file is a real public URL. Helper (works in both modes):

```python
import json, os, pathlib, time, requests
from urllib.parse import urlparse

def _cfg():
    """(fal_base, token, agent_id). Sandbox env first, then ~/.gooseworks/credentials.json."""
    tok = os.environ.get("GW_MEDIA_PROXY_TOKEN")
    if tok:
        base = os.environ.get("GW_FAL_PROXY_URL") or os.environ["GW_API_BASE"].rstrip("/") + "/api/internal/fal-proxy"
        return base.rstrip("/"), tok, None
    c = json.loads(pathlib.Path(os.path.expanduser("~/.gooseworks/credentials.json")).read_text())
    return c["api_base"].rstrip("/") + "/api/internal/fal-proxy", c["api_key"], c.get("agent_id")

def _params(tok, agent):
    p = {"token": tok}
    if agent: p["agent_id"] = agent
    pid = os.environ.get("GW_PROJECT_ID")
    if pid: p["project_id"] = pid  # attributes the spend to this ad project
    return p

def fal_generate(model_path, payload, timeout_s=180, poll_s=3):
    """model_path e.g. 'fal-ai/nano-banana-2/edit' (the recipe names the model).
    Export GW_PROJECT_ID first. Returns the result image URL (a public *.fal.media URL)."""
    base, tok, agent = _cfg()
    sub = requests.post(f"{base}/{model_path}", params=_params(tok, agent), json=payload).json()
    to_proxy = lambda u: base + urlparse(u).path
    status_url, response_url = to_proxy(sub["status_url"]), to_proxy(sub["response_url"])
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        st = requests.get(status_url, params=_params(tok, agent)).json()
        if st.get("status") == "COMPLETED":
            return requests.get(response_url, params=_params(tok, agent)).json()["images"][0]["url"]
        if st.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(f"FAL failed: {st}")
        time.sleep(poll_s)
    raise TimeoutError("FAL polling exceeded timeout")
```

ElevenLabs (VO / music) is the same shape against the ElevenLabs proxy base. To feed FAL a local
file (a product image, a VO track), it must be a PUBLIC URL: upload it with `media_upload`
(`scope: "video_project"`, source `file`, no `path`) → PUT → `media_confirm` and use the returned
`media.url` if it is a public https URL (curl it: HTTP 200 without auth), or host it through the
FAL storage proxy. Never pass a `render-file` URL to a provider — it needs app auth.

## Follow-up actions use the watched version

Keep original note text, exact source render/time and intended viewer effect. Record an
acceptance condition and disposition in existing feedback/project artifacts; applying a
command means changed, not verified. Consolidate duplicates without deleting their source
IDs. Conflicting “calmer” and “more urgent” instructions need the authorized decision owner's
recorded choice, even if they touch different files. Offer concrete cheap alternatives for
“more premium” inside the approved scope before escalating taste.

Map changed copy/performance/shot/pause to affected picture, timings, captions, music/SFX,
approvals and derivatives; preserve unrelated approved work. Rewatch the full candidate and
verify the original effect before resolving a note. Accepted final, candidate and original
note source remain distinct across selection and rollback. Keep editable script/timeline,
source assets/takes, stems, captions, package versions and prior decisions in the existing
production manifest/history; retrieve applicable rejections/pronunciation/delivery rules
before a related brief. Project taste is not a standing brand rule. Record audience results
only with actual variant/audience/placement/objective/window; otherwise unavailable.

- “Fix this”: use the render/project context attached to the message (or named version, else
  the final one). Save patch.fix { of_render_id, changes, total_credits }. Never replace a supplied
  watched render with the final. After explicit approval save patch.approve { user_quote,
  total_credits, scope:"fix" }, then video_render_run { kind:"partial", fix_of_render_id }.
  Re-make only changed scenes, keep earlier versions and charge no second base fee.
- “Make 3 more like this”: video_project_upsert { brand_id, name, remix_of_project_id,
  remix_of_render_id, vary, concepts:3 }. Preserve a provided watched render; omit only when none is named.
- “Test 1 of each”: approve only:"test"; “Make the other N”: only:"rest". “Stop the rest”:
  job_cancel { job_id:<batch_id> }. Finished videos stay saved.
- Share for review uses patch.share_for_review { subject }; return the real link.

## Rules

- **Canonical MCP tools first** (`video_project_read`, `video_project_upsert`, `catalog_fetch`,
  `media_upload` + `media_confirm`, the `video_render_run` render-row actions, `account_whoami`);
  legacy names only when the client lacks the canonical tool.
- **A missing key is never a blocker.** Paid media goes through the proxy: a one-off image or clip
  is `data_post_provider { provider: "fal", … }` + `job_get` (see "Paid media over the MCP");
  never ask for FAL_KEY, never use `photos_generate` for anything but a physical product.
- **The CLI and credentials.json are optional.** In a GooseWorks sandbox (`GW_MEDIA_PROXY_TOKEN`
  set) use the env proxies and `catalog_fetch`; never call a provider with a raw key.
- **No Chromium in a sandbox** — a browser-rendered format stops there, before any spend, and says so.
- **Toolchain before spend** — common checks use `gooseworks doctor --no-browser`; every selected
  browser renderer must also pass `--renderer-script` or its equivalent exact-runtime launch
  check in Step 2. Stop with the folder-specific fix if anything is missing.
- **Assemble the whole review set first**, mirror it with `video_project_upsert patch.script`, and
  get ONE approval in this chat, recorded with `patch.approve`, BEFORE the expensive render
  (review-once). Never send the user to the app to approve; the app is only for reviewing.
- **Show the REAL cheap pieces; PROMPT only the expensive render.** Generate the FREE + CHEAP-paid
  pieces (≤ ~100 credits — stills, creator frame, end card, short VO/music) and mirror the real
  assets; put ONLY the expensive video take/render in the panel as its exact prompt. That prompt
  must be in the panel before you ask to approve, so a single "go" runs the render + any remaining
  paid work (→ QC → publish) with no re-pausing.
- **Operator may be absent (sandbox):** decide mechanical choices yourself; ask in chat only for a
  true taste call.
- **Costs in CREDITS, never dollars.** credits ≈ round-up(provider-$ × 120) per generation + a flat
  200-credit base per video; never show a "$…" figure to the user.
- **Never assemble the full video before approval.** The review shows the
  individual PIECES, never the finished cut (or their prompts) — not a
  stitched/composited cut; do not add a "full cascade" / finished-video clip
  as a review ingredient (GOOSE-2542). The assembled video is produced only in
  Step 4.
- **Open the render row at the start of Step 4** (4.1, after the approval) and keep its stage /
  progress current; mark it `complete` only after the master passes QC. `output_url` = the
  durable render-file URL, never a CDN URL.
- **Always export `GW_PROJECT_ID`** (and pass `project_id` on hand-rolled proxy calls) so the
  credits attribute to this ad project.
- **Verify a real, non-empty MP4** (watch it) before marking the render complete.
- **Reuse the brand** when its research is complete; never re-research.
- **Brand rules first:** load kit + products + learnings (Step 1), write `working/brand-rules.json`
  (Step 1.7), and follow it: pronunciations in every voiceover, nothing from `never_say`, product
  facts only from the product rows, the kit's logo FILE (never a generated or favicon logo), the
  brand font, this product's own images.
- **Save brand corrections** from chat with `brand_update patch.facts` in the same turn, and say so.
- **Finished-ad gate on every master** (`review-finished-ad` + the sheet); at most 2 repair
  rounds, then publish as `blocked` with the report and warn the user — never pass off a failing
  video as finished.
- On a hard error (auth/quota/model/timeout) set the render `failed` with a short
  `error_message` (`video_render_run { …, render: { render_id, status: "failed", error_message } }`) and stop — don't ship the source unchanged. **Also log
  it** (see "Report problems") so we can see + fix it.
- Finish according to card.display_hint: widget hosts get one short line without duplicate links;
  text hosts get card.text_summary and the returned delivery links verbatim.

## Use uploaded footage

When the customer asks to use existing footage, check the actual advertised schemas. Use `media_search` with purpose `production`, kind `video`, the brand and current project when needed. Omit query spend for free retrieval. Read facts/scenes with `media_analyze`, then use `media_excerpt` action `inspect` to review actual bounded frames and timed transcript before selecting. A description or thumbnail URL alone is not visual review.

Freeze `source_excerpt:{asset_id,analysis_revision,scene_id,start_ms,end_ms,audio_mode}`. Revision is the original-byte SHA, scene may be null for a known user trim, bounds use integer milliseconds, and audio is original or muted. Call `media_excerpt` action `attach` with that exact selection and a stable idempotency key. The returned project remains unfinished and unapproved. Open its existing Studio review; preserve user locks and requested format, and keep footage separate from image packshot indexes. An incompatible format requires an explicit choice before changing it.

For custom production, fetch the current shared `video-production-harness` and follow script/ingredient gates. Download the verified original and trim its exact selected window at normal speed with the approved audio. Recheck current revision and production permission before consumption and final upload/completion. Save excerpt lineage in plan and ingredient readback. Missing optional semantics does not require another upload; known user-selected stored footage remains usable. Research and competitor references never become production footage. Selected originals require no paid generation; only newly generated/replaced ingredients consume the approved budget.
