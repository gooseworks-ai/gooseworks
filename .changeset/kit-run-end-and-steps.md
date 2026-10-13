---
"gooseworks": patch
---

`gooseworks video make` is clearer and ends on time:

- It hands the video over before a first run downloads the video browser, so the card shows the video started within seconds. The browser is set up right after, while the card says "Setting up your computer for the video".
- Its first line names the video, the brand and the GooseWorks environment (when the server sends them). Then it prints one plain line as each step starts, counts on and finishes, in the card's own words.
- Each run keeps its own log under the video's `runs/` folder, and every entry names the run and the GooseWorks version. A run that doesn't finish prints where its log is, for support.
- Once the run stops it sends its last report within 30 seconds and exits, even when the server can't be reached. A report it could not send waits for the next run, as before.
- It prints the server's line for the person (`say`), never the advice written for the AI.
- A piece the maker failed without charging is tried again on a later run, with a new attempt. A step that runs out of time while the maker is still making a piece reports `provider_slow`, which a new run can get past.
