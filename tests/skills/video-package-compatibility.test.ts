import { getGooseVideoLocalSkillContent, getMakeCustomVideoSkillContent } from '../../src/skills/master-skill';

describe('fetched video package compatibility instructions', () => {
  it.each([
    ['template', getGooseVideoLocalSkillContent()],
    ['custom', getMakeCustomVideoSkillContent()],
  ])('%s requires actual review guide bytes and preserves approved saved packages', (_route, content) => {
    for (const path of ['references/editorial-review.md', 'references/specialist-handoff.md', 'references/hook-compatibility.md']) {
      expect(content).toContain(path);
    }
    expect(content).toContain('nonempty text');
    expect(content).toContain('unchanged approved resume');
    expect(content).toContain('recorded package and approvals');
  });

  it.each([
    ['template', getGooseVideoLocalSkillContent()],
    ['custom', getMakeCustomVideoSkillContent()],
  ])('%s checks the real saved writer before using its brief CLI', (_route, content) => {
    expect(content).toContain('python3 <saved-writer-package>/scripts/verify_handoff.py --package-dir <saved-writer-package>');
    expect(content).toContain('--out working/script/writer-handoff-check.json');
    expect(content).toContain('script hashes');
    expect(content).toContain('missing checker');
    expect(content).toContain('older parser');
    expect(content.indexOf('scripts/verify_handoff.py')).toBeLessThan(content.indexOf('Shared editorial craft inside this template flow') < 0 ? content.indexOf('Hook changes and editorial review') : content.indexOf('Shared editorial craft inside this template flow'));
  });

  it('keeps the template provisional check and custom required-writer gate separate', () => {
    expect(getGooseVideoLocalSkillContent()).toContain('Only an actual `not_found` for an optional writer');
    expect(getGooseVideoLocalSkillContent()).toContain('Never use the provisional agent path after a provided package fails validation');
    expect(getGooseVideoLocalSkillContent()).toContain('another fetch error stops');
    expect(getMakeCustomVideoSkillContent()).toContain('unsaved and unapproved until the compatible package');
  });
});
