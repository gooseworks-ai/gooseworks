# Agent notes for this repo

## `skills/` is generated AND committed — never delete it

The vendored entry skills under `skills/` (`gooseworks`, `goose-ads`, `goose-video`)
are generated from the single source of truth in `src/skills/master-skill.ts` by
`npm run generate:skills`. They are committed on purpose:

- the npm package ships them (`package.json` `files: ["skills"]`), and
- the backend app-MCP server fetches them from this repo's **raw GitHub URLs** to
  serve Cowork clients that have no filesystem to install into.

They are NOT stale installed copies. Do not `rm -rf` them when cleaning up
`~/.agents/skills/` or `~/.claude/skills/` installs — those live in the home
directory, not here. If a skill body changes, edit `master-skill.ts`, run
`npm run generate:skills`, and commit the regenerated output.

`skills/goose-product-photos/` is a standalone (non-generated) skill; it is also
committed and must not be deleted.

## Plugin files

`.claude-plugin/` (plugin.json + marketplace.json) and `.codex-plugin/` make this
repo installable as a Claude Code plugin marketplace
(`/plugin marketplace add gooseworks-ai/gooseworks`).
