---
"gooseworks": patch
---

When a video fails the final check, `gooseworks video make` now reports the check's own words (for example "The video is too short.") from the check part's reasons, instead of a generic line. The words pass the same filter as other failure words, and the generic line is kept when the check gave none.
