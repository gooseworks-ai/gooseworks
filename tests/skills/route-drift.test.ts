/**
 * GOOSE-3190 — routing drift guard.
 *
 * Routing is declared in three places that used to be hand-synced:
 *   1. THIS repo's `src/skills/routes.ts` (now the SINGLE SOURCE),
 *   2. `gooseworks-app/backend/src/app-mcp-server/lib/ads-skill.ts` (not editable
 *      from here — represented by a checked-in snapshot),
 *   3. `goose-skills/collections/brand-growth` (derived from #1 — also snapshotted).
 *
 * This test fails when any source names a skill the others don't, and the failure
 * message names the file to update.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  DOMAIN_ROUTES,
  getRoutedSkillSlugs,
  getBrandGrowthSkillSlugs,
  getRouteManifest,
  renderDomainRouteTable,
  renderBrandGrowthTable,
} from '../../src/skills/routes';
import { getMasterSkillContent, getEntrySkillNames } from '../../src/skills/master-skill';

interface RouteSnapshot {
  source_repo: string;
  source_file: string;
  entry_skills?: string[];
  brand_growth_skills: string[];
}

function loadSnapshot(name: string): RouteSnapshot {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf-8'),
  ) as RouteSnapshot;
}

const backend = loadSnapshot('backend-ads-skill.routes.json');
const publicSkills = loadSnapshot('goose-skills-brand-growth.routes.json');

function where(snapshot: RouteSnapshot): string {
  return `${snapshot.source_repo}/${snapshot.source_file}`;
}

describe('routing single source (GOOSE-3190)', () => {
  const routed = new Set(getRoutedSkillSlugs());
  const entrySkills = new Set(getEntrySkillNames());

  it('the router SKILL.md renders its route tables from routes.ts, not by hand', () => {
    const content = getMasterSkillContent();
    expect(content).toContain(renderDomainRouteTable());
    expect(content).toContain(renderBrandGrowthTable());
    // Every routed slug must actually appear in the rendered document.
    for (const slug of getRoutedSkillSlugs()) {
      expect(content).toContain(slug);
    }
  });

  it('every vendored entry skill is reachable from the domain route table', () => {
    const domainSkills = new Set(DOMAIN_ROUTES.map((r) => r.skill));
    for (const name of entrySkills) {
      if (name === 'gooseworks') continue; // the router itself
      expect(domainSkills.has(name)).toBe(true);
    }
  });

  it('a route marked `entry` is really a vendored entry skill', () => {
    for (const route of DOMAIN_ROUTES) {
      if (route.delivery !== 'entry') continue;
      expect(entrySkills.has(route.skill)).toBe(true);
    }
  });

  it.each([
    ['backend hosted-connector pointer', backend],
    ['goose-skills brand-growth collection', publicSkills],
  ])('%s names no skill the CLI route table is missing', (_label, snapshot) => {
    const declared = [...(snapshot.entry_skills || []), ...snapshot.brand_growth_skills]
      // `gooseworks` IS the router — it routes to the others, not to itself.
      .filter((slug) => slug !== 'gooseworks');
    const missing = declared.filter((slug) => !routed.has(slug));
    expect(
      missing,
      // Jest prints the received value; keep the actionable hint in the message.
    ).toEqual([]);
    if (missing.length) {
      throw new Error(
        `${where(snapshot)} routes to ${missing.join(', ')}, which gooseworks/src/skills/routes.ts does not. ` +
          `Add them there (the single source), then re-capture tests/fixtures/.`,
      );
    }
  });

  it('the CLI Brand Growth table is fully covered by the goose-skills collection', () => {
    // Entry skills are vendored here, not members of the public collection.
    const missing = getBrandGrowthSkillSlugs()
      .filter((slug) => !entrySkills.has(slug))
      .filter((slug) => !publicSkills.brand_growth_skills.includes(slug));
    if (missing.length) {
      throw new Error(
        `routes.ts routes Brand Growth work to ${missing.join(', ')}, which ${where(publicSkills)} ` +
          `does not list. Add them to goose-skills (skill.meta.json \`collections: ["brand-growth"]\`), ` +
          `run \`npm run build:index\` there, and update tests/fixtures/goose-skills-brand-growth.routes.json.`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('the generated routes.json manifest matches the route table', () => {
    const manifestPath = path.join(__dirname, '..', '..', 'skills', 'routes.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(onDisk).toEqual(getRouteManifest());
  });
});
