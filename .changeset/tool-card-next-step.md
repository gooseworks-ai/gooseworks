---
"gooseworks": patch
---

`gooseworks tool` now prints an answer's card text under `Card:` and its next step as a last `Next:` line, so an agent that reads only text sees the card and what to do now. Control characters in that text are dropped. `--json` still prints the raw result. The examples call `brand_setup`.
