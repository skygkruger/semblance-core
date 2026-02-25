/**
 * Step 29 — ProofOfPrivacyExporter tests (Commit 5).
 * Tests signing, JSON export, and verification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setPlatform } from '@semblance/core/platform/index';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { ProofOfPrivacyExporter } from '@semblance/core/privacy/proof-of-privacy-exporter';
import type { DeviceIdentity } from '@semblance/core/attestation/types';
import type { ProofOfPrivacyReport } from '@semblance/core/privacy/types';

const TEST_KEY = Buffer.from('proof-of-privacy-exporter-test-key!!!!');
const WRONG_KEY = Buffer.from('wrong-key-should-not-verify-at-all!!!');
const TEST_DEVICE: DeviceIdentity = { id: 'export-dev-01', platform: 'desktop' };

let exporter: ProofOfPrivacyExporter;

function makeReport(): ProofOfPrivacyReport {
  return {
    '@context': 'https://veridian.run/privacy/v1',
    '@type': 'ProofOfPrivacy',
    generatedAt: new Date().toISOString(),
    deviceId: TEST_DEVICE.id,
    dataInventory: {
      categories: [{ category: 'emails', count: 100 }],
      totalEntities: 100,
      collectedAt: new Date().toISOString(),
    },
    networkActivity: {
      services: [],
      totalRequests: 0,
      totalRejected: 0,
      totalRateLimited: 0,
      dataExfiltratedBytes: 0,
      unknownDestinations: 0,
      totalTimeSavedSeconds: 0,
      period: { start: '2026-01-01', end: '2026-02-01' },
    },
    privacyGuarantees: [],
    comparisonStatement: {
      segments: [],
      totalDataPoints: 100,
      summaryText: 'Test summary',
      generatedAt: new Date().toISOString(),
    },
  };
}

beforeEach(() => {
  setPlatform(createDesktopAdapter());
  const signer = new AttestationSigner({ signingKey: TEST_KEY, deviceIdentity: TEST_DEVICE });
  exporter = new ProofOfPrivacyExporter({ attestationSigner: signer });
});

describe('ProofOfPrivacyExporter (Step 29)', () => {
  it('signs report with attestation and produces JSON', () => {
    const report = makeReport();
    const result = exporter.export(report);

    expect(result.signedReport.report).toBe(report);
    expect(result.signedReport.attestation).toBeDefined();
    expect(result.signedReport.attestation.proof.type).toBe('HmacSha256Signature');
    expect(result.json).toBeTruthy();
    expect(typeof result.json).toBe('string');
  });

  it('produces valid JSON that parses correctly', () => {
    const report = makeReport();
    const result = exporter.export(report);

    const parsed = JSON.parse(result.json);
    expect(parsed.report['@context']).toBe('https://veridian.run/privacy/v1');
    expect(parsed.report['@type']).toBe('ProofOfPrivacy');
    expect(parsed.attestation.proof.proofValue).toBeTruthy();
  });

  it('verification succeeds with correct key, fails with wrong key', () => {
    const report = makeReport();
    const exported = exporter.export(report);

    // Correct key
    const validResult = exporter.verify(exported.json, TEST_KEY);
    expect(validResult.valid).toBe(true);
    expect(validResult.signerDevice).toBe(TEST_DEVICE.id);
    expect(validResult.timestamp).toBeTruthy();

    // Wrong key
    const invalidResult = exporter.verify(exported.json, WRONG_KEY);
    expect(invalidResult.valid).toBe(false);
  });
});
