// Model Storage — Platform path resolution, model file operations, storage management.
// CRITICAL: No network imports. File system operations via PlatformAdapter only.

import { getPlatform } from '../platform/index.js';

const MODELS_DIR_NAME = 'models';

/**
 * Get the models directory path.
 * Default: ~/.semblance/models/
 */
export function getModelsDir(dataDir?: string): string {
  const p = getPlatform();
  const base = dataDir ?? p.path.join(p.hardware.homedir(), '.semblance');
  const modelsDir = p.path.join(base, MODELS_DIR_NAME);
  if (!p.fs.existsSync(modelsDir)) {
    p.fs.mkdirSync(modelsDir, { recursive: true });
  }
  return modelsDir;
}

/**
 * Get the full path for a model file.
 */
export function getModelPath(modelId: string, dataDir?: string): string {
  return getPlatform().path.join(getModelsDir(dataDir), `${modelId}.gguf`);
}

/**
 * Check if a model file exists locally and is non-trivial (at least 1MB).
 * Catches partial downloads and corrupt files.
 */
export function isModelDownloaded(modelId: string, dataDir?: string): boolean {
  const p = getPlatform();
  const path = getModelPath(modelId, dataDir);
  if (!p.fs.existsSync(path)) return false;
  // Verify file is non-trivial (at least 1MB) — catches partial downloads
  const stat = p.fs.statSync(path);
  return stat.size > 1_000_000;
}

/**
 * Get the size of a downloaded model file in bytes.
 * Returns 0 if the file doesn't exist.
 */
export function getModelFileSize(modelId: string, dataDir?: string): number {
  const p = getPlatform();
  const path = getModelPath(modelId, dataDir);
  if (!p.fs.existsSync(path)) return 0;
  return p.fs.statSync(path).size;
}

/**
 * Delete a model file.
 */
export function deleteModel(modelId: string, dataDir?: string): boolean {
  const p = getPlatform();
  const path = getModelPath(modelId, dataDir);
  if (!p.fs.existsSync(path)) return false;
  p.fs.unlinkSync(path);
  return true;
}

/**
 * List all downloaded model files.
 */
export function listDownloadedModels(dataDir?: string): Array<{
  filename: string;
  sizeBytes: number;
  modelId: string;
}> {
  const p = getPlatform();
  const dir = getModelsDir(dataDir);
  if (!p.fs.existsSync(dir)) return [];

  return p.fs.readdirSync(dir)
    .filter(f => f.endsWith('.gguf'))
    .map(filename => {
      const fullPath = p.path.join(dir, filename);
      const stat = p.fs.statSync(fullPath);
      return {
        filename,
        sizeBytes: stat.size,
        modelId: filename.replace('.gguf', ''),
      };
    });
}

/**
 * Get total disk space used by downloaded models.
 */
export function getTotalModelSize(dataDir?: string): number {
  return listDownloadedModels(dataDir).reduce((sum, m) => sum + m.sizeBytes, 0);
}

/**
 * Check available disk space (approximate).
 * Returns available space in bytes, or -1 if unable to determine.
 */
export function getAvailableDiskSpace(dataDir?: string): number {
  // Node.js doesn't have a built-in way to check disk space.
  // Node.js lacks a cross-platform disk space API. Returns -1 (unknown).
  return -1;
}

// ─── BitNet Model Storage ───────────────────────────────────────────────────────
// BitNet models are stored in a dedicated subdirectory under the standard models dir.
// This keeps them organized separately from standard GGUF models used by NativeProvider.

const BITNET_SUBDIR = 'bitnet';

/**
 * Get the BitNet models directory path.
 * Default: ~/.semblance/models/bitnet/
 */
export function getBitNetModelsDir(dataDir?: string): string {
  const p = getPlatform();
  const dir = p.path.join(getModelsDir(dataDir), BITNET_SUBDIR);
  if (!p.fs.existsSync(dir)) {
    p.fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get the full path for a BitNet model file.
 */
export function getBitNetModelPath(modelId: string, dataDir?: string): string {
  return getPlatform().path.join(getBitNetModelsDir(dataDir), `${modelId}.gguf`);
}

/**
 * Check if a BitNet model is downloaded and non-trivial (>1MB).
 */
export function isBitNetModelDownloaded(modelId: string, dataDir?: string): boolean {
  const p = getPlatform();
  const path = getBitNetModelPath(modelId, dataDir);
  if (!p.fs.existsSync(path)) return false;
  const stat = p.fs.statSync(path);
  return stat.size > 1_000_000;
}

/**
 * Get the size of a downloaded BitNet model file in bytes.
 */
export function getBitNetModelFileSize(modelId: string, dataDir?: string): number {
  const p = getPlatform();
  const path = getBitNetModelPath(modelId, dataDir);
  if (!p.fs.existsSync(path)) return 0;
  return p.fs.statSync(path).size;
}

/**
 * Delete a BitNet model file.
 */
export function deleteBitNetModel(modelId: string, dataDir?: string): boolean {
  const p = getPlatform();
  const path = getBitNetModelPath(modelId, dataDir);
  if (!p.fs.existsSync(path)) return false;
  p.fs.unlinkSync(path);
  return true;
}

/**
 * List all downloaded BitNet model files.
 */
export function listDownloadedBitNetModels(dataDir?: string): Array<{
  filename: string;
  sizeBytes: number;
  modelId: string;
}> {
  const p = getPlatform();
  const dir = getBitNetModelsDir(dataDir);
  if (!p.fs.existsSync(dir)) return [];

  return p.fs.readdirSync(dir)
    .filter(f => f.endsWith('.gguf'))
    .map(filename => {
      const fullPath = p.path.join(dir, filename);
      const stat = p.fs.statSync(fullPath);
      return {
        filename,
        sizeBytes: stat.size,
        modelId: filename.replace('.gguf', ''),
      };
    });
}
