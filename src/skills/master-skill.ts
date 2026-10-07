/**
 * The CLI installs two vendored ENTRY skills into ~/.agents/skills/:
 *   - `gooseworks`  — the PARENT router (getMasterSkillContent): GTM/data toolkit
 *     PLUS a domain router that hands ads/graphics/video work to the dedicated
 *     `goose-*` skills below.
 *   - `goose-ads`   — the ads entry/contract (getGooseAdsSkillContent): ad creative
 *     (remix, brand research) AND ad analytics/intelligence. Formerly `ads-remix`.
 * Each is a separate Claude Code skill; Claude auto-loads whichever matches the
 * task by its description. They are domain-scoped on purpose — do NOT merge them.
 *
 * Sibling domain skills NOT vendored here (fetched live from goose-skills):
 *   - `goose-graphics` — charts/slides/infographics/branded visuals. Installed via
 *     `gooseworks install --with goose-graphics` or fetched on demand.
 *
 * Video (vendored here, GOOSE-3677):
 *   - `goose-video`       — the front door for a new video ad: brand → goal →
 *     format table → machine check → project → hand off to goose-video-local
 *     (getGooseVideoSkillContent). The only full copy of that body.
 *   - `goose-video-local` — render an existing app project/batch LOCALLY
 *     (Playwright + ffmpeg + media proxies) (getGooseVideoLocalSkillContent).
 *
 * Recipe skills (remix-graphic-ad-from-reference, brand-research, meta-ads-analyzer,
 * …) are NOT vendored here — they live in goose-skills and are fetched live on
 * demand from the connected catalog; saved packages retain their recorded hashes.
 */
import { renderDomainRouteTable, renderBrandGrowthTable } from './routes';
import { CUSTOM_VIDEO_ADAPTER_CONTENT } from './custom-video-skill';
const STORED_FOOTAGE_GUIDANCE = "\n## Use uploaded footage\n\nWhen the customer asks to use existing footage, check the actual advertised schemas. Use `media_search` with purpose `production`, kind `video`, the brand and current project when needed. Omit query spend for free retrieval. Read facts/scenes with `media_analyze`, then use `media_excerpt` action `inspect` to review actual bounded frames and timed transcript before selecting. A description or thumbnail URL alone is not visual review.\n\nFreeze `source_excerpt:{asset_id,analysis_revision,scene_id,start_ms,end_ms,audio_mode}`. Revision is the original-byte SHA, scene may be null for a known user trim, bounds use integer milliseconds, and audio is original or muted. Call `media_excerpt` action `attach` with that exact selection and a stable idempotency key. The returned project remains unfinished and unapproved. Open its existing Studio review; preserve user locks and requested format, and keep footage separate from image packshot indexes. An incompatible format requires an explicit choice before changing it.\n\nFor custom production, fetch the current shared `video-production-harness` and follow script/ingredient gates. Download the verified original and trim its exact selected window at normal speed with the approved audio. Recheck current revision and production permission before consumption and final upload/completion. Save excerpt lineage in plan and ingredient readback. Missing optional semantics does not require another upload; known user-selected stored footage remains usable. Research and competitor references never become production footage. Selected originals require no paid generation; only newly generated/replaced ingredients consume the approved budget.\n";

export interface EntrySkill {
  /** Install dir name under ~/.agents/skills/ AND the skill `name`. */
  name: string;
  content: string;
}

/**
 * How every entry skill talks to the customer. Shared so the five skills can't
 * drift. The customer is a marketer or founder, not an engineer: everything the
 * skills say about tools, fields, polling and pipeline steps is for the agent,
 * and a run that narrated it ("checking the media-proxy helpers for voiceover
 * timestamps and lipsync", "generated with gpt-image-2") read as noise.
 */
const SKILL_FRESHNESS = `## Use current instructions for new work

Before a new task in a terminal host, run \`gooseworks skills status\` once. It compares the
installed entry files, running CLI and published npm release. An older CLI needs a package
upgrade before \`gooseworks update\`; update alone only uses that CLI's bundled instructions.
Preserve local edits or unknown install provenance. Review/back up before explicitly replacing
modified files; never quietly reinstall over them. If the release check is unavailable, report
that freshness is unknown rather than claiming the local copy is latest.

For a new recipe run, fetch its package from the connected catalog. Retain the returned
\`version\` / \`contentHash\` and every dependency's hash with the saved package. When reusing a
saved fetch JSON, \`gooseworks fetch <slug> --saved-package <file>\` returns the current package
and a hash comparison without changing that file. With MCP, if the advertised \`catalog_fetch\`
schema accepts them, send \`saved_content_hash\` and \`saved_dependency_hashes\`; otherwise fetch
normally and compare the returned hashes yourself. Missing hashes mean unknown, not current.
The server cannot inspect a client's saved files; hash metadata does not certify later edits.
Fetch current packages into a new run directory and report stale saved instructions. Preserve
an existing approved run's recorded package; changing that harness requires a reviewed change
and approval before spending. Hosted installed snapshots use the existing Skills Update action.
Skill content and a host's cached MCP tool schemas are separate: refreshing one does not refresh
the other. Check the actual advertised tools before using new fields.`;

const VIDEO_GUIDE_COMPATIBILITY = `**Follow the connector's full-guide requirement when available.** Fetch
\`catalog_fetch { type: "skill", slug: "gooseworks-guide" }\` when the connector requires it.
The only older-server exception is below; it never removes brand preparation or approvals.

| Returned guide/workflow state on the selected connection | Required action |
| --- | --- |
| Guide returns \`not_found\`, and this same connection already returned the complete current matching video entry with its required dependencies | Continue with that authoritative entry's workflow, full brand preparation and existing approvals. |
| Guide has another error, no response, or incomplete content; or the matching entry/dependencies are missing, incomplete or from another connection | Stop before creative work, project writes or paid calls; resolve a compatible connection on this same environment. |

A missing custom entry or required custom tool/schema remains unavailable: never substitute
a template or an import to bypass it. Never hide other fetch errors or continue from cached
instructions merely because the guide was not found.`;

/**
 * The Brain-first entry contract, shared by the router, goose-ads and every video
 * entry. A fresh agent read the Kit, then asked the user for angles and proof
 * the Brand Brain already held: no entry made the search a step, and several
 * told it to ask. Searching is free and read-only, so it needs no approval.
 */
const BRAIN_FIRST_ENTRY = `## Search the Brand Brain, then propose — before any creative choice or question

The Brand Kit is a summary. The brand's saved knowledge (its Brain) holds what the Kit does not:
rules from past feedback, approved and rejected creatives, customer evidence, approved claims,
reports and documents. **After \`brand_read\`, and before you choose an angle, claim, hook,
product emphasis, format or source ad — and before you ask the user for any brand fact — call
\`knowledge_search { brand_id, query }\`** when it is registered. It is free and read-only: no
approval, no announcement to the customer and no questionnaire.

1. **Search for this task, not the whole Brain.** Run one short query (under 500 characters) in
   the user's own words plus the product (for example "ads for <product>: what worked, what to
   avoid") and one with
   \`source_types: ["evidence", "claim", "learning", "creative", "document"]\` for proof and past
   creative results. Add a query only for a specific open question. Reuse results from this run.
2. **Keep these states distinct** and record which one each query returned:

| Result | Means | Do |
| --- | --- | --- |
| \`status: "ok"\` with matches | Saved knowledge exists | Use it; keep each fact's citation in your working brief |
| \`status: "empty"\` | Nothing saved matches this query | Say "no saved evidence for <topic>", never "the brand has no proof" |
| \`refresh_required\` | The results shown are current; some changed sources were left out | Use them; search again shortly for anything missing |
| \`building\` | The index is not ready | Retry once shortly, then continue with the gap stated |
| An error, or the tool is not registered | Retrieval failed or is unavailable | Retry an error once, then continue from \`brand_read\` and treat evidence as unchecked |
| An empty Kit field | Only that field is blank | Not a search result: still search before asking |

3. **Let the findings change the plan.** A \`dont\`/\`must\` learning or a rejected creative rules
   options out; an approved or well-rated past creative is a proven angle to lead with; a report
   shows what worked. Claim-grade proof is a result with \`approved_ad_claim: true\` or the kit's
   \`approvedClaims\` within their stated applicability; the kit's \`proofPoints\` are what the
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

On an approved resume, keep the saved brief and evidence; search again only for a new decision.`;

/** One prerequisite for template, custom and delegated video entry. */
function videoEntryPreparation(slug: 'goose-video' | 'goose-video-local' | 'make-custom-video'): string {
  return `## Prepare the video workflow and brand before creative work

**Installed entry files are bootstrap instructions.** For new work started from an installed
file or an old chat, fetch \`catalog_fetch { type: "skill", slug: "${slug}" }\` on the selected
connection and read its returned content and dependencies before continuing. Use the already
fetched body when this entry came from that connection in this run; do not recursively fetch
the same entry. A CLI freshness warning does not block using the current connected package.
Keep the fetched package and hashes in a new run folder; do not replace edited installed files.
If current instructions cannot be loaded, resolve the connection before format suggestions,
script writing or production. Do not continue from an old installed workflow or session notes.

${VIDEO_GUIDE_COMPATIBILITY}

**For an existing project or batch, read \`video_project_read\` first.** Determine its actual
route and saved review state before fetching a recipe or doing local work. Resume an approved
run with its recorded packages, brand inputs, script and ingredients; do not silently replace
them with today's release or brand rules. Follow returned preparation requirements and use
the existing affected review/approval flow for an intentional change. Reads, free drafts,
imports and existing-job retrieval do not grant permission for new paid production.

**For every new plan, resolve the brand and call**
\`brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }\` **before**
suggesting formats, mining video angles, writing any script, creating a production plan or
handing the work to another agent. Use \`brand_get_context\` with those same four sections only
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
Entries prefixed \`Video preference:\` and visual/pacing instructions are creative direction,
not spoken lines. Use the kit's audience, offer and voice as defaults without an interview.
The rules file mirrors context; it is not proof of a read or permission to spend. Keep the
route's existing script, ingredient and budget approvals, including its allowed previews.

**Use the server's brand bundle when the selected API returns it.** Project create/read may
return top-level
\`brand_context\`: \`{ version: 1, brand_id, digest, loaded_at, sections, brand, kit, products,
learnings }\`. Its sections cover summary, kit, products and learnings.

| Returned brand/project response on the selected connection | Required action |
| --- | --- |
| A complete authoritative version-1 \`brand_context\` is returned | Binding is required: use its contents for the plan/rules and include \`script_drafts.brand_context_digest = brand_context.digest\` with each new/changed script save. |
| An older API returns the actual four brand sections but no \`brand_context\` in either the brand read or project response | Prepare from those full sections, write the brand rules and follow the selected connection's existing approval flow and advertised fields. Do not fabricate a receipt or send nonexistent bundle/digest fields. |

An incomplete/malformed bundle or missing brand section is a preparation failure, never the
older-API exception. Once this connection returns an authoritative bundle, use its binding
contract. \`script_drafts.video_brand_context\` is server-owned: do not author, replace or forge
it, and do not invent a read receipt or hash local brand facts into one. Keep the full bundle
out of client review payloads. If managed generation returns HTTP 409
\`video_brand_context_required\`, reload the project and bind the plan to its returned bundle
through the normal review flow before retrying. That refusal never permits the older-API
fallback, skipping sections or retrying paid calls blindly. Unchanged approved legacy resumes
retain their package, context and approvals; an upgrade alone needs no extra approval.

**To apply a deliberate brand correction to a new or revised plan**, make a fresh, unfiltered
\`brand_read\` of those four sections. When it returns the authoritative bundle, use its
returned \`brand_context.digest\` in the complete revised \`script_drafts\` through the existing
\`video_project_upsert\` \`patch.script\` save; the server verifies the current brand and replaces
its snapshot with the saved plan. On an older API with no bundle contract, apply the actual
four-section correction and save the revised draft through its existing flow without inventing
digest fields. If a connection that already returned a bundle cannot supply the fresh bundle,
resolve that failure before rebinding. Review and approve the affected script, ingredients and
budget through the normal flow. Never refresh an ongoing approved run automatically; its
recorded package and brand inputs stay pinned until an intentional change.

${BRAIN_FIRST_ENTRY}`;
}

const CUSTOMER_TALK = `## How to talk to the customer (applies to every message you send them)

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

${SKILL_FRESHNESS}`;

const ENVIRONMENT_IDENTITY = `## Keep the selected connection for the whole run

Call \`account_whoami\` on the connection that owns the brand/project before the first write.
Keep \`environment.name\` and the public \`environment.api_origin\` with this run. Respect the
user's selected production or staging connection. If multiple connections are available and
none was selected, resolve that once. Missing or unknown identity is uncertainty, not
permission to switch. Never infer the environment from credits, billing links or Node mode.

Reads, project creation, uploads, generation, polling and final updates all use that same
connection. If a production request fails, resume or report the failure on production;
never retry it on staging or recreate the project there. Before retrying a timed-out write,
read back the existing project or paid request on the selected connection.

Local/CLI proxy origin must match \`environment.api_origin\`. If it differs, use the MCP
relay on the selected connection (\`GW_MEDIA_VIA=mcp\`) before paid calls. Do not change
credentials or API origins to recover a failed write. An explicit user-requested move is
a separate operation, with the existing project and paid requests reconciled first.`;

const ASSET_READINESS = `## Check assets for the selected format before spending

For a template, read its structured \`asset_readiness\` from
\`video_catalog_list { kind: "formats", brand_id }\`. \`missing\` names gaps;
\`needs_review\` means suitability is unverified, including older recipes without
structured requirements. \`ready\` describes assets only, not script or budget approval.
For a custom video, derive requirements from its actual approved scenes.

Inspect candidate files for the chosen product and format. A catalog photo can contain
multiple objects, other products or a person; its existence or approved status does not
make it a standalone image of the selected product. Check object count, framing, readable
print and real image bytes. A service conversation has no automatic packshot requirement.

Reuse a suitable approved image first. A free crop or cutout is a new file: keep the
original, inspect the result and include it in the normal ingredient review. When no
usable input exists, explain the gap before generation. Estimate any paid preparation
separately before spending. Record the selected asset and inspection in the project
review set; do not add a separate approval round.`;

/** Same canonical capture policy for the router and both video entrypoints. */
const DURABLE_BRAND_CAPTURE = `## Save durable brand answers, then verify them

Read the selected brand with \`brand_read { brand_id, sections: ["summary", "kit", "products", "learnings", "onboarding"] }\`
(older clients: \`brand_get_context\` with the same sections, only when that tool is advertised).
Keep founder answers, user corrections, research and your own hypotheses distinct. Reuse
matching saved answers; ask only about gaps.

When the user asks to remember a rule, answers a brand interview, or explicitly corrects a
standing fact, save that answer in the same turn. The capture request authorizes those answers;
do not ask for approval again. A direction for this one video stays in its brief. If the scope
is genuinely ambiguous, ask whether it applies to future videos before saving a standing rule.

Use the **live registered schema**. Where supported, call \`brand_update\` with
\`knowledge_intent: "user_correction"\` and \`user_statement\` containing the user's exact,
verbatim answer, not your paraphrase or researched text.
For an inference or suggested improvement, use \`knowledge_intent: "agent_proposal"\`. Show the
before/after change from your prior read and proposed value; retain the returned proposal IDs
and say the user must accept it in the app. Link only a review surface actually returned by a
tool; the compact \`knowledge_updates\` response does not itself contain a diff or URL.
A pending proposal is not a saved fact. Never call an unavailable
tool or silently relabel research or your inference as something the user said.

The safe structured shape is \`patch: { knowledge: { positioning?, audience?, voice?,
instructions?, brandType?, tagline?, valueProps? } }\`, using only fields present in the live
schema. Inferred rules/taste go in an \`instructions\` proposal with a rationale, never in
\`patch.facts\`. Prefix every video-only preference in that proposed text with "Video preference:"
so it remains production direction after acceptance. Preserve unrelated instructions when
proposing a merged replacement.

| User answer | Canonical write |
| --- | --- |
| Primary audience, positioning or voice correction | \`patch.knowledge: { audience/positioning/voice: <answer> }\` (one actual key). During onboarding, \`brand_onboarding { action: "review_research", review: { action: "correct", field, value } }\` writes these existing corrections with provenance. |
| Founder story, customer pains, objections, buying trigger or useful audience detail without a structured field | \`patch.facts: [{ kind: "insight", text }]\`; retain attribution such as "Founder reports: …" rather than turn a belief into a verified result. |
| Required wording or pronunciation | \`patch.facts: [{ kind: "must", text }]\`; pronunciation is exactly \`Pronounce "<term>" as "<say_as>"\`. |
| Forbidden claim, word or visual | \`patch.facts: [{ kind: "dont", text }]\`. |
| Durable visual, voice or pacing preference | \`patch.facts: [{ kind: "do", text }]\` for a preference; \`dont\` for an avoidance; \`template_hint\` for a preferred format. Prefix video-only preferences with "Video preference:". |

Facts are existing \`ad_brand_learning\` rows with user provenance; they are not a second profile.
Update a matching rule by its returned \`id\` instead of adding duplicates. Preserve unrelated
rules and the user's exact meaning. Only use the legacy facts shape for explicitly user-authored
answers when the live schema lacks intent fields; agent suggestions still need a proposal path.

**Claims and plans have separate gates.** A founder assertion or proof point is not an approved,
evidence-backed claim or consent to quote a customer. Use the existing evidence/claims and
operating-plan tools only if registered, following their proposal, evidence and confirmation
requirements. Never encode a spend cap, approver or emergency stop as a learning. If that write
path is missing, report the specific unsaved item and keep it pending for the supported review
surface; do not claim it was saved or create a parallel local profile.

After every write, **read back before saying saved**: use \`brand_read\` with \`kit\`, \`learnings\`
or \`onboarding\` as appropriate, or \`brand_onboarding { action: "status", brand_id }\` after an
onboarding answer. Verify the intended field/rule, its source and the absence of a conflicting
duplicate. A generic success response, pending proposal, ignored key or truncated result is not
proof. Report partial saves honestly. Carry the verified rules into the current task and the
routed skill; claims still pass their own safety gate.`;

/** The existing media library and learnings are sufficient for a minimal taste brief. */
const VIDEO_TASTE_CAPTURE = `## Video taste — reuse examples and preferences

When asked to capture video taste, or when the user volunteers a durable video preference,
first read the saved learnings and \`media_list { brand_id, scope: "brand", scope_id: brand_id,
tags: ["video-taste"], limit: 100 }\`. Follow \`next_cursor\` before deciding an example is absent.
Do not force a taste interview before an unrelated task or ask again for an existing preference.

Save what the user has already supplied first. Then ask only the missing useful question, for
example: "What do you like about this video—its pace, voice, captions, or look?" An inaccessible
link can still be saved as a link with the user's explanation; do not pretend you watched it.

- **Direct clip or video file:** register with \`media_upload { brand_id, scope: "brand",
  scope_id: brand_id, kind: "video", source: { type: "url", url }, tags: ["video-taste", "reference-only"],
  metadata: { purpose: "video_taste", source_url: url, provenance: "user", captured_at: <ISO timestamp>,
  preference: <the user's explanation> } }\`. For a file use the live file/bytes upload flow and
  \`media_confirm\` after a presigned upload. Registration of a URL does not copy or inspect it.
- **Instagram/post/page link:** the same registration with \`kind: "document"\`; it is a link
  bookmark, not downloadable footage or an indexed transcript. Do not fabricate a direct clip URL.
- **Preferences:** save the user's reasons, likes and dislikes through the facts mapping above.
  Read and preserve existing facts before updating one. Do not invent \`video_preferences\` or
  new \`video_lab\` keys; the live kit patch accepts only its documented asset fields.
- **Deduplicate:** reuse a matching returned media row, then \`media_update\` its title/tags/metadata
  if needed; preserve existing metadata and tags. Do not create another row for the same example.
  Read back with \`media_list\` and \`brand_read\` learnings before claiming it was saved.
  Check the returned row belongs to this brand: URL deduplication may return another brand's
  existing row. Do not relabel that row or claim success unless the current brand's scoped read
  actually returns it. Report an unsaved association if no supported attach path is available.

Never put third-party taste examples into kit reference images: \`kind: "reference"\` at brand
scope writes there. The tags and metadata above record purpose and provenance; **they do not
grant or enforce usage rights**. Study the structure, pacing and look only. Never use the example's
footage, face, product, testimonial or claims in a new ad without independently verified permission.

Read video-only entries prefixed \`Video preference:\` from both saved learnings and
\`kit.instructions\`, including accepted proposals. Keep them out of required or forbidden
dialogue. Build a brief from the verified readback: preferred pace, voice, caption treatment, visual style,
formats to favour/avoid, reference links and the user's reasons. Say what is still unknown.
Pass it with the brand rules into the existing video workflow. A one-video request overrides a
default for that project; it does not silently rewrite the brand's standing preference.`;

/**
 * THE registry of entry skills (GOOSE-3190) — one list, four consumers:
 *   - `gooseworks install` / `update` / login-refresh write exactly these dirs,
 *   - `npm run generate:skills` regenerates exactly these `skills/<name>/SKILL.md`,
 *   - `skills/names.ts` derives which dirs the CLI is allowed to delete,
 *   - the backend raw-fetches these paths for hosted connectors.
 *
 * `goose-product-photos` used to be a hand-maintained `skills/…/SKILL.md` that
 * was on disk and served by the backend but absent here — so it was never
 * regenerated and never refreshed on install. Adding it closes that drift.
 */
export function getEntrySkills(): EntrySkill[] {
  return [
    { name: 'gooseworks', content: getMasterSkillContent() },
    { name: 'goose-ads', content: getGooseAdsSkillContent() },
    { name: 'goose-video', content: getGooseVideoSkillContent() },
    { name: 'goose-video-local', content: getGooseVideoLocalSkillContent() },
    { name: 'make-custom-video', content: getMakeCustomVideoSkillContent() },
    { name: 'goose-product-photos', content: getGooseProductPhotosSkillContent() },
  ];
}

/** Just the directory names, for callers that don't need the bodies. */
export function getEntrySkillNames(): string[] {
  return getEntrySkills().map((s) => s.name);
}

/**
 * Returns the GTM master SKILL.md content (the `gooseworks` entry skill).
 * It teaches the coding agent how to discover and use GooseWorks skills on
 * demand via the `gooseworks` CLI commands.
 *
 * The CLI handles credentials loading internally, so the agent does not
 * need to read ~/.gooseworks/credentials.json or set environment
 * variables — every command auto-loads the API key.
 */
export function getMasterSkillContent(): string {
  return `---
name: gooseworks
slug: gooseworks
description: >
  GooseWorks growth coworker and specialist-skill router. Research brands, customers, competitors,
  creators, markets, and prospects; analyze ads and performance; create ads, product photos,
  graphics, and video; search and scrape public web and social data; find and enrich leads.
  Capture founder answers, brand rules, audience depth, and video taste in the existing brand.
  Use it as the single GooseWorks entry point for brand growth, B2B, sales, research, and GTM work.
category: general
version: 1.1.2
author: GooseWorks
tags: [gooseworks, data, scraping, search, reddit, twitter, linkedin, email, people, research, gtm, leads, prospecting]
---

# GooseWorks

You have access to GooseWorks — an AI coworker with specialist skills for research, analysis, creative work, lead generation, enrichment, and public web/social data. Use the right specialist when the request needs brand context, a managed creative workflow, data at scale, a source behind authentication, or a specific provider.

This skill is also the **parent router** for the GooseWorks family. Data/GTM work you handle here (see "How to Use"); specialized work you hand off to a dedicated \`goose-*\` skill.

${CUSTOMER_TALK}

## Route to the right skill FIRST

First apply the **Common company onboarding** gate below. Preserve the user's original request while onboarding, then continue with it as soon as onboarding is complete. For video work, load the current matching workflow from the selected connection first: \`goose-video\` for a new request, \`make-custom-video\` for an explicit original/reference brief, or \`goose-video-local\` for an existing template project/batch. Read an existing project first to determine its actual route and retain its approved packages. Fetch with the advertised \`catalog_fetch { type: "skill", slug }\`; an installed copy or old chat is only a bootstrap. Then load the brand context (**"Load the brand context FIRST"**, immediately below), search the Brand Brain for the task (**"Search the Brand Brain, then propose"**), and follow the matching workflow with both. For other specialized work, **switch to that skill** after loading the brand instead of the data flow below:

${VIDEO_GUIDE_COMPATIBILITY}

For "interview me about the brand", "save our brand rules", "refine our audience", or "remember
our video taste", stay here and follow **Guided brand capture** below. This extends the current
brand and onboarding flow; it does not create another onboarding checklist.

| If the user wants… | Route to | How |
| --- | --- | --- |
${renderDomainRouteTable()}
| Anything else — scraping, research, lead gen, enrichment, any data lookup | (stay here) | Follow "How to Use" below. |

Examples — all of these route to \`goose-ads\`, not the data flow: "remix this ad with project id 123", "make an ad for my product", "research my brand", "why is my Meta campaign underperforming", "which creatives should I cut".

## Load the brand context FIRST (mandatory — before you route, and before you ask anything)

**Call \`brand_read { brand_id, sections: ["summary", "kit", "products", "learnings", "onboarding"] }\` before the first substantive step of ANY task**, and before you route to a specialist skill. Older clients can use \`brand_get_context\` with the same sections only when that tool is advertised. It is a read-only call that returns the brand's canonical facts and saved rules:

For videos, read the current workflow first as described above, then load all four creative
sections (summary, kit, products and learnings) before suggesting formats, choosing angles or
writing a script. Onboarding facts alone are insufficient. Carry saved rules and kit assets
into the specialist's brand preparation. \`Video preference:\` rules describe the look, voice
and pacing; they are not lines to read aloud. On an approved resume, preserve the saved brand
inputs and packages; an intentional change uses the existing affected review/approval gates.

| It returns | Use it for |
| --- | --- |
| **voice** — tone, style, banned phrasing | Any copy, script, caption, hook, or headline. Don't ask "what tone?" |
| **products** — names, descriptions, pricing, links, imagery | Picking the product to feature. Don't ask "which product?" — offer the list. |
| **audience** — segments, demographics, jobs-to-be-done | Targeting, angles, creator fit. Don't ask "who is this for?" |
| **positioning** — category, value props, proof points, tagline | Angles, offers, competitive framing. Don't ask "what makes you different?" Kit proof points are proof an ad may state as written; other positioning text is context. |
| **research status** — whether the brand's research pass has completed | Whether the facts are trustworthy yet, or still being filled in. |

Then:

1. **Pass what it returned INTO the routed skill.** When you hand off to \`goose-ads\`, \`goose-video\`, \`goose-product-photos\`, \`goose-graphics\`, or a fetched Brand Growth recipe, carry the voice / products / audience / positioning with you, plus the evidence brief from the Brain search below. Do **not** make the routed skill re-derive them, and do **not** re-run brand research when the context is already there.
2. **Never re-ask the user for something the brand context already answers.** If a routed skill's own prose asks a question the context or the Brain search answers, they win — answer it yourself and move on. Ask only for what is genuinely missing after both, or a decision that is the user's to make.
3. **If research status is not complete**, say so in one line, use what you have, and continue. Only run brand research when the context comes back empty or the user asks for it.
4. **If \`brand_read\` is unavailable**, refresh the GooseWorks connection or tool list. An older connection may expose \`brand_get_context\` / \`get_brand_kit\`; use those only when actually advertised. Never require a legacy tool name or guess brand facts.
5. **A read grants no write permission.** Save explicit durable answers/corrections with the capture policy below. Propose agent-derived changes for review; never overwrite confirmed knowledge with research or a guess.

Never invent a brand fact. If it isn't in the brand context and the user hasn't said it, search
the Brand Brain next. Ask the user only when that search cannot answer it and the answer is
theirs to give.

${BRAIN_FIRST_ENTRY}

## Setup

All commands below auto-load credentials from \`~/.gooseworks/credentials.json\`. If a command exits with "Not logged in", tell the user to run: \`npx gooseworks login\`. To log out: \`npx gooseworks logout\`.

### Choose the available runtime — MCP first, then CLI

Skills may describe a managed provider request as an environment-neutral operation with
\`provider\`, \`method\`, \`path\`, and optional \`query\` or \`body\`. Execute the operation through
the first available runtime:

1. If the matching GooseWorks MCP tool is registered, use it. For ScrapeCreators, pass a GET
   operation directly to \`data_call_provider\` (\`provider\`, \`path\`, \`query\`) and a POST
   operation to \`data_post_provider\` (\`provider\`, \`path\`, \`body\`, optional \`query\`).
   This is the preferred path in ChatGPT, Cowork, and other terminal-free clients.
   Do not shell out and do not ask for a separate provider key.
2. Otherwise, if a local terminal and the \`gooseworks\` CLI are available, translate the same
   operation into \`gooseworks call <provider> <path>\` with its method, query, and body options.
3. Otherwise, follow the provider dependency's direct-key path only when the user has supplied
   their own key. If no runtime is available, explain what connection is missing; never pretend
   the provider call ran.

Managed provider calls are paid on the MCP and CLI runtimes alike (a ScrapeCreators call costs 1
credit today, and each result reports what it charged). Before a skill's first paid call, tell the
user roughly how many calls it will make and the credit total, and get their yes.

The same selection applies to catalog and account operations. When the CLI is unavailable but the
GooseWorks MCP tools are connected, use these equivalents. Match on the tool name: a coding agent
may show a server prefix (for example \`mcp__gooseworks__catalog_search\`), a chat app may not.
- \`gooseworks search <q>\` → **\`catalog_search { type: "skill", query: "<q>" }\`**.
- \`gooseworks fetch <slug>\` → **\`catalog_fetch { type: "skill", slug: "<slug>" }\`** (same content/scripts/files/deps).
- \`gooseworks credits\` → **\`account_whoami\`** (the balance is \`credits.available_credits\`).

If one of these tools is missing, the GooseWorks connection or its tool list is stale: ask the
user to reconnect or refresh GooseWorks. Installing or updating the \`gooseworks\` CLI never fixes
a missing connector tool, so never send a chat-app user to a terminal for it.

Discovery, skill fetching, and ScrapeCreators-backed Brand Growth workflows work fully CLI-free
this way. Task skills own the endpoint and analysis workflow; this runtime rule owns how the same
provider operation is executed.

To check credit balance:
\`\`\`bash
gooseworks credits
\`\`\`

## Common company onboarding

Onboarding happens inside the current agent and is the first-run gate for every GooseWorks task. It uses the exact same saved state and step order as the web onboarding. The user does not need to type **\`/gooseworks onboard me\`**; that explicit command only starts or resumes the same flow.

Keep the user's original task pending. Call **\`brand_onboarding { action: "status" }\`** before routing or executing it, then:

- follow only the returned \`next_step\`;
- save each answer immediately with \`brand_onboarding\` so web, Claude, Codex, ChatGPT, and Cowork can resume one another;
- continue the original request immediately when \`onboarding_completed\` is true.

If \`brand_onboarding\` is unavailable, explain that the GooseWorks MCP connection must be enabled. Do not write a parallel local profile and do not run the retired role / discovery-source / ad-owner questionnaire.

When onboarding returns a review link, show that single link and ask the user to review the creatives and reply \`done\`. When they reply \`done\`, do not restart onboarding: continue the task they originally asked for. If there was no earlier task, ask: **“Let’s start your next campaign. What are you promoting, and what result do you want?”** Use the same preserved-task-or-campaign handoff if onboarding completes while the creatives are still being prepared or could not be generated.

### Shared flow

Use the host's native question controls. Ask one short group at a time and rely on the live tool schema for accepted values.

1. **Start** — If status returns \`start\`, ask for the company website or Apple App Store URL. Also offer the optional hero product URL and “Where do you do your work?” choices: Slack, WhatsApp, iMessage, Claude Code, Claude, Codex, and ChatGPT. Call \`action: "start"\`; server-side research begins immediately. If status returns \`select_brand\`, ask which company/client to use. Otherwise reuse the only brand automatically.
2. **Your coworker** — The current flow accepts the default coworker automatically. If an older session returns \`coworker\`, refresh \`status\`; do not introduce a naming/avatar question. Rename only when the user asks and the live tool supports it.
3. **Your company** — Use the returned \`company_draft\` plus the user's existing answers. Ask only to verify missing or ambiguous details: what they sell (\`marketCategory\`), where people buy (\`appPlatforms\`), primary customer, customer problem, promised outcome, and optional differentiator. Monthly Meta ad spend belongs here when absent: \`none\`, \`under_10k\`, \`10k_50k\`, \`50k_150k\`, \`150k_plus\`, or \`not_sure\`. Save the merged required company object with \`action: "save_company", company: { … }\`; read \`status\` back.
4. **Your taste** — In a terminal or CLI host, use the returned \`taste_url\`: open it when the host supports opening links and always show one clickable **Choose your taste in GooseWorks** link. Ask the user to heart or skip ads on that page, click **Continue** or **Skip this**, return to the agent, and reply \`done\`. Do not print, enumerate, or summarize \`taste_deck\` in the terminal. After \`done\`, call \`brand_onboarding { action: "status" }\` again and follow the refreshed \`next_step\`. In a chat host that renders images, show only the one image attached by the tool and save each Love/Skip decision with \`action: "save_taste", taste: { hearted_ids, skipped_ids, complete }\`; set \`taste.complete: true\` after three hearts or an explicit skip.
5. **First campaign** — Ask **“What’s happening right now?”**: launch \`launch\`, promotion \`promo\`, seasonal moment \`seasonal\`, or nothing special \`nothing\`, plus an optional note. Call \`action: "propose_campaign"\`, show the returned editable card (name, objective, offer, audience, 2–3 angles, CTA, and product URL), and save edits with \`action: "save_campaign"\`. Send \`campaign.accept: true\` only after approval; acceptance can start the complimentary first creatives.
6. **Review** — Show the returned founder, researched, and inferred facts with their provenance. The user may correct positioning, audience, voice, value propositions, proof points, or competitors through \`action: "review_research", review: { action: "correct", field, value }\`. A proof-point edit does not approve a claim. Complete with \`review: { action: "complete" }\` even when research is still running, failed, or sparse; never trap the user waiting for it.
7. **Channels** — If \`channel_connected\` is already true, this is complete automatically. Otherwise ask whether they want to connect Slack, WhatsApp, or iMessage later, or skip for now. An explicit skip is valid; call \`action: "complete_channels"\`.

The former revenue / 90-day-goal / \`save_progress\` screen is retired. Do not insert it into
onboarding. Ask those human-only questions later only when the user's task needs them.

Do not ask for role, discovery source, who makes creatives, who manages ads, or a separate “what do you want to do first?” menu. Those belonged to the retired CLI questionnaire. The task the user already asked for is their first task.

## Guided brand capture

Use this when the user requests a founder interview, audience/rules capture, or video taste.
Keep their original task pending. Load the current brand first, compare it with information
already volunteered in this chat, and **save known information first** using the canonical
mapping below. Do not run a long questionnaire as a prerequisite for making an ad.

For facts needed by the task but absent from the read, call \`knowledge_search\` first if it is
registered, as in **"Search the Brand Brain, then propose"**. Use returned citations and states
honestly: an empty, building or failed index is not proof that the brand has no answer. Do not re-scrape or ask the founder for a fact already
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

${DURABLE_BRAND_CAPTURE}

${VIDEO_TASTE_CAPTURE}

## Brand Growth discovery

Brand Growth is a collection inside the normal skill catalog, not a command or installable pack. Use these known routes when relevant, while preserving all existing B2B, sales, research, lead-generation, and data behavior:

| Job | Skill |
| --- | --- |
${renderBrandGrowthTable()}

Fetch the named public skill before following it. You already called \`brand_read\` — hand the brand's voice, products, audience, and positioning to the fetched skill instead of letting it re-derive or re-ask them. Provider helpers such as \`scrapecreators-api\` and \`transcript-intelligence\` are dependencies, not user-facing results.

For a multi-part request, repeat this routing check before each new job. Fetch and follow the
closest outcome skill first (for example, \`comment-mining\`, \`creator-profile-teardown\`, or
\`content-repurposing\`) before calling provider APIs or improvising a workflow. Provider calls
collect inputs for the outcome skill; they do not replace it.

## How to Use

### If a specific skill is requested (e.g. --skill <slug> or "use the <name> skill")
Skip search and go directly to **Step 2** with the given slug.

### Step 1: Search for a skill
When the user asks you to do ANY data task (scrape reddit, find emails, research competitors, etc.) **without specifying a skill name**, search the skill catalog first:
\`\`\`bash
gooseworks search "reddit scraping"
\`\`\`

### Step 2: Fetch the skill
Once you have a skill slug, fetch its full content and scripts:
\`\`\`bash
gooseworks fetch <slug>
\`\`\`

This prints a JSON object with:
- **content**: The skill's instructions (SKILL.md) — follow these step by step
- **scripts**: Python scripts the skill uses — save them locally and run them
- **files**: Extra files the skill needs (configs, shared tools like \`tools/apify_guard.py\`) — save them relative to \`/tmp/gooseworks-scripts/\`
- **requiresSkills**: Array of dependency skill slugs (for composite skills)
- **dependencySkills**: Full content and scripts for each dependency

### Step 3: Set up dependency skills (if any)
If the response includes \`dependencySkills\` (non-empty array), set up each dependency BEFORE running the main skill:
1. For each dependency in \`dependencySkills\`:
   - Save its scripts to \`/tmp/gooseworks-scripts/<dep-slug>/\`
   - Install any pip dependencies it needs
2. When the main skill's instructions reference a dependency script (e.g. \`python3 skills/reddit-scraper/scripts/scrape_reddit.py\`), run it from \`/tmp/gooseworks-scripts/<dep-slug>/\` instead

### Step 4: Set up and run the skill
Follow the instructions in the skill's \`content\` field. **Save ALL files from both \`scripts\` AND \`files\` before running anything:**

> **Credential translation rule:** Individual skill instructions may contain a legacy \`## Setup\` block with \`export GOOSEWORKS_API_KEY=$(python3 ...)\` and raw \`curl\` commands. **Replace those with the clean equivalents below.**
> - **Credentials (only needed before running Python scripts, NOT before gooseworks commands):** replace the python one-liner exports with \`eval $(gooseworks env)\`. Skip entirely if you are only using \`gooseworks call\` — it loads credentials automatically.
> - **Orthogonal run:** replace \`curl ... /v1/proxy/orthogonal/run ... -d '{"api":"X","path":"/Y","body":{...}}'\` with \`gooseworks call X /Y --body='{...}'\`
> - **Direct proxy:** replace \`curl ... /v1/proxy/<provider>/<path> ... -d '{...}'\` with \`gooseworks call <provider> <path> --body='{...}'\`
> - **ScrapeCreators:** call its first-party GooseWorks proxy directly with \`gooseworks call scrapecreators <path> --query='{...}'\`. Use ScrapeCreators' official OpenAPI for endpoint parameters; do not use Orthogonal as its endpoint catalog. GET is the default; add \`--method POST --body='{...}'\` only for an official POST operation.
> - **Orthogonal search:** replace \`curl ... /v1/proxy/orthogonal/search ... -d '{"prompt":"..."}'\` with \`gooseworks orthogonal find "..."\`

1. Save each script from \`scripts\` to \`/tmp/gooseworks-scripts/<slug>/scripts/\` — **NEVER save scripts into the user's project directory**
2. **IMPORTANT: Also save everything from \`files\`** — these contain required modules (like \`tools/apify_guard.py\`) that scripts import at runtime:
   - Files starting with \`tools/\` → save to \`/tmp/gooseworks-scripts/tools/\` (shared path, NOT inside the skill dir)
   - All other files → save to \`/tmp/gooseworks-scripts/<slug>/<path>\`
   - **If you skip this step, scripts will crash with ImportError**
3. Install any required pip dependencies mentioned in the instructions
4. Run the script with the parameters described in the instructions
5. When instructions reference dependency scripts, use paths from Step 3: \`/tmp/gooseworks-scripts/<dep-slug>/<script>\`

## Raw API Discovery (fallback)

If no GooseWorks skill matches the user's request, you can discover and call **any API** through the Orthogonal gateway. This gives you access to 300+ APIs (Hunter, Clearbit, PDL, ZoomInfo, etc.) without needing separate API keys.

### Search for an API
Find APIs that can handle the task:
\`\`\`bash
gooseworks orthogonal find "find email by name and company"
\`\`\`
Returns matching APIs with endpoint descriptions and per-call pricing.

### Get endpoint details
Before calling an API, check its parameters:
\`\`\`bash
gooseworks orthogonal describe hunter /v2/email-finder
\`\`\`

### Call the API
Execute the API call (billed per call based on provider cost):
\`\`\`bash
gooseworks call hunter /v2/email-finder --query='{"domain":"stripe.com","first_name":"John"}'
\`\`\`
- Use \`--body='{...}'\` for POST body parameters
- Use \`--query='{...}'\` for query string parameters
- Output: JSON response data, followed by a \`Cost: <N> credits\` line when applicable
- **Always tell the user the cost** after each call

The same \`gooseworks call\` command also handles direct-proxy providers (apify, apollo, crustdata, scrapecreators):
\`\`\`bash
gooseworks call apify acts/parseforge~reddit-posts-scraper/runs --body='{"subreddit":"ClaudeAI"}'
gooseworks call scrapecreators /v2/instagram/post/comments --query='{"url":"https://www.instagram.com/p/POST_ID/"}'
\`\`\`

### Workflow
1. Search first (\`gooseworks orthogonal find\`) — pick the best API + endpoint
2. Get details (\`gooseworks orthogonal describe\`) — understand required parameters
3. Call (\`gooseworks call\`) — invoke with the right parameters
4. Parse the JSON output for the actual API result

## Working Directory & Output Files

- **Scripts** always go to \`/tmp/gooseworks-scripts/<slug>/\` — NEVER the user's project directory
- **Output files** (CSVs, reports, data exports) go to a **GooseWorks working directory**:
  1. If the user specifies where to save results, use that location
  2. Otherwise, default to \`~/Gooseworks/\` — create it if it doesn't exist
  3. **Before saving output**, confirm with the user: *"I'll save the results to ~/Gooseworks/<filename>. Would you like a different location?"*
  4. Organize outputs in subfolders by task type when it makes sense (e.g. \`~/Gooseworks/reddit-scrapes/\`, \`~/Gooseworks/research/\`)
- **Never overwrite existing files** without asking. If a file already exists, append a timestamp or ask the user

## External Endpoints

The \`gooseworks\` CLI sends authenticated requests (Bearer \`GOOSEWORKS_API_KEY\`) to:

| Endpoint | Method | Wrapped by |
|----------|--------|------------|
| \`$GOOSEWORKS_API_BASE/api/skills/search\` | POST | \`gooseworks search\` |
| \`$GOOSEWORKS_API_BASE/api/skills/catalog/:slug\` | GET | \`gooseworks fetch\` |
| \`$GOOSEWORKS_API_BASE/v1/credits\` | GET | \`gooseworks credits\` |
| \`$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/search\` | POST | \`gooseworks orthogonal find\` |
| \`$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/details\` | POST | \`gooseworks orthogonal describe\` |
| \`$GOOSEWORKS_API_BASE/v1/proxy/orthogonal/run\` | POST | \`gooseworks call\` (orthogonal-routed providers) |
| \`$GOOSEWORKS_API_BASE/v1/proxy/{apify,apollo,crustdata,scrapecreators}/*\` | Various | \`gooseworks call\` (direct-proxy providers; ScrapeCreators uses its managed first-party key) |

## Security & Privacy

- All API calls are authenticated via Bearer token stored locally in \`~/.gooseworks/credentials.json\` (file mode 0600)
- No credentials are hardcoded or sent to third parties
- API keys for external services (Apify, Apollo, etc.) are managed server-side — your token never touches them
- Scripts run locally on your machine; only API requests go through GooseWorks servers. Skill scripts are open source (github.com/gooseworks-ai/goose-skills) — read or pin them before running
- Credit usage is tracked per-call and visible via \`gooseworks credits\`

## Rules

0. **Read the canonical brand context before substantive work**, pass what it returns into whatever skill you route to, and never re-ask the user for a fact it already answers (see "Load the brand context FIRST").
1. **Consider a GooseWorks skill when it fits the task** — scraping, research, lead gen, enrichment, especially at scale, behind auth, or from a specific source. For a quick lookup your built-in tools are fine; use your judgement and pick the best tool for the user.
2. **Before paid operations**, tell the user the estimated credit cost and get their yes
3. **If a \`gooseworks\` command exits with "Not logged in"**: tell the user to run \`npx gooseworks login\`
4. **Parse JSON responses** and present data in a readable format to the user
5. **When running scripts**: save to \`/tmp/gooseworks-scripts/\`, install pip deps, then execute. NEVER pollute the user's project directory
6. **Output files default to \`~/Gooseworks/\`** — always confirm with the user before saving
7. **Prefer \`gooseworks call\` over raw curl** — if it returns an error, first fix the parameters (check types, required fields, format) and retry. Only fall back to raw curl if you have strong reason to believe it is a CLI bug, not a parameter issue.
`;
}

/**
 * How an entry skill that runs on the GooseWorks connector says what to do when
 * a tool is missing (QA-26 / VWR14). A chat agent that could not find a tool
 * used to tell the customer to run `gooseworks install` in a terminal they do
 * not have; a missing connector tool is fixed by reconnecting, never by a CLI.
 */
function connectorPrerequisite(exampleTool: string, extra = ''): string {
  return `## Prerequisite — the GooseWorks connector tools

Everything below runs through the GooseWorks connector's tools, by the names this skill uses.
Match on the tool name: a coding agent may show a server prefix (for example
\`mcp__gooseworks__${exampleTool}\`), a chat app may not.${extra}

If a tool named here is missing, the GooseWorks connection or its tool list is stale: ask the
user to reconnect or refresh GooseWorks in their app's connector settings. Installing or
updating the \`gooseworks\` CLI never fixes a missing connector tool, so never send a chat-app
user to a terminal for it. Only a terminal coding agent (Claude Code, Codex, Cursor) that has no
GooseWorks tools at all connects them, in that terminal, with \`gooseworks install --mcp\` plus
\`--claude\`, \`--codex\` or \`--cursor\`, then a restart.

Older notes or skill copies may name tools the connector no longer lists. Use the tool this skill
names instead; \`catalog_fetch { type: "skill", slug: "gooseworks-guide" }\` maps every old name.`;
}

/**
 * Returns the goose-ads entry SKILL.md content (the `goose-ads` entry skill,
 * formerly `ads-remix`).
 *
 * This is the ads domain skill and a THIN WRAPPER over the backend's single ad
 * generation workflow (adRemixBatchesService, exposed on the connector as
 * `ads_generate` / `ads_creative_edit` — the SAME workflow the ads frontend
 * uses). The skill never generates images, manages renders, or uploads files
 * itself; the backend reserves credits, runs the cloud pipeline, and bills. The
 * skill ALSO routes ad analytics/intelligence to recipe skills fetched on demand
 * from goose-skills. Chat apps reach it through `catalog_fetch`, so every tool it
 * names must be one the connector lists (QA-26 / VWR14; guarded by
 * tests/skills/master-skill.test.ts against tests/fixtures/connector-tool-names.json).
 */
export function getGooseAdsSkillContent(): string {
  return `---
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

${CUSTOMER_TALK}

${connectorPrerequisite('ads_generate', ' There is no HTTP or file fallback: the REST ad\nendpoints are session-cookie-only and reject your token.')}

## Start from the brand context — don't re-ask what it already answers

If the \`gooseworks\` router handed you brand context and an evidence brief, USE THEM. If you were
invoked directly, call \`brand_read { brand_id, sections: ["summary","kit","products","learnings"] }\`
first, then search the Brand Brain (next section). Together they answer most of what the flows
below would otherwise ask the user:

- **Which product to feature** → \`products.items\`. Recommend one real catalog entry; never guess a
  product name and never ask the user to list their products.
- **The vibe / tone of the copy** → the brand's **voice**. Use it; don't ask "what tone?".
- **Who the ad is for** → the brand's **audience**. Don't ask "who's the target?".
- **The angle and offer framing** → **positioning** and value props, sharpened by the Brain:
  lead with an angle past approved creatives proved, and drop anything a saved rule forbids.
- **What to claim** → only claim-grade proof: a search result with \`approved_ad_claim: true\`, the
  kit's approved claims, or its proof points as written. Other Kit text, documents and
  performance numbers are context.
- **Logo, colors, fonts** → owned by the backend research pass. **Never re-derive them.**
- **Whether the facts are trustworthy yet** → **research status**. If it isn't complete, say so in
  one line and continue; the batch queues and runs when research finishes.

Don't ask for the angle, product or tone: recommend them with a one-line reason. Ask only for a
decision the brand read and the Brain search cannot settle (for example an offer or season the
user hasn't mentioned) and for anything the user must consent to (rights, spend).

${BRAIN_FIRST_ENTRY}

## Credits — state the total, then get a yes

- One token authenticates the GooseWorks tools and resolves your org; never print it. The
  generation tools need no \`target\`.
- **Nothing paid runs without the user's explicit yes in this chat, given after you state the
  credit total.** The paid calls are \`ads_generate\` (without \`dry_run\`), every
  \`ads_creative_edit\` action, \`ads_approval_decide\` with \`decision: "approve"\`, and every
  \`data_call_provider\` / \`data_post_provider\` call (the data calls an analysis recipe or brand
  research makes; \`gooseworks call\` in a terminal). Reads, dry runs, \`ads_creative_update\` and
  \`request_campaign_generation\` (it only composes plans) are free.
- The balance is \`credits.available_credits\` from \`account_whoami\`; a dry-run \`estimate\` also
  carries \`available_credits\`.
- The backend reserves the quoted credits when a paid call starts and bills only the images
  that complete. A rejection with \`insufficient_credits\` means the wallet is short: tell the
  user the total and their balance in plain words, offer fewer images or a top-up, and stop.
  Never retry blindly.

How to get the total for each paid call:

| Paid call | Credit total to state |
| --- | --- |
| \`ads_generate\` with \`source.template_ids\` | The same call with \`dry_run: true\` returns \`estimate\`: \`total_credits\` for \`images\` images (plus \`credits_per_image\`, \`rates\` and \`unknown_template_ids\`). |
| \`ads_generate\` with \`source.community_ad_ids\` or \`source.creative_ids\` | No dry run (it returns \`not_available\`; these are priced when submitted). Pass \`quality\` explicitly (the user's choice, else \`high\`, the app default) and quote the images (each source's \`variants\` × its \`ratios\`) × \`estimate.rates.<quality>\` as the most it will cost (an engine without quality tiers costs the lower \`rates.low\`). \`rates\` comes with any template dry run; with no template at hand, dry-run one Surprise-me pick. |
| \`ads_creative_edit\` \`animate\` | The same call with \`dry_run: true\` returns its \`estimate\`. |
| \`ads_creative_edit\` \`regenerate\` / \`precision_edit\` | No dry run. Pass \`quality\` in the action's payload (without it \`precision_edit\` copies the source render's tier) and quote the images × \`estimate.rates.<quality>\` as the most it will cost: \`regenerate\` with \`mode: "variation"\` makes one per ratio (omitted \`ratios\` make three); \`edit\`, \`exact\` and \`precision_edit\` make one. |
| \`ads_creative_edit\` \`resize\` | No dry run and no quality setting: it renders at the server's default tier (\`high\` today). Quote one image per placement × the larger of \`estimate.rates.high\` and \`credits_per_image\` from a template dry run without \`quality\` (that dry run uses the server's default tier) as the most it will cost. \`platforms\` expands to every placement: meta 4, google 4, tiktok 2, linkedin 3, reddit 3, x 2; pass \`targets\` for fewer. |
| \`ads_creative_edit\` \`layerize\` | No dry run. It holds about 80 credits while it runs and charges the actual cost of the split (usually less). Say so and get the yes before sending \`layerize: { confirmed: true }\`. |
| \`ads_approval_decide\` approve | The \`credits\` that \`request_campaign_generation\` and \`ads_creative_read { brand_id, view: "approvals", batch_id }\` return for those plans. |
| \`data_call_provider\` / \`data_post_provider\` | The calls a recipe will make × their price: a ScrapeCreators call costs 1 credit today, and each result reports what it charged. A fal or ElevenLabs POST quotes free with the same call plus \`query: { quote_only: true }\`. State the rough total for the whole recipe once, before its first paid call. |

## Live MCP contract — inspect it before asking

The currently registered MCP tool schemas are the source of truth for inputs, supported choices,
and defaults. Do not copy an exhaustive input list from this skill or rely on remembered fields.

Before each tool call:

1. Inspect the live schema for the tool you are about to use.
2. Fill required inputs already known from the Brand Kit, selected source, or conversation.
3. Ask the user only for required inputs that cannot be inferred and for choices that materially
   change the result. Do not turn every optional field into a questionnaire.
4. Omit unspecified optional settings so the backend applies its current app defaults. Two
   exceptions: always pass \`ratios\` on every source (omitted ratios make three images per
   variant), and keep the same \`quality\` setting in the quote and the paid call (both omitted
   for a template dry run, or the explicit \`quality\` the credits table asks for).
5. If the live schema conflicts with this workflow, follow the live schema and report the drift
   (see "Report problems" in the rules).

## The ad tools

- \`ads_generate\` — **the one call that makes ads.** Needs \`brand_id\` and exactly one \`source\`:
  \`template_ids: [{ template_id, variants?, ratios }]\` (the brand's own templates, Surprise-me
  picks, Community rows whose \`item_type\` is \`template\`), \`community_ad_ids: [{ community_id,
  variants?, ratios }]\` (Community rows whose \`item_type\` is \`creative\`; the backend snapshots
  them), or \`creative_ids: [{ project_id, render_id?, variants?, ratios }]\` (remix the user's own
  finished ads). Optional: \`product_name\` (a real product), \`prompt\` (a short steering note),
  \`reference_image_urls\`, \`quality\`. \`dry_run: true\` quotes template sources and reserves
  nothing. A real call GENERATES at once and returns \`{ job_id }\` (\`kind: "ads_batch"\`) and the
  \`batch\`, which already carries its \`links\` (below). If the
  brand's research is still running the batch is \`queued\` and starts on its own when research
  finishes: tell the user it'll appear shortly, don't error.
- \`job_get { job_id, kind: "ads_batch" }\` — poll a batch. \`status\` is \`queued\`, \`running\`,
  \`complete\`, \`partial_failure\` or \`failed\`; \`progress\` counts \`completed\` / \`failed\` /
  \`pending\` images. \`result.creatives[]\` carry each creative's \`renders[]\` (\`id\`, \`status\`,
  \`ratio\`, \`output_url\`, \`age_seconds\` since queued, \`elapsed_seconds\` generating). A creative
  is done when its \`pending\` is 0, NOT when \`current_render_url\` is set (during a regenerate it
  still points at the prior image). A render only failed when its \`status\` is \`"failed"\`: a slow
  render is healthy, and re-submitting it double-bills. \`result.links\` holds the app links you end
  the run with: \`brand_url\` (the brand's page, with all its ads) and \`creative_links: [{
  project_id, app_url }]\` (each creative's page). \`brand_url\` is \`null\` and the list empty only
  if the link lookup failed; the ads are still made. A server older than this skill returns no
  \`links\` (and no \`app_url\` / \`brand_url\` on creative reads): then hand back the images
  only and don't mention links.
- \`ads_creative_read { brand_id }\` — the brand's generated creatives, newest first (filter with
  \`batch_id\`, \`tags\`, \`approved_only\`); each row has its \`app_url\` and the list has the
  \`brand_url\`. \`creative_id\` reads one with its \`renders\`, plus \`creative.app_url\` and
  \`creative.brand_url\`.
- \`ads_template_read\` — find or inspect a source (see "Picking source ads"). \`template_id\` reads one.
- \`ads_creative_edit { brand_id, creative_id, action }\` — every paid edit of one creative, one
  \`action\` per call: \`regenerate\` (\`regenerate: { mode: "variation" }\` for another take;
  \`mode: "edit"\` or \`"exact"\` with \`source_render_id\` and \`prompt\`), \`precision_edit\` (\`source_render_id\`
  plus a \`note\` or region \`annotations\`), \`resize\` (\`source_render_id\` plus \`platforms\` or
  \`targets\`), \`layerize\` (\`confirmed: true\`), \`animate\` (\`source_image_url\`; only when
  \`account_whoami\` shows the Animate Images feature; for the full flow fetch the \`animate-image\`
  skill). Returns \`{ job_id }\`: poll \`job_get\` with \`kind: "ads_batch"\` (regenerate, resize,
  precision_edit) or \`kind: "animate"\`; for layerize read
  \`ads_creative_read { brand_id, creative_id, include: ["layers"] }\`. While the brand's research is
  still running, \`regenerate\`, \`resize\` and \`precision_edit\` refuse with
  \`brand_research_in_progress\`: tell the user and try again when it finishes.
- \`ads_creative_update { brand_id, creative_id, patch }\` — free. \`patch.feedback: { render_id, rating:
  "happy" | "neutral" | "sad", comment?, reasons? }\` records the user's reaction (it feeds the
  quality loop); \`patch.tags\` replaces the creative's tags.
- \`ads_template_create { brand_id, source, rights_attested? }\` — register the user's own image as a
  private source template (see "Upload" below).

### Campaigns — the only plan-and-approve path

\`ads_generate\` has no plan step: the dry-run quote and the user's yes are the checkpoint, and a
submit generates at once. Never promise a review step before the images render. Plans exist only
for a campaign's concepts (planned with \`campaign_read\`, \`campaign_upsert\` and
\`add_campaign_concept\`; follow the connector guide for those):

1. \`request_campaign_generation { campaign_id }\` composes the plans for the concepts with no
   creatives yet (\`concept_ids\` re-runs chosen ones; \`count\` only for a number the user named). It
   spends nothing and returns \`batch_ids\` and \`credits\`. Never say generation has started.
2. Tell the user what will be made and the credit total, and wait for their explicit yes in this
   chat. Never send them to a button in the app; a campaign link is only a place to look.
3. Read \`ads_creative_read { brand_id, view: "approvals", batch_id }\` until that batch's plans are
   \`awaiting_approval\` and none is \`composing\`. If its credit total differs from what they
   agreed to, state the new total and ask again.
4. \`ads_approval_decide { brand_id, decision: "approve", batch_id, user_quote: "<their exact words>" }\`
   for each batch, then poll the batch ids it returns with \`job_get\` (\`kind: "ads_batch"\`) and
   end with each batch's \`result.links\`, as in step 7 of the workflow below.

Before approving, a steer is free: \`ads_approval_decide { brand_id, creative_id, decision: "revise",
revise: { message } }\` recomposes that plan (read the approvals view again), and
\`decision: "edit_plan"\` patches it directly. Editing the campaign in between discards these plans.

## Keep the brand kit in sync — reconcile, then save or propose

The brand kit is the source of truth every generation reads. During ANY task, when the user
**tells you something about the brand or asks to change something brand-level** — a different
tagline, audience, voice, a product's name/price/description, "our logo is X", "we don't sell Y
anymore", a new product photo — treat it as a possible kit update, don't just use it for this one
ad and forget it:

1. **Check it against the kit.** Call \`brand_read\` with \`kit\` and \`learnings\` for the active brand and see whether what the user said
   matches, is missing from, or contradicts the kit.
2. **If it's already in the kit and matches** — nothing to do; proceed.
3. **If it's new or different**, persist an explicit request to correct or remember the brand
   through the policy below; that request is already authorization. For an ambiguous one-ad
   direction, ask once whether it should stick. Agent-derived suggestions become proposals.
4. **Persist with the canonical write tools** (send only changed fields):
   - \`brand_update\` with explicit user-correction intent — structured brand fields or products;
     an inferred structured field uses agent-proposal intent instead. Follow the live schema.
   - \`media_upload\` / \`media_update\` — the user's own product and reference photos.
   Inspect each live schema and send only the fields needed for the confirmed change.
5. **Read back what changed** before saying saved, then continue the task. (Use the research
   workflow for researched logo/colors/fonts; explicit user edits use only fields supported by
   the canonical tool schema and the correction policy below.)

This is the parity gap the app closes in-product: a brand fact the user gives mid-task should be
able to flow back into the kit — with their ok — instead of being lost.

${DURABLE_BRAND_CAPTURE}

## Picking source ads — use approved sources, not the retired catalog

When the user wants to make ads but has NOT named a specific template (id/slug/Community
ad/upload), do NOT silently browse the raw catalog and hand-pick for them. Instead send **one
proposal** — it mirrors the web app and keeps the human in the loop without an interview:

1. **Propose the direction yourself.** From the brand read and the evidence brief, recommend the
   product, angle/offer and tone, with a one-line reason naming what the Brain showed (a past
   approved angle, a rule it respects). **Do NOT ask what kind of ads they want, which product,
   or the vibe.** Keep any direction the user already gave. This shapes both the source choice
   and your steering \`prompt\`.
2. **Recommend a source in the same message: their own ads, Community, upload, or "Surprise me".**
   Default to their own approved ads when suitable ones exist, otherwise Surprise-me picks for
   the brand; list the other paths as one-line alternatives. You may resolve the picks and run the
   free dry run first so the proposal already carries the credit total. Show a list of sources as
   one table with every row and its image link, and mark your one suggestion.
   - **Their own ads** → \`ads_template_read { brand_id, mode: "mine", filters: { relationship: "self" } }\`
     and let them choose. \`mode: "competitor"\` rows are research and inspiration, never proof that
     the user owns the ad.
   - **Community** → \`ads_template_read { brand_id, mode: "query", query: "<the angle and look>" }\`
     ranks Community ads by meaning; each row's \`sourceId\` (with \`title\` and \`thumbnailUrl\`) goes
     in \`source.community_ad_ids[].community_id\`. To browse the feed instead, use \`mode:
     "community"\`: its rows carry \`item_type\`, and a \`template\` id goes in \`source.template_ids\`,
     a \`creative\` id in \`source.community_ad_ids\`. The backend snapshots a Community creative
     itself; there is no separate step. Let the user choose.
   - **Upload** → the user's own image becomes a private template: \`media_upload\` it (\`scope:
     "brand"\`, \`scope_id: <brand_id>\`, \`kind: "image"\`; in a chat app \`source.type: "bytes"\`), then
     \`ads_template_create { brand_id, source: { type: "media", media_id } }\` (or \`source: { type:
     "url", url }\` for a public image). Set \`rights_attested: true\` only after the user explicitly
     confirms they own it; this is the ownership/rights input. Never claim rights for a competitor
     ad or an image found online.
   - **Surprise me** (they want you/the app to pick) → \`ads_template_read { brand_id, mode:
     "surprise", count: 4 }\` picks remixable Community ads for the brand, shuffled so picks stay
     fresh. Every pick is a template: show them, and generate
     from the ones the user keeps (or from all of them if they said "just make them").
   - **Browse in the app** → the one link you build yourself: \`<app>/create?brand=<brand-slug>&cli=true\`,
     with the active brand's slug, where \`<app>\` is the origin of a \`brand_url\` a tool returned
     (the part before \`/?brand=\`: \`https://ads-staging.gooseworks.ai/?brand=acme\` gives
     \`https://ads-staging.gooseworks.ai\`), so it opens on the user's own environment. Reuse a
     \`brand_url\` you already have from this run, or read one cheaply with
     \`ads_creative_read { brand_id, limit: 1 }\`; if none comes back, use \`https://make.gooseworks.ai\`.
     In this mode the app shows a copyable remix prompt at the bottom (dismissable / switchable
     back to the UI composer). They browse their own and Community sources and copy the prompt.
3. **Close the loop.** When the user **pastes back the copyable remix prompt** from the app
   (it names the brand + the templates they chose), THAT is your cue to generate: resolve the
   named source(s) with \`ads_template_read\`, quote, and collect only the unresolved required inputs.

If the user already named an owned source (id/slug), a Community ad, or an upload, skip the source
choice. Competitor ads may inform the angle or structure, but describe them as inspiration, never
claim ownership, and never attest rights for the user. Never use the retired curated third-party
catalog.

## Workflow — make ads from a template

1. **Resolve the brand and its evidence.** List brands with \`brand_read\` (no \`brand_id\`), then
   read the selected brand's summary, kit, products and
   learnings and search the Brand Brain as above. If research isn't \`complete\`, you can still
   submit (the batch queues and runs when research finishes) — just tell the user. Use the read to
   pick \`product_name\` (a real entry from \`products.items\`, not a guess) and, if the user supplied
   product photos, \`reference_image_urls\` (public URLs; \`media_upload\` a local file first).
2. **Pick the source ad(s) via the proposal above.** Read each chosen template with
   \`ads_template_read { brand_id, template_id }\`. Community creatives (a query row's \`sourceId\`,
   a feed row with \`item_type: "creative"\`) and the user's own finished ads go straight into
   \`source.community_ad_ids\` / \`source.creative_ids\`.
3. **(Optional) Craft the steering prompt.** The \`prompt\` is OPTIONAL — this is where the skill
   adds value: turn the user's intent (from step 1) into a concise steering note (e.g. tone,
   season, emphasis). Don't over-specify; the backend pipeline + brand kit handle palette, fonts,
   product swap.
4. **Quote the cost.** Call \`ads_generate\` with the exact arguments you will submit plus
   \`dry_run: true\` (template sources), or work out the total as in the credits table. Drop or
   replace anything in \`unknown_template_ids\`. State the image count and credit total in one line
   and wait for the user's explicit yes.
5. **Submit ONE batch** after that yes: the same \`ads_generate\` call without \`dry_run\`. Keep the
   returned \`job_id\`.
6. **Poll until done.** \`job_get { job_id, kind: "ads_batch" }\` every ~20-30s until every creative's
   \`pending\` is 0. Most images finish in a few minutes; text-heavy templates and \`quality: high\`
   take longer. Read each render's \`elapsed_seconds\` rather than guessing; do NOT re-submit
   thinking it stalled (that double-bills). If \`ads_generate\` refused with
   \`brand_research_required\`, the brand was never researched: run "Brand research" below, then
   quote and submit again.
7. **Hand back the ads with their links.** Show every finished image (\`renders[].output_url\` of
   completed renders) and say in one line what failed, if anything. Then give the links from the
   last \`job_get\`'s \`result.links\`, copied verbatim: the \`brand_url\` where all the brand's
   ads are, and the \`app_url\` of each creative with a finished image (match
   \`creative_links[].project_id\` to \`result.creatives[].id\`; skip a creative whose renders all
   failed). For a big batch (more than about 8 creatives) give the \`brand_url\` and offer the
   rest. Skip a missing or \`null\` link; never build an app URL yourself. Never end on just
   "done" or a file path.

## Workflow — edit an existing ad

User wants to tweak a creative they already made → \`ads_creative_edit\`. Read the creative first
(\`ads_creative_read { brand_id, creative_id }\`) to get the render they mean. Infer the action
from their request: another take (\`regenerate\`, \`mode: "variation"\`), a targeted change
(\`regenerate\` with \`mode: "edit"\`, or \`precision_edit\` when they point at a region), an exact
instructed change (\`mode: "exact"\`), new placements (\`resize\`), editable layers (\`layerize\`) or a
short video (\`animate\`). Ask only for a required source or instruction that is still missing,
state the credit total from the credits table, get the yes, submit, poll as above, and hand back
the new images with their links: \`result.links\` from \`job_get\` for \`regenerate\`, \`resize\` and
\`precision_edit\`; \`creative.app_url\` and \`creative.brand_url\` from \`ads_creative_read { brand_id,
creative_id }\` for \`animate\` and \`layerize\`.

## Brand research

Prefer the backend's result. \`brand_read { brand_id, sections: ["summary"] }\`: if
\`research_status\` is \`complete\`, REUSE it — never re-research. Proof points and the full product
catalog keep arriving until \`enrichment.settled\` is true.

**The split — backend owns visuals, you own the qualitative depth:**

- **Backend LIGHT pass (automatic).** A new brand comes from the connector's setup flow
  (\`brand_onboarding { action: "status" }\`, then its \`next_step\`). For an additional brand, check
  it is absent (\`brand_read\` with no \`brand_id\`), then \`brand_create { name, website_url }\` (free).
  The website starts the same backend research the web app uses: it resolves the
  **authoritative logo, colors, and fonts** plus a baseline kit and returns \`research_job_id\`; poll
  \`job_get { job_id: research_job_id, kind: "brand_research" }\` (or \`brand_read\`) until
  \`research_status\` is \`complete\` — usually under a minute. If it returns \`reused_existing: true\`,
  tell the user and use that brand. You can't reproduce those visual signals, so **never
  re-derive logo/colors/fonts.**
- **Your DEEP pass (optional).** You add the qualitative depth the light pass leaves thin —
  positioning, audience, voice, brand type, value props, proof points, products — grounded on
  the actual site.

**Deep research flow:**

1. Fetch the \`brand-research\` skill (\`catalog_fetch { type: "skill", slug: "brand-research" }\` in a
   chat app; \`gooseworks fetch brand-research\` in a terminal) and follow its phases. Its data
   calls are paid: state the credit total (credits table) and get the yes first. **Ground every
   fact on the brand's own site** — if the site can't be read, say so and ask the user; never
   guess a category from the brand name alone.
2. **Save what you improved.**
   - **As proposals (the default):** \`brand_update { brand_id,
     knowledge_intent: "agent_proposal", rationale, patch: { knowledge: { positioning?, audience?,
     voice?, brandType?, tagline?, valueProps? } } }\`. They stay pending until the user accepts
     them in the app.
   - **As the full research pack (only when you wrote all of it; in a chat app, only for a brand
     with no website, see below):** with \`file_write\`, under
     \`agent-config/brands/<slug>/brand-research/\`, write all four docs \`brand-summary.md\`,
     \`visual-identity.md\`, \`audience.md\` and \`competitors.md\` (real content, at least a few
     sentences each) plus \`kit-patch.json\`: \`{ positioning?, audience?, voice?, brandType?,
     tagline?, valueProps?: string[], proofPoints?: [{ text, source_url }], products?: [{ name,
     description?, link?, pricing?, imageUrls?: string[] }] }\` with only the fields you improved;
     every proof point copied word for word from the brand's own page at \`source_url\`; product
     images only from URLs already in GooseWorks storage; **no logo / colors / fonts**. Then
     \`brand_update { brand_id, patch: { finalize_research: true } }\` merges it NON-CLOBBERINGLY
     (never over the backend's visuals or a user edit). **If any of the four docs is missing or
     nearly empty, finalize fails and marks the brand's research as failed**, so never finalize a
     partial pack.
3. **Verify:** \`brand_read\` again (\`summary\`, \`kit\`) and confirm what you saved before generating.

**If the brand has NO website**, the backend light pass can't run and generation goes ahead with
an empty kit, so ads come out off-brand. Do the deep pass from what the user tells you and save the
full research pack, so the brand has a kit and a record to debug a wrong run (this is how a bad
classification, e.g. mislabelling a SaaS as a "drink company", used to vanish).

## Analyze / intelligence (fetched recipes — NOT generation)

These are analysis recipes you fetch and follow; they don't use the generation tools, but their
data calls are paid (credits table: state the total and get the yes before the first one). Fetch with \`catalog_fetch { type: "skill", slug: "<slug>" }\` in a chat app or
\`gooseworks fetch <slug>\` in a terminal. Pick the closest match; if unsure, search first with
\`catalog_search { type: "skill", query: "<what the user wants>" }\` (terminal:
\`gooseworks search "<what the user wants>"\`):
- **Campaign performance diagnosis** ("why is my Meta/Google campaign underperforming",
  creative fatigue, learning phase, pacing, auction overlap) → \`meta-ads-analyzer\`
  (or \`ad-campaign-analyzer\` for cross-platform).
- **Lead/CAC quality** ("are these ads driving qualified leads", true CAC vs vanity CPA,
  Scale/Keep/Investigate/Cut) → \`ad-lead-quality-analyzer\`.
- **Competitor ad intelligence** ("what ads are competitors running") →
  \`competitor-ad-intelligence\` (Meta Ad Library: \`meta-ad-scraper\`; Google: \`google-ad-scraper\`).
- **Creative ideation** (ad angles, winning hooks) → \`ad-angle-miner\` / \`trending-ad-hook-spotter\`.
- **Policy / landing-page checks** → \`meta-ad-policy-checker\` / \`ad-to-landing-page-auditor\`.

A recipe's provider calls go through the connector in a chat app (\`data_call_provider\` for GET,
\`data_post_provider\` for POST) and through \`gooseworks call\` in a terminal; both are billed. Saving and running
its scripts (under \`/tmp/gooseworks-scripts/<slug>/\`) is terminal-only: without a terminal, do
that step's analysis yourself from the data the tools return, and never ask the user to run a
command.

## Rules

- **Connector tools only** — every step uses the tool names above. A missing tool means the
  GooseWorks connection is stale: ask the user to reconnect or refresh GooseWorks. Never send a
  chat-app user to a terminal or a CLI install.
- **One backend workflow** — generation is \`ads_generate\` / \`ads_creative_edit\` ONLY.
  Do NOT call FAL, the media proxy, \`submit_render\`, \`update_render_status\`, or upload render
  files yourself; do NOT fetch a local remix recipe to generate. The backend owns it.
- **State the credit total and get an explicit yes before every paid call** (credits table above).
  Relay \`insufficient_credits\` plainly if the submit is rejected — don't retry blindly.
- **No plan step for one-off ads.** Only a campaign's plans wait for approval
  (\`request_campaign_generation\` → \`ads_approval_decide\` with the user's words as \`user_quote\`).
- **Always end a successful run with the finished images and their links**, copied verbatim:
  each creative's \`app_url\` and the \`brand_url\` from \`result.links\`, or from the creative
  read (\`creative.app_url\`, \`creative.brand_url\`) after \`animate\` or \`layerize\`. When the
  server returns no links, end with the images only. Never end on just "done" or a file path, and
  never build an app URL yourself (the one exception is the browse link below).
- **Search the Brain before proposing.** After the brand read and before choosing an angle,
  claim or source — or asking for a brand fact — run the task's \`knowledge_search\` and carry
  its evidence brief. A failed or empty search is stated as such, never as "no evidence exists".
- **Use approved source paths.** If the user didn't name a source, recommend one in the single
  proposal (own ads, Community, upload, Surprise me, or browse in the app). Surprise me is
  \`ads_template_read\` with \`mode: "surprise"\`; browsing uses \`/create?brand=<slug>&cli=true\`.
  Never use the retired curated third-party catalog. Generate when they paste the app's copyable
  remix prompt back, or when they accept the surprise picks.
- **Treat competitor ads as inspiration** — never attest rights, imply ownership, or promise to
  copy a competitor's distinctive expression.
- **Reconcile brand facts into the kit** — when the user states or changes something brand-level
  mid-task, compare it with \`brand_read\`. Save explicitly authorized corrections through
  \`brand_update\` with correction intent and the user's exact statement, or the user's own
  images through \`media_upload\`; read back before saying saved. Proposed improvements stay
  pending. Ask only when it is unclear whether a one-ad direction should apply to future ads.
- **Record feedback** — when the user reacts to a generated image, call \`ads_creative_update\`
  with \`patch.feedback\` so the quality loop learns.
- **Don't busy-loop** — poll \`job_get\` on a sensible interval (~20-30s); a \`queued\` batch is
  waiting on research and will start on its own.
- **Report problems so we can fix them** — when a batch fails or is rejected and you can't resolve
  it, a required brand input/asset is missing, or an instruction is ambiguous or contradictory:
  in a terminal run \`gooseworks log "<what happened>" --event-type <error|blocker|missing_input|confusion> --details '<json with the real error and step>'\`,
  or call the \`log_cli_event\` tool if your connection lists it. A chat app without either skips
  this step. Always tell the user too.
`;
}

/** Card-aware video entry. Shell execution and widget display are independent. */
export function getGooseVideoSkillContent(): string {
  return `---
name: goose-video
slug: goose-video
description: >
  Start a video ad in the same chat. Resolve the brand and suggest supported formats with a
  picker or the returned text choices. An agent with a verified shell makes the video with
  goose-video-local; a chat host hands the same project to the GooseWorks coworker. Review
  one complete template plan and total credits before production. Custom videos retain two authenticated review gates in this chat.
category: ads
version: 3.0.6
author: GooseWorks
tags: [gooseworks, ads, video, local-render, coworker, chat]
---

# GooseWorks Video Ads — choose, review, make

${CUSTOMER_TALK}

## Purpose

Resolve the brand, show supported formats and create one saved project. An agent with a verified
shell follows **\`goose-video-local\`**. A chat host delegates that same project to the GooseWorks
coworker, which renders in its sandbox. This is agent execution, not a recipe server-order API.

**Cards and execution are separate capabilities.** A terminal may render without drawing a
picker; a chat host may draw a picker while the coworker renders. Follow \`card.display_hint\`
and \`available_here\`, never a guess from the host's name. Template-remix review stays in this
chat. Custom videos use separate authenticated script and ingredient approvals in this same chat.
Studio is an optional review surface.

${videoEntryPreparation('goose-video')}

## Custom videos: check formats first

First check the catalog: when the brief names or implies a listed format (for example a street interview, testimonial, podcast or chat video), show that format and its fit through the format flow below, including its support status. Go custom only when no format fits and the customer chooses custom after hearing why; custom keeps that format's hard constraints. For an original brief without a reference template, an Instagram reel/post URL or a direct video URL to study, fetch \`catalog_fetch { type: "skill", slug: "make-custom-video" }\` and follow it in this same session. It creates format:"custom", custom_mode:"generate" with the brief and optional reference_url. Growth executes in its managed sandbox; connected agents use their shell. Script and actual ingredients are reviewed and separately approved in the same chat before paid production; Studio is optional. Do not force a template that does not fit or that the customer declined, and do not import the reference as a finished video.

## Run the format's route check before proposing it

A catalog row says what a format is best for and ranks it for the brand. It does not say whether
the format can make the setup the customer asked for (how many people, mic only, no product).
Some renderers declare a route selector that decides that; today that is the street interview
(\`render-street-interview\`). Before you propose, script or create a street-interview project,
template or custom, check the request against its routes:

| Street route | On screen | Needs | Makes |
| --- | --- | --- | --- |
| Guessing (\`product-guess\`) | Interviewer and up to four people | A physical product to hand over, photographed on its own | A finished video |
| Conversation (\`mic-only\`, \`product-sample\`, \`concept-challenge\`) | Interviewer and one person | No product photo, phone, screen or UI | A script and prompt preview only, no finished video yet |
| Street testimonial (its own format) | One person talking to camera, no interviewer | The creator still its recipe prescribes | A finished video, when the catalog lists it |

Neither interview route takes a photo of a person: people are described in text, so never
propose putting a founder's or creator's face in one. Keep the customer's named setup: never
change the interaction, mode or number of people just to make a check pass.

**Never offer guessing to software or a service.** The guessing route needs a physical product
to hand over. When what the brand sells is software, an app or a service (nothing a person can
hold), never offer or script guessing, not even with a laptop, phone or other device showing the
app as the prop: the device is a prop, so \`offering_type\` stays \`digital\` or \`service\` and the
selector says unsupported. A brand that sells a physical product, including a device or
hardware that comes with an app, can still use guessing with that product. Offer the table's
real alternatives instead: a one-person conversation (a script and prompt preview only, no
finished video yet), the street testimonial if the catalog lists it, or custom. Asking again
never unlocks a route the table or the selector rules out.

For such a brand the catalog marks the street-interview rows \`fit.ok: false\`: they can't make
a finished video for it. That verdict is about the finished video, so still offer the one-person
conversation, saying plainly that it is a script and prompt preview only.

- **Without a shell** (a chat host), decide from this table. Do not fetch the renderer: its
  package is far too large for a chat.
- **With a shell** (the customer's computer or the coworker sandbox), also run its free
  selector, which makes no paid call. If the fetch or the run fails, decide from the table.
  1. Fetch the renderer to a file, not into the conversation: its inline package is over a
     million characters. Either save the JSON from \`gooseworks fetch render-street-interview > <file.json>\`,
     then write each \`scripts\` entry as
     \`/tmp/gooseworks-scripts/render-street-interview/scripts/<name>\` and each \`files\` entry at
     \`/tmp/gooseworks-scripts/render-street-interview/<path>\`. Or call
     \`catalog_fetch { type: "skill", slug: "render-street-interview", delivery: "archive" }\`,
     extract the ZIP, check each file against its \`manifest.json\` hashes and copy the contents of its
     \`agent-config/skills/render-street-interview/\` folder into
     \`/tmp/gooseworks-scripts/render-street-interview/\`. Either way the selector reads
     \`references/street-reference-library.json\` from that folder.
  2. Write a brief JSON. \`mode\` and \`interaction_type\` go in pairs: \`product-guess\` with
     \`product-guess\`, or \`conversation\` with \`mic-only\`, \`product-sample\` or \`concept-challenge\`.
     \`offering_type\` is exactly \`physical\`, \`service\` or \`digital\` (software, SaaS and apps are
     \`digital\`). \`participants\` is a whole number: people interviewed on screen, not counting
     the interviewer. Leave it out when the customer named no count; the selector then uses the
     route's usual cast. When the customer named no interaction, run each mode that could fit.
  3. Run \`python3 /tmp/gooseworks-scripts/render-street-interview/scripts/prepare_script_context.py --brief <brief.json> --out <context.json>\`.
     Read \`status\` and \`brief_gaps\` in the output file, not the exit code: it exits 2 for every
     status except \`ready-for-writing\`. A Python traceback is not a verdict: the brief or the
     saved files are wrong (for example the reference library in the wrong folder). Fix them and
     run it again.
  4. A run with any \`brief_gaps\` has not checked the route. Fix every gap and run it again.

**An unsupported setup is a stop.** \`unsupported-route\`, or a request the table rules out,
means this setup can't be made. Tell the customer plainly, in one line, for example: "A
three-person mic-only street interview isn't something we can make yet: that version takes one
person, and the three-person version needs a physical product to hand over." Then offer the
closest supported options in plain words, each with how it differs. With a shell, these are the
selector's \`alternatives\`. Without one, take them from the table:

- when only the number of people was the problem, the same setup within its limit: guessing
  (a physical product only) with up to four people, a finished video; or a conversation with
  one person, a script preview only;
- for something people can't hold (software, a service), a one-person conversation instead
  of guessing;
- one person talking to camera with no interviewer, if the catalog lists that format;
- a custom video, untested, that keeps the street format's limits.

Never use route names or the script's wording. Do not create the project or write a script for
it. Go custom only if the customer picks it; a custom video keeps the street format's hard
constraints, which make-custom-video lists.

**A supported setup.** With empty \`brief_gaps\`, any other status means the route exists.
\`needs-reference\` means no observed reference ad matched yet: it does not block proposing the
format; carry it into the handoff so the script step resolves or reports it before script
approval. Carry the route too: which one, how many people, finished video or preview only, and
no person photos. A preview-only route makes a script and prompt preview, not a finished video:
say so before the customer chooses it.

## Route first: is this a new video?

Hand off to **\`goose-video-local\`** now, and stop following this skill, for:

- an existing **project** id or a **video batch** id;
- the app's copy-for-Claude command (it names \`goose-video-local\`);
- "remix this video ad template" for a specific app template.

Load the current \`goose-video-local\` entry with
\`catalog_fetch { type: "skill", slug: "goose-video-local" }\` on the GooseWorks MCP (older clients:
\`fetch_skill("goose-video-local")\`), unless already fetched on this connection in this run.
It reads the project first and retains an approved run's recorded recipe packages.

When they ask **what** to make ("give me video ad ideas", "what angles should I use?", "what's
working for my competitors?"), fetch **\`ad-angle-miner\`** (\`catalog_fetch { type: "skill", slug: "ad-angle-miner" }\`,
using its advertised tools) and run it with the **video** output. It returns ranked
video ideas mapped to formats and hands the picked ones to \`goose-video-local\`.

Everything else, including "make me a video ad for <brand>", starts at step 1 below.

${ENVIRONMENT_IDENTITY}

${ASSET_READINESS}

## Inputs

- A brand, usually named in the request. Resolve it from the accessible brands; one brand needs no question.
- The customer's goal, occasion, audience, selected angle and constraints when supplied; otherwise propose defaults from the verified kit.
- The selected format's required assets. Presence does not prove suitability; uncertain assets remain “needs review.”

${DURABLE_BRAND_CAPTURE}

${VIDEO_TASTE_CAPTURE}

## Composed Atoms

Use the live canonical schemas: brand_read, brand_create, video_catalog_list,
video_project_upsert, video_project_read, catalog_fetch, goose_run_task and job_cancel.
An old tool name in a recipe is not grounds for terminal-update advice in a chat host.

## Paid media: images, clips, voice

**No FAL_KEY, ElevenLabs key or \`fal_client\` is ever needed.** Use
\`data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">, body: <model input>, project_id }\`
then \`job_get { job_id }\`; voice/music use provider:"elevenlabs". Upload local inputs through
media_upload first. **A missing key is never a blocker.** \`photos_generate\` is **not** a general
image tool: it photographs physical catalog products only. Use goose-video-local for the
runtime, paid approval, asset saving and quality checks.

## Workflow

### 1. Resolve the brand, quietly when you can

Call brand_read without brand_id to list accessible brands. Resolve the customer's name from
actual returned names. One brand, or exactly one match: state it and continue. Several possible
brands: show names and websites and ask once. No match: show accessible brands and offer to add
one only when the customer asks and supplies its website; never guess the URL.

Read \`brand_read { brand_id, sections: ["summary","kit","products","learnings"] }\` before
choosing a format. Reconcile explicit brand corrections through the durable capture rules.
A direct video request does not require first-campaign acceptance. Follow any returned
request-specific setup requirement; never mark research complete or accept a campaign to
bypass setup. Keep the original request.

### 2. Keep the goal and propose defaults

Never ask what the ad is for before showing formats. Keep the customer's exact direction.
Otherwise propose defaults from the verified kit's products, audience, offer and voice and the
Brain search's evidence brief (proven angles, saved rules, approved claims). Show those defaults
in the saved plan so any can be changed. Never invent proof or product facts.
Idea requests still follow ad-angle-miner with the video output.

### 3. Show the picker or its text fallback

Call \`video_catalog_list { kind: "formats", brand_id }\`. On the customer's computer, when you
can actually execute shell commands, include \`client: { shell: true }\`; in a chat host omit
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
- A row with \`fit.ok: false\` is ruled out for this brand. Never propose it unless the customer,
  after hearing why, still asks for it (the street conversation preview is the one exception; see
  the route check). When they ask about one, tell them why in plain words (its \`fit.reason\`),
  never the field name.
- \`suggested\` ranks a row for the brand; it never means the row makes the setup they named.
  Never tell the customer a row is "exactly" what they asked for beyond what its card says. A
  street interview still needs the route check above first.
- Missing required assets are missing; unknown suitability is “needs review.” Inspect the
  selected format's candidates before spending. Never promise an unverified asset is ready.
- Template formats use **one plan, one approval with the total in credits**, not approval for
  each paid step. Custom videos retain separate authenticated script/ingredient/budget gates in this chat.

### 4. Check this machine can render it

- **Chat host without a shell:** skip local checks and delegate an available format in Step 5.
  Never tell a chat host it needs Claude Code to start. Browser-only formats remain unavailable
  here; give computer setup guidance only if asked how to make one.
- **Local shell:** run \`gooseworks doctor --no-browser\` for common setup (auth/MCP, Node 18+,
  ffmpeg with libx264 + libass, ffprobe). Then fetch the selected template and its capabilities,
  and install documented dependencies in its fetched folder. Do not guess a renderer from a
  format name. For each Node renderer using default Playwright Chromium, run
  \`gooseworks doctor --renderer-script "/absolute/path/to/the/fetched/scripts/record.js"\` with
  the exact environment used to render, including NODE_PATH and PLAYWRIGHT_BROWSERS_PATH.
  Use the actual script path. Custom browser launch settings need their equivalent exact-runtime
  check. Non-browser capabilities need only their documented runtime checks.
  Never create paid ingredients before the selected renderer passes. Repair and recheck under
  existing setup permissions. If it cannot be fixed, re-list with client:{shell:false} and
  delegate only a format available to the coworker; never silently change the selected format.
- **Coworker sandbox:** you are the renderer. Follow goose-video-local's sandbox checks; never
  hand off recursively or claim browser capability that the sandbox lacks.

### 5. Create the project and hand it off, in this session

1. \`video_project_upsert { brand_id, name, format: <template_id> }\` with no brief (a brief creates
   a concept batch). A street interview is created only after its route check found a supported
   setup. Include client:{shell:true} only for real local execution. Default
   creation_intent:"format" keeps the style with this brand's content; source_remix requires an
   explicit choice to use source content.
   If they already chose a campaign/concept, include its verified campaign_id and optional
   campaign_concept_id. Read the IDs from that brand's saved campaign; the concept must belong
   to it. Omit unknown IDs and never infer a link or create a campaign solely to file a video.
2. **Verified local shell or coworker sandbox:** load
   \`catalog_fetch { type: "skill", slug: "goose-video-local" }\` and follow it on the same project_id.
   Carry the customer's words, verified defaults, campaign, selected angle and a street
   interview's route check result into its brief.
3. **Chat host:** \`goose_run_task { brand_id, project_id, message }\` with the request, selected
   format, defaults and a street interview's route check result. Keep task_id. Continue questions/edits with the same task and project.
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
${STORED_FOOTAGE_GUIDANCE}`;
}

/**
 * The canonical render-row actions for a client/agent-rendered video
 * (GOOSE-3725): `video_render_run kind:"full"` (no dry_run) on a sample-remix
 * project OPENS a queued ad_render row and returns `render_id`;
 * `video_render_run { render: { render_id, status, ... } }` UPDATES it
 * (← update_render_status). If those names change, edit ONLY these constants:
 * every mention in the goose-video-local skill text is built from them.
 */
export const RENDER_ROW_TOOL = 'video_render_run';
export const RENDER_OPEN_ARGS = 'kind: "full"';
export const RENDER_UPDATE_KEY = 'render';

/**
 * Returns the goose-video-local entry SKILL.md content (GOOSE-3677, GOOSE-3726).
 *
 * The local-render runtime. VIDEO projects made in the app (template remixes,
 * concept batches, anything that is not a recipe order) render wherever the
 * agent runs: the user's own Claude Code (with or without the gooseworks CLI)
 * OR an agent inside the GooseWorks E2B workspace sandbox (canonical MCP tools
 * + Bash, no CLI, no credentials.json; media proxies via GW_MEDIA_PROXY_TOKEN).
 * It fetches the per-format recipe, renders (ffmpeg, PIL, Playwright where
 * available), mirrors the review set for a free in-app review, then saves the
 * finished MP4 back over MCP using the canonical tools (video_project_*,
 * catalog_fetch, media_upload, the video_render_run render-row actions).
 */
export function getGooseVideoLocalSkillContent(): string {
  return `---
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
version: 0.6.7
author: GooseWorks
tags: [gooseworks, ads, video, remix, imessage, podcast, ugc, local-render, sandbox, byoa]
---

# GooseWorks Video Ads — local remix runtime

${CUSTOMER_TALK}

${videoEntryPreparation('goose-video-local')}

## Chat hosts and cards

First perform the mandatory route check below. Then, without a shell, hand a verified template
project to \`goose_run_task { brand_id, project_id, message }\`, or a verified template batch to
\`goose_run_task { brand_id, batch_id, message }\` (never send both ids). Keep task_id and the
same project or batch. Generated custom children keep their separate make-custom-video flow.
Inside a coworker sandbox you are the renderer: never delegate recursively.
With card.display_hint:"widget", say at most one line and never duplicate its plan, total or
links. Otherwise print card.text_summary. Read again on customer input, not in a polling loop.
A free saved draft is not proof that planning started or a complete plan exists.

## Mandatory route check before any local work or spend

For every existing \`project_id\` (including one supplied by the app's copy-for-Claude command),
call \`video_project_read { brand_id, project_id }\` **before** template lookup, toolchain setup,
media-proxy calls, or a review-set upload. For a batch, inspect each child project.

- **A server-rendered order** — the response has \`creative_plan\`,
  \`project.creative_spec_revision_id\`, \`order.creative_spec_revision_id\`, a planning
  \`lifecycle\`, or an \`order\` / \`script_drafts.recipe\` on a server format → **stop.**
  Server video orders are paused, and there is **no vetted local node-execution API** for them:
  do not rebuild one locally. Tell the customer this project was made for the server flow, which
  is paused; offer to start the same ad on a client-side format (\`goose-video\`, fetched with
  \`catalog_fetch { type: "skill", slug: "goose-video" }\`, older clients:
  \`fetch_skill("goose-video")\`). An order already holding credits can be released with
  \`job_cancel\`.
- **A client-side format or template remix** (a \`source_sample_id\` / \`template_id\` and none of
  the above) → continue below.
- **Generated custom video** (\`project.custom_video_state.mode === "generate"\`) → fetch \`catalog_fetch { type: "skill", slug: "make-custom-video" }\`, follow it on this same project and stop following the template flow. Record independent authenticated script/ingredient approvals in this chat with the current custom_review.approval_quote phase, review_token and cumulative total; Studio is optional. A handed-off coworker cannot self-approve; do not report approval_not_required.
- **Unclear** → read again or ask; never guess and generate. A copy prompt that names this skill
  is not proof of which kind the project is.

Continue below only for a verified client-side format or template remix.

For client-side formats and template remixes, you produce **video** ad creative wherever THIS agent runs and sync
the result back to the GooseWorks app over MCP. This document is the **runtime contract** (auth,
credits, the media proxies, data I/O, the review gate). A separate **recipe** — the template's
\`recipe\`, plus the capability skills it names — tells you *what to make* (the pieces, prompts,
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

${ENVIRONMENT_IDENTITY}

${ASSET_READINESS}

## Where am I running? (decide once, first)

Check in Bash, without printing any secret value:

\`\`\`bash
[ -n "$GW_MEDIA_PROXY_TOKEN" ] && echo sandbox || echo local
command -v gooseworks >/dev/null && echo cli || echo no-cli
\`\`\`

| Mode | How you know | Skills / atoms | Media-proxy auth |
|---|---|---|---|
| **GooseWorks sandbox** | \`GW_MEDIA_PROXY_TOKEN\` is set | \`catalog_fetch { type: "skill" }\` | env: \`GW_MEDIA_PROXY_TOKEN\` + \`GW_*_PROXY_URL\` |
| **Local, CLI installed** | \`gooseworks\` on PATH | \`gooseworks fetch <slug>\` or \`catalog_fetch\` | \`~/.gooseworks/credentials.json\` |
| **Local, no CLI** (Claude desktop app / Codex without login) | neither | \`catalog_fetch { type: "skill" }\` | \`~/.gooseworks/credentials.json\` if present, else **paid media over the MCP** (below) |

The \`gooseworks\` CLI and \`~/.gooseworks/credentials.json\` are **optional**. Everything this skill
needs from the app goes through the GooseWorks MCP tools below; the atoms' \`media_proxy.py\` reads
credentials.json when it exists and falls back to the \`GW_MEDIA_PROXY_TOKEN\` env otherwise.

### Paid media over the MCP: no key, no CLI needed

Every paid generation goes through the GooseWorks media proxy and is billed to the project. **You
never need FAL_KEY, an ElevenLabs key or \`fal_client\`.** An atom, a recipe or an open-source
skill that lists \`FAL_KEY\` in its environment is describing a standalone setup; here the proxy
satisfies it. Never stop, and never ask anyone to set a key, because one is missing.

**A one-off image or clip — call the MCP directly.** A frame placed in a laptop, a product cutout,
a creator still, a restyle, an animated shot, with any fal model (Nano Banana, GPT-image, Seedream,
Seedance, Kling). No atom script is needed:

1. A local input (a frame pulled from a screen recording, a screenshot) must be a public URL first:
   \`media_upload { brand_id, scope: "video_project", scope_id: project_id, source: { type: "file" | "bytes", … } }\`
   (no \`path\`). For a file, PUT its bytes to \`upload.url\` with \`upload.required_headers\`,
   then call \`media_confirm { brand_id, media_id: media.id }\`. Use the returned \`media.url\`.
2. \`data_post_provider { provider: "fal", path: <model id, e.g. "fal-ai/nano-banana/edit">, body: <model input>, project_id }\`
   returns \`{ job_id: "fal:<request_id>" }\`. Pass an \`idempotency_key\` so a retry isn't billed twice.
3. Poll \`job_get { job_id }\` every few seconds until \`complete\`; the \`*.fal.media\` URLs are in
   \`result\`. Download each and QC it (open the image) before using it.

For a set that must match (every laptop shot, every creator still), use ONE prompt and the same
model for all of them and change only the input image. Voice and music:
\`data_post_provider { provider: "elevenlabs", path: "/v1/text-to-speech/{voice_id}" | "/v1/music", body, project_id }\`
(synchronous; the audio lands in the project folder).

\`photos_generate\` is **not** a general image tool: it only photographs a physical catalog
product (apparel, beauty, CPG) and needs a \`product_id\`. A software screenshot or app mockup is a
fal image edit, above.

**Atom scripts — the MCP relay.** With neither \`GW_MEDIA_PROXY_TOKEN\` nor
\`~/.gooseworks/credentials.json\`, the atoms' \`media_proxy.py\` RELAYS each paid call through you
instead of calling the proxies over HTTP. Before running any atom,
\`export GW_PROJECT_ID=<project_id> GW_BRAND_ID=<brand_id>\` (every call is billed to that
project). When a script **exits with code 3** it wrote a request file under
\`working/mcp-requests/\`: make exactly that MCP call — fal:
\`data_post_provider { provider: "fal", path, body, project_id }\` then \`job_get { job_id }\` until
\`complete\`, saving \`result.output\`; ElevenLabs: \`data_post_provider { provider: "elevenlabs", … }\`,
saving the reply; a local file: \`media_upload\` with its bytes, saving \`{"url": …}\`. Write that JSON
to the request's \`save_result_to\` and **re-run the same command**; repeat until the script
finishes. Same server proxy and price as the CLI path. If the CLI is logged in to a DIFFERENT
environment than this MCP connector (prod vs staging), set \`GW_MEDIA_VIA=mcp\` so the spend lands
where the project lives.

## MCP tools — canonical names (use these)

Use the canonical GooseWorks MCP tools. Legacy names are listed only as a fallback for an older
client that does not expose the canonical tool; never mix both for one step.

| Step | Canonical tool (use this) | Legacy fallback |
|---|---|---|
| Read a project / batch | \`video_project_read { brand_id, project_id }\` / \`video_project_read { brand_id, batch_id }\` | \`get_ad_project\` / \`get_ad_video_batch\` |
| Template recipe | \`catalog_fetch { type: "template", slug: <source_sample_id> }\` | \`get_ad_template\` |
| Capability skill (atom) + its scripts | \`catalog_fetch { type: "skill", slug }\` | \`gooseworks fetch <slug>\` / \`fetch_skill\` |
| Brand kit, products, rules | \`brand_read { brand_id, sections: ["summary","kit","products","learnings"] }\` | \`brand_get_context\` / \`get_brand_kit\` |
| Save a brand rule (a correction) | \`brand_update { brand_id, knowledge_intent: "user_correction", user_statement: <the user's exact words>, patch: { facts: [{ id?, kind, text }] } }\` | none |
| Mirror the review set | \`video_project_upsert { brand_id, project_id, patch: { script: { script_drafts, script } } }\` | \`update_ad_project_script\` |
| Project assets | \`video_project_upsert { …, patch: { assets: [...] } }\` | \`update_ad_project_asset\` |
| Progress note | \`video_project_upsert { …, patch: { message: { role: "agent", content } } }\` | \`append_project_message\` |
| Batch status | \`video_project_upsert { brand_id, batch_id, patch: { batch: { status } } }\` | \`update_ad_video_batch\` |
| Upload a file to the project | \`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path, source: { type: "file", filename, content_type } }\` → PUT → \`media_confirm { brand_id, media_id: media.id }\` | \`get_upload_url\` / \`get_ad_upload_url\` |
| Save / find a finished piece (resume) | \`media_upload { …, path, ingredient_key, input_digest }\` / \`media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key_prefix: "" }\` (see "Save as you go") | none |
| Open the render row | \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_OPEN_ARGS} }\` (no \`dry_run\`; returns \`render_id\`) | \`submit_render { project_id, kind: "full" }\` |
| Update the render row | \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status, output_url?, thumbnail_url?, error_message?, quality_status?, quality_report? } }\` | \`update_render_status\` |
| Pin the final render | \`video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }\` | \`set_final_render\` |
| Credits / identity | \`account_whoami\` | \`get_ad_credits\` |

\`list_accessible_scopes\` and the \`target: { type: "agent", agent_id }\` dance are **not needed**:
\`media_upload\` with \`scope: "video_project"\` derives the right storage key (org-default Ads agent
+ brand slug + project folder) on the server.

## Running in a GooseWorks sandbox

You are an agent inside the user's GooseWorks workspace sandbox (Claude Code harness, Bash, the
GooseWorks MCP with canonical tools only). There is **no \`gooseworks\` CLI** and **no
\`~/.gooseworks/credentials.json\`**. The environment carries \`GW_MEDIA_PROXY_TOKEN\`, \`GW_API_BASE\`,
\`GW_FAL_PROXY_URL\`, \`GW_FAL_STORAGE_PROXY_URL\`, \`GW_ELEVENLABS_PROXY_URL\`, \`GW_WHISPER_PROXY_URL\`
and usually \`GW_PROJECT_ID\`.

- **Formats:** only formats that need **no Chromium** run here — podcast skits and UGC /
  talking-head formats (ffmpeg + PIL assembly). If the template's recipe or an atom needs
  Playwright/Chromium with no PIL fallback (iMessage / ChatGPT / Notes phone mockups,
  hyperframes, HTML recorders), **stop before any spend** and say so plainly: "This format needs
  a browser renderer that this workspace doesn't have. Run it in your own Claude Code with the
  GooseWorks CLI (\`goose-video-local\`), or pick a podcast/UGC format." Do not half-render.
- **Toolchain:** check \`ffmpeg -version\` and \`ffprobe -version\`. Install Python deps only when an
  atom needs them: \`pip install --quiet pillow\` when a render atom uses PIL (captions, end card),
  \`pip install --quiet requests\` if \`import requests\` fails. Never \`npx playwright install\` here.
- **Atoms:** \`catalog_fetch { type: "skill", slug }\` returns \`content\`, \`scripts\`, \`files\` and
  \`dependencySkills\`. Write \`content\` to \`/tmp/gooseworks-scripts/<slug>/SKILL.md\`, each
  \`scripts\` entry to \`/tmp/gooseworks-scripts/<slug>/scripts/<name>\` and each \`files\` entry to
  \`/tmp/gooseworks-scripts/<slug>/<name>\` (keep the key as the relative path; do the same for
  each dependency skill). Run scripts from their \`scripts/\` folder so \`import media_proxy\` resolves.
- **Project attribution:** \`export GW_PROJECT_ID=<project_id>\` in the shell **before running any
  atom** for that project (re-export per concept in a batch). The proxies bill the workspace
  agent and attribute spend to that project.
- **Never call a provider with a raw key.** All FAL / ElevenLabs / Whisper traffic goes through
  the \`GW_*_PROXY_URL\` bases with \`GW_MEDIA_PROXY_TOKEN\`. \`FAL_KEY\` / \`ELEVENLABS_API_KEY\` in
  this environment are proxy tokens, not provider keys — never send them to \`fal.run\`,
  \`queue.fal.run\` or \`api.elevenlabs.io\` directly. Never print any token.
- **Whisper for QC:** \`export OPENAI_BASE_URL="$GW_WHISPER_PROXY_URL/v1"\` before running
  \`review-ugc-render\` / \`watch\` transcripts.
- **The operator may be absent.** Keep every quality gate and checkpoint below, but decide
  defaults yourself from the project brief and the recipe, and record them in the review set.
  Ask in the chat **only for a true taste call** (a creative choice the brief and recipe leave
  open and that changes the ad), never for a mechanical or recoverable decision. The Step 3
  approval still applies: ask for it in this chat and record the yes with
  \`video_project_upsert patch.approve\`.
- **Outputs:** keep working files under \`/tmp/gooseworks-video/<project_id>/\` (local disk — never
  the s3fs workspace mount, which is slow and can drop writes); anything the user must see goes to
  the project via \`media_upload\` (never leave the result only in the sandbox). Every paid piece is
  also SAVED to the project as soon as it passes QC — see "Save as you go — and resume".

## Report problems so we can fix them (telemetry — do this, don't skip it)

If anything blocks or degrades this run — a media/proxy call fails or errors, a required input or
asset is missing, a recipe instruction is ambiguous or contradictory, the render toolchain won't set
up, or you hit a bug you can't work around — **report it** so the team gets visibility and can fix
the skill. It's fire-and-forget, never counts against you, and never blocks your work.

- **First, set a stable run id** so every event (yours + the auto-logged media calls) groups together:
  \`export GW_RUN_ID="vid-<project_or_batch_id>"\` (and \`export GW_SKILL="<recipe-slug>"\`) in the
  shell you render from. The media proxies read \`GW_RUN_ID\` automatically.
- **CLI present →** \`gooseworks log "<what happened>" --event-type <type> --level error --details '{"error":"...","step":"...","model":"..."}'\`
- **No CLI (sandbox / cowork) →** from any atom's \`scripts/\` folder:
  \`python3 -c 'from media_proxy import gw_log; gw_log("<what happened>", event_type="blocker", level="error", details={"step": "..."})'\`
  (or the \`log_cli_event\` MCP tool if your client has it).
- Event types: \`api_failure\` (a proxy/model call failed) · \`missing_input\` · \`blocker\` ·
  \`confusion\` (unclear/contradictory instruction) · \`error\` (a bug) · \`step\`/\`info\` (progress notes).
- Put the **real error text + the step you were on** in the details. Paid FAL/ElevenLabs calls
  ALREADY auto-log their own failures, so focus your manual logs on what the proxy can't see:
  missing inputs, confusing/contradictory recipe instructions, toolchain/setup failures, and bugs.
- Logging is FOR US — it does not replace telling the user. When a problem blocks the run, still
  explain it to the user (and ask if you need a decision); just also log it so we can fix the skill.

## Prerequisite — MCP + a render toolchain (Phase 0 preflight)

- The GooseWorks MCP tools are REQUIRED. If they're unavailable, stop and tell the user
  to connect the GooseWorks MCP server (or run \`gooseworks install --claude --mcp\` on the CLI)
  and restart. There is no REST fallback.
- **The render runs wherever THIS agent runs, and it needs a real toolchain:** \`ffmpeg\` +
  \`ffprobe\` always, plus a Playwright **Chromium** for browser-rendered formats (phone mockups,
  HTML end cards without a PIL fallback). Establish it in this priority order, and do NOT start
  rendering until one is confirmed:
  1. **Sandbox →** see "Running in a GooseWorks sandbox": ffmpeg + ffprobe (+ PIL on demand); no
     Chromium, so browser formats stop there.
  2. **CLI present →** run \`gooseworks doctor --no-browser\` for login, MCP, Node 18+, ffmpeg
     with libx264 + libass, and ffprobe. This is common setup only. After fetching the selected
     capabilities in Step 2, check each browser renderer's actual launch before ANY paid
     ingredient. An unscoped \`gooseworks doctor\` checks only the calling folder's browser;
     it cannot certify a different fetched renderer.
  3. **No CLI →** check the toolchain yourself: \`node --version\` (18+), \`ffmpeg -version\`,
     \`ffprobe -version\`, plus \`ffmpeg -hide_banner -encoders\` (libx264) and
     \`ffmpeg -hide_banner -filters\` (ass). After fetching, use the exact-package free launch
     check in Step 2; resolving a package or finding a cache folder does not prove its browser
     can launch. The \`watch\` QC step later needs the same ffmpeg and,
     for transcripts, a Whisper backend — without one it degrades to frames only.
  4. **Docker available →** the most reliable way to get the toolchain on a host that lacks it:
     run the render steps inside the prebuilt image
     **\`ghcr.io/gooseworks-ai/goose-video-render\`** (ffmpeg + ffprobe + Playwright Chromium baked
     in), mounting the project working directory. (Nested Docker is usually disabled inside
     managed sandboxes — treat this as an option, not a guarantee.)
  5. **None of the above works →** STOP and tell the user plainly, e.g.: *"Video rendering needs
     ffmpeg (and, for this format, a Playwright Chromium) on the machine running this agent. This
     environment doesn't have them and I can't install them here. Options: (a) enable Docker so I
     can use the goose-video-render image, (b) install ffmpeg + \`npx playwright install chromium\`,
     or (c) run this skill in your own Claude Code where the toolchain is available."* Do not
     half-render or fake a result. Static image ads (the \`goose-ads\` skill) do NOT need any of this
     and work anywhere — offer that as the fallback if they just want an ad now.

## Identity, token, credits

- **Sandbox:** the token is \`GW_MEDIA_PROXY_TOKEN\` (already scoped to this workspace's agent and
  org); the API base is \`GW_API_BASE\`. Never print either.
- **Local:** read \`~/.gooseworks/credentials.json\` → \`api_key\` (your agent token), \`api_base\`,
  \`agent_id\`. Never print the token.
- **Uploads go through \`media_upload\` with \`scope: "video_project"\`** — pass \`path\` = the
  project-relative path (\`working/final.mp4\`, \`working/review/end-card.png\`). The server stores it
  in the project folder of the org-default Ads agent (where the app's render-file route reads) and
  returns \`upload.url\` (presigned PUT), \`upload.required_headers\` and
  \`upload.render_file_url\`. PUT the bytes with exactly those headers, check the PUT returned
  2xx, then call \`media_confirm { brand_id, media_id: media.id }\` and require success before
  using the file in ingredients or completing a render. This applies to project-path and
  path-less file uploads. Confirmation verifies the stored file; Goose performs this tool step
  without asking the user for another approval. On failure, report or repair the upload before
  continuing. Never hand-build storage paths or agent prefixes; a bare workspace upload is
  invisible in the app.
- Media generation (FAL / ElevenLabs) through the GooseWorks proxies is the **REAL spend** — billed
  per call as you generate (Step 4). The render row (\`${RENDER_ROW_TOOL} ${RENDER_OPEN_ARGS}\`) charges the flat
  **video base fee once, when a full render is reported \`complete\`**. Open one row immediately
  after recorded approval, BEFORE paid production (Step 4.1), and reuse that render_id for progress
  and completion. Never open a second row on a guess (a second completed row bills again). The final-video QC gate (Step 4.3) then sits between
  that master and PINNING it. Call \`account_whoami\` first to see the credit balance.

## Save as you go — and resume (never pay twice for a piece)

A sandbox can die mid-run (timeout, restart, a new session picks the project up). Anything that
lives only in \`/tmp\` is then gone, and regenerating it pays again. So: **save every piece to the
project the moment it passes its QC, and start every run by loading what is already saved.**
Working files stay in \`/tmp/gooseworks-video/<project_id>/\` (never the s3fs workspace mount);
the project is the durable copy.

**Ingredient keys.** Give every planned piece a stable key before you generate it, the same on
every run: \`vo/scene-03\`, \`vo/sample-her\`, \`still/her-base\`, \`still/scene-05\`,
\`clip/scene-05\` (a lipsync / video clip), \`music/bed\`, \`endcard\`, \`captions\`, \`final\`,
\`final-thumb\`. Upload path = \`working/<role>/<file>\` (\`working/vo/scene-03.mp3\`,
\`working/clip/scene-05.mp4\`); the review set keeps its \`working/review/<name>\` paths.

**Input digest.** Name the exact inputs of each generation with \`input_digest\` from
\`media_proxy\` (in every media capability's \`scripts/\` folder):

\`\`\`python
from media_proxy import input_digest
digest = input_digest(model_path, args)   # the model + the EXACT payload you send
\`\`\`

Hash only what decides the output (prompt, voice_id, model_id, seed, duration, aspect…). An input
that is a presigned or proxy URL changes every run, so swap it for that input's own identity
before hashing, e.g. \`{**args, "image_url": {"ingredient": "still/her-base", "digest": her_digest}}\`
— then a changed still correctly invalidates every clip made from it. For a piece you build
locally (ffmpeg stitch, PIL end card, captions) use \`input_digest("local/<step>", {params,
inputs: {key: digest, …}})\`.

**1. At the START of every run (first run, resume, new sandbox), load what exists — one call:**
\`media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key_prefix: "",
limit: 100 }\`. It returns ONE compact row per \`ingredient_key\` (the newest):
\`{ id, ingredient_key, input_digest, kind, status, mime, bytes, url, path, created_at }\`. Every
status except archived is included. Project-path uploads remain \`pending\` until
\`media_confirm\` succeeds. Confirm a pending project-path upload before reusing it; if
confirmation fails, repair the upload before treating it as a verified save.
Page with \`cursor\` if \`next_cursor\` is set (keep the first row you see per key — it is the newest). Also read \`script_drafts.ingredients\` from
\`video_project_read\`: it records which pieces were already approved in the review.

**2. For each planned piece:** compute its digest from the args you WOULD send now. If a saved row
has the same \`ingredient_key\` AND the same \`input_digest\`, **download it instead of
generating**:

\`\`\`bash
curl -fsSL "$URL" -o /tmp/gooseworks-video/<project_id>/<path>   # URL = that row's \`url\`
\`\`\`

That \`url\` is a short-lived (~15 min) presigned S3 GET the server signs for you, so it needs no
auth header — download right after listing (list again if it expired). **Never fetch the
\`/api/ads/projects/<id>/render-file?path=…\` route from the sandbox:** it needs the app's
browser session and answers 401 to a token. Check the file is non-empty and plays (ffprobe for
audio/video, open the image); if the download fails or the file is broken, regenerate the piece.
Only generate what is missing or whose digest changed — a changed digest means the inputs changed,
so the old file is stale.

**Pass the digest to the proxy too:** \`fal_generate(..., input_digest=digest)\` (and
\`fal_generate_video\` / \`fal_whisper\`). A piece that was generated but never saved (the sandbox
died between the fal result and the upload) is then handed back by the proxy instead of paid for
again, even though its input URLs changed. Only pass \`new_take=True\` when the user wants a
different take of the same inputs.

**3. After EACH piece is generated AND passes its own QC, upload it right away** — don't batch
the uploads to the end:
\`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path:
"working/<role>/<file>", ingredient_key, input_digest, source: { type: "file", filename,
content_type } }\` → PUT the bytes to \`upload.url\` with \`upload.required_headers\` →
\`media_confirm { brand_id, media_id: media.id }\`. Require a successful confirmation.
Kind: \`audio\` (VO), \`music\`, \`image\` (a still),
\`video\` (a clip), \`endcard\`, \`document\` (captions / a JSON sidecar), \`render\` (the master),
\`thumbnail\`. Re-uploading the same key is fine — the newest wins. A piece that FAILED QC is never
uploaded under its key. **Save a piece's sidecars with it** under \`<key>.<name>\` — e.g. the VO's
char-level timestamps as \`vo/scene-03.timestamps\` (\`kind: "document"\`, same digest). Captions are
built from them; without them a resumed run has to fall back to Whisper timings, which mis-case
brand names.

**4. Keep the approved review unchanged during production.** Record each confirmed piece's
\`media_id\`, \`path\`, \`ingredient_key\` and \`input_digest\` locally; the confirmed media rows
and render progress are the durable resume record. Before approval, mirror the draft ingredients
as part of Step 3. After approval, do NOT write \`patch.script\` or \`script_drafts\` during any
paid production, QC or repair step, or while provider work is pending. A review-set write clears
approval and can stop the next paid step, including a batch concept. Save the final descriptive
review once all paid work is finished and settled, as Step 4.5 requires.

Any material creative change or ANY change the user asked for in this chat must stop production:
save the changed complete plan and full credit total, then obtain fresh approval before continuing.
Never reuse the earlier yes for a changed plan. A repair that restores the approved choices can
continue within the existing allowance and Stop guards without rewriting the approved review.

The \`final\` master and \`final-thumb\` poster (Step 4.4) carry \`ingredient_key\` too, so a
resumed run that finds a passing \`final\` with the same digest only needs to publish.

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

\`\`\`json
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
\`\`\`

Run \`gooseworks video-save prepare --manifest <manifest.json> --checkpoint <retained/save-<render_id>.json>\`
before any upload, then \`gooseworks video-save resume --checkpoint <same checkpoint>\` for both
normal saving and recovery. The helper uses the saved login and canonical MCP connection; it does
not copy credentials or use a raw Ads REST fallback. Its atomic private checkpoint binds the
environment, account, project owner, project/render, final/poster bytes, assembly digest, passing
quality report, review set, evidence files and stage receipts. Preserve it until delivery. Never
edit the checkpoint to clear a failed check. Keep checkpoint and manifest files out of commits.

The helper reads remote state before writes. It keeps \`final\` / \`final-thumb\` ingredient keys
and writes per-render paths \`working/final-<render_id>.mp4\` / \`working/final-<render_id>-thumb.jpg\`
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
signed URLs or auth headers**. On reconnect call \`account_whoami\`,
\`video_project_read { brand_id, project_id, include: ["renders"] }\` and
\`media_list { brand_id, scope: "video_project", scope_id: project_id, ingredient_key, input_digest }\`
on the original connection. Compare identities, local/evidence hashes and saved review; verify
confirmed remote bytes too. Treat a lost reply as unknown and read back before retrying. Use only
the missing \`media_upload\` → PUT → \`media_confirm\`, same-render \`video_render_run { render: … }\`
callback and \`video_project_upsert\` with only \`patch.final_render_id\` and
\`patch.final_selection_guard: { expected_final_render_id, expected_review_digest }\`; never a
render-open call. The expected final is the last read's pin, including explicit \`null\`; the
review digest is SHA-256 of recursively sorted-key JSON
\`{script: project.script ?? null, script_drafts: project.script_drafts ?? null}\` saved at checkpoint
creation. First confirm the selected server advertises this guard in \`tools/list\`. If absent,
stop and request the normal server update/reconnect; an unguarded pin is unsafe. A
\`final_selection_conflict\` means the choice or review changed: keep the checkpoint and explain
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

The handoff is EITHER a single \`project <id>\` OR a \`video batch <id>\`. A batch is
the app's "N concepts" flow: one composer submission fans out into **N independent concept projects**
(the user picked a concept count, default 3), and the app expects EACH to be rendered. **Handle both:**

- **\`project <id>\`** → you have one project. Treat it as a batch of one and continue to Step 1.
- **\`video batch <id>\`** → call \`video_project_read { brand_id, batch_id }\`. It returns every child
  concept under \`projects[]\` — each is a normal project with its own \`id\`, \`variant_index\`
  (Concept 1..N), and its own \`creative_brief\` (the per-concept angle/hook/offer/message). **You
  MUST process every concept, not just the first** — dropping concepts 2..N is the #1 batch bug.

**Loop shape (ONE approval for the batch, isolated work per concept):**
1. Run **Step 1 + Step 1.5 + Step 2 + Step 2.5 + Step 3-assemble** for EACH concept project (each
   has its own \`project_id\`, brief, \`GW_PROJECT_ID\` and \`working/\` folder — never cross-write
   between concepts). The brand read (Step 1 item 2) and \`brand-rules.json\` (Step 1.7) are per
   BRAND: do them once for the batch and copy the file into each concept's \`working/\`. The read is
   ~90K characters. Step 2.5's angle bank is shared per brand AND product: load or build it once, and
   give every concept whose angle is \`auto\` a DIFFERENT angle from that list, so the batch is N
   different ads, not one ad N times.
2. Mirror EVERY concept's review set (Step 3's \`video_project_upsert patch.script\` per project),
   then stop for **ONE** approval in this chat that covers all concepts. Save each render_estimate.total_credits
   (previews + render + the 200 base fee) and the batch total. Widget: one line; text: card.text_summary. Set the batch to \`review\` (\`video_project_upsert
   { brand_id, batch_id, patch: { batch: { status: "review" } } }\`).
3. On an explicit yes, record it ONCE for the whole batch: \`video_project_upsert { brand_id, batch_id,
   patch: { approve: { user_quote: "<their exact words>", total_credits: <the saved total> } } }\`. Check its \`not_ready\` list is
   empty (a concept listed there has no saved review set: save it, show it, ask again). If they
   approve only some concepts ("1 and 3 are good, redo 2"), record each approved one with its
   \`project_id\` instead, and redo the rest. Then set the batch to \`rendering\` and run **Step 4 (the expensive render)** for each
   concept with up to 8 isolated workers when the machine can sustain them. Retry
   concurrency_limit after retry_after_seconds; reduce concurrency on a limited machine. Deliver each (Step 5). When every concept is pinned, set the batch to
   \`complete\`. A concept the Step 4.3 gate leaves \`blocked\` cannot be pinned (a batch concept
   needs \`passed\`): finish the others, set the batch to \`blocked\`, and tell the user which
   concepts passed and which are blocked, with each one's failing checks.

If a single concept fails, keep going with the rest, mark that concept blocked, and report which
ones shipped — never abort the whole batch on one bad concept. Everything below (Steps 1–5) is
written per-project; a batch just runs it N times with the shared approval gate above.

## Step 1 — resolve the project, source, brand

1. \`video_project_read { brand_id, project_id }\` → keep \`brand_id\`, \`source_sample_id\`, \`name\`,
   \`status\`, the **top-level** \`app_url\` + \`brand_url\` (the links you hand the user for the in-app
   review in Step 3 and delivery in Step 5), AND the user's **\`creative_brief\`**, project
   **\`assets\`**, \`character_id\`, \`default_voice_id\` — these are the authoritative inputs the user
   chose in the composer (see Step 1.5). Do NOT discard them. Then \`export GW_PROJECT_ID=<project_id>\`.
   Keep its saved \`campaign_id\` and \`campaign_concept_id\` too. If the customer explicitly
   wants to attach this existing video to a known campaign/concept, verify the IDs with the
   campaign read and use \`video_project_upsert { brand_id, project_id, patch: {
   campaign_association: { campaign_id, campaign_concept_id? } } }\` as a separate, sole-field
   patch. Read back the same project and confirm the saved IDs. Linking never needs a new
   project, render, generation call or approval. A conflicting saved link stays intact; explain
   it instead of silently moving the video. Leave unlinked legacy videos alone unless asked.

### Step 1.5 — the project brief is AUTHORITATIVE (honor it; don't re-ask)

The composer already collected the user's creative direction onto the project. **Read it and treat
it as ground truth — it OVERRIDES the template recipe's defaults, and it REPLACES the clarifying
questions you would otherwise ask.** For a field the brief leaves empty, use the Brain search's
evidence brief first, then the recipe default, then (last) asking. Map the fields you WILL honor:

- \`creative_brief.productName\` / \`.offer\` / \`.angle\` → the product, offer/code, and angle. Do
  **not** ask "which product / what offer / what angle" if these are set.
- \`creative_brief.concept\` (on a batch child) → this concept's **\`angle\` / \`hook\` / \`offer\` /
  \`message\` / \`note\`** — the per-concept differentiator. Honor it verbatim; it's WHY the user asked
  for N concepts. \`angle: "auto"\` or empty means "you choose."
- Project \`assets\` + \`creative_brief.reference_image_urls\` → the user's **own reference images**.
  Use them as the product/brand refs (alongside the brand kit), don't ignore them for generic recipe
  assets.
- \`character_id\` → the avatar/creator to use. \`default_voice_id\` → the voice for any VO (put its
  NAME in the review \`subtitle\`). Use these instead of picking your own.
- \`creative_brief.durationSeconds\` → target length; honor it when the format allows.
  \`creative_brief.ratio\` → video ads are ALWAYS 9:16 (1080×1920). If the brief asks for another
  ratio, make 9:16 anyway and say so in the review; never export another size (a recipe's
  "also 1:1" option included).
- \`polish_policy\` (\`standard\` | \`extra\`) → \`extra\` means spend the extra pass on QC/polish.

2. Brand gate: \`brand_read { brand_id, sections: ["summary", "kit", "products", "learnings"] }\`
   (older clients: \`brand_get_context\` with the same sections). Ask for all four: the default
   leaves out the kit and the brand's saved rules, and a video made without them is off-brand.
   If the kit's \`researchStatus\` (or the brand's \`research_status\`) is \`complete\`, REUSE it —
   never re-research. A pending status alone does not require research; use verified stored
   facts and ask only for an actual gap. If the context is empty or the customer requests
   research, load \`catalog_fetch { type: "skill", slug:
   "brand-research" }\` and follow its stored-pack workflow. Only when that verified pack is
   saved in the supported research workspace, finalize with
   \`brand_update { brand_id, patch: { finalize_research: true } }\`, then read the brand back.
   Never send raw research JSON through \`kit_patch\`: the public tool accepts only the existing
   \`video_lab\` asset slot there. If there is no verified stored pack, submit researched facts
   through typed \`patch.knowledge\` / \`patch.kit\` as pending agent proposals; do not pretend
   research is finalized or its proposals are approved. Then do Step 1.7 with verified facts.
3. For a new plan, \`catalog_fetch { type: "template", slug: <source_sample_id> }\` → the source
   video: \`media_url\`, \`recipe\`, \`format\` (e.g. "podcast-skit", "imessage"),
   \`extracted_script\`, \`how_to\`, \`remix_spec\`. For an approved resume, restore the recorded
   package and dependencies instead of fetching today's recipe over the saved plan.

### Step 1.6 — a remix of a FINISHED video (the project read has a \`remix\` block)

A project made from **Community videos** remakes another customer's finished video for THIS brand.
Its \`video_project_read\` returns a top-level \`remix\` block
(\`{ remix_of_project_id, instruction, direction }\`), and \`reference_video_url\` is that finished video.

- **Watch the reference video first** (download \`reference_video_url\`, pull frames + the transcript).
  It is the target: match its structure, beat order, pacing, framing, look, voice and tone.
- **\`remix.direction\` is its approved review set** (scenes and lines, set/look notes, take prompts,
  captions, music, voice). Start your review set from it instead of the template's defaults; it
  already carries every change that customer made to the template.
- **\`remix.direction.implementation\`, when present, is HOW it was made**: the pipeline and the model
  each step used, the style and negative prompts, the character and per-scene still/motion prompts
  with their guards, voice and music settings, the mix, and \`fixes\` (what went wrong and how it was
  fixed). Reuse the same models, style/negative prompts and guards, rewrite the prompts' subjects for
  this brand, and apply every \`fix\` up front so you don't repeat the same mistake.
- **Rewrite everything for THIS brand.** "[source brand]", "[source product]", "[link]", "[email]"
  and "[code]" mark the other customer's details: never write them, and never reuse their claims,
  numbers, URLs, offers or CTA. Every product, claim, name, image and CTA comes from this brand's
  kit, products and media. Their footage (screen recordings, product shots) and their creator face
  are NOT carried over: use this brand's own assets and make a new creator from the description.
- Precedence: this project's own \`creative_brief\` and assets (Step 1.5) > \`remix.direction\` >
  the template recipe's defaults.
- In the Step 3 review, say it is a remix of that video and list what you kept vs. changed.

### Step 1.7 — the brand rules file and the brand assets (every run, before any writing)

Before new writing, write \`working/brand-rules.json\` from the Step 1 brand read. Preserve an
approved run's saved rules on resume; reconcile an intentional rule change through the existing
review gate. Every later step reads THIS file, not your memory of the chat:

\`\`\`json
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
\`\`\`

- **Video taste is direction, not dialogue.** Before mapping brand rules, extract entries
  prefixed \`Video preference:\` from both \`learnings\` and \`kit.instructions\` into the verified
  taste brief, including accepted proposals. They govern pacing, voices, captions, visuals and
  format choice; do not copy them into \`must_say\` / \`never_say\` or read them aloud. Carry the
  brief into the choices, scene planning and review.
- **Sources.** \`learnings\` are the brand's saved rules (the user's past corrections among them):
  \`must\` / \`do\` → \`must_say\`, \`dont\` → \`never_say\`, and a \`must\` whose text reads
  \`Pronounce "<term>" as "<say_as>"\` (straight or curly quotes) → \`pronunciations\`. Add \`kit.instructions\` (free-text
  standing rules) only when they require actual spoken wording or prohibit a claim. Production
  directions stay in the brief. A required spoken line or prohibited claim remains its own
  ordinary \`must\` / \`dont\` rule.
- **Which product.** The one the brief names (\`creative_brief.productName\`); with none, the row
  whose name matches the product the user asked for, or the brand itself for a one-product
  brand. Product lists often hold other brands' items or old ads saved as products: if more than
  one row could be it, ask in the choices round. Never mix facts across rows.
- **Product facts** come from that row (name, description, variant, price) and, when the row is
  empty, from the kit (\`valueProps\`, \`description\`, \`tagline\`): nothing else. Write them to
  \`products[].facts\`; the script may only state what is there.
- **Logo.** Download the kit's logo FILE (\`kit.logoUrl\`, else \`kit.logos[0]\`) to \`working/brand/\`,
  keeping its real extension (an SVG stays \`.svg\`; rasterise it to a 1024px-wide PNG with
  \`rsvg-convert\` or \`cairosvg\` when a renderer needs pixels). It is used as-is on every scene and
  end card that shows a logo: **never generate, redraw, re-letter or restyle a logo with an image
  model.** If the kit's \`logoConfidence\` says favicon-grade, or the file's long side is under
  256 px (or it is under 40,000 px²), it is a site favicon, not a logo: do not upscale it. Ask the user for a real logo (or offer the brand name
  set as text in the brand font) in the SAME question round as the recipe's \`choices\`.
- **Font.** \`kit.typography.heading\` when its \`source\` is \`user\` (the user chose it), else
  \`kit.fonts.heading\`. Download the font file (the kit's own, or the same family from Google
  Fonts) to \`working/brand/\` and use it for every on-screen line. With no match, use the closest
  free font and say so in the review.
- **No wordmark file.** When a recipe wants a wordmark SVG and the kit has only a logo image, set
  the brand name as text in the brand font beside the logo file. Never generate one.
- Record in \`brand-rules.json\` which logo the video will actually composite (\`logo.file\`), or
  \`"logo": { "mode": "text" }\` when it will show only the brand name set in the brand font.
- **Product images.** Download this product's own images to \`working/brand/\`. Use only images of
  THIS product: never a catalogue image of another product, a mascot, a lifestyle photo of a
  person, or a stand-in. If the product has no usable image, ask in the choices round.

### Brand corrections stick — save them to the brand the moment they are made

When the user corrects something about the BRAND in chat — how a name is said, a claim that may
not be made, a product fact, a visual rule ("never use red", "the logo goes top-left") — save it
in the SAME turn, before anything else:

\`brand_update { brand_id, knowledge_intent: "user_correction", user_statement: <the user's exact correction>, patch: { facts: [{ kind, text }] } }\`

| Correction | \`kind\` | \`text\` |
|---|---|---|
| Pronunciation | \`must\` | \`Pronounce "Acme" as "ak-mee"\` (exactly this form) |
| A claim or word to avoid | \`dont\` | \`Never say or imply: <the claim>\` |
| Something that must be said | \`must\` | \`<the rule>\` |
| A product fact | \`must\` | \`<product name>: <the fact>\` |
| A visual rule | \`do\` / \`dont\` | \`<the rule>\` |

- If it changes an EXISTING rule (a new pronunciation for the same term), update that rule by id
  (\`facts: [{ id: <learning_id>, text }]\`) instead of adding a second one.
- Use the correction intent and user's statement when supported, as described below. Read
  \`brand_read\` learnings back and verify the rule and source before claiming it was saved.
- Then tell the user in one line: "Saved to your brand for future videos." Update
  \`working/brand-rules.json\` and apply the rule to THIS video too.
- A one-off note about this video ("make it shorter", "use the blue background here") is NOT a
  brand rule: don't save it.

${DURABLE_BRAND_CAPTURE}

${VIDEO_TASTE_CAPTURE}

## Step 2 — read the template's recipe (it carries everything; NO hardcoded format map)

The ad format is a **template (data) in the ad_sample DB**, not a per-format skill.
\`catalog_fetch { type: "template" }\` returns the template's \`recipe\` — a self-contained brief you
read and execute. **Do NOT map \`format\` to a hardcoded recipe slug** (there is no such table):

- \`recipe.format\` — the format label (e.g. \`vignette\`), for display only.
- \`recipe.atoms\` — the **capabilities** this template composes (e.g. \`create-vo-elevenlabs\`,
  \`create-image-gpt-image-fal\`, \`render-podcast-skit\`, \`review-ugc-render\`, \`watch\`). Fetch each
  with \`catalog_fetch { type: "skill", slug }\` (or \`gooseworks fetch <name>\` when the CLI is
  installed) — they are reused across templates.
- \`recipe.instructions\` — the **playbook** to follow: \`instructions.inline\` prose, or
  \`instructions.doc_url\` (an S3 markdown doc — fetch it).
- \`recipe.config\` — every param (prompts, layout, timings, palette, model choices).
- \`recipe.inputs\` — the brand-asset contract (which product / logo / offer this template needs).
- \`recipe.choices\` — the creative calls the USER makes (who is on screen, narrator, tone, setting,
  art style, music). Ask every unanswered one in ONE round before any paid step, with its options plus
  "you pick". Its \`reference\` is what the demo used: an example, never the default.
- \`recipe.assets\` — reference material as S3 links (reference render, style guide, example frames) —
  fetch as needed.

Runtime: **read the recipe → fetch each capability in \`recipe.atoms\` → follow
\`recipe.instructions\` with \`recipe.config\` + the brand's bound \`inputs\`.** The template IS the recipe;
there is no \`format → recipe-slug\` table and no per-format skill to fetch.

Save each fetched capability's content, scripts + files under \`/tmp/gooseworks-scripts/<name>/\`
(layout in "Running in a GooseWorks sandbox"). If a capability is a Node package (a phone-mockup
renderer), install its documented dependencies in the folder containing its \`package.json\`,
and preserve the recorder's documented \`NODE_PATH\` — local machines only; in a sandbox that
format stops (no Chromium).

**Selected browser readiness — before ANY paid ingredient:** identify the actual browser script
from the fetched capability's instructions (including an HTML end-card renderer if used).
For Node scripts using \`require('playwright')\` with default \`chromium.launch()\`, run
\`gooseworks doctor --renderer-script "/absolute/path/to/the/fetched/scripts/record.js"\`.
Substitute the actual script, and keep the same cwd and environment as the render, including
\`NODE_PATH\` and \`PLAYWRIGHT_BROWSERS_PATH\`. It resolves Playwright relative to that script,
launches and closes Chromium with the default settings and bounded waits, and downloads nothing.
On failure, stop before spending, show its folder-specific repair and recheck after setup.
For non-browser formats use \`doctor --no-browser\` plus their documented runtime checks;
never combine \`--no-browser\` with \`--renderer-script\` or use it to bypass a browser renderer.

**No CLI or CLI without these flags:** run an equivalent free probe in a separate Node process: use
\`require('node:module').createRequire(require('node:path').resolve(actualRendererScript))\`
to load \`playwright\`; keep the render's cwd, environment and default launch settings. Await
\`chromium.launch({ timeout: 15000 })\`, then await \`browser.close()\` (bound close to 3 seconds).
Bound the whole process to 20 seconds and stop its own process tree on failure or timeout.
Report the resolved module path/version and error without credentials. Missing module, executable,
headless runtime or failed launch is a failed check; a cache folder, executablePath alone or
another project's browser is not a pass. Other browser packages, Python renderers or custom
launch settings need the same free launch/close check through their documented runtime and
actual settings. Do not replace their browser/channel/flags to get a pass. Setup is a separate
action under existing permissions; this check never silently installs or downloads anything.

> **Migration note:** older phone-mockup formats (\`imessage\` / \`chatgpt\` / \`apple-notes\`) whose DB
> recipe does not yet carry \`atoms\` / \`instructions\` still hold the legacy \`recipe.thread\` payload;
> migrate them to this shape (capabilities + instructions in the DB) — do not reintroduce a CLI map.

## Step 2.5 — plan words and visuals with \`write-video-ad-script\`

Every video concept gets creative strategy, including silent formats. Fetch
**\`write-video-ad-script\`** through the skill catalogue and follow it before assembling
review ingredients. It reuses or fetches **\`ad-angle-miner\`**, binds the researched promise
to this template's full recipe, writes words and visuals together, and checks product
claims and production fit. Its independent critic is a quality screen, not a forecast
of ad performance. The existing Step 3 review and approval remain unchanged.

- **Carry the research into the writer.** Pass the brand and exact product, audience,
  objective, offer, CTA, selected template recipe, available assets and the full miner
  bank or its readable workspace pointer. A selected miner idea includes its angle id,
  evidence and proof plan, not only its hook. Reuse the shared video-angle-bank.v1 from
  the brand's video-scripts workspace or this run. Prepare angle-context.json with the
  writer's preparation script with \`--brief working/script/creative-brief.json\` and use
  its strict rule check before review. First run the fetched writer's free
  \`python3 <saved-writer-package>/scripts/verify_handoff.py --package-dir <saved-writer-package> --out working/script/writer-handoff-check.json\` check against those
  actual saved prepare/lint scripts. Retain the result and script hashes with the run.
  A provided writer package with a missing checker, failed check or unsupported flag
  is incompatible: stop this handoff and refresh the package on the same connection.
  Never use the provisional agent path after a provided package fails validation.
  Only an actual \`not_found\` for an optional writer permits the explicit provisional
  agent check below; a required writer remains blocked. Never silently remove the brief,
  strict check or new shape requirement to run an older parser.
  Save the sourced brief in the writer's documented
  shape: exact product/variant, buyer situation, supported mechanism, offer/CTA, constraints,
  delivery intent, source references, locked copy, applicable prior decisions and unknowns.
  New custom/template shapes set \`requires_creative_brief: true\`; both writer and critic
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
  returns \`not_found\`, complete an explicit agent check of claim support, recipe limits,
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

Fetch \`video-production-harness\` and read its \`references/editorial-review.md\`,
\`references/specialist-handoff.md\` and \`references/hook-compatibility.md\`, plus the
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
are unchanged. Fetch the existing \`render-hook-replacement\` before selecting that route;
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
render (GOOSE-2542). The full video is assembled ONLY in Step 4, after approval. A \`video\`
ingredient here is only a genuinely separate SOURCE clip the format needs (e.g. supplied b-roll).

1. **Assemble every piece the format needs — not just the script.** Read the recipe for the exact
   list. For a podcast skit that's the **script** (both hosts' lines), the two **host stills**,
   one **voice sample per host**, and the **end card**; an iMessage video has the bubble thread,
   the conversation image(s) and the end card. For each piece, decide FREE / CHEAP-paid /
   EXPENSIVE-paid (above):
   - **FREE or CHEAP paid** (≤ ~100 credits) → generate it now and upload it with
     \`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind, path:
     "working/review/<name>", ingredient_key, input_digest, source: { type: "file", filename:
     "<name>", content_type } }\` → PUT → \`media_confirm { brand_id, media_id: media.id }\`;
     after confirmation succeeds, set that
     piece's \`path\` (+ \`media_id\`, \`ingredient_key\`) in \`script_drafts\` to the project-relative
     \`working/review/<name>\`. First check "Save as you go" — a piece already saved with the same
     digest is downloaded, not regenerated.
   - **EXPENSIVE paid** → do NOT generate. Put the **exact prompt/spec** (and any ref image URLs)
     in the tile's \`text\` / \`subtitle\` so the user reviews what will be spent on. No \`path\` yet —
     it's generated in Step 4.
   Save **render_estimate.total_credits**: previews already spent + pending render + the 200 base fee.
   Use current server pricing, never a catalog range in place of the full total.
   **Brand check of the script, before it goes in the panel:** every line, caption and on-screen
   text is checked against \`working/brand-rules.json\`. Nothing in \`never_say\` appears, in words or
   in meaning (a paraphrase of a banned claim is still banned). Every product detail (name,
   flavour, size, price, ingredient, result) comes from \`products[]\` or the kit: anything else is
   cut, not invented. Add a \`note\` ingredient labelled "Brand rules applied" that lists the
   pronunciations used and the rules the script respects, so the user sees them.
   **Answer clarifying questions
   from the project brief FIRST (Step 1.5)** — only ask the user for a field (angle, which product,
   offer/code) the \`creative_brief\` leaves empty AND the recipe can't default. Do not re-ask for
   anything the composer already captured.
2. **Mirror the whole ingredient set for review** — \`video_project_upsert { brand_id, project_id,
   patch: { script: { script_drafts, script } } }\`. \`script_drafts\` is a structured payload of
   **container-tagged ingredients** so the app renders each piece the right way:
   \`{ format, scenes?, ingredients: [{ container, label, subtitle?, path?, url?, text? }], render_estimate? }\`.
   Each ingredient's \`container\` tells the app HOW to show it:
   - \`image\` (a frame shown in the video), \`endcard\` (the end card), \`avatar\` (a character
     headshot), \`background\` → rendered as an image tile.
   - \`voice\` (a voiceover clip — put the voice NAME in \`subtitle\`), \`music\` (the bed),
     \`audio\` → rendered as an audio player.
   - \`video\` (a clip) → a video player. \`text\` (a copy line like the CTA) → a text tile.
   - \`script\` / \`thread\` / \`note\` / \`conversation\` → the written script (or set \`scenes[]\`
     for the podcast shape, or pass the readable \`script\` string).
   **Label every ingredient** ("Hook image", "End card", "Voiceover", "Host A", "HER"). The upsert
   writes no render and costs no credits — it just populates the review panel.
3. **STOP for ONE approval, in this chat.** Only a complete current saved review set with
   render_estimate.total_credits can be approved. Widget: one line, no duplicate plan or app
   link; otherwise print card.text_summary. The choices are Approve, Change and Not now.
   “Not now” keeps the plan. In a coworker sandbox end the turn after saving the review set;
   the customer's approval arrives as the next message.
   Record the explicit yes with \`video_project_upsert { brand_id, project_id, patch: { approve:
   { user_quote: "<their exact words>", total_credits: <the saved total> } } }\` before rendering.
   A single project requires recorded approval too; never treat an absent approval as permission.
   Changes require an updated saved review, clearing prior approval, and approval of the new
   total. One yes authorizes the remaining approved chain. On insufficient_balance start
   nothing; offer a shorter video or top-up. Remove batch concepts with patch.concepts remove:true,
   then show the changed total before approval.

## Step 4 — render, report stages, publish

1. **Open the render row FIRST** — right after recording the Step 3 approval, before any paid
   generation (if this returns \`approval_required\`, the approval is missing or was cleared: go
   back to Step 3 and ask in this chat, don't retry):
   \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_OPEN_ARGS} }\` (no \`dry_run\`; returns
   \`render_id\`) → keep \`render_id\`, then mark it running:
   \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status: "running",
   workflow_stage: "preparing", progress_note: "starting", progress_percent: 5 } }\`. The user sees this
   live in the app and gets a WhatsApp "started" message automatically — don't message them yourself
   about start / blocked / complete.
After EVERY progress callback inspect stop. If true, start no new paid step; record
   status:"stopped" with a plain note and report what is kept and credits used. SPEND_CAP_REACHED
   stops the same way. Never raise a video's budget on your own judgment. Raise it only when a paid
   step was refused with SPEND_CAP_REACHED or the progress card offers "Finish it" or a choice past the budget.
   Then read the project and say cost.raise_quote in one line: "Finishing needs up to <by_credits>
   more credits, so your budget goes from <from_credits> to <to_credits>. OK?" Only after the
   customer's yes to that number: patch.approve { scope:"raise_cap", total_credits: <to_credits>,
   user_quote: "<their exact words>" }. total_credits is the new budget itself, never credits to
   add; do not send raise_cap_credits for one video. If they pick a smaller choice past the
   budget, send that choice's new budget as total_credits (never above to_credits). Sending the same
   total_credits again changes nothing (already_raised: carry on). An earlier yes, or "I don't care
   about the cost", is not approval of a new budget. If cost.raise_quote is null because the plan was saved
   again since its approval (plan_status is not "approved"), show the plan with its total and
   approve it again; otherwise the approved budget already covers the work: carry on, do not ask.
   After a raise, open a new render that reuses the saved pieces. A refused raise changes nothing:
   cap_raise_not_needed means carry on within the budget, or, when it says the plan was saved again,
   show the plan with its total and approve the plan again; cap_raise_total_required means read the
   project again and send total_credits equal to cost.raise_quote.to_credits after the customer
   approves that number; cap_raise_changed or cap_raise_too_large mean read the project again and
   show the current cost.raise_quote. Custom videos never use raise_cap.
   Send render.steps with the same neutral names each time and a live count only in the
   current detail; use render.choices when blocked.
2. Now generate every PAID piece you showed as a prompt in Step 3 — the AI stills/video, lipsync
   clips, voice, music — through the media proxies (below), each from its approved prompt, with
   \`GW_PROJECT_ID\` exported. **Save as you go** (section above): skip any piece already saved
   with the same \`input_digest\` (download it), and upload each new piece with its
   \`ingredient_key\` + \`input_digest\` the moment it passes QC.
   Keep the approved script and review unchanged throughout production and QC; confirmed media
   and progress preserve resume state. Stop and replan/reapprove any material creative change.
   A voiceover made with \`data_post_provider\` (ElevenLabs \`…/with-timestamps\`) returns its
   \`alignment\` only in the reply: write it to \`working/vo/<scene>.timestamps.json\` at once
   (captions are timed from it) and record the returned \`media_id\` on the ingredient.
   **Brand pronunciations in every voiceover:** the text sent to the voice has each
   \`pronunciations[].term\` replaced by its \`say_as\` (\`create-vo-elevenlabs\`:
   \`gen_vo.py … --rules working/brand-rules.json\`; when a render atom calls the voice itself,
   swap the terms in the text you hand it). Captions, on-screen text and the review keep the
   written name. Write \`working/approved-script.txt\` (the Step 4.3 audio check) with the SPOKEN
   form. **Logo, font, product:** every logo is the file from Step 1.7 composited as-is; every
   product shot uses the Step 1.7 product images as its reference.
   Then assemble per the recipe (ffmpeg stitch; PIL captions / end card;
   Playwright record only where the format needs it and the host has Chromium → \`mix-master\` audio).
   **Report progress at each milestone** — about one update per milestone, never per poll:
   \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status: "running", workflow_stage, progress_note, progress_percent } }\`
   (\`progress_note\` = plain words the customer reads in the app, ≤200 chars; no model, tool or
   step names):
   - voiceovers done → \`"preparing"\`, \`"voices recorded"\`, 20
   - stills done → \`"preparing"\`, \`"scenes designed"\`, 35
   - each lipsync / video clip → \`"rendering"\`, e.g. \`"filming scene 5 of 8"\`, 35–75
   - assembly → \`"rendering"\`, \`"putting the video together"\`, 85
   - QC (4.3) → \`"final check"\`, 95
   **Hard stop that needs the user** → \`{ render_id, status: "running", workflow_stage: "blocked",
   error_message: "<what's wrong + what you need>" }\`; an unrecoverable failure → \`status: "failed"\`
   + \`error_message\`. Completing (4.4) sets the bar to 100.
3. **MANDATORY final-video QC gate — YOU review EVERY finished master before pinning it
   (\`patch.final_render_id\`), whatever the format (UGC or not).** This is your own automated quality
   check, separate from the user's Step-3 approval — it does not go back to the user. The render row
   is already open (4.1); this gate stands between a rendered master and PINNING/publishing it, so a
   bad render never gets set as final. A master that looks fine on a still can still have a
   mis-voiced word, a caption drifting off its line, a beat out of order, or a deformation — review
   the actual VIDEO, not stills. Run the passes that APPLY to this format:
   - **Audio ↔ script** — any master with SPEECH (VO or native/Seedance voice); **skip for
     music-only / no-speech formats.** \`review-ugc-render\` is format-agnostic despite the name —
     a deterministic Whisper transcript-vs-script diff: persist the approved spoken lines to
     \`working/approved-script.txt\`, fetch \`review-ugc-render\` (\`catalog_fetch\`) and run
     \`review_render.py --video <master>.mp4 --script-file working/approved-script.txt --json
     working/review-verdict.json\` (exit 0 PASS / 2 FAIL / 3 ERROR). For each brand pronunciation add
     \`--brand-term "<term>"\`, plus \`--brand-term\` for each word of \`say_as\` that is not an
     everyday word (the flag strips those tokens from the WHOLE diff, so never pass "a", "one",
     "works" alone): Whisper spells a respelled name back as the brand word ("Goose Works" heard
     as "Gooseworks"), so the diff must accept it. The proof of
     intended delivery is the text/settings you sent (keep them in the review); actual
     pronunciation/performance requires isolated and mixed-audio listening at normal speed.
     Preserve pauses/emphasis and final consonants; never mandate faster or louder delivery.
     Verify a transcript mismatch against the actual audio before calling it a defect. It flags a mis-voiced word
     (approved "human-vetted" → "human witted"), a dropped phrase, or silence. It routes Whisper
     through the gooseworks proxy when \`OPENAI_BASE_URL\` is set (sandbox:
     \`$GW_WHISPER_PROXY_URL/v1\`); with no backend at all, run \`fal-ai/whisper\` via the FAL proxy
     and diff the transcript yourself.
   - **Captions / subtitles** — ANY captioned format (the most common non-UGC defect); **skip for
     UGC/Seedance masters, which carry no subtitle track.** Diff the caption file you burned
     (SRT/ASS/PNG cue list) against the SAME Whisper transcript + word timings — every caption line
     must match the heard/scripted words and sit within ~0.3s of when they're spoken; then in the
     visual pass below, inspect each cue and its start/end boundaries in actual frames, plus
     full-speed playback at destination size, to confirm reading time, product visibility,
     hierarchy and no duplicate overlay or end-card collision. Silent/text-led formats use
     approved visible wording and reading windows, not nonexistent speech timings. Mismatched text or >0.3s drift fails the gate.
   - **Visual + structure** — always: run the \`watch\` skill on the master — beat/scene order + SFX,
     the brand's product (not the source's) is shown, the end card has the brand's logo file (or its name set in the brand font) + code, no
     deformation/artifact, duration within ~20% of the source.
   - **Finished ad + brand fidelity** — always: fetch \`review-finished-ad\` (\`catalog_fetch\`,
     \`pip install --quiet numpy pillow\` if needed) and run
     \`review_finished_ad.py --video <master>.mp4 --json working/review/finished-ad.json
     --sheet working/review/finished-ad-sheet.png --logo <the logo file the video composites>
     --palette "<kit palette, comma-separated>" --product-images <the Step 1.7 images>
     --font <brand font file> --brand-name "<name>" --endcard-s <end card length>\`. Pass the
     file that is ACTUALLY on screen (the kit logo, or the recipe's wordmark file). When the video
     shows only the brand name as text (\`"logo": {"mode": "text"}\`), omit \`--logo\` and judge the
     text on the sheet. Add \`--no-speech\` for a format with no VO or dialogue, \`--logo-at <s>\` for
     each mid-video logo, and any gate flags the recipe's instructions name (a chat format's
     reading holds need a longer \`--max-freeze-s\`). Exit 0 PASS / 2 FAIL / 3 ERROR. It
     checks size, hook, pacing, dead air, black frames, the kit logo on the end card
     (a wrong, redrawn or favicon logo fails) and the palette. **Then open the sheet it writes
     and judge every line of its \`judge_on_sheet\`:** captions/CTA/logo outside the red safe
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
   \`video_render_run { brand_id, project_id, render: { render_id, status: "complete",
   workflow_stage: "blocked", quality_status: "blocked", repair_pass_count: 2, output_url,
   thumbnail_url, quality_report } }\` (the failing checks as \`fail\` in the report), and tell the user plainly in
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
   Publish: \`media_upload { brand_id, scope: "video_project", scope_id: project_id, kind: "render",
   path: "working/final.mp4", ingredient_key: "final", input_digest, source: { type: "file", filename: "final.mp4", content_type:
   "video/mp4" } }\` → PUT the master to \`upload.url\` with \`upload.required_headers\` →
   \`media_confirm { brand_id, media_id: media.id }\`. Same for the poster (\`kind: "thumbnail"\`, \`path: "working/final-thumb.jpg"\`, \`ingredient_key: "final-thumb"\`).
   Keep each \`upload.render_file_url\`. Verify the PUT returned 2xx and the file you uploaded is a
   real, non-empty MP4 (ffprobe it), and require both confirmations to succeed BEFORE marking
   the render complete.
   Then \`${RENDER_ROW_TOOL} { brand_id, project_id, ${RENDER_UPDATE_KEY}: { render_id, status: "complete", output_url, thumbnail_url } }\` (attach the Step 4.3 verdict as \`quality_status: "passed"\` (or
   \`"blocked"\` when the gate still fails after 2 repair rounds) + \`quality_report\` — ALWAYS
   attach it; a batch concept cannot complete without a passing one; exact shape, strict (no extra keys):
   \`{ version: 1, summary: string, checks: { source, brand, product, hook_and_scene_order,
   voice_and_script, captions, endcard_and_cta, duration_and_ratio, visual_artifacts }, detected_issues?:
   string[], repair_actions?: string[] }\` where EVERY check is \`{ status: "pass"|"fail"|"not_applicable",
   note?: string }\`). Fill each check from the Step 4.3 passes: \`brand\` ← logo_asset + logo +
   palette + font + logo unaltered; \`product\` ← product likeness + product consistency;
   \`hook_and_scene_order\` ← hook + pacing + the \`watch\` beat order; \`voice_and_script\` ← the
   Whisper diff (pronunciations included) + no \`never_say\` line; \`captions\` ← the caption diff +
   safe zones; \`duration_and_ratio\` ← ratio + duration; \`visual_artifacts\` ← black frames +
   frozen stretches + the \`watch\` pass; \`endcard_and_cta\` ← the end card holds the real logo +
   CTA. Put each failing check's note in \`detected_issues\` and each fix in \`repair_actions\`.
   **output_url MUST be the durable render-file URL**
   (\`upload.render_file_url\`, i.e. \`/api/ads/projects/<project_id>/render-file?path=working/final.mp4\`
   — the app re-presigns it on every view) — NEVER a raw proxy/CDN/presigned URL (those expire).
   Same for \`thumbnail_url\`.
5. **Save the final review set BEFORE pinning** — it must describe the video you actually rendered.
   Only after all paid production, QC, repairs and pending provider work are finished and settled,
   save one final descriptive/provenance update: confirmed pieces, exact settings and repairs that
   preserve the approved creative choices. Material creative changes, including changed lines,
   look, timing, captions or music, require a changed complete plan, total and fresh approval BEFORE
   the changed production. Never relabel a changed plan as provenance or silently reuse approval.
   In the checkpoint flow, save the final review before Step 4.4; do not rewrite it afterward merely
   to follow the numbered order. Resume checks that this reviewed set stayed unchanged.
   When final provenance needs updating, upsert the review set once:
   \`video_project_upsert { brand_id, project_id, patch: { script: {
   script_drafts, script } } }\` with the final lines, final pieces (mark generated takes as done, not
   "not generated yet") and the settings you used. The project keeps this, not your chat: it is
   what the app shows, and what a Community remix of this video copies. Instructions that live only
   in this conversation are lost when it ends. **Keep the approved detail**: never shorten a piece to a
   summary (e.g. per-scene prompts or their "no shake / no letterbox" guards). Only update what changed.
   After this write, do not start new paid work. Save the production manifest, prepare the final
   checkpoint and complete the same render with its existing finishing allowance and guards.
6. **Save the production manifest** — HOW you made it, so the next run (or a remix) starts from what
   worked instead of rediscovering it: \`video_project_upsert { brand_id, project_id, patch: { production:
   { version: 1, pipeline: [{ step, model, purpose?, settings? }], style: { prompt, negative, notes? },
   characters: [{ name, prompt }], scenes: [{ id, line, still_prompt, motion_prompt, duration_s }],
   voice: { voice_id, name, model, settings }, music: { prompt, model, length_s }, assembly: { … },
   fixes: [{ problem, fix }], notes? } } }\`. Use the exact models and prompts you sent (full text, guards
   included), and list every fix you had to make (e.g. "VO ran 47s → tightened four lines, voice 1.08x";
   "hair drifted → restated the hair colour"). No URLs, keys or raw logs; it must stay under 48 KB.
   In the checkpoint flow, save this before Step 4.4 too and skip the duplicate write afterward.
7. Pin it — only a \`passed\` render (or a \`blocked\` one the user said to use anyway):
   If checkpoint recovery already verified selection of this render, skip this duplicate write.
   An unfinished checkpoint must use the guarded selection protocol above; never replace it
   with an unguarded pin.
   \`video_project_upsert { brand_id, project_id, patch: { final_render_id: render_id } }\`,
   then use the returned card: widget hosts get one line and no duplicate links; text hosts get
   card.text_summary and the returned delivery links verbatim. Never end with a local file path.

Narrate each long step in one line via \`video_project_upsert { brand_id, project_id, patch:
{ message: { role: "agent", content } } }\` — never sit silent on a queue > 90s. Write it for the
customer ("Filming the scenes, about 5 more minutes"), per "How to talk to the customer" above.

## Media generation — the GooseWorks proxies (queue loop)

Media APIs go through GooseWorks proxies; do NOT use an SDK's default host (your token isn't a
FAL/ElevenLabs token → 401, and in a sandbox a raw provider call is never allowed). Prefer the
atoms' own \`media_proxy.py\` (\`fal_generate\`, \`fal_generate_video\`, \`eleven_music\`, …) — it already
handles auth, the queue host-swap, project attribution (\`GW_PROJECT_ID\`) and failure logging.

- **Sandbox:** FAL base = \`$GW_FAL_PROXY_URL\`, ElevenLabs = \`$GW_ELEVENLABS_PROXY_URL\`, FAL
  storage = \`$GW_FAL_STORAGE_PROXY_URL\`; auth = \`?token=$GW_MEDIA_PROXY_TOKEN\` (or
  \`Authorization: Bearer\`), plus \`&project_id=$GW_PROJECT_ID\`. The token already names the agent.
- **Local:** base = \`<api_base>/api/internal/<proxy>\` (\`fal-proxy\`, \`fal-storage-proxy\`,
  \`elevenlabs-proxy\`); pass \`?token=<api_key>&agent_id=<agent_id>&project_id=<project_id>\`
  (agent_id bills the Ads agent; project_id attributes the spend to this ad project so the user
  sees per-project spend in the app. ALWAYS pass it).

**FAL queue gotcha** (#1 waste of generations): submit returns \`status_url\`/\`response_url\` on
\`queue.fal.run\` (the real host, not the proxy). Polling those 401s forever — rewrite their host
to the proxy base (keep the path), re-add the auth params. Only the final \`*.fal.media\`
file is a real public URL. Helper (works in both modes):

\`\`\`python
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
\`\`\`

ElevenLabs (VO / music) is the same shape against the ElevenLabs proxy base. To feed FAL a local
file (a product image, a VO track), it must be a PUBLIC URL: upload it with \`media_upload\`
(\`scope: "video_project"\`, source \`file\`, no \`path\`) → PUT → \`media_confirm\` and use the returned
\`media.url\` if it is a public https URL (curl it: HTTP 200 without auth), or host it through the
FAL storage proxy. Never pass a \`render-file\` URL to a provider — it needs app auth.

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

- **Canonical MCP tools first** (\`video_project_read\`, \`video_project_upsert\`, \`catalog_fetch\`,
  \`media_upload\` + \`media_confirm\`, the \`video_render_run\` render-row actions, \`account_whoami\`);
  legacy names only when the client lacks the canonical tool.
- **A missing key is never a blocker.** Paid media goes through the proxy: a one-off image or clip
  is \`data_post_provider { provider: "fal", … }\` + \`job_get\` (see "Paid media over the MCP");
  never ask for FAL_KEY, never use \`photos_generate\` for anything but a physical product.
- **The CLI and credentials.json are optional.** In a GooseWorks sandbox (\`GW_MEDIA_PROXY_TOKEN\`
  set) use the env proxies and \`catalog_fetch\`; never call a provider with a raw key.
- **No Chromium in a sandbox** — a browser-rendered format stops there, before any spend, and says so.
- **Toolchain before spend** — common checks use \`gooseworks doctor --no-browser\`; every selected
  browser renderer must also pass \`--renderer-script\` or its equivalent exact-runtime launch
  check in Step 2. Stop with the folder-specific fix if anything is missing.
- **Assemble the whole review set first**, mirror it with \`video_project_upsert patch.script\`, and
  get ONE approval in this chat, recorded with \`patch.approve\`, BEFORE the expensive render
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
  progress current; mark it \`complete\` only after the master passes QC. \`output_url\` = the
  durable render-file URL, never a CDN URL.
- **Always export \`GW_PROJECT_ID\`** (and pass \`project_id\` on hand-rolled proxy calls) so the
  credits attribute to this ad project.
- **Verify a real, non-empty MP4** (watch it) before marking the render complete.
- **Reuse the brand** when its research is complete; never re-research.
- **Brand rules first:** load kit + products + learnings (Step 1), write \`working/brand-rules.json\`
  (Step 1.7), and follow it: pronunciations in every voiceover, nothing from \`never_say\`, product
  facts only from the product rows, the kit's logo FILE (never a generated or favicon logo), the
  brand font, this product's own images.
- **Save brand corrections** from chat with \`brand_update patch.facts\` in the same turn, and say so.
- **Finished-ad gate on every master** (\`review-finished-ad\` + the sheet); at most 2 repair
  rounds, then publish as \`blocked\` with the report and warn the user — never pass off a failing
  video as finished.
- On a hard error (auth/quota/model/timeout) set the render \`failed\` with a short
  \`error_message\` (\`${RENDER_ROW_TOOL} { …, ${RENDER_UPDATE_KEY}: { render_id, status: "failed", error_message } }\`) and stop — don't ship the source unchanged. **Also log
  it** (see "Report problems") so we can see + fix it.
- Finish according to card.display_hint: widget hosts get one short line without duplicate links;
  text hosts get card.text_summary and the returned delivery links verbatim.
${STORED_FOOTAGE_GUIDANCE}`;
}


/**
 * Returns the goose-product-photos entry SKILL.md content.
 *
 * GOOSE-3190: this skill already existed on disk (`skills/goose-product-photos/
 * SKILL.md`, hand-maintained) and was already served by the backend to hosted
 * connectors — but it was NOT in `getEntrySkills()`, so `npm run generate:skills`
 * never regenerated it and `install` / `update` / login-refresh never wrote or
 * refreshed it on a user's machine. Moving the body here makes the registry the
 * one source: one command emits all four entry skills.
 *
 * QA-26 / VWR14: chat apps fetch it with `catalog_fetch`, so it names only the
 * tools the connector lists (`photos_generate` / `photos_read` / `photos_update`,
 * `brand_read`, `brand_update`, `job_get`).
 */
export function getGooseProductPhotosSkillContent(): string {
  return `---
name: goose-product-photos
slug: goose-product-photos
description: >
  GooseWorks Product Photos — turn a brand's product images into publish-ready photography
  (clean studio shots, lifestyle scenes, on-model looks) while keeping the product faithful
  (silhouette, materials, logo, colorway). You pick a brand + product and submit; the GooseWorks
  backend runs the SAME server-side pipeline the Product Photos studio uses (compose → generate →
  judge → auto-retry) and bills credits. Use when the user says "make product photos", "shoot my
  product", "studio/lifestyle/on-model photo of <product>", "generate product photography", or
  references a product to photograph. Unlike goose-ads (ad creative) this produces clean PRODUCT
  photos that can then feed the ad workflow.
category: ads
version: 0.3.0
author: GooseWorks
tags: [gooseworks, ads, product-photos, photoshoot, product, ecommerce, studio, lifestyle, on-model]
---

# GooseWorks Product Photos — branded product photography

The GooseWorks Product Photos skill. You **pick a brand + product and submit one generation**;
the **backend** runs the whole pipeline (compose the shot prompt → generate → judge for product
fidelity → auto-retry a few times for free) and stores the results. You do NOT
generate images, call a model, or manage files — this is the exact same workflow the Product
Photos studio uses, so the skill and the app can never drift. The point is to **enrich a brand's
usable product imagery** — approved photos join the brand kit and can then feed the ad workflow
(\`goose-ads\`).

It shoots a **physical catalog product** (apparel, beauty, consumer goods). A software
screenshot or an app mockup is not a product photo: that is an image edit, not this skill.

${CUSTOMER_TALK}

${connectorPrerequisite('photos_generate')}

## Start from the brand context — don't re-ask what it already answers

If the \`gooseworks\` router handed you brand context, USE IT. If you were invoked directly, call
\`brand_read { brand_id, sections: ["summary","kit","products","learnings"] }\` yourself first, then
\`knowledge_search { brand_id, query: "<the shoot, in the user's words>" }\` for saved rules and past
feedback (an archived photo's reason is saved as a \`dont\` rule). They answer most of the setup
questions below, so **do not ask the user for them**:

- **Which product?** — the context's \`products\` are the real catalog entries. Offer them; never
  invent a product or ask the user to describe one you can already see.
- **What does it look like / what is it made of?** — grounded in the product's stored images and
  description. Never guess a material, colorway, or silhouette.
- **What vibe / who is it for?** — the context's voice, positioning, and audience already say. Let
  them shape the scene and styling instead of asking "what mood do you want?".
- **Brand look** — logo, colors, and fonts are owned by the backend research pass. Read them, never
  re-derive them.

Ask only for the genuinely open choices: the shot \`category\`, how many photos, quality, and
whether a human model is wanted (which needs explicit consent — see the rules).

## Credits — state the total, then get a yes

- One token authenticates the tools and resolves your org; never print it. Omit \`target\`.
- **Quote first.** Call \`photos_generate\` with the exact arguments you will submit plus
  \`dry_run: true\`. It reserves nothing and returns \`creditsPerOutput\` and \`totalCredits\`. Pass
  \`count\` and \`quality\` explicitly in both calls so the quote matches the run.
- **Nothing paid runs without the user's explicit yes in this chat, given after you state that
  credit total.** Then submit the same call without \`dry_run\`.
- The submit reserves the quoted credits and bills only the photos that pass the judge:
  **automatic retries are free**, and a photo the judge can't get right (\`flagged\`) is shown but
  **never billed**. The balance is \`credits.available_credits\` from \`account_whoami\`. If the
  wallet is short, say so plainly with the total and the balance, and stop.

## The tools

**Pick the brand + product**
- \`brand_read\` with no \`brand_id\` — the user's brands (each row's \`id\` is the \`brand_id\`).
- \`brand_read { brand_id, sections: ["products"], products_query: "<name>" }\` — the brand's
  imported products in \`products.items\`; a product's \`id\` is the \`product_id\` to shoot.
  \`products_query\` matches name / type / variant / SKU / description.
- Import a product that isn't in the catalog yet (free):
  \`brand_update { brand_id, patch: { products: [{ import_url, import_kind, name? }] } }\`.
  \`import_kind\` is \`product_url\` (a single product page), \`shopify_store\` (a store URL → imports
  the catalog), or \`image_url\` (a direct image; also needs \`name\`). It returns \`jobs[]\`: poll
  \`job_get { job_id, kind: "product_import" }\` until it finishes, then read the products again.
  To add a photo the user attached to an existing product:
  \`media_upload { brand_id, scope: "product", scope_id: <product_id>, kind: "reference", source: { type: "bytes", filename, content_base64 } }\`.

**Generate**
- \`photos_generate { brand_id, product_id, variant_id?, category, controls?, prompt?, count,
  quality, reference_image_urls?, attestation_accepted?, dry_run? }\` — **the one call that makes
  photos** (and, with \`dry_run: true\`, its free quote). \`category\` is \`apparel\` | \`beauty\` |
  \`cpg\` (seeds sensible scene/framing defaults). \`count\` is 1, 2, 4, or 8; \`quality\` is
  \`low\` | \`medium\` | \`high\`. Omit \`controls\` to use the category preset; pass \`prompt\` as
  free-text steering **added on top of** the settings (it doesn't replace them). Returns the
  generation with its \`id\` **immediately**.
  **If you request a human model** (\`controls.model.presence\` is not \`none\`) you MUST pass
  \`attestation_accepted: true\` to confirm the user has the rights for model imagery.
- \`photos_read { brand_id, generation_id }\` — poll until \`status\` is \`complete\`,
  \`partial_failure\`, or \`failed\` (\`job_get { job_id: <generation id>, kind: "photo_generation" }\`
  works too). Each \`outputs[]\` entry has its own \`id\`, \`status\` and, once ready, a
  \`final_image_url\`. A \`flagged\` output is the best attempt but wasn't billed.

**Use the results**
- \`photos_read { brand_id, archived?, product_id?, status? }\` — the brand's generated photos
  (\`archived: false\` = active, \`true\` = archived).
- \`photos_update { brand_id, output_id, action: "approve" }\` — approve a photo: links it to the
  product and makes it available in the **brand kit**, so \`goose-ads\` can use it. **Photos are
  not used anywhere until approved.**
- \`photos_update { brand_id, output_id, action: "archive", reason? }\` — archive a photo; archived
  photos are **excluded** from ad generation, and the reason is saved as a \`dont\` rule.

## Workflow — shoot a product

1. **Load the brand context** (\`brand_read\` + \`knowledge_search\`, or reuse what the router passed
   you) and **resolve the brand + product.** Pick a \`product_id\` from the catalog you already
   know about. If the product genuinely isn't there, import it and poll the import.
2. **Quote the cost.** \`photos_generate\` with \`dry_run: true\` and the exact \`brand_id\`,
   \`product_id\`, \`category\`, \`count\` and \`quality\` → tell the user the credit total and wait
   for their explicit yes.
3. **Generate.** The same \`photos_generate\` call without \`dry_run\` (add \`prompt\` built from the
   brand's voice/positioning you already have — don't interview the user for it). Returns a
   generation \`id\` right away.
4. **Poll.** \`photos_read { brand_id, generation_id }\` every ~20-30s until terminal; show each
   \`final_image_url\`.
5. **Approve the keepers.** Show the results and let the user pick; \`photos_update\` with
   \`action: "approve"\` the ones they'd publish (that's what puts them in the brand kit for ads),
   \`action: "archive"\` the rest.

## Rules

- **Connector tools only** — a missing tool means the GooseWorks connection is stale: ask the
  user to reconnect or refresh GooseWorks. Never send a chat-app user to a terminal or a CLI
  install.
- **Never invent product facts.** The backend grounds the shot on the product's real images; don't
  describe a product you can't see.
- **Use the brand context instead of interviewing the user.** Product, audience, voice, positioning,
  logo/colors/fonts all come from \`brand_read\` / the brand kit. Ask only for the shot
  category, count, quality, and model consent.
- **Ask before spending.** State the dry-run credit total and get the user's explicit yes before
  the real \`photos_generate\` — it reserves credits.
- **Poll, don't re-submit.** A generation that's still \`running\` is not stuck; re-submitting
  double-bills. A \`failed\` generation may still hold \`flagged\` photos (shown, never billed):
  show those first, and run again only after a new quote and the user's yes.
- **Model imagery needs consent.** Only set a human model when the user asks, and pass
  \`attestation_accepted: true\`.
- **Approval is the hand-off to ads.** Remind the user that only **approved** photos reach the brand
  kit / ad workflow; archived ones never do.
`;
}

/** Thin GooseWorks connection to the catalog-published production harness. */
export function getMakeCustomVideoSkillContent(): string {
  return CUSTOM_VIDEO_ADAPTER_CONTENT.replace("\n# Agent version\n", `\n# Agent version\n\n${CUSTOMER_TALK}\n\n${videoEntryPreparation('make-custom-video')}\n\n${ENVIRONMENT_IDENTITY}\n\n${ASSET_READINESS}\n`) + STORED_FOOTAGE_GUIDANCE;
}
