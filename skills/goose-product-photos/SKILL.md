---
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
(`goose-ads`).

It shoots a **physical catalog product** (apparel, beauty, consumer goods). A software
screenshot or an app mockup is not a product photo: that is an image edit, not this skill.

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
`mcp__gooseworks__photos_generate`), a chat app may not.

If a tool named here is missing, the GooseWorks connection or its tool list is stale: ask the
user to reconnect or refresh GooseWorks in their app's connector settings. Installing or
updating the `gooseworks` CLI never fixes a missing connector tool, so never send a chat-app
user to a terminal for it. Only a terminal coding agent (Claude Code, Codex, Cursor) that has no
GooseWorks tools at all connects them, in that terminal, with `gooseworks install --mcp` plus
`--claude`, `--codex` or `--cursor`, then a restart.

Older notes or skill copies may name tools the connector no longer lists. Use the tool this skill
names instead; `catalog_fetch { type: "skill", slug: "gooseworks-guide" }` maps every old name.

## Start from the brand context — don't re-ask what it already answers

If the `gooseworks` router handed you brand context, USE IT. If you were invoked directly, call
`brand_read { brand_id, sections: ["summary","kit","products","learnings"] }` yourself first, then
`knowledge_search { brand_id, query: "<the shoot, in the user's words>" }` for saved rules and past
feedback (an archived photo's reason is saved as a `dont` rule). They answer most of the setup
questions below, so **do not ask the user for them**:

- **Which product?** — the context's `products` are the real catalog entries. Offer them; never
  invent a product or ask the user to describe one you can already see.
- **What does it look like / what is it made of?** — grounded in the product's stored images and
  description. Never guess a material, colorway, or silhouette.
- **What vibe / who is it for?** — the context's voice, positioning, and audience already say. Let
  them shape the scene and styling instead of asking "what mood do you want?".
- **Brand look** — logo, colors, and fonts are owned by the backend research pass. Read them, never
  re-derive them.

Ask only for the genuinely open choices: the shot `category`, how many photos, quality, and
whether a human model is wanted (which needs explicit consent — see the rules).

## Credits — state the total, then get a yes

- One token authenticates the tools and resolves your org; never print it. Omit `target`.
- **Quote first.** Call `photos_generate` with the exact arguments you will submit plus
  `dry_run: true`. It reserves nothing and returns `creditsPerOutput` and `totalCredits`. Pass
  `count` and `quality` explicitly in both calls so the quote matches the run.
- **Nothing paid runs without the user's explicit yes in this chat, given after you state that
  credit total.** Then submit the same call without `dry_run`.
- The submit reserves the quoted credits and bills only the photos that pass the judge:
  **automatic retries are free**, and a photo the judge can't get right (`flagged`) is shown but
  **never billed**. The balance is `credits.available_credits` from `account_whoami`. If the
  wallet is short, say so plainly with the total and the balance, and stop.

## The tools

**Pick the brand + product**
- `brand_read` with no `brand_id` — the user's brands (each row's `id` is the `brand_id`).
- `brand_read { brand_id, sections: ["products"], products_query: "<name>" }` — the brand's
  imported products in `products.items`; a product's `id` is the `product_id` to shoot.
  `products_query` matches name / type / variant / SKU / description.
- Import a product that isn't in the catalog yet (free):
  `brand_update { brand_id, patch: { products: [{ import_url, import_kind, name? }] } }`.
  `import_kind` is `product_url` (a single product page), `shopify_store` (a store URL → imports
  the catalog), or `image_url` (a direct image; also needs `name`). It returns `jobs[]`: poll
  `job_get { job_id, kind: "product_import" }` until it finishes, then read the products again.
  To add a photo the user attached to an existing product:
  `media_upload { brand_id, scope: "product", scope_id: <product_id>, kind: "reference", source: { type: "bytes", filename, content_base64 } }`.

**Generate**
- `photos_generate { brand_id, product_id, variant_id?, category, controls?, prompt?, count,
  quality, reference_image_urls?, attestation_accepted?, dry_run? }` — **the one call that makes
  photos** (and, with `dry_run: true`, its free quote). `category` is `apparel` | `beauty` |
  `cpg` (seeds sensible scene/framing defaults). `count` is 1, 2, 4, or 8; `quality` is
  `low` | `medium` | `high`. Omit `controls` to use the category preset; pass `prompt` as
  free-text steering **added on top of** the settings (it doesn't replace them). Returns the
  generation with its `id` **immediately**.
  **If you request a human model** (`controls.model.presence` is not `none`) you MUST pass
  `attestation_accepted: true` to confirm the user has the rights for model imagery.
- `photos_read { brand_id, generation_id }` — poll until `status` is `complete`,
  `partial_failure`, or `failed` (`job_get { job_id: <generation id>, kind: "photo_generation" }`
  works too). Each `outputs[]` entry has its own `id`, `status` and, once ready, a
  `final_image_url`. A `flagged` output is the best attempt but wasn't billed.

**Use the results**
- `photos_read { brand_id, archived?, product_id?, status? }` — the brand's generated photos
  (`archived: false` = active, `true` = archived).
- `photos_update { brand_id, output_id, action: "approve" }` — approve a photo: links it to the
  product and makes it available in the **brand kit**, so `goose-ads` can use it. **Photos are
  not used anywhere until approved.**
- `photos_update { brand_id, output_id, action: "archive", reason? }` — archive a photo; archived
  photos are **excluded** from ad generation, and the reason is saved as a `dont` rule.

## Workflow — shoot a product

1. **Load the brand context** (`brand_read` + `knowledge_search`, or reuse what the router passed
   you) and **resolve the brand + product.** Pick a `product_id` from the catalog you already
   know about. If the product genuinely isn't there, import it and poll the import.
2. **Quote the cost.** `photos_generate` with `dry_run: true` and the exact `brand_id`,
   `product_id`, `category`, `count` and `quality` → tell the user the credit total and wait
   for their explicit yes.
3. **Generate.** The same `photos_generate` call without `dry_run` (add `prompt` built from the
   brand's voice/positioning you already have — don't interview the user for it). Returns a
   generation `id` right away.
4. **Poll.** `photos_read { brand_id, generation_id }` every ~20-30s until terminal; show each
   `final_image_url`.
5. **Approve the keepers.** Show the results and let the user pick; `photos_update` with
   `action: "approve"` the ones they'd publish (that's what puts them in the brand kit for ads),
   `action: "archive"` the rest.

## Rules

- **Connector tools only** — a missing tool means the GooseWorks connection is stale: ask the
  user to reconnect or refresh GooseWorks. Never send a chat-app user to a terminal or a CLI
  install.
- **Never invent product facts.** The backend grounds the shot on the product's real images; don't
  describe a product you can't see.
- **Use the brand context instead of interviewing the user.** Product, audience, voice, positioning,
  logo/colors/fonts all come from `brand_read` / the brand kit. Ask only for the shot
  category, count, quality, and model consent.
- **Ask before spending.** State the dry-run credit total and get the user's explicit yes before
  the real `photos_generate` — it reserves credits.
- **Poll, don't re-submit.** A generation that's still `running` is not stuck; re-submitting
  double-bills. A `failed` generation may still hold `flagged` photos (shown, never billed):
  show those first, and run again only after a new quote and the user's yes.
- **Model imagery needs consent.** Only set a human model when the user asks, and pass
  `attestation_accepted: true`.
- **Approval is the hand-off to ads.** Remind the user that only **approved** photos reach the brand
  kit / ad workflow; archived ones never do.
