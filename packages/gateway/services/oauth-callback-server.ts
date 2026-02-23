// OAuth Callback Server — Localhost-only HTTP server for OAuth redirect handling.
// Starts a temporary server, returns the callback URL and state parameter.
// Validates state on /callback to prevent CSRF. Auto-shuts down after timeout.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';

export interface CallbackServerResult {
  callbackUrl: string;
  state: string;
  port: number;
}

export interface AuthCodeResult {
  code: string;
  state: string;
}

const PORT_RANGE_START = 8080;
const PORT_RANGE_END = 8099;
const AUTO_SHUTDOWN_MS = 120_000; // 2 minutes

export class OAuthCallbackServer {
  private server: Server | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private resolveAuth: ((result: AuthCodeResult) => void) | null = null;
  private rejectAuth: ((error: Error) => void) | null = null;
  private expectedState: string = '';

  /**
   * Start the callback server. Returns the callback URL and state parameter.
   * The server listens on localhost only (127.0.0.1) for security.
   */
  async start(): Promise<CallbackServerResult> {
    this.expectedState = randomBytes(32).toString('hex');

    const port = await this.findAvailablePort();

    return new Promise<CallbackServerResult>((resolve, reject) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleRequest(req, res);
      });

      this.server.listen(port, '127.0.0.1', () => {
        // Auto-shutdown timer
        this.shutdownTimer = setTimeout(() => {
          this.rejectAuth?.(new Error('OAuth callback timed out'));
          this.stop();
        }, AUTO_SHUTDOWN_MS);

        resolve({
          callbackUrl: `http://127.0.0.1:${port}/callback`,
          state: this.expectedState,
          port,
        });
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Wait for the OAuth callback to arrive. Returns the authorization code.
   */
  waitForCallback(): Promise<AuthCodeResult> {
    return new Promise<AuthCodeResult>((resolve, reject) => {
      this.resolveAuth = resolve;
      this.rejectAuth = reject;
    });
  }

  /** Stop the server and clean up. */
  stop(): void {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://127.0.0.1`);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Authorization Failed</h1><p>You can close this window.</p></body></html>');
        this.rejectAuth?.(new Error(`OAuth error: ${error}`));
        this.stop();
        return;
      }

      if (!state || state !== this.expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Invalid State</h1><p>Security validation failed.</p></body></html>');
        this.rejectAuth?.(new Error('OAuth state parameter mismatch'));
        this.stop();
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Missing Code</h1><p>No authorization code received.</p></body></html>');
        this.rejectAuth?.(new Error('No authorization code in callback'));
        this.stop();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Authorization Successful</h1><p>You can close this window and return to Semblance.</p></body></html>');

      this.resolveAuth?.({ code, state });
      this.stop();
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  private findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      let currentPort = PORT_RANGE_START;

      const tryPort = () => {
        if (currentPort > PORT_RANGE_END) {
          reject(new Error('No available port found in range 8080-8099'));
          return;
        }

        const testServer = createServer();
        testServer.listen(currentPort, '127.0.0.1', () => {
          const port = currentPort;
          testServer.close(() => resolve(port));
        });
        testServer.on('error', () => {
          currentPort++;
          tryPort();
        });
      };

      tryPort();
    });
  }
}
