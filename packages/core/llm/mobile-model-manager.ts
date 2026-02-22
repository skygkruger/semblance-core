// Mobile Model Manager — Download, caching, and lifecycle management for mobile models.
//
// Extends the existing model management from Step 9 for mobile:
// - Model registry with mobile-optimized variants (3B, 1.5B)
// - Download manager: WiFi-only default, resume-capable, progress reporting
// - Caching: models persist across app restarts on device storage
// - Model switching: upgrade from 1.5B to 3B when device capacity allows
// - Storage cleanup: delete models to free device storage
//
// CRITICAL: Downloads go through the Gateway (audit trailed, visible in Network Monitor).
// No direct network access from Core. This file is in packages/core/ — no network imports.

import type { MobileDeviceProfile, MobileModelTier } from './mobile-bridge-types.js';

/**
 * Registry entry for a mobile-compatible model variant.
 */
export interface MobileModelEntry {
  /** Unique model identifier (e.g., 'llama-3.2-3b-q4') */
  id: string;
  /** Human-readable name (e.g., 'Llama 3.2 3B Q4_K_M') */
  name: string;
  /** Model type: 'reasoning' or 'embedding' */
  type: 'reasoning' | 'embedding';
  /** Size tier: '3B', '1.5B' */
  sizeTier: '3B' | '1.5B';
  /** Hugging Face repository */
  hfRepo: string;
  /** Filename within the HF repo */
  hfFilename: string;
  /** Expected file size in bytes */
  expectedSizeBytes: number;
  /** Expected SHA-256 hash of the downloaded file */
  expectedSha256: string;
  /** Minimum RAM in MB required to run this model */
  minRamMb: number;
}

/**
 * Model download state tracked by the mobile model manager.
 */
export interface MobileModelDownload {
  modelId: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
  /** Bytes downloaded so far (for resume) */
  bytesDownloaded: number;
  /** Total bytes expected */
  totalBytes: number;
  /** Download progress 0–100 */
  progressPercent: number;
  /** Error message if status is 'error' */
  error?: string;
  /** Whether WiFi is required for this download */
  wifiOnly: boolean;
}

/**
 * Mobile model registry — predefined models optimized for mobile inference.
 */
export const MOBILE_MODEL_REGISTRY: MobileModelEntry[] = [
  // ─── 3B Reasoning Models (Capable tier: 6GB+ RAM) ──────────────────
  {
    id: 'llama-3.2-3b-q4',
    name: 'Llama 3.2 3B Q4_K_M',
    type: 'reasoning',
    sizeTier: '3B',
    hfRepo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    hfFilename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    expectedSizeBytes: 1_800_000_000,
    expectedSha256: 'placeholder-sha256-llama-3b',
    minRamMb: 5120,
  },
  // ─── 1.5B Reasoning Models (Constrained tier: 4GB RAM) ─────────────
  {
    id: 'qwen-2.5-1.5b-q4',
    name: 'Qwen 2.5 1.5B Q4_K_M',
    type: 'reasoning',
    sizeTier: '1.5B',
    hfRepo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    hfFilename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    expectedSizeBytes: 900_000_000,
    expectedSha256: 'placeholder-sha256-qwen-1.5b',
    minRamMb: 3072,
  },
  // ─── Mobile Embedding Models ───────────────────────────────────────
  {
    id: 'nomic-embed-384',
    name: 'Nomic Embed Text v1.5 (384-dim)',
    type: 'embedding',
    sizeTier: '1.5B',
    hfRepo: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
    hfFilename: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
    expectedSizeBytes: 70_000_000,
    expectedSha256: 'placeholder-sha256-nomic-384',
    minRamMb: 512,
  },
];

/**
 * Select the best reasoning model for a given mobile device profile.
 */
export function selectReasoningModel(profile: MobileDeviceProfile): MobileModelEntry | null {
  if (profile.tier === 'none') return null;

  const targetSize = profile.recommendedModelSize;
  if (!targetSize) return null;

  return MOBILE_MODEL_REGISTRY.find(
    m => m.type === 'reasoning' && m.sizeTier === targetSize && m.minRamMb <= profile.ramMb,
  ) ?? null;
}

/**
 * Select the best embedding model for a given mobile device profile.
 */
export function selectEmbeddingModel(profile: MobileDeviceProfile): MobileModelEntry | null {
  if (profile.tier === 'none') return null;

  return MOBILE_MODEL_REGISTRY.find(
    m => m.type === 'embedding' && m.minRamMb <= profile.ramMb,
  ) ?? null;
}

/**
 * Get all models required for a device profile (reasoning + embedding).
 */
export function getRequiredModels(profile: MobileDeviceProfile): MobileModelEntry[] {
  const models: MobileModelEntry[] = [];
  const reasoning = selectReasoningModel(profile);
  if (reasoning) models.push(reasoning);
  const embedding = selectEmbeddingModel(profile);
  if (embedding) models.push(embedding);
  return models;
}

/**
 * Calculate total download size for a device profile.
 */
export function getTotalDownloadSize(profile: MobileDeviceProfile): number {
  return getRequiredModels(profile).reduce((sum, m) => sum + m.expectedSizeBytes, 0);
}

/**
 * Format a byte count as human-readable string (e.g., "1.8 GB").
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  return `${bytes} bytes`;
}

/**
 * MobileModelManager — Manages model downloads, caching, and lifecycle on mobile.
 *
 * Model downloads go through the Gateway's model.download action (audit trailed).
 * The manager tracks download state and progress locally.
 */
/**
 * Network connectivity info, provided by the mobile platform layer.
 */
export interface NetworkConnectivity {
  isConnected: boolean;
  isWifi: boolean;
  isCellular: boolean;
}

/**
 * Result of a download request.
 */
export interface DownloadResult {
  success: boolean;
  modelId: string;
  localPath?: string;
  error?: string;
  /** Whether this was served from cache (no download needed) */
  cached: boolean;
}

/**
 * SHA-256 verification result.
 */
export interface IntegrityResult {
  valid: boolean;
  expected: string;
  actual: string;
}

/**
 * Storage budget configuration.
 */
export interface StorageBudget {
  /** Maximum total bytes for all cached models. Default: 4GB */
  maxTotalBytes: number;
}

export class MobileModelManager {
  private downloads: Map<string, MobileModelDownload> = new Map();
  private modelPaths: Map<string, string> = new Map();
  private storageDir: string;
  private wifiOnly: boolean;
  private storageBudget: StorageBudget;
  private auditLog: Array<{ action: string; modelId: string; timestamp: string; details: string }> = [];

  constructor(config: {
    /** Directory for storing downloaded models on device */
    storageDir: string;
    /** Whether to require WiFi for model downloads. Default: true */
    wifiOnly?: boolean;
    /** Storage budget for model cache. Default: 4GB */
    storageBudget?: StorageBudget;
  }) {
    this.storageDir = config.storageDir;
    this.wifiOnly = config.wifiOnly ?? true;
    this.storageBudget = config.storageBudget ?? { maxTotalBytes: 4_000_000_000 };
  }

  /**
   * Request a model download with all checks: WiFi, cache, storage budget.
   * Returns immediately if model is already cached.
   * Rejects on cellular if wifiOnly is enabled.
   * Rejects if adding this model would exceed storage budget.
   */
  requestDownload(
    modelEntry: MobileModelEntry,
    connectivity: NetworkConnectivity,
  ): DownloadResult {
    // Check cache first — skip download if already cached
    if (this.isModelCached(modelEntry.id)) {
      return {
        success: true,
        modelId: modelEntry.id,
        localPath: this.getModelPath(modelEntry.id) ?? undefined,
        cached: true,
      };
    }

    // Network connectivity check (before WiFi check — offline is a distinct error)
    if (!connectivity.isConnected) {
      this.logAudit('download.rejected', modelEntry.id, 'No network connectivity');
      return {
        success: false,
        modelId: modelEntry.id,
        error: 'No network connection available.',
        cached: false,
      };
    }

    // WiFi-only enforcement
    if (this.wifiOnly && !connectivity.isWifi) {
      this.logAudit('download.rejected', modelEntry.id, 'WiFi required but not connected');
      return {
        success: false,
        modelId: modelEntry.id,
        error: 'WiFi connection required for model download. Connect to WiFi or disable WiFi-only mode.',
        cached: false,
      };
    }

    // Storage budget check
    const currentUsage = this.getCachedModelsSize();
    if (currentUsage + modelEntry.expectedSizeBytes > this.storageBudget.maxTotalBytes) {
      this.logAudit('download.rejected', modelEntry.id,
        `Storage budget exceeded: ${currentUsage} + ${modelEntry.expectedSizeBytes} > ${this.storageBudget.maxTotalBytes}`);
      return {
        success: false,
        modelId: modelEntry.id,
        error: `Insufficient storage budget. Need ${formatBytes(modelEntry.expectedSizeBytes)} but only ${formatBytes(this.storageBudget.maxTotalBytes - currentUsage)} available in budget.`,
        cached: false,
      };
    }

    // Start tracking the download
    this.startDownload(modelEntry.id, modelEntry.expectedSizeBytes);
    this.logAudit('download.started', modelEntry.id,
      `Downloading ${modelEntry.name} (${formatBytes(modelEntry.expectedSizeBytes)})`);

    return {
      success: true,
      modelId: modelEntry.id,
      cached: false,
    };
  }

  /**
   * Verify SHA-256 integrity of a downloaded model file.
   * The actual hashing is done via PlatformAdapter crypto.
   */
  verifyIntegrity(modelEntry: MobileModelEntry, actualHash: string): IntegrityResult {
    const valid = actualHash === modelEntry.expectedSha256;
    if (valid) {
      this.logAudit('integrity.passed', modelEntry.id, `SHA-256 verified: ${actualHash.slice(0, 16)}...`);
    } else {
      this.logAudit('integrity.failed', modelEntry.id,
        `SHA-256 mismatch: expected ${modelEntry.expectedSha256.slice(0, 16)}..., got ${actualHash.slice(0, 16)}...`);
    }
    return {
      valid,
      expected: modelEntry.expectedSha256,
      actual: actualHash,
    };
  }

  /**
   * Get total size of all cached models in bytes.
   */
  getCachedModelsSize(): number {
    // In a real implementation, this would sum file sizes on disk.
    // For the manager's tracking, count models registered as cached.
    let total = 0;
    for (const modelId of this.modelPaths.keys()) {
      const entry = MOBILE_MODEL_REGISTRY.find(m => m.id === modelId);
      if (entry) total += entry.expectedSizeBytes;
    }
    return total;
  }

  /**
   * Get remaining storage budget in bytes.
   */
  getRemainingBudget(): number {
    return Math.max(0, this.storageBudget.maxTotalBytes - this.getCachedModelsSize());
  }

  /**
   * Get the audit log entries.
   */
  getAuditLog(): ReadonlyArray<{ action: string; modelId: string; timestamp: string; details: string }> {
    return this.auditLog;
  }

  private logAudit(action: string, modelId: string, details: string): void {
    this.auditLog.push({
      action,
      modelId,
      timestamp: new Date().toISOString(),
      details,
    });
  }

  /**
   * Check if a model is already downloaded and cached on device.
   */
  isModelCached(modelId: string): boolean {
    return this.modelPaths.has(modelId);
  }

  /**
   * Get the local file path for a cached model.
   */
  getModelPath(modelId: string): string | null {
    return this.modelPaths.get(modelId) ?? null;
  }

  /**
   * Register a model as cached at a given path (e.g., after download completes).
   */
  registerCachedModel(modelId: string, localPath: string): void {
    this.modelPaths.set(modelId, localPath);
  }

  /**
   * Start tracking a model download.
   * The actual download is initiated via Gateway IPC action (model.download).
   * This method only tracks the local state.
   */
  startDownload(modelId: string, totalBytes: number): MobileModelDownload {
    const download: MobileModelDownload = {
      modelId,
      status: 'pending',
      bytesDownloaded: 0,
      totalBytes,
      progressPercent: 0,
      wifiOnly: this.wifiOnly,
    };
    this.downloads.set(modelId, download);
    return download;
  }

  /**
   * Update download progress.
   */
  updateProgress(modelId: string, bytesDownloaded: number): MobileModelDownload | null {
    const download = this.downloads.get(modelId);
    if (!download) return null;

    download.bytesDownloaded = bytesDownloaded;
    download.progressPercent = Math.round((bytesDownloaded / download.totalBytes) * 100);
    download.status = download.progressPercent >= 100 ? 'completed' : 'downloading';

    if (download.status === 'completed') {
      const modelPath = `${this.storageDir}/${modelId}.gguf`;
      this.modelPaths.set(modelId, modelPath);
    }

    return download;
  }

  /**
   * Pause a download (e.g., WiFi lost, user requested).
   */
  pauseDownload(modelId: string): boolean {
    const download = this.downloads.get(modelId);
    if (!download || download.status !== 'downloading') return false;
    download.status = 'paused';
    return true;
  }

  /**
   * Resume a paused download from where it left off.
   */
  resumeDownload(modelId: string): MobileModelDownload | null {
    const download = this.downloads.get(modelId);
    if (!download || download.status !== 'paused') return null;
    download.status = 'downloading';
    return download;
  }

  /**
   * Mark a download as errored.
   */
  failDownload(modelId: string, error: string): void {
    const download = this.downloads.get(modelId);
    if (download) {
      download.status = 'error';
      download.error = error;
    }
  }

  /**
   * Get the current download state for a model.
   */
  getDownloadState(modelId: string): MobileModelDownload | null {
    return this.downloads.get(modelId) ?? null;
  }

  /**
   * Delete a cached model to free device storage.
   */
  deleteModel(modelId: string): boolean {
    const deleted = this.modelPaths.delete(modelId);
    this.downloads.delete(modelId);
    return deleted;
  }

  /**
   * Get whether WiFi-only mode is enabled.
   */
  isWifiOnly(): boolean {
    return this.wifiOnly;
  }

  /**
   * Set WiFi-only mode.
   */
  setWifiOnly(wifiOnly: boolean): void {
    this.wifiOnly = wifiOnly;
  }

  /**
   * Get the storage directory for downloaded models.
   */
  getStorageDir(): string {
    return this.storageDir;
  }
}
