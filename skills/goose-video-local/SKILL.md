---
name: goose-video-local
slug: goose-video-local
description: >
  Render an EXISTING GooseWorks video ad project or video batch with ffmpeg (plus Playwright for
  phone-mockup formats) and the GooseWorks media proxies, then save the finished MP4 back to the
  project over MCP. Runs on the user's own machine (Claude Code / desktop app, with or without the
  gooseworks CLI) OR inside a GooseWorks workspace sandbox (canonical MCP tools + Bash, no CLI).
  Use for a verified legacy template-remix project or video batch. A copy-for-Claude command or
  project id must first be checked with video_project_read; CreativeSpec orders stay on the
  server flow in goose-video. Not for a hosted connector with no shell. To order a NEW video ad
  in chat, use goose-video instead.
category: ads
version: 0.4.0
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, podcast, ugc, local-render, sandbox, byoa]
---

# GooseWorks Video Ads — local remix runtime

## Mandatory route check before any local work or spend

For every existing `project_id` (including one supplied by the app's copy-for-Claude command),
call `video_project_read { brand_id, project_id }` **before** template lookup, toolchain setup,
BYOA authorization, media-proxy calls, or a review-set upload. If the response contains
`creative_plan`, `project.creative_spec_revision_id`, `order.creative_spec_revision_id`,
or a planning `lifecycle` for a recipe project, **stop this local workflow** and follow the
`goose-video` CreativeSpec server path on the SAME project. Fetch that skill if necessary with
`catalog_fetch { type: "skill", slug: "goose-video" }` (older clients: `fetch_skill("goose-video")`).
This applies even when a copy prompt names this local skill;
it is not proof that the project is a legacy template remix. If classification is unclear,
read again or ask; do not guess and generate locally. For a batch, inspect each child project
before running its local recipe. An `order` or `script_drafts.recipe` without CreativeSpec
also belongs to `goose-video`, using that skill's non-CreativeSpec order path. Continue below
only for a verified legacy template remix.

CreativeSpec has **no vetted local node-execution API** yet. The supported fallback is the
server's `video_project_read` / `video_render_run` three-gate flow, with plan/quote,
actual ingredient previews, and provisional final MP4 shown and approved **in chat**. Do not
collapse those gates into review-once, use BYOA media proxies, or call the local render-row
actions or legacy `update_ad_project_script` / `submit_render` / `set_final_render` for CreativeSpec.
The steps below are only for legacy template remixes.

For legacy template remixes, you produce **video** ad creative wherever THIS agent runs and sync
the result back to the GooseWorks app over MCP. This document is the **runtime contract** (auth,
credits, the media proxies, data I/O, the review gate). A separate **recipe** — the template's
`recipe`, plus the capability skills it names — tells you *what to make* (the pieces, prompts,
models, order of assembly).

**Legacy remixes only — division of authority: read both, but when they disagree THIS doc wins on the environment AND the
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
| **Local, no CLI** (cowork / headless desktop) | neither | `catalog_fetch { type: "skill" }` | `~/.gooseworks/credentials.json` if present, else stop and ask the user to log in |

The `gooseworks` CLI and `~/.gooseworks/credentials.json` are **optional**. Everything this skill
needs from the app goes through the GooseWorks MCP tools below; the atoms' `media_proxy.py` reads
credentials.json when it exists and falls back to the `GW_MEDIA_PROXY_TOKEN` env otherwise.

## MCP tools — canonical names (use these)

Use the canonical GooseWorks MCP tools. Legacy names are listed only as a fallback for an older
client that does not expose the canonical tool; never mix both for one step.

| Step | Canonical tool (use this) | Legacy fallback |
|---|---|---|
| Read a project / batch | `video_project_read { brand_id, project_id }` / `video_project_read { brand_id, batch_id }` | `get_ad_project` / `get_ad_video_batch` |
| Template recipe | `catalog_fetch { type: "template", slug: <source_sample_id> }` | `get_ad_template` |
| Capability skill (atom) + its scripts | `catalog_fetch { type: "skill", slug }` | `gooseworks fetch <slug>` / `fetch_skill` |
| Brand kit / research status | `brand_get_context { brand_id }` | `get_brand_kit` |
| Mirror the review set | `video_project_upsert { brand_id, project_id, patch: { script: { script_drafts, script } } }` | `update_ad_project_script` |
| Project assets | `video_project_upsert { …, patch: { assets: [...] } }` | `update_ad_project_asset` |
| Progress note | `video_project_upsert { …, patch: { message: { role: "agent", content } } }` | `append_project_message` |
| Batch status | `video_project_upsert { brand_id, batch_id, patch: { batch: { status } } }` | `update_ad_video_batch` |
| Upload a file to the project | `media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path, source: { type: "file", filename, content_type } }` → PUT (no confirm for `path` uploads) | `get_upload_url` / `get_ad_upload_url` |
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
- **Outputs:** keep working files under `/tmp/gooseworks-video/<project_id>/`; anything the user
  must see goes to the project via `media_upload` (never leave the result only in the sandbox).

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
2. Mirror EVERY concept's review set (Step 3's `video_project_upsert patch.script` per project),
   then stop for **ONE** approval that covers all concepts — show the per-concept credit estimate
   and the batch total. Set the batch to `review` (`video_project_upsert { brand_id, batch_id,
   patch: { batch: { status: "review" } } }`).
3. On approval, set the batch to `rendering` and run **Step 4 (the expensive render)** for each
   concept **sequentially** (finish Concept 1's master before starting Concept 2 — one machine can't
   render them in parallel). Deliver each (Step 5). When all concepts are pinned, set the batch to
   `complete`.

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
- `creative_brief.ratio` / `.durationSeconds` → target aspect ratio + length. Honor when the
  format's render pipeline supports it; if the format physically can't (e.g. a fixed phone-mockup
  aspect), keep the format's native value and note the constraint in the review rather than silently
  ignoring the request.
- `polish_policy` (`standard` | `extra`) → `extra` means spend the extra pass on QC/polish.

2. `catalog_fetch { type: "template", slug: <source_sample_id> }` → the source video: `media_url`,
   `recipe`, `format` (e.g. "podcast-skit", "imessage"), `extracted_script`, `how_to`, `remix_spec`.
3. Brand gate: `brand_get_context { brand_id }`. If the kit's `researchStatus` (or the brand's
   `research_status`) is `complete`, REUSE it — never re-research. If not, run brand research
   first (`catalog_fetch { type: "skill", slug: "brand-research" }`, follow it, then
   `brand_update { brand_id, patch: { kit_patch, finalize_research: true } }`) before continuing.

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
     "working/review/<name>", source: { type: "file", filename: "<name>", content_type } }` →
     PUT (no `media_confirm` for a `path` upload); set that piece's `path` in `script_drafts` to the project-relative
     `working/review/<name>`.
   - **EXPENSIVE paid** → do NOT generate. Put the **exact prompt/spec** (and any ref image URLs)
     in the tile's `text` / `subtitle` so the user reviews what will be spent on. No `path` yet —
     it's generated in Step 4.
   Include the **estimated cost in CREDITS** (never dollars) of the cheap pieces already generated +
   the pending render, so the user approves knowing the total spend. **Answer clarifying questions
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

1. Now generate every PAID piece you showed as a prompt in Step 3 — the AI stills/video, lipsync
   clips, voice, music — through the media proxies (below), each from its approved prompt, with
   `GW_PROJECT_ID` exported. Then assemble per the recipe (ffmpeg stitch; PIL captions / end card;
   Playwright record only where the format needs it and the host has Chromium → `mix-master` audio).
2. Open the row LAST: `video_render_run { brand_id, project_id, kind: "full" }` (no `dry_run`; returns `render_id`) → keep `render_id`. Mark it running with
   `video_render_run { brand_id, project_id, render: { render_id, status: "running" } }`. The render row tracks status only (queued / running / complete /
   failed) — narrate fine-grained progress with `video_project_upsert patch.message` instead.
3. **MANDATORY final-video QC gate — YOU review EVERY finished master before pinning it
   (`patch.final_render_id`), whatever the format (UGC or not).** This is your own automated quality
   check, separate from the user's Step-3 approval — it does not go back to the user. The render row
   is already open (4.2); this gate stands between a rendered master and PINNING/publishing it, so a
   bad render never gets set as final. A master that looks fine on a still can still have a
   mis-voiced word, a caption drifting off its line, a beat out of order, or a deformation — review
   the actual VIDEO, not stills. Run the passes that APPLY to this format:
   - **Audio ↔ script** — any master with SPEECH (VO or native/Seedance voice); **skip for
     music-only / no-speech formats.** `review-ugc-render` is format-agnostic despite the name —
     a deterministic Whisper transcript-vs-script diff: persist the approved spoken lines to
     `working/approved-script.txt`, fetch `review-ugc-render` (`catalog_fetch`) and run
     `review_render.py --video <master>.mp4 --script-file working/approved-script.txt --json
     working/review-verdict.json` (exit 0 PASS / 2 FAIL / 3 ERROR). It blocks a mis-voiced word
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
     the brand's product (not the source's) is shown, the end card has the real wordmark + code, no
     deformation/artifact, duration within ~20% of the source.
   If ANY applicable pass fails, FIX it (regenerate/stitch the offending window, rebuild captions)
   and re-review — only a clean pass proceeds to pinning. **This gate is universal: it runs from
   this skill for every format, so a recipe never has to opt in.**
4. Publish: `media_upload { brand_id, scope: "video_project", scope_id: project_id, kind: "render",
   path: "working/final.mp4", source: { type: "file", filename: "final.mp4", content_type:
   "video/mp4" } }` → PUT the master to `upload.url` with `upload.required_headers` (no
   `media_confirm` — path uploads don't take one). Same for the poster (`kind: "thumbnail"`, `path: "working/final-thumb.jpg"`).
   Keep each `upload.render_file_url`. Verify the PUT returned 2xx and the file you uploaded is a
   real, non-empty MP4 (ffprobe it) BEFORE marking the render complete.
   Then `video_render_run { brand_id, project_id, render: { render_id, status: "complete", output_url, thumbnail_url } }` (attach the Step 4.3 verdict as `quality_status: "passed"` +
   `quality_report` — a batch concept cannot complete without it; exact shape, strict (no extra keys):
   `{ version: 1, summary: string, checks: { source, brand, product, hook_and_scene_order,
   voice_and_script, captions, endcard_and_cta, duration_and_ratio, visual_artifacts }, detected_issues?:
   string[], repair_actions?: string[] }` where EVERY check is `{ status: "pass"|"fail"|"not_applicable",
   note?: string }`) where **output_url MUST be the durable render-file URL**
   (`upload.render_file_url`, i.e. `/api/ads/projects/<project_id>/render-file?path=working/final.mp4`
   — the app re-presigns it on every view) — NEVER a raw proxy/CDN/presigned URL (those expire).
   Same for `thumbnail_url`.
5. Pin it: `video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }`,
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
- **Open the render row only after the master is rendered** (Step 4.2), never on a guess;
  `output_url` = the durable render-file URL, never a CDN URL.
- **Always export `GW_PROJECT_ID`** (and pass `project_id` on hand-rolled proxy calls) so the
  credits attribute to this ad project.
- **Verify a real, non-empty MP4** (watch it) before marking the render complete.
- **Reuse the brand** when its research is complete; never re-research.
- On a hard error (auth/quota/model/timeout) set the render `failed` with a short
  `error_message` (`video_render_run { …, render: { render_id, status: "failed", error_message } }`) and stop — don't ship the source unchanged. **Also log
  it** (see "Report problems") so we can see + fix it.
- Always end a successful run with `app_url` + `brand_url`, verbatim.
