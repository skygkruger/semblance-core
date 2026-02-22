// Phone Utils Tests — maskPhoneNumber, validatePhoneNumber edge cases.

import { describe, it, expect } from 'vitest';
import { maskPhoneNumber, validatePhoneNumber, normalizePhoneNumber } from '../../../packages/core/agent/messaging/phone-utils';

describe('maskPhoneNumber', () => {
  it('masks all but last 4 digits with country code', () => {
    expect(maskPhoneNumber('+15551234567')).toBe('+*******4567');
  });

  it('masks formatted phone number', () => {
    const masked = maskPhoneNumber('(555) 123-4567');
    expect(masked).toContain('4567');
    expect(masked).not.toContain('1234');
  });

  it('handles short numbers gracefully', () => {
    expect(maskPhoneNumber('12')).toBe('***');
    expect(maskPhoneNumber('')).toBe('***');
  });

  it('masks international number', () => {
    const masked = maskPhoneNumber('+447911123456');
    expect(masked).toContain('3456');
    expect(masked).not.toContain('7911');
  });
});

describe('validatePhoneNumber', () => {
  it('accepts valid formats', () => {
    expect(validatePhoneNumber('+15551234567')).toBe(true);
    expect(validatePhoneNumber('5551234567')).toBe(true);
    expect(validatePhoneNumber('+447911123456')).toBe(true);
  });

  it('rejects too-short numbers', () => {
    expect(validatePhoneNumber('123')).toBe(false);
    expect(validatePhoneNumber('')).toBe(false);
  });

  it('rejects too-long numbers', () => {
    expect(validatePhoneNumber('+1234567890123456')).toBe(false);
  });

  it('handles formatted numbers via normalizePhoneNumber', () => {
    const normalized = normalizePhoneNumber('(555) 123-4567');
    expect(normalized).toBe('5551234567');
    expect(validatePhoneNumber(normalized)).toBe(true);
  });
});
