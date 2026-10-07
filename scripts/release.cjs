/* Build once, inspect the packed bytes, and publish that same archive with npm OIDC. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function releaseIdentity(version, branch, run, sha, nextVersion) {
  if (!['dev', 'main'].includes(branch) || !/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid release source');
  if (branch === 'main') return { version, tag: 'latest' };
  if (!/^\d+$/.test(String(run)) || !/^\d+\.\d+\.\d+$/.test(nextVersion)) throw new Error('Invalid prerelease identity');
  return { version: `${nextVersion}-dev.${run}.${sha.slice(0, 8)}`, tag: 'next' };
}
function output(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  console.log(`${name}=${value}`);
}
async function metadata(version) {
  const response = await fetch(`https://registry.npmjs.org/gooseworks/${encodeURIComponent(version)}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry unavailable (${response.status})`);
  return response.json();
}
function currentHead(branch, sha) {
  const remote = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' }).split(/\s/)[0];
  if (remote !== sha) throw new Error('A newer merge reached this branch. Refusing to move its npm tag back.');
}
async function prepare() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const branch = process.env.GITHUB_REF_NAME, sha = process.env.GITHUB_SHA;
  const notes = fs.readdirSync('.changeset').filter(file => file.endsWith('.md') && file !== 'README.md');
  if (branch === 'main' && notes.length) { output('publish', 'false'); console.log('Waiting for the version PR to merge.'); return; }
  let nextVersion = pkg.version.replace(/\d+$/, value => String(Number(value) + 1));
  if (branch === 'dev' && notes.length) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'goose-release-plan-'));
    try {
      const file = path.join(temp, 'plan.json');
      execFileSync('node', ['node_modules/@changesets/cli/bin.js', 'status', '--output', file], { stdio: 'inherit' });
      const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
      const release = plan.releases.find(entry => entry.name === 'gooseworks');
      if (!release) throw new Error('Changesets did not plan the GooseWorks release');
      nextVersion = release.newVersion;
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  }
  const identity = releaseIdentity(pkg.version, branch, process.env.GITHUB_RUN_NUMBER, sha, nextVersion);
  const existing = await metadata(identity.version);
  if (branch === 'main' && existing && existing.gooseworksRelease?.commit !== sha) {
    const changed = execFileSync('git', ['diff', 'HEAD^', 'HEAD', '--', 'package.json'], { encoding: 'utf8' });
    if (/^[+-]\s*"version":/m.test(changed)) throw new Error('This stable version was already published from another commit. Create a new version; never overwrite it.');
    output('publish', 'false'); console.log('The current stable version is already released.'); return;
  }
  currentHead(branch, sha);
  pkg.version = identity.version;
  pkg.gooseworksRelease = { commit: sha, branch };
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  output('publish', 'true'); output('version', identity.version); output('tag', identity.tag);
}
function pack() {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts'], { encoding: 'utf8' }))[0];
  const archive = fs.readFileSync(packed.filename);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const record = { file: packed.filename, version: pkg.version, commit: pkg.gooseworksRelease.commit, branch: pkg.gooseworksRelease.branch, integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}` };
  fs.writeFileSync('release-artifact.json', JSON.stringify(record, null, 2) + '\n');
  output('archive', packed.filename);
}
async function publish() {
  const artifact = JSON.parse(fs.readFileSync('release-artifact.json', 'utf8'));
  const identity = releaseIdentity(artifact.version.split('-')[0], artifact.branch, process.env.GITHUB_RUN_NUMBER, artifact.commit, artifact.version.split('-')[0]);
  if (identity.version !== artifact.version) throw new Error('Release version does not match this CI run');
  if (artifact.commit !== process.env.GITHUB_SHA || artifact.branch !== process.env.GITHUB_REF_NAME) throw new Error('Release artifact/source mismatch');
  const integrity = `sha512-${createHash('sha512').update(fs.readFileSync(artifact.file)).digest('base64')}`;
  if (integrity !== artifact.integrity) throw new Error('Release archive changed after testing');
  currentHead(artifact.branch, artifact.commit);
  let existing = await metadata(artifact.version);
  const verify = value => {
    if (value?.gooseworksRelease?.commit !== artifact.commit || value?.dist?.integrity !== artifact.integrity) throw new Error('Published version exists with different source or bytes');
  };
  if (existing) verify(existing);
  else {
    let failure;
    try { execFileSync('npm', ['publish', artifact.file, '--tag', identity.tag, '--access', 'public', '--provenance', '--ignore-scripts'], { stdio: 'inherit' }); }
    catch (error) { failure = error; }
    // npm can accept a publish before processing makes the version installable.
    const deadline = Date.now() + 10 * 60 * 1000;
    while (true) {
      existing = await metadata(artifact.version);
      if (existing) break;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      console.log(`Waiting for npm to make ${artifact.version} available...`);
      await new Promise(resolve => setTimeout(resolve, Math.min(10000, remaining)));
    }
    if (!existing) throw failure || new Error('npm accepted the release but it is still unavailable after 10 minutes. Check npm processing before retrying this workflow.');
    verify(existing);
  }
  output('published', 'true'); output('version', artifact.version);
}
module.exports = { releaseIdentity, prepare, pack, publish };
if (require.main === module) {
  const commands = { prepare, pack, publish };
  Promise.resolve().then(() => { if (!commands[process.argv[2]]) throw new Error('Expected prepare, pack, or publish'); return commands[process.argv[2]](); })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
