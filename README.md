# GooseWorks

Give your coding agent (Claude Code, Cursor, Codex) access to 100+ data tools — scrape Twitter/Reddit/LinkedIn, find emails, enrich companies, research competitors — with one install.

## Install

Pick your agent:

```bash
# Claude Code
npx gooseworks install --claude
npx gooseworks install --claude --with goose-graphics

# Cursor
npx gooseworks install --cursor

# Codex
npx gooseworks install --codex

# All detected agents
npx gooseworks install --all
```

This does three things:
1. Opens browser for Google sign-in
2. Installs the GooseWorks skill into your coding agent
3. You're ready — ask your agent to "scrape reddit", "find leads", "research competitors"

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

Re-fetch the latest skill without re-authenticating.

```bash
npx gooseworks update
```

## How It Works

1. **Install** — authenticates you and installs a master skill file into your coding agent
2. **Ask your agent anything** — "scrape r/ClaudeAI", "find CTOs at AI startups", "research competitor pricing"
3. **Agent finds the right skill** — searches the GooseWorks catalog of 100+ skills
4. **Runs it** — downloads and executes the skill's Python scripts, which call GooseWorks APIs
5. **You get results** — structured data returned directly in your coding agent

Standalone skills installed with `--with` skip the catalog search step. After `npx gooseworks install --claude --with goose-graphics`, you can invoke `/goose-graphics ...` directly from Claude Code.

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

> Renamed from `ads-remix`. Older installs get the stale `ads-remix` skill cleaned up
> automatically on the next `install`.

```bash
gooseworks install --claude --mcp
```

Then in Claude Code: *"remix template `<id>` for `<your-site>`"*.

**The GooseWorks MCP server is REQUIRED for ads.** The skill is a thin wrapper over the
backend's single ad-generation workflow — the same one the GooseWorks ads app uses — reached
through the `gooseworks` MCP tools (`get_brand_kit`, `submit_remix_batch`, `get_remix_batch`,
`regenerate_creative`, …). The skill does NOT generate images, drive FAL, or manage renders
itself; the backend runs the pipeline and stores results. `install` registers the MCP server
with `--mcp` (or `--all`) and verifies it's reachable; if it isn't, you'll see a warning — the
ads flow will fail without MCP. Re-run `gooseworks install --claude --mcp` if needed.

Generation is billed to your GooseWorks credits **server-side**: `submit_remix_batch` reserves
the estimated cost up front and bills only the images that complete. There's no separate
ad-credit balance. Use `estimate_remix_batch` (cost preview) and `gooseworks credits` (balance).

### Keeping skills up to date

- **Entry skills** (`gooseworks`, `goose-ads`) are vendored in the CLI. They're (re)installed
  on `install`/`update`, and **refreshed on `login`** — but only when their content actually
  changed (a content-hash stamp skips unchanged ones, so re-running is cheap). Bump the CLI
  (`npx gooseworks@latest …`) to get new entry-skill content.
- **Recipe skills** (e.g. ad-analytics like `meta-ads-analyzer`) are **fetched live** from
  goose-skills each time they're used, so they're always current — nothing to update.

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

Need more? Visit [gooseworks.ai/settings](https://app.gooseworks.ai/settings?tab=billing) to add credits.

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
