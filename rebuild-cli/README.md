# GooseWorks rebuild CLI preview

This private package calls the rebuilt GooseWorks MCP server. It is an isolated
preview on its own review branch. The existing `gooseworks` CLI, releases, skills
and agent settings are unchanged. Do not publish this package.

Requires Node.js 22 or newer on macOS or Linux. From this directory:

```sh
npm ci
npm run build
node dist/index.js --server http://localhost:3102/mcp login
node dist/index.js --server http://localhost:3102/mcp whoami
node dist/index.js --server http://localhost:3102/mcp tools list
node dist/index.js --server http://localhost:3102/mcp tool call get_started --input ./ask.json
node dist/index.js --server http://localhost:3102/mcp logout
```

For `ask.json`, use the current `get_started` input shape:

```json
{
  "ask": "Read my brand overview",
  "reference": null,
  "requestKey": "a-new-random-key-for-this-ask",
  "brandId": null,
  "productPick": null,
  "make": { "kind": "other" },
  "check": null
}
```

Use a new random `requestKey` for each new ask; reuse it only to retry that ask.
Follow the returned `nextStep`. Once it supplies a brand id, a brand overview can
be read with `brain_read`:

```sh
node dist/index.js --server http://localhost:3102/mcp tool call brain_read --arguments '{"brandId":"REPLACE_WITH_BRAND_UUID","path":"BRAND.md","versionId":null,"textPart":null}'
```

Replace the placeholder with an actual returned UUID. `tools list` is the source
of truth for current names and input schemas.

The package also defines the `gooseworks-next` command for a future installation.
No global installation is needed for this preview. Always pass the exact MCP URL
using `--server`. HTTPS is required except on localhost, 127.0.0.1 or [::1]. There
is no production default. The server's advertised resource must match this URL.

`login` prints a browser URL to stderr. Open it, sign in, choose access and return
to the terminal. The official MCP client SDK handles discovery, dynamic client
registration, PKCE, issuer validation and refresh tokens. Sign-in uses a random
loopback port, state validation and a three-minute deadline. Nothing automatically
opens a browser or approves a request. Tools use Streamable HTTP, including the
SDK's SSE response handling.

Credentials are stored separately in `~/.gooseworks-next`, one file per exact
server URL. The directory is private (0700), files are private (0600), and symlink
credential paths are refused. `--config-dir /absolute/private/path` selects a
different directory, useful for isolated checks. Commands for one server are
serialized with a lock file to protect rotating refresh tokens. After an unclean
shutdown, the CLI reports the lock path; remove it only after confirming no CLI
command is still running. This preview does not support Windows ACLs.

`whoami` verifies the MCP connection and reports issuer, granted scope, token
expiry when supplied and server information. It does not claim an account identity
from an unverified token. A server rejection triggers the SDK's OAuth refresh;
when interaction is needed, run `login` again. `logout` removes local credentials
for this server; revoke the connection in GooseWorks to end server-side access.

Successful command output is JSON on stdout. Progress and errors go to stderr.
`tools list` follows every page. `tool call` accepts one JSON object through
`--arguments` or `--input` (at most 1 MiB); without either, it sends `{}`. Tool
results are returned unchanged, including errors, `nextStep` and approval URLs.
Read and follow the returned next step. A tool error exits with status 1. This
client never follows approval links or automatically calls a second tool. Changes
to Meta and paid work still require the server's approval flow.

This package is a general terminal MCP client. It does not install skills or run
the separate GooseWorks local video kit. Use the rebuilt app's plugin and kit for
those workflows.
