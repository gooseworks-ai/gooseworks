import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTIVE_SKILLS, buildPlugin, checkPlugin, collectPluginFiles, makeZip, openAiReviewReadiness, portableSkill, REPO, validateFiles } from '../../scripts/plugin-package';
import * as master from '../../src/skills/master-skill';
import { distributionFiles } from '../../scripts/export-plugin';

describe('review candidate packaging', () => {
  let work: string;
  beforeEach(() => {
    mkdirSync(join(REPO, '.plugin-build'), { recursive: true });
    work = mkdtempSync(join(REPO, '.plugin-build', 'test-'));
  });
  afterEach(() => { jest.restoreAllMocks(); rmSync(work, { recursive: true, force: true }); });

  it('exports the five active workflow bodies byte-for-byte, with standard frontmatter and all six CLI entries intact', () => {
    const files = collectPluginFiles('portable');
    expect(ACTIVE_SKILLS).toHaveLength(5);
    for (const name of ACTIVE_SKILLS) {
      const actual = files.get(`skills/${name}/SKILL.md`)!.toString();
      const source = master.getEntrySkills().find(skill => skill.name === name)!.content;
      const body = (text: string) => text.slice(text.indexOf('\n---\n') + 5);
      expect(body(actual)).toBe(body(source));
      expect(source).toBe(readFileSync(join(REPO, 'skills', name, 'SKILL.md'), 'utf8'));
      expect(actual).not.toMatch(/^version:|^requires_skills:|^harness_binding:|^category:|^slug:|^author:|^tags:/m);
    }
    expect(master.getEntrySkills().map(skill => skill.name)).toContain('goose-video-local');
    expect(files.has('skills/goose-video-local/SKILL.md')).toBe(false);
    expect([...files.keys()].some(path => /claude|credential|reviewer|demo/.test(path))).toBe(false);
    expect(JSON.parse(files.get('plugin.json')!.toString()).extensions).toBeUndefined();
  });

  it('retains descriptions and moves custom source fields into string metadata only', () => {
    const original = '---\nname: example\ndescription: >\n  A useful description.\nversion: 1.2.3\nrequires_skills: [harness]\n---\n\nDo this exact thing.\n';
    const converted = portableSkill(original);
    expect(converted).toBe('---\nname: example\ndescription: >\n  A useful description.\nmetadata:\n  gooseworks-version: "1.2.3"\n  gooseworks-requires_skills: "[harness]"\n---\n\nDo this exact thing.\n');
    expect(() => portableSkill('no frontmatter')).toThrow('frontmatter');
    expect(() => portableSkill('---\nname: one\nname: two\ndescription: x\n---\nbody')).toThrow('review');
  });

  it('keeps source versions and content hashes without leaking local paths', () => {
    const files = collectPluginFiles('portable');
    const lock = JSON.parse(files.get('source-lock.json')!.toString());
    expect(lock.pluginVersion).toBe(JSON.parse(readFileSync(join(REPO, 'plugins/plugin.json'), 'utf8')).version);
    expect(lock.source.cliVersion).toBe(JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version);
    expect(lock.source.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(Object.keys(lock.skills).sort()).toEqual([...ACTIVE_SKILLS].sort());
    expect(Object.keys(lock.files).sort()).toEqual([...files.keys()].filter(name => name !== 'source-lock.json').sort());
    expect(JSON.stringify(lock)).not.toContain(REPO);
  });

  it('builds deterministic archives which an independent ZIP reader can extract exactly', () => {
    const a = buildPlugin('portable', join(work, 'first'));
    const b = buildPlugin('portable', join(work, 'second'));
    expect(readFileSync(a.archive)).toEqual(readFileSync(b.archive));
    expect(a.archiveSha256).toBe(b.archiveSha256);
    // Python's standard-library ZIP reader independently verifies CRCs, names and bytes.
    execFileSync('python3', ['-c', [
      'import pathlib, sys, zipfile',
      'with zipfile.ZipFile(sys.argv[1]) as z:',
      ' assert z.testzip() is None',
      ' assert len(z.namelist()) == len(set(z.namelist()))',
      ' root = pathlib.Path(sys.argv[2])',
      ' assert set(z.namelist()) == {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}',
      ' for name in z.namelist():',
      '  assert z.read(name) == (root / name).read_bytes()',
      '  assert z.getinfo(name).date_time == (1980, 1, 1, 0, 0, 0)',
    ].join('\n'), a.archive, a.directory]);
    expect(() => checkPlugin('portable', join(work, 'first'))).not.toThrow();
  });

  it('keeps OpenAI publication restrictions separate from portable metadata and private review data', () => {
    const files = collectPluginFiles('openai');
    const manifest = JSON.parse(files.get('plugin.json')!.toString());
    const ext = manifest.extensions['com.openai'];
    expect(Object.keys(ext).sort()).toEqual(['interface', 'publication', 'review']);
    expect(ext.publication.countries).toContain('IN');
    expect(ext.publication.countries).toContain('US');
    for (const country of ['GB', 'DE', 'FR', 'NO', 'IS', 'LI']) expect(ext.publication.countries).not.toContain(country);
    for (const key of ['logo', 'composerIcon']) expect(files.has(ext.interface[key].slice(2))).toBe(true);
    expect(() => validateFiles(files, 'portable')).toThrow('provider fields');
    const source = JSON.parse(readFileSync(join(REPO, 'plugins/openai/extension.json'), 'utf8'));
    expect(ext).toEqual({ ...source, interface: { ...source.interface,
      longDescription: manifest.description, developerName: manifest.author.name, websiteURL: manifest.homepage } });
    expect(ext.interface.longDescription).toBe(manifest.description);
    expect(ext.interface.developerName).toBe('GooseWorks');
    expect(ext.interface.websiteURL).toBe(manifest.homepage);
  });

  it('ships prepared public review cases but reports the missing recording instead of claiming submission readiness', () => {
    const files = collectPluginFiles('openai');
    const manifest = JSON.parse(files.get('plugin.json')!.toString());
    const extension = manifest.extensions['com.openai'];
    expect(extension.review.test_cases.positive).toHaveLength(5);
    expect(extension.review.test_cases.negative).toHaveLength(3);
    expect(extension.review.demo_recording_url).toBeUndefined();
    expect(extension.review.test_credentials).toBeUndefined();
    expect(extension.review.reviewer_instructions).toBeUndefined();
    expect(extension.publication.release_notes).toContain(manifest.version);
    expect(extension.apps).toBeUndefined();
    expect(extension.hooks).toBeUndefined();
    expect(openAiReviewReadiness(files)).toMatchObject({ positiveCases: 5, negativeCases: 3,
      metadataComplete: false, missing: ['verified accessible demo recording URL'] });
  });

  it('fails closed when the canonical registry or generated source changes', () => {
    const original = master.getEntrySkills();
    jest.spyOn(master, 'getEntrySkills').mockReturnValue([...original, { name: 'surprise', content: 'unexpected' }]);
    expect(() => collectPluginFiles('portable')).toThrow('allowlist');
    jest.spyOn(master, 'getEntrySkills').mockReturnValue(original.map(skill => skill.name === 'goose-ads' ? { ...skill, content: skill.content + '\nchanged' } : skill));
    expect(() => collectPluginFiles('portable')).toThrow('Stale generated skill');
  });

  it.each(['reviewer-credentials.txt', '../escape', 'skills/extra/SKILL.md'])('rejects an unexpected package path: %s', path => {
    const files = collectPluginFiles('portable');
    files.set(path, Buffer.from('extra'));
    expect(() => validateFiles(files, 'portable')).toThrow('Unexpected package path');
  });

  it('rejects LFS pointers, credentials and endpoint changes instead of falling back', () => {
    const files = collectPluginFiles('portable');
    files.set('assets/logo.png', Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:123\nsize 42\n'));
    expect(() => validateFiles(files, 'portable')).toThrow('LFS pointer');
    files.set('assets/logo.png', collectPluginFiles('portable').get('assets/logo.png')!);
    files.set('README.md', Buffer.from('sk-proj-EXAMPLE_not_a_real_secret_1234567890'));
    expect(() => validateFiles(files, 'portable')).toThrow('Possible credential');
    files.set('README.md', Buffer.from('public'));
    files.set('mcp.json', Buffer.from(JSON.stringify({ mcpServers: { gooseworks: { type: 'streamable-http', url: 'https://staging-mcp.gooseworks.ai/mcp' } } })));
    expect(() => validateFiles(files, 'portable')).toThrow('production endpoint');
  });

  it('preserves existing output, refuses external destinations and rejects output symlinks', () => {
    const existing = join(work, 'existing');
    mkdirSync(existing);
    writeFileSync(join(existing, 'mine.txt'), 'keep me');
    expect(() => buildPlugin('portable', existing)).toThrow('already exists');
    expect(readFileSync(join(existing, 'mine.txt'), 'utf8')).toBe('keep me');
    expect(() => buildPlugin('portable', join(REPO, 'unapproved-output'))).toThrow('below .plugin-build');
    expect(existsSync(join(REPO, 'unapproved-output'))).toBe(false);
    symlinkSync(work, join(work, 'link'));
    expect(() => buildPlugin('portable', join(work, 'link', 'candidate'))).toThrow('symlink');
    symlinkSync(join(work, 'missing'), join(work, 'dangling'));
    expect(() => buildPlugin('portable', join(work, 'dangling', 'candidate'))).toThrow('symlink');
  });

  it('generates an installable versioned Git directory and Cursor entry from the same portable package', () => {
    const candidate = distributionFiles();
    const manifest = JSON.parse(candidate.files.get('plugin.json')!.toString());
    const marketplace = JSON.parse(candidate.marketplace.toString());
    expect(candidate.root).toBe(join(REPO, 'distributions', manifest.version, 'gooseworks'));
    expect(marketplace.plugins).toEqual([{ name: manifest.name,
      source: `distributions/${manifest.version}/gooseworks`, version: manifest.version,
      description: manifest.description, logo: 'assets/logo.png' }]);
    expect(candidate.files).toEqual(collectPluginFiles('portable'));
    expect(JSON.parse(candidate.files.get('mcp.json')!.toString()).mcpServers.gooseworks.url).toBe('https://mcp.gooseworks.ai/mcp');
    expect([...candidate.files.keys()].some(name => /\.app\.json|\.claude-plugin|hooks\//.test(name))).toBe(false);
  });

  it('rejects changed files, added files, package symlinks and changed archives', () => {
    const out = join(work, 'changed');
    const result = buildPlugin('portable', out);
    const readme = join(result.directory, 'README.md');
    writeFileSync(readme, 'changed');
    expect(() => checkPlugin('portable', out)).toThrow('differs');
    writeFileSync(readme, collectPluginFiles('portable').get('README.md')!);
    const extra = join(result.directory, 'extra.txt');
    writeFileSync(extra, 'extra');
    expect(() => checkPlugin('portable', out)).toThrow('Unexpected package path');
    rmSync(extra);
    symlinkSync(readme, extra);
    expect(() => checkPlugin('portable', out)).toThrow('symlink');
    rmSync(extra);
    writeFileSync(result.archive, Buffer.from('bad zip'));
    expect(() => checkPlugin('portable', out)).toThrow('Archive differs');
  });

  it('rejects unknown targets and does not add environment-dependent ZIP timestamps', () => {
    expect(() => collectPluginFiles('claude' as 'portable')).toThrow('Unknown target');
    const files = collectPluginFiles('portable');
    expect(makeZip(files)).toEqual(makeZip(new Map([...files].reverse())));
  });
});
