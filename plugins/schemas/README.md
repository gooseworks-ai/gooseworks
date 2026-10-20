# Offline plugin format schemas

These two unmodified upstream JSON schemas validate the portable plugin identity and MCP connection without network access. They are build and test inputs; they are not shipped in the plugin.

Downloaded on 20 October 2026 from the canonical versioned identifiers:

- [Agent Plugins manifest 1.0.0](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
- [Agent Plugins MCP configuration 1.0.0](https://agent-plugins.org/schemas/1.0.0/mcp.schema.json)

The [specification](https://agent-plugins.org/specification) also defines path containment and transport semantics. The package builder enforces a narrower policy: one production HTTPS endpoint, no secrets, a fixed file allowlist and no symlinks.

Skill frontmatter checks follow the [Agent Skills format](https://agentskills.io/specification) and its [reference validator](https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py). Workflow instructions are checked separately against the existing CLI source.
