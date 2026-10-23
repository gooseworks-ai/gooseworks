# Agent notes for this repo

## Release version policy

Routine CLI releases use **patch bumps**: `0.4.4 → 0.4.5 → 0.4.6`.
Select `patch` in Changesets for ordinary fixes and new commands. Use `minor`
or `major` only when the user explicitly requests that version change.
Keep the package lock aligned with the version.

## Entry skills live in goose-skills, not here

The six entry skills (`gooseworks`, `goose-ads`, `goose-video`, `goose-video-local`,
`make-custom-video`, `goose-product-photos`) live in the public
[goose-skills](https://github.com/gooseworks-ai/goose-skills) repo at `skills/entry/<slug>/`.
Routing lives there too, in `skills/entry/gooseworks/routes.json` (its `scripts/build-router.js`
renders the router's tables). This package ships no skill files.

- **To change an entry skill or a route, open a PR in goose-skills.** Its CI runs the
  entry-skill lint. goose-skills `dev` feeds staging and `main` feeds production.
- `install`, `update` and the login refresh download each entry's listed `files` from the
  goose-skills `skills-index.json` (`fetchEntrySkills` in `src/skills/installer.ts`) and write
  them to `~/.agents/skills/<slug>/` (staging: the staging profile). Test a branch with
  `GOOSE_SKILLS_RAW_BASE=https://raw.githubusercontent.com/gooseworks-ai/goose-skills/<branch>`.
- Which folders the CLI owns (and may delete) is the fixed `ENTRY_SKILL_NAMES` list in
  `src/skills/names.ts`, never the downloaded index. Add a name there when goose-skills adds an
  entry skill.
- `skills status` compares installed files with the catalog by hash. Edited, linked or
  untracked entry folders are preserved unless the user passes `--overwrite-modified`.

## Plugin files

`.claude-plugin/` (plugin.json + marketplace.json) and `.codex-plugin/` make this
repo installable as a Claude Code plugin marketplace
(`/plugin marketplace add gooseworks-ai/gooseworks`).
