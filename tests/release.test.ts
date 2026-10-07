const { releaseIdentity } = require('../scripts/release.cjs');
test('dev releases are unique and never select latest', () => {
  expect(releaseIdentity('0.4.5', 'dev', '12', 'a'.repeat(40), '0.5.0')).toEqual({ version: '0.5.0-dev.12.aaaaaaaa', tag: 'next' });
  expect(releaseIdentity('0.4.5', 'dev', '13', 'a'.repeat(40), '0.5.0').version).not.toBe(releaseIdentity('0.4.5', 'dev', '12', 'a'.repeat(40), '0.5.0').version);
});
test('stable releases use the recorded version and refuse feature branches', () => {
  expect(releaseIdentity('0.5.0', 'main', '12', 'a'.repeat(40), '0.5.0')).toEqual({ version: '0.5.0', tag: 'latest' });
  expect(() => releaseIdentity('0.5.0', 'feature', '12', 'a'.repeat(40), '0.5.0')).toThrow();
  expect(() => releaseIdentity('0.5.0', 'dev', '12;echo bad', 'a'.repeat(40), '0.5.0')).toThrow();
});
