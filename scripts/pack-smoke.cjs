const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-packed-cli-'));
try {
  const artifact = process.argv[2] || JSON.parse(fs.readFileSync('release-artifact.json', 'utf8')).file;
  execFileSync('npm', ['install', '--prefix', root, path.resolve(artifact), '--ignore-scripts', '--no-audit', '--no-fund'], { stdio: 'inherit' });
  const entry = path.join(root, 'node_modules', 'gooseworks', 'dist', 'index.js');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'gooseworks', 'package.json'), 'utf8'));
  const env = { ...process.env, GOOSEWORKS_USER_HOME: root }; delete env.GOOSEWORKS_SESSION_ENV; delete env.GOOSEWORKS_API_BASE;
  const run = args => spawnSync(process.execPath, [entry, ...args], { env, encoding: 'utf8' });
  assert.equal(run(['--version']).stdout.trim(), pkg.version);
  assert.equal(run(['--env', 'staging', '--help']).status, 0);
  assert.match(run(['--help']).stdout, /launch/);
  assert.equal(run(['--env', 'invalid', '--help']).status, 1);
  const refused = run(['--env', 'staging', 'install', '--claude']);
  assert.equal(refused.status, 1); assert.match(refused.stderr, /--project/);
  assert.equal(fs.existsSync(path.join(root, '.gooseworks', 'credentials.json')), false);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'gooseworks', 'skills', 'manifest.json')));
  assert.equal(manifest.version, pkg.version);
  console.log(`Packed CLI ${pkg.version} smoke checks passed.`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
