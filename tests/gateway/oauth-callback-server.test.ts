// OAuthCallbackServer Tests — Localhost binding, state validation, callback handling.

import { describe, it, expect } from 'vitest';
import { OAuthCallbackServer } from '../../packages/gateway/services/oauth-callback-server.js';
import http from 'node:http';

/** Simple HTTP GET that doesn't hang on connection close */
function httpGet(url: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body }));
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

describe('OAuthCallbackServer', () => {
  it('binds to localhost only and returns callback URL', async () => {
    const server = new OAuthCallbackServer();
    const result = await server.start();

    try {
      expect(result.callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      expect(result.state).toHaveLength(64);
      expect(result.port).toBeGreaterThanOrEqual(8080);
      expect(result.port).toBeLessThanOrEqual(8099);
    } finally {
      server.stop();
    }
  });

  it('state parameter uses cryptographic randomness', async () => {
    const server = new OAuthCallbackServer();
    const result = await server.start();

    try {
      // 32 random bytes = 64 hex characters
      expect(result.state).toHaveLength(64);
      expect(result.state).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      server.stop();
    }
  });

  it('returns auth code on valid callback', async () => {
    const server = new OAuthCallbackServer();
    const result = await server.start();
    const callbackPromise = server.waitForCallback();

    // Send valid callback — fire and don't block
    httpGet(`${result.callbackUrl}?code=auth-code-123&state=${result.state}`)
      .catch(() => {}); // Server may close before response

    const authResult = await callbackPromise;
    expect(authResult.code).toBe('auth-code-123');
    expect(authResult.state).toBe(result.state);
  });

  it('rejects callback with mismatched state', async () => {
    const server = new OAuthCallbackServer();
    const result = await server.start();
    const callbackPromise = server.waitForCallback();

    // Send callback with wrong state
    httpGet(`${result.callbackUrl}?code=test-code&state=wrong-state`)
      .catch(() => {}); // Server may close connection

    await expect(callbackPromise).rejects.toThrow('state parameter mismatch');
  });
});
