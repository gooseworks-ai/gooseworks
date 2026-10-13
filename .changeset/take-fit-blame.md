---
"gooseworks": patch
---

`video make`: when the step that lines a made clip up with the plan's lines (transcribe-whisper or speech-recut) refuses it, the kit no longer tells the person to change the plan. It says the failure is on our side, ends as a run-again (exit code 4, `outcome: "run_again"`), and does not replay that report on the next run, matching the server's take-fit blame.
