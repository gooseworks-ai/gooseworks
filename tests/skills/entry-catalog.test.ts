/**
 * Entry skills come from the goose-skills catalog (`skills/entry/<name>/`).
 * These run against a REAL temp skills folder with a stubbed `fetch`, so they
 * prove what lands on disk: every listed file byte for byte, nothing when a
 * download fails, and never over a user's edit.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type Installer = typeof import('../../src/skills/installer');
type Environment = typeof import('../../src/environment');

const BASE = 'https://raw.githubusercontent.com/gooseworks-ai/goose-skills/main';
const ROUTER = '---\nname: gooseworks\nversion: 2.2.1\n---\n# GooseWorks\nUse https://api.gooseworks.ai\n';
const ROUTES = '{"domain_routes":[]}\n';
const META = '{"slug":"gooseworks","tier":"entry","version":"2.2.1"}\n';

function entry(slug: string, files: string[], extra: Record<string, unknown> = {}) {
  return { slug, path: `skills/entry/${slug}`, version: '1.0.0', files: files.map((file) => `skills/entry/${slug}/${file}`), ...extra };
}

function catalog(overrides: { skills?: unknown[]; files?: Record<string, string> } = {}) {
  const skills = overrides.skills ?? [
    entry('gooseworks', ['SKILL.md', 'routes.json', 'skill.meta.json'], { version: '2.2.1' }),
    entry('goose-ads', ['SKILL.md']),
    { slug: 'not-an-entry', path: 'skills/entry/not-an-entry', files: ['skills/entry/not-an-entry/SKILL.md'] },
    { slug: 'goose-graphics', path: 'skills/composites/goose-graphics', files: ['skills/composites/goose-graphics/SKILL.md'] },
  ];
  return {
    'skills-index.json': JSON.stringify({ skills }),
    'skills/entry/gooseworks/SKILL.md': ROUTER,
    'skills/entry/gooseworks/routes.json': ROUTES,
    'skills/entry/gooseworks/skill.meta.json': META,
    'skills/entry/goose-ads/SKILL.md': '# goose-ads\n',
    'skills/entry/not-an-entry/SKILL.md': '# not ours\n',
    ...overrides.files,
  };
}

describe('entry skills from the goose-skills catalog', () => {
  let home: string;
  let installer: Installer;
  let environment: Environment;
  let requested: string[];
  const originalFetch = global.fetch;

  function serve(files: Record<string, string>, base = BASE): void {
    requested = [];
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const value = String(url);
      requested.push(value);
      if (!value.startsWith(`${base}/`)) return new Response('wrong origin', { status: 404 });
      const body = files[decodeURIComponent(value.slice(base.length + 1))];
      return body === undefined ? new Response('not found', { status: 404 }) : new Response(body);
    }) as typeof fetch;
  }

  const skillsBase = () => installer.getSkillsBasePath();
  const read = (...parts: string[]) => fs.readFileSync(path.join(skillsBase(), ...parts), 'utf8');

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gw-entry-'));
    jest.isolateModules(() => {
      jest.doMock('os', () => ({ ...jest.requireActual('os'), homedir: () => home }));
      environment = require('../../src/environment');
      installer = require('../../src/skills/installer');
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    environment.selectEnvironment('production');
    jest.dontMock('os');
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('downloads every listed file of the fixed entry skills and installs them byte for byte', async () => {
    serve(catalog());
    const fetched = await installer.fetchEntrySkills();

    expect(fetched.source).toBe(BASE);
    expect(fetched.skills.map((skill) => skill.name)).toEqual(['gooseworks', 'goose-ads']);
    expect(fetched.missing).toEqual(['goose-video', 'goose-video-local', 'make-custom-video', 'goose-product-photos']);
    expect(requested.some((url) => url.includes('not-an-entry') || url.includes('goose-graphics'))).toBe(false);

    expect(installer.installManagedEntrySkills(fetched.skills).map((result) => result.action)).toEqual(['installed', 'installed']);
    expect(read('gooseworks', 'SKILL.md')).toBe(ROUTER);
    expect(read('gooseworks', 'routes.json')).toBe(ROUTES);
    expect(read('gooseworks', 'skill.meta.json')).toBe(META);
    expect(read('goose-ads', 'SKILL.md')).toBe('# goose-ads\n');
    expect(fs.existsSync(path.join(skillsBase(), 'not-an-entry'))).toBe(false);
    expect(fs.readdirSync(skillsBase()).sort()).toEqual(['goose-ads', 'gooseworks']);

    const record = JSON.parse(read('gooseworks', '.gooseworks-source.json'));
    expect(record).toMatchObject({ environment: 'production', source: BASE, version: '2.2.1' });
    expect(Object.keys(record.fileHashes).sort()).toEqual(['SKILL.md', 'routes.json', 'skill.meta.json']);
    expect(read('gooseworks', '.gooseworks-version')).toMatch(/^[a-f0-9]{16}$/);
    expect(installer.inspectEntrySkill('gooseworks')).toMatchObject({ modified: false, missing: false, version: '2.2.1' });

    expect(installer.installManagedEntrySkills(fetched.skills).map((result) => result.action)).toEqual(['skipped', 'skipped']);
  });

  it('upgrades an unedited install written by an older CLI (SKILL.md and stamp only)', async () => {
    const legacy = { name: 'gooseworks', content: '# bundled by an older CLI' };
    fs.mkdirSync(path.join(skillsBase(), 'gooseworks'), { recursive: true });
    fs.writeFileSync(path.join(skillsBase(), 'gooseworks', 'SKILL.md'), legacy.content);
    const { skillContentHash } = require('../../src/skills/releases');
    fs.writeFileSync(path.join(skillsBase(), 'gooseworks', '.gooseworks-version'), skillContentHash(legacy.content).slice(0, 16));
    expect(installer.inspectEntrySkill('gooseworks').modified).toBe(false);

    serve(catalog());
    const fetched = await installer.fetchEntrySkills();
    expect(installer.installManagedEntrySkills(fetched.skills)[0].action).toBe('installed');
    expect(read('gooseworks', 'SKILL.md')).toBe(ROUTER);
    expect(read('gooseworks', 'routes.json')).toBe(ROUTES);
  });

  it.each([
    ['an edited extra file', (dir: string) => fs.writeFileSync(path.join(dir, 'routes.json'), '{"mine":true}\n')],
    ['a file the user added', (dir: string) => fs.writeFileSync(path.join(dir, 'notes.md'), '# my notes\n')],
    ['a deleted extra file', (dir: string) => fs.rmSync(path.join(dir, 'skill.meta.json'))],
  ])('preserves %s until --overwrite-modified', async (_label, edit) => {
    serve(catalog());
    const fetched = await installer.fetchEntrySkills();
    installer.installManagedEntrySkills(fetched.skills);
    const dir = path.join(skillsBase(), 'gooseworks');
    edit(dir);
    const before = fs.readdirSync(dir).sort();

    expect(installer.inspectEntrySkill('gooseworks').modified).toBe(true);
    expect(installer.installManagedEntrySkills(fetched.skills, { force: true })[0].action).toBe('preserved');
    expect(fs.readdirSync(dir).sort()).toEqual(before);

    expect(installer.installManagedEntrySkills(fetched.skills, { overwriteModified: true })[0].action).toBe('installed');
    expect(fs.readdirSync(dir).sort()).toEqual(['.gooseworks-source.json', '.gooseworks-version', 'SKILL.md', 'routes.json', 'skill.meta.json']);
    expect(read('gooseworks', 'routes.json')).toBe(ROUTES);
  });

  it('downloads nothing to disk when one file fails, so existing skills stay as they were', async () => {
    const old = { name: 'gooseworks', content: '# installed before' };
    installer.installManagedEntrySkills([old]);
    const before = fs.readdirSync(skillsBase()).sort();
    const files = catalog();
    delete (files as Record<string, string>)['skills/entry/gooseworks/routes.json'];
    serve(files);

    await expect(installer.fetchEntrySkills()).rejects.toThrow('could not download skills/entry/gooseworks/routes.json from goose-skills (404)');
    expect(read('gooseworks', 'SKILL.md')).toBe(old.content);
    expect(fs.readdirSync(skillsBase()).sort()).toEqual(before);
  });

  it('fails clearly when goose-skills cannot be reached', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await expect(installer.fetchEntrySkills()).rejects.toThrow('could not reach goose-skills for skills-index.json (fetch failed)');
  });

  it.each([
    ['an entry that lists no files', [entry('gooseworks', [])], 'the goose-skills index lists no SKILL.md for gooseworks'],
    ['an entry outside skills/entry', [{ ...entry('gooseworks', ['SKILL.md']), path: 'skills/playbooks/gooseworks' }], 'goose-skills lists gooseworks at skills/playbooks/gooseworks, not skills/entry/gooseworks'],
    ['a file outside the entry folder', [{ ...entry('gooseworks', ['SKILL.md']), files: ['skills/entry/gooseworks/SKILL.md', 'skills/entry/other/SKILL.md'] }], 'goose-skills lists an unsafe file for gooseworks'],
    ['a parent-directory file', [{ ...entry('gooseworks', ['SKILL.md']), files: ['skills/entry/gooseworks/SKILL.md', 'skills/entry/gooseworks/../x'] }], 'goose-skills lists an unsafe file for gooseworks'],
    ['a bookkeeping file name', [entry('gooseworks', ['SKILL.md', '.gooseworks-version'])], 'goose-skills lists an unsafe file for gooseworks'],
    ['no router', [entry('goose-ads', ['SKILL.md'])], 'the goose-skills index has no gooseworks entry skill'],
  ])('refuses %s before downloading any skill file', async (_label, skills, message) => {
    serve(catalog({ skills }));
    await expect(installer.fetchEntrySkills()).rejects.toThrow(message);
    expect(requested).toEqual([`${BASE}/skills-index.json`]);
  });

  it('reads the dev branch on staging and adapts its markdown, not its data files', async () => {
    environment.selectEnvironment('staging');
    const devBase = 'https://raw.githubusercontent.com/gooseworks-ai/goose-skills/dev';
    serve(catalog(), devBase);

    const fetched = await installer.fetchEntrySkills();
    const router = fetched.skills.find((skill) => skill.name === 'gooseworks')!;
    expect(router.content).toContain('https://api.staging.gooseworks.ai');
    expect(router.content).toContain('## Staging session');
    expect(router.files!['routes.json'].toString('utf8')).toBe(ROUTES);

    installer.installManagedEntrySkills(fetched.skills);
    expect(skillsBase()).toBe(path.join(home, '.gooseworks', 'profiles', 'staging', 'skills'));
    expect(fs.existsSync(path.join(home, '.agents', 'skills', 'gooseworks'))).toBe(false);
    expect(JSON.parse(read('gooseworks', '.gooseworks-source.json'))).toMatchObject({ environment: 'staging', source: devBase });
  });
});
