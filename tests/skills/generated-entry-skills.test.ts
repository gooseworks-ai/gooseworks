import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEntrySkills, withVersionReport } from '../../src/skills/master-skill';

// The runtime installs these functions, while hosted MCP clients fetch the
// committed Markdown. A change is incomplete when those delivery paths differ.
describe('entry skill delivery parity', () => {
  it.each(getEntrySkills())('$name ships the same instructions as the runtime installs', ({ name, content }) => {
    const shipped = readFileSync(join(__dirname, '../../skills', name, 'SKILL.md'), 'utf8');
    expect(shipped).toBe(content);
  });
});

// Terminal apps keep the copy they installed; the server compares this version with the published one.
describe('entry skill version report', () => {
  it.each(['gooseworks', 'goose-ads', 'goose-product-photos'])('%s sends its own front-matter version in client', (name) => {
    const { content } = getEntrySkills().find((skill) => skill.name === name)!;
    const version = /^version: (\S+)$/m.exec(content)![1];
    expect(content).toContain(`Send client with skill "${name}" and skill_version "${version}" on every call that takes it.`);
    expect(content.split('skill_version').length).toBe(2);
  });

  it('follows a version bump', () => {
    const body = '---\nname: demo\nversion: 9.9.9\n---\n\n# Demo\n\n## Rules\n\n- One.\n';
    expect(withVersionReport(body)).toContain('skill "demo" and skill_version "9.9.9"');
    expect(() => withVersionReport('---\nname: demo\n---\n\n## Rules\n')).toThrow();
  });
});
