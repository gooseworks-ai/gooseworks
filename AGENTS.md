# Agent notes for this repo

## Entry skills are generated consumers

The five active workflow bodies, routing data and package inputs are authored in private `gooseworks-app/apps/plugin/`. This CLI imports a reviewed export into `src/skills/plugin-source.generated.json`, pinned by `plugin-source-pin.json`. Edit the app source, export its consumer bundle, and use `npm run import:plugin -- /absolute/path/to/consumer.json`; then run `npm run generate:skills` and verify the outputs.

`skills/` is generated **and committed**. Keep it: the npm package ships it and the backend fetches these public files for chat apps. CLI installation reads the pinned generated entries through `master-skill.ts`, without access to the private app checkout. Preserve the existing six-entry install order. The retired `goose-video-local` helper remains CLI-only in `legacy-video-local.ts`; the active plugin contains five entries.

`distributions/<version>/gooseworks/` and `.cursor-plugin/marketplace.json` are generated public installation files. A circulated version stays immutable; new bytes require a new candidate version. `plugins/README.md` documents the build/check/import flow. Generated skill strings, route data and package bytes are not a second authoring library.

## Existing provider compatibility

`.claude-plugin/` and `.codex-plugin/` retain the earlier CLI plugin installation paths. Keep those compatibility files separate from the new portable/OpenAI exports.
