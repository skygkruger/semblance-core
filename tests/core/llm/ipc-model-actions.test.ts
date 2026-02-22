// Tests for model action IPC types — validates new ActionType entries and payload schemas.

import { describe, it, expect } from 'vitest';
import {
  ActionType,
  ActionPayloadMap,
  ModelDownloadPayload,
  ModelDownloadCancelPayload,
  ModelVerifyPayload,
} from '@semblance/core/types/ipc.js';

describe('Model ActionTypes', () => {
  it('model.download is a valid ActionType', () => {
    expect(ActionType.safeParse('model.download').success).toBe(true);
  });

  it('model.download_cancel is a valid ActionType', () => {
    expect(ActionType.safeParse('model.download_cancel').success).toBe(true);
  });

  it('model.verify is a valid ActionType', () => {
    expect(ActionType.safeParse('model.verify').success).toBe(true);
  });

  it('model actions are in ActionPayloadMap', () => {
    expect(ActionPayloadMap['model.download']).toBeDefined();
    expect(ActionPayloadMap['model.download_cancel']).toBeDefined();
    expect(ActionPayloadMap['model.verify']).toBeDefined();
  });
});

describe('ModelDownloadPayload', () => {
  it('accepts valid payload', () => {
    const result = ModelDownloadPayload.safeParse({
      modelId: 'qwen2.5-7b-instruct-q4_k_m',
      hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
      hfFilename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
      expectedSizeBytes: 4_700_000_000,
      expectedSha256: 'abc123def456',
      targetPath: '/home/user/.semblance/models/qwen2.5-7b-instruct-q4_k_m.gguf',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing modelId', () => {
    const result = ModelDownloadPayload.safeParse({
      hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
      hfFilename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
      expectedSizeBytes: 4_700_000_000,
      expectedSha256: 'abc123def456',
      targetPath: '/path/to/model.gguf',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative size', () => {
    const result = ModelDownloadPayload.safeParse({
      modelId: 'test',
      hfRepo: 'test/repo',
      hfFilename: 'model.gguf',
      expectedSizeBytes: -100,
      expectedSha256: 'abc',
      targetPath: '/path',
    });
    expect(result.success).toBe(false);
  });
});

describe('ModelDownloadCancelPayload', () => {
  it('accepts valid payload', () => {
    const result = ModelDownloadCancelPayload.safeParse({
      modelId: 'qwen2.5-7b-instruct-q4_k_m',
      downloadId: 'dl-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing downloadId', () => {
    const result = ModelDownloadCancelPayload.safeParse({
      modelId: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('ModelVerifyPayload', () => {
  it('accepts valid payload', () => {
    const result = ModelVerifyPayload.safeParse({
      modelId: 'nomic-embed-text-v1.5-q8_0',
      filePath: '/home/user/.semblance/models/nomic-embed.gguf',
      expectedSha256: 'abc123def456789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing filePath', () => {
    const result = ModelVerifyPayload.safeParse({
      modelId: 'test',
      expectedSha256: 'abc',
    });
    expect(result.success).toBe(false);
  });
});
