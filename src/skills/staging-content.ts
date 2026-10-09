/** Adapt bundled/recipe instructions without renaming canonical skill folders. */
export function stagingContent(content: string): string {
  return content.replaceAll('https://api.gooseworks.ai', 'https://api.staging.gooseworks.ai')
    .replaceAll('https://make.gooseworks.ai', 'https://ads-staging.gooseworks.ai')
    .replaceAll('gooseworks@latest', 'gooseworks@next')
    .replaceAll('mcp__gooseworks__', 'mcp__gooseworks-staging__')
    + '\n\n## Staging session\nUse only the gooseworks-staging MCP connection and staging catalog. Every GooseWorks CLI command in this session is pinned to staging. Never retry against production.\n';
}
