import * as http from 'http';
import * as net from 'net';
import * as crypto from 'crypto';
import open from 'open';
import { saveCredentials, type Credentials } from './credentials';
import * as logger from '../utils/logger';
import { FRONTEND_URL } from '../config';

const OAUTH_TIMEOUT_MS = 120_000;

interface OAuthResult {
  api_key: string;
  email: string;
  agent_id: string;
  scope_type?: 'agent' | 'user';
  default_agent_id?: string;
  mcp_server_url?: string;
}

export async function runOAuthFlow(apiBase: string): Promise<OAuthResult> {
  const state = crypto.randomBytes(16).toString('hex');
  const frontendBase = FRONTEND_URL;

  return new Promise<OAuthResult>((resolve, reject) => {
    // Track open sockets so we can force-destroy them on close
    const sockets = new Set<net.Socket>();

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1`);

      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token');
        const email = url.searchParams.get('email');
        const agentId = url.searchParams.get('agent_id');
        const scopeType = url.searchParams.get('scope_type') as 'agent' | 'user' | null;
        const defaultAgentId = url.searchParams.get('default_agent_id');
        const mcpServerUrl = url.searchParams.get('mcp_server_url');
        const returnedState = url.searchParams.get('state');

        if (returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Authentication failed: invalid state</h2><p>You can close this window.</p></body></html>');
          return;
        }

        if (!token || !email || !agentId) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h2>Authentication failed: missing parameters</h2><p>You can close this window.</p></body></html>');
          return;
        }

        const creds: Credentials = {
          api_key: token,
          email,
          agent_id: agentId,
          api_base: apiBase,
          ...(scopeType ? { scope_type: scopeType } : {}),
          ...(defaultAgentId ? { default_agent_id: defaultAgentId } : {}),
          ...(mcpServerUrl ? { mcp_server_url: mcpServerUrl } : {}),
        };
        saveCredentials(creds);

        clearTimeout(timeout);
        process.removeListener('SIGINT', cleanup);
        process.removeListener('SIGTERM', cleanup);

        // Plain 200 + HTML — no Connection: close, no synchronous socket
        // teardown. The previous code closed the server and destroyed
        // sockets in the same tick as `res.end()`, racing the response
        // flush; the browser ended up rendering ERR_CONNECTION_REFUSED
        // instead of the success page.
        //
        // Now we resolve the OAuth promise immediately so the CLI can
        // continue with the rest of `install`, and schedule a delayed
        // teardown that gives the browser a few seconds to render and
        // ignore favicon failures. The CLI process exits naturally once
        // its remaining steps complete (server.close + socket.destroy
        // make sure the listening port is released before that).
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h2>GooseWorks CLI authenticated!</h2><p>You can close this window and return to your terminal.</p></body></html>',
        );

        resolve({
          api_key: token,
          email,
          agent_id: agentId,
          ...(scopeType ? { scope_type: scopeType } : {}),
          ...(defaultAgentId ? { default_agent_id: defaultAgentId } : {}),
          ...(mcpServerUrl ? { mcp_server_url: mcpServerUrl } : {}),
        });

        setTimeout(() => {
          server.close();
          for (const socket of sockets) {
            socket.destroy();
          }
        }, 5000);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Track connections for forced shutdown
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to start OAuth server'));
        return;
      }

      const port = addr.port;
      // Pass api_base so the frontend can route Google OAuth back through the
      // correct backend (e.g. http://localhost:5999 for local dev vs. the
      // ngrok/prod URL baked into NEXT_PUBLIC_API_URL).
      const authUrl = `${frontendBase}/cli/auth?callback_port=${port}&state=${state}&api_base=${encodeURIComponent(apiBase)}`;

      logger.info('Opening browser for Google sign-in...');
      open(authUrl).catch(() => {
        logger.warn(`Could not open browser. Please visit:\n      ${authUrl}`);
      });
    });

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Authentication timed out after 120 seconds. Please try again.'));
    }, OAUTH_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      server.close();
      for (const socket of sockets) {
        socket.destroy();
      }
    };
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  });
}
