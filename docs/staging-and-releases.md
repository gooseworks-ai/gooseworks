# Staging and releases

**Staging has its own login, skills, caches, and agent session.** Production keeps the existing installation. Merges to `dev` publish `@next`; a version PR on `main` publishes `@latest` when merged.

## Test staging

Use a clean test folder without `.claude`, `.codex`, `.agents`, `.cursor`, or `.mcp.json` in it or its parents. Existing personal production skills stay installed.

```sh
npm install -g gooseworks@next
mkdir -p /tmp/goose-staging-test
gooseworks --env staging install --claude --mcp --project /tmp/goose-staging-test
gooseworks --env staging launch --agent claude --project /tmp/goose-staging-test
```

For Codex use `--codex` and `--agent codex`. The isolated profile needs its own Claude or Codex sign-in: add `--login` to the launch command once. Staging Goose sign-in uses `app.staging.gooseworks.ai` and allows the company's internal test accounts.

`--project` chooses the working folder. **`launch` provides isolation**: it changes the child agent's home/configuration, checks the real skill inventory, and gives it only `gooseworks-staging` MCP. Use the launcher every time. Opening the folder in an ordinary agent session uses that agent's normal production setup.

Every GooseWorks CLI command inside that session is pinned to staging, including commands copied from recipe instructions. `--env production` is refused there. Start a separate normal agent session to use production. This prevents accidental discovery/configuration overlap; it does not restrict deliberate direct network requests.

```sh
gooseworks --env staging whoami
gooseworks --env staging launch --agent codex --project /tmp/goose-staging-test --inspect
gooseworks --env staging update --project /tmp/goose-staging-test
```

Close and restart after updating. Edited isolated skill files are preserved by refusing refresh; review them or use a new test folder. Cursor staging and Windows staging launch are refused until their discovery isolation is verified. Production Cursor installation continues to work.

## Set up publishing once

An npm maintainer opens the `gooseworks` package's settings and adds a GitHub Actions trusted publisher:

| Setting | Value |
| --- | --- |
| Owner | `gooseworks-ai` |
| Repository | `gooseworks` |
| Workflow filename | `release.yml` |
| Environment | `npm-release` |

Create the GitHub `npm-release` environment and allow `dev` and `main` to deploy. Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**. The workflow uses npm OIDC, so no npm token or local npm login is needed.

Add a Changeset to CLI changes with `npm run changeset`. Raise feature PRs to `dev`; test the resulting `@next` package, then promote to `main`. Merge the bot's **Release GooseWorks CLI** version PR to publish the stable version. The bot does the version bump, generated manifest, changelog, build, tests, packaging, npm publish, and GitHub release.

The prerelease version is derived from pending Changesets (patch fallback when there is no note) and includes the CI run number and commit. It never moves `latest`. Each release publishes the exact tarball that passed the install smoke test. Retries verify published source and package integrity. Stale queued runs cannot move a tag backwards.

**Review surfaces:** the feature PR, bot version PR, GitHub Actions run, and npm's `next`/`latest` tags. Production publishing starts only after the npm maintainer sets up the trusted publisher and the version PR is merged.
