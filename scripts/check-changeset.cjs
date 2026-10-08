const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const base = process.env.GITHUB_BASE_REF;
if (!base) process.exit(0);
// video-merged is the video redesign's integration branch, and video/* its lane branches (ci.yml runs on
// pull requests into both); their PRs follow the same release-note rule.
if (!['dev', 'main', 'video-merged'].includes(base) && !base.startsWith('video/')) throw new Error('Unexpected PR base');
const changed = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' }).trim().split('\n');
const notes = fs.readdirSync('.changeset').filter(file => file.endsWith('.md') && file !== 'README.md');
if (changed.some(file => file.startsWith('src/')) && !notes.length) {
  console.error('CLI changes require a release note: run npm run changeset and commit the new .changeset file.');
  process.exitCode = 1;
}
