---
"gooseworks": patch
---

When a part refuses a video's plan, `gooseworks video make` now passes on the part's own sentence (such as which label is too long, or how long the video would run against the style's limits) followed by "Change the plan, then make it again.", both in the terminal and in the reason sent to the server, so the card and the AI know what to fix. Only plain words get through: a sentence with a file path, a file name, tool output, a field path or a part or step id stays in the run log, and the generic words are used when nothing plain is left. Failures that a new run can get past still show the generic words. A failed final check now shows the check's own words in the terminal as well as on the card.
