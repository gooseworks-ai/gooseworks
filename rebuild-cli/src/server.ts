import { CliError } from "./errors.js";

export function readServer(value: string): URL {
  let server: URL;
  try {
    server = new URL(value);
  } catch {
    throw new CliError("--server must be a complete MCP URL.");
  }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(server.hostname);
  if (server.protocol !== "https:" && !(server.protocol === "http:" && isLoopback)) {
    throw new CliError("--server must use HTTPS, or HTTP on localhost, 127.0.0.1 or [::1].");
  }
  if (server.username || server.password || server.search || server.hash) {
    throw new CliError("--server cannot contain credentials, a query or a fragment.");
  }
  return server;
}
