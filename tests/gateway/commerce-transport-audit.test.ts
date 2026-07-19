import { describe, expect, it, vi } from 'vitest';
import { CommerceTransport } from '../../packages/gateway/services/commerce-transport.js';

describe('CommerceTransport audit metadata', () => {
  it('records commerce operations without PAG or document identifiers', async () => {
    const entries: Array<Record<string, unknown>> = [];
    const transport = new CommerceTransport({
      auditTrail: {
        append(entry) {
          entries.push(entry as Record<string, unknown>);
        },
      } as never,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      })) as never,
    });

    await transport.submitWaitlist('user@example.com');
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const metadata = entry.metadata as Record<string, unknown>;
      expect(metadata).not.toHaveProperty('documentId');
      expect(metadata).not.toHaveProperty('pagId');
      expect(metadata).not.toHaveProperty('personalAgencyGraphId');
      expect(metadata.commerceOperation).toBe('commerce.waitlist');
    }
  });

  it('creates portal session audit entries with commerce metadata only', async () => {
    const entries: Array<Record<string, unknown>> = [];
    const transport = new CommerceTransport({
      auditTrail: {
        append(entry) {
          entries.push(entry as Record<string, unknown>);
        },
      } as never,
      fetchImpl: vi.fn(async () => ({
        ok: true,
        json: async () => ({ url: 'https://billing.stripe.com/p/session_123' }),
      })) as never,
    });

    await transport.createPortalSession('sem_test_key');
    expect(entries.some((entry) => {
      const metadata = entry.metadata as Record<string, unknown>;
      return metadata.commerceOperation === 'commerce.portal_session'
        && !('documentId' in metadata)
        && !('pagId' in metadata);
    })).toBe(true);
  });
});
