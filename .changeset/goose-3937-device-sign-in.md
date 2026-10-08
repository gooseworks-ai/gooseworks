---
"gooseworks": minor
---

Add device sign-in for cloud agents and SSH: `gooseworks login --device` prints a link and a code to approve on any device, and `--no-wait` prints them and exits so the next command (for example `install --skills-only`) finishes the sign-in. Add `gooseworks tool` to call any GooseWorks MCP tool from a shell with the saved sign-in (`--list`, `--schema`), so agents without the connector can use GooseWorks. Add `login --paste` as a manual fallback, `install --skills-only` for cloud sandboxes, a 5-minute browser sign-in timeout, and always print the browser sign-in link.
