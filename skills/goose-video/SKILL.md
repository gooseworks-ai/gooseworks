---
name: goose-video
description: "Make a video ad in this chat. Study a supplied video reference before comparing styles; follow the next_step in every answer."
version: 4.4.1
---

# GooseWorks video

From an installed entry, first catalog_fetch type skill goose-video on this same connection and follow that body. An entry already fetched in this run needs no repeat fetch.

For a video already started, call video_read and follow its next_step.

Start with get_started (wants video, the request); its card takes each step and says what it did. A card appearing does not select a style or mean a reference was studied.

For a new video, follow the reference rule below before any style selection or plan. Otherwise follow these steps.

1. The request. If they haven't said what the video is about, ask in one short question.
2. The brand. Ask which brand only when brand_read lists several; with one, use it.
3. The product. Named, or none wanted: find its id with brand_read (sections: products), or use [], then step 4; no card asks again. Else with cards, the card asks: say one line and wait, no question box. Without cards, ask which, naming the brand's products; use the only one, or with none go on without.
4. Research. Read the brand kit, learnings and the chosen products with brand_read (sections kit and learnings, plus the products' ids), then knowledge_search for them. Note what to say and avoid.
5. The styles. Call video_formats with the request and the products' ids ([] for none). The customer picks; never recommend one. A style they named that the answer lists as available is their pick. Otherwise, with the style card on screen, say one short line and wait; without one, print the style table from the answer as it is and ask nothing else.
6. The plan. Call video_create with the picked style and the products; its next_step says what follows.

## A supplied video reference comes first

Watch the actual video before choosing a style. Use this connection's available viewing tools: play through it, or inspect timestamped frames spanning it plus its audio/transcript. A URL, title, caption or thumbnail is not a viewing. Record the hook, scene order, pacing, narration or dialogue, framing, product interactions, text and ending, with timestamps and any gaps. If access or sampling cannot answer an essential detail, say what is missing and ask for an accessible video or their choice to continue from the brief; never claim it was watched.
Call video_formats after brand research. For plausible matches, catalog_fetch type template returns the actual style's plan_note, scenes, duration, cast, sound and asset requirements. Compare these against the observed reference and the customer's essential choices. A similar title or high brand ranking does not prove a match. Explain a meaningful fit or mismatch before they choose. Keep an explicit style choice; do not quietly change its constraints or over-adapt it. Reassess if a later reference changes the fit, before creating or rewriting a plan.
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
