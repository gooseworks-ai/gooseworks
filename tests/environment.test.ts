import { assertConnection, consumeEnvironment, getEnvironment, selectEnvironment } from '../src/environment';

afterEach(() => { selectEnvironment('production'); delete process.env.GOOSEWORKS_SESSION_ENV; });
test.each([
  [['--env', 'staging', 'login'], ['login']],
  [['install', '--claude', '--env=staging'], ['install', '--claude']],
])('selects staging before command imports (%j)', (args, expected) => {
  expect(consumeEnvironment(args)).toEqual(expected); expect(getEnvironment()).toBe('staging');
});
test('defaults to production, rejects typos and conflicting duplicate flags', () => {
  consumeEnvironment(['login']); expect(getEnvironment()).toBe('production');
  expect(() => consumeEnvironment(['--env', 'stagng'])).toThrow();
  expect(() => consumeEnvironment(['--env', 'staging', '--env', 'production'])).toThrow();
});
test('a staging agent cannot switch its Goose CLI to production', () => {
  process.env.GOOSEWORKS_SESSION_ENV = 'staging'; consumeEnvironment(['call']);
  expect(getEnvironment()).toBe('staging');
  expect(() => consumeEnvironment(['--env', 'production', 'call'])).toThrow(/pinned/);
});
test('rejects mixed hosts and deceptive URLs without falling back', () => {
  selectEnvironment('staging');
  assertConnection('https://api.staging.gooseworks.ai', 'api');
  assertConnection('https://mcp.staging.gooseworks.ai/mcp', 'mcp');
  for (const url of ['https://api.gooseworks.ai', 'https://api.staging.gooseworks.ai.evil.test', 'http://api.staging.gooseworks.ai', 'https://user:pass@api.staging.gooseworks.ai']) expect(() => assertConnection(url, 'api')).toThrow();
  expect(() => assertConnection('https://mcp.gooseworks.ai/mcp', 'mcp')).toThrow();
  selectEnvironment('production'); expect(() => assertConnection('https://api.staging.gooseworks.ai', 'api')).toThrow();
});
