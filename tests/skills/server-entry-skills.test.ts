/**
 * The CLI's reviewed video snapshots preserve shipped production guidance with
 * approval-only fragments backported from the server. Other entries carry the
 * unchanged shared rulebook snapshot. The fixture checks delivery parity.
 * GOOSEWORKS_APP_DIR opts into a strict whole-server comparison for complete syncs.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { getEntrySkills } from '../../src/skills/master-skill';
import { SERVER_ENTRY_SKILL_RULES, SERVER_RULEBOOK_VERSION, SERVER_VIDEO_ENTRY_SKILLS } from '../../src/skills/server-entry-skills';

interface ServerFixture {
  rulebook_version: string;
  skills: Record<string, string>;
  rules: Record<string, string>;
}
const fixture = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'server-entry-skills.json'), 'utf8')) as ServerFixture;
const skill = (name: string) => getEntrySkills().find((entry) => entry.name === name)!.content;

it('ships reviewed video snapshots unchanged', () => {
  expect(SERVER_VIDEO_ENTRY_SKILLS).toEqual(fixture.skills);
  expect(SERVER_ENTRY_SKILL_RULES).toEqual(fixture.rules);
  expect(SERVER_RULEBOOK_VERSION).toBe(fixture.rulebook_version);
  expect(skill('goose-video')).toBe(fixture.skills['goose-video']);
  expect(skill('make-custom-video')).toBe(fixture.skills['make-custom-video']);
});

it.each([
  ['gooseworks', 'all'],
  ['goose-ads', 'ads'],
  ['goose-product-photos', 'photos'],
])('%s carries the rulebook rules for %s', (name, product) => {
  expect(skill(name)).toContain(`## Rules\n\n${fixture.rules[product]}`);
});

const appDir = process.env.GOOSEWORKS_APP_DIR;
(appDir ? it : it.skip)('the fixture matches the server (GOOSEWORKS_APP_DIR)', () => {
  const api = join(appDir!, 'apps/api/src');
  const dir = mkdtempSync(join(tmpdir(), 'c3-entry-'));
  try {
    const script = join(dir, 'print.ts');
    writeFileSync(script, [
      `import { buildVideoEntrySkill } from ${JSON.stringify(join(api, 'services/playbooks/entry-skill'))};`,
      `import { RULEBOOK_VERSION, renderEntrySkillRules } from ${JSON.stringify(join(api, 'app-mcp-server/lib/video-policy'))};`,
      'console.log(JSON.stringify({',
      '  rulebook_version: RULEBOOK_VERSION,',
      '  skills: { "goose-video": buildVideoEntrySkill("goose-video"), "make-custom-video": buildVideoEntrySkill("make-custom-video") },',
      '  rules: { all: renderEntrySkillRules("all"), ads: renderEntrySkillRules("ads"), photos: renderEntrySkillRules("photos") },',
      '}));',
    ].join('\n'));
    const tsx = join(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
    const live = JSON.parse(execFileSync(process.execPath, [tsx, script], { encoding: 'utf8' })) as ServerFixture;
    expect(live).toEqual({ rulebook_version: fixture.rulebook_version, skills: fixture.skills, rules: fixture.rules });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
