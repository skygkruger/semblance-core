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
  /** Inference backend: 'llama' (default llama.cpp) or 'bitnet' (1-bit optimized). */
  inferenceBackend?: 'llama' | 'bitnet';
  /** License identifier (e.g., 'MIT', 'TII Falcon 2.0', 'Meta Llama 3'). */
  license?: string;
  /** Whether this model uses native 1-bit training (vs post-training quantization). */
  nativeOneBit?: boolean;
  /** Context window size in tokens. */
  contextLength?: number;
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
    fileSizeBytes: 4_683_074_240, // 4.36GB — single-file from bartowski
    ramRequiredMb: 8192,
    hfRepo: 'bartowski/Qwen2.5-7B-Instruct-GGUF',
    hfFilename: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
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
    fileSizeBytes: 8_098_525_888, // 7.54GB — single-file from bartowski
    ramRequiredMb: 12288,
    hfRepo: 'bartowski/Qwen2.5-7B-Instruct-GGUF',
    hfFilename: 'Qwen2.5-7B-Instruct-Q8_0.gguf',
    sha256: '',
    isEmbedding: false,
    minTier: 'workstation',
  },
] as const;

// ─── BitNet Model Catalog ──────────────────────────────────────────────────────
// 1-bit and 1.58-bit quantized models for CPU-optimized inference via BitNet.cpp.
// These run without GPU, without Ollama — zero-config local inference.
// All use GGUF format and are downloaded/managed entirely within Semblance.

export const BITNET_MODEL_CATALOG: readonly ModelRegistryEntry[] = [
  // ─── Native 1-bit Models (trained from scratch with ternary weights) ─────────

  {
    id: 'bitnet-b1.58-2b4t',
    displayName: 'BitNet b1.58 2B4T',
    family: 'bitnet',
    parameterCount: '2B',
    quantization: 'i2_s',
    fileSizeBytes: 1_187_801_280, // 1.11GB exact HuggingFace
    ramRequiredMb: 2048,
    hfRepo: 'microsoft/BitNet-b1.58-2B-4T-gguf',
    hfFilename: 'ggml-model-i2_s.gguf',
    sha256: '4221b252fdd5fd25e15847adfeb5ee88886506ba50b8a34548374492884c2162',
    isEmbedding: false,
    minTier: 'constrained',
    inferenceBackend: 'bitnet',
    license: 'MIT',
    nativeOneBit: true,
    contextLength: 4096,
  },

  {
    id: 'falcon-e-1b',
    displayName: 'Falcon-E 1B Instruct',
    family: 'falcon-bitnet',
    parameterCount: '1B',
    quantization: 'i2_s',
    fileSizeBytes: 666_324_256, // 635MB exact HuggingFace
    ramRequiredMb: 1536,
    hfRepo: 'tiiuae/Falcon-E-1B-Instruct-GGUF',
    hfFilename: 'ggml-model-i2_s.gguf',
    sha256: 'feb7478007e916d26bb807cb1a01cc45ac16f197e355d8c30aed25e550ecd73b',
    isEmbedding: false,
    minTier: 'constrained',
    inferenceBackend: 'bitnet',
    license: 'TII Falcon 2.0',
    nativeOneBit: true,
    contextLength: 2048,
  },

  {
    id: 'falcon-e-3b',
    displayName: 'Falcon-E 3B Instruct',
    family: 'falcon-bitnet',
    parameterCount: '3B',
    quantization: 'i2_s',
    fileSizeBytes: 999_908_608, // 954MB exact HuggingFace
    ramRequiredMb: 2048,
    hfRepo: 'tiiuae/Falcon-E-3B-Instruct-GGUF',
    hfFilename: 'ggml-model-i2_s.gguf',
    sha256: 'acef6896311c5d0713d80e4c7f7bc2ffa1fa183d905e2ca9236545372f434255',
    isEmbedding: false,
    minTier: 'constrained',
    inferenceBackend: 'bitnet',
    license: 'TII Falcon 2.0',
    nativeOneBit: true,
    contextLength: 2048,
  },

  // ─── Post-Training Quantized Models (standard models compressed to 1.58-bit) ─

  {
    id: 'falcon3-1b-instruct-1.58bit',
    displayName: 'Falcon3 1B Instruct',
    family: 'falcon3-bitnet',
    parameterCount: '1B',
    quantization: 'i2_s',
    fileSizeBytes: 1_361_904_672, // 1.27GB exact HuggingFace
    ramRequiredMb: 2048,
    hfRepo: 'tiiuae/Falcon3-1B-Instruct-1.58bit-GGUF',
    hfFilename: 'ggml-model-i2_s.gguf',
    sha256: '0ecef8ad9bcb1b7d3b73bac7b0237daf2faa962b60cbbaf62c86ff51a39444b4',
    isEmbedding: false,
    minTier: 'constrained',
    inferenceBackend: 'bitnet',
    license: 'TII Falcon 2.0',
    nativeOneBit: false,
    contextLength: 8192,
  },

  {
    id: 'falcon3-3b-instruct-1.58bit',
    displayName: 'Falcon3 3B Instruct',
    family: 'falcon3-bitnet',
    parameterCount: '3B',
    quantization: 'i2_s',
    fileSizeBytes: 2_221_465_632, // 2.07GB exact HuggingFace
    ramRequiredMb: 3072,
    hfRepo: 'tiiuae/Falcon3-3B-Instruct-1.58bit-GGUF',
    hfFilename: 'ggml-model-i2_s.gguf',
    sha256: '2ee9723dc1abcc53f231ef1637bdd7c1ec1dbaf132c2c59873100cfb48b41455',
    isEmbedding: false,
    minTier: 'constrained',
    inferenceBackend: 'bitnet',
    license: 'TII Falcon 2.0',
    nativeOneBit: false,
    contextLength: 8192,
  },

  {
    id: 'falcon3-7b-instruct-1.58bit',
    displayName: 'Falcon3 7B Instruct',
    family: 'falcon3-bitnet',
    parameterCount: '7B',
    quantization: 'i2_s',
    fileSizeBytes: 3_278_680_768, // 3.05GB exact HuggingFace
    ramRequiredMb: 5120,
    hfRepo: 'tiiuae/Falcon3-7B-Instruct-1.58bit-GGUF',
    hfFilename: 'ggml-model-i2_s.gguf',
    sha256: '612ab67d4c5fb77d9f810eb521eb4a477dae46df1a85ca501018490e2dac35c6',
    isEmbedding: false,
    minTier: 'standard',
    inferenceBackend: 'bitnet',
    license: 'TII Falcon 2.0',
    nativeOneBit: false,
    contextLength: 8192,
  },

  {
    id: 'falcon3-10b-instruct-1.58bit',
    displayName: 'Falcon3 10B Instruct',
    family: 'falcon3-bitnet',
    parameterCount: '10B',
    quantization: 'i2_s',
    fileSizeBytes: 3_991_393_696, // 3.72GB exact HuggingFace
    ramRequiredMb: 6144,
    hfRepo: 'tiiuae/Falcon3-10B-Instruct-1.58bit-GGUF',
    hfFilename: 'ggml-model-i2_s.gguf',
    sha256: 'e37945ee82693a6541b5fa5484f0e24787c04a9ce95e6e377f68a6b15f139c1f',
    isEmbedding: false,
    minTier: 'performance',
    inferenceBackend: 'bitnet',
    license: 'TII Falcon 2.0',
    nativeOneBit: false,
    contextLength: 8192,
  },

  // Llama3 8B 1.58bit removed — requires Python conversion (no pre-built GGUF available).
  // Falcon3 7B covers the same tier with similar quality and ships as ready-made GGUF.
];

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

// ─── BitNet Lookup Functions ────────────────────────────────────────────────────

/**
 * Get all BitNet models from the catalog.
 */
export function getBitNetModels(): readonly ModelRegistryEntry[] {
  return BITNET_MODEL_CATALOG;
}

/**
 * Get BitNet models that a given hardware tier can run.
 */
export function getBitNetModelsForTier(tier: HardwareProfileTier): ModelRegistryEntry[] {
  const tierOrder: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
  const tierIndex = tierOrder.indexOf(tier);
  return BITNET_MODEL_CATALOG.filter(m => tierOrder.indexOf(m.minTier) <= tierIndex);
}

/**
 * Get the recommended BitNet model for a hardware tier.
 * Scales to the best model the hardware can handle:
 *   - constrained (<8GB): Falcon-E 1B (666MB, native 1-bit)
 *   - standard (8-15GB): Falcon-E 3B (1.0GB, native 1-bit)
 *   - performance (16-31GB): Falcon3 7B (3.28GB, 8192 context)
 *   - workstation (32GB+): Falcon3 10B (3.99GB, best quality)
 */
export function getRecommendedBitNetModel(tier: HardwareProfileTier): ModelRegistryEntry {
  switch (tier) {
    case 'workstation':
      return BITNET_MODEL_CATALOG.find(m => m.id === 'falcon3-10b-instruct-1.58bit')!;
    case 'performance':
      return BITNET_MODEL_CATALOG.find(m => m.id === 'falcon3-7b-instruct-1.58bit')!;
    case 'standard':
      return BITNET_MODEL_CATALOG.find(m => m.id === 'falcon-e-3b')!;
    case 'constrained':
    default:
      return BITNET_MODEL_CATALOG.find(m => m.id === 'falcon-e-1b')!;
  }
}

/**
 * Get all models (standard + BitNet) available for a given tier.
 * Returns reasoning models only (no embedding).
 */
export function getAllReasoningModelsForTier(tier: HardwareProfileTier): ModelRegistryEntry[] {
  const tierOrder: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
  const tierIndex = tierOrder.indexOf(tier);

  const standard = MODEL_CATALOG.filter(
    m => !m.isEmbedding && tierOrder.indexOf(m.minTier) <= tierIndex,
  );
  const bitnet = getBitNetModelsForTier(tier);

  return [...standard, ...bitnet];
}

/**
 * Look up any model (standard or BitNet) by ID.
 */
export function getAnyModelById(id: string): ModelRegistryEntry | null {
  return (
    MODEL_CATALOG.find(m => m.id === id)
    ?? BITNET_MODEL_CATALOG.find(m => m.id === id)
    ?? null
  );
}
