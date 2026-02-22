// Model Registry — Static catalog of known GGUF models for native inference.
// Maps hardware tiers to recommended models. Used by InferenceRouter and onboarding.
// CRITICAL: No network imports. Pure data + lookup logic.

import type { HardwareProfileTier } from './hardware-types.js';

export interface ModelRegistryEntry {
  id: string;
  displayName: string;
  family: string;
  parameterCount: string;
  quantization: string;
  fileSizeBytes: number;
  ramRequiredMb: number;
  /** HuggingFace repo ID */
  hfRepo: string;
  /** Filename within the HF repo */
  hfFilename: string;
  /** SHA-256 hash for integrity verification */
  sha256: string;
  /** Output dimensions (only for embedding models) */
  embeddingDimensions?: number;
  isEmbedding: boolean;
  /** Minimum hardware tier that can run this model */
  minTier: HardwareProfileTier;
}

/**
 * Static model catalog. Each entry is a known-good GGUF model.
 * The SHA-256 hashes are verified after download.
 *
 * LOCKED DECISION: Embedding model is nomic-embed-text-v1.5 (768-dim) for ALL profiles.
 * No per-profile variation. No dimension migration problem.
 */
export const MODEL_CATALOG: readonly ModelRegistryEntry[] = [
  // ─── Embedding Model (ALL tiers) ────────────────────────────────────────────
  {
    id: 'nomic-embed-text-v1.5-q8_0',
    displayName: 'Nomic Embed Text v1.5',
    family: 'nomic-bert',
    parameterCount: '137M',
    quantization: 'Q8_0',
    fileSizeBytes: 275_000_000, // ~275MB
    ramRequiredMb: 512,
    hfRepo: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
    hfFilename: 'nomic-embed-text-v1.5.Q8_0.gguf',
    sha256: '', // Populated at build time or first verified download
    embeddingDimensions: 768,
    isEmbedding: true,
    minTier: 'constrained',
  },

  // ─── Reasoning Models (by tier) ─────────────────────────────────────────────

  // Constrained (< 8GB RAM): Qwen 2.5 1.5B
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    displayName: 'Qwen 2.5 1.5B Instruct',
    family: 'qwen2',
    parameterCount: '1.5B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 1_100_000_000, // ~1.1GB
    ramRequiredMb: 2048,
    hfRepo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    hfFilename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sha256: '',
    isEmbedding: false,
    minTier: 'constrained',
  },

  // Standard (8-15GB RAM): Qwen 2.5 3B
  {
    id: 'qwen2.5-3b-instruct-q4_k_m',
    displayName: 'Qwen 2.5 3B Instruct',
    family: 'qwen2',
    parameterCount: '3B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 2_100_000_000, // ~2.1GB
    ramRequiredMb: 4096,
    hfRepo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    hfFilename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    sha256: '',
    isEmbedding: false,
    minTier: 'standard',
  },

  // Performance (16-31GB RAM): Qwen 2.5 7B
  {
    id: 'qwen2.5-7b-instruct-q4_k_m',
    displayName: 'Qwen 2.5 7B Instruct',
    family: 'qwen2',
    parameterCount: '7B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 4_700_000_000, // ~4.7GB
    ramRequiredMb: 8192,
    hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
    hfFilename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    sha256: '',
    isEmbedding: false,
    minTier: 'performance',
  },

  // Workstation (32GB+ RAM): Qwen 2.5 7B higher quant
  {
    id: 'qwen2.5-7b-instruct-q8_0',
    displayName: 'Qwen 2.5 7B Instruct (HQ)',
    family: 'qwen2',
    parameterCount: '7B',
    quantization: 'Q8_0',
    fileSizeBytes: 8_100_000_000, // ~8.1GB
    ramRequiredMb: 12288,
    hfRepo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
    hfFilename: 'qwen2.5-7b-instruct-q8_0.gguf',
    sha256: '',
    isEmbedding: false,
    minTier: 'workstation',
  },
] as const;

/**
 * Get the recommended reasoning model for a hardware tier.
 * Returns the highest-quality model the hardware can support.
 */
export function getRecommendedReasoningModel(tier: HardwareProfileTier): ModelRegistryEntry {
  const tierOrder: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
  const tierIndex = tierOrder.indexOf(tier);

  // Find the best model this tier can run (highest minTier <= current tier)
  const candidates = MODEL_CATALOG
    .filter(m => !m.isEmbedding && tierOrder.indexOf(m.minTier) <= tierIndex);

  // Return the one with the highest minTier (best quality the hardware supports)
  return candidates.reduce((best, current) =>
    tierOrder.indexOf(current.minTier) > tierOrder.indexOf(best.minTier) ? current : best
  );
}

/**
 * Get the embedding model. Always returns the same model regardless of tier.
 * LOCKED DECISION: nomic-embed-text-v1.5 (768-dim) for all profiles.
 */
export function getEmbeddingModel(): ModelRegistryEntry {
  const entry = MODEL_CATALOG.find(m => m.isEmbedding);
  if (!entry) throw new Error('No embedding model in catalog — this is a build error');
  return entry;
}

/**
 * Get all models recommended for a given tier (reasoning + embedding).
 */
export function getModelsForTier(tier: HardwareProfileTier): ModelRegistryEntry[] {
  return [
    getRecommendedReasoningModel(tier),
    getEmbeddingModel(),
  ];
}

/**
 * Look up a model by its ID.
 */
export function getModelById(id: string): ModelRegistryEntry | null {
  return MODEL_CATALOG.find(m => m.id === id) ?? null;
}

/**
 * Get total download size for a tier's recommended models.
 */
export function getTotalDownloadSize(tier: HardwareProfileTier): number {
  return getModelsForTier(tier).reduce((sum, m) => sum + m.fileSizeBytes, 0);
}

/**
 * Format bytes as a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
