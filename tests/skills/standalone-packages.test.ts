import { resolveStandalonePackages } from '../../src/skills/standalone-packages';

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
test('fails before any install on a missing or cyclic dependency', () => {
  expect(() => resolveStandalonePackages({ skills: [index.skills[0]] }, 'job')).toThrow(/missing/);
  expect(() => resolveStandalonePackages({ skills: [{ slug: 'a', path: 'skills/content/capabilities/a', metadata: { requires_skills: ['a'] } }] }, 'a')).toThrow(/cyclic/);
});
test('refuses catalog paths outside skill folders', () => {
  expect(() => resolveStandalonePackages({ skills: [{ slug: 'job', path: 'skills/../../job' }] }, 'job')).toThrow(/Invalid package path/);
});
