import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getEntrySkills } from '../../src/skills/master-skill';

// The runtime installs these functions, while hosted MCP clients fetch the
// committed Markdown. A change is incomplete when those delivery paths differ.
describe('entry skill delivery parity', () => {
  it.each(getEntrySkills())('$name ships the same instructions as the runtime installs', ({ name, content }) => {
    const shipped = readFileSync(join(__dirname, '../../skills', name, 'SKILL.md'), 'utf8');
    expect(shipped).toBe(content);
  });
});
