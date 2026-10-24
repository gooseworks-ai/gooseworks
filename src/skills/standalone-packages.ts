export interface StandaloneIndex {
  skills: Array<{ slug: string; path: string; metadata?: { requires_skills?: string[] } }>;
  retired_skills?: Array<{ slug: string; replacement: string | null; reason?: string }>;
}

/** Resolve the complete package before downloading or replacing any local file. */
export function resolveStandalonePackages(index: StandaloneIndex, slug: string): Array<{ slug: string; prefix: string }> {
  const retired = index.retired_skills?.find(entry => entry.slug === slug);
  if (retired) {
    if (!retired.replacement) throw new Error(`Skill "${slug}" was removed from the catalog.${retired.reason ? ` ${retired.reason}` : ''}`);
    throw new Error(`Skill "${slug}" was retired. Use "${retired.replacement}" instead.`);
  }
  if (!Array.isArray(index.skills) || index.skills.length === 0) throw new Error('Incomplete skill index');
  const skills = new Map(index.skills.map(skill => [skill.slug, skill]));
  const result: Array<{ slug: string; prefix: string }> = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  function visit(name: string): void {
    if (done.has(name) || visiting.has(name)) return;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`Invalid skill dependency: ${name}`);
    const skill = skills.get(name);
    if (!skill) throw new Error(`Required skill "${name}" is missing from the catalog`);
    if (!/^(?:skills|marketing-agent)\//.test(skill.path) || skill.path.split('/').some(part => !part || part === '..' || part === '.') || !skill.path.endsWith(`/${name}`)) throw new Error(`Invalid package path for ${name}`);
    visiting.add(name);
    for (const dependency of skill.metadata?.requires_skills || []) visit(dependency);
    visiting.delete(name);
    done.add(name);
    result.push({ slug: name, prefix: `${skill.path}/` });
  }
  visit(slug);
  return result;
}
