---
"gooseworks": patch
---

Staging sign-in accepts the staging customer MCP host (`app-mcp.staging.gooseworks.ai`), which staging returns with every CLI key; before, every staging sign-in failed at the last step with "Unrecognized mcp connection host". The error now names the host.
