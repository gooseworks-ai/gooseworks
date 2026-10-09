export interface SkillPackageIdentity {
  slug: string;
  contentHash?: string | null;
  metadata?: Record<string, unknown> | null;
  requiresSkills?: string[];
  dependencySkills?: Array<{ slug: string; contentHash?: string | null; version?: string | null }>;
}

const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface PinCheck {
  /** none: the package pins nothing; ok: every pinned dependency is served at its pin. */
  status: 'none' | 'ok' | 'mismatch';
  mismatches: Array<{ slug: string; pinned: string; served: string | null }>;
}

/**
 * The versions a package pins its shared atoms to (`metadata.atom_versions`,
 * slug → exact version; GV-70). Style files pin their parts the same way.
 */
export function atomPins(pkg: SkillPackageIdentity): Record<string, string> {
  const raw = pkg.metadata?.atom_versions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([slug, version]) => [slug, typeof version === 'string' ? version : '']));
}

/** Every pinned atom must be served at exactly its pinned version. */
export function checkPins(pkg: SkillPackageIdentity): PinCheck {
  const pins = atomPins(pkg);
  const slugs = Object.keys(pins);
  if (slugs.length === 0) return { status: 'none', mismatches: [] };
  const served = new Map((pkg.dependencySkills || []).map((dep) => [dep.slug, dep.version ?? null]));
  const mismatches = slugs
    .filter((slug) => !EXACT_VERSION.test(pins[slug]) || served.get(slug) !== pins[slug])
    .map((slug) => ({ slug, pinned: pins[slug], served: served.get(slug) ?? null }));
  return { status: mismatches.length ? 'mismatch' : 'ok', mismatches };
}

/** Compares client-reported package identities, not arbitrary local file bytes. */
export function compareSavedPackage(current: SkillPackageIdentity, saved?: SkillPackageIdentity) {
  const pins = checkPins(current);
  // A dependency served at a version other than its pin is never current.
  if (!saved) return { status: pins.status === 'mismatch' ? 'pin_mismatch' : 'not_compared', basis: 'client_saved_hashes', changes: [] as string[], pins };
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
  if ((current.requiresSkills || []).some((slug) => !present.has(slug))) unknown = true;
  // A changed pin is a changed package, even when the hashes look the same.
  const savedPins = atomPins(saved);
  const currentPins = atomPins(current);
  for (const slug of new Set([...Object.keys(savedPins), ...Object.keys(currentPins)])) {
    if (savedPins[slug] !== currentPins[slug]) changes.push(`atom_versions:${slug}`);
  }
  return {
    status: pins.status === 'mismatch' ? 'pin_mismatch' : changes.length ? 'stale' : unknown ? 'unknown' : 'current',
    basis: 'client_saved_hashes',
    changes,
    pins,
  };
}
