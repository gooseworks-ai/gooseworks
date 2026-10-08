# Release notes

Add a changeset to each CLI change with `npm run changeset`. **Select patch for routine releases**, including fixes and new commands: `0.4.4 → 0.4.5 → 0.4.6`. Select minor or major only when the user explicitly requests that version change.

Merging to `dev` publishes a unique `gooseworks@next` prerelease. Promote tested changes to `main`; the bot opens a version PR. Merging that PR publishes `gooseworks@latest`.
