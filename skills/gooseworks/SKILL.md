---
name: gooseworks
slug: gooseworks
description: >
  GooseWorks growth coworker and specialist-skill router. Research brands, customers, competitors,
  creators, markets, and prospects; analyze ads and performance; create ads, product photos,
  graphics, and video; search and scrape public web and social data; find and enrich leads.
  Capture founder answers, brand rules, audience depth, and video taste in the existing brand.
  Use it as the single GooseWorks entry point for brand growth, B2B, sales, research, and GTM work.
category: general
version: 1.0.1
author: GooseWorks
tags: [gooseworks, data, scraping, search, reddit, twitter, linkedin, email, people, research, gtm, leads, prospecting]
---

# GooseWorks

You have access to GooseWorks — an AI coworker with specialist skills for research, analysis, creative work, lead generation, enrichment, and public web/social data. Use the right specialist when the request needs brand context, a managed creative workflow, data at scale, a source behind authentication, or a specific provider.

This skill is also the **parent router** for the GooseWorks family. Data/GTM work you handle here (see "How to Use"); specialized work you hand off to a dedicated `goose-*` skill.

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

## Route to the right skill FIRST

First apply the **Common company onboarding** gate below. Preserve the user's original request while onboarding, then continue with it as soon as onboarding is complete. For video work, load the current matching workflow from the selected connection first: `goose-video` for a new request, `make-custom-video` for an explicit original/reference brief, or `goose-video-local` for an existing template project/batch. Read an existing project first to determine its actual route and retain its approved packages. Fetch with the advertised `catalog_fetch { type: "skill", slug }`; an installed copy or old chat is only a bootstrap. Then load the brand context (**"Load the brand context FIRST"**, immediately below), and follow the matching workflow with that context. For other specialized work, **switch to that skill** after loading the brand instead of the data flow below:

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

For "interview me about the brand", "save our brand rules", "refine our audience", or "remember
our video taste", stay here and follow **Guided brand capture** below. This extends the current
brand and onboarding flow; it does not create another onboarding checklist.

| If the user wants… | Route to | How |
| --- | --- | --- |
| Remix/make an ad, research a brand for ads, OR analyze ad performance — Meta/Google ad campaigns, creative fatigue, CAC/lead quality, competitor ad intel, ad angles & hooks | **`goose-ads`** | Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`. |
| Charts, infographics, slides, social graphics, branded visual designs from a style/format | **`goose-graphics`** | If installed locally, use it. Otherwise `gooseworks fetch goose-graphics` (or `gooseworks install --claude --with goose-graphics`). |
| Make a **video** ad from a template or an original brief. Template-free briefs and Instagram/direct video references route to make-custom-video. Growth renders in its sandbox; connected coding agents use their local toolchain. | **`goose-video`** | For new work, fetch the current goose-video entry from the selected connection, then load the full brand before format suggestions. An installed entry is a bootstrap; keep approved project packages on resume. |
| Create an original branded video without a template, adapt an Instagram/direct video reference, or resume a generated custom project; separate script and ingredient approvals are required in the same chat | **`make-custom-video`** | Fetch the current make-custom-video entry and its production harness for new work, then read summary, kit, products and learnings before script writing. Read an existing project first and retain its approved package/context on resume. |
| Render an EXISTING app video project or batch on this machine — the app's "copy for Claude" command names it | **`goose-video-local`** | Read the existing project first. Use the current goose-video-local entry as the connection adapter, retain approved recipe packages/context and apply brand preparation before a new plan or script. |
| Make **product photos** — studio, lifestyle, marketplace, social, or on-model product photography | **`goose-product-photos`** | Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`. |
| Animate an approved static ad or product image | **`animate-image`** | Fetch with `gooseworks fetch animate-image` and follow its GooseWorks MCP workflow. |
| Anything else — scraping, research, lead gen, enrichment, any data lookup | (stay here) | Follow "How to Use" below. |

Examples — all of these route to `goose-ads`, not the data flow: "remix this ad with project id 123", "make an ad for my product", "research my brand", "why is my Meta campaign underperforming", "which creatives should I cut".

## Load the brand context FIRST (mandatory — before you route, and before you ask anything)

**Call `brand_read { brand_id, sections: ["summary", "kit", "products", "learnings", "onboarding"] }` before the first substantive step of ANY task**, and before you route to a specialist skill. Older clients can use `brand_get_context` with the same sections only when that tool is advertised. It is a read-only call that returns the brand's canonical facts and saved rules:

For videos, read the current workflow first as described above, then load all four creative
sections (summary, kit, products and learnings) before suggesting formats, choosing angles or
writing a script. Onboarding facts alone are insufficient. Carry saved rules and kit assets
into the specialist's brand preparation. `Video preference:` rules describe the look, voice
and pacing; they are not lines to read aloud. On an approved resume, preserve the saved brand
inputs and packages; an intentional change uses the existing affected review/approval gates.

| It returns | Use it for |
| --- | --- |
| **voice** — tone, style, banned phrasing | Any copy, script, caption, hook, or headline. Don't ask "what tone?" |
| **products** — names, descriptions, pricing, links, imagery | Picking the product to feature. Don't ask "which product?" — offer the list. |
| **audience** — segments, demographics, jobs-to-be-done | Targeting, angles, creator fit. Don't ask "who is this for?" |
| **positioning** — category, value props, proof points, tagline | Angles, offers, competitive framing. Don't ask "what makes you different?" |
| **research status** — whether the brand's research pass has completed | Whether the facts are trustworthy yet, or still being filled in. |

Then:

1. **Pass what it returned INTO the routed skill.** When you hand off to `goose-ads`, `goose-video`, `goose-product-photos`, `goose-graphics`, or a fetched Brand Growth recipe, carry the voice / products / audience / positioning with you. Do **not** make the routed skill re-derive them, and do **not** re-run brand research when the context is already there.
2. **Never re-ask the user for something the brand context already answers.** If a routed skill's own prose asks a question the context answers, the context wins — answer it yourself and move on. Ask only for what is genuinely missing or ambiguous.
3. **If research status is not complete**, say so in one line, use what you have, and continue. Only run brand research when the context comes back empty or the user asks for it.
4. **If `brand_read` is unavailable**, refresh the GooseWorks connection or tool list. An older connection may expose `brand_get_context` / `get_brand_kit`; use those only when actually advertised. Never require a legacy tool name or guess brand facts.
5. **A read grants no write permission.** Save explicit durable answers/corrections with the capture policy below. Propose agent-derived changes for review; never overwrite confirmed knowledge with research or a guess.

Never invent a brand fact. If it isn't in the brand context and the user hasn't said it, ask.

## Setup

All commands below auto-load credentials from `~/.gooseworks/credentials.json`. If a command exits with "Not logged in", tell the user to run: `npx gooseworks login`. To log out: `npx gooseworks logout`.

### Choose the available runtime — MCP first, then CLI

Skills may describe a managed provider request as an environment-neutral operation with
`provider`, `method`, `path`, and optional `query` or `body`. Execute the operation through
the first available runtime:

1. If the matching GooseWorks MCP tool is registered, use it. For ScrapeCreators, pass the
   operation directly to `call_data_provider`. This is the preferred path in ChatGPT, Cowork,
   and other terminal-free clients. Do not shell out and do not ask for a separate provider key.
2. Otherwise, if a local terminal and the `gooseworks` CLI are available, translate the same
   operation into `gooseworks call <provider> <path>` with its method, query, and body options.
3. Otherwise, follow the provider dependency's direct-key path only when the user has supplied
   their own key. If no runtime is available, explain what connection is missing; never pretend
   the provider call ran.

The same selection applies to catalog and account operations. When the CLI is unavailable but the
`mcp__gooseworks__*` tools are connected, use these equivalents:
- `gooseworks search <q>` → the **`search_skills`** MCP tool.
- `gooseworks fetch <slug>` → the **`fetch_skill`** MCP tool (same content/scripts/files/deps).
- `gooseworks credits` → the **`get_ad_credits`** MCP tool.

Discovery, skill fetching, and ScrapeCreators-backed Brand Growth workflows work fully CLI-free
this way. Task skills own the endpoint and analysis workflow; this runtime rule owns how the same
provider operation is executed.

To check credit balance:
```bash
gooseworks credits
```

## Common company onboarding

Onboarding happens inside the current agent and is the first-run gate for every GooseWorks task. It uses the exact same saved state and step order as the web onboarding. The user does not need to type **`/gooseworks onboard me`**; that explicit command only starts or resumes the same flow.

Keep the user's original task pending. Call **`brand_onboarding { action: "status" }`** before routing or executing it, then:

- follow only the returned `next_step`;
- save each answer immediately with `brand_onboarding` so web, Claude, Codex, ChatGPT, and Cowork can resume one another;
- continue the original request immediately when `onboarding_completed` is true.

If `brand_onboarding` is unavailable, explain that the GooseWorks MCP connection must be enabled. Do not write a parallel local profile and do not run the retired role / discovery-source / ad-owner questionnaire.

When onboarding returns a review link, show that single link and ask the user to review the creatives and reply `done`. When they reply `done`, do not restart onboarding: continue the task they originally asked for. If there was no earlier task, ask: **“Let’s start your next campaign. What are you promoting, and what result do you want?”** Use the same preserved-task-or-campaign handoff if onboarding completes while the creatives are still being prepared or could not be generated.

### Shared flow

Use the host's native question controls. Ask one short group at a time and rely on the live tool schema for accepted values.

1. **Start** — If status returns `start`, ask for the company website or Apple App Store URL. Also offer the optional hero product URL and “Where do you do your work?” choices: Slack, WhatsApp, iMessage, Claude Code, Claude, Codex, and ChatGPT. Call `action: "start"`; server-side research begins immediately. If status returns `select_brand`, ask which company/client to use. Otherwise reuse the only brand automatically.
2. **Your coworker** — The current flow accepts the default coworker automatically. If an older session returns `coworker`, refresh `status`; do not introduce a naming/avatar question. Rename only when the user asks and the live tool supports it.
3. **Your company** — Use the returned `company_draft` plus the user's existing answers. Ask only to verify missing or ambiguous details: what they sell (`marketCategory`), where people buy (`appPlatforms`), primary customer, customer problem, promised outcome, and optional differentiator. Monthly Meta ad spend belongs here when absent: `none`, `under_10k`, `10k_50k`, `50k_150k`, `150k_plus`, or `not_sure`. Save the merged required company object with `action: "save_company", company: { … }`; read `status` back.
4. **Your taste** — In a terminal or CLI host, use the returned `taste_url`: open it when the host supports opening links and always show one clickable **Choose your taste in GooseWorks** link. Ask the user to heart or skip ads on that page, click **Continue** or **Skip this**, return to the agent, and reply `done`. Do not print, enumerate, or summarize `taste_deck` in the terminal. After `done`, call `brand_onboarding { action: "status" }` again and follow the refreshed `next_step`. In a chat host that renders images, show only the one image attached by the tool and save each Love/Skip decision with `action: "save_taste", taste: { hearted_ids, skipped_ids, complete }`; set `taste.complete: true` after three hearts or an explicit skip.
5. **First campaign** — Ask **“What’s happening right now?”**: launch `launch`, promotion `promo`, seasonal moment `seasonal`, or nothing special `nothing`, plus an optional note. Call `action: "propose_campaign"`, show the returned editable card (name, objective, offer, audience, 2–3 angles, CTA, and product URL), and save edits with `action: "save_campaign"`. Send `campaign.accept: true` only after approval; acceptance can start the complimentary first creatives.
6. **Review** — Show the returned founder, researched, and inferred facts with their provenance. The user may correct positioning, audience, voice, value propositions, proof points, or competitors through `action: "review_research", review: { action: "correct", field, value }`. A proof-point edit does not approve a claim. Complete with `review: { action: "complete" }` even when research is still running, failed, or sparse; never trap the user waiting for it.
7. **Channels** — If `channel_connected` is already true, this is complete automatically. Otherwise ask whether they want to connect Slack, WhatsApp, or iMessage later, or skip for now. An explicit skip is valid; call `action: "complete_channels"`.

The former revenue / 90-day-goal / `save_progress` screen is retired. Do not insert it into
onboarding. Ask those human-only questions later only when the user's task needs them.

Do not ask for role, discovery source, who makes creatives, who manages ads, or a separate “what do you want to do first?” menu. Those belonged to the retired CLI questionnaire. The task the user already asked for is their first task.

## Guided brand capture

Use this when the user requests a founder interview, audience/rules capture, or video taste.
Keep their original task pending. Load the current brand first, compare it with information
already volunteered in this chat, and **save known information first** using the canonical
mapping below. Do not run a long questionnaire as a prerequisite for making an ad.

For facts needed by the task but absent from the read, call `knowledge_search` first if it is
registered. Use returned citations and states honestly: an empty, building or failed index is
not proof that the brand has no answer. Do not re-scrape or ask the founder for a fact already
answered by trustworthy saved knowledge.

Ask one short group of missing human-only facts at a time, in plain language, with the relevant
known answer in that same question. "Skip" or "not sure" is valid. Examples, **only for gaps**:

| Gap | Useful question |
| --- | --- |
| Founder origin or conviction | "What made you start this, and what do you believe that alternatives get wrong?" |
| Audience depth | "Who buys first, what problem pushes them to act, and what nearly stops them?" |
| Buying trigger or alternatives | "What happens just before they look for you, and what do they use instead?" |
| Rules | "What must we always say or show, and what must we never say or imply?" |
| Proof | "What evidence supports that result, and do we have permission to quote the customer?" Keep unsupported claims pending. |
| Video taste | "Share a video you like and what you would keep or avoid: pace, voice, captions, or look." |

Keep skipped or uncertain answers as gaps in the brief; do not save them as confirmed facts.
Save each answered group and read it back before the next group. Stop when the requested capture
is covered or the user skips; resume from canonical saved answers after interruption. Present a
short brief containing verified answers, attribution, pending proposals and remaining gaps, then
continue the original task. Review happens in this chat plus any proposal review link returned
by the tools. Do not promise an unavailable evidence, claims or plan write.

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

## Brand Growth discovery

Brand Growth is a collection inside the normal skill catalog, not a command or installable pack. Use these known routes when relevant, while preserving all existing B2B, sales, research, lead-generation, and data behavior:

| Job | Skill |
| --- | --- |
| Brand foundation | `brand-research` |
| Competitor ads | `competitor-ad-intelligence` |
| Customer language and angles | `comment-mining`, `ad-angle-miner` |
| Competitor social content | `competitor-social-research` |
| Audience definition | `audience-research` |
| Creator discovery and evaluation | `influencer-prospecting`, `creator-profile-teardown` |
| Trends and outlier posts | `trend-discovery`, `outlier-post-finder` |
| Social listening and product demand | `social-listening-brief`, `product-demand-research` |
| Long-form source material (calls, podcasts, videos) | `transcript-intelligence` |
| Meta performance, policy, and landing-page match | `meta-ads-analyzer`, `meta-ad-policy-checker`, `ad-to-landing-page-auditor` |
| Static ads | `goose-ads`, `remix-graphic-ad-from-reference` |
| Product photos | `goose-product-photos`, `product-photoshoot` |
| Written content and repurposing | `content-repurposing` |
| Graphics and animation | `goose-graphics`, `animate-image` |

Fetch the named public skill before following it. You already called `brand_read` — hand the brand's voice, products, audience, and positioning to the fetched skill instead of letting it re-derive or re-ask them. Provider helpers such as `scrapecreators-api` and `transcript-intelligence` are dependencies, not user-facing results.

For a multi-part request, repeat this routing check before each new job. Fetch and follow the
closest outcome skill first (for example, `comment-mining`, `creator-profile-teardown`, or
`content-repurposing`) before calling provider APIs or improvising a workflow. Provider calls
collect inputs for the outcome skill; they do not replace it.

## How to Use

### If a specific skill is requested (e.g. --skill <slug> or "use the <name> skill")
Skip search and go directly to **Step 2** with the given slug.

### Step 1: Search for a skill
When the user asks you to do ANY data task (scrape reddit, find emails, research competitors, etc.) **without specifying a skill name**, search the skill catalog first:
```bash
gooseworks search "reddit scraping"
```

### Step 2: Fetch the skill
Once you have a skill slug, fetch its full content and scripts:
```bash
gooseworks fetch <slug>
```

This prints a JSON object with:
- **content**: The skill's instructions (SKILL.md) — follow these step by step
- **scripts**: Python scripts the skill uses — save them locally and run them
- **files**: Extra files the skill needs (configs, shared tools like `tools/apify_guard.py`) — save them relative to `/tmp/gooseworks-scripts/`
- **requiresSkills**: Array of dependency skill slugs (for composite skills)
- **dependencySkills**: Full content and scripts for each dependency

### Step 3: Set up dependency skills (if any)
If the response includes `dependencySkills` (non-empty array), set up each dependency BEFORE running the main skill:
1. For each dependency in `dependencySkills`:
   - Save its scripts to `/tmp/gooseworks-scripts/<dep-slug>/`
   - Install any pip dependencies it needs
2. When the main skill's instructions reference a dependency script (e.g. `python3 skills/reddit-scraper/scripts/scrape_reddit.py`), run it from `/tmp/gooseworks-scripts/<dep-slug>/` instead

### Step 4: Set up and run the skill
Follow the instructions in the skill's `content` field. **Save ALL files from both `scripts` AND `files` before running anything:**

> **Credential translation rule:** Individual skill instructions may contain a legacy `## Setup` block with `export GOOSEWORKS_API_KEY=$(python3 ...)` and raw `curl` commands. **Replace those with the clean equivalents below.**
> - **Credentials (only needed before running Python scripts, NOT before gooseworks commands):** replace the python one-liner exports with `eval $(gooseworks env)`. Skip entirely if you are only using `gooseworks call` — it loads credentials automatically.
> - **Orthogonal run:** replace `curl ... /v1/proxy/orthogonal/run ... -d '{"api":"X","path":"/Y","body":{...}}'` with `gooseworks call X /Y --body='{...}'`
> - **Direct proxy:** replace `curl ... /v1/proxy/<provider>/<path> ... -d '{...}'` with `gooseworks call <provider> <path> --body='{...}'`
> - **ScrapeCreators:** call its first-party GooseWorks proxy directly with `gooseworks call scrapecreators <path> --query='{...}'`. Use ScrapeCreators' official OpenAPI for endpoint parameters; do not use Orthogonal as its endpoint catalog. GET is the default; add `--method POST --body='{...}'` only for an official POST operation.
> - **Orthogonal search:** replace `curl ... /v1/proxy/orthogonal/search ... -d '{"prompt":"..."}'` with `gooseworks orthogonal find "..."`

1. Save each script from `scripts` to `/tmp/gooseworks-scripts/<slug>/scripts/` — **NEVER save scripts into the user's project directory**
2. **IMPORTANT: Also save everything from `files`** — these contain required modules (like `tools/apify_guard.py`) that scripts import at runtime:
   - Files starting with `tools/` → save to `/tmp/gooseworks-scripts/tools/` (shared path, NOT inside the skill dir)
   - All other files → save to `/tmp/gooseworks-scripts/<slug>/<path>`
   - **If you skip this step, scripts will crash with ImportError**
3. Install any required pip dependencies mentioned in the instructions
4. Run the script with the parameters described in the instructions
5. When instructions reference dependency scripts, use paths from Step 3: `/tmp/gooseworks-scripts/<dep-slug>/<script>`

## Raw API Discovery (fallback)

If no GooseWorks skill matches the user's request, you can discover and call **any API** through the Orthogonal gateway. This gives you access to 300+ APIs (Hunter, Clearbit, PDL, ZoomInfo, etc.) without needing separate API keys.

### Search for an API
Find APIs that can handle the task:
```bash
gooseworks orthogonal find "find email by name and company"
```
Returns matching APIs with endpoint descriptions and per-call pricing.

### Get endpoint details
Before calling an API, check its parameters:
```bash
gooseworks orthogonal describe hunter /v2/email-finder
```

### Call the API
Execute the API call (billed per call based on provider cost):
```bash
gooseworks call hunter /v2/email-finder --query='{"domain":"stripe.com","first_name":"John"}'
```
- Use `--body='{...}'` for POST body parameters
- Use `--query='{...}'` for query string parameters
- Output: JSON response data, followed by a `Cost: <N> credits` line when applicable
- **Always tell the user the cost** after each call

The same `gooseworks call` command also handles direct-proxy providers (apify, apollo, crustdata, scrapecreators):
```bash
gooseworks call apify acts/parseforge~reddit-posts-scraper/runs --body='{"subreddit":"ClaudeAI"}'
gooseworks call scrapecreators /v2/instagram/post/comments --query='{"url":"https://www.instagram.com/p/POST_ID/"}'
```

### Workflow
1. Search first (`gooseworks orthogonal find`) — pick the best API + endpoint
2. Get details (`gooseworks orthogonal describe`) — understand required parameters
3. Call (`gooseworks call`) — invoke with the right parameters
4. Parse the JSON output for the actual API result

## Working Directory & Output Files

- **Scripts** always go to `/tmp/gooseworks-scripts/<slug>/` — NEVER the user's project directory
- **Output files** (CSVs, reports, data exports) go to a **GooseWorks working directory**:
  1. If the user specifies where to save results, use that location
  2. Otherwise, default to `~/Gooseworks/` — create it if it doesn't exist
  3. **Before saving output**, confirm with the user: *"I'll save the results to ~/Gooseworks/<filename>. Would you like a different location?"*
  4. Organize outputs in subfolders by task type when it makes sense (e.g. `~/Gooseworks/reddit-scrapes/`, `~/Gooseworks/research/`)
- **Never overwrite existing files** without asking. If a file already exists, append a timestamp or ask the user

## External Endpoints

The `gooseworks` CLI sends authenticated requests (Bearer `GOOSEWORKS_API_KEY`) to:

| Endpoint | Method | Wrapped by |
|----------|--------|------------|
| `$GOOSEWORKS_API_BASE/api/skills/search` | POST | `gooseworks search` |
| `$GOOSEWORKS_API_BASE/api/skills/catalog/:slug` | GET | `gooseworks fetch` |
| `$GOOSEWORKS_API_BASE/v1/credits` | GET | `gooseworks credits` |
| `$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/search` | POST | `gooseworks orthogonal find` |
| `$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/details` | POST | `gooseworks orthogonal describe` |
| `$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/run` | POST | `gooseworks call` (orthogonal-routed providers) |
| `$GOOSEWORKS_API_BASE/v1/proxy/{apify,apollo,crustdata,scrapecreators}/*` | Various | `gooseworks call` (direct-proxy providers; ScrapeCreators uses its managed first-party key) |

## Security & Privacy

- All API calls are authenticated via Bearer token stored locally in `~/.gooseworks/credentials.json` (file mode 0600)
- No credentials are hardcoded or sent to third parties
- API keys for external services (Apify, Apollo, etc.) are managed server-side — your token never touches them
- Scripts run locally on your machine; only API requests go through GooseWorks servers. Skill scripts are open source (github.com/gooseworks-ai/goose-skills) — read or pin them before running
- Credit usage is tracked per-call and visible via `gooseworks credits`

## Rules

0. **Read the canonical brand context before substantive work**, pass what it returns into whatever skill you route to, and never re-ask the user for a fact it already answers (see "Load the brand context FIRST").
1. **Consider a GooseWorks skill when it fits the task** — scraping, research, lead gen, enrichment, especially at scale, behind auth, or from a specific source. For a quick lookup your built-in tools are fine; use your judgement and pick the best tool for the user.
2. **Before paid operations**, tell the user the estimated credit cost
3. **If a `gooseworks` command exits with "Not logged in"**: tell the user to run `npx gooseworks login`
4. **Parse JSON responses** and present data in a readable format to the user
5. **When running scripts**: save to `/tmp/gooseworks-scripts/`, install pip deps, then execute. NEVER pollute the user's project directory
6. **Output files default to `~/Gooseworks/`** — always confirm with the user before saving
7. **Prefer `gooseworks call` over raw curl** — if it returns an error, first fix the parameters (check types, required fields, format) and retry. Only fall back to raw curl if you have strong reason to believe it is a CLI bug, not a parameter issue.
