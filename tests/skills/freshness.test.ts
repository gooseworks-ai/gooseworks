import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compareReleaseVersion, getPublishedCli, skillContentHash } from '../../src/skills/releases';
import { compareSavedPackage } from '../../src/skills/package-freshness';

const catalogOf = (...skills: Array<{ name: string; content: string; version?: string }>) =>
  ({ catalog: { source: 'https://raw.githubusercontent.com/gooseworks-ai/goose-skills/main', skills, missing: [] } });

describe('published CLI version', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  test('reads only the version from npm, never a package archive', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ name: 'gooseworks', version: '1.2.3' }))) as typeof fetch;
    expect(await getPublishedCli()).toEqual({ version: '1.2.3', source: 'https://registry.npmjs.org/gooseworks/latest' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('rejects metadata for another package or an invalid version', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ name: 'other', version: '1.2.3' }))) as typeof fetch;
    await expect(getPublishedCli()).rejects.toThrow('Invalid published package metadata');
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ name: 'gooseworks', version: 'latest' }))) as typeof fetch;
    await expect(getPublishedCli()).rejects.toThrow('Invalid published package metadata');
  });
  test('aborts a hung release check within its bound', async () => {
    global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    const start = Date.now();
    await expect(getPublishedCli(30)).rejects.toThrow('aborted');
    expect(Date.now() - start).toBeLessThan(1000);
  });
  test.each([
    ['1.2.3', '1.2.3', 'current'], ['1.2.2', '1.2.3', 'outdated'],
    ['1.3.0', '1.2.3', 'unreleased'], ['1.2.3-dev', '1.2.3', 'outdated'],
    ['1.2.3-alpha.1', '1.2.3-alpha.2', 'outdated'], ['1.2.3-beta', '1.2.3-alpha', 'unreleased'],
  ])('distinguishes running %s from published %s', (running, published, expected) => {
    expect(compareReleaseVersion(running, published)).toBe(expected);
  });
});

describe('real local entry preservation', () => {
  let home: string;
  let installer: typeof import('../../src/skills/installer');
  let status: typeof import('../../src/commands/skills');
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa37-home-'));
    jest.isolateModules(() => {
      jest.doMock('os', () => ({ ...jest.requireActual('os'), homedir: () => home }));
      installer = require('../../src/skills/installer');
      status = require('../../src/commands/skills');
    });
  });
  afterEach(() => { jest.dontMock('os'); fs.rmSync(home, { recursive: true, force: true }); });
  test('refreshes stale unmodified content but refuses a later user edit even when forced', () => {
    const old = { name: 'gooseworks', content: '# old' }, next = { ...old, content: '# new' };
    installer.installManagedEntrySkills([old]);
    expect(installer.installManagedEntrySkills([next])[0].action).toBe('installed');
    const target = path.join(installer.getSkillsBasePath(), old.name, 'SKILL.md');
    fs.writeFileSync(target, '# my edit');
    expect(installer.isEntrySkillFresh(next)).toBe(false);
    expect(installer.installManagedEntrySkills([old], { force: true })[0].action).toBe('preserved');
    expect(fs.readFileSync(target, 'utf8')).toBe('# my edit');
    expect(installer.installManagedEntrySkills([next], { overwriteModified: true })[0].action).toBe('installed');
    expect(fs.readFileSync(target, 'utf8')).toBe('# new');
  });
  test('preserves unknown provenance and standalone pinned packages', async () => {
    const base = installer.getSkillsBasePath();
    fs.mkdirSync(path.join(base, 'gooseworks'), { recursive: true });
    fs.writeFileSync(path.join(base, 'gooseworks', 'SKILL.md'), '# untracked');
    fs.mkdirSync(path.join(base, 'recipe')); fs.writeFileSync(path.join(base, 'recipe', 'SKILL.md'), '# approved run');
    expect(installer.installManagedEntrySkills([{ name: 'gooseworks', content: '# latest' }])[0].action).toBe('preserved');
    await expect(installer.installStandaloneSkill('recipe')).rejects.toThrow('Existing recipe package preserved');
    expect(fs.readFileSync(path.join(base, 'recipe', 'SKILL.md'), 'utf8')).toBe('# approved run');
  });
  test.each(['live', 'dangling'])('preserves a %s standalone directory link before downloading', async (kind) => {
    const external = path.join(home, 'external');
    if (kind === 'live') {
      fs.mkdirSync(external);
      fs.writeFileSync(path.join(external, 'SKILL.md'), '# external');
    }
    fs.mkdirSync(installer.getSkillsBasePath(), { recursive: true });
    const link = path.join(installer.getSkillsBasePath(), 'recipe');
    fs.symlinkSync(external, link, 'dir');
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => { throw new Error('No download allowed'); });
    try {
      await expect(installer.installStandaloneSkill('recipe')).rejects.toThrow('Existing recipe package preserved');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      if (kind === 'live') expect(fs.readFileSync(path.join(external, 'SKILL.md'), 'utf8')).toBe('# external');
      else expect(fs.existsSync(external)).toBe(false);
    } finally { global.fetch = originalFetch; }
  });

  test('reports catalog vs modified content, and offline never means current', async () => {
    const skill = { name: 'gooseworks', content: '# installed', version: '2.2.0' };
    installer.installManagedEntrySkills([skill]);
    const newer = catalogOf({ name: 'gooseworks', content: '# newer catalog', version: '2.2.1' });
    const release = { version: '9.0.0', source: 'https://registry.npmjs.org/gooseworks/latest' };
    const report = status.entryFreshnessReport(newer, '1.0.0', release);
    expect(report).toMatchObject({ cli: 'outdated', catalogSource: newer.catalog.source });
    expect(report.entries.map((entry) => entry.name)).toEqual(['gooseworks', 'goose-ads', 'goose-video', 'goose-video-local', 'make-custom-video', 'goose-product-photos']);
    expect(report.entries[0]).toMatchObject({ name: 'gooseworks', local: 'managed', catalog: 'different_from_catalog', installedVersion: '2.2.0', catalogVersion: '2.2.1' });
    expect(status.entryFreshnessReport(catalogOf(skill), '9.0.0', release).entries[0]).toMatchObject({ local: 'managed', catalog: 'current' });
    expect(status.entryFreshnessReport(catalogOf(skill), '9.0.0', release).entries.find((entry) => entry.name === 'goose-ads')).toMatchObject({ local: 'missing', catalog: 'not_in_catalog' });
    fs.writeFileSync(path.join(installer.getSkillsBasePath(), skill.name, 'SKILL.md'), '# modified');
    expect(status.entryFreshnessReport(newer, '1.0.0', release).entries[0].local).toBe('modified_or_untracked');
    const original = global.fetch; global.fetch = jest.fn(async () => { throw new Error('offline'); });
    try {
      const offline = await status.readEntryFreshnessReport();
      expect(offline).toMatchObject({ cli: 'unavailable', releasedVersion: null, catalogSource: null });
      expect(offline.catalogError).toContain('could not reach goose-skills');
      expect(offline.entries[0].catalog).toBe('unavailable');
    } finally { global.fetch = original; }
  });
  test('detects an old independent Codex entry even when the shared entry is current, without replacing it', () => {
    const skill = { name: 'goose-video', content: '# current video workflow' };
    installer.installManagedEntrySkills([skill]);
    const hostDir = path.join(home, '.codex', 'skills', skill.name);
    fs.mkdirSync(hostDir, { recursive: true });
    const hostFile = path.join(hostDir, 'SKILL.md');
    const old = '---\nname: goose-video\nversion: 0.3.0\n---\n# old local workflow';
    fs.writeFileSync(hostFile, old);
    const entry = status.entryFreshnessReport(catalogOf(skill), '0.4.4').entries.find((candidate) => candidate.name === skill.name)!;
    expect(entry.local).toBe('managed');
    expect(entry.catalog).toBe('current');
    expect(entry.hosts).toEqual([expect.objectContaining({ host: 'codex', path: hostFile, location: 'independent', catalog: 'different_from_catalog' })]);
    installer.installManagedEntrySkills([skill]);
    expect(fs.readFileSync(hostFile, 'utf8')).toBe(old);
  });
  test('recognizes the current shared host link and reports a dangling link as unknown', () => {
    const skill = { name: 'goose-video-local', content: '# current runtime' };
    installer.installManagedEntrySkills([skill]);
    const hostRoot = path.join(home, '.claude', 'skills');
    fs.mkdirSync(hostRoot, { recursive: true });
    const link = path.join(hostRoot, skill.name);
    fs.symlinkSync(path.join(installer.getSkillsBasePath(), skill.name), link, 'dir');
    const hostsOf = () => status.entryFreshnessReport(catalogOf(skill), '0.4.4').entries.find((candidate) => candidate.name === skill.name)!.hosts;
    expect(hostsOf()).toEqual([expect.objectContaining({ location: 'managed_link', catalog: 'current' })]);
    fs.unlinkSync(link);
    fs.symlinkSync(path.join(home, 'missing-approved-package'), link, 'dir');
    expect(hostsOf()).toEqual([expect.objectContaining({ location: 'unreadable', hash: null, catalog: 'unreadable' })]);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });
  test('does not write through an entry symlink into a different directory', () => {
    const external = path.join(home, 'external'); fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'SKILL.md'), '# external');
    fs.mkdirSync(installer.getSkillsBasePath(), { recursive: true });
    fs.symlinkSync(external, path.join(installer.getSkillsBasePath(), 'gooseworks'), 'dir');
    expect(installer.installManagedEntrySkills([{ name: 'gooseworks', content: '# new' }])[0].action).toBe('preserved');
    expect(() => installer.installManagedEntrySkills([{ name: 'gooseworks', content: '# new' }], { overwriteModified: true })).toThrow('Linked gooseworks entry preserved');
    expect(fs.readFileSync(path.join(external, 'SKILL.md'), 'utf8')).toBe('# external');
  });
  test.each(['directory', 'SKILL.md', '.gooseworks-version'].flatMap((entry) => [
    [entry, 'live'], [entry, 'dangling'],
  ]))('preserves a %s %s link, including with explicit overwrite', (entry, kind) => {
    const old = { name: 'gooseworks', content: '# old' }, next = { ...old, content: '# new' };
    installer.installManagedEntrySkills([old]);
    const dir = path.join(installer.getSkillsBasePath(), old.name);
    const link = entry === 'directory' ? dir : path.join(dir, entry);
    const external = path.join(home, 'external');
    const before = entry === '.gooseworks-version' ? skillContentHash(old.content).slice(0, 16) : old.content;
    if (entry === 'directory' && kind === 'live') fs.renameSync(dir, external);
    else {
      fs.rmSync(link, { recursive: true, force: true });
      if (kind === 'live') fs.writeFileSync(external, before);
    }
    fs.symlinkSync(external, link, entry === 'directory' ? 'dir' : 'file');
    expect(installer.inspectEntrySkill(old.name).modified).toBe(true);
    expect(installer.installManagedEntrySkills([next])[0].action).toBe('preserved');
    expect(() => installer.installManagedEntrySkills([next], { overwriteModified: true })).toThrow('Linked gooseworks entry preserved');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    if (kind === 'dangling') expect(fs.existsSync(external)).toBe(false);
    else expect(fs.readFileSync(entry === 'directory' ? path.join(external, 'SKILL.md') : external, 'utf8')).toBe(before);
  });
});

describe('saved connected-catalog packages', () => {
  const current = { slug: 'recipe', contentHash: 'root', dependencySkills: [{ slug: 'helper', contentHash: 'dep' }] };
  test('current, stale dependency, missing metadata and unreported local files remain distinct', () => {
    expect(compareSavedPackage(current, current).status).toBe('current');
    expect(compareSavedPackage(current, { ...current, dependencySkills: [{ slug: 'helper', contentHash: 'old' }] })).toMatchObject({ status: 'stale', changes: ['helper'] });
    expect(compareSavedPackage(current, { ...current, contentHash: null }).status).toBe('unknown');
    expect(compareSavedPackage(current).status).toBe('not_compared');
    expect(() => compareSavedPackage(current, { slug: 'wrong' })).toThrow('slug');
  });
  test('a matching root cannot certify an unavailable declared dependency as current', () => {
    const incomplete = { slug: 'recipe', contentHash: 'root', requiresSkills: ['helper'], dependencySkills: [] };
    expect(compareSavedPackage(incomplete, { slug: 'recipe', contentHash: 'root', dependencySkills: [] }).status).toBe('unknown');
    expect(compareSavedPackage(incomplete).status).toBe('not_compared');
    expect(compareSavedPackage({ ...incomplete, dependencySkills: current.dependencySkills }, current).status).toBe('current');
  });
});
