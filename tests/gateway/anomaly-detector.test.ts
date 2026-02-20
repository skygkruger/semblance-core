// Anomaly Detection Tests — Proves burst, new domain, and large payload detection.

import { describe, it, expect, beforeEach } from 'vitest';
import { AnomalyDetector } from '@semblance/gateway/security/anomaly-detector.js';

describe('Anomaly Detector', () => {
  let detector: AnomalyDetector;

  beforeEach(() => {
    detector = new AnomalyDetector({
      burstThreshold: 5,      // Lower threshold for tests
      burstWindowMs: 5000,
      maxPayloadBytes: 1000,  // 1KB for tests
    });
  });

  it('normal request passes cleanly', () => {
    const result = detector.check({
      payload: { to: ['user@example.com'], subject: 'Hi' },
    });
    expect(result.flagged).toBe(false);
    expect(result.anomalies).toHaveLength(0);
  });

  it('burst of requests triggers anomaly', () => {
    // Send 6 requests rapidly (threshold is 5)
    for (let i = 0; i < 5; i++) {
      detector.check({ payload: { count: i } });
    }
    const result = detector.check({ payload: { count: 6 } });
    expect(result.flagged).toBe(true);
    expect(result.anomalies.some(a => a.type === 'burst')).toBe(true);
  });

  it('first request to new domain is flagged', () => {
    const result = detector.check({
      payload: { service: 'api.example.com' },
      targetDomain: 'api.example.com',
    });
    expect(result.flagged).toBe(true);
    expect(result.anomalies.some(a => a.type === 'new_domain')).toBe(true);
  });

  it('second request to same domain is not flagged as new', () => {
    detector.check({
      payload: {},
      targetDomain: 'api.example.com',
    });
    const result = detector.check({
      payload: {},
      targetDomain: 'api.example.com',
    });
    // Should not have a new_domain anomaly
    expect(result.anomalies.some(a => a.type === 'new_domain')).toBe(false);
  });

  it('pre-seeded domain is not flagged as new', () => {
    detector.markDomainSeen('api.example.com');
    const result = detector.check({
      payload: {},
      targetDomain: 'api.example.com',
    });
    expect(result.anomalies.some(a => a.type === 'new_domain')).toBe(false);
  });

  it('large payload is flagged', () => {
    const largePayload: Record<string, unknown> = {
      data: 'x'.repeat(2000), // > 1KB threshold
    };
    const result = detector.check({ payload: largePayload });
    expect(result.flagged).toBe(true);
    expect(result.anomalies.some(a => a.type === 'large_payload')).toBe(true);
  });

  it('small payload is not flagged', () => {
    const result = detector.check({
      payload: { message: 'small' },
    });
    expect(result.anomalies.some(a => a.type === 'large_payload')).toBe(false);
  });

  it('multiple anomalies can be detected simultaneously', () => {
    // First, trigger burst by sending many requests
    for (let i = 0; i < 5; i++) {
      detector.check({ payload: { count: i } });
    }
    // Now send a large payload to a new domain
    const result = detector.check({
      payload: { data: 'x'.repeat(2000) },
      targetDomain: 'new.evil.com',
    });
    expect(result.flagged).toBe(true);
    const types = result.anomalies.map(a => a.type);
    expect(types).toContain('burst');
    expect(types).toContain('new_domain');
    expect(types).toContain('large_payload');
  });

  it('reset clears all state', () => {
    detector.markDomainSeen('api.example.com');
    for (let i = 0; i < 6; i++) {
      detector.check({ payload: {} });
    }
    detector.reset();

    // After reset, domain should be flagged as new again
    const result = detector.check({
      payload: {},
      targetDomain: 'api.example.com',
    });
    expect(result.anomalies.some(a => a.type === 'new_domain')).toBe(true);
    // And burst counter should be reset
    expect(result.anomalies.some(a => a.type === 'burst')).toBe(false);
  });
});
