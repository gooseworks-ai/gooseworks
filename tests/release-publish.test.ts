const fs = require('node:fs');
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
jest.mock('node:child_process');
const { publish } = require('../scripts/release.cjs');
const exec = execFileSync as jest.Mock;
const sha = 'a'.repeat(40), bytes = Buffer.from('tested packed bytes');
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const artifact = { file: 'gooseworks-0.5.0-dev.42.aaaaaaaa.tgz', version: '0.5.0-dev.42.aaaaaaaa', branch: 'dev', commit: sha, integrity };
const existing = { gooseworksRelease: { commit: sha }, dist: { integrity } };
const originalEnv = { ...process.env }, originalFetch = global.fetch;
beforeEach(() => {
  exec.mockReset(); exec.mockImplementation((command: string) => command === 'git' ? `${sha}\trefs/heads/dev\n` : Buffer.alloc(0));
  jest.spyOn(fs, 'readFileSync').mockImplementation((file: any) => String(file) === 'release-artifact.json' ? JSON.stringify(artifact) as any : bytes);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  process.env.GITHUB_SHA = sha; process.env.GITHUB_REF_NAME = 'dev'; process.env.GITHUB_RUN_NUMBER = '42'; delete process.env.GITHUB_OUTPUT;
});
afterEach(() => { jest.restoreAllMocks(); global.fetch = originalFetch; process.env = { ...originalEnv }; });
test('publishes the exact tested archive with next and accepts a confirmed retry', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ ok: true, json: async () => existing });
  await publish();
  expect(exec).toHaveBeenCalledWith('npm', ['publish', artifact.file, '--tag', 'next', '--access', 'public', '--provenance', '--ignore-scripts'], { stdio: 'inherit' });
  exec.mockClear(); global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => existing });
  await publish(); expect(exec.mock.calls.some(call => call[0] === 'npm')).toBe(false);
});
test('an uncertain npm exit is recovered only when registry identity and bytes match', async () => {
  exec.mockImplementation((command: string) => { if (command === 'npm') throw new Error('connection interrupted after publish'); return `${sha}\trefs/heads/dev\n`; });
  global.fetch = jest.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ ok: true, json: async () => existing });
  await expect(publish()).resolves.toBeUndefined();
});
test('an existing version with different bytes is never overwritten', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ ...existing, dist: { integrity: 'sha512-wrong' } }) });
  await expect(publish()).rejects.toThrow(/different source or bytes/);
  expect(exec.mock.calls.some(call => call[0] === 'npm')).toBe(false);
});
test('stale queued releases cannot move next backwards', async () => {
  exec.mockReturnValue(`${'b'.repeat(40)}\trefs/heads/dev\n`);
  await expect(publish()).rejects.toThrow(/newer merge/);
  expect(exec.mock.calls.some(call => call[0] === 'npm')).toBe(false);
});
