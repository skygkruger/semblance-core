import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EgressDeniedError,
  installEgressGuard,
  isGatewayNetworkEntitled,
  runWithGatewayNetwork,
} from '../../packages/core/security/egress-guard.js';
import { CommerceTransport } from '../../packages/gateway/services/commerce-transport.js';

describe('egress guard adversarial enforcement', () => {
  beforeEach(() => {
    delete process.env.SEMBLANCE_NETWORK_ROLE;
    installEgressGuard();
  });

  afterEach(() => {
    delete process.env.SEMBLANCE_NETWORK_ROLE;
    vi.restoreAllMocks();
  });

  it('denies 100 fetch attempts from a Core-like context', async () => {
    expect(isGatewayNetworkEntitled()).toBe(false);

    let denied = 0;
    for (let i = 0; i < 100; i += 1) {
      try {
        await fetch(`https://example.com/deny-${i}`);
      } catch (error) {
        if (error instanceof EgressDeniedError) {
          denied += 1;
        }
      }
    }

    expect(denied).toBe(100);
  });

  it('allows one Gateway commerce path and records an audit entry', async () => {
    const auditEntries: Array<{ metadata?: Record<string, unknown>; status: string }> = [];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ url: 'https://billing.stripe.com/p/session_test' }),
    })) as unknown as typeof fetch;

    const transport = new CommerceTransport({
      auditTrail: {
        append: (entry) => {
          auditEntries.push({
            status: entry.status,
            metadata: entry.metadata,
          });
        },
      } as unknown as ConstructorParameters<typeof CommerceTransport>[0]['auditTrail'],
      fetchImpl,
    });

    const result = await runWithGatewayNetwork(() => transport.createPortalSession('sem_test_key'));

    expect(result.url).toBe('https://billing.stripe.com/p/session_test');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auditEntries.length).toBeGreaterThanOrEqual(2);
    expect(auditEntries.some((entry) => entry.metadata?.commerceOperation === 'commerce.portal_session')).toBe(true);
    expect(auditEntries.some((entry) => entry.status === 'success')).toBe(true);
  });
});
