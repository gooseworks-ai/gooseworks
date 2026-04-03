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

        // Send response with Connection: close so browser doesn't keep-alive
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Connection': 'close',
        });
        res.end('<html><body><h2>GooseWorks CLI authenticated!</h2><p>You can close this window and return to your terminal.</p></body></html>');

        const creds: Credentials = {
          api_key: token,
          email,
          agent_id: agentId,
          api_base: apiBase,
        };
        saveCredentials(creds);

        clearTimeout(timeout);
        process.removeListener('SIGINT', cleanup);
        process.removeListener('SIGTERM', cleanup);

        // Force-close all open sockets so the server actually shuts down
        server.close(() => {
          resolve({ api_key: token, email, agent_id: agentId });
        });
        for (const socket of sockets) {
          socket.destroy();
        }
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
      const authUrl = `${frontendBase}/cli/auth?callback_port=${port}&state=${state}`;

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
