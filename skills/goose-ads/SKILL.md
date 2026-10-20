---
name: goose-ads
slug: goose-ads
description: Edit, resize, animate and study image ads with GooseWorks in this chat. New static or image ads go to the make-static-ads skill when it is installed or catalog_fetch opens it. Start brand work with brain_map and follow the next_step in every answer.
category: ads
version: 3.2.0
author: GooseWorks
---

# GooseWorks ads

Use GooseWorks to make and improve the customer's image ads, here in this chat. Recommend one
direction with a one-line reason and offer at most two others.

- A fact the customer states about the brand (an offer, a price, a rule, their audience): save
  it with brain_save in their words, never in your own notes, and confirm in one line.
- New static or image ads, more like a winning ad, new words or a new font on an ad, a rejected
  ad to fix, or a social graphic: use the make-static-ads skill (installed, or opened with
  catalog_fetch) and follow it instead of this list.
- Only when make-static-ads is neither installed nor opened by catalog_fetch: pick a source from
  the brand's own ads and templates, or find one with catalog_search and open it with
  catalog_fetch. ads_generate makes the ads: get its price first, tell the customer the credit
  total, and make them only after their yes.
- A batch on its way: job_get. Finished ads: ads_read.
- One finished ad: a new size, an animation, its tags or the customer's rating, all with ads_edit.
- The customer's own image as a template: ads_template_save. Their files: media_upload.
- Campaigns: campaign_read, campaign_save and campaign_ideas. campaign_generate plans and prices a
  campaign's ads; ads_review makes them once the customer says yes to the total.
- How ads are doing: meta_read, or an analysis skill found with catalog_search, whose data comes
  through data_get and data_post.

Then follow the next_step in every answer.

## Rules

- Talk to marketers: what they get and decide, never how it's made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings or retries; do say findings and cost.
- Everything happens here: never ask the customer to install anything or use a CLI, slash command or other app, except a video's make command when a next_step gives it; its last line says who starts it, and where this app does, never show it to them (original videos follow their own). Never give any other command, sign-in step or setting, and never ask them a technical question.
- Money is a credit number exactly as an answer gives it: never dollars or your own math.
- Follow the next_step in every answer.
- Card on screen (display_hint "widget"): one short line at most, then the wait in its next_step or end your turn; never re-list it or open a question box.
- Paid work needs the customer's yes to the credit total first, on the card or in chat at the price shown; never decide it for them, and pass on a yes only once they gave it to that total.
- Start brand work with brain_map and its core. Open the chapters the job needs; search gaps. Never guess unknown facts.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
