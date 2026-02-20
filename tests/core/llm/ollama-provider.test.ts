// Tests for OllamaProvider — localhost enforcement, response mapping, graceful failure.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from '@semblance/core/llm/ollama-provider.js';

describe('OllamaProvider', () => {
  describe('localhost enforcement', () => {
    it('accepts http://localhost:11434', () => {
      expect(() => new OllamaProvider({ baseUrl: 'http://localhost:11434' })).not.toThrow();
    });

    it('accepts http://127.0.0.1:11434', () => {
      expect(() => new OllamaProvider({ baseUrl: 'http://127.0.0.1:11434' })).not.toThrow();
    });

    it('rejects http://[::1]:11434 (URL parser includes brackets in hostname)', () => {
      // new URL('http://[::1]:11434').hostname === '[::1]', not '::1'
      // This is intentionally rejected — only 'localhost' and '127.0.0.1' are accepted
      expect(() => new OllamaProvider({ baseUrl: 'http://[::1]:11434' })).toThrow(/SECURITY/);
    });

    it('accepts default (no config)', () => {
      expect(() => new OllamaProvider()).not.toThrow();
    });

    it('rejects remote URLs', () => {
      expect(() => new OllamaProvider({ baseUrl: 'http://evil.com:11434' })).toThrow(/SECURITY/);
    });

    it('rejects URLs with non-localhost hostname', () => {
      expect(() => new OllamaProvider({ baseUrl: 'http://192.168.1.100:11434' })).toThrow(/SECURITY/);
    });

    it('rejects HTTPS remote URLs', () => {
      expect(() => new OllamaProvider({ baseUrl: 'https://cloud-ollama.example.com' })).toThrow(/SECURITY/);
    });
  });

  describe('isAvailable', () => {
    it('returns false when Ollama is not running (no crash)', async () => {
      // Use a port unlikely to have anything running
      const provider = new OllamaProvider({ baseUrl: 'http://localhost:19999' });
      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });
});
