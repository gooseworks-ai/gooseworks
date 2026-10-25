import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test('installs a playbook and its transitive siblings from one commit using real temporary files', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-package-test-'));
  const originalFetch = global.fetch;
  const files = ['job', 'second-job', 'third-job', 'step', 'shared'].map(slug => `marketing-agent/skills/${slug}/SKILL.md`);
  const index = { skills: [
    { slug: 'job', path: 'marketing-agent/skills/job', metadata: { requires_skills: ['step'] } },
    { slug: 'step', path: 'marketing-agent/skills/step', metadata: { requires_skills: ['shared'] } },
    { slug: 'second-job', path: 'marketing-agent/skills/second-job', metadata: { requires_skills: ['step'] } },
    { slug: 'third-job', path: 'marketing-agent/skills/third-job', metadata: { requires_skills: ['step'] } },
    { slug: 'shared', path: 'marketing-agent/skills/shared', metadata: { requires_skills: ['step'] } }
  ], retired_skills: [{slug: 'old-job', replacement: 'job'}] };
  const requested: string[] = [];
  global.fetch = jest.fn(async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (url.includes('/commits/')) return new Response(JSON.stringify({ sha: 'a'.repeat(40) }));
    if (url.includes('/git/trees/')) return new Response(JSON.stringify({ tree: files.map(file => ({ path: file, type: 'blob' })) }));
    if (url.endsWith('/skills-index.json')) return new Response(JSON.stringify(index));
    return new Response('# ' + url.split('/').at(-2));
  }) as typeof fetch;
  try {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('os', () => ({ ...jest.requireActual('os'), homedir: () => home }));
      const { installStandaloneSkill } = await import('../../src/skills/installer');
      const savedOld = path.join(home, '.agents/skills/old-job');
      fs.mkdirSync(savedOld, {recursive:true});
      fs.writeFileSync(path.join(savedOld, 'SKILL.md'), 'saved legacy method');
      await expect(installStandaloneSkill('old-job')).rejects.toThrow(/retired.*job.*preserved/);
      expect(fs.readFileSync(path.join(savedOld, 'SKILL.md'), 'utf8')).toBe('saved legacy method');
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      await expect(installStandaloneSkill('old-job')).rejects.toThrow(/Existing old-job package preserved/);
      expect(fs.readFileSync(path.join(savedOld, 'SKILL.md'), 'utf8')).toBe('saved legacy method');
      await installStandaloneSkill('job');
      const root = path.join(home, '.agents/skills');
      for (const slug of ['job', 'step', 'shared']) {
        expect(fs.readFileSync(path.join(root, slug, 'SKILL.md'), 'utf8')).toBe('# ' + slug);
        expect(JSON.parse(fs.readFileSync(path.join(root, slug, '.gooseworks-source.json'), 'utf8')).revision).toBe('a'.repeat(40));
      }
      await installStandaloneSkill('second-job');
      expect(fs.existsSync(path.join(root, 'second-job', 'SKILL.md'))).toBe(true);
      fs.writeFileSync(path.join(root, 'step', 'SKILL.md'), 'my edited method');
      await expect(installStandaloneSkill('third-job')).rejects.toThrow(/Existing step package preserved/);
      expect(fs.readFileSync(path.join(root, 'step', 'SKILL.md'), 'utf8')).toBe('my edited method');
      expect(fs.existsSync(path.join(root, 'third-job'))).toBe(false);
      expect(fs.readFileSync(path.join(root, 'job', 'SKILL.md'), 'utf8')).toBe('# job');
      expect(fs.readFileSync(path.join(root, 'shared', 'SKILL.md'), 'utf8')).toBe('# shared');
    });
    expect(requested.filter(url => url.includes('raw.githubusercontent.com')).every(url => url.includes('/' + 'a'.repeat(40) + '/'))).toBe(true);
  } finally {
    global.fetch = originalFetch;
    jest.dontMock('os');
    fs.rmSync(home, { recursive: true, force: true });
  }
});
