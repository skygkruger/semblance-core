// Tests for ModelAdapter — model download, cancel, verify via Gateway.

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelAdapter } from '../../packages/gateway/services/model-adapter.js';

describe('ModelAdapter', () => {
  let adapter: ModelAdapter;

  beforeEach(() => {
    adapter = new ModelAdapter();
  });

  describe('model.download', () => {
    it('returns download metadata on valid request', async () => {
      const result = await adapter.execute('model.download', {
        modelId: 'qwen2.5-7b-instruct-q4_k_m',
        hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
        hfFilename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
        expectedSizeBytes: 4_700_000_000,
        expectedSha256: 'abc123',
        targetPath: '/tmp/models/test.gguf',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('downloadId');
      expect(result.data).toHaveProperty('downloadUrl');
      expect((result.data as Record<string, unknown>)['status']).toBe('started');
    });

    it('constructs correct HuggingFace URL', async () => {
      const result = await adapter.execute('model.download', {
        modelId: 'test',
        hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
        hfFilename: 'model.gguf',
        expectedSizeBytes: 100,
        expectedSha256: '',
        targetPath: '/tmp/model.gguf',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['downloadUrl']).toBe(
        'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/model.gguf'
      );
    });

    it('rejects missing required parameters', async () => {
      const result = await adapter.execute('model.download', {
        modelId: 'test',
        // Missing hfRepo, hfFilename, targetPath
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_PARAMS');
    });

    it('generates unique download IDs', async () => {
      const r1 = await adapter.execute('model.download', {
        modelId: 'test1', hfRepo: 'a/b', hfFilename: 'f.gguf',
        expectedSizeBytes: 100, expectedSha256: '', targetPath: '/tmp/1.gguf',
      });
      const r2 = await adapter.execute('model.download', {
        modelId: 'test2', hfRepo: 'a/b', hfFilename: 'f.gguf',
        expectedSizeBytes: 100, expectedSha256: '', targetPath: '/tmp/2.gguf',
      });

      const id1 = (r1.data as Record<string, unknown>)['downloadId'];
      const id2 = (r2.data as Record<string, unknown>)['downloadId'];
      expect(id1).not.toBe(id2);
    });
  });

  describe('model.download_cancel', () => {
    it('cancels an active download', async () => {
      // Start a download first
      const downloadResult = await adapter.execute('model.download', {
        modelId: 'test', hfRepo: 'a/b', hfFilename: 'f.gguf',
        expectedSizeBytes: 100, expectedSha256: '', targetPath: '/tmp/test.gguf',
      });
      const downloadId = (downloadResult.data as Record<string, unknown>)['downloadId'];

      // Cancel it
      const cancelResult = await adapter.execute('model.download_cancel', {
        modelId: 'test',
        downloadId,
      });

      expect(cancelResult.success).toBe(true);
      expect((cancelResult.data as Record<string, unknown>)['status']).toBe('cancelled');
    });

    it('rejects cancel for non-existent download', async () => {
      const result = await adapter.execute('model.download_cancel', {
        modelId: 'test',
        downloadId: 'dl-nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('rejects missing downloadId', async () => {
      const result = await adapter.execute('model.download_cancel', {
        modelId: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_PARAMS');
    });
  });

  describe('model.verify', () => {
    it('rejects missing parameters', async () => {
      const result = await adapter.execute('model.verify', {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_PARAMS');
    });

    it('reports missing file', async () => {
      const result = await adapter.execute('model.verify', {
        modelId: 'test',
        filePath: '/nonexistent/path/model.gguf',
        expectedSha256: 'abc123',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FILE_NOT_FOUND');
    });

    it('skips hash check when no expected hash provided', async () => {
      // Use a file that exists (this test file itself)
      const result = await adapter.execute('model.verify', {
        modelId: 'test',
        filePath: __filename,
        expectedSha256: '',
      });

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>)['hashSkipped']).toBe(true);
    });

    it('verifies SHA-256 hash of existing file', async () => {
      // Use this test file — we know it exists
      const result = await adapter.execute('model.verify', {
        modelId: 'test',
        filePath: __filename,
        expectedSha256: 'wrong_hash_for_testing',
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['verified']).toBe(false);
      expect(data['actualHash']).toBeTruthy();
      expect(typeof data['actualHash']).toBe('string');
    });
  });

  describe('unsupported actions', () => {
    it('rejects unsupported action types', async () => {
      const result = await adapter.execute('email.send' as any, {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_ACTION');
    });
  });
});
