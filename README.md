# @gooseworks/cli

Give your coding agent (Claude Code, Cursor) access to GooseWorks data tools — find emails, search people, enrich companies, scrape Twitter/Reddit/websites — with one install.

## Quick Start

```bash
npx @gooseworks/cli install --claude
```

This does three things:
1. Opens browser for Google sign-in → gets you an API token
2. Downloads skill files (SKILL.md + Python scripts) to `~/.agents/skills/`
3. Symlinks them into `~/.claude/skills/` so Claude Code can use them

Then open Claude Code and say "find me leads" to get started.

## Commands

### `install`

Full setup: login + download skills + configure your coding agent.

```bash
gooseworks install --claude          # Configure for Claude Code
gooseworks install --cursor          # Configure for Cursor
gooseworks install --all             # Configure all detected agents
gooseworks install --claude --api-base http://localhost:5999   # Use local backend
```

**What it does:**
- Runs `login` if you don't have credentials yet
- Fetches the skill catalog from GooseWorks API (falls back to GitHub)
- Writes skills to `~/.agents/skills/gooseworks-*/`
- Creates symlinks in `~/.claude/skills/` (Claude) or writes MCP config (Cursor)

### `login`

Authenticate with GooseWorks via Google OAuth.

```bash
gooseworks login
gooseworks login --api-base http://localhost:5999
```

**Flow:**
1. Starts a temporary HTTP server on a random local port
2. Opens your browser to the GooseWorks sign-in page
3. You sign in with Google (uses existing GooseWorks passport flow)
4. Browser redirects back to the local server with your `cal_*` API token
5. Token saved to `~/.gooseworks/credentials.json`

Timeout: 120 seconds. If the browser doesn't complete, re-run the command.

### `logout`

Clear saved credentials.

```bash
gooseworks logout
```

Deletes `~/.gooseworks/credentials.json`. Does not revoke the API token server-side — you can do that from the GooseWorks web UI under Settings > API Keys.

### `update`

Re-fetch the latest skills without re-authenticating.

```bash
gooseworks update
```

Removes old skill files, downloads the latest catalog, and reconfigures agent symlinks.

### `credits`

Check your credit balance.

```bash
gooseworks credits
```

Output:
```
Credits: 847 available (500 subscription + 347 purchased)
```

## File Layout

### Credentials

```
~/.gooseworks/
└── credentials.json      # API key, email, agent_id, api_base
```

Directory: `700` permissions. File: `600` permissions.

```json
{
  "api_key": "cal_xxxxxxxxxxxxx",
  "email": "user@example.com",
  "agent_id": "uuid",
  "api_base": "http://localhost:5999"
}
```

### Skills

```
~/.agents/skills/
├── gooseworks-master/SKILL.md           # Master skill with API reference
├── gooseworks-twitter-scraper/
│   ├── SKILL.md
│   └── scripts/
│       ├── search_twitter.py
│       └── lib/gooseworks.py
├── gooseworks-apollo-lead-finder/
│   ├── SKILL.md
│   └── scripts/
│       └── ...
└── ...
```

### Claude Code Symlinks

```
~/.claude/skills/
├── gooseworks-master → ~/.agents/skills/gooseworks-master
├── gooseworks-twitter-scraper → ~/.agents/skills/gooseworks-twitter-scraper
└── ...
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOSEWORKS_FRONTEND_URL` | `http://localhost:3999` | Frontend URL for OAuth browser flow |

The `--api-base` flag (or `api_base` in credentials.json) controls the backend API URL. Defaults to `http://localhost:5999`.

## Development

```bash
cd cli/

# Install dependencies
npm install

# Run locally without building
npm run dev -- install --claude

# Build
npm run build

# Run tests
npm test
```

## Auth Flow (Technical)

The CLI does NOT do its own Google OAuth code exchange. It piggybacks on the existing GooseWorks passport flow:

```
CLI starts localhost:19382
  → opens browser to {FRONTEND}/cli/auth?callback_port=19382&state=nonce
  → frontend page tries POST /api/cli/auth/token (fails: no session)
  → shows "Sign in with Google" button
  → button navigates to {BACKEND}/auth/google?returnTo=/cli/auth?callback_port=...
  → normal passport Google OAuth flow
  → Google redirects to {BACKEND}/auth/google/redirect (already registered)
  → passport creates session cookie
  → redirects back to {FRONTEND}/cli/auth?callback_port=19382&state=nonce
  → frontend page retries POST /api/cli/auth/token (succeeds: session exists)
  → backend creates cal_* token, returns it
  → frontend redirects to localhost:19382/callback?token=cal_xxx&email=...
  → CLI receives token, saves credentials, exits
```

No new Google OAuth redirect URIs needed.
