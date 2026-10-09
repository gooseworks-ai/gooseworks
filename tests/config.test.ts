// Staging uses the staging Growth app, ads-staging.gooseworks.ai, for sign-in
// (/cli/auth and device sign-in's /link) and for links in staged skills.
// app.staging.gooseworks.ai is the retired GTM app: it has no /link.
const saved = process.env.GOOSEWORKS_FRONTEND_URL;

function loadConfig(environment: 'production' | 'staging', frontend?: string) {
  jest.resetModules();
  if (frontend === undefined) delete process.env.GOOSEWORKS_FRONTEND_URL;
  else process.env.GOOSEWORKS_FRONTEND_URL = frontend;
  require('../src/environment').selectEnvironment(environment);
  return require('../src/config') as typeof import('../src/config');
}

afterEach(() => {
  if (saved === undefined) delete process.env.GOOSEWORKS_FRONTEND_URL;
  else process.env.GOOSEWORKS_FRONTEND_URL = saved;
  jest.resetModules();
  require('../src/environment').selectEnvironment('production');
});

describe('config FRONTEND_URL', () => {
  it('signs in through the staging Growth app on staging, and make.gooseworks.ai in production', () => {
    expect(loadConfig('staging').FRONTEND_URL).toBe('https://ads-staging.gooseworks.ai');
    expect(loadConfig('production').FRONTEND_URL).toBe('https://make.gooseworks.ai');
  });

  it('refuses a production frontend override on staging', () => {
    expect(() => loadConfig('staging', 'https://make.gooseworks.ai')).toThrow('Staging sign-in must use the staging frontend');
    expect(loadConfig('staging', 'https://ads-staging.gooseworks.ai').FRONTEND_URL).toBe('https://ads-staging.gooseworks.ai');
  });
});

describe('stagingContent', () => {
  it('points Growth app links in staged skills at ads-staging', () => {
    const { stagingContent } = require('../src/skills/staging-content') as typeof import('../src/skills/staging-content');
    const out = stagingContent('Open https://make.gooseworks.ai/brand to review.');
    expect(out).toContain('https://ads-staging.gooseworks.ai/brand');
    expect(out).not.toContain('app.staging.gooseworks.ai');
  });
});
