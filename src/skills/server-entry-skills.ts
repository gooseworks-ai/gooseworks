// The entry skill text our server builds, copied here because the CLI
// cannot import gooseworks-app. Do not edit by hand.
//
// Source: gooseworks-app video/b2-product-first @ 03b506b60
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
export const SERVER_RULEBOOK_VERSION = '0.6.0';

export const SERVER_VIDEO_ENTRY_SKILLS = {
  'goose-video': `---
name: goose-video
description: "Make a video ad with GooseWorks in this chat: ask which product first, read the brand, then video_formats, and follow the next_step in every answer."
version: 4.1.0
---

# GooseWorks video

Use GooseWorks to make the customer's video, here in this chat. For a video already started (they name it, or a card sends it), call video_read and follow its next_step.

For a new video, in this order:

1. The product. If the customer hasn't said which product the video is for, ask them, offering the brand's products by name from brand_read (sections: products). Skip the question when the brand has only one product.
2. Research before any style. Read the brand kit, its learnings and the chosen products in full with brand_read (sections kit and learnings, with the products' ids): their photos, specs and creative notes. Search the brand's knowledge for those products with knowledge_search. Then tell the customer in two or three plain lines what the video should say and what it should avoid.
3. Call video_formats with the customer's own words as the request and the chosen products' ids.
4. The customer picks the style; never suggest one. With the style card on screen, say one short line and wait. Without a card, list the styles that fit, each with its name, one line and its price as written, and ask which one they want.
5. Then follow the next_step in every answer. It says what to do at each stage, from the plan to the finished video, so there is nothing else to read.

## Rules

- Talk to marketers: what they get and what they decide, never how it is made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens in this chat: never ask the customer to install anything or use a CLI, slash command or other app; the only commands are gooseworks video check and gooseworks video make <id>, when a next_step gives them.
- Money is a credit number, exactly as an answer gives it: never dollars, never your own math.
- Follow the next_step in every answer; it says what to do now.
- With a card on screen (display_hint "widget"), add at most one short line; never re-list it or its links.
- Paid work needs the customer's yes to the credit total first. For video only their click on the plan card counts; you never approve.
- Only the customer's click on the plan card approves a video; a yes typed in chat is not an approval.
- Where the app can't show the card, give the customer the plan link; they press the button there.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
`,
  'make-custom-video': `---
name: make-custom-video
description: "Make an original video from a brief or a reference video with GooseWorks in this chat: ask which product first, read the brand, then video_formats, and follow the next_step in every answer."
version: 3.1.0
---

# GooseWorks video

Use GooseWorks to make the customer's video, here in this chat. For a video already started (they name it, or a card sends it), call video_read and follow its next_step.

For a new video, in this order:

1. The product. If the customer hasn't said which product the video is for, ask them, offering the brand's products by name from brand_read (sections: products). Skip the question when the brand has only one product.
2. Research before any style. Read the brand kit, its learnings and the chosen products in full with brand_read (sections kit and learnings, with the products' ids): their photos, specs and creative notes. Search the brand's knowledge for those products with knowledge_search. Then tell the customer in two or three plain lines what the video should say and what it should avoid.
3. Call video_formats with the customer's own words as the request and the chosen products' ids.
4. The customer picks the style; never suggest one. With the style card on screen, say one short line and wait. Without a card, list the styles that fit, each with its name, one line and its price as written, and ask which one they want.
5. Then follow the next_step in every answer. It says what to do at each stage, from the plan to the finished video, so there is nothing else to read.

## Rules

- Talk to marketers: what they get and what they decide, never how it is made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens in this chat: never ask the customer to install anything or use a CLI, slash command or other app; the only commands are gooseworks video check and gooseworks video make <id>, when a next_step gives them.
- Money is a credit number, exactly as an answer gives it: never dollars, never your own math.
- Follow the next_step in every answer; it says what to do now.
- With a card on screen (display_hint "widget"), add at most one short line; never re-list it or its links.
- Paid work needs the customer's yes to the credit total first. For video only their click on the plan card counts; you never approve.
- Only the customer's click on the plan card approves a video; a yes typed in chat is not an approval.
- Where the app can't show the card, give the customer the plan link; they press the button there.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.
`,
} as const;

export type ServerVideoEntrySlug = keyof typeof SERVER_VIDEO_ENTRY_SKILLS;

/** renderEntrySkillRules(product) for the products the CLI's own entry skills cover. */
export const SERVER_ENTRY_SKILL_RULES = {
  all: `- Talk to marketers: what they get and what they decide, never how it is made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens in this chat: never ask the customer to install anything or use a CLI, slash command or other app; the only commands are gooseworks video check and gooseworks video make <id>, when a next_step gives them.
- Money is a credit number, exactly as an answer gives it: never dollars, never your own math.
- Follow the next_step in every answer; it says what to do now.
- With a card on screen (display_hint "widget"), add at most one short line; never re-list it or its links.
- Paid work needs the customer's yes to the credit total first. For video only their click on the plan card counts; you never approve.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  ads: `- Talk to marketers: what they get and what they decide, never how it is made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens in this chat: never ask the customer to install anything or use a CLI, slash command or other app; the only commands are gooseworks video check and gooseworks video make <id>, when a next_step gives them.
- Money is a credit number, exactly as an answer gives it: never dollars, never your own math.
- Follow the next_step in every answer; it says what to do now.
- With a card on screen (display_hint "widget"), add at most one short line; never re-list it or its links.
- Paid work needs the customer's yes to the credit total first. For video only their click on the plan card counts; you never approve.
- Before choosing an angle, claim, product or source, or asking a brand fact: brand_read, then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
  photos: `- Talk to marketers: what they get and what they decide, never how it is made.
- Never mention tools, ids, JSON, commands, software, vendors, models, timings, retries or your checks.
- Everything happens in this chat: never ask the customer to install anything or use a CLI, slash command or other app; the only commands are gooseworks video check and gooseworks video make <id>, when a next_step gives them.
- Money is a credit number, exactly as an answer gives it: never dollars, never your own math.
- Follow the next_step in every answer; it says what to do now.
- With a card on screen (display_hint "widget"), add at most one short line; never re-list it or its links.
- Paid work needs the customer's yes to the credit total first. For video only their click on the plan card counts; you never approve.
- Before choosing an angle, claim, product or source, or asking a brand fact: brand_read, then knowledge_search for the task.
- Never invent an offer, a claim or proof.
- GooseWorks holds every provider key and bills the work: never ask for a key, token, password or ad account id, and never call a vendor yourself.`,
} as const;
