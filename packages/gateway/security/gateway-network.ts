// Gateway network entry points — the only approved fetch/https paths for Gateway code.

import { runWithGatewayNetwork } from '@semblance/core/security/egress-guard.js';

export async function gatewayFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return runWithGatewayNetwork(() => globalThis.fetch(input, init));
}

export async function gatewayHttpsGet(
  targetUrl: string,
  options: { timeoutMs?: number; maxRedirects?: number; family?: number } = {},
): Promise<import('node:http').IncomingMessage> {
  return runWithGatewayNetwork(async () => {
    const https = await import('node:https');
    const http = await import('node:http');
    const timeoutMs = options.timeoutMs ?? 60_000;
    const maxRedirects = options.maxRedirects ?? 5;
    const family = options.family ?? 4;

    function requestOnce(url: string, redirectsLeft: number): Promise<import('node:http').IncomingMessage> {
      return new Promise((resolve, reject) => {
        if (redirectsLeft <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const req = mod.get(url, { timeout: timeoutMs, family }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const redirectUrl = new URL(res.headers.location, url).href;
            requestOnce(redirectUrl, redirectsLeft - 1).then(resolve, reject);
            return;
          }
          resolve(res);
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy(new Error(`Request timed out (${timeoutMs}ms)`));
        });
      });
    }

    return requestOnce(targetUrl, maxRedirects);
  });
}
