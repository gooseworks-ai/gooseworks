---
name: goose-video
slug: goose-video
description: >
  Order a finished video ad without leaving the chat. Use it when the user says "make me a video
  ad for <brand>", "I want a video ad", or asks for a UGC / iMessage / explainer video. One
  sentence is enough: it picks the brand, asks what the ad is for, suggests formats in a table
  with demo links, asks that format's questions, and shows the script for approval before any
  real spend. It renders on the GooseWorks server, returns the video in the chat, and works in
  hosted connectors too. For an existing app video project or batch, it hands off to
  goose-video-local.
category: ads
version: 1.0.0
author: GooseWorks
tags: [gooseworks, ads, video, order, server-render]
---

# GooseWorks Video Ads — order a video in chat

## Purpose

Produces one finished vertical video ad, rendered on the GooseWorks server and billed in credits. Examples: an animated iMessage, ChatGPT or Notes thread that ends on the brand's product, or a kinetic-type explainer. The live catalogue decides what can be ordered.

**The customer starts with one sentence.** "Make me a video ad for Bioma" is the normal opening, not an edge case. They will not name a format, a tool or a step. Getting from that sentence to a good choice is this skill's job.

**The whole job happens in the chat.** The customer is in Claude Code, ChatGPT or a terminal. They will not open a browser to review a script, compare voices or watch a result. Choosing, previewing, approving and receiving all happen here, as text and links they can click. The app is for **payment and nothing else**.

**This is not the Video Ads Lab.** The lab is internal, admin-only and free. This spends a customer's money.


## Route first: is this a new order?

This skill **orders a new video**. Hand off to **`goose-video-local`** and stop following this skill when the customer brings any of these:

- a **video batch** id ("for video batch <id>");
- the app's copy-for-Claude command (it names `goose-video-local`);
- "remix this video ad template" for a specific app template.

Those render on the customer's own machine. Use `goose-video-local` if it is installed; otherwise load it with `fetch_skill("goose-video-local")` on the GooseWorks MCP.

A bare **project** id ("make the video for project <id>"): call `video_project_read { brand_id, project_id }` first. **Stay here** when it returns an `order`, or the project's `script_drafts.recipe` is set: that is an order made through this skill, so continue it on the same `project_id`. **Anything else** goes to `goose-video-local`.

Everything else, including "make me a video ad for <brand>", starts at step 1 below.

## Inputs

- A brand, usually named in the opening sentence. Resolved to `brand_id`; with one brand in the org it needs no input.
- What the ad is for, in the customer's words (optional; asked once, never forced). **It is sent with the order** as `brief.prompt` and reaches the script. It is not only for sorting the table.
- Anything else they volunteer about the ad: who it's for, names or terms it must say, things to stay away from. These are never asked for; they're kept when the customer offers them.
- The picked format's own answers (voice, music, angle…). The catalogue says which apply; some formats ask nothing.

Never an input: a reference video (these formats don't use one), or a promo code (it comes from the brand).

## Composed Atoms

MCP tools; the work happens in the app.

- `brand_list`: brand NAME → `brand_id`. Pass `query` when they named one.
- `brand_create { name, website_url }`: only when the customer asks to add a brand that isn't there. Free.
- `video_catalog_list { kind: "formats", brand_id }`: what can be ordered. Each format has `card.description`, `card.best_for`, `card.needs`, `ask[]`, `brand_requirements[]`, `default_credits` and `examples[]` (demo videos: a curated sample first, then real runs). The response also carries `brief_fields`: the intent fields every format's `brief` accepts on top of its `ask[]` (`prompt`, `audience`, `must_mention`, `avoid`, `notes`).
- `video_catalog_list { kind: "voices" }`: voices with playable `preview_url`s, for formats that speak.
- `video_project_upsert`: the free draft. Returns `project_id`, `quote`, `ready`, `missing` and `questions` (0–2 things worth asking before the script is written; usually none).
- `video_project_upsert { project_id, patch: { brief } }`: changes the brief, checked the same way as when it was created. A key replaces its value, `null` removes it. Free. Once ordered, only the brief fields change (never the format's own answers), and they reach the script on the next `redraft`. A brief change never moves the quote.
- `video_render_run { dry_run: true }`: re-reads the price. Free.
- `video_render_run { kind: "partial" }`: **writes the script and stops.** Reserves the quote and shows the script before the expensive work. Works for every orderable format, chat or voiceover.
- `video_render_run { kind: "full" }`: finishes an approved preview.
- `video_render_run { kind: "edit", edit: { script } }`: puts the customer's OWN words into the draft, verbatim, through the format's own guards. Free before approval, and the **only** route that keeps their copy. Offered where the format's `edits.script` is non-empty; refused as `script_not_editable` elsewhere.
- `video_render_run { kind: "redraft", reason }`: another draft, before approval, written from why they turned this one down, or with no `reason` after a brief change (the change is the reason). It **re-runs the writer** either way, so every word (and the picture on a character format) is replaced — it does not keep copy the customer supplied. Same order, **no new hold**, but **not free**: it adds a few credits of model spend inside the hold already placed. Up to 3, and refused if it would pass the hold. `dry_run: true` says what it would add.
- `video_project_read { brand_id, project_id }`: status, the drafted script while previewing, and the finished video. Returns an `order` object for recipe projects.
- `job_cancel { job_id }`: declines a preview. `job_id` is the order id (the project id also works). Releases the whole hold.

## Workflow

The opening is fixed: **brand → what it's for → suggested formats → first question.** Do each step without waiting for the customer to ask for it.

### 1. Resolve the brand, quietly when you can

Call `brand_list`, with `query` when they named a brand. `query` is a case-insensitive substring match, so "Kolkata Chai" also finds "Kolkata Chai Co". If it finds nothing, call `brand_list` once more with no query before deciding.

- **The org has exactly one brand** → use it. Say which in one line ("Making this for **Bioma**.") and move on. Don't ask.
- **The name they said matches exactly one brand** → use it. Say which.
- **Several match, or they named none and the org has several** → show a table (name, website) and ask. The wrong brand is a wasted order.
- **Nothing matches** → say so, list the brands they do have in a table, and offer to add the new one here: "Or send me its website and I'll add it." With a website, call `brand_create { name, website_url }` (free). It starts brand research, which fills in the logo and colours in a few minutes. Say so, then carry on from step 2 while it runs. Before step 5, check `brand_get_context` shows `research_status: complete`; until then drafts are blocked. Adding a brand is not a trip to the app. Never create a brand they didn't ask for, and never guess the website.

If the GooseWorks MCP's own instructions have you check onboarding first and it turns out unfinished, finish it, then come back here with the customer's original sentence.

### 2. Ask what the ad is for, in one open question

Unless the opening sentence already said it, ask **one** plain question and wait:

> What's this ad for? For example: launching something, a sale, explaining how it works, or showing real results. Anything you tell me helps me pick the right format.

This is a free-text question: **no menu, no table, no list of formats yet.** Take whatever they say, even "not sure" or "just something good". Never ask it twice, and never block on it: a vague answer is an answer.

**Keep the answer. It goes into the order in step 5**, not just into the table's order. Write it down as they said it; that becomes `brief.prompt`. If their words (here or in the opening) also say who the ad is for, a name or term the ad must say, or something to stay away from, note those too:

| They said | Goes in | Example |
|---|---|---|
| What the ad is for (the whole answer) | `prompt` | "creative is the bottleneck for small teams, make it a problem-solver" |
| Who it's for | `audience` | "heads of growth at seed-stage startups" |
| A name or term it must say | `must_mention` (a list) | `["Claude", "ChatGPT"]` |
| Something to keep out | `avoid` (a list) | `["no villain", "don't talk down to marketers"]` |

Never ask for the last three and never fill them with a guess. A `must_mention` term the customer didn't say is a claim we made for them.

Skip the question when the opening already names a goal ("…a video ad for our summer sale") or a format ("…an iMessage video ad"). With a format named, go to the table with that format first and marked, then step 4.

### 3. Suggest formats in a table, best fit first

`video_catalog_list { kind: "formats", brand_id }`, then **always a markdown table in your message**.

Order the rows by how well each format fits their answer. Judge fit from `card.description`, `card.best_for` **and the format's `ask[]` options** against what they said. An option can make a format fit: a cartoon explainer whose `ask[]` offers `arc: hero-helper` fits "a friendly hero mascot, no villain"; one without that option does not, because its card says the character is the problem and loses. **A format whose card contradicts what they asked for is never Suggested**, however well its keywords match. When nothing fits, say so before the table ("None of our formats does X; the closest is Y, which gives up Z") and still show the table. Mark **exactly one** row **Suggested** with a few words on why ("real results → before/after"); a close second can be **Also good**. One suggestion keeps "the suggested one" unambiguous. With no goal given, put the formats that have demos first.

| | Format | What it looks like | Price | Demo |
|---|---|---|---|---|
| **Suggested** | iMessage chat reveal | Two friends texting; ends on your product | ~60 credits | [watch](https://…) |
| **Also good** | Apple Notes reveal | A diary-style note typed out; ends on your product | ~15 credits | [watch](https://…) |
| | Kinetic type explainer | Bold on-brand text timed to a voiceover | ~80 credits | [watch](https://…) |

- **Demo** is `examples[].output_url`. When a format has none, write "no demo yet" in the cell; never leave it blank.
- **"What it looks like" is `card.description`, quoted.** Copy it word for word; you may cut it at a sentence boundary, never re-word it. A paraphrase once turned "narrates how it gets beaten" into "narrates the fix", which made a villain format look right for a no-villain brief. `card.best_for` often carries a dollar figure; never copy it into the table.
- **When the pick depends on an option, say which.** "Cartoon explainer (as a friendly helper)" in the Format cell, and pre-fill that answer in step 4.
- **Price** is `default_credits`, written approximately ("~60 credits"). It is a guide for choosing. The price they agree to is the server's quote in step 5.
- **Say which formats won't take their words.** A format whose `edits.script` is empty writes its own copy and accepts no hand edit; the only lever is a redraft, which rewrites everything. Put "writes its own words" in that row's "What it looks like" cell. A customer who arrives with a script already written needs to know this **before** they pick, not after they hand it over.
- **Formats the brand may not be able to run** go last, with `card.needs` in plain words, e.g. "needs real before/after photos". Don't hide them; don't suggest them. Judge logo and product photos from the `brand_list` row. For anything else (before/after photos, say) you can't see, treat it as missing rather than make extra calls. `video_project_upsert` returns `ready`/`missing`, which is the real check.

**Print the table in your message, THEN ask which one** ("Want the suggested one, or another?"). Never put the formats only inside a structured question control: it renders plain option labels, not links, so the customer would be picking a format they were never able to watch. That happened on the first real run: the picker appeared, the demos didn't, and the customer had to ask where they were. A question control may follow the table to capture the answer; it never replaces it.

### 4. Ask the picked format's questions (only these)

Its `ask[]` list is the whole question set. Anything with `source: "recipe"` is the recipe's call, never the customer's. **An empty `ask[]` means no questions**: say so ("This one needs nothing else from you") and go straight to step 5.

Ask them all in **one message**, the choice tables first. Put yes/no questions that have a default at the end as a statement they can override ("Music on and a selfie in the thread; say if you want either off"). Every question with an optional answer gets a "leave it to the writer" option.

**The rule most easily got wrong:** anything the customer should *see or hear before choosing* goes in a **markdown table in your message**. The structured question control only captures the answer afterwards; it cannot render a link, so a demo or a voice sample placed only in the widget is a choice nobody can actually evaluate. Table first, question second. Yes/no questions need no table, and a choice with no sample (an angle list) is still a table, just without that column.

| Angle | The thread | Demo |
|---|---|---|
| friend-asks-friend | A friend notices something and asks | [watch](…) |
| setup-flex | You send a photo, the friend reacts | [watch](…) |
| swap-moment | You quit something worse for this | [watch](…) |
| feature-as-punchline | The product's own mechanic is the reveal | [watch](…) |

Same for voices: `video_catalog_list { kind: "voices" }` gives name, gender, accent and a `preview_url`. Put the name in a link so it plays. This was the clearest moment of the first real run: a voice table with playable samples. Do the same for any avatar or style choice a format exposes.

A choice with an `enum` and no samples (the cartoon explainer's `style`, say) is still a table: one row per value, described in the words of the field's own `description`, with "no demo yet" in the sample column. Don't invent what a style looks like.

Never ask for a promo code.

### 5. Draft and price

`video_project_upsert { brand_id, name, format, brief: { …answers, prompt, audience?, must_mention?, avoid? } }` is free. `brief` holds the picked format's `ask[]` answers **plus** the step-2 intent. Leave out any intent field the customer never gave. If `ready` is false, **stop** and relay `missing` in plain words.

The server refuses any other key with `invalid_brief` and names every key it accepts. Fix the brief from that message; never drop the customer's intent to make the error go away.

**If `questions` is not empty, ask them now, in one message, before showing the price.** Each one says which brief field its answer fills (`fills`). Save the answers with `video_project_upsert { project_id, patch: { brief: { <fills>: <their answer> } } }`. The bounds:
- **One round.** Never ask a follow-up, and never ask the same thing twice.
- **Never required.** If they skip them or say "just make it", carry on with the draft as it is.
- **Empty `questions` means ask nothing.** The server skips it when the brief already says what the ad is for and who it's for, and never asks what the brand record already knows. "Make me a video ad for X" stays a complete request.

Show the price the draft returned (the `quote`), **never a number from this page or the catalogue**. If it differs from the table's "~N", the quote is right. Convert at **100 credits = $1**.

### 6. Write the script and show it, before the expensive work

`video_render_run { brand_id, project_id, kind: "partial" }`.

This reserves the credits and writes the script only: **no video is rendered.** It returns immediately with `status: "previewing"` and no script yet; the writing happens in the background. Poll `video_project_read` every 20 seconds (it lands in about 40) and read `order.preview`. Calling `kind: "full"` while it is still `previewing` is refused with `preview_in_progress`.

`order.preview` is shaped by the format, and **every** orderable format has one. A preview was chat-only until 2026-09-25, and a kinetic-type customer approved a price and first saw the copy in the finished video.

**A chat format** (iMessage / ChatGPT / Notes) fills `thread` (the message list), `angle`, `cta_text` and `selfie_url`. Show it as a readable transcript, not JSON:

> **them:** wait why do you look so into your phone rn 😭
> **me:** I literally just chose to betray the duke
> **them:** omg is this a game or a book

**`selfie_url` is a generated face — show it as a link.** These formats draw the selfie INSIDE the script step, so it never appears in `anchor_images` and `stage` stays `"script"`. It is still a face that will be in the ad, so it still needs their yes.

**Any preview with `order.preview.stage: "image"`** stopped after the **picture**, not just the words, so they judge the face before paying for the video. Go by that field, never by a list of format names — it follows what the recipe's steps produce, so a format joins this branch without a skill edit. Today: the animated character, the reaction selfie, the podcast hosts, the UGC creator, and the voiceless dance story (four to six stills, and no spoken script at all — its stills and `detail` ARE the draft, so say that rather than reporting an empty script).

Show every URL in `order.preview.anchor_images` as a link (the podcast format has two, one per host), alongside the script. Then say plainly, in this order: what they are looking at; that **nothing has been rendered yet and the pause is deliberate**, because the video is generated FROM this picture and changing the face now is cheap; that **approving starts the render and commits the credits already held**; and that cancelling instead releases the whole hold, so the picture costs them nothing. A pause with no reason given reads as a broken order.

**A voiceover format** (kinetic type) fills `beats` instead, and `thread` is null. Each beat has `vo_lines` (what is spoken) and a `beat` label. `detail.hyperframe.plan.slates[].props` holds the words that go **on screen**, which for this format is most of the ad. Show both columns, in order:

| # | On screen | Voiceover |
|---|---|---|
| 1 | Sunscreen that pills | Most sunscreens pill under makeup. |
| 2 | Myth: all SPF is greasy → Fact: not a fluid one | This one is a fluid. It sinks in. |

Read the spoken lines out as one paragraph underneath, so they can hear the pacing.

Whatever the format, **quote it back verbatim.** Do not paraphrase, tidy or shorten the copy; they are approving the exact words that will be rendered.

If `order.preview.brief_check` is present, read it before asking for approval:
- `missing_mentions`: terms they asked for that the script never says. Tell them which, plainly ("It doesn't mention ChatGPT yet").
- `endorsement_flags`: lines that make another brand sound like it endorses, partners with or ranks theirs. Show the line and say it has to change: a listed name may appear as "works with", never as "recommends" or "#1 for".

If `order.brief_changed_since_draft` is present, the brief was changed after this draft was written. **Approving renders the draft as shown**, so redraft first (no reason needed), or tell them the change won't be in this video.

Then ask: **use this, change it, or stop?**

**One question decides how to change it: did they give you the actual WORDS, or did they tell you what is wrong?** Only the first route below keeps their words. The other two write new ones — which is right when the customer wants something different, and is a silent rewrite when they wanted what they wrote.

- **They gave you the words** ("use these lines", "the end card must say Meet Goose", "keep this but change the second bubble") → `video_render_run { kind: "edit", edit: { script: { … } } }`. **This is the only route that keeps copy verbatim.** It puts their text through the format's own guards and costs nothing extra before approval. Send the shape the preview handed you: `script.thread` for a chat format, `script.beats[i].vo_lines` (one entry per beat, `{}` for a beat you are not changing) for a voiceover format, `script.slates[{ beat_idx, props }]` for on-screen words, `script.cta_text` for the end card, `ingredient: "character"` + `script.character.description` for the character itself.
  - **An edit before approval IS the approval**: it applies the copy and starts the render at once (status → `running`). So show the exact words you are about to send, get a yes, and only then send it. An unapproved fix stays a proposal in the chat.
  - Refused with `script_not_editable` → this format writes its own copy and takes no hand edit. **Say so, and do not paraphrase their lines into a redraft** — that hands them a video that is not what they wrote. Their real options are a redraft (new words, not theirs), a re-order with different answers, or cancel.
  - Refused with `script_rejected` → a line makes a claim the brand's facts don't support. Relay the reason and offer a rewrite; never argue it through.
- **They changed the BRIEF, not the copy** — the problem it shows, who it's for, a name to say, something to avoid, a note like "keep it dry" → save it with `video_project_upsert { project_id, patch: { brief } }` (use `notes` for anything that isn't one of the other fields; keep their original `prompt`), then `video_render_run { kind: "redraft" }` with no `reason`. The new draft is written from the updated brief, so **the words will be new** — this changes the instructions, not the script. Same cost wording as below: no new order, no new hold, a few credits inside the hold.
- **They only said what's wrong** ("too salesy", "the character looks like a mug") → ask **why** in one line, then `video_render_run { kind: "redraft", reason: <their words> }`. **A redraft RE-RUNS the writer: every word, and the picture on a character format, is replaced.** Their reason steers the next draft; it is not copied into it. Never put exact lines in `reason` expecting them back. Say what it costs, precisely: "no new order and no new hold; it adds about N credits to what this video costs, inside the hold" (N from the response's `redraft.credits_estimate`). **Never call it free.** Poll `video_project_read` until `preview` again and show the new draft plus `order.spend` (what each draft added, how much of the hold is left). A `redraft_exceeds_hold` or `redraft_limit` refusal means: approve a draft or cancel.
- Different answers altogether (another format, another angle) → a fresh project, and cancel this one.
- Stop → `job_cancel { job_id: <order id> }`. The whole hold is released and they pay nothing. Cancel only works while the order is `queued`, `previewing` or `preview`; once they approve and it is `running`, it is being made and cannot be refunded.

This is the review. It happens here, not in the app.

**If the server answers `preview_not_available`,** that is a bug: every sold format has a script preview. Say plainly "I can't show you the script for this one before it's made", and stop. Do not quietly skip the step and charge as if the gate had passed.

### 7. Finish it

Only after they approve the script: `video_render_run { brand_id, project_id, kind: "full" }`.

Poll `video_project_read { brand_id, project_id }` **every 30 seconds.** Done means `order.status` is `done`; the same response then carries `video_url` (the project page) and `mp4_url` (the file).

**How long depends on the format.** One number is wrong by 2x across the catalogue, and a customer told "about 5 minutes" at minute 9 thinks it has failed:

| Format | Typical | Give up after | Why |
|---|---|---|---|
| iMessage / ChatGPT / Notes chat reveal | ~5 min | 10 min | No video is generated; a browser renders the phone UI, then ffmpeg cuts it |
| Kinetic type explainer | **~10 min** | 20 min | Two AI b-roll clips, a voiceover, a music bed, HTML slides and a stitch |

An unlisted or new format: assume the longer budget. Say the number you are working to up front ("this takes about ten minutes; I'll keep checking"), and say something at the halfway mark rather than going silent. Waiting is not failing; silence feels like it.

### 8. Deliver in the chat

**Lead with `video_url`** — the project page, where the video plays and they can come back to it. Give `mp4_url` second and name it as the file ("and the raw MP4, if you want to download or upload it"). Never hand over the CloudFront `.mp4` on its own: it is a file, not a place — nothing to return to, nothing to edit from, and it reads like a debug artifact rather than a delivery. If `video_url` is missing, poll once more; never substitute the mp4 for it silently.

Say what the video is: length, ratio, what's in it. This is delivery **in the chat** — the link is the video, not an instruction to go to the app. If they want a change, offer to make another with different answers. That is a new order and a new charge; say so.

The only reason to send someone to the app is **payment**: not enough credits, or a plan without video.

## Decision Rules

- **One sentence is a complete request.** Never answer "make me a video ad for X" by asking which format, which tool or what to do next. Run steps 1–3 and let the table do the asking.
- **One brand in the org → never ask which brand.** State the one you used.
- **Open question first, table second.** Don't lead with the whole catalogue. The goal question comes before any list, and the table comes ordered, with one suggestion.
- **No approval of the SCRIPT → do not call `kind: "full"`.** The price gate is not the script gate. They approve a number in step 5 and the actual ad in step 6.
- **More than two options → table in the message.** Every time. Options with a sample or demo the customer can't hear or see are not really choices. A question control may capture the answer after the table, never instead of it.
- **`ready: false` → stop.** Ordering anyway fails and wastes their time.
- **Unsure whether an order went through → read `video_project_read` first.** Never use the charging tool as a status probe. Only if the project shows nothing at all, re-call `video_render_run` on the SAME `project_id` (idempotent per project). Never create a second project; that is a second charge.
- **Quote cards, never paraphrase them.** The card is the server's promise about the format. A reworded card can promise something the format cannot do.
- **A contradiction with the card outranks every keyword match.** Check what they asked for against what the card and the `ask[]` options say the format does; a format that can't do the ask is never Suggested.
- **They asked for a format that isn't in the catalogue** → it isn't available yet. Say so, show the table, and don't improvise a lab recipe.
- **Run failed → say so plainly.** The credits are released automatically. Offer a retry; never retry unasked.
- **Their words go in an `edit`, never in a `redraft` reason.** A `reason` steers the next draft; it is not copied into it. The moment a customer gives you actual copy, the only honest routes are `kind: "edit"` or telling them this format will not take it.
- **Deliver the page, not the file.** `video_url` leads, `mp4_url` follows. A bare CloudFront link is not a delivery.
- **The brief is the customer's words, not yours.** `prompt` is their answer, verbatim or close to it. `audience`, `must_mention` and `avoid` hold only what they said. Another brand in `must_mention` means they asked for it; it can be named as "works with", never as an endorsement or ranking.

## Output

The finished video in the chat: `video_url` (the project page) first, `mp4_url` (the file) second, with its length and ratio.

The credits leave the balance when the order is placed (a hold). They are **captured** on success or **released** on failure or cancellation. A balance that dropped does not prove a charge, so don't describe it to the customer that way.

## Quality Checks

- A one-sentence opening got: the brand resolved (unasked when there is one), one open goal question, then a format table with demo links and one suggestion.
- The table was ordered by the customer's goal, not the catalogue's order.
- Every "What it looks like" cell is the card's own words. No Suggested format's card contradicts what the customer asked for; when nothing fit, you said so and named the closest with its trade-off.
- Every multi-option question was a table in the message, with a demo or sample column wherever one exists.
- Only the picked format's `ask[]` questions were asked.
- The step-2 answer went into the order as `brief.prompt`, and no intent field held anything the customer didn't say.
- They approved the **script**, not just the price, before the expensive work ran: the thread for a chat format, the on-screen words *and* the voiceover for a kinetic-type one.
- You told them how long the render would take **for the format they picked**, and said something at the halfway mark instead of going quiet.
- The quote you showed came from the server, never from memory or the catalogue.
- Every line of copy the customer wrote is in the finished video word for word — it went through `kind: "edit"`, or you told them plainly that this format would not take it. No supplied copy was ever paraphrased into a `redraft` reason.
- The video was delivered in the chat as `video_url` first and `mp4_url` second. You did not send them to the app for anything but payment.
- You asked for no promo code or reference video, and made no product claim the brand's own facts don't support.

## Failure Modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Make me a video ad for X" got back "which format / what would you like?" | Treated the one-liner as incomplete | Run steps 1–3 unprompted: resolve the brand, ask the goal, show the table |
| Asked which brand in a one-brand org | Skipped the count check in step 1 | Use the only brand and say which |
| Opened with the full format list | Skipped the goal question | Ask what the ad is for first; order the table by the answer |
| Demo links invisible to the customer | The choices went only into the structured question control | Table in the message first; the control only takes the answer |
| `format_not_available` | Not an orderable format | Re-read the catalogue; offer what's in it |
| `brand_not_ready` | Brand has no product photos or logo | Relay `missing` in plain words; stop |
| `invalid_brief` | The brief carried a key this format doesn't accept (e.g. another format's question, or a made-up field like `tone`) | The message lists what is accepted. Move the customer's words into `prompt`/`audience`/`must_mention`/`avoid`; never drop them |
| The script ignores what they asked for | The step-2 answer wasn't sent (it only sorted the table), or they added something later that never reached the brief | Send it as `brief.prompt` in step 5. Anything they add later goes in with `patch.brief` (`notes`) and then a redraft. The preview's `brief_check` shows missing must-mention terms |
| Video not on this plan | Lite and trial have no video entitlement | Say so and point at the upgrade; this is the one app trip that's allowed |
| Insufficient credits | Wallet short | Nothing was created or charged; report the shortfall |
| Preview looks wrong | The script or the picture isn't what they wanted | They gave you the words → `kind: "edit"`. They changed the brief → `patch.brief` then a redraft with no reason. They only said what's wrong → `kind: "redraft"` with their reason. Same order, no new hold, a few credits inside it; never "free". Or `job_cancel` this one |
| **The customer wrote the script and the finished video says something else** | Their lines went into a `redraft` `reason`. A redraft re-runs the writer: the reason steers the next draft, it is never copied into it. Seen on staging — "Keep this exact draft, use these lines: …" came back paraphrased, twice, and was paid for both times | Copy goes in `kind: "edit"`. If the format refuses it (`script_not_editable`), say so and let them choose a redraft, a re-order or cancel — knowing the words will be new |
| Video started rendering before the customer approved | `kind: "edit"` on a preview applies the copy **and** starts the full render (status → `running`) | Show the exact words you're about to send, get a yes, then send the edit. An unapproved fix stays a proposal in the chat |
| `draft_is_your_copy` on a redraft | The current draft is the customer's own edited copy; another draft would replace their words | Correct behaviour. Edit their copy again with `kind: "edit"`, approve it, or cancel |
| `script_rejected` on an edit | A line makes a claim the brand's facts don't support | Relay the reason verbatim and offer a rewrite; nothing was charged |
| The customer was sent a raw `cloudfront.net/….mp4` | Delivered `mp4_url` (or `order.output_url`) instead of `video_url` | `video_url` leads and `mp4_url` follows. Both come back from `video_project_read` once `order.status` is `done` |
| `recipe_brief_locked` | You patched `script_drafts` raw on a format project, which would have skipped the brief's checks | Send the change as `patch.brief` instead |
| `format_answers_locked` | After ordering, you tried to change the format's own answer (voice, angle, selfie) through the brief | Those change what the run costs. Use `kind: "edit"` where the format lists it, or start a new project |
| Asked the customer three rounds of questions before anything was made | Treated `questions` as a form, or asked your own follow-ups | Ask what `questions` holds, once, in one message. Nothing else. Skipping is fine |
| `preview_in_progress` | You called `full` while the script was still being written | Keep polling `video_project_read` until `order.preview` appears |
| Cancel refused | The order is already `running`; they approved it | Say it's being made; a refund isn't possible now |
| No render after the format's budget (10 min chat, 20 min kinetic) | The worker didn't pick the run up | Credits are held, not spent. Say it's queued and you'll follow up; don't re-order |
| `preview_not_available` on an orderable format | A bug; every sold format has a script preview | Say so and stop. Do not order without showing the script |
| An edited script is refused (`script_not_editable`) | This format's writer takes no hand edit (its `edits.script` is empty). Only some formats do | Should have been said at the table. Their words cannot be rendered verbatim here: offer a redraft (new words), a re-order with different answers, or cancel — and never quietly paraphrase their copy into the redraft reason |
| A "hero, no villain" brief got the villain cartoon | The card was paraphrased ("narrates the fix") and the fit check never read what the format can't do | Quote `card.description`; check the ask against the card and `ask[]`; never Suggest a contradiction |
| Two videos, two charges | A second project was created instead of continuing the first | Continue on the SAME `project_id` |

