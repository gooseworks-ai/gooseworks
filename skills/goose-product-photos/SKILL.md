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
version: 0.2.0
author: GooseWorks
tags: [gooseworks, ads, product-photos, photoshoot, product, ecommerce, studio, lifestyle, on-model]
---

# GooseWorks Product Photos — branded product photography

The GooseWorks Product Photos skill. You **pick a brand + product and submit one generation**;
the **backend** runs the whole pipeline (compose the shot prompt → generate on `gpt_image_2` →
judge for product fidelity → auto-retry a few times for free) and stores the results. You do NOT
generate images, call a model, or manage files — this is the exact same workflow the Product
Photos studio uses, so the skill and the app can never drift. The point is to **enrich a brand's
usable product imagery** — approved photos join the brand kit and can then feed the ad workflow
(`goose-ads`).

## Prerequisite — the GooseWorks MCP server is REQUIRED

Everything goes through the `mcp__gooseworks__*` tools. If they are not available, **stop and
tell the user to run `gooseworks install --claude --mcp`** (and restart Claude Code). There is no
HTTP/file fallback.

## Start from the brand context — don't re-ask what it already answers

If the `gooseworks` router handed you brand context, USE IT. If you were invoked directly, call
`brand_get_context` yourself first. It answers most of the setup questions below, so **do not ask
the user for them**:

- **Which product?** — the context's `products[]` are the real catalog entries. Offer them; never
  invent a product or ask the user to describe one you can already see.
- **What does it look like / what is it made of?** — grounded in the product's stored images and
  description. Never guess a material, colorway, or silhouette.
- **What vibe / who is it for?** — the context's voice, positioning, and audience already say. Let
  them shape the scene and styling instead of asking "what mood do you want?".
- **Brand look** — logo, colors, and fonts are owned by the backend research pass. Read them, never
  re-derive them.

Ask only for the genuinely open choices: the shot `category`, how many photos, quality, and
whether a human model is wanted (which needs explicit consent — see the rules).

## Identity & credits

- One agent-scoped token authenticates the tools; they resolve your org automatically. Never
  print the token. (You may pass an optional `target` to operate on a specific agent/org, exactly
  as the other GooseWorks tools; omit it to use your pinned scope.)
- **Credits are handled by the backend.** `photos_generate` reserves the estimated cost up
  front and bills only the photos that pass the judge — **automatic retries are free**, and a photo
  the judge can't get right (`flagged`) is shown but **never billed**. Call
  `photos_generate { dry_run: true }` first to quote the cost; `account_whoami` shows the balance.

## The tools

**Pick the brand + product**
- `brand_list` — the user's ad brands (get a `brand_id`; also carries `slug`).
- `brand_get_context { brand_id, search?, page?, page_size? }` — the brand's imported products.
  Pick a `product_id` to shoot. `search` matches name / type / variant / SKU.
- `import_product { brand_id, kind, url, product_name? }` — import a product if it isn't in the
  catalog yet. `kind` is `product_url` (a single product page), `shopify_store` (a store URL →
  imports the catalog), or `image_url` (a direct image; requires `product_name`). Returns an import
  row with an `id`; if its `status` isn't `complete`, poll `get_product_import` until it is, then
  `brand_get_context` to find the new product. (File uploads aren't available over MCP — use a URL.)
- `get_product_import { import_id }` — poll an import until `status` is `complete` or `failed`.

**Generate**
- `photos_generate { count, quality?, dry_run: true }` — cost preview (per-photo + total credits). `count`
  is 1, 2, 4, or 8; `quality` is `low` | `medium` | `high` (default `medium`). Reserves nothing.
- `photos_generate { brand_id, product_id, variant_id?, category, controls?, prompt?,
  count?, quality?, reference_image_urls?, attestation_accepted? }` — **the one call that makes
  photos.** `category` is `apparel` | `beauty` | `cpg` (seeds sensible scene/framing defaults).
  Omit `controls` to use the category preset; pass `prompt` as free-text steering **added on top of**
  the settings (it doesn't replace them). Returns a generation with an `id` **immediately** — poll
  `photos_get` until done, then read each `outputs[].final_image_url`.
  **If you request a human model** (`controls.model.presence` is not `none`) you MUST pass
  `attestation_accepted: true` to confirm the user has the rights for model imagery.
- `photos_get { generation_id }` — poll until `status` is `complete`,
  `partial_failure`, or `failed`. Each `outputs[]` entry has its own `status` and, once ready, a
  `final_image_url`. A `flagged` output is the best attempt but wasn't billed.

**Use the results**
- `photos_list { brand_id, archived? }` — the brand's generated photos (`archived: false`
  = active, `true` = archived).
- `photos_update { output_id }` — approve a photo: links it to the product and makes it
  available in the **brand kit**, so `goose-ads` can use it. **Photos are not used anywhere until
  approved.**
- `photos_update { output_id, reason? }` — archive a photo; archived photos are **excluded**
  from ad generation.

## Workflow — shoot a product

1. **Load the brand context** (`brand_get_context`, or reuse what the router passed you) and
   **resolve the brand + product.** `brand_list` → `brand_id`. `brand_get_context` → pick a
   `product_id` from the catalog you already know about. If the product genuinely isn't there,
   `import_product` (poll `get_product_import`).
2. **Quote the cost.** `photos_generate { count, quality, dry_run: true }` → tell the user credits.
3. **Generate.** `photos_generate { brand_id, product_id, category, count, quality, prompt? }`.
   Build `prompt` from the brand's voice/positioning you already have — don't interview the user for it.
   Returns a generation `id` right away.
4. **Poll.** `photos_get { generation_id }` until terminal; hand back each
   `final_image_url`.
5. **Approve the keepers.** Show the results and let the user pick; `photos_update` the ones
   they'd publish (that's what puts them in the brand kit for ads), `photos_update` the rest.

## Rules

- **Never invent product facts.** The backend grounds the shot on the product's real images; don't
  describe a product you can't see.
- **Use the brand context instead of interviewing the user.** Product, audience, voice, positioning,
  logo/colors/fonts all come from `brand_get_context` / the brand kit. Ask only for the shot
  category, count, quality, and model consent.
- **Ask before spending.** Quote the estimate and confirm `count` / `quality` before
  `photos_generate` — it reserves credits.
- **Poll, don't re-submit.** A generation that's still `running` is not stuck; re-submitting
  double-bills. Only a `failed` generation should be retried.
- **Model imagery needs consent.** Only set a human model when the user asks, and pass
  `attestation_accepted: true`.
- **Approval is the hand-off to ads.** Remind the user that only **approved** photos reach the brand
  kit / ad workflow; archived ones never do.
