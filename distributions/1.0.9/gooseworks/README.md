# GooseWorks plugin — review candidate

This package contains the current GooseWorks entry skills and its hosted MCP connection. It is prepared for review; provider installation and manual end-to-end testing are still required before submission.

## What is included

- Research and data work through `gooseworks`.
- Image ads through `goose-ads`.
- Product photos through `goose-product-photos`.
- Video planning and the existing execution handoff through `goose-video` and `make-custom-video`.

Skills come from the same source as the CLI. Their workflow bodies are unchanged; custom frontmatter fields are moved into standard string metadata for portable skill loaders. More detailed recipes are fetched from GooseWorks when needed. The installed entries follow the server's current instructions and stay on the same connection.

## Connect and use

Install with a client that supports the Agent Plugins 1.0.0 format, remote Streamable HTTP MCP and interactive sign-in. The host manages authorization; sign in to GooseWorks when prompted. A client that only supports native plugin formats needs a separately tested adapter.

Ask for a brand research task, image ads or product photos. Existing onboarding sets up or selects your brand. Paid work requires your approval of the displayed credit total; an existing GooseWorks credit balance is required. Read returned results and any reported failure before treating a job as complete.

## Video execution

Video follows the existing workflow and each answer's `next_step`. When it supplies a make command, its last line says who starts it. An agent with a terminal may run that exact command after the required approval. In a hosted chat without a terminal, the customer runs the supplied command locally. A command or approved plan alone is not a finished video.

Sandbox execution is not included in this package. Its availability and credit cost have not been established. Provider-specific manual tests must cover the full local handoff and the actual final output before claiming that workflow works there.

## Review status

Passing package checks proves that the files and archive match the canonical sources. It does not prove installation, sign-in, brand onboarding, paid approvals, image delivery or video completion in a provider's app. Those require manual testing with the actual candidate.

Support: https://docs.gooseworks.ai/help-center/troubleshooting

Privacy: https://gooseworks.ai/privacy · Terms: https://gooseworks.ai/terms
