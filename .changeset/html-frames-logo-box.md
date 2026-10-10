---
"gooseworks": patch
---

The html-frames part (1.1.0) puts the box it drew the brand's logo in on its timeline (`safe_zones`, use `logo`, in the video's pixels, as drawn on the last frame that shows it), so the final check looks for the logo where the frame page drew it. 1.0.0 stays published as it was.
