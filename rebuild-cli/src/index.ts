#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { Client, OAuthError, SdkHttpError, StreamableHTTPClientTransport, UnauthorizedError, type Tool } from "@modelcontextprotocol/client";
import { Command, CommanderError } from "commander";
import { CliError } from "./errors.js";
import { CredentialProvider, fetchWithTimeout, login } from "./oauth.js";
import { readServer } from "./server.js";
import { CredentialStore } from "./store.js";

const program = new Command()
  .name("gooseworks-next")
  .description("Private preview: call the rebuilt GooseWorks MCP server.")
  .version("0.0.1")
  .requiredOption("--server <url>", "Exact MCP URL; HTTPS or loopback HTTP")
  .option("--config-dir <path>", "Separate private credential directory")
  .showHelpAfterError()
  .exitOverride();

function writeJson(value: unknown) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

function getStore() {
  const options = program.opts<{ server: string; configDir?: string }>();
  return new CredentialStore(readServer(options.server).href, options.configDir);
}

async function withClient<Result>(store: CredentialStore, run: (client: Client, provider: CredentialProvider) => Promise<Result>) {
  const saved = await store.read();
  if (!saved) throw new CliError("You are not signed in to this server. Run login with the same --server URL.");
  const provider = new CredentialProvider(store, saved.redirectUrl, undefined, saved);
  const client = new Client({ name: "gooseworks-next", version: "0.0.1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(store.server), {
      authProvider: provider, fetch: fetchWithTimeout, redirectPolicy: "same-origin",
    }));
    return await run(client, provider);
  } finally {
    await client.close();
  }
}

program.command("login").description("Sign in through your browser; saves only this server's credentials")
  .action(async () => {
    const store = getStore();
    await store.withLock(async () => {
      const provider = await login(store);
      writeJson(provider.status());
    });
  });

program.command("logout").description("Remove this server's local credentials; does not revoke other sessions")
  .action(async () => {
    const store = getStore();
    await store.withLock(async () => {
      await store.remove();
      writeJson({ authenticated: false, server: store.server, localCredentialsRemoved: true });
    });
  });

program.command("whoami").description("Verify the connection and show safe sign-in metadata")
  .action(async () => {
    const store = getStore();
    await store.withLock(() => withClient(store, async (client, provider) => {
      writeJson({ ...provider.status(), serverInfo: client.getServerVersion() });
    }));
  });

const tools = program.command("tools").description("Inspect connector tools");
tools.command("list").description("List tools across every result page")
  .action(async () => {
    const store = getStore();
    await store.withLock(() => withClient(store, async (client) => {
      const tools: Tool[] = [];
      const cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor === undefined ? {} : { cursor });
        tools.push(...page.tools);
        cursor = page.nextCursor;
        if (cursor !== undefined) {
          if (cursors.has(cursor)) throw new CliError("The server repeated a tool-list cursor.");
          cursors.add(cursor);
        }
      } while (cursor !== undefined);
      writeJson({ tools });
    }));
  });

async function readArguments(options: { arguments?: string; input?: string }): Promise<Record<string, unknown>> {
  if (options.arguments !== undefined && options.input !== undefined) throw new CliError("Use either --arguments or --input.");
  let text = options.arguments ?? "{}";
  if (options.input !== undefined) {
    if (!(await stat(options.input)).isFile()) throw new CliError("--input must name a JSON file.");
    if ((await stat(options.input)).size > 1024 * 1024) throw new CliError("The input JSON must be at most 1 MiB.");
    text = await readFile(options.input, "utf8");
  }
  if (Buffer.byteLength(text) > 1024 * 1024) throw new CliError("The input JSON must be at most 1 MiB.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new CliError("Tool arguments must be valid JSON."); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new CliError("Tool arguments must be a JSON object.");
  return value as Record<string, unknown>;
}

program.command("tool").description("Call one connector tool").command("call")
  .argument("<name>", "Exact name from tools list")
  .option("--arguments <json>", "JSON object, default {}")
  .option("--input <file>", "Read the JSON object from a file")
  .description("Return the tool's raw result, including next steps and approval links")
  .action(async (name: string, options: { arguments?: string; input?: string }) => {
    const argumentsValue = await readArguments(options);
    const store = getStore();
    await store.withLock(() => withClient(store, async (client) => {
      const result = await client.callTool({ name, arguments: argumentsValue });
      writeJson(result);
      if (result.isError) process.exitCode = 1;
    }));
  });

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exitCode = 0;
  } else {
    const message = error instanceof CliError ? error.message
      : error instanceof CommanderError ? "Invalid command. Run gooseworks-next --help."
      : error instanceof UnauthorizedError || error instanceof OAuthError ? "Sign-in failed or expired. Run login with the same --server URL."
      : error instanceof SdkHttpError ? `The server request failed (HTTP ${error.status ?? "unknown"}). Check the server and your access.`
      : "The command failed. Check the server address, connection and private credential directory, then try again.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
