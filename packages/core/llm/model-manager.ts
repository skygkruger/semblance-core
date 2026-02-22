// Model Manager — Tracks available models, selects defaults, stores preferences.

import type { DatabaseHandle } from '../platform/types.js';
import { getPlatform } from '../platform/index.js';
import type { LLMProvider, ModelInfo } from './types.js';

const PREFERRED_CHAT_MODELS = [
  'llama3.2:8b',
  'llama3.2',
  'llama3.1:8b',
  'llama3.1',
  'mistral',
  'gemma2:9b',
  'phi3',
];

const PREFERRED_EMBEDDING_MODELS = [
  'nomic-embed-text',
  'all-minilm',
  'mxbai-embed-large',
  'snowflake-arctic-embed',
];

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS model_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export interface ModelRecommendation {
  model: string;
  reason: string;
}

export class ModelManager {
  private provider: LLMProvider;
  private db: DatabaseHandle;
  private cachedModels: ModelInfo[] | null = null;

  constructor(provider: LLMProvider, db: DatabaseHandle) {
    this.provider = provider;
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  /**
   * List all installed models, refreshing from provider.
   */
  async listModels(): Promise<ModelInfo[]> {
    this.cachedModels = await this.provider.listModels();
    return this.cachedModels;
  }

  /**
   * Get the active chat model. Priority: stored preference → best available → null.
   */
  async getActiveChatModel(): Promise<string | null> {
    const pref = this.getPreference('active_chat_model');
    if (pref) {
      // Verify it's still installed
      const models = await this.listModels();
      if (models.some(m => m.name === pref)) return pref;
    }
    return this.selectBestChatModel();
  }

  /**
   * Get the active embedding model. Priority: stored preference → best available → null.
   */
  async getActiveEmbeddingModel(): Promise<string | null> {
    const pref = this.getPreference('active_embedding_model');
    if (pref) {
      const models = await this.listModels();
      if (models.some(m => m.name === pref)) return pref;
    }
    return this.selectBestEmbeddingModel();
  }

  /**
   * Set the active chat model.
   */
  setActiveChatModel(model: string): void {
    this.setPreference('active_chat_model', model);
  }

  /**
   * Set the active embedding model.
   */
  setActiveEmbeddingModel(model: string): void {
    this.setPreference('active_embedding_model', model);
  }

  /**
   * Get hardware-aware model recommendations.
   */
  getRecommendations(): ModelRecommendation[] {
    const hw = getPlatform().hardware;
    const totalGb = Math.round(hw.totalmem() / (1024 * 1024 * 1024));
    const freeGb = Math.round(hw.freemem() / (1024 * 1024 * 1024));
    const recommendations: ModelRecommendation[] = [];

    if (totalGb >= 32) {
      recommendations.push({
        model: 'llama3.2:8b',
        reason: `${totalGb}GB RAM detected — 8B parameter models recommended for best quality`,
      });
    } else if (totalGb >= 16) {
      recommendations.push({
        model: 'llama3.2:3b',
        reason: `${totalGb}GB RAM detected — 3B parameter models for good balance of speed and quality`,
      });
    } else if (totalGb >= 8) {
      recommendations.push({
        model: 'phi3:mini',
        reason: `${totalGb}GB RAM detected — smaller models recommended for smooth performance`,
      });
    } else {
      recommendations.push({
        model: 'tinyllama',
        reason: `${totalGb}GB RAM detected — lightweight models only. Consider upgrading RAM for better Semblance performance.`,
      });
    }

    recommendations.push({
      model: 'nomic-embed-text',
      reason: 'Recommended embedding model for knowledge graph. Small and fast.',
    });

    if (freeGb < 4) {
      recommendations.push({
        model: '(warning)',
        reason: `Only ${freeGb}GB RAM free. Close other applications before running large models.`,
      });
    }

    return recommendations;
  }

  /**
   * Select the best available chat model from installed models.
   */
  private async selectBestChatModel(): Promise<string | null> {
    const models = this.cachedModels ?? await this.listModels();
    const chatModels = models.filter(m => !m.isEmbedding);

    for (const preferred of PREFERRED_CHAT_MODELS) {
      const found = chatModels.find(m =>
        m.name === preferred || m.name.startsWith(preferred)
      );
      if (found) return found.name;
    }

    // Fall back to first non-embedding model
    return chatModels[0]?.name ?? null;
  }

  /**
   * Select the best available embedding model from installed models.
   */
  private async selectBestEmbeddingModel(): Promise<string | null> {
    const models = this.cachedModels ?? await this.listModels();
    const embedModels = models.filter(m => m.isEmbedding);

    for (const preferred of PREFERRED_EMBEDDING_MODELS) {
      const found = embedModels.find(m =>
        m.name === preferred || m.name.startsWith(preferred)
      );
      if (found) return found.name;
    }

    // Fall back to first embedding model
    return embedModels[0]?.name ?? null;
  }

  private getPreference(key: string): string | null {
    const row = this.db.prepare(
      'SELECT value FROM model_preferences WHERE key = ?'
    ).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setPreference(key: string, value: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO model_preferences (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
    ).run(key, value);
  }
}
