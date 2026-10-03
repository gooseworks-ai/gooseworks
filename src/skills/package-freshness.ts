export interface SkillPackageIdentity {
  slug: string;
  contentHash?: string | null;
  dependencySkills?: Array<{ slug: string; contentHash?: string | null }>;
}

/** Compares client-reported package identities, not arbitrary local file bytes. */
export function compareSavedPackage(current: SkillPackageIdentity, saved?: SkillPackageIdentity) {
  if (!saved) return { status: 'not_compared', basis: 'client_saved_hashes', changes: [] as string[] };
  if (saved.slug !== current.slug) throw new Error('Saved package slug does not match the requested skill');
  const changes: string[] = [];
  let unknown = !current.contentHash || !saved.contentHash;
  if (current.contentHash && saved.contentHash && current.contentHash !== saved.contentHash) changes.push(current.slug);
  const previous = new Map((saved.dependencySkills || []).map((skill) => [skill.slug, skill.contentHash]));
  const present = new Set<string>();
  for (const skill of current.dependencySkills || []) {
    present.add(skill.slug);
    if (!previous.has(skill.slug)) changes.push(skill.slug);
    else if (!skill.contentHash || !previous.get(skill.slug)) unknown = true;
    else if (previous.get(skill.slug) !== skill.contentHash) changes.push(skill.slug);
  }
  for (const slug of previous.keys()) if (!present.has(slug)) changes.push(slug);
  return {
    status: changes.length ? 'stale' : unknown ? 'unknown' : 'current',
    basis: 'client_saved_hashes',
    changes,
  };
}
