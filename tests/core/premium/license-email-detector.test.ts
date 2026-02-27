/**
 * License email detector tests.
 */

import { describe, it, expect } from 'vitest';
import { extractLicenseKey } from '@semblance/core/premium/license-email-detector';

describe('extractLicenseKey', () => {
  it('extracts key from email body', () => {
    const body = 'Your license key:\nSEMBLANCE_LICENSE_KEY:sem_aaa.bbb.ccc\n\nThank you!';
    expect(extractLicenseKey(body)).toBe('sem_aaa.bbb.ccc');
  });

  it('extracts key with surrounding text', () => {
    const body = 'Hello! Here is your key: SEMBLANCE_LICENSE_KEY:sem_header123.payload456.sig789 — enjoy!';
    expect(extractLicenseKey(body)).toBe('sem_header123.payload456.sig789');
  });

  it('returns null when no key present', () => {
    const body = 'This is a regular email with no license key.';
    expect(extractLicenseKey(body)).toBeNull();
  });

  it('returns first key when multiple keys present', () => {
    const body = 'SEMBLANCE_LICENSE_KEY:sem_first.key.here\nSEMBLANCE_LICENSE_KEY:sem_second.key.here';
    expect(extractLicenseKey(body)).toBe('sem_first.key.here');
  });

  it('ignores malformed key prefix', () => {
    // Missing sem_ prefix
    const body = 'SEMBLANCE_LICENSE_KEY:invalid.key.here';
    expect(extractLicenseKey(body)).toBeNull();
  });

  it('handles base64url characters in key', () => {
    const body = 'SEMBLANCE_LICENSE_KEY:sem_eyJhbGciOiJFZERTQSJ9.eyJ0aWVyIjoibGlmZXRpbWUifQ.abc123-_def456';
    expect(extractLicenseKey(body)).toBe('sem_eyJhbGciOiJFZERTQSJ9.eyJ0aWVyIjoibGlmZXRpbWUifQ.abc123-_def456');
  });

  it('returns null for empty string', () => {
    expect(extractLicenseKey('')).toBeNull();
  });

  it('does not extract partial pattern', () => {
    const body = 'SEMBLANCE_LICENSE_KEY:sem_only-two.segments';
    // Pattern requires exactly 3 dot-separated segments
    expect(extractLicenseKey(body)).toBeNull();
  });
});
