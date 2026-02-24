/**
 * Step 26 — WitnessFormat + VtiBridge tests (Commit 6).
 * Tests JSON-LD structure and VTI bridge stub.
 */

import { describe, it, expect } from 'vitest';
import { buildWitnessPayload, WITNESS_CONTEXT, WITNESS_TYPE } from '@semblance/core/witness/witness-format';
import { VtiBridge } from '@semblance/core/witness/vti-bridge';

describe('WitnessFormat (Step 26)', () => {
  it('payload has valid JSON-LD structure (@context, @type)', () => {
    const payload = buildWitnessPayload(
      'Sent email to team',
      'partner',
      { id: 'dev-01', platform: 'desktop' },
      'audit-001',
    );

    expect(payload['@context']).toBe(WITNESS_CONTEXT);
    expect(payload['@type']).toBe(WITNESS_TYPE);
    expect(payload.action).toBe('Sent email to team');
    expect(payload.autonomyTier).toBe('partner');
    expect(payload.auditEntryId).toBe('audit-001');
    expect(payload.createdAt).toBeTruthy();
  });

  it('VTI bridge returns null registryRef (stub)', () => {
    const bridge = new VtiBridge();

    expect(bridge.getRegistryRef()).toBeNull();
    expect(bridge.isRegistryAvailable()).toBe(false);

    const formatted = bridge.formatForVti({
      '@context': WITNESS_CONTEXT,
      '@type': WITNESS_TYPE,
      id: 'w1',
      action: 'test',
      autonomyTier: 'partner',
      device: { id: 'dev', platform: 'desktop' },
      createdAt: new Date().toISOString(),
      auditEntryId: 'a1',
      proof: {
        type: 'HmacSha256Signature',
        created: new Date().toISOString(),
        verificationMethod: 'device:dev',
        proofPurpose: 'assertionMethod',
        proofValue: 'abcdef',
      },
    });

    expect((formatted.vti as Record<string, unknown>).registryRef).toBeNull();
  });
});
