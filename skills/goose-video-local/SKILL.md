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
  video_project_read. Not for a hosted connector with no shell. To start a NEW video ad in chat,
  use goose-video first.
category: ads
version: 0.5.0
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, podcast, ugc, local-render, sandbox, byoa]
---

# GooseWorks Video Ads — local remix runtime

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
   (no `path`) and use the returned `media.url`.
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
| Save a brand rule (a correction) | `brand_update { brand_id, patch: { facts: [{ id?, kind, text }] } }` | none |
| Mirror the review set | `video_project_upsert { brand_id, project_id, patch: { script: { script_drafts, script } } }` | `update_ad_project_script` |
| Project assets | `video_project_upsert { …, patch: { assets: [...] } }` | `update_ad_project_asset` |
| Progress note | `video_project_upsert { …, patch: { message: { role: "agent", content } } }` | `append_project_message` |
| Batch status | `video_project_upsert { brand_id, batch_id, patch: { batch: { status } } }` | `update_ad_video_batch` |
| Upload a file to the project | `media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path, source: { type: "file", filename, content_type } }` → PUT (no confirm for `path` uploads) | `get_upload_url` / `get_ad_upload_url` |
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
  approval still applies: the approval may arrive in this chat or from the app's
  "Approve & render" button.
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
  2. **CLI present →** run `gooseworks doctor` (checks login, MCP, Node 18+, ffmpeg with
     libx264 + libass, ffprobe, and that Playwright's Chromium is actually DOWNLOADED, in one
     shot). Fix any ✗ with the command it prints, then continue.
  3. **No CLI →** check the toolchain yourself: `node --version` (18+), `ffmpeg -version`,
     `ffprobe -version`, and the Chromium browser itself — `npx --no-install playwright install
     --dry-run chromium` prints the install location; if that folder is missing, run
     `npx playwright install chromium`. A resolvable `playwright` package with no browser
     downloaded is the classic false pass. The `watch` QC step later needs the same ffmpeg and,
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
  `upload.render_file_url`. PUT the bytes with exactly those headers. **Do NOT call
  `media_confirm` for a `path` upload** — it is a workspace-file upload and the server rejects
  confirm on it ("not created through a presigned upload"); `media_confirm` is only for a
  path-less upload. Never hand-build storage paths or agent prefixes; a bare workspace upload is
  invisible in the app.
- Media generation (FAL / ElevenLabs) through the GooseWorks proxies is the **REAL spend** — billed
  per call as you generate (Step 4). The render row (`video_render_run kind: "full"`) charges the flat
  **video base fee once, when a full render is reported `complete`** — so open it only once you
  actually have a rendered master (Step 4.1/4.2), and never open a second row on a guess (a second
  completed row bills again). The final-video QC gate (Step 4.3) then sits between
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
status except archived is included (project-path uploads stay `pending` — that is normal).
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
content_type } }` → PUT the bytes to `upload.url` with `upload.required_headers` (no
`media_confirm` for a `path` upload). Kind: `audio` (VO), `music`, `image` (a still),
`video` (a clip), `endcard`, `document` (captions / a JSON sidecar), `render` (the master),
`thumbnail`. Re-uploading the same key is fine — the newest wins. A piece that FAILED QC is never
uploaded under its key. **Save a piece's sidecars with it** under `<key>.<name>` — e.g. the VO's
char-level timestamps as `vo/scene-03.timestamps` (`kind: "document"`, same digest). Captions are
built from them; without them a resumed run has to fall back to Whisper timings, which mis-case
brand names.

**4. Record it in the ingredients list.** Put the piece's `media_id` (`media.id`), `path`
and `ingredient_key` on its entry in `script_drafts.ingredients` and mirror with
`video_project_upsert { brand_id, project_id, patch: { script: { script_drafts } } }`. Batch this
script patch every 3–5 pieces (and always once more when a stage ends) to limit calls — the
`media_upload` itself is what makes a piece safe, so it is never batched.

The `final` master and `final-thumb` poster (Step 4.4) carry `ingredient_key` too, so a
resumed run that finds a passing `final` with the same digest only needs to publish.

## Step 0 — project id, or video BATCH id? (fan out before anything else)

The handoff is EITHER a single `project <id>` OR a `video batch <id>`. A batch is
the app's "N concepts" flow: one composer submission fans out into **N independent concept projects**
(the user picked a concept count, default 3), and the app expects EACH to be rendered. **Handle both:**

- **`project <id>`** → you have one project. Treat it as a batch of one and continue to Step 1.
- **`video batch <id>`** → call `video_project_read { brand_id, batch_id }`. It returns every child
  concept under `projects[]` — each is a normal project with its own `id`, `variant_index`
  (Concept 1..N), and its own `creative_brief` (the per-concept angle/hook/offer/message). **You
  MUST process every concept, not just the first** — dropping concepts 2..N is the #1 batch bug.

**Loop shape (one agent, sequential, ONE approval for the whole batch):**
1. Run **Step 1 + Step 1.5 + Step 2 + Step 3-assemble** for EACH concept project (each has its own
   `project_id`, brief, `GW_PROJECT_ID` and `working/` folder — never cross-write between concepts).
   The brand read (Step 1 item 3) and `brand-rules.json` (Step 1.7) are per BRAND: do them once for
   the batch and copy the file into each concept's `working/`. The read is ~90K characters.
2. Mirror EVERY concept's review set (Step 3's `video_project_upsert patch.script` per project),
   then stop for **ONE** approval that covers all concepts — show the per-concept credit estimate
   and the batch total. Set the batch to `review` (`video_project_upsert { brand_id, batch_id,
   patch: { batch: { status: "review" } } }`).
3. On approval, set the batch to `rendering` and run **Step 4 (the expensive render)** for each
   concept **sequentially** (finish Concept 1's master before starting Concept 2 — one machine can't
   render them in parallel). Deliver each (Step 5). When every concept is pinned, set the batch to
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

### Step 1.5 — the project brief is AUTHORITATIVE (honor it; don't re-ask)

The composer already collected the user's creative direction onto the project. **Read it and treat
it as ground truth — it OVERRIDES the template recipe's defaults, and it REPLACES the clarifying
questions you would otherwise ask.** Only fall back to the recipe default (then, last, to asking)
for a field the brief leaves empty. Map the fields you WILL honor:

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

2. `catalog_fetch { type: "template", slug: <source_sample_id> }` → the source video: `media_url`,
   `recipe`, `format` (e.g. "podcast-skit", "imessage"), `extracted_script`, `how_to`, `remix_spec`.
3. Brand gate: `brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }`
   (older clients: `brand_get_context` with the same sections). Ask for all four: the default
   leaves out the kit and the brand's saved rules, and a video made without them is off-brand.
   If the kit's `researchStatus` (or the brand's `research_status`) is `complete`, REUSE it —
   never re-research. If not, run brand research first (`catalog_fetch { type: "skill", slug:
   "brand-research" }`, follow it, then `brand_update { brand_id, patch: { kit_patch,
   finalize_research: true } }`) before continuing. Then do Step 1.7.

### Step 1.6 — a remix of a FINISHED video (the project read has a `remix` block)

A project made from **Community videos** remakes another customer's finished video for THIS brand.
Its `video_project_read` returns a top-level `remix` block
(`{ remix_of_project_id, instruction, direction }`), and `reference_video_url` is that finished video.

- **Watch the reference video first** (download `reference_video_url`, pull frames + the transcript).
  It is the target: match its structure, beat order, pacing, framing, look, voice and tone.
- **`remix.direction` is its approved review set** (scenes and lines, set/look notes, take prompts,
  captions, music, voice). Start your review set from it instead of the template's defaults; it
  already carries every change that customer made to the template.
- **Rewrite everything for THIS brand.** "[source brand]", "[source product]", "[link]", "[email]"
  and "[code]" mark the other customer's details: never write them, and never reuse their claims,
  numbers, URLs, offers or CTA. Every product, claim, name, image and CTA comes from this brand's
  kit, products and media. Their footage (screen recordings, product shots) and their creator face
  are NOT carried over: use this brand's own assets and make a new creator from the description.
- Precedence: this project's own `creative_brief` and assets (Step 1.5) > `remix.direction` >
  the template recipe's defaults.
- In the Step 3 review, say it is a remix of that video and list what you kept vs. changed.

### Step 1.7 — the brand rules file and the brand assets (every run, before any writing)

Write `working/brand-rules.json` from the Step 1 brand read. Every later step reads THIS file,
not your memory of the chat:

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

- **Sources.** `learnings` are the brand's saved rules (the user's past corrections among them):
  `must` / `do` → `must_say`, `dont` → `never_say`, and a `must` whose text reads
  `Pronounce "<term>" as "<say_as>"` (straight or curly quotes) → `pronunciations`. Add `kit.instructions` (free-text
  standing rules) to `must_say` / `never_say` as they read.
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

`brand_update { brand_id, patch: { facts: [{ kind, text }] } }`

| Correction | `kind` | `text` |
|---|---|---|
| Pronunciation | `must` | `Pronounce "Acme" as "ak-mee"` (exactly this form) |
| A claim or word to avoid | `dont` | `Never say or imply: <the claim>` |
| Something that must be said | `must` | `<the rule>` |
| A product fact | `must` | `<product name>: <the fact>` |
| A visual rule | `do` / `dont` | `<the rule>` |

- If it changes an EXISTING rule (a new pronunciation for the same term), update that rule by id
  (`facts: [{ id: <learning_id>, text }]`) instead of adding a second one.
- Then tell the user in one line: "Saved to your brand: every future video will use it." Update
  `working/brand-rules.json` and apply the rule to THIS video too.
- A one-off note about this video ("make it shorter", "use the blue background here") is NOT a
  brand rule: don't save it.

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
renderer), `npm install` in its folder so its `generate.js` + Playwright resolve, and point the
recorder's `NODE_PATH` at it — local machines only; in a sandbox that format stops (no Chromium).

> **Migration note:** older phone-mockup formats (`imessage` / `chatgpt` / `apple-notes`) whose DB
> recipe does not yet carry `atoms` / `instructions` still hold the legacy `recipe.thread` payload;
> migrate them to this shape (capabilities + instructions in the DB) — do not reintroduce a CLI map.

## Step 3 — assemble the review set, then get ONE approval (before the expensive render)

This is a **review-once** flow: put the whole review set in the app, get ONE approval, then run the
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
     "<name>", content_type } }` → PUT (no `media_confirm` for a `path` upload); set that
     piece's `path` (+ `media_id`, `ingredient_key`) in `script_drafts` to the project-relative
     `working/review/<name>`. First check "Save as you go" — a piece already saved with the same
     digest is downloaded, not regenerated.
   - **EXPENSIVE paid** → do NOT generate. Put the **exact prompt/spec** (and any ref image URLs)
     in the tile's `text` / `subtitle` so the user reviews what will be spent on. No `path` yet —
     it's generated in Step 4.
   Include the **estimated cost in CREDITS** (never dollars) of the cheap pieces already generated +
   the pending render, so the user approves knowing the total spend.
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
3. **STOP for ONE approval.** Hand the user the project's `app_url` and tell them to review the
   pieces there and hit **"Approve & render"** (that button gives them a short message to paste
   back). In a **GooseWorks sandbox** the chat you are in is the app: post a short summary (pieces,
   total credits, the expensive prompt) plus `app_url`, and accept approval from this chat or from
   the button. Do NOT render until that approval arrives. If they want changes, regenerate the
   affected ingredient, upsert the review set again, say it's refreshed, and wait for a fresh
   approval. Only AFTER the approval do Step 4. A single approval authorises the WHOLE remaining
   chain — generate every paid piece, render, self-QC, publish — with NO further pauses (that is
   exactly why every paid prompt must already be in the panel).

## Step 4 — render, report stages, publish

1. **Open the render row FIRST** — right after the Step 3 approval, before any paid generation:
   `video_render_run { brand_id, project_id, kind: "full" }` (no `dry_run`; returns
   `render_id`) → keep `render_id`, then mark it running:
   `video_render_run { brand_id, project_id, render: { render_id, status: "running",
   workflow_stage: "preparing", progress_note: "starting", progress_percent: 5 } }`. The user sees this
   live in the app and gets a WhatsApp "started" message automatically — don't message them yourself
   about start / blocked / complete.
2. Now generate every PAID piece you showed as a prompt in Step 3 — the AI stills/video, lipsync
   clips, voice, music — through the media proxies (below), each from its approved prompt, with
   `GW_PROJECT_ID` exported. **Save as you go** (section above): skip any piece already saved
   with the same `input_digest` (download it), and upload each new piece with its
   `ingredient_key` + `input_digest` the moment it passes QC.
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
   (`progress_note` = plain words, ≤200 chars):
   - voiceovers done → `"preparing"`, `"voiceovers done"`, 20
   - stills done → `"preparing"`, `"stills done"`, 35
   - each lipsync / video clip → `"rendering"`, e.g. `"lipsync 5/8"`, 35–75
   - assembly → `"rendering"`, `"assembling the cut"`, 85
   - QC (4.3) → `"checking"`, `"watching the final"`, 95
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
     HOW it was said is the text you sent to the voice (keep it in the review), not the transcript. It blocks a mis-voiced word
     (approved "human-vetted" → "human witted"), a dropped phrase, or silence. It routes Whisper
     through the gooseworks proxy when `OPENAI_BASE_URL` is set (sandbox:
     `$GW_WHISPER_PROXY_URL/v1`); with no backend at all, run `fal-ai/whisper` via the FAL proxy
     and diff the transcript yourself.
   - **Captions / subtitles** — ANY captioned format (the most common non-UGC defect); **skip for
     UGC/Seedance masters, which carry no subtitle track.** Diff the caption file you burned
     (SRT/ASS/PNG cue list) against the SAME Whisper transcript + word timings — every caption line
     must match the heard/scripted words and sit within ~0.3s of when they're spoken; then in the
     visual pass below, read the burned caption off 4–5 sampled frames to confirm it's on screen at
     that time and not colliding with the end card. Mismatched text or >0.3s drift fails the gate.
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
4. Publish: `media_upload { brand_id, scope: "video_project", scope_id: project_id, kind: "render",
   path: "working/final.mp4", ingredient_key: "final", input_digest, source: { type: "file", filename: "final.mp4", content_type:
   "video/mp4" } }` → PUT the master to `upload.url` with `upload.required_headers` (no
   `media_confirm` — path uploads don't take one). Same for the poster (`kind: "thumbnail"`, `path: "working/final-thumb.jpg"`, `ingredient_key: "final-thumb"`).
   Keep each `upload.render_file_url`. Verify the PUT returned 2xx and the file you uploaded is a
   real, non-empty MP4 (ffprobe it) BEFORE marking the render complete.
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
   If anything changed after the Step 3 approval (a line reworded, a clip or take swapped, a look,
   timing, caption or music change, a QC repair, or ANY change the user asked for in this chat),
   upsert the review set again: `video_project_upsert { brand_id, project_id, patch: { script: {
   script_drafts, script } } }` with the final lines, final pieces (mark generated takes as done, not
   "not generated yet") and the settings you used. The project keeps this, not your chat: it is
   what the app shows, and what a Community remix of this video copies. Instructions that live only
   in this conversation are lost when it ends.
6. Pin it — only a `passed` render (or a `blocked` one the user said to use anyway):
   `video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }`,
   then return the `app_url` + `brand_url` (from the project) verbatim. Never end on just "done" or
   a file path.

Narrate each long step in one line via `video_project_upsert { brand_id, project_id, patch:
{ message: { role: "agent", content } } }` — never sit silent on a queue > 90s.

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
- **Toolchain before spend** — `gooseworks doctor` (CLI) or the manual check; stop with the exact
  fix if anything is missing.
- **Assemble the whole review set first**, mirror it with `video_project_upsert patch.script`, and
  get ONE approval BEFORE the expensive render (review-once).
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
- Always end a successful run with `app_url` + `brand_url`, verbatim.
