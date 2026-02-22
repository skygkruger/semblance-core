// Integration: Step 9 Model Download — Gateway model download flow, audit trail.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ModelAdapter } from '../../packages/gateway/services/model-adapter.js';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Step 9: Model Download Gateway Flow', () => {
  const validatorPath = join(ROOT, 'packages', 'gateway', 'ipc', 'validator.ts');
  const registryPath = join(ROOT, 'packages', 'gateway', 'services', 'registry.ts');
  const adapterPath = join(ROOT, 'packages', 'gateway', 'services', 'model-adapter.ts');
  const ipcTypesPath = join(ROOT, 'packages', 'core', 'types', 'ipc.ts');

  it('model-adapter.ts exists', () => {
    expect(existsSync(adapterPath)).toBe(true);
  });

  it('ActionType includes model actions', () => {
    const content = readFileSync(ipcTypesPath, 'utf-8');
    expect(content).toContain("'model.download'");
    expect(content).toContain("'model.download_cancel'");
    expect(content).toContain("'model.verify'");
  });

  it('validator.ts routes model.download to huggingface.co', () => {
    const content = readFileSync(validatorPath, 'utf-8');
    expect(content).toContain("action === 'model.download'");
    expect(content).toContain("'huggingface.co'");
  });

  it('ModelAdapter handles download correctly', async () => {
    const adapter = new ModelAdapter();
    const result = await adapter.execute('model.download', {
      modelId: 'test-model',
      hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
      hfFilename: 'test.gguf',
      expectedSizeBytes: 100,
      expectedSha256: '',
      targetPath: '/tmp/test.gguf',
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('downloadId');
    expect(result.data).toHaveProperty('downloadUrl');
    expect((result.data as Record<string, unknown>)['downloadUrl']).toContain('huggingface.co');
  });

  it('ModelAdapter rejects unsupported actions', async () => {
    const adapter = new ModelAdapter();
    const result = await adapter.execute('email.send' as any, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_ACTION');
  });

  it('ModelAdapter validates required params', async () => {
    const adapter = new ModelAdapter();
    const result = await adapter.execute('model.download', { modelId: 'test' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_PARAMS');
  });

  it('only allows HuggingFace download domains', () => {
    const content = readFileSync(adapterPath, 'utf-8');
    expect(content).toContain('ALLOWED_DOWNLOAD_DOMAINS');
    expect(content).toContain('huggingface.co');
    expect(content).toContain('cdn-lfs.huggingface.co');
  });
});

describe('Step 9: Model Storage', () => {
  const storagePath = join(ROOT, 'packages', 'core', 'llm', 'model-storage.ts');

  it('model-storage.ts exists', () => {
    expect(existsSync(storagePath)).toBe(true);
  });

  it('exports model file operations', () => {
    const content = readFileSync(storagePath, 'utf-8');
    expect(content).toContain('export function getModelsDir');
    expect(content).toContain('export function getModelPath');
    expect(content).toContain('export function isModelDownloaded');
    expect(content).toContain('export function deleteModel');
    expect(content).toContain('export function listDownloadedModels');
    expect(content).toContain('export function getTotalModelSize');
  });

  it('default models dir is ~/.semblance/models/', () => {
    const content = readFileSync(storagePath, 'utf-8');
    expect(content).toContain('.semblance');
    expect(content).toContain("'models'");
  });

  it('uses .gguf extension for model files', () => {
    const content = readFileSync(storagePath, 'utf-8');
    expect(content).toContain('.gguf');
  });
});

describe('Step 9: Payload Schemas', () => {
  const ipcContent = readFileSync(join(ROOT, 'packages', 'core', 'types', 'ipc.ts'), 'utf-8');

  it('defines ModelDownloadPayload schema', () => {
    expect(ipcContent).toContain('ModelDownloadPayload');
    expect(ipcContent).toContain('modelId');
    expect(ipcContent).toContain('hfRepo');
    expect(ipcContent).toContain('hfFilename');
  });

  it('defines ModelDownloadCancelPayload schema', () => {
    expect(ipcContent).toContain('ModelDownloadCancelPayload');
    expect(ipcContent).toContain('downloadId');
  });

  it('defines ModelVerifyPayload schema', () => {
    expect(ipcContent).toContain('ModelVerifyPayload');
    expect(ipcContent).toContain('filePath');
    expect(ipcContent).toContain('expectedSha256');
  });
});
