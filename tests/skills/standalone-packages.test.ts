import { resolveStandalonePackages, type StandaloneIndex } from '../../src/skills/standalone-packages';

const index = { skills: [
  { slug: 'job', path: 'marketing-agent/skills/job', metadata: { requires_skills: ['step'] } },
  { slug: 'step', path: 'marketing-agent/skills/step', metadata: { requires_skills: ['shared'] } },
  { slug: 'shared', path: 'marketing-agent/skills/shared' }
], retired_skills: [{ slug: 'old-job', replacement: 'job' }] };

test('includes transitive siblings once, before the playbook', () => {
  expect(resolveStandalonePackages(index, 'job').map(entry => entry.slug)).toEqual(['shared', 'step', 'job']);
});
test('a retired name gives its replacement and never resolves old files', () => {
  expect(() => resolveStandalonePackages(index, 'old-job')).toThrow(/retired.*job/);
});
test('fails before any install on a missing dependency', () => {
  expect(() => resolveStandalonePackages({ skills: [index.skills[0]] }, 'job')).toThrow(/missing/);
  expect(resolveStandalonePackages({ skills: [{ slug: 'a', path: 'skills/content/capabilities/a', metadata: { requires_skills: ['a'] } }] }, 'a')).toEqual([{ slug: 'a', prefix: 'skills/content/capabilities/a/' }]);
});
test('refuses catalog paths outside skill folders', () => {
  expect(() => resolveStandalonePackages({ skills: [{ slug: 'job', path: 'skills/../../job' }] }, 'job')).toThrow(/Invalid package path/);
});

const published: StandaloneIndex & {playbookSlugs: string[]} = require('./fixtures/marketing-catalog.json');
test.each(published.playbookSlugs)('resolves the released %s package graph including mutual references', (slug: string) => {
  const resolved = resolveStandalonePackages(published, slug);
  const names = new Set(resolved.map(entry => entry.slug));
  expect(names.size).toBe(resolved.length);
  expect(resolved.at(-1)?.slug).toBe(slug);
  for (const entry of resolved) {
    const skill = published.skills.find((item: {slug: string}) => item.slug === entry.slug);
    for (const dependency of skill!.metadata?.requires_skills || []) expect(names.has(dependency)).toBe(true);
  }
});
