# gooseworks

## 0.5.9

### Patch Changes

- 7dd46a2: Custom video assembly keeps explicit source-linked picture, speech and soundtrack intent. Preserve native dialogue clocks, refuse source gaps and detached speech retiming, and keep review evidence separate from file checks. Save an exact candidate and review request, consume the completed audiovisual review on resume, and reuse accepted assets before upload. Refresh the installed custom-video entry from the backend's revised contract.

  Requires the matching backend content-review and device-feature contracts and updated GooseSkills harness/parts. Manual acceptance belongs to Akhil; no tests or video generation were run for this change.

- 418668b: Ship the distinct modern custom-video adapter and complete production-harness requirements. Preserve explicit custom choices, actual reference viewing, two authenticated owner reviews and verified local execution. Requires the matching backend custom actions before release.
- 9910427: Update only video approval instructions. Customers can approve custom-video script and ingredient reviews in chat, with their actual words tied to the current review and cumulative price. Template-video approvals and higher prices also stay in the same chat. Cards remain available, and Studio is optional. Release with the matching server approval support.
- 93b8a7f: Custom videos now measure the exact final before upload and stop with plain time ranges when it fails, instead of sending it. The measurements allow silence or a held picture in the first 1.5 s and last 3.0 s, a 2.0 s mid-video freeze and a steady sub-bass line, so real ads with end cards and bass lines are not stopped. Content reviews state how audio and motion were checked (listened or measured), match severities case-insensitively, block on unknown severities and name any unknown field by path. Assembly timelines use whole milliseconds and pixels, drop local paths before upload, support crop and scale with limits on stretch and zoom, cap pauses and freezes and allow deliberate `callback:` repeats. Linked timelines now reach every part that declares one, and html-frames 1.3.1 widens its duration tolerance to one output frame. When a custom video waits on a review or a fix, the kit tells the run before it stops. Template videos no longer warn about audio review when no speech is planned. The make-custom-video entry text matches the current server text. Release with the matching server support for `final_measure`, the new review capabilities and the `final_measure_v1` feature.
- 38f3a53: make-custom-video asks for a stored rebuild recipe before completion: every input and recipe/source.json on the project, a clean-folder rebuild check and custom.production.source. Requires the matching backend completion check before release.
- Raise `goose-video-local` to 1.0.2 so it sits above the 1.0.1 production hotfix and installed copies move to the new version.
- 3d4c2a4: html-frames 1.2.1: a frame page that takes more than a minute to get ready or to draw a frame is reported as a timeout, so the kit tries the step again and a second miss stops the video so it can carry on, instead of failing it as a plan the customer must change.
- 6015c1e: html-frames 1.2.0: a frame page can now mark UI sounds with `kit.cue(name, at_s, {gain, max_s})` before it is ready (tick, tap, pop, chime, whoosh, swoosh, notify, click, bundled with the part). Each sound starts on the first frame drawn at or after its time, and the mix becomes the video's AAC track (over the video's own sound when the page is drawn over one). A page with no cues still makes a silent video.
- fb50215: html-frames 1.2.0 can measure the pictures a frame page gets (`facts: true`): whether each is a cutout, its backdrop colour, its main colour, its brightness, its size and where its subject sits. It also hands the page extra pictures by id (`media`) and the plan's footage windows without the clips themselves.
- 722637b: html-frames 1.2.0: scenes can now be timed by a voice track (`speech`, with `tail_s` held at the end) or held by how many words they show (`pace`). The page gets the voice track as `kit.speech` and each scene's words as `kit.scenes[i].words`. A style can mark where captions go (`caption_zone`) and which last scenes are the end card (`end_card_scenes`), and with `skip_blank` a step whose scenes have no text makes nothing instead of a blank video.
- eb2ac68: html-frames 1.2.0: a frame page can now be drawn over another step's video. The page is laid over the video with its sound kept, scenes take that video's times, its speech, end card and safe zones carry through, and the page can read each scene's quiet band to place text where the picture is emptiest.
- 42677de: The video kit checks the account against the video before any slow setup. When this computer is signed in to another account (or its sign-in expired), it signs in again by itself with the account chooser, bound to that video, and asks once more; the refusal is kept in the video's log. A first sign-in in `video make` is bound to the video too. It always talks to GOOSEWORKS_API_BASE or the environment's address, and `video check` says which account it reported for. `gooseworks login` signs in again for a different `--api-base`, adds `--switch` for another account, and recovers from a sign-in saved for another environment. `gooseworks logout` cancels the saved key on the server (quietly skipped on a server that can't yet) and says only what it actually removed. The browser preflight times only the browser's launch, so a slow start on a busy machine no longer fails it. Needs the matching backend (access check, video-bound sign-in, key revoke) before release.
- 685fd77: The entry skills no longer spell out the video kit's command or version. Each GooseWorks answer hands over its own exact command, and its last line says who starts it: an agent that can run commands starts it itself, other apps give it to the customer. The skills' rules block is refreshed from the server's rulebook 1.3.2.
- e35f1fc: List what this kit supports in package.json (`gooseworksKit.features`: detach, status, verify, log, json, step_edit, patched), so the server hands an app the detached run only for a kit that has it. Shorten the custom line in the goose-video entry skill to match the server.
- 3c27a9f: When the video kit cannot reach a local or private address, it no longer tells the person to check their internet connection.
- 5fc8782: The making card's rows say what the video kit is doing, in the card's own words: creating the voice (or the avatar and voice), the pictures, the video clips, syncing lips, the music, the screens, joining the clips, adding captions, mixing the sound, the end card, and checking it once before delivering. The rows show as soon as the style and parts are ready, while the video's files come down, with a note for each setup step. The card also hears when the final check of the finished video starts.
- bcf459d: A scene the customer had remade as it was (a fix's remake) is ordered anew under its take instead of coming back from the earlier take.
- fdaf06c: `video make` always ends: the run's stop signal is aborted on every end, the last report has a deadline, the process ends within 30 seconds of a stop even when a part won't let go, and a run past its time limit (worked out from its parts, at most an hour) stops as one the same command carries on. `video make <id> --detach` starts the make in a process of its own that outlives the shell (one JSON line, then it returns; detached makes take turns), `video status <ids...>` says how each video is going on this computer, `video log <id>` prints the newest run log, and `--json` prints one JSON event per line ending with a JSON result. Exit codes are stable: 0 done, 1 needs a change, 3 stopped, 4 run again, 5 update the kit, 6 sign in. The line's "retry" answers are waited out inside the step's time, and the parts loader no longer compares the published parts index (the video's lock already holds every file's hash; the withdrawn list is still checked), so a lagging index can't stop a video. A finished video gets a frame contact sheet (about 12 frames and the end card, labelled by scene) next to it, `video verify <ids...>` names it with what to look for before saying the video is ready, a product whose photos' colours show in no frame gets a warning, and the final check's warnings go up with the video for its delivery summary.
- 1d40edf: `video make --detach` prints exactly one JSON line on stdout (its other words go to stderr), and two detaches of the same video never start two runs. Every way a make can fail, including one before the run starts, ends on a result with its stable exit code, and a sign-in refusal from the line now exits with 6 from every path. The run's time limit counts from the start of the make, and the process ends within 30 seconds of a stop. A finished video is saved as `final.mp4` only once our server passes it, and `video verify` names a final only after a run that ended done. Taking a step out again repairs a damaged untouched copy, edited copies are stored one at a time, and an edit's diff is cut to the request's byte budget.
- a463dfe: `gooseworks video make` is clearer and ends on time:

  - It hands the video over before a first run downloads the video browser, so the card shows the video started within seconds. The browser is set up right after, while the card says "Setting up your computer for the video", and then the server gets the computer's full report. A server that doesn't take the early hand-over gets the full report first, as before.
  - Its first line names the video, the brand and the GooseWorks environment (when the server sends them). Then it prints one plain line as each step starts, counts on and finishes, in the card's own words.
  - Each run keeps its own log under the video's `runs/` folder, and every entry names the run and the GooseWorks version. A run that fails or is stopped for any reason but the person's own Stop prints where its log is, for support.
  - Once the run stops it sends its last report within 30 seconds and exits, even when the server can't be reached. A report it could not send waits for the next run, as before.
  - It prints the server's sentence for the person (`say`) when the server's advice is written for the AI; otherwise the error and its fix, as before.
  - A piece the maker failed without charging is tried again on a later run, with a new attempt. A step that runs out of time while the maker is still making a piece reports `provider_slow`, which a new run can get past.

- a1ac9c0: `gooseworks video make` and `gooseworks video check` use a saved sign-in only when it belongs to the selected environment's own address (or when `GOOSEWORKS_API_BASE` is set). A sign-in saved for any other address, such as a developer's local server, no longer sends a customer's video there: the kit talks to the environment's address and treats the computer as not signed in. When the computer is not signed in, the same command now opens GooseWorks sign-in itself and carries on, instead of stopping with "Sign in first." A worker is unchanged.
- 4b29d2a: When `gooseworks video make` or `gooseworks video check` needs a sign-in where no one may be watching (CI, or no terminal), it prints the approval link and asks to run the same command again, instead of waiting.
- cbe6a0c: Study supplied video references before comparing formats, and check custom-video support instead of forcing an unrelated template. Keep installed video entries aligned with the reviewed server instructions.
- 55a1dcb: `video make`: when the step that lines a made clip up with the plan's lines (transcribe-whisper or speech-recut) refuses it, the kit no longer tells the person to change the plan. It says the failure is on our side, ends as a run-again (exit code 4, `outcome: "run_again"`), and does not replay that report on the next run, matching the server's take-fit blame. If the server answers that report by stopping the video (the same step failing again), the run ends stopped instead of run-again.
- 6a751cd: Add `gooseworks video step <id> <step> --edit` and `gooseworks video make <id> --patched <step>`: when a step's own code is wrong, the agent takes out the exact locked part that step ran, fixes it, and makes the video again with it. The edit goes with every hand-over and the upload; the edited copy must match the lock in every file it did not change, part.json never changes, and the server refuses any paid request the edited step did not already order for this video.
- d95964f: Making a video on your computer recovers from stops more cleanly:

  - A piece that failed at its maker without being charged is tried again on your next run, and running the same command carries on where it stopped.
  - When the run stops because of this computer or our side (Ctrl-C, a download that didn't come through, a piece we lost, parts not ready yet), the card hears it at once instead of showing the video as still being made.
  - A final check the kit can't fix ends the run cleanly instead of failing the same way on every run.
  - The kit no longer tells the server to blame your plan when its own checks failed.
  - Stop messages no longer say "nothing was spent"; the card shows what this video actually spent.
  - A second make command for a video that is already being made on this computer no longer interrupts the first one.
  - The final check knows which finishing steps your video's style uses, so it no longer fails the loudness of a video whose style leaves the sound as made.
  - `gooseworks logout` removes its Claude Code connection even when no sign-in is saved.

- bbee910: The video kit runs a part our server moved to a newer published version after the style pinned it (a free part's patch, or a paid part that orders the same pieces), when the video's lock names the version it moved from. Every file is still checked against the lock.
- 81b46c2: Video verification now covers every scene, exposes the actual final audio and the track before the sound layer, and lists cut boundaries and word gaps for closer listening. Bind review evidence to the final checksum and distinguish successful file checks from a completed picture and audio review.

## 0.5.8

### Patch Changes

- 586af49: Restore the three video skills to the workflow supported by the production main app, with higher skill versions. This fixes custom-video catalog loading and keeps saved projects, approvals and budgets intact.

## 0.5.7

### Patch Changes

- f300907: When a picture cannot be made smaller for the video, the person reads plain words with the picture's size and what to use instead; the file name and the tool's error stay in the run log.

## 0.5.6

### Patch Changes

- 0122706: The html-frames part (1.1.0) puts the box it drew the brand's logo in on its timeline (`safe_zones`, use `logo`, in the video's pixels, as drawn on the last frame that shows it), so the final check looks for the logo where the frame page drew it. The box is the part of the logo that shows: a logo cropped by `object-fit: cover`, or cut by a parent that hides its overflow, counts only where it is seen. 1.0.0 stays published as it was.

  It also stages a PNG, JPEG or WebP picture over 2048 px on its long side through a resize to 2048 px before the page loads it: the browser dropped 4000 px product photos when a page held several and reported them as unreadable. A photo is first turned by its EXIF orientation, as the browser shows it, a PNG or WebP keeps its transparency, and the resize works from the bytes the kit checked, never from the file again.

## 0.5.5

### Patch Changes

- 51e662d: When a part refuses a video's plan, `gooseworks video make` now passes on the part's own sentence (such as which label is too long, or how long the video would run against the style's limits) followed by "Change the plan, then make it again.", both in the terminal and in the reason sent to the server, so the card and the AI know what to fix. Only plain words get through: a sentence with a file path, a file name, tool output, a field path or a part or step id stays in the run log, and the generic words are used when nothing plain is left. Failures that a new run can get past still show the generic words. A failed final check now shows the check's own words in the terminal as well as on the card.

## 0.5.4

### Patch Changes

- 0d5e6e1: `gooseworks video make` saves every AAC audio track at 48 kHz, the rate the parts are tested at, so a 96 kHz music bed or voice no longer comes through at 96 kHz. Audio that is already 48 kHz comes out byte for byte as before.
- 982d6b9: When a video fails the final check, `gooseworks video make` now reports the check's own words (for example "The video is too short.") from the check part's reasons, instead of a generic line. The words pass the same filter as other failure words, and the generic line is kept when the check gave none.

## 0.5.3

### Patch Changes

- 6a1b4f6: `gooseworks video make` tells the server why a video stopped: a failed step, a failed final check, a stop before the steps (such as a withdrawn part) or an unexpected error sends its step, a code and the same plain words the person sees, so the card can say what happened. A server that doesn't take the reason yet gets the report without it. When the server can't be reached before the kit exits, the report is kept in the video's folder and the next `video make` sends it first. A provider failure the next run can get past keeps the video in Making; a piece that failed twice ends it, and says so instead of saying to run again. A step that fails the same way on every run now asks for a changed plan instead of saying to run the same command again, and stop messages no longer name parts or steps; those go to the run log. A final check's own message reaches the card only as plain words, never tool output, file paths or part names. Style package refusals no longer name files either. A WebM or Matroska recording written as a stream, with no length in its header, is no longer refused: the kit reads its length from the stream or its last packet. A recording cut off partway still has no length.

## 0.5.2

### Patch Changes

- 6a32c0e: `gooseworks install` no longer tells the user to restart their agent: the final line asks the agent for the work, and an unreachable MCP server suggests checking the connection and running the install again.
- 3d638e6: The `gooseworks` entry skill now starts every first task with `brand_setup` status and follows only its `next_step`, saving each answer with `brand_setup` and carrying on the user's request once setup is done.
- 51cd9fc: `gooseworks tool` now prints an answer's card text under `Card:` and its next step as a last `Next:` line, so an agent that reads only text sees the card and what to do now. Control characters in that text are dropped. `--json` still prints the raw result. The examples call `brand_setup`.

## 0.5.1

### Patch Changes

- 2c26afe: The video entry skills match the server again: a yes typed in chat at the price shown approves paid work, an app without the plan card prints the plan and its price and asks for the yes in chat, and the research and plan steps are shorter.

## 0.5.0

### Minor Changes

- f5105e8: Add `gooseworks video check` and `gooseworks video make <id>`: the video kit checks and sets up this computer, then makes an approved video from its parts over the private line, saving after every piece so the same command resumes it. `gooseworks doctor` is hidden and points at `video check`.
- f40b845: Load video kit parts by exact version, checked against each video's parts lock, and let GOOSE_SKILLS_RAW_BASE point goose-skills downloads at another branch.
- 39d3052: The video redesign. A video is now made on the customer's own computer by the video kit: `gooseworks video check` gets the computer ready and `gooseworks video make <id>` makes an approved video. The kit builds each video from parts, loaded by exact version and checked against the video's lock, and renders the approved style in its own locked-down browser. The video entry skills are copied from the server as built: they ask which product the video is for, read the brand, and let the customer pick the style, then follow the next step in each answer from the video actions. Staging sign-in accepts the staging app MCP host, and the router skill explains code sign-in and `gooseworks tool` for cloud sandboxes.

### Patch Changes

- 2c530ac: The video entry skills ask which product the video is for and read the brand before any style, then let the customer pick the style.

## 0.4.5

### Patch Changes

- Fix Claude Code custom-video preflight, local caption toolchain checks, and connected-environment media relay guidance.
- c9a15ca: Device sign-in prints the link the server returns for its environment (for example the staging Growth app), falling back to the CLI's own frontend address only when that link is not a GooseWorks `/link` URL.

  Staging sign-in and staged skill links now use the staging Growth app, `ads-staging.gooseworks.ai`, instead of the retired `app.staging.gooseworks.ai`.

- e936f98: Add device sign-in for cloud agents and SSH: `gooseworks login --device` prints a link and a code to approve on any device, and `--no-wait` prints them and exits so the next command (for example `install --skills-only`) finishes the sign-in. Add `gooseworks tool` to call any GooseWorks MCP tool from a shell with the saved sign-in (`--list`, `--schema`), so agents without the connector can use GooseWorks. Add `login --paste` as a manual fallback, `install --skills-only` for cloud sandboxes, a 5-minute browser sign-in timeout, and always print the browser sign-in link.
- f364526: Staging sign-in accepts the staging customer MCP host (`app-mcp.staging.gooseworks.ai`), which staging returns with every CLI key; before, every staging sign-in failed at the last step with "Unrecognized mcp connection host". The error now names the host.
- e7c49b8: Add separate staging logins, skills, caches, and agent sessions, with merge-triggered npm prereleases and stable releases.
- baa4157: Video skills say one rule for who makes a video: an agent that can run shell commands on the customer's computer makes it there; otherwise the GooseWorks coworker does. No `client: { shell }` flag, and every format is offered.
