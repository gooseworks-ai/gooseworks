import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { selectEnvironment, profileRoot } from '../../src/environment';
import { saveCredentials, getCredentials, clearCredentials } from '../../src/auth/credentials';
import { installManagedEntrySkills, getSkillsBasePath } from '../../src/skills/installer';
import { assertCleanProject, installStagingProject, projectProfile, stagingContent, stagingLaunch } from '../../src/agents/staging';

let root: string, project: string;
const creds = { api_key: 'fixture-key', email: 'test@gooseworks.ai', agent_id: 'fixture-agent', api_base: 'https://api.staging.gooseworks.ai', mcp_server_url: 'https://mcp.staging.gooseworks.ai/mcp' };
function digest(file: string): string { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'goose-stage-test-'))); process.env.GOOSEWORKS_USER_HOME = root;
  project = path.join(root, 'project'); fs.mkdirSync(project);
  selectEnvironment('staging'); saveCredentials(creds);
  installManagedEntrySkills([{ name: 'gooseworks', content: stagingContent('---\nname: gooseworks\ndescription: A staging fixture\n---\nSTAGING') }]);
});
afterEach(() => { selectEnvironment('production'); delete process.env.GOOSEWORKS_USER_HOME; fs.rmSync(root, { recursive: true, force: true }); });
test('installation and launch preserve an existing production skill and MCP', () => {
  const global = path.join(root, '.claude', 'skills', 'gooseworks', 'SKILL.md'); fs.mkdirSync(path.dirname(global), { recursive: true }); fs.writeFileSync(global, 'PRODUCTION');
  const config = path.join(root, '.claude.json'); fs.writeFileSync(config, '{"mcpServers":{"gooseworks":{"url":"https://mcp.gooseworks.ai"}}}');
  const before = [digest(global), digest(config)];
  installStagingProject(project, ['claude', 'codex']);
  const launch = stagingLaunch(project, 'claude');
  expect(launch.env.HOME).not.toBe(root); expect(launch.env.GOOSEWORKS_USER_HOME).toBe(root);
  expect(launch.env.GOOSEWORKS_SESSION_ENV).toBe('staging');
  expect(launch.args).toContain('--strict-mcp-config');
  const staged = path.join(launch.home, '.claude', 'skills', 'gooseworks', 'SKILL.md');
  expect(fs.readFileSync(staged, 'utf8')).toContain('STAGING');
  expect([digest(global), digest(config)]).toEqual(before);
  const mcp = JSON.parse(fs.readFileSync(path.join(launch.home, 'mcp.json'), 'utf8'));
  expect(Object.keys(mcp.mcpServers)).toEqual(['gooseworks-staging']);
});
test('staging never reads the legacy production login and logout leaves it alone', () => {
  const legacy = path.join(root, '.gooseworks', 'credentials.json'); fs.mkdirSync(path.dirname(legacy), { recursive: true }); fs.writeFileSync(legacy, JSON.stringify({ ...creds, api_base: 'https://api.gooseworks.ai', mcp_server_url: 'https://mcp.gooseworks.ai' }));
  clearCredentials(); expect(getCredentials()).toBeNull(); expect(fs.existsSync(legacy)).toBe(true);
});
test('a production MCP is rejected in staging without writing it', () => {
  expect(() => saveCredentials({ ...creds, mcp_server_url: 'https://mcp.gooseworks.ai/mcp' })).toThrow(/match/);
  expect(getCredentials()?.mcp_server_url).toBe(creds.mcp_server_url);
});
test('refuses project and ancestor customizations, and unverified agents', () => {
  fs.mkdirSync(path.join(project, '.codex')); expect(() => assertCleanProject(project)).toThrow(/customization/);
  fs.rmSync(path.join(project, '.codex'), { recursive: true });
  expect(() => installStagingProject(project, ['cursor'])).toThrow(/Cursor/);
  expect(() => projectProfile('')).toThrow(/--project/);
});
test('edits, unexpected files, and symlinks prevent launch and refresh', () => {
  installStagingProject(project, ['codex']);
  const profile = projectProfile(project), skill = path.join(profile.home, '.codex', 'skills', 'gooseworks');
  fs.writeFileSync(path.join(skill, 'recipe.txt'), 'user edit');
  expect(() => stagingLaunch(project, 'codex')).toThrow(/changed/);
  expect(() => installStagingProject(project, ['codex'])).toThrow(/changed/);
  expect(fs.readFileSync(path.join(skill, 'recipe.txt'), 'utf8')).toBe('user edit');
  fs.unlinkSync(path.join(skill, 'recipe.txt')); fs.symlinkSync(path.join(getSkillsBasePath(), 'gooseworks', 'SKILL.md'), path.join(skill, 'linked.md'));
  expect(() => stagingLaunch(project, 'codex')).toThrow(/Linked/);
});
test('credentials and connection files use private permissions', () => {
  installStagingProject(project, ['claude']);
  expect(fs.statSync(path.join(profileRoot(), 'credentials.json')).mode & 0o777).toBe(0o600);
  expect(fs.statSync(path.join(projectProfile(project).home, 'mcp.json')).mode & 0o777).toBe(0o600);
});
