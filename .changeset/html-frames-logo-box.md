---
"gooseworks": patch
---

The html-frames part (1.1.0) puts the box it drew the brand's logo in on its timeline (`safe_zones`, use `logo`, in the video's pixels, as drawn on the last frame that shows it), so the final check looks for the logo where the frame page drew it. 1.0.0 stays published as it was.

It also stages a PNG, JPEG or WebP picture over 2048 px on its long side through a resize to 2048 px before the page loads it: the browser dropped 4000 px product photos when a page held several and reported them as unreadable.
