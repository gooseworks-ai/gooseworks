---
"gooseworks": patch
---

Add `gooseworks video step <id> <step> --edit` and `gooseworks video make <id> --patched <step>`: when a step's own code is wrong, the agent takes out the exact locked part that step ran, fixes it, and makes the video again with it. The edit goes with every hand-over and the upload; the edited copy must match the lock in every file it did not change, part.json never changes, and the server refuses any paid request the edited step did not already order for this video.
