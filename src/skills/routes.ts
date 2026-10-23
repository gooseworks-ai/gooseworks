/**
 * THE routing table for the GooseWorks skill family (GOOSE-3190).
 *
 * Routing used to be written out by hand in THREE places that drifted apart:
 *   1. this CLI's `gooseworks` router SKILL.md (`master-skill.ts`),
 *   2. the backend's entry-skill list
 *      (`gooseworks-app/apps/api/src/services/entry-skills.ts`),
 *   3. the public skills repo's `collections/brand-growth`.
 *
 * This file is now the SINGLE SOURCE. `master-skill.ts` renders its markdown
 * tables from here (no hand-written route rows), `npm run generate:skills`
 * emits the machine-readable copy to `skills/routes.json` for the other two
 * repos to derive from, and `tests/skills/route-drift.test.ts` fails when any
 * of the three names a skill the others don't.
 *
 * The two consumers we cannot edit from this repo are represented by checked-in
 * snapshots under `tests/fixtures/`; each snapshot names the file to update when
 * the drift test fires.
 */

/** How a routed skill reaches the agent. */
export type RouteDelivery =
  /** Vendored by this CLI and installed to ~/.agents/skills/. */
  | 'entry'
  /** Lives in goose-skills; fetched on demand with `gooseworks fetch <slug>`. */
  | 'fetch';

export interface DomainRoute {
  /** The skill slug to route to. */
  skill: string;
  /** When this route applies — the left column of the router table. */
  when: string;
  /** How the agent gets the skill — the right column of the router table. */
  how: string;
  delivery: RouteDelivery;
}

export interface BrandGrowthRoute {
  /** The job to be done. */
  job: string;
  /** The skill slug(s) that do it, in order. */
  skills: string[];
}

/**
 * Domain routes — the "Route to the right skill FIRST" table. These are the
 * specialist skills the `gooseworks` router hands whole tasks to.
 */
export const DOMAIN_ROUTES: DomainRoute[] = [
  {
    skill: 'marketing-data-access',
    when: 'Raw social post lists, engagement rankings or voices lists',
    how: 'Fetch marketing-data-access and follow focused-reads.md.',
    delivery: 'fetch',
  },
  {
    skill: 'voice-card',
    when: 'Learn a reusable brand or author voice from blog posts or social writing',
    how: 'Fetch it with catalog_fetch, or `gooseworks fetch voice-card` in a terminal.',
    delivery: 'fetch',
  },
  {
    skill: 'make-static-ads',
    when: 'Static/image ads, including campaigns, more ads, winner variants, copy/font changes or rejected-image fixes',
    how: 'Fetch with catalog_fetch or gooseworks fetch; follow selection/review/quote gates. Stop creation if unavailable.',
    delivery: 'fetch',
  },
  {
    skill: 'goose-ads',
    when: 'Change one ad already made in GooseWorks (an edit, a new size, its tags or rating), or save the customer\'s image as a template. New image ads: `make-static-ads`',
    how: 'Open it with catalog_fetch in a chat app, or the installed copy in a terminal.',
    delivery: 'entry',
  },
  {
    skill: 'goose-graphics',
    when: 'Charts, infographics, slides, social graphics, branded visual designs from a style or format',
    how: 'Fetch it with catalog_fetch, or `gooseworks fetch goose-graphics` in a terminal.',
    delivery: 'fetch',
  },
  {
    skill: 'goose-video',
    when: 'Any **video**: a video ad from a style, an original video from a brief or a reference video, or a video already started',
    how: 'Explicit custom skips the picker; otherwise watch the reference, read the brand and compare style constraints.',
    delivery: 'entry',
  },
  {
    skill: 'goose-product-photos',
    when: 'Make **product photos**: studio, lifestyle, marketplace, social or on a model',
    how: 'Open it with catalog_fetch in a chat app, or the installed copy in a terminal.',
    delivery: 'entry',
  },
  {
    skill: 'animate-image',
    when: 'Animate an approved static ad or product image',
    how: 'Fetch it with catalog_fetch, or `gooseworks fetch animate-image` in a terminal.',
    delivery: 'fetch',
  },
];

/**
 * Entry skills the router does not route to. An app may still ask for them
 * by name, so the CLI keeps installing them.
 */
export const UNROUTED_ENTRY_SKILLS: Readonly<Record<string, string>> = {
  'make-custom-video': 'Keeps an explicit custom choice without a picker, studies its reference and checks custom support; fetching this entry alone does not enable production.',
  'goose-video-local': 'One line: a next_step that gives the kit command says who starts it.',
};

/**
 * Brand Growth routes — the marketing playbooks in the `brand-growth` collection,
 * one job and one playbook per row. Must stay in sync with
 * `goose-skills/collections/brand-growth/routes.json`, which is derived from this list.
 */
export const BRAND_GROWTH_ROUTES: BrandGrowthRoute[] = [
  { job: 'Not sure what to do first', skills: ['where-to-start'] },
  { job: 'Market size, trends, brand watch and launch positioning', skills: ['research-market'] },
  { job: 'Competitor research, battlecards, landing-page tools and post engagers', skills: ['research-competitors'] },
  { job: 'Who buys and why; prospect lists, lead enrichment and work contacts', skills: ['research-audience'] },
  { job: 'Cold email and LinkedIn drafts, replies and an import file; you send', skills: ['write-outreach'] },
  { job: 'A campaign plan from a budget and a date', skills: ['plan-campaign'] },
  { job: 'New static image ads', skills: ['make-static-ads'] },
  { job: 'Launch, scale or pause paid ads', skills: ['run-paid-campaigns'] },
  { job: 'What worked; performance reports', skills: ['analyze-performance'] },
  { job: 'Subscriber email flows and broadcast drafts; you send', skills: ['email-lifecycle'] },
  { job: 'SEO audits, metrics, keyword gaps, topic clusters, page-set plans and AI visibility', skills: ['improve-search-visibility'] },
  { job: 'Influencers and UGC creators', skills: ['work-with-creators'] },
  { job: 'Posts, articles, newsletters and one or more content briefs', skills: ['make-content'] },
  { job: 'Organic social research, posts, voices, calendar and drafts', skills: ['run-organic-social'] },
];

/** Every skill slug named by any route, deduped and sorted. */
export function getRoutedSkillSlugs(): string[] {
  const slugs = new Set<string>();
  for (const r of DOMAIN_ROUTES) slugs.add(r.skill);
  for (const r of BRAND_GROWTH_ROUTES) for (const s of r.skills) slugs.add(s);
  return [...slugs].sort();
}

/** Brand Growth slugs only (the ones the goose-skills collection must contain). */
export function getBrandGrowthSkillSlugs(): string[] {
  const slugs = new Set<string>();
  for (const r of BRAND_GROWTH_ROUTES) for (const s of r.skills) slugs.add(s);
  return [...slugs].sort();
}

/** The machine-readable route table emitted to `skills/routes.json`. */
export function getRouteManifest(): {
  $comment: string;
  version: number;
  domain_routes: DomainRoute[];
  brand_growth_routes: BrandGrowthRoute[];
  skills: string[];
} {
  return {
    $comment:
      'Generated by `npm run generate:skills` from gooseworks/src/skills/routes.ts — the single source for GooseWorks skill routing (GOOSE-3190). Do not hand-edit. Consumers: goose-skills/collections/brand-growth/routes.json.',
    version: 1,
    domain_routes: DOMAIN_ROUTES,
    brand_growth_routes: BRAND_GROWTH_ROUTES,
    skills: getRoutedSkillSlugs(),
  };
}

/** Render the domain route table as the router SKILL.md markdown table body. */
export function renderDomainRouteTable(): string {
  return DOMAIN_ROUTES.map(
    (r) => `| ${r.when} | **\`${r.skill}\`** | ${r.how} |`,
  ).join('\n');
}

/** Render the Brand Growth job→skill table body. */
export function renderBrandGrowthTable(): string {
  return BRAND_GROWTH_ROUTES.map(
    (r) => `| ${r.job} | ${r.skills.map((s) => `\`${s}\``).join(', ')} |`,
  ).join('\n');
}
