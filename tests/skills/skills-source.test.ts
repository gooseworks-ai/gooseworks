/**
 * GOOSE_SKILLS_RAW_BASE may point goose-skills downloads at another branch,
 * but only over https (plain http on this computer) and with no login in it.
 */
import { gooseSkillsSource } from '../../src/skills/installer';

it('reads a GitHub branch from the override, slashes included', () => {
  expect(gooseSkillsSource({ GOOSE_SKILLS_RAW_BASE: 'https://raw.githubusercontent.com/gooseworks-ai/goose-skills/video/s2-parts-layers/' })).toEqual({
    rawBase: 'https://raw.githubusercontent.com/gooseworks-ai/goose-skills/video/s2-parts-layers',
    github: { repo: 'gooseworks-ai/goose-skills', ref: 'video/s2-parts-layers' },
  });
  expect(gooseSkillsSource({}).rawBase).toBe('https://raw.githubusercontent.com/gooseworks-ai/goose-skills/main');
});

it.each([
  'http://raw.githubusercontent.com/gooseworks-ai/goose-skills/main',
  'https://user:secret@raw.githubusercontent.com/gooseworks-ai/goose-skills/main',
  'https://raw.githubusercontent.com/gooseworks-ai/goose-skills/main?token=abc',
  'https://raw.githubusercontent.com/gooseworks-ai',
])('refuses %s', (value) => {
  expect(() => gooseSkillsSource({ GOOSE_SKILLS_RAW_BASE: value })).toThrow();
});
