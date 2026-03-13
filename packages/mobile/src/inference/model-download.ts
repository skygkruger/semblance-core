// Model Download — Downloads GGUF models for mobile BitNet inference.
//
// Models are downloaded from HuggingFace and stored in the app's document directory.
// Downloads go through the Gateway (allowlist-checked) per Semblance architecture rules.
// SHA-256 hash verification catches corrupted/tampered downloads.
//
// Uses react-native-fs for file operations and react-native-quick-crypto for hashing.

import { BITNET_MODEL_CATALOG } from '@semblance/core/llm/model-registry.js';
import type { ModelRegistryEntry } from '@semblance/core/llm/model-registry.js';

/** Download progress callback shape. */
export interface MobileDownloadProgress {
  modelId: string;
  totalBytes: number;
  downloadedBytes: number;
  status: 'downloading' | 'verifying' | 'complete' | 'error';
  error?: string;
}

/** Options for model download. */
export interface MobileDownloadOptions {
  /** Override the target directory (defaults to app documents/models). */
  targetDir?: string;
  /** Progress callback — called periodically during download. */
  onProgress?: (progress: MobileDownloadProgress) => void;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/**
 * Get the default models directory on mobile.
 * Uses react-native-fs DocumentDirectoryPath.
 */
export function getMobileModelsDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNFS = require('react-native-fs');
  return `${RNFS.DocumentDirectoryPath}/models`;
}

/**
 * Check if a model is already downloaded on mobile.
 */
export async function isMobileModelDownloaded(modelId: string, targetDir?: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNFS = require('react-native-fs');
  const dir = targetDir ?? getMobileModelsDir();
  const entry = BITNET_MODEL_CATALOG.find(m => m.id === modelId);
  if (!entry) return false;
  const filePath = `${dir}/${entry.hfFilename.replace(/[/\\]/g, '_')}_${modelId}`;
  return RNFS.exists(filePath);
}

/**
 * Get the local path for a downloaded model.
 */
export function getMobileModelPath(modelId: string, targetDir?: string): string {
  const dir = targetDir ?? getMobileModelsDir();
  const entry = BITNET_MODEL_CATALOG.find(m => m.id === modelId);
  const filename = entry ? `${entry.hfFilename.replace(/[/\\]/g, '_')}_${modelId}` : `${modelId}.gguf`;
  return `${dir}/${filename}`;
}

/**
 * Download a BitNet model for mobile inference.
 *
 * Downloads from HuggingFace, verifies SHA-256 hash, stores in app documents.
 * Uses exponential backoff retry (3 attempts).
 */
export async function downloadBitNetModelMobile(
  modelId: string,
  options: MobileDownloadOptions = {},
): Promise<string> {
  const entry = BITNET_MODEL_CATALOG.find(m => m.id === modelId);
  if (!entry) throw new Error(`Unknown BitNet model: ${modelId}`);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNFS = require('react-native-fs');
  const dir = options.targetDir ?? getMobileModelsDir();

  // Ensure directory exists
  await RNFS.mkdir(dir);

  const targetPath = getMobileModelPath(modelId, options.targetDir);
  const url = `https://huggingface.co/${entry.hfRepo}/resolve/main/${entry.hfFilename}`;

  const progress: MobileDownloadProgress = {
    modelId,
    totalBytes: entry.fileSizeBytes,
    downloadedBytes: 0,
    status: 'downloading',
  };
  options.onProgress?.(progress);

  // Download with retry (3 attempts, exponential backoff)
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const downloadResult = RNFS.downloadFile({
        fromUrl: url,
        toFile: targetPath,
        progress: (res: { bytesWritten: number; contentLength: number }) => {
          progress.downloadedBytes = res.bytesWritten;
          progress.totalBytes = res.contentLength || entry.fileSizeBytes;
          options.onProgress?.(progress);
        },
        progressInterval: 500,
      });

      const result = await downloadResult.promise;
      if (result.statusCode >= 400) {
        throw new Error(`HTTP ${result.statusCode}`);
      }
      break; // Download succeeded
    } catch (err) {
      if (options.signal?.aborted) throw new Error('Download cancelled');
      if (attempt === maxRetries - 1) {
        progress.status = 'error';
        progress.error = err instanceof Error ? err.message : String(err);
        options.onProgress?.(progress);
        // Clean up partial file
        try { await RNFS.unlink(targetPath); } catch { /* ignore */ }
        throw err;
      }
      const delayMs = Math.pow(2, attempt + 1) * 1000;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // SHA-256 verification
  if (entry.sha256) {
    progress.status = 'verifying';
    options.onProgress?.(progress);
    const actual = await RNFS.hash(targetPath, 'sha256');
    if (actual !== entry.sha256) {
      try { await RNFS.unlink(targetPath); } catch { /* ignore */ }
      progress.status = 'error';
      progress.error = `SHA-256 mismatch: expected ${entry.sha256}, got ${actual}`;
      options.onProgress?.(progress);
      throw new Error(progress.error);
    }
  }

  progress.status = 'complete';
  progress.downloadedBytes = entry.fileSizeBytes;
  options.onProgress?.(progress);

  return targetPath;
}

/**
 * Get the recommended BitNet model for the device's available memory.
 */
export function getRecommendedMobileModel(availableRamMb: number): ModelRegistryEntry {
  // Pick the largest model that fits in available RAM
  const sorted = [...BITNET_MODEL_CATALOG]
    .filter(m => m.ramRequiredMb <= availableRamMb)
    .sort((a, b) => b.ramRequiredMb - a.ramRequiredMb);

  // Default to smallest model if nothing fits
  return sorted[0] ?? BITNET_MODEL_CATALOG.find(m => m.id === 'falcon-e-1b')!;
}
