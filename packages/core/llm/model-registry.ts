// Model Registry — Static catalog of known GGUF models for native inference.
// Maps hardware tiers to recommended models. Used by InferenceRouter and onboarding.
// Three-tier architecture: fast (always-resident), primary (session-resident), vision (on-demand).
// CRITICAL: No network imports. Pure data + lookup logic.

import type { HardwareProfileTier } from './hardware-types.js';

/** Residency policy per hardware tier — controls when a model is loaded/evicted */
export interface ResidencyPolicy {
  constrained: 'always' | 'session' | 'on-demand';
  standard: 'always' | 'session' | 'on-demand';
  performance: 'always' | 'session' | 'on-demand';
  workstation: 'always' | 'session' | 'on-demand';
}

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
  /** Inference tier: 'fast' (always resident), 'primary' (session resident), 'vision' (on-demand) */
  inferenceTier: 'fast' | 'primary' | 'vision' | 'embedding';
  /** Residency policy by hardware tier */
  residencyPolicy: ResidencyPolicy;
  /** Model modality: 'text' for language models, 'vision' for vision-language models */
  modality: 'text' | 'vision';
  /** For primary models on constrained hardware, evict after this many seconds of idle */
  idleEvictAfterSeconds?: number;
  /** For vision models: mmproj filename within the HF repo */
  mmProjectorFilename?: string;
  /** For vision models: mmproj file size in bytes */
  mmProjectorSizeBytes?: number;
}

/**
 * Static model catalog. Each entry is a known-good GGUF model.
 * The SHA-256 hashes are verified after download.
 *
 * LOCKED DECISION: Embedding model is nomic-embed-text-v1.5 (768-dim) for ALL profiles.
 * No per-profile variation. No dimension migration problem.
 */
export const MODEL_CATALOG: readonly ModelRegistryEntry[] = [
  // ─── Fast Tier: SmolLM2 1.7B (always-resident on ALL hardware) ────────────────
  {
    id: 'smollm2-1.7b-instruct-q4_k_m',
    displayName: 'SmolLM2 1.7B Instruct',
    family: 'smollm2',
    parameterCount: '1.7B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 1_073_741_824, // ~1.0GB
    ramRequiredMb: 1024,
    hfRepo: 'bartowski/SmolLM2-1.7B-Instruct-GGUF',
    hfFilename: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    sha256: '', // populate after first verified download
    isEmbedding: false,
    modality: 'text',
    inferenceTier: 'fast',
    minTier: 'constrained',
    contextLength: 8192,
    license: 'Apache-2.0',
    residencyPolicy: {
      constrained: 'always',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
  },

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
    modality: 'text',
    inferenceTier: 'embedding',
    residencyPolicy: {
      constrained: 'always',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
  },

  // ─── Primary Tier: Qwen3 Reasoning Models (by tier) ──────────────────────────

  // Constrained (<8GB): Qwen3 1.7B
  {
    id: 'qwen3-1.7b-instruct-q4_k_m',
    displayName: 'Qwen3 1.7B Instruct',
    family: 'qwen3',
    parameterCount: '1.7B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 1_100_000_000,
    ramRequiredMb: 2048,
    hfRepo: 'Qwen/Qwen3-1.7B-GGUF',
    hfFilename: 'Qwen3-1.7B-Q4_K_M.gguf',
    sha256: '',
    isEmbedding: false,
    modality: 'text',
    inferenceTier: 'primary',
    minTier: 'constrained',
    contextLength: 32768,
    license: 'Apache-2.0',
    residencyPolicy: {
      constrained: 'session',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
    idleEvictAfterSeconds: 300, // constrained only — 5 min idle evict
  },

  // Standard (8-15GB): Qwen3 4B
  {
    id: 'qwen3-4b-instruct-q4_k_m',
    displayName: 'Qwen3 4B Instruct',
    family: 'qwen3',
    parameterCount: '4B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 2_700_000_000,
    ramRequiredMb: 4096,
    hfRepo: 'Qwen/Qwen3-4B-GGUF',
    hfFilename: 'Qwen3-4B-Q4_K_M.gguf',
    sha256: '',
    isEmbedding: false,
    modality: 'text',
    inferenceTier: 'primary',
    minTier: 'standard',
    contextLength: 32768,
    license: 'Apache-2.0',
    residencyPolicy: {
      constrained: 'on-demand', // too large
      standard: 'session',
      performance: 'always',
      workstation: 'always',
    },
  },

  // Performance (16-31GB): Qwen3 8B
  {
    id: 'qwen3-8b-instruct-q4_k_m',
    displayName: 'Qwen3 8B Instruct',
    family: 'qwen3',
    parameterCount: '8B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 5_100_000_000,
    ramRequiredMb: 8192,
    hfRepo: 'Qwen/Qwen3-8B-GGUF',
    hfFilename: 'Qwen3-8B-Q4_K_M.gguf',
    sha256: '',
    isEmbedding: false,
    modality: 'text',
    inferenceTier: 'primary',
    minTier: 'performance',
    contextLength: 32768,
    license: 'Apache-2.0',
    residencyPolicy: {
      constrained: 'on-demand',
      standard: 'on-demand',
      performance: 'session',
      workstation: 'always',
    },
  },

  // Workstation (32GB+): Qwen3 30B MoE
  {
    id: 'qwen3-30b-a3b-q4_k_m',
    displayName: 'Qwen3 30B Instruct',
    family: 'qwen3',
    parameterCount: '30B (3B active)',
    quantization: 'Q4_K_M',
    fileSizeBytes: 17_000_000_000,
    ramRequiredMb: 20480,
    hfRepo: 'Qwen/Qwen3-30B-A3B-GGUF',
    hfFilename: 'Qwen3-30B-A3B-Q4_K_M.gguf',
    sha256: '',
    isEmbedding: false,
    modality: 'text',
    inferenceTier: 'primary',
    minTier: 'workstation',
    contextLength: 32768,
    license: 'Apache-2.0',
    residencyPolicy: {
      constrained: 'on-demand',
      standard: 'on-demand',
      performance: 'on-demand',
      workstation: 'session',
    },
  },

  // ─── Vision Tier ─────────────────────────────────────────────────────────────

  // Vision — Fast: Moondream2 (always available on standard+, on-demand on constrained)
  {
    id: 'moondream2-q8_0',
    displayName: 'Moondream2',
    family: 'moondream',
    parameterCount: '1.9B',
    quantization: 'Q8_0',
    fileSizeBytes: 1_800_000_000,
    ramRequiredMb: 2048,
    hfRepo: 'ggml-org/moondream2-20250414-GGUF',
    hfFilename: 'moondream2-20250414-model-q8_0.gguf',
    sha256: '',
    isEmbedding: false,
    modality: 'vision',
    inferenceTier: 'vision',
    minTier: 'constrained',
    contextLength: 2048,
    license: 'Apache-2.0',
    residencyPolicy: {
      constrained: 'on-demand',
      standard: 'session',
      performance: 'always',
      workstation: 'always',
    },
    mmProjectorFilename: 'moondream2-20250414-mmproj-f16.gguf',
    mmProjectorSizeBytes: 310_000_000,
  },

  // Vision — Document: Qwen2.5-VL 3B (on-demand, document OCR and rich visual tasks)
  {
    id: 'qwen2.5-vl-3b-instruct-q4_k_m',
    displayName: 'Qwen2.5 VL 3B Instruct',
    family: 'qwen2.5-vl',
    parameterCount: '3B',
    quantization: 'Q4_K_M',
    fileSizeBytes: 2_200_000_000,
    ramRequiredMb: 4096,
    hfRepo: 'Qwen/Qwen2.5-VL-3B-Instruct-GGUF',
    hfFilename: 'qwen2.5-vl-3b-instruct-q4_k_m.gguf',
    sha256: '',
    isEmbedding: false,
    modality: 'vision',
    inferenceTier: 'vision',
    minTier: 'standard',
    contextLength: 32768,
    license: 'Apache-2.0',
    residencyPolicy: {
      constrained: 'on-demand',
      standard: 'on-demand',
      performance: 'on-demand',
      workstation: 'session',
    },
    mmProjectorFilename: 'qwen2.5-vl-3b-instruct-mmproj-f16.gguf',
    mmProjectorSizeBytes: 480_000_000,
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
    modality: 'text',
    inferenceTier: 'primary',
    residencyPolicy: {
      constrained: 'session',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
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
    modality: 'text',
    inferenceTier: 'primary',
    residencyPolicy: {
      constrained: 'session',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
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
    modality: 'text',
    inferenceTier: 'primary',
    residencyPolicy: {
      constrained: 'session',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
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
    modality: 'text',
    inferenceTier: 'primary',
    residencyPolicy: {
      constrained: 'session',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
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
    modality: 'text',
    inferenceTier: 'primary',
    residencyPolicy: {
      constrained: 'session',
      standard: 'always',
      performance: 'always',
      workstation: 'always',
    },
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
    modality: 'text',
    inferenceTier: 'primary',
    residencyPolicy: {
      constrained: 'on-demand',
      standard: 'session',
      performance: 'always',
      workstation: 'always',
    },
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
    modality: 'text',
    inferenceTier: 'primary',
    residencyPolicy: {
      constrained: 'on-demand',
      standard: 'on-demand',
      performance: 'session',
      workstation: 'always',
    },
  },

  // Llama3 8B 1.58bit removed — requires Python conversion (no pre-built GGUF available).
  // Falcon3 7B covers the same tier with similar quality and ships as ready-made GGUF.
];

/**
 * Get the recommended reasoning model for a hardware tier.
 * Returns the highest-quality Qwen3 primary model the hardware can support.
 */
export function getRecommendedReasoningModel(tier: HardwareProfileTier): ModelRegistryEntry {
  const tierOrder: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
  const tierIndex = tierOrder.indexOf(tier);

  // Find the best primary-tier Q4_K_M model this hardware can run
  const candidates = MODEL_CATALOG
    .filter(m =>
      !m.isEmbedding
      && m.inferenceTier === 'primary'
      && m.modality === 'text'
      && tierOrder.indexOf(m.minTier) <= tierIndex
    );

  if (candidates.length === 0) {
    // Fallback: any non-embedding model
    const all = MODEL_CATALOG.filter(m => !m.isEmbedding && m.modality === 'text' && tierOrder.indexOf(m.minTier) <= tierIndex);
    return all.reduce((best, current) =>
      tierOrder.indexOf(current.minTier) > tierOrder.indexOf(best.minTier) ? current : best
    );
  }

  // Return the one with the highest minTier (best quality the hardware supports)
  return candidates.reduce((best, current) =>
    tierOrder.indexOf(current.minTier) > tierOrder.indexOf(best.minTier) ? current : best
  );
}

/**
 * Get the fast tier model (SmolLM2). Always-resident on all hardware.
 * Used exclusively for: classification, extraction, triage, intent detection.
 */
export function getFastTierModel(): ModelRegistryEntry {
  const entry = MODEL_CATALOG.find(m => m.inferenceTier === 'fast');
  if (!entry) throw new Error('No fast tier model in catalog — this is a build error');
  return entry;
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
 * Get vision models available for a hardware tier.
 */
export function getVisionModelsForTier(tier: HardwareProfileTier): ModelRegistryEntry[] {
  const tierOrder: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
  const tierIndex = tierOrder.indexOf(tier);
  return MODEL_CATALOG.filter(
    m => m.modality === 'vision' && tierOrder.indexOf(m.minTier) <= tierIndex,
  );
}

/**
 * Get the recommended fast vision model (Moondream2) for a tier.
 * Returns null if the tier cannot run any vision models.
 */
export function getRecommendedVisionModel(tier: HardwareProfileTier): ModelRegistryEntry | null {
  const models = getVisionModelsForTier(tier);
  return models.find(m => m.family === 'moondream') ?? models[0] ?? null;
}

/**
 * Get the rich vision model (Qwen2.5-VL) for document-level visual tasks.
 * Returns null if the tier cannot run it.
 */
export function getRichVisionModel(tier: HardwareProfileTier): ModelRegistryEntry | null {
  const models = getVisionModelsForTier(tier);
  return models.find(m => m.family === 'qwen2.5-vl') ?? null;
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
 *   - constrained (<8GB): Falcon3 1B (1.27GB, 8192 context) — NOT Falcon-E 1B (2048 context insufficient)
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
      // Falcon3 1B has 8192-token context vs Falcon-E 1B's 2048.
      // 2048 tokens is insufficient for production orchestration.
      // Falcon-E 1B remains in catalog for users who need minimum download size (Settings option).
      return BITNET_MODEL_CATALOG.find(m => m.id === 'falcon3-1b-instruct-1.58bit')!;
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
    m => !m.isEmbedding && m.modality === 'text' && m.inferenceTier === 'primary' && tierOrder.indexOf(m.minTier) <= tierIndex,
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
