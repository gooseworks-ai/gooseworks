import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { compareReleaseVersion, getReleasedSkills, readReleasedSkillHashes, skillContentHash } from '../../src/skills/releases';
import { compareSavedPackage } from '../../src/skills/package-freshness';

function archive(files: Record<string, string>): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    const content = Buffer.from(text), header = Buffer.alloc(512);
    header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header[156] = 48;
    header.write('ustar\0', 257); header.write('00', 263);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

const files = {
  'package/package.json': JSON.stringify({ name: 'gooseworks', version: '1.2.3' }),
  'package/skills/gooseworks/SKILL.md': '# released',
};

describe('published release identity', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  test('verifies release integrity and extracts only shipped skill bytes without writing files', async () => {
    const tar = archive(files);
    const source = 'https://registry.npmjs.org/gooseworks/-/gooseworks-1.2.3.tgz';
    global.fetch = jest.fn(async (url) => new Response(String(url).endsWith('/latest') ? JSON.stringify({ name: 'gooseworks', version: '1.2.3', dist: { tarball: source, integrity: 'sha512-' + createHash('sha512').update(tar).digest('base64') } }) : tar)) as typeof fetch;
    expect(await getReleasedSkills()).toEqual({ version: '1.2.3', source, hashes: { gooseworks: skillContentHash('# released') } });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  test('rejects changed release bytes despite valid tar headers', async () => {
    const good = archive(files), bad = archive({ ...files, 'package/skills/gooseworks/SKILL.md': '# changed' });
    global.fetch = jest.fn(async (url) => new Response(String(url).endsWith('/latest') ? JSON.stringify({ name: 'gooseworks', version: '1.2.3', dist: { tarball: 'https://registry.npmjs.org/gooseworks/-/gooseworks-1.2.3.tgz', integrity: 'sha512-' + createHash('sha512').update(good).digest('base64') } }) : bad)) as typeof fetch;
    await expect(getReleasedSkills()).rejects.toThrow('integrity mismatch');
  });
  test('rejects manifest/body disagreement and wrong package identity', () => {
    const manifest = JSON.stringify({ package: 'gooseworks', version: '1.2.3', entries: { gooseworks: skillContentHash('# wrong') } });
    expect(() => readReleasedSkillHashes(archive({ ...files, 'package/skills/manifest.json': manifest }), '1.2.3')).toThrow('manifest mismatch');
    expect(() => readReleasedSkillHashes(archive(files), '9.0.0')).toThrow('identity mismatch');
  });
  test('rejects registry-supplied external archive URLs', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ name: 'gooseworks', version: '1.2.3', dist: { tarball: 'https://example.test/file', integrity: 'sha512-AA==' } }))) as typeof fetch;
    await expect(getReleasedSkills()).rejects.toThrow('Invalid published package integrity');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('aborts a hung release check within its bound', async () => {
    global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    const start = Date.now();
    await expect(getReleasedSkills(30)).rejects.toThrow('aborted');
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
    expect(installer.isEntrySkillFresh(old.name, next.content)).toBe(false);
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

  test('reports release vs bundle vs modified content, and offline never means current', async () => {
    const skill = {name:'gooseworks',content:'# local bundle'};
    installer.installManagedEntrySkills([skill]);
    const release = {version:'9.0.0',source:'https://registry.npmjs.org/gooseworks/-/gooseworks-9.0.0.tgz',hashes:{gooseworks:skillContentHash('# newer release')}};
    expect(status.entryFreshnessReport([skill],'1.0.0',release)).toMatchObject({cli:'outdated',entries:[{local:'bundled',published:'different_from_release'}]});
    fs.writeFileSync(path.join(installer.getSkillsBasePath(),skill.name,'SKILL.md'),'# modified');
    expect(status.entryFreshnessReport([skill],'1.0.0',release).entries[0].local).toBe('modified_or_untracked');
    const original = global.fetch; global.fetch = jest.fn(async()=>{throw new Error('offline');});
    try {expect(await status.readEntryFreshnessReport()).toMatchObject({cli:'unavailable',releasedVersion:null});}
    finally {global.fetch=original;}
  });
  test('does not write through an entry symlink into a different directory', () => {
    const external = path.join(home, 'external'); fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'SKILL.md'), '# external');
    fs.mkdirSync(installer.getSkillsBasePath(), { recursive: true });
    fs.symlinkSync(external, path.join(installer.getSkillsBasePath(), 'gooseworks'), 'dir');
    expect(installer.installManagedEntrySkills([{ name: 'gooseworks', content: '# new' }])[0].action).toBe('preserved');
    expect(() => installer.installManagedEntrySkills([{ name: 'gooseworks', content: '# new' }], { overwriteModified: true })).toThrow('Linked gooseworks entry preserved');
    expect(fs.readFileSync(path.join(external, 'SKILL.md'), 'utf8')).toBe('# external');
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
});
