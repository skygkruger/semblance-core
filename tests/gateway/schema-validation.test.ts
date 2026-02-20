// Schema Validation Tests — Proves Zod schemas catch all malformed input.

import { describe, it, expect } from 'vitest';
import { ActionRequest, ActionType } from '@semblance/core';

describe('Schema Validation', () => {
  const validRequest = {
    id: 'req_test_001',
    timestamp: '2026-01-15T10:30:00.000Z',
    action: 'email.send' as const,
    payload: {
      to: ['user@example.com'],
      subject: 'Test',
      body: 'Hello',
    },
    source: 'core' as const,
    signature: 'abc123def456',
  };

  it('valid ActionRequest passes validation', () => {
    const result = ActionRequest.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('missing id is rejected', () => {
    const { id: _, ...noId } = validRequest;
    const result = ActionRequest.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it('missing timestamp is rejected', () => {
    const { timestamp: _, ...noTs } = validRequest;
    const result = ActionRequest.safeParse(noTs);
    expect(result.success).toBe(false);
  });

  it('missing action is rejected', () => {
    const { action: _, ...noAction } = validRequest;
    const result = ActionRequest.safeParse(noAction);
    expect(result.success).toBe(false);
  });

  it('missing payload is rejected', () => {
    const { payload: _, ...noPayload } = validRequest;
    const result = ActionRequest.safeParse(noPayload);
    expect(result.success).toBe(false);
  });

  it('missing source is rejected', () => {
    const { source: _, ...noSource } = validRequest;
    const result = ActionRequest.safeParse(noSource);
    expect(result.success).toBe(false);
  });

  it('missing signature is rejected', () => {
    const { signature: _, ...noSig } = validRequest;
    const result = ActionRequest.safeParse(noSig);
    expect(result.success).toBe(false);
  });

  it('invalid ActionType is rejected', () => {
    const result = ActionRequest.safeParse({
      ...validRequest,
      action: 'delete.everything',
    });
    expect(result.success).toBe(false);
  });

  it('invalid timestamp format is rejected', () => {
    const result = ActionRequest.safeParse({
      ...validRequest,
      timestamp: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('source must be "core"', () => {
    const result = ActionRequest.safeParse({
      ...validRequest,
      source: 'gateway',
    });
    expect(result.success).toBe(false);
  });

  it('all defined ActionTypes are valid', () => {
    const types = [
      'email.fetch', 'email.send', 'email.draft',
      'calendar.fetch', 'calendar.create', 'calendar.update',
      'finance.fetch_transactions', 'health.fetch', 'service.api_call',
    ];
    for (const t of types) {
      const result = ActionType.safeParse(t);
      expect(result.success, `ActionType "${t}" should be valid`).toBe(true);
    }
  });

  it('null input is rejected', () => {
    const result = ActionRequest.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('empty object is rejected', () => {
    const result = ActionRequest.safeParse({});
    expect(result.success).toBe(false);
  });

  it('string input is rejected', () => {
    const result = ActionRequest.safeParse('not an object');
    expect(result.success).toBe(false);
  });
});
