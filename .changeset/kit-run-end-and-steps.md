---
"gooseworks": patch
---

`gooseworks video make` is clearer and ends on time:

- It hands the video over before a first run downloads the video browser, so the card shows the video started within seconds. The browser is set up right after, while the card says "Setting up your computer for the video", and then the server gets the computer's full report. A server that doesn't take the early hand-over gets the full report first, as before.
- Its first line names the video, the brand and the GooseWorks environment (when the server sends them). Then it prints one plain line as each step starts, counts on and finishes, in the card's own words.
- Each run keeps its own log under the video's `runs/` folder, and every entry names the run and the GooseWorks version. A run that fails or is stopped for any reason but the person's own Stop prints where its log is, for support.
- Once the run stops it sends its last report within 30 seconds and exits, even when the server can't be reached. A report it could not send waits for the next run, as before.
- It prints the server's sentence for the person (`say`) when the server's advice is written for the AI; otherwise the error and its fix, as before.
- A piece the maker failed without charging is tried again on a later run, with a new attempt. A step that runs out of time while the maker is still making a piece reports `provider_slow`, which a new run can get past.
