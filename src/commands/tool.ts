import * as fs from 'fs';
import { Command } from 'commander';
import { getCredentials } from '../auth/credentials';
import { connectMcp, LOGIN_HINT, McpError, type McpConnection, type McpTool, type McpToolResult } from '../lib/mcp-client';
import { getVersion } from '../version';
import * as logger from '../utils/logger';

/**
 * `gooseworks tool` (GOOSE-3937): call any GooseWorks MCP tool from a shell.
 *
 * Agents with the GooseWorks connector call these tools directly. A cloud
 * agent's sandbox (ChatGPT agent, Meta AI, Grok) has a shell but no connector,
 * because those apps load tools from their own settings, not from files the
 * CLI could write. This command is the bridge: it calls the same MCP server
 * with the saved sign-in, so every tool the skills name works there too.
 */

interface ToolOptions {
  list?: boolean;
  schema?: boolean;
  file?: string;
  json?: boolean;
  timeout?: string;
}

/** `mcp__gooseworks__account_whoami` → `account_whoami` (the name a coding agent shows). */
export function normalizeToolName(raw: string): string {
  const prefixed = /^mcp__[^_]+(?:_[^_]+)*?__(.+)$/.exec(raw.trim());
  return (prefixed ? prefixed[1] : raw).trim();
}

/** The call's arguments: inline JSON, `-` for stdin, or `--file`; `{}` when none. */
export function readToolArgs(inline: string | undefined, file: string | undefined, stdin: () => string = () => fs.readFileSync(0, 'utf-8')): Record<string, unknown> {
  if (inline !== undefined && file !== undefined) throw new Error('Pass the arguments inline or with --file, not both.');
  const raw = file !== undefined ? fs.readFileSync(file, 'utf-8') : inline === '-' ? stdin() : inline;
  if (raw === undefined || !raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Tool arguments must be a JSON object: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object, for example \'{"brand_id":"…"}\'.');
  }
  return parsed as Record<string, unknown>;
}

function firstSentence(text: string | undefined): string {
  if (!text) return '';
  const line = text.trim().split(/\r?\n/)[0];
  const match = /^(.{1,200}?[.!?])(\s|$)/.exec(line);
  return (match ? match[1] : line.slice(0, 200)).trim();
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Text for the terminal: no escape or other control characters besides newlines and tabs. */
function plainText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').trim();
}

/**
 * The answer's card text and next step. Every GooseWorks answer carries
 * `card` and `next_step`; the structured result (bare, or wrapped as
 * { result }) keeps the card's `text_summary`, which the model's JSON text
 * drops when a widget shows the card. An app on this bridge never draws one.
 */
function answerGuide(structured: unknown, texts: unknown[]): { card: string | null; next: string | null } {
  const candidates = [structured, isRecord(structured) ? structured.result : undefined, ...texts];
  const found = candidates.find((value): value is Record<string, unknown> => isRecord(value) && ('next_step' in value || 'card' in value));
  if (!found) return { card: null, next: null };
  const card = isRecord(found.card) && typeof found.card.text_summary === 'string' ? plainText(found.card.text_summary) : '';
  const next = isRecord(found.next_step) && typeof found.next_step.note === 'string' ? plainText(found.next_step.note).replace(/\s+/g, ' ') : '';
  return { card: card || null, next: next || null };
}

/**
 * What the agent reads. A JSON text block is the server's model view of the
 * result, so it is printed (pretty) and is enough. When the text is only a
 * sentence, the fields an agent acts on (`next_step`, ids, statuses) are in
 * `structuredContent.result`, so that is printed after it as "Data:".
 * Images and resources are described, never dumped. An answer's card text
 * follows under "Card:", and its next step is the last line ("Next: …"), so
 * an agent that reads only text sees the card and what to do now.
 */
export function formatToolResult(result: McpToolResult): string {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const parts: string[] = [];
  const texts: unknown[] = [];
  let sawJsonText = false;
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      try {
        const parsed: unknown = JSON.parse(block.text);
        texts.push(parsed);
        parts.push(JSON.stringify(parsed, null, 2));
        sawJsonText = true;
      } catch {
        parts.push(block.text);
      }
    } else if (block.type === 'image') {
      parts.push(`[image${block.mimeType ? ` ${block.mimeType}` : ''}]`);
    } else if (block.type === 'resource' || block.type === 'resource_link') {
      const uri = block.uri ?? block.resource?.uri;
      parts.push(`[resource${uri ? ` ${uri}` : ''}]`);
    } else {
      parts.push(`[${block.type}]`);
    }
  }
  const structured = result.structuredContent;
  if (!sawJsonText && structured !== undefined && structured !== null) {
    // The server wraps the data as { result }; print just the data then.
    const keys = typeof structured === 'object' && !Array.isArray(structured) ? Object.keys(structured) : [];
    const data = keys.length === 1 && keys[0] === 'result' ? (structured as { result: unknown }).result : structured;
    const json = JSON.stringify(data, null, 2);
    parts.push(parts.length ? `\nData:\n${json}` : json);
  }
  const guide = answerGuide(structured, texts);
  if (guide.card) parts.push(`\nCard:\n${guide.card}`);
  if (guide.next) parts.push(`\nNext: ${guide.next}`);
  return parts.join('\n');
}

function suggest(name: string, tools: McpTool[]): string {
  const close = tools
    .map((t) => t.name)
    .filter((n) => n.includes(name) || name.includes(n) || n.split('_')[0] === name.split('_')[0])
    .slice(0, 5);
  return close.length ? ` Did you mean: ${close.join(', ')}?` : ' Run `npx gooseworks tool --list` to see them.';
}

async function withConnection<T>(timeoutSeconds: string | undefined, work: (mcp: McpConnection) => Promise<T>): Promise<T> {
  const creds = getCredentials();
  if (!creds) throw new McpError('Not logged in. ' + LOGIN_HINT);
  const seconds = timeoutSeconds === undefined ? undefined : Number(timeoutSeconds);
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0)) throw new Error('--timeout must be a number of seconds.');
  const mcp = await connectMcp(creds, {
    clientName: 'gooseworks-cli-tool',
    version: getVersion(),
    ...(seconds ? { timeoutMs: seconds * 1000 } : {}),
  });
  try {
    return await work(mcp);
  } finally {
    await mcp.close();
  }
}

export function createToolCommand(): Command {
  return new Command('tool')
    .description('Call a GooseWorks tool (the same tools as the GooseWorks MCP connector) with your saved sign-in')
    .argument('[name]', 'Tool name, e.g. account_whoami or brand_setup')
    .argument('[args]', 'Arguments as a JSON object, or - to read them from stdin')
    .option('--list', 'List the tools, with the server\'s rules for using them')
    .option('--schema', 'Show the tool\'s description and input schema instead of calling it')
    .option('--file <path>', 'Read the arguments (a JSON object) from a file')
    .option('--json', 'Print the raw result (or list) as JSON')
    .option('--timeout <seconds>', 'Give up waiting after this many seconds (default 300)')
    .addHelpText('after', `
Examples:
  $ gooseworks tool --list
  $ gooseworks tool brand_setup --schema
  $ gooseworks tool account_whoami
  $ gooseworks tool brand_setup '{"action":"status"}'

Use this when GooseWorks tools are not connected to your agent (for example
a cloud sandbox). The server's rules still apply: paid work needs the user's
yes first.`)
    .action(async (rawName: string | undefined, rawArgs: string | undefined, opts: ToolOptions) => {
      try {
        if (opts.list) {
          await withConnection(opts.timeout, async (mcp) => {
            const tools = await mcp.listTools();
            if (opts.json) {
              console.log(JSON.stringify({ instructions: mcp.instructions, tools }, null, 2));
              return;
            }
            if (mcp.instructions) {
              console.log('Rules from GooseWorks for using these tools:\n');
              console.log(mcp.instructions);
              console.log('');
            }
            console.log(`${tools.length} tools. Call one with: npx gooseworks tool <name> '<json arguments>'\n`);
            for (const tool of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
              const summary = firstSentence(tool.description);
              console.log(summary ? `${tool.name} — ${summary}` : tool.name);
            }
          });
          return;
        }

        if (!rawName) {
          logger.error('Name a tool, or run `npx gooseworks tool --list`.');
          process.exit(1);
          return;
        }
        const name = normalizeToolName(rawName);

        if (opts.schema) {
          await withConnection(opts.timeout, async (mcp) => {
            const tool = (await mcp.listTools()).find((t) => t.name === name);
            if (!tool) throw new McpError(`There is no GooseWorks tool named ${name}.`);
            if (opts.json) {
              console.log(JSON.stringify(tool, null, 2));
              return;
            }
            console.log(`${tool.name}\n`);
            if (tool.description) console.log(`${tool.description.trim()}\n`);
            console.log('Input schema:');
            console.log(JSON.stringify(tool.inputSchema ?? {}, null, 2));
          });
          return;
        }

        const args = readToolArgs(rawArgs, opts.file);
        let failed = false;
        await withConnection(opts.timeout, async (mcp) => {
          let result: McpToolResult;
          try {
            result = await mcp.callTool(name, args);
          } catch (err) {
            // An unknown tool comes back as a JSON-RPC error; name the close ones.
            if (err instanceof McpError && /not found|unknown tool/i.test(err.message)) {
              const tools = await mcp.listTools().catch(() => [] as McpTool[]);
              throw new McpError(`There is no GooseWorks tool named ${name}.${suggest(name, tools)}`);
            }
            throw err;
          }
          console.log(opts.json ? JSON.stringify(result, null, 2) : formatToolResult(result));
          failed = result.isError === true;
        });
        if (failed) process.exit(1);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

export const toolCommand = createToolCommand();
