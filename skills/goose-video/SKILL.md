---
name: goose-video
slug: goose-video
description: >
  Start a video ad without leaving the chat. Use it when the user says "make me a video ad for
  <brand>", "I want a video ad", or asks for a UGC / iMessage / explainer / product-demo video.
  One sentence is enough: it picks the brand, asks what the ad is for, shows every video format in
  a table with demo links, checks this machine can render, creates the project and hands it to
  goose-video-local, which makes the video here and saves it back to the app. Every format runs on
  the customer's own machine (Claude Code, Codex or Cursor); a hosted connector (ChatGPT,
  claude.ai, Cowork) can show the formats but cannot render one.
category: ads
version: 2.0.1
author: GooseWorks
tags: [gooseworks, ads, video, client-side, local-render]
---

# GooseWorks Video Ads — pick a format, then make it here

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

Gets a customer from one sentence ("make me a video ad for Bioma") to a video project with the
right format, then hands that project to **`goose-video-local`**, which makes the video on this
machine and saves it back to the app.

**Every video format runs on the customer's machine.** The GooseWorks server does not render
videos right now. It lists the formats, stores the project, bills each paid step through its media
proxy and keeps the finished video. There is no server quote, no server script preview and no
server render to order: `video_catalog_list` returns only client-side formats
(`execution: "client"`), and a server-format project is refused with `format_unavailable`.

**The whole job happens in the chat.** Choosing, approving and receiving the video all happen here,
as text and links the customer can click. Template-remix work uses this chat. Custom videos use Studio for script and ingredient approval, preview replacement and saved feedback, then return to the same Growth conversation.

## Custom videos: route before formats

For an original brief without a reference template, an Instagram reel/post URL or a direct video URL to study, fetch `catalog_fetch { type: "skill", slug: "make-custom-video" }` and follow it in this same session. It creates format:"custom", custom_mode:"generate" with the brief and optional reference_url. Growth executes in its managed sandbox; connected agents use their shell. Script and actual ingredients are reviewed and separately approved in Studio before paid production. Do not force a template choice or import the reference as a finished video.

## Route first: is this a new video?

Hand off to **`goose-video-local`** now, and stop following this skill, for:

- an existing **project** id or a **video batch** id;
- the app's copy-for-Claude command (it names `goose-video-local`);
- "remix this video ad template" for a specific app template.

Use `goose-video-local` if it is installed; otherwise load it with
`catalog_fetch { type: "skill", slug: "goose-video-local" }` on the GooseWorks MCP (older clients:
`fetch_skill("goose-video-local")`). It reads the project first and says what to do with it.

When they ask **what** to make ("give me video ad ideas", "what angles should I use?", "what's
working for my competitors?"), fetch **`ad-angle-miner`** (`catalog_fetch { type: "skill", slug: "ad-angle-miner" }`,
or `gooseworks fetch ad-angle-miner`) and run it with the **video** output. It returns ranked
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

- A brand, usually named in the opening sentence. Resolved to `brand_id`; with one brand in the org it needs no input.
- What the ad is for, in the customer's words (optional; asked once, never forced). It becomes the brief `goose-video-local` works from.
- Anything else they volunteer: who it's for, names or terms it must say, things to stay away from. Never asked for; kept when offered.
- What the picked format needs from the brand (`card.needs`): usually a clean product photo, a screen recording or their own footage.

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

MCP tools; `goose-video-local` does the making.

- `brand_list`: brand NAME → `brand_id`. Pass `query` when they named one.
- `brand_create { name, website_url }`: only when the customer asks to add a brand that isn't there. Free.
- `brand_read { brand_id, sections: ["summary","kit","products","learnings"] }`: research status, logo, product photos.
- `video_catalog_list { kind: "formats", brand_id }`: every format that can be made. Each row has `template_id`, `card.description`, `card.best_for`, `card.needs` and `examples[]` (demo videos). The response carries a `client_formats_note` with the machine checks.
- `video_project_upsert { brand_id, name, format: <template_id> }`: creates the project. Free.
- `catalog_fetch { type: "skill", slug: "goose-video-local" }`: the skill that makes it.

## Paid media: images, clips, voice

Every paid generation — a creator still, a product cutout, a screen-recording frame placed in a
laptop, an animated clip, a voiceover, a music bed — goes through the GooseWorks media proxy and is
billed per call to the project. **No FAL_KEY, ElevenLabs key or `fal_client` is ever needed.**
A recipe, atom or open-source skill that says "needs FAL_KEY" is satisfied by the proxy; it is
never a blocker. With the GooseWorks MCP alone:

- **Image or clip, any fal model** (Nano Banana, GPT-image, Seedream, Seedance, Kling):
  `data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">, body: <model input>, project_id }`,
  then poll `job_get { job_id }` until `complete`; the `*.fal.media` URLs are in `result`.
- **Voice or music:** `data_post_provider { provider: "elevenlabs", … , project_id }`.
- **A local file as an input** (a frame, a screenshot): `media_upload` it first and pass the returned public URL.

`photos_generate` is **not** a general image tool: it only photographs a physical catalog product
(apparel, beauty, CPG). A software screenshot or app mockup is a fal image edit. `goose-video-local`
has the full rules (atoms, the relay, saving each piece as it passes QC).

## Workflow

The opening is fixed: **brand → what it's for → format table → machine check → project → hand off.**
Do each step without waiting for the customer to ask for it.

### 1. Resolve the brand, quietly when you can

Call `brand_list`, with `query` when they named a brand. `query` is a case-insensitive substring match, so "Kolkata Chai" also finds "Kolkata Chai Co". If it finds nothing, call `brand_list` once more with no query before deciding.

- **The org has exactly one brand** → use it. Say which in one line ("Making this for **Bioma**.") and move on. Don't ask.
- **The name they said matches exactly one brand** → use it. Say which.
- **Several match, or they named none and the org has several** → show a table (name, website) and ask.
- **Nothing matches** → say so, list the brands they do have in a table, and offer to add the new one here: "Or send me its website and I'll add it." With a website, call `brand_create { name, website_url }` (free). It starts brand research, which fills in the logo and colours in a few minutes. Carry on from step 2 while it runs. Never create a brand they didn't ask for, and never guess the website.

If the GooseWorks MCP's own instructions have you check onboarding first and it turns out unfinished, finish it, then come back here with the customer's original sentence.

Read the resolved brand and saved rules/preferences as described above before asking a goal
question or choosing a format. Carry the verified taste brief into the project handoff.

### 2. Ask what the ad is for, in one open question

Unless the opening sentence already said it, ask **one** plain question and wait:

> What's this ad for? For example: launching something, a sale, explaining how it works, or showing real results. Anything you tell me helps me pick the right format.

This is a free-text question: **no menu, no table, no list of formats yet.** Take whatever they say, even "not sure". Never ask it twice, and never block on it.

If the answer is "not sure" or "what should I make?", offer once, in one line, to find ideas first
with `ad-angle-miner` (video output: it looks at competitors' ads and what's getting organic reach,
then suggests ranked ideas with formats). If they say yes, switch to it; otherwise carry on to the table.

**Keep the answer, as they said it.** It is the brief `goose-video-local` works from in step 5. If their words also say who the ad is for, a name or term the ad must say, or something to stay away from, note those too. Never ask for those and never fill them with a guess.

Skip the question when the opening already names a goal ("…a video ad for our summer sale") or a format ("…an iMessage video ad"). With a format named, go to the table with that format first and marked.

### 3. Show every format in a table, best fit first

`video_catalog_list { kind: "formats", brand_id }`, then **always a markdown table in your message**, with **every row** the tool returned.

Order the rows by how well each format fits their answer. Judge fit from `card.description` and `card.best_for` against what they said. **A format whose card contradicts what they asked for is never Suggested**, however well its keywords match. When nothing fits, say so before the table ("None of our formats does X; the closest is Y, which gives up Z") and still show the table. Mark **exactly one** row **Suggested** with a few words on why; a close second can be **Also good**.

| | Format | What it looks like | Needs | Demo |
|---|---|---|---|---|
| **Suggested** | Split-screen creator demo | A creator reacts on top while your app plays below | a screen recording of your product | [watch](https://…) |
| **Also good** | Creator product review | An AI creator reviews your product to camera, holding it | a clean photo of the real product | [watch](https://…) |

- **"What it looks like" is `card.description`, quoted.** Copy it word for word; you may cut it at a sentence boundary, never re-word it. A paraphrase once turned "narrates how it gets beaten" into "narrates the fix", which made a villain format look right for a no-villain brief.
- **Needs** is `card.needs` in plain words, with the row's `asset_readiness` gaps or pending inspection. A format with missing required assets goes last; don't hide it, don't suggest it. Unknown suitability is “needs review,” not proof that a file is missing or usable. Inspect the selected format's candidates before spending.
- **Match the product to the format.** A format built around a creator HOLDING a physical product is a poor fit for a software product; one built on a screen recording is a poor fit for a physical one. Say so in the row.
- **Demo** is `examples[0].output_url`. When a format has none, write "no demo yet"; never leave it blank.
- **Price:** say once, under the table, that each paid step (a creator still, a clip, a voice) is billed per call and approved before it runs. There is no single up-front quote.

**Print the table in your message, THEN ask which one.** Never put the formats only inside a structured question control: it renders plain option labels, not links, so the customer would be picking a format they were never able to watch.

### 4. Check this machine can render it

- **Hosted connector** (ChatGPT, claude.ai, Cowork: no shell) → say plainly that the video is made on their own machine and needs Claude Code, Codex or Cursor. Stop there; do not create a project you cannot finish.
- **Terminal host** → run `gooseworks doctor --no-browser` for common setup (auth/MCP, Node 18+, ffmpeg with libx264 + libass, ffprobe). Then fetch the selected template and its capabilities, as described in `goose-video-local` Step 2, and install the selected renderer's documented dependencies in its fetched folder. Do not guess a renderer from a format name. For each Node renderer using Playwright's default Chromium launch, run `gooseworks doctor --renderer-script "/absolute/path/to/the/fetched/scripts/record.js"` with the same environment (including `NODE_PATH` and `PLAYWRIGHT_BROWSERS_PATH`) used for rendering. Use the actual script path, never the example filename. Other browser runtimes or custom launch settings need the capability's equivalent exact-runtime launch check; a default Playwright probe cannot certify them. Non-browser capabilities need only their documented runtime checks. With no CLI, follow the equivalent checks in `goose-video-local` Phase 0 and Step 2. Any check fails → show the folder-specific repair, fix it under existing setup permissions, and recheck. The probe downloads nothing. Never create paid ingredients before the selected renderer passes.

Then say plainly, in one short paragraph: it renders on this machine; paid steps are billed per call and each is approved before it runs; it needs what `card.needs` says.

### 5. Create the project and hand it off, in this session

1. `video_project_upsert { brand_id, name, format: <template_id> }` with **no `brief`** (a brief makes a concept batch).
   If the customer already chose a campaign or campaign concept, include its verified
   `campaign_id` and optional `campaign_concept_id` on this create (also on a batch create).
   Use the IDs read from that brand's saved campaign; the concept must belong to that campaign.
   Omit unknown IDs and never infer a link or create a campaign solely to file a video.
2. Load `goose-video-local` (installed, or `catalog_fetch { type: "skill", slug: "goose-video-local" }`) and follow it on that `project_id` now. Their step-2 answer and anything they volunteered is the brief for its Step 1.5: use it, don't ask again.

Do not hand the customer a command to paste somewhere else.

## Decision Rules

- **One sentence is a complete request.** Never answer "make me a video ad for X" by asking which format, which tool or what to do next. Run steps 1–3 and let the table do the asking.
- **One brand in the org → never ask which brand.** State the one you used.
- **Open question first, table second.** The goal question comes before any list, and the table comes ordered, with one suggestion.
- **More than two options → table in the message.** A question control may capture the answer after the table, never instead of it.
- **Quote cards, never paraphrase them.** A reworded card can promise something the format cannot do.
- **A contradiction with the card outranks every keyword match.**
- **They asked for a format that isn't in the catalogue** → it isn't available yet. Say so, show the table, and don't improvise one.
- **A missing key is never a blocker.** Paid media goes through `data_post_provider` (see "Paid media"); never ask anyone to set FAL_KEY.
- **Never order a server render.** There is none right now; every format is made here by `goose-video-local`.

## Output

A created video project on the picked format, handed to `goose-video-local` in the same session, which delivers the finished video in the chat.

## Quality Checks

- A one-sentence opening got: the brand resolved (unasked when there is one), one open goal question, then a table of every format with demo links and one suggestion.
- Every "What it looks like" cell is the card's own words; no Suggested format's card contradicts what they asked for.
- Common setup and the selected renderer's actual launch check passed before the project was created or any paid ingredients; a hosted connector was told it needs Claude Code, Codex or Cursor.
- The project was created with no brief, and `goose-video-local` ran on it in the same session with the customer's step-2 answer as its brief.
- No one was asked for a FAL_KEY or any provider key.

## Failure Modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Make me a video ad for X" got back "which format / what would you like?" | Treated the one-liner as incomplete | Run steps 1–3 unprompted |
| Asked which brand in a one-brand org | Skipped the count check in step 1 | Use the only brand and say which |
| Demo links invisible to the customer | The choices went only into the structured question control | Table in the message first; the control only takes the answer |
| `format_unavailable` | A server-rendered format, paused right now | Re-read the catalogue; offer what's in it |
| "I can't generate the image: FAL_KEY isn't set / fal_client isn't installed" | Read an atom's or open-source skill's environment line as a requirement | Use `data_post_provider { provider: "fal", … }` + `job_get`; no key is needed |
| "The only image tool is photos_generate and it wants a product_id" | `photos_generate` is for physical catalog products only | Any other image is a fal call through `data_post_provider` |
| `gooseworks doctor` fails | A missing toolchain piece | Show its fix command, re-check; never start anyway |
| Video not on this plan | Lite and trial have no video entitlement | Say so and point at the upgrade; this is the one app trip that's allowed |
| Two projects for one video | A second project was created instead of continuing the first | Continue on the SAME `project_id` |

