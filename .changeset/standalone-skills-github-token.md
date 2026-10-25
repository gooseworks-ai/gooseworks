---
"gooseworks": patch
---

`install --with` sends `GITHUB_TOKEN` to the GitHub API when it is set. The rate-limit error has always said "Set GITHUB_TOKEN to raise the limit", but the token was never sent, so every lookup stayed on the anonymous 60-an-hour limit. A token now raises it to 5,000 an hour. The token goes only to api.github.com, never to file downloads or a `GOOSE_SKILLS_RAW_BASE` origin.
