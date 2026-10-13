---
"gooseworks": patch
---

The video kit checks the account against the video before any slow setup. When this computer is signed in to another account (or its sign-in expired), it signs in again by itself with the account chooser, bound to that video, and asks once more; the refusal is kept in the video's log. It always talks to GOOSEWORKS_API_BASE or the environment's address, and `video check` says which account it reported for. `gooseworks login` signs in again for a different `--api-base`, adds `--switch` for another account, and recovers from a sign-in saved for another environment. `gooseworks logout` cancels the saved key on the server and says only what it actually removed. The browser preflight times only the browser's launch, so a slow start on a busy machine no longer fails it. Needs the matching backend (access check, video-bound sign-in, key revoke) before release.
