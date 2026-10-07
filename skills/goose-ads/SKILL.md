---
name: goose-ads
slug: goose-ads
description: >
  GooseWorks ads skill — create, edit, AND analyze ad creative. Turn an approved source ad
  into a branded ad for the user's product, edit/re-roll an existing creative,
  research a brand for ads, OR analyze ad performance (Meta/Google campaign diagnostics,
  creative fatigue, CAC & lead quality, competitor ad intelligence, ad angles & hooks). Use
  when the user says "remix this ad", references a static ad template id/slug, asks to "make
  an ad", "edit this ad", "research my brand", or asks to analyze/diagnose ad campaigns.
  Generation runs through the GooseWorks backend's single cloud workflow (the same one the ads
  app uses) — credits are reserved and billed server-side. Analytics recipes are fetched from
  goose-skills on demand.
category: ads
version: 2.6.1
author: GooseWorks
tags: [gooseworks, ads, remix, static-ad, brand, creative, image, analytics, meta-ads, performance]
---

# GooseWorks Ads — create, edit & analyze

The GooseWorks ads skill. Two jobs:

1. **Create / edit ad creative** — a **thin wrapper** over the backend's single generation
   workflow. You pick the brand + approved source ad(s) and submit ONE batch; the **backend** runs the
   whole pipeline (compose → generate → persist → judge), reserves and bills credits, and
   stores the renders. You do NOT generate images, call FAL, manage render rows, or upload
   files — those are gone. This is the exact same workflow the GooseWorks ads app uses, so the
   skill and the app can never drift.
2. **Analyze ad performance** — fetch ad-analytics recipes from goose-skills on demand
   (these are unrelated to generation; see "Analyze / intelligence" below).

It works the same in a chat app (ChatGPT, claude.ai, Cowork) and in a terminal coding agent:
everything except the few steps labelled terminal-only goes through the connector's tools.

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

## Prerequisite — the GooseWorks connector tools

Everything below runs through the GooseWorks connector's tools, by the names this skill uses.
Match on the tool name: a coding agent may show a server prefix (for example
`mcp__gooseworks__ads_generate`), a chat app may not. There is no HTTP or file fallback: the REST ad
endpoints are session-cookie-only and reject your token.

If a tool named here is missing, the GooseWorks connection or its tool list is stale: ask the
user to reconnect or refresh GooseWorks in their app's connector settings. Installing or
updating the `gooseworks` CLI never fixes a missing connector tool, so never send a chat-app
user to a terminal for it. Only a terminal coding agent (Claude Code, Codex, Cursor) that has no
GooseWorks tools at all connects them, in that terminal, with `gooseworks install --mcp` plus
`--claude`, `--codex` or `--cursor`, then a restart.

Older notes or skill copies may name tools the connector no longer lists. Use the tool this skill
names instead; `catalog_fetch { type: "skill", slug: "gooseworks-guide" }` maps every old name.

## Start from the brand context — don't re-ask what it already answers

If the `gooseworks` router handed you brand context and an evidence brief, USE THEM. If you were
invoked directly, call `brand_read { brand_id, sections: ["summary","kit","products","learnings"] }`
first, then search the Brand Brain (next section). Together they answer most of what the flows
below would otherwise ask the user:

- **Which product to feature** → `products.items`. Recommend one real catalog entry; never guess a
  product name and never ask the user to list their products.
- **The vibe / tone of the copy** → the brand's **voice**. Use it; don't ask "what tone?".
- **Who the ad is for** → the brand's **audience**. Don't ask "who's the target?".
- **The angle and offer framing** → **positioning** and value props, sharpened by the Brain:
  lead with an angle past approved creatives proved, and drop anything a saved rule forbids.
- **What to claim** → only claim-grade proof: a search result with `approved_ad_claim: true`, the
  kit's approved claims, or its proof points as written. Other Kit text, documents and
  performance numbers are context.
- **Logo, colors, fonts** → owned by the backend research pass. **Never re-derive them.**
- **Whether the facts are trustworthy yet** → **research status**. If it isn't complete, say so in
  one line and continue; the batch queues and runs when research finishes.

Don't ask for the angle, product or tone: recommend them with a one-line reason. Ask only for a
decision the brand read and the Brain search cannot settle (for example an offer or season the
user hasn't mentioned) and for anything the user must consent to (rights, spend).

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

## Credits — state the total, then get a yes

- One token authenticates the GooseWorks tools and resolves your org; never print it. The
  generation tools need no `target`.
- **Nothing paid runs without the user's explicit yes in this chat, given after you state the
  credit total.** The paid calls are `ads_generate` (without `dry_run`), every
  `ads_creative_edit` action, `ads_approval_decide` with `decision: "approve"`, and every
  `data_call_provider` / `data_post_provider` call (the data calls an analysis recipe or brand
  research makes; `gooseworks call` in a terminal). Reads, dry runs, `ads_creative_update` and
  `request_campaign_generation` (it only composes plans) are free.
- The balance is `credits.available_credits` from `account_whoami`; a dry-run `estimate` also
  carries `available_credits`.
- The backend reserves the quoted credits when a paid call starts and bills only the images
  that complete. A rejection with `insufficient_credits` means the wallet is short: tell the
  user the total and their balance in plain words, offer fewer images or a top-up, and stop.
  Never retry blindly.

How to get the total for each paid call:

| Paid call | Credit total to state |
| --- | --- |
| `ads_generate` with `source.template_ids` | The same call with `dry_run: true` returns `estimate`: `total_credits` for `images` images (plus `credits_per_image`, `rates` and `unknown_template_ids`). |
| `ads_generate` with `source.community_ad_ids` or `source.creative_ids` | No dry run (it returns `not_available`; these are priced when submitted). Pass `quality` explicitly (the user's choice, else `high`, the app default) and quote the images (each source's `variants` × its `ratios`) × `estimate.rates.<quality>` as the most it will cost (an engine without quality tiers costs the lower `rates.low`). `rates` comes with any template dry run; with no template at hand, dry-run one Surprise-me pick. |
| `ads_creative_edit` `animate` | The same call with `dry_run: true` returns its `estimate`. |
| `ads_creative_edit` `regenerate` / `precision_edit` | No dry run. Pass `quality` in the action's payload (without it `precision_edit` copies the source render's tier) and quote the images × `estimate.rates.<quality>` as the most it will cost: `regenerate` with `mode: "variation"` makes one per ratio (omitted `ratios` make three); `edit`, `exact` and `precision_edit` make one. |
| `ads_creative_edit` `resize` | No dry run and no quality setting: it renders at the server's default tier (`high` today). Quote one image per placement × the larger of `estimate.rates.high` and `credits_per_image` from a template dry run without `quality` (that dry run uses the server's default tier) as the most it will cost. `platforms` expands to every placement: meta 4, google 4, tiktok 2, linkedin 3, reddit 3, x 2; pass `targets` for fewer. |
| `ads_creative_edit` `layerize` | No dry run. It holds about 80 credits while it runs and charges the actual cost of the split (usually less). Say so and get the yes before sending `layerize: { confirmed: true }`. |
| `ads_approval_decide` approve | The `credits` that `request_campaign_generation` and `ads_creative_read { brand_id, view: "approvals", batch_id }` return for those plans. |
| `data_call_provider` / `data_post_provider` | The calls a recipe will make × their price: a ScrapeCreators call costs 1 credit today, and each result reports what it charged. A fal or ElevenLabs POST quotes free with the same call plus `query: { quote_only: true }`. State the rough total for the whole recipe once, before its first paid call. |

## Live MCP contract — inspect it before asking

The currently registered MCP tool schemas are the source of truth for inputs, supported choices,
and defaults. Do not copy an exhaustive input list from this skill or rely on remembered fields.

Before each tool call:

1. Inspect the live schema for the tool you are about to use.
2. Fill required inputs already known from the Brand Kit, selected source, or conversation.
3. Ask the user only for required inputs that cannot be inferred and for choices that materially
   change the result. Do not turn every optional field into a questionnaire.
4. Omit unspecified optional settings so the backend applies its current app defaults. Two
   exceptions: always pass `ratios` on every source (omitted ratios make three images per
   variant), and keep the same `quality` setting in the quote and the paid call (both omitted
   for a template dry run, or the explicit `quality` the credits table asks for).
5. If the live schema conflicts with this workflow, follow the live schema and report the drift
   (see "Report problems" in the rules).

## The ad tools

- `ads_generate` — **the one call that makes ads.** Needs `brand_id` and exactly one `source`:
  `template_ids: [{ template_id, variants?, ratios }]` (the brand's own templates, Surprise-me
  picks, Community rows whose `item_type` is `template`), `community_ad_ids: [{ community_id,
  variants?, ratios }]` (Community rows whose `item_type` is `creative`; the backend snapshots
  them), or `creative_ids: [{ project_id, render_id?, variants?, ratios }]` (remix the user's own
  finished ads). Optional: `product_name` (a real product), `prompt` (a short steering note),
  `reference_image_urls`, `quality`. `dry_run: true` quotes template sources and reserves
  nothing. A real call GENERATES at once and returns `{ job_id }` (`kind: "ads_batch"`) and the
  `batch`, which already carries its `links` (below). If the
  brand's research is still running the batch is `queued` and starts on its own when research
  finishes: tell the user it'll appear shortly, don't error.
- `job_get { job_id, kind: "ads_batch" }` — poll a batch. `status` is `queued`, `running`,
  `complete`, `partial_failure` or `failed`; `progress` counts `completed` / `failed` /
  `pending` images. `result.creatives[]` carry each creative's `renders[]` (`id`, `status`,
  `ratio`, `output_url`, `age_seconds` since queued, `elapsed_seconds` generating). A creative
  is done when its `pending` is 0, NOT when `current_render_url` is set (during a regenerate it
  still points at the prior image). A render only failed when its `status` is `"failed"`: a slow
  render is healthy, and re-submitting it double-bills. `result.links` holds the app links you end
  the run with: `brand_url` (the brand's page, with all its ads) and `creative_links: [{
  project_id, app_url }]` (each creative's page). A link is `null` (or the list empty) when the
  brand has no app address yet or the link lookup failed; the ads are still made.
- `ads_creative_read { brand_id }` — the brand's generated creatives, newest first (filter with
  `batch_id`, `tags`, `approved_only`); each row has its `app_url` and the list has the
  `brand_url`. `creative_id` reads one with its `renders`, plus `creative.app_url` and
  `creative.brand_url`.
- `ads_template_read` — find or inspect a source (see "Picking source ads"). `template_id` reads one.
- `ads_creative_edit { brand_id, creative_id, action }` — every paid edit of one creative, one
  `action` per call: `regenerate` (`regenerate: { mode: "variation" }` for another take;
  `mode: "edit"` or `"exact"` with `source_render_id` and `prompt`), `precision_edit` (`source_render_id`
  plus a `note` or region `annotations`), `resize` (`source_render_id` plus `platforms` or
  `targets`), `layerize` (`confirmed: true`), `animate` (`source_image_url`; only when
  `account_whoami` shows the Animate Images feature; for the full flow fetch the `animate-image`
  skill). Returns `{ job_id }`: poll `job_get` with `kind: "ads_batch"` (regenerate, resize,
  precision_edit) or `kind: "animate"`; for layerize read
  `ads_creative_read { brand_id, creative_id, include: ["layers"] }`. While the brand's research is
  still running, `regenerate`, `resize` and `precision_edit` refuse with
  `brand_research_in_progress`: tell the user and try again when it finishes.
- `ads_creative_update { brand_id, creative_id, patch }` — free. `patch.feedback: { render_id, rating:
  "happy" | "neutral" | "sad", comment?, reasons? }` records the user's reaction (it feeds the
  quality loop); `patch.tags` replaces the creative's tags.
- `ads_template_create { brand_id, source, rights_attested? }` — register the user's own image as a
  private source template (see "Upload" below).

### Campaigns — the only plan-and-approve path

`ads_generate` has no plan step: the dry-run quote and the user's yes are the checkpoint, and a
submit generates at once. Never promise a review step before the images render. Plans exist only
for a campaign's concepts (planned with `campaign_read`, `campaign_upsert` and
`add_campaign_concept`; follow the connector guide for those):

1. `request_campaign_generation { campaign_id }` composes the plans for the concepts with no
   creatives yet (`concept_ids` re-runs chosen ones; `count` only for a number the user named). It
   spends nothing and returns `batch_ids` and `credits`. Never say generation has started.
2. Tell the user what will be made and the credit total, and wait for their explicit yes in this
   chat. Never send them to a button in the app; a campaign link is only a place to look.
3. Read `ads_creative_read { brand_id, view: "approvals", batch_id }` until that batch's plans are
   `awaiting_approval` and none is `composing`. If its credit total differs from what they
   agreed to, state the new total and ask again.
4. `ads_approval_decide { brand_id, decision: "approve", batch_id, user_quote: "<their exact words>" }`
   for each batch, then poll the batch ids it returns with `job_get` (`kind: "ads_batch"`) and
   end with each batch's `result.links`, as in step 7 of the workflow below.

Before approving, a steer is free: `ads_approval_decide { brand_id, creative_id, decision: "revise",
revise: { message } }` recomposes that plan (read the approvals view again), and
`decision: "edit_plan"` patches it directly. Editing the campaign in between discards these plans.

## Keep the brand kit in sync — reconcile, then save or propose

The brand kit is the source of truth every generation reads. During ANY task, when the user
**tells you something about the brand or asks to change something brand-level** — a different
tagline, audience, voice, a product's name/price/description, "our logo is X", "we don't sell Y
anymore", a new product photo — treat it as a possible kit update, don't just use it for this one
ad and forget it:

1. **Check it against the kit.** Call `brand_read` with `kit` and `learnings` for the active brand and see whether what the user said
   matches, is missing from, or contradicts the kit.
2. **If it's already in the kit and matches** — nothing to do; proceed.
3. **If it's new or different**, persist an explicit request to correct or remember the brand
   through the policy below; that request is already authorization. For an ambiguous one-ad
   direction, ask once whether it should stick. Agent-derived suggestions become proposals.
4. **Persist with the canonical write tools** (send only changed fields):
   - `brand_update` with explicit user-correction intent — structured brand fields or products;
     an inferred structured field uses agent-proposal intent instead. Follow the live schema.
   - `media_upload` / `media_update` — the user's own product and reference photos.
   Inspect each live schema and send only the fields needed for the confirmed change.
5. **Read back what changed** before saying saved, then continue the task. (Use the research
   workflow for researched logo/colors/fonts; explicit user edits use only fields supported by
   the canonical tool schema and the correction policy below.)

This is the parity gap the app closes in-product: a brand fact the user gives mid-task should be
able to flow back into the kit — with their ok — instead of being lost.

## Save durable brand answers, then verify them

Read the selected brand with `brand_read { brand_id, sections: ["summary", "kit", "products", "learnings", "onboarding"] }`
(older clients: `brand_get_context` with the same sections, only when that tool is advertised).
Keep founder answers, user corrections, research and your own hypotheses distinct. Reuse
matching saved answers; ask only about gaps.

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

## Picking source ads — use approved sources, not the retired catalog

When the user wants to make ads but has NOT named a specific template (id/slug/Community
ad/upload), do NOT silently browse the raw catalog and hand-pick for them. Instead send **one
proposal** — it mirrors the web app and keeps the human in the loop without an interview:

1. **Propose the direction yourself.** From the brand read and the evidence brief, recommend the
   product, angle/offer and tone, with a one-line reason naming what the Brain showed (a past
   approved angle, a rule it respects). **Do NOT ask what kind of ads they want, which product,
   or the vibe.** Keep any direction the user already gave. This shapes both the source choice
   and your steering `prompt`.
2. **Recommend a source in the same message: their own ads, Community, upload, or "Surprise me".**
   Default to their own approved ads when suitable ones exist, otherwise Surprise-me picks for
   the brand; list the other paths as one-line alternatives. You may resolve the picks and run the
   free dry run first so the proposal already carries the credit total. Show a list of sources as
   one table with every row and its image link, and mark your one suggestion.
   - **Their own ads** → `ads_template_read { brand_id, mode: "mine", filters: { relationship: "self" } }`
     and let them choose. `mode: "competitor"` rows are research and inspiration, never proof that
     the user owns the ad.
   - **Community** → `ads_template_read { brand_id, mode: "query", query: "<the angle and look>" }`
     ranks Community ads by meaning; each row's `sourceId` (with `title` and `thumbnailUrl`) goes
     in `source.community_ad_ids[].community_id`. To browse the feed instead, use `mode:
     "community"`: its rows carry `item_type`, and a `template` id goes in `source.template_ids`,
     a `creative` id in `source.community_ad_ids`. The backend snapshots a Community creative
     itself; there is no separate step. Let the user choose.
   - **Upload** → the user's own image becomes a private template: `media_upload` it (`scope:
     "brand"`, `scope_id: <brand_id>`, `kind: "image"`; in a chat app `source.type: "bytes"`), then
     `ads_template_create { brand_id, source: { type: "media", media_id } }` (or `source: { type:
     "url", url }` for a public image). Set `rights_attested: true` only after the user explicitly
     confirms they own it; this is the ownership/rights input. Never claim rights for a competitor
     ad or an image found online.
   - **Surprise me** (they want you/the app to pick) → `ads_template_read { brand_id, mode:
     "surprise", count: 4 }` picks remixable Community ads for the brand, shuffled so picks stay
     fresh. Every pick is a template: show them, and generate
     from the ones the user keeps (or from all of them if they said "just make them").
   - **Browse in the app** → hand the user this URL, with the active brand's slug filled in:
     `https://make.gooseworks.ai/create?brand=<brand-slug>&cli=true`
     In this mode the app shows a copyable remix prompt at the bottom (dismissable / switchable
     back to the UI composer). They browse their own and Community sources and copy the prompt.
3. **Close the loop.** When the user **pastes back the copyable remix prompt** from the app
   (it names the brand + the templates they chose), THAT is your cue to generate: resolve the
   named source(s) with `ads_template_read`, quote, and collect only the unresolved required inputs.

If the user already named an owned source (id/slug), a Community ad, or an upload, skip the source
choice. Competitor ads may inform the angle or structure, but describe them as inspiration, never
claim ownership, and never attest rights for the user. Never use the retired curated third-party
catalog.

## Workflow — make ads from a template

1. **Resolve the brand and its evidence.** List brands with `brand_read` (no `brand_id`), then
   read the selected brand's summary, kit, products and
   learnings and search the Brand Brain as above. If research isn't `complete`, you can still
   submit (the batch queues and runs when research finishes) — just tell the user. Use the read to
   pick `product_name` (a real entry from `products.items`, not a guess) and, if the user supplied
   product photos, `reference_image_urls` (public URLs; `media_upload` a local file first).
2. **Pick the source ad(s) via the proposal above.** Read each chosen template with
   `ads_template_read { brand_id, template_id }`. Community creatives (a query row's `sourceId`,
   a feed row with `item_type: "creative"`) and the user's own finished ads go straight into
   `source.community_ad_ids` / `source.creative_ids`.
3. **(Optional) Craft the steering prompt.** The `prompt` is OPTIONAL — this is where the skill
   adds value: turn the user's intent (from step 1) into a concise steering note (e.g. tone,
   season, emphasis). Don't over-specify; the backend pipeline + brand kit handle palette, fonts,
   product swap.
4. **Quote the cost.** Call `ads_generate` with the exact arguments you will submit plus
   `dry_run: true` (template sources), or work out the total as in the credits table. Drop or
   replace anything in `unknown_template_ids`. State the image count and credit total in one line
   and wait for the user's explicit yes.
5. **Submit ONE batch** after that yes: the same `ads_generate` call without `dry_run`. Keep the
   returned `job_id`.
6. **Poll until done.** `job_get { job_id, kind: "ads_batch" }` every ~20-30s until every creative's
   `pending` is 0. Most images finish in a few minutes; text-heavy templates and `quality: high`
   take longer. Read each render's `elapsed_seconds` rather than guessing; do NOT re-submit
   thinking it stalled (that double-bills). If `ads_generate` refused with
   `brand_research_required`, the brand was never researched: run "Brand research" below, then
   quote and submit again.
7. **Hand back the ads with their links.** Show every finished image (`renders[].output_url` of
   completed renders) and say in one line what failed, if anything. Then give the links from the
   last `job_get`'s `result.links`, copied verbatim: each creative's `app_url` (from
   `creative_links`, matched by `project_id` to the creative) and the `brand_url` where all
   the brand's ads are. Skip a link that is `null`; never build an app URL yourself. Never end on
   just "done" or a file path.

## Workflow — edit an existing ad

User wants to tweak a creative they already made → `ads_creative_edit`. Read the creative first
(`ads_creative_read { brand_id, creative_id }`) to get the render they mean. Infer the action
from their request: another take (`regenerate`, `mode: "variation"`), a targeted change
(`regenerate` with `mode: "edit"`, or `precision_edit` when they point at a region), an exact
instructed change (`mode: "exact"`), new placements (`resize`), editable layers (`layerize`) or a
short video (`animate`). Ask only for a required source or instruction that is still missing,
state the credit total from the credits table, get the yes, submit, poll as above, and hand back
the new images with their links: `result.links` from `job_get` for `regenerate`, `resize` and
`precision_edit`; `creative.app_url` and `creative.brand_url` from `ads_creative_read { brand_id,
creative_id }` for `animate` and `layerize`.

## Brand research

Prefer the backend's result. `brand_read { brand_id, sections: ["summary"] }`: if
`research_status` is `complete`, REUSE it — never re-research. Proof points and the full product
catalog keep arriving until `enrichment.settled` is true.

**The split — backend owns visuals, you own the qualitative depth:**

- **Backend LIGHT pass (automatic).** A new brand comes from the connector's setup flow
  (`brand_onboarding { action: "status" }`, then its `next_step`). For an additional brand, check
  it is absent (`brand_read` with no `brand_id`), then `brand_create { name, website_url }` (free).
  The website starts the same backend research the web app uses: it resolves the
  **authoritative logo, colors, and fonts** plus a baseline kit and returns `research_job_id`; poll
  `job_get { job_id: research_job_id, kind: "brand_research" }` (or `brand_read`) until
  `research_status` is `complete` — usually under a minute. If it returns `reused_existing: true`,
  tell the user and use that brand. You can't reproduce those visual signals, so **never
  re-derive logo/colors/fonts.**
- **Your DEEP pass (optional).** You add the qualitative depth the light pass leaves thin —
  positioning, audience, voice, brand type, value props, proof points, products — grounded on
  the actual site.

**Deep research flow:**

1. Fetch the `brand-research` skill (`catalog_fetch { type: "skill", slug: "brand-research" }` in a
   chat app; `gooseworks fetch brand-research` in a terminal) and follow its phases. Its data
   calls are paid: state the credit total (credits table) and get the yes first. **Ground every
   fact on the brand's own site** — if the site can't be read, say so and ask the user; never
   guess a category from the brand name alone.
2. **Save what you improved.**
   - **As proposals (the default):** `brand_update { brand_id,
     knowledge_intent: "agent_proposal", rationale, patch: { knowledge: { positioning?, audience?,
     voice?, brandType?, tagline?, valueProps? } } }`. They stay pending until the user accepts
     them in the app.
   - **As the full research pack (only when you wrote all of it; in a chat app, only for a brand
     with no website, see below):** with `file_write`, under
     `agent-config/brands/<slug>/brand-research/`, write all four docs `brand-summary.md`,
     `visual-identity.md`, `audience.md` and `competitors.md` (real content, at least a few
     sentences each) plus `kit-patch.json`: `{ positioning?, audience?, voice?, brandType?,
     tagline?, valueProps?: string[], proofPoints?: [{ text, source_url }], products?: [{ name,
     description?, link?, pricing?, imageUrls?: string[] }] }` with only the fields you improved;
     every proof point copied word for word from the brand's own page at `source_url`; product
     images only from URLs already in GooseWorks storage; **no logo / colors / fonts**. Then
     `brand_update { brand_id, patch: { finalize_research: true } }` merges it NON-CLOBBERINGLY
     (never over the backend's visuals or a user edit). **If any of the four docs is missing or
     nearly empty, finalize fails and marks the brand's research as failed**, so never finalize a
     partial pack.
3. **Verify:** `brand_read` again (`summary`, `kit`) and confirm what you saved before generating.

**If the brand has NO website**, the backend light pass can't run and generation goes ahead with
an empty kit, so ads come out off-brand. Do the deep pass from what the user tells you and save the
full research pack, so the brand has a kit and a record to debug a wrong run (this is how a bad
classification, e.g. mislabelling a SaaS as a "drink company", used to vanish).

## Analyze / intelligence (fetched recipes — NOT generation)

These are analysis recipes you fetch and follow; they don't use the generation tools, but their
data calls are paid (credits table: state the total and get the yes before the first one). Fetch with `catalog_fetch { type: "skill", slug: "<slug>" }` in a chat app or
`gooseworks fetch <slug>` in a terminal. Pick the closest match; if unsure, search first with
`catalog_search { type: "skill", query: "<what the user wants>" }` (terminal:
`gooseworks search "<what the user wants>"`):
- **Campaign performance diagnosis** ("why is my Meta/Google campaign underperforming",
  creative fatigue, learning phase, pacing, auction overlap) → `meta-ads-analyzer`
  (or `ad-campaign-analyzer` for cross-platform).
- **Lead/CAC quality** ("are these ads driving qualified leads", true CAC vs vanity CPA,
  Scale/Keep/Investigate/Cut) → `ad-lead-quality-analyzer`.
- **Competitor ad intelligence** ("what ads are competitors running") →
  `competitor-ad-intelligence` (Meta Ad Library: `meta-ad-scraper`; Google: `google-ad-scraper`).
- **Creative ideation** (ad angles, winning hooks) → `ad-angle-miner` / `trending-ad-hook-spotter`.
- **Policy / landing-page checks** → `meta-ad-policy-checker` / `ad-to-landing-page-auditor`.

A recipe's provider calls go through the connector in a chat app (`data_call_provider` for GET,
`data_post_provider` for POST) and through `gooseworks call` in a terminal; both are billed. Saving and running
its scripts (under `/tmp/gooseworks-scripts/<slug>/`) is terminal-only: without a terminal, do
that step's analysis yourself from the data the tools return, and never ask the user to run a
command.

## Rules

- **Connector tools only** — every step uses the tool names above. A missing tool means the
  GooseWorks connection is stale: ask the user to reconnect or refresh GooseWorks. Never send a
  chat-app user to a terminal or a CLI install.
- **One backend workflow** — generation is `ads_generate` / `ads_creative_edit` ONLY.
  Do NOT call FAL, the media proxy, `submit_render`, `update_render_status`, or upload render
  files yourself; do NOT fetch a local remix recipe to generate. The backend owns it.
- **State the credit total and get an explicit yes before every paid call** (credits table above).
  Relay `insufficient_credits` plainly if the submit is rejected — don't retry blindly.
- **No plan step for one-off ads.** Only a campaign's plans wait for approval
  (`request_campaign_generation` → `ads_approval_decide` with the user's words as `user_quote`).
- **Always end a successful run with the finished images and their links** (`result.links`:
  each creative's `app_url` and the `brand_url`), copied verbatim. Never end on just "done" or
  a file path, and never build an app URL yourself.
- **Search the Brain before proposing.** After the brand read and before choosing an angle,
  claim or source — or asking for a brand fact — run the task's `knowledge_search` and carry
  its evidence brief. A failed or empty search is stated as such, never as "no evidence exists".
- **Use approved source paths.** If the user didn't name a source, recommend one in the single
  proposal (own ads, Community, upload, Surprise me, or browse in the app). Surprise me is
  `ads_template_read` with `mode: "surprise"`; browsing uses `/create?brand=<slug>&cli=true`.
  Never use the retired curated third-party catalog. Generate when they paste the app's copyable
  remix prompt back, or when they accept the surprise picks.
- **Treat competitor ads as inspiration** — never attest rights, imply ownership, or promise to
  copy a competitor's distinctive expression.
- **Reconcile brand facts into the kit** — when the user states or changes something brand-level
  mid-task, compare it with `brand_read`. Save explicitly authorized corrections through
  `brand_update` with correction intent and the user's exact statement, or the user's own
  images through `media_upload`; read back before saying saved. Proposed improvements stay
  pending. Ask only when it is unclear whether a one-ad direction should apply to future ads.
- **Record feedback** — when the user reacts to a generated image, call `ads_creative_update`
  with `patch.feedback` so the quality loop learns.
- **Don't busy-loop** — poll `job_get` on a sensible interval (~20-30s); a `queued` batch is
  waiting on research and will start on its own.
- **Report problems so we can fix them** — when a batch fails or is rejected and you can't resolve
  it, a required brand input/asset is missing, or an instruction is ambiguous or contradictory:
  in a terminal run `gooseworks log "<what happened>" --event-type <error|blocker|missing_input|confusion> --details '<json with the real error and step>'`,
  or call the `log_cli_event` tool if your connection lists it. A chat app without either skips
  this step. Always tell the user too.
