// IPC Transport Tests — Proves message framing and connection handling.

import { describe, it, expect } from 'vitest';
import { encodeMessage, getDefaultSocketPath } from '@semblance/gateway/ipc/transport.js';
import { platform } from 'node:os';

describe('IPC Transport', () => {
  describe('encodeMessage', () => {
    it('encodes a message with 4-byte length header', () => {
      const data = { hello: 'world' };
      const encoded = encodeMessage(data);

      // Read the 4-byte length header
      const length = encoded.readUInt32BE(0);
      const json = encoded.subarray(4).toString('utf-8');

      expect(JSON.parse(json)).toEqual(data);
      expect(length).toBe(Buffer.byteLength(json, 'utf-8'));
    });

    it('header length matches payload length', () => {
      const data = { key: 'a'.repeat(1000) };
      const encoded = encodeMessage(data);

      const headerLength = encoded.readUInt32BE(0);
      const payloadLength = encoded.length - 4;
      expect(headerLength).toBe(payloadLength);
    });

    it('handles empty objects', () => {
      const encoded = encodeMessage({});
      const length = encoded.readUInt32BE(0);
      const json = encoded.subarray(4).toString('utf-8');
      expect(JSON.parse(json)).toEqual({});
      expect(length).toBe(2); // '{}'
    });

    it('handles arrays', () => {
      const data = [1, 2, 3];
      const encoded = encodeMessage(data);
      const json = encoded.subarray(4).toString('utf-8');
      expect(JSON.parse(json)).toEqual([1, 2, 3]);
    });

    it('handles null values', () => {
      const data = { key: null };
      const encoded = encodeMessage(data);
      const json = encoded.subarray(4).toString('utf-8');
      expect(JSON.parse(json)).toEqual({ key: null });
    });

    it('handles Unicode content', () => {
      const data = { message: 'Hello \u{1F30D}' };
      const encoded = encodeMessage(data);
      const length = encoded.readUInt32BE(0);
      const json = encoded.subarray(4).toString('utf-8');
      const parsed = JSON.parse(json) as Record<string, string>;
      expect(parsed['message']).toContain('Hello');
      expect(length).toBe(Buffer.byteLength(json, 'utf-8'));
    });
  });

  describe('getDefaultSocketPath', () => {
    it('returns a platform-appropriate path', () => {
      const path = getDefaultSocketPath();
      if (platform() === 'win32') {
        expect(path).toContain('\\\\.\\pipe\\');
      } else {
        expect(path).toContain('.semblance');
        expect(path).toContain('gateway.sock');
      }
    });

    it('returns a non-empty string', () => {
      const path = getDefaultSocketPath();
      expect(path.length).toBeGreaterThan(0);
    });
  });
});
