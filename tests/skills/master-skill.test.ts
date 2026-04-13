import { getMasterSkillContent } from '../../src/skills/master-skill';

describe('skills/master-skill', () => {
  const content = getMasterSkillContent();

  it('returns a non-empty string', () => {
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  });

  it('contains YAML frontmatter with slug', () => {
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('slug: gooseworks-master');
  });

  it('contains skill search instructions', () => {
    expect(content).toContain('/api/skills/search');
  });

  it('contains skill catalog fetch instructions', () => {
    expect(content).toContain('/api/skills/catalog/');
  });

  it('contains credit balance check', () => {
    expect(content).toContain('/v1/credits');
  });

  describe('Raw API Discovery fallback', () => {
    it('contains the Raw API Discovery section', () => {
      expect(content).toContain('## Raw API Discovery (fallback)');
    });

    it('contains orthogonal search endpoint', () => {
      expect(content).toContain('/v1/proxy/orthogonal/search');
    });

    it('contains orthogonal details endpoint', () => {
      expect(content).toContain('/v1/proxy/orthogonal/details');
    });

    it('contains orthogonal run endpoint', () => {
      expect(content).toContain('/v1/proxy/orthogonal/run');
    });

    it('instructs agent to tell user the cost', () => {
      expect(content).toContain('Always tell the user the cost');
    });

    it('describes the search-details-run workflow', () => {
      expect(content).toMatch(/Search first/);
      expect(content).toMatch(/Get details/);
      expect(content).toMatch(/Run/);
    });
  });

  it('contains working directory instructions', () => {
    expect(content).toContain('## Working Directory & Output Files');
  });

  it('contains GooseWorks credential setup', () => {
    expect(content).toContain('GOOSEWORKS_API_KEY');
    expect(content).toContain('GOOSEWORKS_API_BASE');
  });
});
