/**
 * GV-70: a package that pins its atoms (metadata.atom_versions) is honoured
 * where the CLI reads skills. A dependency served at another version is never
 * reported current, and a changed pin makes a saved package stale.
 */
import { compareSavedPackage } from '../../src/skills/package-freshness';

const pkg = (served: string, pinned = '1.2.0') => ({
  slug: 'make-a-video',
  contentHash: 'aaa',
  metadata: { atom_versions: { 'html-frames': pinned } },
  requiresSkills: ['html-frames'],
  dependencySkills: [{ slug: 'html-frames', contentHash: 'bbb', version: served }],
});

it('reports a dependency served at another version than its pin', () => {
  expect(compareSavedPackage(pkg('1.2.0')).status).toBe('not_compared');
  const result = compareSavedPackage(pkg('1.3.0'));
  expect(result.status).toBe('pin_mismatch');
  expect(result.pins.mismatches).toEqual([{ slug: 'html-frames', pinned: '1.2.0', served: '1.3.0' }]);
  expect(compareSavedPackage(pkg('1.3.0'), pkg('1.3.0')).status).toBe('pin_mismatch');
});

it('treats a changed pin as a changed package', () => {
  expect(compareSavedPackage(pkg('1.2.0'), pkg('1.2.0')).status).toBe('current');
  const result = compareSavedPackage(pkg('1.3.0', '1.3.0'), pkg('1.2.0'));
  expect(result.status).toBe('stale');
  expect(result.changes).toContain('atom_versions:html-frames');
});
