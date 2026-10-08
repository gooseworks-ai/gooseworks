# GooseWorks

Put your AI agent on the growth team. GooseWorks gives Claude Code, Cursor, and Codex specialist skills for research, lead generation, social data, ads, product photography, graphics, and growth work—with one install.

## Install

**Paste this into your agent** (Claude Code, Cursor, Codex, or a chat app like Claude or ChatGPT):

```text
Install gooseworks: https://gooseworks.ai/install.md
```

Your agent reads that page and follows it. The page is short and you can read it too. It makes the agent:

1. **Ask you first.** It says exactly what it will install and waits for your OK. The install touches your agent's skills folder, its MCP config and `~/.gooseworks/credentials.json`, nothing else, and only ever runs `npx gooseworks@latest …`.
2. **Install** the GooseWorks skills and register the `gooseworks` MCP server with the right flag for your agent (`--claude`, `--cursor`, `--codex`), always with `--mcp`.
3. **Sign you in** with Google in your browser (the URL is always printed too).
4. **Check the install** with `npx gooseworks@latest doctor` and tell you to restart the agent so the MCP tools load.
5. **Set up your company** after the restart: it asks for your website and saves what it learns as a reusable **Company Brain** that improves every later research, creative, and growth task.

Want a specific skill too? Say so: `Install gooseworks: https://gooseworks.ai/install.md, including the goose-graphics skill.`

If your agent cannot run terminal commands (claude.ai, ChatGPT), the page tells it to give you the MCP connector address (`https://mcp.gooseworks.ai/mcp`) instead.

### Run it yourself

Prefer the terminal? Pick your agent (keep `--mcp`; `--all` includes it):

```bash
# Claude Code
npx gooseworks@latest install --claude --mcp
npx gooseworks@latest install --claude --mcp --with goose-graphics

# Cursor
npx gooseworks@latest install --cursor --mcp

# Codex
npx gooseworks@latest install --codex --mcp

# All detected agents
npx gooseworks@latest install --all
```

Restart your coding agent afterwards (MCP servers are only read at startup), then ask it to "scrape reddit", "find leads", "research competitors", or "create product photos".

You do not need a special onboarding command. Ask GooseWorks to do a normal task, or say:

```text
Set up GooseWorks for https://yourcompany.com
```

The agent preserves that request while it completes any missing company setup. Setup uses the same flow as the GooseWorks web app — company, coworker, creative taste, first campaign, growth stage, research review, and channels — saving after every step. The resulting **Company Brain** is shared across web, Claude, Codex, ChatGPT, and Cowork; when setup is complete, the agent immediately continues the request you originally made.

Use `--with <skill-slug>` to install standalone GooseWorks skills alongside the main GooseWorks skill. For example, `--with goose-graphics` installs `/goose-graphics` locally so your agent can run it directly without doing a catalog lookup through `/gooseworks`.

### Other install methods

```bash
# Via Vercel skills.sh
npx skills add gooseworks-ai/gooseworks

# Via Claude Code plugins
/plugin install gooseworks

# Via OpenClaw ClawHub
clawhub skill install gooseworks

# Via Codex (OpenAI) — available once merged into openai/skills
codex skills install gooseworks
```

## Commands

### `install`

Full setup: login + install skill + configure your coding agent.

```bash
npx gooseworks install --claude    # Configure for Claude Code
npx gooseworks install --cursor    # Configure for Cursor
npx gooseworks install --codex     # Configure for Codex
npx gooseworks install --all       # Configure all detected agents
npx gooseworks install --claude --with goose-graphics
npx gooseworks install --claude --with goose-graphics --with aeo
npx gooseworks install --all --ref <campaign-or-referral-code>
```

**What it does:**
- Runs `login` if you don't have credentials yet
- Writes the GooseWorks skill to `~/.agents/skills/gooseworks/SKILL.md`
- Downloads any `--with` standalone skills from `gooseworks-ai/goose-skills` into `~/.agents/skills/<slug>/`
- Creates symlinks in `~/.claude/skills/` (Claude) or `~/.codex/skills/` (Codex), or writes MCP config (Cursor)

`--with` is repeatable. Unknown slugs are reported clearly and do not block the main GooseWorks skill install.

### `login`

Authenticate with GooseWorks via Google OAuth.

```bash
npx gooseworks login
```

**Flow:**
1. Starts a temporary HTTP server on a random local port
2. Opens your browser to the GooseWorks sign-in page
3. You sign in with Google
4. Token saved to `~/.gooseworks/credentials.json`

Timeout: 120 seconds. If the browser doesn't complete, re-run the command.

### `logout`

Clear saved credentials.

```bash
npx gooseworks logout
```

Deletes `~/.gooseworks/credentials.json`.

### `whoami`

Show which account you're currently signed in as. Handy when you have multiple
GooseWorks accounts and need to confirm the active one before running a command.
Reads local credentials only — no network call.

```bash
npx gooseworks whoami
npx gooseworks whoami --json    # machine-readable output
```

Output:
```
Signed in as you@example.com
Scope:      user
Agent:      2e32bd49-…
API base:   https://api.gooseworks.ai
```

To switch accounts, run `gooseworks logout` then `gooseworks login`.

> The GooseWorks MCP server exposes the same identity check as the `whoami` tool
> (email + the exact agent/org the token is pinned to), separate from
> `list_accessible_scopes`, which lists *every* workspace you can reach.

### `search`

Search the GooseWorks skill catalog.

```bash
npx gooseworks search "reddit scraping"
npx gooseworks search "find emails"
npx gooseworks search "competitor research"
```

### `credits`

Check your credit balance.

```bash
npx gooseworks credits
```

Output:
```
Credits: 847 available (500 subscription + 347 purchased)
```

### `update`

Refresh the entry instructions bundled in your installed CLI without re-authenticating.
The command checks the published release first and refuses to reinstall a known older CLI
bundle. Edited or untracked entry files and standalone recipe packages are preserved.

```bash
npx gooseworks skills status
npx gooseworks update
```

Use `gooseworks skills status --json` for release, bundle and actual-file hashes. Upgrade an
outdated CLI with `npm install -g gooseworks@latest` before updating its entries. Review and
back up local edits before explicitly using `gooseworks update --overwrite-modified`.
An unavailable release check means freshness is unknown, not current.

## How It Works

1. **Install** — authenticates you and installs a master skill file into your coding agent
2. **Ask your agent anything** — "scrape r/ClaudeAI", "find CTOs at AI startups", "research competitor pricing"
3. **Agent finds the right skill** — searches the GooseWorks catalog of 100+ skills
4. **Runs it** — downloads and executes the skill's Python scripts, which call GooseWorks APIs
5. **You get results** — structured data returned directly in your coding agent

Standalone skills installed with `--with` skip the catalog search step. After `npx gooseworks install --claude --with goose-graphics`, you can invoke `/goose-graphics ...` directly from Claude Code.

## What growth teams can ask

Use `/gooseworks` naturally. It can bring in specialist capabilities without requiring you to know the internal skill name:

```text
/gooseworks Analyze the ads my three competitors are currently running.
/gooseworks Mine these TikTok and Instagram comments for objections and buying intent.
/gooseworks Find skincare creators whose audiences match women aged 25–40 in the US.
/gooseworks Diagnose our Meta performance and recommend the next creative test.
/gooseworks Research demand for this new product idea.
```

For focused creative work you can also use:

- `/goose-ads` for static ads, ad research, and ad performance.
- `/goose-product-photos` for studio, lifestyle, marketplace, social, and on-model product photography.
- `/goose-video` to make a video ad, or an original video from a brief, in the chat. Once you approve it on the plan card, `gooseworks video make <id>` makes it on this machine when the chat says so.
- `goose-graphics` for social graphics, carousels, slides, and branded visual content.
- `animate-image` to turn an approved still into a short motion creative.

Consumer and ecommerce brands are one important use case. The same `/gooseworks` coworker remains useful for B2B teams, agencies, sales, research, lead generation, and other GTM work.

## Direct provider calls

### `call`

Call managed data providers without buying a separate provider key. ScrapeCreators uses its first-party GooseWorks proxy and defaults to GET:

```bash
npx gooseworks call scrapecreators /v2/instagram/post/comments \
  --query='{"url":"https://www.instagram.com/p/POST_ID/"}'
```

For the few official ScrapeCreators POST operations, pass the method and JSON body explicitly:

```bash
npx gooseworks call scrapecreators /v1/facebook/adLibrary/search/ads \
  --method POST \
  --body='{"query":"running shoes","country":"US"}'
```

## Security & data handling

We'd rather you know exactly what this CLI does before you run it:

- **Skill scripts are open source and fetched at runtime.** `gooseworks fetch <slug>` (and the skills that call it) download skill content and Python scripts from the GooseWorks catalog on demand, save them under `/tmp/gooseworks-scripts/`, and run them on your machine. Every skill and its scripts live in the public, open-source [goose-skills repo](https://github.com/gooseworks-ai/goose-skills/tree/main/skills) — the catalog is synced from there — so the code is the same maintained, auditable source you can read on GitHub. They are served from the connected catalog rather than the installed CLI version. Saved copies retain the version/hash returned when fetched; compare them again for new work.
- **The MCP server is opt-in.** It's only registered when you pass `--mcp` (or `--all`). When you do, the CLI adds a `gooseworks` entry to `~/.claude.json` (Claude Code) or `~/.codex/config.toml` (Codex) that includes your bearer token in an `Authorization` header — this is how every HTTP MCP server authenticates. Skip `--mcp` if you don't want the server registered as a live tool provider; shared onboarding and ads creation require it.
- **Credentials are stored locally.** Your API key lives in `~/.gooseworks/credentials.json`, written with `0600` permissions in a `0700` directory. `gooseworks logout` deletes it.
- **`gooseworks env` exposes your key.** `eval $(gooseworks env)` exports `GOOSEWORKS_API_KEY` into your shell environment, where any process you run can read it. Most commands (e.g. `gooseworks call`) load credentials on their own — only use `env` when a script genuinely needs the environment variable.
- **No install hooks.** `npm install` only downloads files; nothing executes on install. The CLI has four dependencies (chalk, commander, open, ora), uses standard OAuth with CSRF protection, and makes all network calls over HTTPS.

Source for the CLI and skills lives at [github.com/gooseworks-ai/gooseworks](https://github.com/gooseworks-ai/gooseworks).

## What's Included

100+ skills across these categories:

| Category | Examples |
|----------|---------|
| Lead Generation | Apollo prospecting, company contact finder, signal scanning |
| Outreach | Cold email, LinkedIn outreach, email drafting |
| Scraping | Twitter/X, Reddit, LinkedIn, Product Hunt, Hacker News |
| Research | Competitor intel, ICP identification, meeting briefs |
| SEO | Content audit, domain analysis, programmatic SEO |
| Ads | Google/Meta ad scraping, campaign analysis |
| Enrichment | Contact enrichment, company research, tech stack |
| Monitoring | Newsletter scanning, review site tracking |

## Ads (`goose-ads`)

Alongside the GTM `gooseworks` skill, the CLI installs a **separate** `goose-ads` entry
skill for ads — **create** ad creative (remix a static ad template into a branded ad, or
read a brand for ads) and **analyze** ad performance (Meta/Google campaign diagnostics,
creative fatigue, CAC & lead quality, competitor ad intelligence, ad angles & hooks). The
`gooseworks` parent router also hands ad requests to it. Claude auto-loads whichever skill
matches the task; the two are domain-scoped and never merged.

> Renamed from `ads-remix`. Install and update preserve legacy directories. If an
> older `ads-remix` entry remains, review and back it up before removing it yourself.

```bash
gooseworks install --claude --mcp
```

Then in Claude Code: *"remix template `<id>` for `<your-site>`"*.

**The GooseWorks MCP server is REQUIRED for ads.** The skill is a thin wrapper over the
backend's single ad-generation workflow — the same one the GooseWorks ads app uses — reached
through the GooseWorks actions (`brand_read`, `ads_generate`, `ads_read`, `ads_edit`, …). The
skill does not generate images or manage renders itself; the backend runs the pipeline and
stores results. `install` registers the MCP server with `--mcp` (or `--all`) and verifies it's
reachable; if it isn't, you'll see a warning.

Generation is billed to your GooseWorks credits **server-side**: `ads_generate` gives the credit
total before anything is made, reserves it when you say yes, and bills only the images that
complete. `gooseworks credits` shows your balance.

### Videos

The `goose-video` and `make-custom-video` entry skills are built by the GooseWorks server and
copied here unchanged. They start with `video_formats` and follow the `next_step` in every answer,
which gives the step for the video's stage. Only your click on the plan card approves a video.
When the chat says so, `gooseworks video make <id>` makes the approved video on this machine
from versioned parts, each checked against the video's parts list before anything runs.

### Keeping skills up to date

- **Entry skills** are bundled in the CLI. `skills status` compares their actual installed bytes,
  bundled bytes and the integrity-verified published npm package. Install/update/login warn
  about an outdated CLI, different instructions, modified files or an unavailable release check.
  They preserve edited or untracked files by default. A development build ahead of the release
  is reported as unreleased; it is not silently downgraded.
- **Saved recipe packages** use the connected catalog's `version` / `contentHash` and dependency
  hashes. `gooseworks fetch <slug> --saved-package <json-file>` compares a saved fetch response
  and returns the current package without replacing the file. Canonical MCP `catalog_fetch`
  supports optional saved hashes when advertised; other hosts compare the returned hashes
  themselves. The server cannot inspect a client's files, and reported hashes do not certify
  later manual edits. Missing hashes mean unknown.
- **Hosted snapshots** use the existing Skills Update action. Approved runs keep their recorded
  package. Fetch into a new directory for new work; do not replace a running project's harness.
  Updating skill content does not refresh a host's cached MCP tool schemas.

## File Layout

### Credentials

```
~/.gooseworks/
└── credentials.json      # API key, email, agent_id, api_base
```

### Skills

```
~/.agents/skills/
├── gooseworks/
│   ├── SKILL.md          # GTM skill — teaches your agent to use 100+ data tools
│   └── .gooseworks-version  # content-hash stamp (freshness check; skip rewrite if unchanged)
├── goose-ads/
│   ├── SKILL.md          # Ads entry skill (create + analyze; creation requires MCP)
│   └── .gooseworks-version
└── goose-graphics/
    └── SKILL.md          # Optional standalone skill installed with --with
```

### Claude Code Symlinks

```
~/.claude/skills/
├── gooseworks → ~/.agents/skills/gooseworks
├── goose-ads → ~/.agents/skills/goose-ads
└── goose-graphics → ~/.agents/skills/goose-graphics
```

### Codex Symlinks

```
~/.codex/skills/
├── gooseworks → ~/.agents/skills/gooseworks
└── goose-graphics → ~/.agents/skills/goose-graphics
```

## Pricing

New users get **200 free credits**. Each skill run costs 1-10 credits depending on the data source. Check your balance with `npx gooseworks credits`.

Need more? Visit [gooseworks.ai/settings](https://make.gooseworks.ai/settings) to add credits.

## Requirements

- Node.js 18+
- Python 3 (for running skill scripts)
- Claude Code, Cursor, or Codex

## Links

- [GooseWorks](https://gooseworks.ai)
- [Skills Catalog](https://skills.gooseworks.ai)
- [Documentation](https://docs.gooseworks.ai)
- [Discord](https://discord.gg/gooseworks)

## License

MIT
