/**
 * THE routing table for the GooseWorks skill family (GOOSE-3190).
 *
 * Routing used to be written out by hand in THREE places that drifted apart:
 *   1. this CLI's `gooseworks` router SKILL.md (`master-skill.ts`),
 *   2. the backend's hosted-connector pointer
 *      (`gooseworks-app/backend/src/app-mcp-server/lib/ads-skill.ts`),
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
    skill: 'goose-ads',
    when: 'Remix/make an ad, research a brand for ads, OR analyze ad performance — Meta/Google ad campaigns, creative fatigue, CAC/lead quality, competitor ad intel, ad angles & hooks',
    how: 'Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`.',
    delivery: 'entry',
  },
  {
    skill: 'goose-graphics',
    when: 'Charts, infographics, slides, social graphics, branded visual designs from a style/format',
    how: 'If installed locally, use it. Otherwise `gooseworks fetch goose-graphics` (or `gooseworks install --claude --with goose-graphics`).',
    delivery: 'fetch',
  },
  {
    skill: 'goose-video',
    when: 'Make a **video** ad — remix a video ad template (e.g. iMessage chat-reveal), or "make the video for project <id>"',
    how: 'Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`.',
    delivery: 'entry',
  },
  {
    skill: 'goose-product-photos',
    when: 'Make **product photos** — studio, lifestyle, marketplace, social, or on-model product photography',
    how: 'Installed locally as an entry skill. Just use it. If unavailable, run `gooseworks install --claude`.',
    delivery: 'entry',
  },
  {
    skill: 'animate-image',
    when: 'Animate an approved static ad or product image',
    how: 'Fetch with `gooseworks fetch animate-image` and follow its GooseWorks MCP workflow.',
    delivery: 'fetch',
  },
];

/**
 * Brand Growth routes — the outcome skills in the `brand-growth` collection.
 * Must stay in sync with `goose-skills/collections/brand-growth/routes.json`,
 * which is derived from this list.
 */
export const BRAND_GROWTH_ROUTES: BrandGrowthRoute[] = [
  { job: 'Brand foundation', skills: ['brand-research'] },
  { job: 'Competitor ads', skills: ['competitor-ad-intelligence'] },
  { job: 'Customer language and angles', skills: ['comment-mining', 'ad-angle-miner'] },
  { job: 'Competitor social content', skills: ['competitor-social-research'] },
  { job: 'Audience definition', skills: ['audience-research'] },
  { job: 'Creator discovery and evaluation', skills: ['influencer-prospecting', 'creator-profile-teardown'] },
  { job: 'Trends and outlier posts', skills: ['trend-discovery', 'outlier-post-finder'] },
  { job: 'Social listening and product demand', skills: ['social-listening-brief', 'product-demand-research'] },
  { job: 'Long-form source material (calls, podcasts, videos)', skills: ['transcript-intelligence'] },
  {
    job: 'Meta performance, policy, and landing-page match',
    skills: ['meta-ads-analyzer', 'meta-ad-policy-checker', 'ad-to-landing-page-auditor'],
  },
  { job: 'Static ads', skills: ['goose-ads', 'remix-graphic-ad-from-reference'] },
  { job: 'Product photos', skills: ['goose-product-photos', 'product-photoshoot'] },
  { job: 'Written content and repurposing', skills: ['content-repurposing'] },
  { job: 'Graphics and animation', skills: ['goose-graphics', 'animate-image'] },
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
      'Generated by `npm run generate:skills` from gooseworks/src/skills/routes.ts — the single source for GooseWorks skill routing (GOOSE-3190). Do not hand-edit. Consumers: goose-skills/collections/brand-growth/routes.json and gooseworks-app/backend/src/app-mcp-server/lib/ads-skill.ts.',
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
