/**
 * GV-43 and the rulebook's lint rules, on every generated skill: real action
 * names only, credits only, no install lines, no recipe slugs or render
 * atoms, and the size limit (3,000 characters for an entry skill).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getEntrySkills } from '../../src/skills/master-skill';
import { ACTION_NAMES, ENTRY_SKILL_MAX_CHARS, lintSkill, RECIPE_SLUGS, ROUTER_MAX_CHARS } from './skill-lint';

const limitFor = (name: string) => (name === 'gooseworks' ? ROUTER_MAX_CHARS : ENTRY_SKILL_MAX_CHARS);

it.each(getEntrySkills())('$name passes the skill lint', ({ name, content }) => {
  expect(lintSkill(content, { maxChars: limitFor(name) })).toEqual([]);
});

it('keeps the video entry skills under 3,000 characters', () => {
  const video = getEntrySkills().filter((skill) => ['goose-video', 'make-custom-video', 'goose-video-local'].includes(skill.name));
  expect(video).toHaveLength(3);
  for (const skill of video) expect(lintSkill(skill.content, { maxChars: 3000 })).toEqual([]);
  expect(lintSkill('x'.repeat(3001), { maxChars: 3000 })).toEqual(['author.size_limits: 3001 characters, over 3000']);
});

it.each([
  ['a dollar sign', 'The full video is about $8.20.', 'money.credits_only'],
  ['a currency word', 'It costs about 8 dollars.', 'money.credits_only'],
  ['an install command', 'Run `npm install -g gooseworks` first.', 'setup.no_install'],
  ['an install request', 'Install the GooseWorks plugin, then come back.', 'setup.no_install'],
  ['an old tool name', 'Save the plan with video_project_upsert.', 'action.real_names_only'],
  ['a server-prefixed old tool name', 'Call mcp__gooseworks__video_render_run.', 'action.real_names_only'],
  ['a render atom', 'Fetch render-podcast-skit for the frames.', 'GV-43 render atom'],
  ['a recipe slug', 'Use create-podcast-skit-video-from-refs for this.', 'GV-43 recipe'],
])('fails on %s', (_case, text, rule) => {
  expect([...new Set(lintSkill(text).map((problem) => problem.split(':')[0]))]).toEqual([rule]);
});

it('allows the rulebook saying what never to do', () => {
  expect(lintSkill('Money is a credit number: never dollars. Never ask for an install. Use the installed copy.')).toEqual([]);
});

// Drift: the fixtures are copies of other repos' lists. Point these variables
// at a checkout to compare them.
const appDir = process.env.GOOSEWORKS_APP_DIR;
const studioDir = process.env.GOOSE_STUDIO_DIR;

(appDir ? it : it.skip)('the action names match gooseworks-app (GOOSEWORKS_APP_DIR)', () => {
  const contract = readFileSync(join(appDir!, 'apps/api/src/app-mcp-server/mcp-tools/v2/contract.ts'), 'utf8');
  const block = contract.slice(contract.indexOf('export const ACTION_NAMES'), contract.indexOf('export type ActionName'));
  const names = [...block.matchAll(/name: "([a-z_]+)"/g)].map((match) => match[1]);
  expect([...names].sort()).toEqual([...ACTION_NAMES].sort());
});

(studioDir ? it : it.skip)('the recipe slugs match goose-studio (GOOSE_STUDIO_DIR)', () => {
  const root = join(studioDir!, 'one-shot-videos');
  expect(existsSync(root)).toBe(true);
  const slugs = readdirSync(root).filter((name) => !name.startsWith('.') && statSync(join(root, name)).isDirectory());
  expect(slugs.sort()).toEqual([...RECIPE_SLUGS].sort());
});
