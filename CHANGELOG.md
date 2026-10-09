# gooseworks

## 0.4.5

### Patch Changes

- Fix Claude Code custom-video preflight, local caption toolchain checks, and connected-environment media relay guidance.
- c9a15ca: Device sign-in prints the link the server returns for its environment (for example the staging Growth app), falling back to the CLI's own frontend address only when that link is not a GooseWorks `/link` URL.

  Staging sign-in and staged skill links now use the staging Growth app, `ads-staging.gooseworks.ai`, instead of the retired `app.staging.gooseworks.ai`.

- e936f98: Add device sign-in for cloud agents and SSH: `gooseworks login --device` prints a link and a code to approve on any device, and `--no-wait` prints them and exits so the next command (for example `install --skills-only`) finishes the sign-in. Add `gooseworks tool` to call any GooseWorks MCP tool from a shell with the saved sign-in (`--list`, `--schema`), so agents without the connector can use GooseWorks. Add `login --paste` as a manual fallback, `install --skills-only` for cloud sandboxes, a 5-minute browser sign-in timeout, and always print the browser sign-in link.
- f364526: Staging sign-in accepts the staging customer MCP host (`app-mcp.staging.gooseworks.ai`), which staging returns with every CLI key; before, every staging sign-in failed at the last step with "Unrecognized mcp connection host". The error now names the host.
- e7c49b8: Add separate staging logins, skills, caches, and agent sessions, with merge-triggered npm prereleases and stable releases.
- baa4157: Video skills say one rule for who makes a video: an agent that can run shell commands on the customer's computer makes it there; otherwise the GooseWorks coworker does. No `client: { shell }` flag, and every format is offered.
