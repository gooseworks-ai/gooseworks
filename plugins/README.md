# Plugin package consumers

Plugin authoring lives in private `gooseworks-app/apps/plugin/`. This public CLI contains a pinned, generated consumer export and installable public files. Customers never need the private repository. The five current workflow bodies and existing six CLI entries keep their behavior.

## Import, build and verify

In the app repository, commit the reviewed plugin source, then run `node apps/plugin/scripts/export-consumer.ts apps/plugin/.plugin-build/consumer.json`. Import that exact local export here:

```sh
npm run import:plugin -- /absolute/path/to/consumer.json
npm run generate:skills
npm run test:plugin
npm run build
npm run build:plugin -- portable .plugin-build/portable-new
npm run build:plugin -- openai .plugin-build/openai-new
npm run build:plugin -- portable .plugin-build/portable-new --check
npm run test:plugin:format -- .plugin-build/portable-new/gooseworks .plugin-build/openai-new/gooseworks
npm run export:plugin
npm run export:plugin -- --check
```

A build always needs a new output path. The versioned public export is immutable and its Cursor repository pointer is generated. `source-lock.json` identifies the canonical app commit and file hashes. `plugin-source-pin.json` records that app revision and the imported bundle digest. Package checks fail if local generated instructions drift.

The app consumer export contains five original CLI skill strings, shared routes, reviewed backend-video snapshots and only the allowlisted public portable/OpenAI package bytes. Metadata, frontmatter transformations, MCP configuration and workflow text are changed in the app source. Public schema fixtures under `plugins/schemas/` are pinned upstream validation references.

Portable and OpenAI exports use only the production HTTPS MCP with client-managed sign-in. Their file set contains no app mappings, lifecycle hooks, secrets or private reviewer material. Video retains its current local handoff; a host without execution prepares the request and hands over the approved command.

OpenAI includes prepared five positive and three negative review cases, preserved country restrictions and the existing payment disclosure. The verified recording, dedicated reviewer-account runs and actual provider installation evidence remain outstanding. Successful packaging is preparation evidence only. Do not submit, publish or deploy a candidate before the owner's review.
