/**
 * The entry skills the CLI installs into ~/.agents/skills/ and commits under
 * skills/ (the backend serves the published package's copies to chat apps):
 *
 *   - `gooseworks`           the router: hands specialist work to its skill and
 *                            does data work with the gooseworks commands.
 *   - `goose-ads`            image ads: make, edit and study them.
 *   - `goose-product-photos` product photos.
 *   - `goose-video`, `make-custom-video`
 *                            server-backed video snapshots with scoped updates
 *                            (server-entry-skills.ts). Every answer's next_step
 *                            carries the step for the video's stage.
 *   - `goose-video-local`    one line: a next_step that gives the kit's command
 *                            says who starts it. No skill spells out the
 *                            command or its version: each answer hands over
 *                            its own.
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

/**
 * THE registry of entry skills (GOOSE-3190) — one list, four consumers:
 *   - `gooseworks install` / `update` / login-refresh write exactly these dirs,
 *   - `npm run generate:skills` regenerates exactly these `skills/<name>/SKILL.md`,
 *   - `skills/names.ts` derives which dirs the CLI is allowed to delete,
 *   - the backend fetches these paths from the published package for chat apps.
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
  GooseWorks growth coworker and router. Research markets, competitors, audiences and
  creators; plan campaigns; make ads, product photos, graphics, video and content; run paid
  ads, email, SEO and social; find leads and contacts. The one GooseWorks entry point
  for brand growth, B2B, sales, research and GTM work. Also use it when the user mentions their
  GooseWorks brand's offers, prices, rules, audience or bestsellers, or wants copy for it
  (captions, posts, emails), so those facts reach its Marketing Brain.
category: general
version: 2.2.1
author: GooseWorks
tags: [gooseworks, data, scraping, search, research, gtm, leads, prospecting, ads, video]
---

# GooseWorks

GooseWorks is a coworker with specialist skills for research, creative work, leads and web and
social data. Hand specialist work to its skill; do data work here.

## First steps

1. Discover the listed setup/status action and read the actual brand/task state. Complete
   missing factual prerequisites; preserve an already selected brand and task. Continue once
   setup is done instead of restarting a picker.
2. Read brand_read, then use the advertised brand-knowledge browse/search/read actions for
   rules and task evidence. Pass those results into the chosen playbook. Use legacy names
   only when this connection actually lists them; ask only what remains ambiguous.
3. Save lasting human brand facts in their words through the listed typed knowledge action;
   guesses and temporary creative choices remain proposals. Follow actual claim, rights and
   approval restrictions; a generic context result is not approved product proof.

## Route to the right skill

| If the user wants… | Route to | How |
| --- | --- | --- |
${renderDomainRouteTable()}
| Anything else: find a skill or a single step | (stay here) | catalog_search, or \`gooseworks search\` in a terminal; see "Data work". |

## Marketing playbooks

| Job | Playbook |
| --- | --- |
${renderBrandGrowthTable()}

Fetch the playbook with its dependencies and brand context. Static creation requires
make-static-ads; fetch it or stop. Its research and selection run even for one ad or finals only.

## Data work

In a chat app use the actions: catalog_search finds a skill, catalog_fetch opens it, data_get
and data_post make its paid data calls, and account_whoami shows credits.

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
  \`gooseworks login\` and let the customer finish signing in. In a cloud sandbox or over SSH,
  run \`gooseworks login --device --no-wait\`, show the customer its link and code, and run
  \`gooseworks login --device\` once they approve.
- No GooseWorks actions here but a signed-in CLI? \`gooseworks tool --list\` lists them;
  \`gooseworks tool <name> '<json>'\` calls one.
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
description: Edit, resize, animate and study image ads with GooseWorks in this chat. New static or image ads go to the make-static-ads skill when it is installed or catalog_fetch opens it. Read the brand and follow the active playbook, preserving factual prerequisites and approvals.
category: ads
version: 3.2.1
author: GooseWorks
---

# GooseWorks ads

Use this entry for existing-ad operations and analysis. For new image ads, more ads, a winner's
variations, copy/font changes, a rejected ad fix or a requested social graphic, fetch
make-static-ads with catalog_fetch (or use the installed current package) and follow its
research, selection, claims and quote gates. If it cannot be fetched, report that creation
is unavailable on this connection and stop. The server generator is a different workflow,
not a fallback for the missing playbook.

- Save lasting human brand facts with the connection's listed knowledge action in their words.
- A batch on its way: job_get. Finished ads: ads_read.
- One finished ad: a new size, an animation, its tags or the customer's rating, all with ads_edit.
- The customer's own image as a template: ads_template_save. Their files: media_upload.
- Campaign planning/launch requests use their matching marketing playbook. Static creation for
  a campaign still uses make-static-ads; a campaign record is input, not a generation fallback.
- How ads are doing: meta_read, or an analysis skill found with catalog_search, whose data comes
  through data_get and data_post.

For these existing-ad actions, follow the actual execution next_step.

## Rules

${SERVER_ENTRY_SKILL_RULES.ads}
`;
}

/** Product photos of the brand's real, physical products. */
export function getGooseProductPhotosSkillContent(): string {
  return `---
name: goose-product-photos
slug: goose-product-photos
description: Make product photos (studio, lifestyle or on a model) of a brand's real products with GooseWorks in this chat. Start brand work with brain_map and follow the next_step in every answer.
category: ads
version: 1.1.0
author: GooseWorks
---

# GooseWorks product photos

Use GooseWorks to photograph the customer's physical products, here in this chat. A software
screen or an app is not a product photo.

- A fact the customer states about the brand (a price, a rule, their audience): save it with
  brain_save in their words, never in your own notes, and confirm in one line.
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

/** The reviewed goose-video snapshot, including its approval-only backport. */
export function getGooseVideoSkillContent(): string {
  return SERVER_VIDEO_ENTRY_SKILLS['goose-video'];
}

/** The reviewed make-custom-video snapshot, including its approval-only backport. */
export function getMakeCustomVideoSkillContent(): string {
  return SERVER_VIDEO_ENTRY_SKILLS['make-custom-video'];
}

/** One line: the kit makes the video when the server says so. */
export function getGooseVideoLocalSkillContent(): string {
  return `---
name: goose-video-local
description: Make an approved GooseWorks video when an answer's next_step gives its command.
version: 1.0.3
---

When an answer's next_step gives a command to make a video, its last line says who starts it and how: follow that line exactly, with the command exactly as given.
`;
}
