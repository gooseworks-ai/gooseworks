import { AD_PAGE_OFFER, getEntrySkills } from '../../src/skills/master-skill';
import { BRAND_GROWTH_ROUTES } from '../../src/skills/routes';

it('both ad entry points hand off to the same reachable catalog skill', () => {
  const entries = getEntrySkills();
  for (const name of ['goose-ads', 'goose-video']) {
    const content = entries.find((entry) => entry.name === name)!.content;
    expect(content.split(AD_PAGE_OFFER)).toHaveLength(2);
  }
  expect(BRAND_GROWTH_ROUTES.filter((route) => route.skills.includes('goose-pages'))).toHaveLength(1);
  // A catalog composite must not accidentally become a second vendored entry.
  expect(entries.some((entry) => entry.name === 'goose-pages')).toBe(false);
});
