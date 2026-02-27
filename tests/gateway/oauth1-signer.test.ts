/**
 * OAuth 1.0a Signer Tests — HMAC-SHA1 signature generation.
 */

import { describe, it, expect } from 'vitest';
import {
  percentEncode,
  generateNonce,
  buildSignatureBaseString,
  signHmacSha1,
  generateOAuth1Header,
} from '../../packages/gateway/services/oauth1-signer.js';

describe('OAuth 1.0a Signer', () => {
  describe('percentEncode', () => {
    it('encodes special characters per RFC 5849', () => {
      expect(percentEncode('Hello World!')).toBe('Hello%20World%21');
      expect(percentEncode('test@example.com')).toBe('test%40example.com');
      expect(percentEncode("it's")).toBe('it%27s');
    });

    it('leaves alphanumeric and unreserved characters alone', () => {
      expect(percentEncode('abc123')).toBe('abc123');
      expect(percentEncode('-._~')).toBe('-._~');
    });
  });

  describe('generateNonce', () => {
    it('produces a 32-character hex string', () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generates unique nonces', () => {
      const a = generateNonce();
      const b = generateNonce();
      expect(a).not.toBe(b);
    });
  });

  describe('buildSignatureBaseString', () => {
    it('constructs correct base string with sorted params', () => {
      const base = buildSignatureBaseString('GET', 'https://api.example.com/resource', {
        oauth_consumer_key: 'key',
        oauth_nonce: 'nonce',
        b: '2',
        a: '1',
      });

      // Params should be sorted alphabetically
      expect(base).toContain('GET');
      expect(base).toContain('https%3A%2F%2Fapi.example.com%2Fresource');
      // a before b before oauth_*
      expect(base.indexOf('a%3D1')).toBeLessThan(base.indexOf('b%3D2'));
    });
  });

  describe('signHmacSha1', () => {
    it('produces a base64-encoded signature', () => {
      const sig = signHmacSha1('base-string', 'consumer-secret', 'token-secret');
      // base64: A-Z, a-z, 0-9, +, /, =
      expect(sig).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('produces deterministic output', () => {
      const a = signHmacSha1('same-input', 'secret', 'token');
      const b = signHmacSha1('same-input', 'secret', 'token');
      expect(a).toBe(b);
    });

    it('works with empty token secret (request token phase)', () => {
      const sig = signHmacSha1('base-string', 'consumer-secret', '');
      expect(sig).toBeTruthy();
    });
  });

  describe('generateOAuth1Header', () => {
    it('produces a valid OAuth Authorization header', () => {
      const header = generateOAuth1Header(
        {
          consumerKey: 'test-key',
          consumerSecret: 'test-secret',
          token: 'test-token',
          tokenSecret: 'test-token-secret',
        },
        {
          method: 'GET',
          url: 'https://api.example.com/data',
        },
      );

      expect(header).toMatch(/^OAuth /);
      expect(header).toContain('oauth_consumer_key');
      expect(header).toContain('oauth_nonce');
      expect(header).toContain('oauth_signature');
      expect(header).toContain('oauth_signature_method');
      expect(header).toContain('oauth_timestamp');
      expect(header).toContain('oauth_token');
      expect(header).toContain('oauth_version');
    });

    it('omits oauth_token when token is not provided', () => {
      const header = generateOAuth1Header(
        {
          consumerKey: 'test-key',
          consumerSecret: 'test-secret',
        },
        {
          method: 'POST',
          url: 'https://api.example.com/request_token',
        },
      );

      expect(header).toMatch(/^OAuth /);
      expect(header).toContain('oauth_consumer_key');
      expect(header).not.toContain('oauth_token');
    });
  });
});
