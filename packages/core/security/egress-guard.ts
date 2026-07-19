// Deny-by-default network egress guard for non-Gateway runtimes.
// Gateway-owned code runs inside runWithGatewayNetwork() or with
// SEMBLANCE_NETWORK_ROLE=gateway set for the whole process (runtime-gateway).

export const GATEWAY_NETWORK_ROLE = 'gateway';

export class EgressDeniedError extends Error {
  readonly code = 'EGRESS_DENIED';

  constructor(detail: string) {
    super(`Network egress denied: ${detail}`);
    this.name = 'EgressDeniedError';
  }
}

let installed = false;
let gatewayDepth = 0;
let originalFetch: typeof fetch | undefined;

export function isGatewayNetworkEntitled(): boolean {
  return process.env.SEMBLANCE_NETWORK_ROLE === GATEWAY_NETWORK_ROLE;
}

export function assertNetworkEntitled(operation = 'network'): void {
  if (!isGatewayNetworkEntitled()) {
    throw new EgressDeniedError(`${operation} blocked outside Gateway (SEMBLANCE_NETWORK_ROLE!=gateway)`);
  }
}

export function enablePermanentGatewayNetworkRole(): void {
  process.env.SEMBLANCE_NETWORK_ROLE = GATEWAY_NETWORK_ROLE;
}

export function runWithGatewayNetwork<T>(fn: () => T | Promise<T>): T | Promise<T> {
  gatewayDepth += 1;
  process.env.SEMBLANCE_NETWORK_ROLE = GATEWAY_NETWORK_ROLE;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        gatewayDepth -= 1;
        if (gatewayDepth <= 0) {
          gatewayDepth = 0;
          delete process.env.SEMBLANCE_NETWORK_ROLE;
        }
      });
    }
    gatewayDepth -= 1;
    if (gatewayDepth <= 0) {
      gatewayDepth = 0;
      delete process.env.SEMBLANCE_NETWORK_ROLE;
    }
    return result;
  } catch (error) {
    gatewayDepth -= 1;
    if (gatewayDepth <= 0) {
      gatewayDepth = 0;
      delete process.env.SEMBLANCE_NETWORK_ROLE;
    }
    throw error;
  }
}

export function installEgressGuard(): void {
  if (installed) return;
  installed = true;

  if (typeof globalThis.fetch === 'function') {
    originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      assertNetworkEntitled('fetch');
      return originalFetch!(input, init);
    }) as typeof fetch;
  }
}

export function getOriginalFetch(): typeof fetch {
  if (!originalFetch) {
    throw new Error('Egress guard not installed — call installEgressGuard() first');
  }
  return originalFetch;
}
