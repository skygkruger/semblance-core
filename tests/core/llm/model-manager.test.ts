// Tests for ModelManager — hardware recommendations, model selection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ModelManager } from '@semblance/core/llm/model-manager.js';
import type { LLMProvider, ModelInfo } from '@semblance/core/llm/types.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

function createMockProvider(models: ModelInfo[] = []): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn(),
    embed: vi.fn(),
    listModels: vi.fn().mockResolvedValue(models),
    getModel: vi.fn(),
  };
}

describe('ModelManager', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('lists models from provider', async () => {
    const models: ModelInfo[] = [
      { name: 'llama3.2:8b', size: 4_000_000_000, isEmbedding: false, family: 'llama' },
      { name: 'nomic-embed-text', size: 500_000_000, isEmbedding: true },
    ];
    const provider = createMockProvider(models);
    const manager = new ModelManager(provider, db as unknown as DatabaseHandle);

    const listed = await manager.listModels();
    expect(listed).toHaveLength(2);
    expect(provider.listModels).toHaveBeenCalled();
  });

  it('selects preferred chat model when available', async () => {
    const models: ModelInfo[] = [
      { name: 'mistral', size: 4_000_000_000, isEmbedding: false },
      { name: 'llama3.2:8b', size: 4_000_000_000, isEmbedding: false },
    ];
    const provider = createMockProvider(models);
    const manager = new ModelManager(provider, db as unknown as DatabaseHandle);

    const chat = await manager.getActiveChatModel();
    // llama3.2:8b is higher priority than mistral
    expect(chat).toBe('llama3.2:8b');
  });

  it('falls back to first non-embedding model', async () => {
    const models: ModelInfo[] = [
      { name: 'custom-model', size: 2_000_000_000, isEmbedding: false },
      { name: 'nomic-embed-text', size: 500_000_000, isEmbedding: true },
    ];
    const provider = createMockProvider(models);
    const manager = new ModelManager(provider, db as unknown as DatabaseHandle);

    const chat = await manager.getActiveChatModel();
    expect(chat).toBe('custom-model');
  });

  it('returns null when no models are installed', async () => {
    const provider = createMockProvider([]);
    const manager = new ModelManager(provider, db as unknown as DatabaseHandle);

    const chat = await manager.getActiveChatModel();
    expect(chat).toBeNull();
  });

  it('selects preferred embedding model', async () => {
    const models: ModelInfo[] = [
      { name: 'nomic-embed-text', size: 500_000_000, isEmbedding: true },
      { name: 'llama3.2:8b', size: 4_000_000_000, isEmbedding: false },
    ];
    const provider = createMockProvider(models);
    const manager = new ModelManager(provider, db as unknown as DatabaseHandle);

    const embed = await manager.getActiveEmbeddingModel();
    expect(embed).toBe('nomic-embed-text');
  });

  it('persists model preference', async () => {
    const models: ModelInfo[] = [
      { name: 'mistral', size: 4_000_000_000, isEmbedding: false },
      { name: 'llama3.2:8b', size: 4_000_000_000, isEmbedding: false },
    ];
    const provider = createMockProvider(models);
    const manager = new ModelManager(provider, db as unknown as DatabaseHandle);

    manager.setActiveChatModel('mistral');
    const chat = await manager.getActiveChatModel();
    expect(chat).toBe('mistral');
  });

  it('returns hardware recommendations', () => {
    const provider = createMockProvider();
    const manager = new ModelManager(provider, db as unknown as DatabaseHandle);

    const recs = manager.getRecommendations();
    expect(recs.length).toBeGreaterThanOrEqual(1);
    expect(recs[0]).toHaveProperty('model');
    expect(recs[0]).toHaveProperty('reason');
  });
});
