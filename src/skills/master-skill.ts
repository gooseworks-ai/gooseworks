/**
 * The entry skills the CLI installs into ~/.agents/skills/ and commits under
 * skills/ (the backend serves the committed copies to chat apps):
 *
 *   - `gooseworks`           the router: hands specialist work to its skill and
 *                            does data work with the gooseworks commands.
 *   - `goose-ads`            image ads: make, edit and study them.
 *   - `goose-product-photos` product photos.
 *   - `goose-video`, `make-custom-video`
 *                            our server's video entry skills, copied as built
 *                            (server-entry-skills.ts). Every answer's next_step
 *                            carries the step for the video's stage.
 *   - `goose-video-local`    one line: run the kit when a next_step says so.
 *
 * Each skill names only the actions in the action contract, states no price,
 * asks for no install and stays within the rulebook's size limit; the rules
 * block of every skill comes from the rulebook (tests/skills/skill-lint.test.ts).
 * Recipe skills live in goose-skills and are fetched when needed.
 */
import { renderBrandGrowthTable, renderDomainRouteTable } from './routes';
import { SERVER_ENTRY_SKILL_RULES, SERVER_VIDEO_ENTRY_SKILLS } from './server-entry-skills';

export interface EntrySkill {
  /** Install dir name under ~/.agents/skills/ AND the skill `name`. */
  name: string;
  content: string;
}

/** The kit command, as the server's next_step gives it. */
export const KIT_MAKE_COMMAND = 'gooseworks video make <id>';

/**
 * THE registry of entry skills (GOOSE-3190) — one list, four consumers:
 *   - `gooseworks install` / `update` / login-refresh write exactly these dirs,
 *   - `npm run generate:skills` regenerates exactly these `skills/<name>/SKILL.md`,
 *   - `skills/names.ts` derives which dirs the CLI is allowed to delete,
 *   - the backend raw-fetches these paths for chat apps.
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

/** The router (`gooseworks`): specialist routes, the video pointer and the terminal data commands. */
export function getMasterSkillContent(): string {
  return `---
name: gooseworks
slug: gooseworks
description: >
  GooseWorks growth coworker and router. Research brands, customers, competitors, creators,
  markets and prospects; make and study ads, product photos, graphics and video; search and
  scrape public web and social data; find and enrich leads. The one GooseWorks entry point
  for brand growth, B2B, sales, research and GTM work.
category: general
version: 2.0.0
author: GooseWorks
tags: [gooseworks, data, scraping, search, research, gtm, leads, prospecting, ads, video]
---

# GooseWorks

GooseWorks is a coworker with specialist skills for research, analysis, creative work, lead
generation, enrichment and public web and social data. Hand specialist work to its skill; do
data work here.

## First steps

1. If the customer has no brand yet, call brand_setup and follow its next_step. Keep their
   request and carry on with it once the brand is ready.
2. Read the brand with brand_read, then knowledge_search for this task. Pass both to the skill
   you route to, and never ask the customer for something they already answer.
3. When the customer states a lasting fact or rule about the brand, save it with brand_update
   and check it with brand_read before saying it is saved.

## Route to the right skill

| If the user wants… | Route to | How |
| --- | --- | --- |
${renderDomainRouteTable()}
| Anything else: scraping, research, lead lists, enrichment, any data lookup | (stay here) | Follow "Data work" below. |

When the server's next_step says to make a video on this computer, run \`${KIT_MAKE_COMMAND}\`.

## Brand growth skills

| Job | Skill |
| --- | --- |
${renderBrandGrowthTable()}

Fetch a skill before following it, and hand it the brand you read.

## Data work

In a chat app use the actions: catalog_search finds a skill, catalog_fetch opens it, data_get
and data_post make its paid data calls, and account_whoami shows the credit balance.

In a terminal use the commands:

- \`gooseworks search "<task>"\` finds a skill; \`gooseworks fetch <slug>\` prints its instructions,
  scripts, files and dependencies.
- Save every script and file under \`/tmp/gooseworks-scripts/<slug>/\` (files under \`tools/\` go to
  \`/tmp/gooseworks-scripts/tools/\`), never in the user's project, then follow the skill's steps.
- \`gooseworks call <provider> <path>\` calls a provider through GooseWorks; \`--query\` and \`--body\`
  take JSON. Use it in place of any raw request a skill shows. A script that needs the GooseWorks
  settings gets them from \`gooseworks env\`.
- When no skill fits, \`gooseworks orthogonal find "<task>"\` finds an API,
  \`gooseworks orthogonal describe <api> <path>\` shows its parameters and \`gooseworks call\` runs it.
- \`gooseworks credits\` shows the balance. If a command says you are not signed in, run
  \`gooseworks login\` and let the customer finish signing in.
- Results go in \`~/Gooseworks/\` unless the customer names a place. Ask before saving, and never
  overwrite a file.

Before paid calls, tell the customer how many calls it will take and the credit total, and wait
for their yes. Each paid answer says what it charged.

## Rules

${SERVER_ENTRY_SKILL_RULES.all}
`;
}

/** Image ads: make, edit and study them. */
export function getGooseAdsSkillContent(): string {
  return `---
name: goose-ads
slug: goose-ads
description: Make, edit and study image ads with GooseWorks in this chat, from the brand's own products and approved sources. Start with brand_read and follow the next_step in every answer.
category: ads
version: 3.0.0
author: GooseWorks
---

# GooseWorks ads

Use GooseWorks to make and improve the customer's image ads, here in this chat. Recommend one
direction with a one-line reason and offer at most two others.

- New ads: pick a source from the brand's own ads and templates, or find one with catalog_search
  and open it with catalog_fetch. ads_generate makes the ads: get its price first, tell the
  customer the credit total, and make them only after their yes.
- A batch on its way: job_get. Finished ads: ads_read.
- One ad: another take, an edit, a new size, an animation, its tags or the customer's rating, all
  with ads_edit.
- The customer's own image as a template: ads_template_save. Their files: media_upload.
- Campaigns: campaign_read, campaign_save and campaign_ideas. campaign_generate plans and prices a
  campaign's ads; ads_review makes them once the customer says yes to the total.
- How ads are doing: meta_read, or an analysis skill found with catalog_search, whose data comes
  through data_get and data_post.

Then follow the next_step in every answer.

## Rules

${SERVER_ENTRY_SKILL_RULES.ads}
`;
}

/** Product photos of the brand's real, physical products. */
export function getGooseProductPhotosSkillContent(): string {
  return `---
name: goose-product-photos
slug: goose-product-photos
description: Make product photos (studio, lifestyle or on a model) of a brand's real products with GooseWorks in this chat. Start with brand_read and follow the next_step in every answer.
category: ads
version: 1.0.0
author: GooseWorks
---

# GooseWorks product photos

Use GooseWorks to photograph the customer's physical products, here in this chat. A software
screen or an app is not a product photo.

- Offer the brand's real products from brand_read; never describe one you can't see. A product
  that isn't listed yet: brand_update adds it from its page. A photo the customer sends:
  media_upload.
- photos_generate makes the photos: get its price first, tell the customer the credit total, and
  make them only after their yes. Show a person only when the customer asks for one and confirms
  they have the rights.
- Follow the photos with photos_read until they are ready.
- Keep or drop photos with media_update. Only kept photos join the brand kit and reach ads.

Then follow the next_step in every answer.

## Rules

${SERVER_ENTRY_SKILL_RULES.photos}
`;
}

/** Our server's goose-video entry skill, as built. */
export function getGooseVideoSkillContent(): string {
  return SERVER_VIDEO_ENTRY_SKILLS['goose-video'];
}

/** Our server's make-custom-video entry skill, as built. */
export function getMakeCustomVideoSkillContent(): string {
  return SERVER_VIDEO_ENTRY_SKILLS['make-custom-video'];
}

/** One line: the kit makes the video when the server says so. */
export function getGooseVideoLocalSkillContent(): string {
  return `---
name: goose-video-local
description: Make an approved GooseWorks video on this computer when the server's next_step says to.
version: 1.0.0
---

Run \`${KIT_MAKE_COMMAND}\` when the server's next_step says so.
`;
}
