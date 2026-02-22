// Tests for Model Storage — path resolution, file operations.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getModelsDir,
  getModelPath,
  isModelDownloaded,
  getModelFileSize,
  deleteModel,
  listDownloadedModels,
  getTotalModelSize,
} from '@semblance/core/llm/model-storage.js';

describe('Model Storage', () => {
  const testDir = join(tmpdir(), `semblance-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('getModelsDir creates directory if not exists', () => {
    const dir = getModelsDir(testDir);
    expect(dir).toBe(join(testDir, 'models'));
    expect(existsSync(dir)).toBe(true);
  });

  it('getModelPath returns .gguf path', () => {
    const path = getModelPath('qwen2.5-7b', testDir);
    expect(path).toContain('qwen2.5-7b.gguf');
    expect(path).toContain('models');
  });

  it('isModelDownloaded returns false for missing model', () => {
    expect(isModelDownloaded('nonexistent', testDir)).toBe(false);
  });

  it('isModelDownloaded returns true for existing model', () => {
    const modelsDir = getModelsDir(testDir);
    writeFileSync(join(modelsDir, 'test-model.gguf'), 'fake model data');

    expect(isModelDownloaded('test-model', testDir)).toBe(true);
  });

  it('getModelFileSize returns 0 for missing model', () => {
    expect(getModelFileSize('nonexistent', testDir)).toBe(0);
  });

  it('getModelFileSize returns correct size', () => {
    const modelsDir = getModelsDir(testDir);
    const content = 'x'.repeat(1024);
    writeFileSync(join(modelsDir, 'sized-model.gguf'), content);

    expect(getModelFileSize('sized-model', testDir)).toBe(1024);
  });

  it('deleteModel removes model file', () => {
    const modelsDir = getModelsDir(testDir);
    writeFileSync(join(modelsDir, 'to-delete.gguf'), 'data');

    expect(isModelDownloaded('to-delete', testDir)).toBe(true);
    const deleted = deleteModel('to-delete', testDir);
    expect(deleted).toBe(true);
    expect(isModelDownloaded('to-delete', testDir)).toBe(false);
  });

  it('deleteModel returns false for missing model', () => {
    expect(deleteModel('nonexistent', testDir)).toBe(false);
  });

  it('listDownloadedModels returns all .gguf files', () => {
    const modelsDir = getModelsDir(testDir);
    writeFileSync(join(modelsDir, 'model-a.gguf'), 'aaa');
    writeFileSync(join(modelsDir, 'model-b.gguf'), 'bbb');
    writeFileSync(join(modelsDir, 'not-a-model.txt'), 'txt');

    const models = listDownloadedModels(testDir);
    expect(models).toHaveLength(2);
    expect(models.map(m => m.modelId)).toContain('model-a');
    expect(models.map(m => m.modelId)).toContain('model-b');
  });

  it('getTotalModelSize sums all model file sizes', () => {
    const modelsDir = getModelsDir(testDir);
    writeFileSync(join(modelsDir, 'a.gguf'), 'x'.repeat(100));
    writeFileSync(join(modelsDir, 'b.gguf'), 'y'.repeat(200));

    expect(getTotalModelSize(testDir)).toBe(300);
  });

  it('listDownloadedModels returns empty for empty directory', () => {
    getModelsDir(testDir); // Create directory
    expect(listDownloadedModels(testDir)).toEqual([]);
  });
});
