const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const artifact = JSON.parse(fs.readFileSync('release-artifact.json', 'utf8'));
if (artifact.branch !== 'main' || artifact.commit !== process.env.GITHUB_SHA || !/^\d+\.\d+\.\d+$/.test(artifact.version)) throw new Error('Not a confirmed stable release');
const tag = `v${artifact.version}`, repo = process.env.GITHUB_REPOSITORY;
function api(route) { return JSON.parse(execFileSync('gh', ['api', `repos/${repo}/${route}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
let ref;
try { ref = api(`git/ref/tags/${tag}`); }
catch (error) { if (!String(error.stderr).includes('404')) throw error; }
if (ref) {
  let object = ref.object;
  if (object.type === 'tag') object = api(`git/tags/${object.sha}`).object;
  if (object.type !== 'commit' || object.sha !== artifact.commit) throw new Error('Existing release tag points to a different commit');
}
let release;
try { release = api(`releases/tags/${tag}`); }
catch (error) { if (!String(error.stderr).includes('404')) throw error; }
if (!release) execFileSync('gh', ['release', 'create', tag, '--target', artifact.commit, '--title', `GooseWorks CLI ${artifact.version}`, '--generate-notes'], { stdio: 'inherit' });
