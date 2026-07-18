import { Gateway } from '@semblance/gateway';

export interface GatewayBootOptions {
  startTimeoutMs?: number;
}

export interface GatewayBootResult {
  status: 'ready' | 'degraded';
  gateway: Gateway | null;
  error?: string;
}

export async function bootGatewayRuntime(options: GatewayBootOptions = {}): Promise<GatewayBootResult> {
  const startTimeoutMs = options.startTimeoutMs ?? 10_000;

  try {
    const gateway = new Gateway();
    const startTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Gateway.start() timed out after ${startTimeoutMs}ms`)), startTimeoutMs);
    });
    await Promise.race([gateway.start(), startTimeout]);

    try {
      const allowlist = gateway.getAllowlist();
      for (const domain of ['www.googleapis.com', 'gmail.googleapis.com', 'oauth2.googleapis.com']) {
        allowlist.addService({ serviceName: 'Google APIs', domain, protocol: 'https', addedBy: 'system_seed' });
      }
    } catch {
      /* allowlist seeding is best-effort */
    }

    return { status: 'ready', gateway };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'degraded', gateway: null, error: message };
  }
}
