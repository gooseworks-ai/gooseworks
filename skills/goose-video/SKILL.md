---
name: goose-video
slug: goose-video
description: >
  GooseWorks video ads — remix a video ad template (iMessage chat-reveal, more coming) into a
  branded video ad for the user's product. Renders LOCALLY on the user's machine (Playwright +
  ffmpeg + GooseWorks media proxies) and saves the finished MP4 back to the project over MCP.
  Use when the user says "make the video for project <id>", references a video ad project or
  template, or asks to remix a video ad. Unlike goose-ads (static images, generated server-side),
  video renders locally and reports progress + the result back through the gooseworks MCP tools.
category: ads
version: 0.2.0
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, local-render, byoa]
---

# GooseWorks Video Ads — local remix runtime

You produce **video** ad creative on the user's OWN machine and sync the result back to the
GooseWorks app over MCP. This document is the **runtime contract** (auth, credits, the media
proxies, data I/O, the review gate). A separate **recipe skill** — fetched per format — tells
you *what to make*; read both, and this doc wins on any conflict about the environment.

You run inside the user's own Claude Code session (they pasted an instruction with a project
id). The app NEVER runs you — it is the viewer + review surface; you are the renderer.

## CLI-free environments (cowork / headless)

You may be running WITHOUT the `gooseworks` CLI binary (e.g. Anthropic cowork). The
`mcp__gooseworks__*` tools work over the MCP connection regardless, so wherever this skill
says to shell out, use the MCP equivalent:

- `gooseworks fetch <slug>` → the **`fetch_skill`** MCP tool (returns the same content/scripts/
  files/dependencySkills). `gooseworks search <q>` → **`search_skills`**.
- `gooseworks credits` → the **`get_ad_credits`** MCP tool.
- `gooseworks doctor` → do the manual toolchain check in the preflight below.

## Prerequisite — MCP + a render toolchain (Phase 0 preflight)

- The `mcp__gooseworks__*` tools are REQUIRED. If they're unavailable, stop and tell the user
  to connect the GooseWorks MCP server (or run `gooseworks install --claude --mcp` on the CLI)
  and restart. There is no REST fallback.
- **The render runs wherever THIS agent runs, and it needs a real toolchain: `ffmpeg` +
  `ffprobe` + a Playwright **Chromium**.** Establish it in this priority order, and do NOT start
  rendering until one is confirmed:
  1. **CLI present →** run `gooseworks doctor` (checks login, MCP, ffmpeg/ffprobe, Playwright
     Chromium in one shot). Fix any ✗ with the command it prints, then continue.
  2. **No CLI →** check the toolchain yourself: `ffmpeg -version`, `ffprobe -version`, and a
     Playwright Chromium probe (`npx playwright --version` and, if needed, `npx playwright install
     chromium`). If all resolve, continue.
  3. **Docker available →** this is the most reliable way to get the toolchain in a sandbox that
     lacks it: run the render steps inside the prebuilt image
     **`ghcr.io/gooseworks-ai/goose-video-render`** (ffmpeg + ffprobe + Playwright Chromium baked
     in), mounting the project working directory. Use Docker whenever the host is missing ffmpeg or
     Chromium and `docker` is on PATH. (Note: nested Docker is usually disabled inside managed
     sandboxes like cowork — treat this as an option, not a guarantee.)
  4. **None of the above works →** STOP and tell the user plainly, e.g.: *"Video rendering needs
     ffmpeg + a Playwright Chromium (or Docker) on the machine running this agent. This environment
     doesn't have them and I can't install them here. Options: (a) enable/allow Docker so I can use
     the goose-video-render image, (b) install ffmpeg + `npx playwright install chromium`, or
     (c) run this skill locally in your own Claude Code where the toolchain is available."* Do not
     half-render or fake a result. Static image ads (the `goose-ads` skill) do NOT need any of this
     and work anywhere — offer that as the fallback if they just want an ad now.

## Identity, token, credits

- Read `~/.gooseworks/credentials.json` → `api_key` (your agent token), `api_base`, `agent_id`.
  Never print the token.
- **CRITICAL — target the org-default Ads agent on EVERY file op.** The app serves project files
  (the render-file route) from the org's DEFAULT agent, but MCP file writes default to your
  token's pinned agent — which can be a DIFFERENT agent, so a render written with the default
  scope is **invisible in the app**. First resolve the Ads agent: `list_accessible_scopes` → the
  scope with `is_org_default: true` (the ORG default — NOT the `is_default` / `default_agent_id`
  fields, which are the *user's* default agent and are often a DIFFERENT agent). Its `agent_id` is
  `ADS_AGENT` (name "Ads agent", slug `org-default`; usually also the `agent_id` in
  credentials.json). Then pass `target: { type: "agent", agent_id: ADS_AGENT }` on EVERY
  `get_upload_url` / `get_download_url` / `write_file` / `list_directory` / `read_file` — NEVER
  omit `target`.
- **CRITICAL — publish under the PROJECT FOLDER, not the workspace root (the #1 "video renders but
  is invisible" bug).** `get_upload_url` stores at `<ADS_AGENT>/files/<path>` verbatim, but the
  render-file route reads from
  `<ADS_AGENT>/files/agent-config/brands/<brand_slug>/projects/<project_id>/<path>`
  (see backend `resolveProjectFileKey`). So EVERY publish/preview `path` MUST be prefixed with
  `agent-config/brands/<brand_slug>/projects/<project_id>/` — e.g. upload to
  `agent-config/brands/<brand_slug>/projects/<project_id>/working/final.mp4`, NEVER bare
  `working/final.mp4`. A bare path 404s in the app even though the render row AND a bare-path
  `get_download_url` both "succeed" (they resolve the wrong key). The render `output_url` still
  stays the project-relative `...render-file?path=working/final.mp4` — the route re-prepends the
  prefix itself. Always verify with `get_download_url` on the FULL `agent-config/...` path (must
  be non-empty; curl it for HTTP 200) BEFORE marking the render complete.
- Media generation (FAL / ElevenLabs) is billed to the agent through the GooseWorks proxies.
  `submit_render { kind: "full" }` debits **1 ad credit at row creation** — so sequence it LAST
  (render + verify a good MP4 first), and never re-submit on a guess (that double-bills). Call
  `get_ad_credits` first; the user can check `gooseworks credits`.

## Step 1 — resolve the project, source, brand

1. `get_ad_project { project_id }` → keep `brand_id`, `source_sample_id`, `name`, `status`.
2. `get_ad_template { template_id: source_sample_id }` → the source video: `media_url`,
   `recipe`, `format` (e.g. "imessage"), `extracted_script`, `how_to`, `remix_spec`.
3. Brand gate: `get_brand_kit { brand_id }`. If `researchStatus` is `complete`, REUSE it —
   never re-research. If not, run brand research first (`gooseworks fetch brand-research`,
   follow it, then `finalize_brand_research { brand_id }`) before continuing.

## Step 2 — read the template's recipe (it carries everything; NO hardcoded format map)

The ad format is a **template (data) in the ad_sample DB**, not a per-format skill.
`get_ad_template(source_sample_id)` returns the template's `recipe` — a self-contained brief you
read and execute. **Do NOT map `format` to a hardcoded recipe slug** (there is no such table):

- `recipe.format` — the format label (e.g. `vignette`), for display only.
- `recipe.atoms` — the **capabilities** this template composes (e.g. `create-video-seedance-2-fal`,
  `create-image-gpt-image-fal`, `review-ugc-render`, `watch`). `gooseworks fetch <name>` each — they
  live in `skills/ads/capabilities/` and are reused across templates (so they cache).
- `recipe.instructions` — the **playbook** to follow: `instructions.inline` prose, or
  `instructions.doc_url` (an S3 markdown doc — fetch it).
- `recipe.config` — every param (prompts, layout, timings, palette, model choices).
- `recipe.inputs` — the brand-asset contract (which product / logo / offer this template needs).
- `recipe.assets` — reference material as S3 links (reference render, style guide, example frames) —
  fetch as needed.

Runtime: **read the recipe → `gooseworks fetch` each capability in `recipe.atoms` → follow
`recipe.instructions` with `recipe.config` + the brand's bound `inputs`.** The template IS the recipe;
there is no `format → recipe-slug` table and no per-format skill to fetch.

Save each fetched capability's scripts + files under `/tmp/gooseworks-scripts/<name>/`. If a capability
is a Node package (a phone-mockup renderer), `npm install` in its folder so its `generate.js` +
Playwright resolve, and point the recorder's `NODE_PATH` at it.

> **Migration note:** older phone-mockup formats (`imessage` / `chatgpt` / `apple-notes`) whose DB
> recipe does not yet carry `atoms` / `instructions` still hold the legacy `recipe.thread` payload;
> migrate them to this shape (capabilities + instructions in the DB) — do not reintroduce a CLI map.

## Step 3 — prepare ALL the ingredients, then review ONCE (always, before any paid render)

This is a **review-once** flow: prepare every ingredient the video needs, show the whole set to
the user in the app, get ONE approval, then render. Never render before approval, and don't drip
ingredients out one at a time.

1. **Generate every ingredient the format needs — not just the script.** For an iMessage video
   that's typically: the **script** (the bubble thread), the **image(s)** shown in the conversation
   (one or more), and the **end card**. Richer templates add more (hook frame, background, product
   shots, music bed…). Read the recipe for the exact ingredient list. Generate the visuals NOW
   (media proxies / recipe), and `get_upload_url` each preview asset to the project folder
   `agent-config/brands/<brand_slug>/projects/<project_id>/working/review/<name>` (the same
   path-prefix rule as final publish — a bare `working/review/<name>` won't render in the panel).
   In `script_drafts`, set each ingredient's `path` to the project-relative `working/review/<name>`.
   You may ask the user a couple of clarifying questions about the generation first if the recipe
   calls for it (angle, which product, offer/code) — batch them, then prepare everything.
2. **Mirror the whole ingredient set for review** — `update_ad_project_script { project_id,
   script_drafts, script }`. `script_drafts` is a structured payload of **container-tagged
   ingredients** so the app renders each piece the right way:
   `{ format, scenes?, ingredients: [{ container, label, subtitle?, path?, text? }] }`. Each
   ingredient's `container` tells the app HOW to show it:
   - `image` (a frame shown in the video), `endcard` (the end card), `avatar` (a character
     headshot), `background` → rendered as an image tile.
   - `voice` (a voiceover clip — put the voice NAME in `subtitle`), `music` (the bed),
     `audio` → rendered as an audio player.
   - `video` (a clip) → a video player. `text` (a copy line like the CTA) → a text tile.
   - `script` / `thread` / `note` / `conversation` → the written script (or set `scenes[]`
     for the podcast shape, or pass the readable `script` string).
   `path` = `working/review/<name>` (upload the preview asset first via `get_upload_url`); `url`
   works too. **Label every ingredient** ("Hook image", "End card", "Voiceover", "Background
   music", "HER"). This writes NO render and costs NO credits — it populates the review panel.
3. **STOP and ask the user to approve the ingredients in THIS Claude Code session.** Do not render
   until they say go. If they want changes, regenerate the affected ingredient, call
   `update_ad_project_script` again, and re-ask. Only AFTER approval do Step 4.

## Step 4 — render locally, report stages, publish

1. Render per the recipe (Playwright record → ffmpeg stitch → `mix-master` audio). Generate any
   hook / background / end-card assets through the media proxies (below).
2. Open the row LAST: `submit_render { project_id, kind: "full" }` → keep `render_id`, then
   `update_render_status { render_id, status: "running" }`. The render row tracks status only
   (queued / running / complete / failed) — narrate fine-grained progress with
   `append_project_message` instead.
3. **MANDATORY final-video review gate — review EVERY finished master before `set_final_render`,
   whatever the format (UGC or not).** The render credit is already spent (`submit_render` in 4.2);
   this gate stands between a rendered master and PINNING/publishing it, so a bad render never gets
   set as final. A master that looks fine on a still can still have a mis-voiced word, a caption
   drifting off its line, a beat out of order, or a deformation — review the actual VIDEO, not
   stills. Run the passes that APPLY to this format:
   - **Audio ↔ script** — any master with SPEECH (VO or native/Seedance voice); **skip for
     music-only / no-speech formats.** `review-ugc-render` is format-agnostic despite the name —
     a deterministic Whisper transcript-vs-script diff, not UGC-specific: persist the approved
     spoken lines to `working/approved-script.txt`, then `gooseworks fetch review-ugc-render` and
     run `review_render.py --video <master>.mp4 --script-file working/approved-script.txt --json
     working/review-verdict.json` (exit 0 PASS / 2 FAIL / 3 ERROR). It blocks a mis-voiced word
     (approved "human-vetted" → "human witted"), a dropped phrase, or silence. It routes Whisper
     through the gooseworks proxy when `OPENAI_BASE_URL` is set; with no backend at all, run
     `fal-ai/whisper` via `fal-proxy` (upload the audio, pass its `get_download_url` as `audio_url`)
     and diff the transcript yourself.
   - **Captions / subtitles** — ANY captioned format (the most common non-UGC defect); **skip for
     UGC/Seedance masters, which carry no subtitle track.** Concrete check: diff the caption file
     you burned (SRT/ASS) against the SAME Whisper transcript + word timings from the audio pass —
     every caption line must match the heard/scripted words and sit within ~0.3s of when they're
     spoken; then in the visual pass below, OCR-read the burned caption off 4–5 sampled frames to
     confirm it's actually on screen at that time and not colliding with a hyperframe or the end
     card. Mismatched text or >0.3s drift fails the gate.
   - **Visual + structure** — always: run the `watch` skill on the master — beat/scene order + SFX,
     the brand's product (not the source's) is shown, the end card has the real wordmark + code, no
     deformation/artifact, duration within ~20% of the source.
   If ANY applicable pass fails, FIX it (regenerate/stitch the offending window, rebuild captions)
   and re-review — only a clean pass proceeds to `set_final_render`. **This gate is universal: it
   runs from the master skill for every format, so a recipe never has to opt in.**
4. Publish: `get_upload_url { target: { type: "agent", agent_id: ADS_AGENT } }` → PUT the master
   and poster **under the project folder** (see Identity's path-prefix rule) — to
   `agent-config/brands/<brand_slug>/projects/<project_id>/working/final.mp4` and
   `.../working/final-thumb.jpg`. **Always target ADS_AGENT AND use the full project-folder path**
   — a bare `working/final.mp4`, even on the right agent, 404s in the app. Verify servable:
   `get_download_url { target: ADS_AGENT, path: "agent-config/brands/<brand_slug>/projects/<project_id>/working/final.mp4" }`
   must return a non-empty URL (curl it for HTTP 200).
   Then `update_render_status { render_id, status: "complete", output_url, thumbnail_url }` where
   **output_url MUST be the durable render-file URL**
   `/api/ads/projects/<project_id>/render-file?path=working/final.mp4` (the app re-presigns it on
   every view) — NEVER a raw proxy/CDN URL (those expire). Same for `thumbnail_url`.
5. `set_final_render { project_id, render_id }` to pin it, then return the `app_url` +
   `brand_url` (from the project/links) verbatim. Never end on just "done" or a file path.

Narrate each long step in one line via `append_project_message { project_id, role: "agent",
content }` — never sit silent on a queue > 90s.

## Media generation — the GooseWorks proxies (queue loop)

Media APIs go through GooseWorks proxies with your agent token; do NOT use an SDK's default host
(your token isn't a FAL/ElevenLabs token → 401). Base = `<api_base>/api/internal/<proxy>`; pass
`?token=<api_key>&agent_id=<agent_id>&project_id=<project_id>` (agent_id bills the Ads agent;
`project_id` = the id of the project you're rendering — it attributes this generation's credits to
that ad project so the user sees per-project spend in the app. ALWAYS pass it). FAL = `fal-proxy`
(+ `fal-storage-proxy` to host a local image and get a CDN URL); ElevenLabs = `elevenlabs-proxy`
(VO / music bed).

**FAL queue gotcha** (#1 waste of generations): submit returns `status_url`/`response_url` on
`queue.fal.run` (the real host, not the proxy). Polling those 401s forever — rewrite their host
to the proxy base (keep the path), re-add `?token=&agent_id=`. Only the final `*.fal.media`
image is a real public URL. Helper:

```python
import json, os, pathlib, time, requests
from urllib.parse import urlparse

def _cfg():
    c = json.loads(pathlib.Path(os.path.expanduser("~/.gooseworks/credentials.json")).read_text())
    return c["api_base"].rstrip("/"), c["api_key"], c.get("agent_id")

def _params(tok, agent, project_id=None):
    p = {"token": tok}
    if agent: p["agent_id"] = agent
    if project_id: p["project_id"] = project_id  # attributes the spend to this ad project
    return p

def fal_generate(model_path, payload, project_id=None, timeout_s=180, poll_s=3):
    """model_path e.g. 'fal-ai/nano-banana-2/edit' (the recipe names the model).
    Pass project_id = the ad project you're rendering so credits attribute to it.
    Returns the result image URL (a public *.fal.media CDN URL)."""
    api_base, tok, agent = _cfg()
    base = api_base + "/api/internal/fal-proxy"
    sub = requests.post(f"{base}/{model_path}", params=_params(tok, agent, project_id), json=payload).json()
    to_proxy = lambda u: base + urlparse(u).path
    status_url, response_url = to_proxy(sub["status_url"]), to_proxy(sub["response_url"])
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        st = requests.get(status_url, params=_params(tok, agent, project_id)).json()
        if st.get("status") == "COMPLETED":
            return requests.get(response_url, params=_params(tok, agent, project_id)).json()["images"][0]["url"]
        if st.get("status") in ("FAILED", "ERROR"):
            raise RuntimeError(f"FAL failed: {st}")
        time.sleep(poll_s)
    raise TimeoutError("FAL polling exceeded timeout")
```

ElevenLabs (VO / music) is the same shape against `<api_base>/api/internal/elevenlabs-proxy`
with `?token=&agent_id=&project_id=`. Feed FAL a local image by storing it (`get_upload_url`) and passing its
`get_download_url` presigned URL as an `image_urls` / `audio_url` entry — this is the reliable
path. (`fal-storage-proxy` may 404 depending on the install; don't block on it — prefer the
`get_download_url` presigned URL.)

## Rules

- **MCP + ffmpeg + Playwright required** — run `gooseworks doctor` in Phase 0; stop with the
  exact fix it prints if anything is ✗.
- **Prepare ALL ingredients first** (script + every visual: image(s) + end card + whatever else
  the template needs), mirror the whole set with `update_ad_project_script`, and get the user's
  approval in-session BEFORE rendering — always (review-once).
- **submit_render LAST**; `output_url` = the durable render-file URL, never a CDN URL.
- **Always pass `project_id` on media-proxy calls** (fal / ElevenLabs) so the credits attribute
  to this ad project — that's what lets the user see per-project spend in the app.
- **Verify a real, non-empty MP4** (watch it) before marking the render complete.
- **Reuse the brand** when its research is complete; never re-research.
- On a hard error (auth/quota/model/timeout) set the render `failed` with a short
  `error_message` and stop — don't ship the source unchanged.
- Always end a successful run with `app_url` + `brand_url`, verbatim.
