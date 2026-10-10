# gooseworks

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
