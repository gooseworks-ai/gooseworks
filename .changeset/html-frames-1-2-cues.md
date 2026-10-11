---
"gooseworks": patch
---

html-frames 1.2.0: a frame page can now mark UI sounds with `kit.cue(name, at_s, {gain, max_s})` before it is ready (tick, tap, pop, chime, whoosh, swoosh, notify, click, bundled with the part). Each sound starts on the first frame drawn at or after its time, and the mix becomes the video's AAC track (over the video's own sound when the page is drawn over one). A page with no cues still makes a silent video.
