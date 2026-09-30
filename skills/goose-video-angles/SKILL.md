---
name: goose-video-angles
slug: goose-video-angles
description: >
  Find what video ads to make for a brand. Use it when the user asks "what video should I make?",
  "give me video ad ideas / angles / hooks for <brand>", "what's working for my competitors?", or
  says they're not sure which video to make. It reads the brand, its competitors' ads (Meta Ad
  Library, incl. video) and what's getting organic reach on TikTok, Instagram, YouTube Shorts and X
  (plus any search terms the user gives), then returns a ranked list of video ideas. Each idea names
  the video format that makes it and links the real posts or ads behind it, with paid ads kept
  apart from organic reach. "Make these" hands the picked ideas straight to goose-video-local.
category: ads
version: 1.0.0
author: GooseWorks
tags: [gooseworks, ads, video, angles, ideas, research, competitors, social-listening]
---

# GooseWorks Video Ad Angles — what should I make?

## Purpose

Answers "what video ad should I make?" with a **ranked list of video ideas** the customer can make
in one step. Every idea:

- has a **hook** (the first line or first shot) and an **angle** (why someone keeps watching);
- is **mapped to a video format** that exists in the catalogue (`video_catalog_list`), so it can be made here;
- cites **at least one real reference**, a post or ad with a link, and says whether that reference
  is **paid** (an ad) or **earned** (organic reach). A boosted post is not proof an idea works.

"Make these" turns the picked ideas into video projects and makes them with **`goose-video-local`**
in the same session. The customer never copies anything between tools.

**The whole job happens in the chat.** The ideas, their links and the pick all live here.

## Inputs

- A brand, resolved to `brand_id` (one brand in the org → use it, say which).
- Optional: the customer's own **search terms** ("sleep", "creatine for women", a competitor name).
  Use them as given; never ask for them twice.
- Optional: a goal ("launch", "sale", "explain how it works"), an audience, things to avoid. Kept when offered, never required.
- Optional: how many ideas. **Default 10–15**; never fewer than 10 unless the evidence truly runs out (then say so).

## Composed Atoms

GooseWorks MCP tools (canonical names; an older client may expose the legacy name in brackets).

| Step | Tool | Cost |
|---|---|---|
| Brand + products + tracked competitors + own social accounts | `brand_read { brand_id, sections: ["summary","products","competitors","accounts","learnings"] }` [`brand_get_context`] | free |
| Competitor roster / one dossier / suggested competitors | `competitor_read { brand_id }`, `competitor_read { brand_id, slug }`, `competitor_read { brand_id, view: "suggestions" }` | free |
| Competitor ads already imported (paid) | `ads_template_read { brand_id, mode: "competitor", filters: { format: "video" } }` (then without the filter) | free |
| Refresh a competitor's Meta Ad Library | `ads_library_scrape { brand_id, source_id }` → poll `job_get` | free (platform-paid) |
| Saved inspiration + research-run posts | `social_inspiration_library { brand_id }`, `social_inspiration_search { brand_id, query }` | free |
| Look inside one video | `social_inspiration_watch` (saved posts) or the `watch` skill | free / local |
| People talking about a competitor (TikTok, IG, X, YouTube, Reddit) | `competitor_search_mentions { competitor_id, platforms, query }` | **paid** |
| Keyword search on TikTok / Instagram Reels / YouTube | `data_call_provider { provider: "scrapecreators", path, query }` | **paid** per call |
| The formats an idea can map to | `video_catalog_list { kind: "formats", brand_id }` | free |
| Keep a reference for later | `social_inspiration_save` | free |
| Make the picked ideas | `video_project_upsert` + `goose-video-local` | billed per step, approved first |

ScrapeCreators search paths (GET, `query` object): TikTok `/v1/tiktok/search/keyword`
`{ query }`; Instagram Reels `/v2/instagram/reels/search` `{ query }`; YouTube
`/v1/youtube/search` `{ query }` (keep Shorts: vertical, ≤ 60 s). If a path returns 404 or an
unexpected shape, drop that source for this run and say so in the sources line. Never guess
another path.

## Workflow

The order is fixed: **brand → free evidence → (approved) paid listening → formats → ideas table → make these.**

### 1. Resolve the brand and read it (free)

`brand_read` with no `brand_id` (pass `query` when they named one) → pick the brand as goose-video
does: one brand → use it and say so; several → table and ask; none → offer to add it from its
website (`brand_create`). Then `brand_read { brand_id, sections: [...] }` as above.

Note, in a few lines for yourself: what it sells (physical product, app/software, service), who
buys it, its claims and can't-say rules, which products have clean photos, whether it has
screen recordings or footage, and its own social accounts. **Never invent a customer, a result or
a claim.** An idea may only promise what the brand's own facts support.

If research is still running, carry on with what's there and say the ideas will sharpen once it finishes.

### 2. Gather the free evidence

1. **Competitors.** `competitor_read { brand_id }`. With none tracked, read
   `view: "suggestions"` and name 3–5 likely competitors in one line ("I'll look at A, B and C;
   tell me if that's wrong"). Don't block on an answer. Nothing gets tracked without `competitor_link`.
2. **Their ads (paid).** `ads_template_read { brand_id, mode: "competitor", filters: { format: "video" } }`,
   then without the format filter. If a tracked competitor has no imported ads, start
   `ads_library_scrape { brand_id, source_id }` (free) and keep going; read the results when the job finishes.
   Rows are heavy: page with `limit: 10`. For each ad keep:
   - **link**: `https://www.facebook.com/ads/library/?id=<source_ad_id>`;
   - advertiser, `ratio`, the hook (first line of `ad_primary_text`), the offer and `ad_cta`;
   - **days running**: `ad_ended_at` − `ad_started_at`. An ad running 30+ days is a signal the
     advertiser kept paying for it; a new ad is not.

   The ad library may hold only image ads for a competitor. Their **copy** (hook, claim, offer) is
   still angle evidence for a video idea; cite it as a paid reference and say it was a static ad.
3. **Their organic posts (earned).** The competitor dossiers (`competitor_read { slug }`) hold recent
   posts and content themes. Keep posts with views/likes far above that account's usual.
4. **Saved inspiration.** `social_inspiration_library` and `social_inspiration_search` with the
   brand's category and the customer's terms.

### 3. Paid social listening — ask once, then run

Say what you'll search and roughly what it costs, and ask **one** yes/no:

> To find what's getting organic reach right now I'd run about N searches (TikTok, Instagram Reels,
> YouTube Shorts, plus X mentions of your competitors). Each is billed per call. Go ahead?

- **Yes** → run the searches. Query terms: the customer's own terms first, then the category
  ("magnesium sleep", "budgeting app"), the main problem it solves, and each competitor's name.
  Use `data_call_provider` (scrapecreators) for TikTok / Instagram / YouTube keyword searches and
  `competitor_search_mentions { competitor_id, platforms: ["x", ...] }` for X and mentions.
  Repeat searches are replayed from cache, so never re-run one to "refresh" it.
- **No** → build the ideas from the free evidence only, and say that the list has no fresh social
  data behind it.

Keep 9:16 videos only; drop photos, carousels and long horizontal videos as references for a video idea.

### 4. Label every reference paid or earned

For each post or ad you might cite, set `reach`:

- **paid**: it came from an ad library; or the post is marked as an ad (TikTok `is_ad` /
  commercial content, Instagram paid partnership / `sponsor_tags`, "Sponsored"); or the same video
  also appears among that advertiser's ads (**boosted**).
- **earned**: an organic post with none of the above.
- **unknown**: you can't tell. Say so; never guess "earned".

Then judge strength, **separately**:

- **Earned** strength = reach relative to the account's normal (an outlier at 10× its usual views
  beats a big account's average post) and how recent it is (last ~90 days).
- **Paid** strength = how long the advertiser kept running it, and how many variants of it they made.
- **Never treat a paid post's view count as proof.** Money bought those views.

Watch (the `watch` skill or `social_inspiration_watch`) the 3–5 strongest references so the
hook and structure you describe are what is actually in them, not a guess from the caption.

### 5. Read the formats

`video_catalog_list { kind: "formats", brand_id }`. Each row has `template_id`, `card.description`,
`card.best_for`, `card.needs` and `examples[]`. Only these formats can be made; never map an
idea to a format that isn't in the list.

### 6. Turn evidence into ideas, then rank

An idea is a **pattern seen in the evidence, adapted to this brand**, never a copy of one post. For each:

- **Hook**: the first line or shot, in the brand's voice, 12 words or fewer.
- **Angle**: the reason to keep watching (problem → fix, myth vs fact, social proof, us vs them,
  a demo, a reaction, a story).
- **Format**: the `template_id` that makes it, and one line on why it fits. Match the product to the
  format: a creator holding a product needs a physical product; a screen-recording format needs an
  app. Quote `card.description`; don't reword it.
- **Needs**: `card.needs` against what the brand has (step 1). A missing need lowers the rank; say it.
- **References**: 1–3 links, each with platform, account, reach label (paid / earned / unknown)
  and the number that matters (views vs usual, or days running).
- **Score** out of 10 = evidence strength (earned outliers and long-running ads count most) +
  brand fit (only claims it can make) + format fit + readiness (`card.needs` met). An idea
  backed only by paid references caps at 6.

Spread the list: no more than 3 ideas on one format and no more than 3 on one angle, so the
customer has real choices.

### 7. Show the ideas as one table

Print **one markdown table in your message** with every idea, best first:

| # | Idea (hook) | Angle | Format | Why it should work | References | Needs | Score |
|---|---|---|---|---|---|---|---|
| 1 | "I stopped taking melatonin. Here's why." | myth vs fact | Myth vs fact ([demo](https://…)) | Earned: 3 creators' posts on this at 8–15× their usual views in the last 60 days | [TikTok @a](https://…) (earned, 12× usual) · [Meta ad, BrandX](https://…) (paid, 94 days) | product photo ✓ | 9 |

Under the table, one line: which sources ran (and which were skipped and why), how many references
were paid vs earned, and that each paid step of making a video is approved before it runs.

Then ask: **"Which ones should I make? Pick up to 5, or say 'the top 3'."**

Also save the list to `video-ideas/<brand-slug>-<YYYY-MM-DD>.json` in the working folder
(`[{ rank, hook, angle, format_template_id, why, references: [{ url, platform, account, reach, metric }], needs, score }]`)
so a later session or bulk creation can pick up from it without re-running the research.
Offer once to save the strongest references to the brand's inspiration (`social_inspiration_save`).

### 8. "Make these": hand off with no manual steps

For the picked ideas (up to 5 in one go):

1. **Machine check once.** A hosted connector (ChatGPT, claude.ai, Cowork: no shell) can't render;
   say the ideas are ready and that making them needs Claude Code, Codex or Cursor. On a terminal,
   run `gooseworks doctor` and fix anything it flags before any project exists.
2. **One project per idea**: `video_project_upsert { brand_id, name: "<hook, short>", format: <template_id> }`
   with **no `brief`** (a brief turns it into a multi-concept batch of one format).
3. **Make them one after another** with `goose-video-local` (installed, or
   `catalog_fetch { type: "skill", slug: "goose-video-local" }`). Each idea is that project's brief
   for its Step 1.5: the hook, the angle, the audience and must-say/avoid notes, and the references
   as style guidance. Don't ask the customer again for anything the idea already says.
   Show every project's review set together so the customer approves them in one pass where
   `goose-video-local` allows it.
4. Deliver each finished video's link as it lands, then a short summary: idea → video link.

## Decision Rules

- **Every idea cites at least one real link you actually retrieved.** No link → no idea. Never write a
  URL you didn't get back from a tool.
- **Paid and earned are never mixed up.** Label every reference; an idea resting only on paid
  evidence says so and caps at 6.
- **Adapt, don't copy.** Take the pattern (hook shape, structure, angle), never another brand's words,
  claims, faces, footage or offer.
- **Only the brand's own facts.** No invented customers, results, prices or claims; respect its can't-say rules.
- **Only catalogue formats.** An idea whose best format doesn't exist is dropped or re-mapped; say which.
- **Ask once before paid listening.** Free sources never need asking.
- **Table in the message, then the question.** Never put ideas only inside a structured question
  control; it can't show links.
- **Up to 5 videos per "make these".** More than 5 → make the first 5, offer the rest after.

## Output

- A ranked table of 10–15 video ideas in the chat, each with a format, a paid/earned-labelled
  reference link, needs and a score, plus `video-ideas/<brand-slug>-<date>.json`.
- On "make these": one project per picked idea, made by `goose-video-local` in the same session.

## Quality Checks

- At least 10 ideas (or a clear line saying the evidence ran out, and why).
- Every idea has at least one link, and every link was returned by a tool this session.
- Every reference is labelled paid, earned or unknown; no paid post's views are quoted as proof.
- Every format is a `template_id` from `video_catalog_list`, with its card quoted, not reworded.
- No idea claims something the brand's facts don't support.
- The list is spread across formats and angles (≤ 3 per format, ≤ 3 per angle).
- "Make these" created projects and started `goose-video-local` without asking the customer to copy anything.

## Failure Modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Ideas all copy the biggest competitor's ads | Only the ad library was read | Weigh earned outliers; label ad-library rows paid; cap paid-only ideas at 6 |
| "This went viral" on a sponsored post | Didn't check the ad markers or the ad library | Run step 4 on every reference before citing it |
| A link 404s or points at the wrong post | URL written from memory or a caption | Cite only URLs the tools returned |
| Idea mapped to a format the brand can't feed (creator holding a product, for an app) | Skipped `card.needs` / product type | Re-map, or keep it last and say what's missing |
| Fewer than 10 ideas | No competitors tracked and paid listening declined | Use `competitor_read view: "suggestions"` and the customer's terms; say where the evidence ran thin |
| Customer asked to paste a command after picking | Handoff stopped at the table | Create the projects and run `goose-video-local` here (step 8) |
| ScrapeCreators path returns 404 | Endpoint changed | Drop that source for this run and say so; never guess another path |
| One format fills the list | Ranked by evidence only | Keep ≤ 3 per format and ≤ 3 per angle |

