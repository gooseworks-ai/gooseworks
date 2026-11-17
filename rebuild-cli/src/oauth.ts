import {
  auth,
  type OAuthClientInformationContext,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from "@modelcontextprotocol/client";
import { openCallback } from "./callback.js";
import { CliError } from "./errors.js";
import { credentialsSchema, CredentialStore, type Credentials } from "./store.js";

export class CredentialProvider implements OAuthClientProvider {
  private client: StoredOAuthClientInformation | undefined;
  private savedTokens: StoredOAuthTokens | undefined;
  private verifier: string | undefined;
  private discovery: OAuthDiscoveryState | undefined;
  private savedAt: number | undefined;
  constructor(
    private readonly store: CredentialStore,
    readonly redirectUrl: string,
    private readonly interaction?: { state: string; redirect: (url: URL) => void },
    saved?: Credentials,
  ) {
    this.client = saved?.client;
    this.savedTokens = saved?.tokens;
    this.savedAt = saved?.savedAt;
  }
  get clientMetadata() {
    return {
      client_name: "GooseWorks rebuild CLI preview",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  state(): string {
    if (!this.interaction) throw new CliError("Sign-in expired. Run login with this --server URL.");
    return this.interaction.state;
  }
  clientInformation(context?: OAuthClientInformationContext) {
    this.checkIssuer(this.client?.issuer, context);
    return this.client;
  }
  saveClientInformation(client: StoredOAuthClientInformation, context?: OAuthClientInformationContext) {
    this.checkIssuer(client.issuer, context);
    this.client = client;
  }
  tokens(context?: OAuthClientInformationContext) {
    this.checkIssuer(this.savedTokens?.issuer, context);
    return this.savedTokens;
  }
  async saveTokens(tokens: StoredOAuthTokens, context?: OAuthClientInformationContext) {
    this.checkIssuer(tokens.issuer, context);
    if (!this.client) throw new CliError("The server did not register an OAuth client.");
    const savedAt = Date.now();
    const credentials = credentialsSchema.parse({
      version: 1, server: this.store.server, redirectUrl: this.redirectUrl,
      client: this.client, tokens, savedAt,
    });
    await this.store.save(credentials);
    this.savedTokens = tokens;
    this.savedAt = savedAt;
  }
  redirectToAuthorization(url: URL) {
    if (!this.interaction) throw new CliError("Sign-in expired. Run login with this --server URL.");
    this.interaction.redirect(url);
  }
  saveCodeVerifier(verifier: string) { this.verifier = verifier; }
  codeVerifier() {
    if (!this.verifier) throw new CliError("Sign-in state was lost. Run login again.");
    return this.verifier;
  }
  saveDiscoveryState(discovery: OAuthDiscoveryState) { this.discovery = discovery; }
  discoveryState() { return this.discovery; }
  async validateResourceURL(server: string | URL, resource?: string) {
    if (String(server) !== this.store.server || (resource !== undefined && resource !== this.store.server)) {
      throw new CliError("The server advertised a different MCP resource. Check --server and the server's OAuth settings.");
    }
    return new URL(this.store.server);
  }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "client") this.client = undefined;
    if (scope === "all" || scope === "tokens") this.savedTokens = undefined;
    if (scope === "all" || scope === "verifier") this.verifier = undefined;
    if (scope === "all" || scope === "discovery") this.discovery = undefined;
    if (scope === "all" || scope === "client" || scope === "tokens") await this.store.remove();
  }
  status() {
    if (!this.savedTokens || !this.savedAt) throw new CliError("Sign-in did not return credentials.");
    return {
      authenticated: true, server: this.store.server, issuer: this.savedTokens.issuer,
      scope: this.savedTokens.scope,
      expiresAt: this.savedTokens.expires_in === undefined ? null : new Date(this.savedAt + this.savedTokens.expires_in * 1000).toISOString(),
    };
  }
  private checkIssuer(issuer: string | undefined, context?: OAuthClientInformationContext) {
    if (context && issuer && issuer !== context.issuer) throw new CliError("The OAuth issuer changed. Run logout, verify the server URL, then login again.");
  }
}

export const fetchWithTimeout: typeof fetch = (input, init) => fetch(input, {
  ...init,
  signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
  redirect: "error",
});

export async function login(store: CredentialStore): Promise<CredentialProvider> {
  const callback = await openCallback();
  const provider = new CredentialProvider(store, callback.redirectUrl, {
    state: callback.state,
    redirect: (url) => { process.stderr.write(`Open this URL to sign in and choose access:\n${url.href}\n`); },
  });
  try {
    const started = await auth(provider, { serverUrl: store.server, forceReauthorization: true, fetchFn: fetchWithTimeout });
    if (started !== "REDIRECT") throw new CliError("The server did not start an interactive sign-in.");
    const answer = await callback.answer;
    const finished = await auth(provider, {
      serverUrl: store.server, authorizationCode: answer.code,
      ...(answer.issuer === undefined ? {} : { iss: answer.issuer }), fetchFn: fetchWithTimeout,
    });
    if (finished !== "AUTHORIZED") throw new CliError("Sign-in did not finish.");
    return provider;
  } finally {
    await callback.close();
  }
}
