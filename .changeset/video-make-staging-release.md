---
"gooseworks": patch
---

Making a video on your computer recovers from stops more cleanly:

- A piece that failed at its maker without being charged is tried again on your next run, and running the same command carries on where it stopped.
- When the run stops because of this computer or our side (Ctrl-C, a download that didn't come through, a piece we lost, parts not ready yet), the card hears it at once instead of showing the video as still being made.
- A final check the kit can't fix ends the run cleanly instead of failing the same way on every run.
- The kit no longer tells the server to blame your plan when its own checks failed.
- Stop messages no longer say "nothing was spent"; the card shows what this video actually spent.
- A second make command for a video that is already being made on this computer no longer interrupts the first one.
- `gooseworks logout` removes its Claude Code connection even when no sign-in is saved.
