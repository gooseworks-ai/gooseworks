import { DOMAIN_ROUTES } from '../../src/skills/routes';
import { getMasterSkillContent, getGooseAdsSkillContent } from '../../src/skills/master-skill';
import { SERVER_ENTRY_SKILL_RULES } from '../../src/skills/server-entry-skills';

it('delivers the static playbook directly while keeping existing-ad operations available', () => {
  const route = DOMAIN_ROUTES.find((r) => r.skill === 'make-static-ads');
  expect(route?.delivery).toBe('fetch');
  expect(DOMAIN_ROUTES.findIndex((r) => r.skill === 'make-static-ads'))
    .toBeLessThan(DOMAIN_ROUTES.findIndex((r) => r.skill === 'goose-ads'));
  expect(DOMAIN_ROUTES.find((r) => r.skill === 'goose-ads')?.delivery).toBe('entry');
});

it('removes the alternative generator from the entry rather than merely adding a later gate', () => {
  const ads = getGooseAdsSkillContent();
  expect(ads).toContain('catalog_fetch');
  expect(ads).not.toContain('ads_generate');
  expect(ads).toContain('stop');
  expect(getMasterSkillContent()).not.toContain('call brand_setup with action status');
});

it('qualifies generic next steps without changing video or product-photo authority', () => {
  for (const rules of [SERVER_ENTRY_SKILL_RULES.all, SERVER_ENTRY_SKILL_RULES.ads]) {
    expect(rules).toContain('spend approval');
    expect(rules).toContain('publishing');
    expect(rules).not.toContain('Follow the next_step in every answer.');
  }
  expect(SERVER_ENTRY_SKILL_RULES.photos).toContain('Follow the next_step in every answer.');
});
