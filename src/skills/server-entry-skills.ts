// The entry skill text our server builds, copied here because the CLI
// cannot import gooseworks-app. Do not edit by hand.
//
// Source: gooseworks-app codex/reference-first-video @ 9372e1ee477b11828806030ac3550dfee1ba676f
//   apps/api/src/services/playbooks/entry-skill.ts      buildVideoEntrySkill(slug)
//   apps/api/src/app-mcp-server/lib/video-policy.ts     renderEntrySkillRules(product)
//
// The video entry skills are the server's whole SKILL.md. The rules blocks are
// the rulebook's entry-skill rules for the skills the CLI writes itself
// (gooseworks, goose-ads, goose-product-photos), so no skill restates a rule
// by hand. tests/skills/server-entry-skills.test.ts checks this file against
// tests/fixtures/server-entry-skills.json, and that fixture against a
// gooseworks-app checkout when GOOSEWORKS_APP_DIR points at one.

/** The rulebook version this text was built from. */
export const SERVER_RULEBOOK_VERSION = '1.3.0';

export const SERVER_VIDEO_ENTRY_SKILLS = {
  'goose-video': `---
name: goose-video
description: "Make a video ad in this chat. Study a supplied video reference before comparing styles; follow the next_step in every answer."
version: 4.4.2
---

# GooseWorks video

From an installed entry, first catalog_fetch type skill goose-video on this same connection and follow that body. An entry already fetched in this run needs no repeat fetch.

For a video already started, call video_read and follow its next_step.

Explicit custom: skip video_formats and steps 5–6. Keep their mechanics and assets; research the brand/product and study the reference for its custom plan. Check current custom support before any write.

For other new videos start with get_started (wants video, request). A card is not a style choice or proof of viewing. Follow the reference rule before style selection or a plan.

1. The request. If they haven't said what the video is about, ask in one short question.
2. The brand. Ask which brand only when brand_read lists several; with one, use it.
3. The product. Named or none wanted: find its id with brand_read (sections: products), or use []. Otherwise the product card asks: say one line and wait. Without cards, ask which product by name; use the only one, or go on with none. Never ask again after a pick.
4. Research. Read the brand kit, learnings and the chosen products with brand_read (sections kit and learnings, plus the products' ids), then knowledge_search for them. Note what to say and avoid.
5. The styles. Call video_formats with the request and the products' ids ([] for none). The customer picks; never recommend one. A style they named that the answer lists as available is their pick. Otherwise, with the style card on screen, say one short line and wait; without one, print the style table from the answer as it is and ask nothing else.
6. The plan. Call video_create with the picked style and the products; its next_step says what follows.

## A supplied video reference comes first

Watch the actual video before choosing a style or writing a custom plan. Play through it, or inspect timestamped frames spanning it plus its audio/transcript. A URL, title, caption or thumbnail is not a viewing. Record the hook, scene order, pacing, narration/dialogue, framing, product interactions, text and ending, with timestamps and gaps. If access or sampling cannot answer an essential detail, ask for an accessible video or their choice to continue from the brief; never claim it was watched.
When they have not chosen custom, call video_formats after brand research. For plausible matches, catalog_fetch type template returns the style's plan_note, scenes, duration, cast, sound and assets. Compare these against the observed reference and their essential choices. A similar title or high brand ranking does not prove a match. Explain fit or mismatch before they choose. Keep an explicit style choice; do not quietly change constraints or over-adapt it. Reassess a later reference before creating or rewriting a plan.
If no available style fits, or they explicitly want custom, check the selected connection's current custom workflow before a project write. This server's video_create currently starts listed styles only: custom generation is unavailable through these actions. Say that plainly and keep the brief; do not substitute a template, import the reference as a finished video, use retired actions or switch environments. On a connection with a supported custom workflow, follow its separate authenticated script and ingredient approvals and quoted budgets; fetching this skill alone proves no execution capability.

## Rules

- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- A yes counts only for the price the customer was shown: their press on the plan card, or their yes in chat sent with that price.
- Where the app shows no card, print the plan and its price and ask for the customer's yes here; never send them to a website to approve.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
`,
  'make-custom-video': `---
name: make-custom-video
description: "Keep an explicit custom choice. Study its reference and check custom-video support on this connection before planning."
version: 3.4.2
---

# GooseWorks video

From an installed entry, first catalog_fetch type skill goose-video on this same connection and follow that body. An entry already fetched in this run needs no repeat fetch.

For a video already started, call video_read and follow its next_step.

Explicit custom: skip video_formats and steps 5–6. Keep their mechanics and assets; research the brand/product and study the reference for its custom plan. Check current custom support before any write.

For other new videos start with get_started (wants video, request). A card is not a style choice or proof of viewing. Follow the reference rule before style selection or a plan.

1. The request. If they haven't said what the video is about, ask in one short question.
2. The brand. Ask which brand only when brand_read lists several; with one, use it.
3. The product. Named or none wanted: find its id with brand_read (sections: products), or use []. Otherwise the product card asks: say one line and wait. Without cards, ask which product by name; use the only one, or go on with none. Never ask again after a pick.
4. Research. Read the brand kit, learnings and the chosen products with brand_read (sections kit and learnings, plus the products' ids), then knowledge_search for them. Note what to say and avoid.
5. The styles. Call video_formats with the request and the products' ids ([] for none). The customer picks; never recommend one. A style they named that the answer lists as available is their pick. Otherwise, with the style card on screen, say one short line and wait; without one, print the style table from the answer as it is and ask nothing else.
6. The plan. Call video_create with the picked style and the products; its next_step says what follows.

## A supplied video reference comes first

Watch the actual video before choosing a style or writing a custom plan. Play through it, or inspect timestamped frames spanning it plus its audio/transcript. A URL, title, caption or thumbnail is not a viewing. Record the hook, scene order, pacing, narration/dialogue, framing, product interactions, text and ending, with timestamps and gaps. If access or sampling cannot answer an essential detail, ask for an accessible video or their choice to continue from the brief; never claim it was watched.
When they have not chosen custom, call video_formats after brand research. For plausible matches, catalog_fetch type template returns the style's plan_note, scenes, duration, cast, sound and assets. Compare these against the observed reference and their essential choices. A similar title or high brand ranking does not prove a match. Explain fit or mismatch before they choose. Keep an explicit style choice; do not quietly change constraints or over-adapt it. Reassess a later reference before creating or rewriting a plan.
If no available style fits, or they explicitly want custom, check the selected connection's current custom workflow before a project write. This server's video_create currently starts listed styles only: custom generation is unavailable through these actions. Say that plainly and keep the brief; do not substitute a template, import the reference as a finished video, use retired actions or switch environments. On a connection with a supported custom workflow, follow its separate authenticated script and ingredient approvals and quoted budgets; fetching this skill alone proves no execution capability.

## Rules

- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- A yes counts only for the price the customer was shown: their press on the plan card, or their yes in chat sent with that price.
- Where the app shows no card, print the plan and its price and ask for the customer's yes here; never send them to a website to approve.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
`,
} as const;

export type ServerVideoEntrySlug = keyof typeof SERVER_VIDEO_ENTRY_SKILLS;

/** renderEntrySkillRules(product) for the products the CLI's own entry skills cover. */
export const SERVER_ENTRY_SKILL_RULES = {
  all: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  ads: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- Before choosing an angle, claim, product or source, or asking a brand fact, brand_read then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  photos: `- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except npx -y gooseworks@0.5.7 video check and npx -y gooseworks@0.5.7 video make <id> when a next_step gives them.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; you never approve.
- Before choosing an angle, claim, product or source, or asking a brand fact, brand_read then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
} as const;
