import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { CliError } from "./errors.js";

export async function openCallback() {
  const state = randomBytes(32).toString("base64url");
  let resolveCallback!: (value: { code: string; issuer?: string }) => void;
  let rejectCallback!: (error: Error) => void;
  const answer = new Promise<{ code: string; issuer?: string }>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  void answer.catch(() => undefined);
  let expectedHost: string;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (request.method !== "GET" || request.headers.host !== expectedHost) {
      response.writeHead(400).end("Invalid callback.");
      return;
    }
    const callback = new URL(request.url ?? "/", `http://${expectedHost}`);
    if (callback.pathname !== "/oauth/callback") {
      response.writeHead(404).end("Not found.");
      return;
    }
    for (const name of ["state", "code", "error", "iss"]) {
      if (callback.searchParams.getAll(name).length > 1) {
        response.writeHead(400).end("Invalid callback.");
        return;
      }
    }
    const receivedState = Buffer.from(callback.searchParams.get("state") ?? "");
    const expectedState = Buffer.from(state);
    if (receivedState.length !== expectedState.length || !timingSafeEqual(receivedState, expectedState)) {
      response.writeHead(400).end("Invalid sign-in state.");
      return;
    }
    if (callback.searchParams.has("error")) {
      response.writeHead(400).end("Sign-in was not approved. You can close this tab.");
      rejectCallback(new CliError("Sign-in was not approved. Run login to try again."));
      return;
    }
    const code = callback.searchParams.get("code");
    if (!code) {
      response.writeHead(400).end("Missing authorization code.");
      return;
    }
    response.end("Sign-in received. Return to your terminal to check the result. You can close this tab.");
    const issuer = callback.searchParams.get("iss");
    resolveCallback(issuer === null ? { code } : { code, issuer });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new CliError("Could not open the sign-in callback.");
  expectedHost = `127.0.0.1:${address.port}`;
  const timeout = setTimeout(() => rejectCallback(new CliError("Sign-in timed out after three minutes. Run login to try again.")), 180_000);
  const interrupt = () => rejectCallback(new CliError("Sign-in cancelled."));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  return {
    state,
    redirectUrl: `http://${expectedHost}/oauth/callback`,
    answer,
    async close() {
      clearTimeout(timeout);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
