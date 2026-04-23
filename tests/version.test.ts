import { getVersion } from '../src/version';

const pkg = require('../package.json') as { version: string };

describe('version/getVersion', () => {
  it('returns the version from package.json', () => {
    expect(getVersion()).toBe(pkg.version);
  });

  it('returns a non-empty string', () => {
    const v = getVersion();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });
});
