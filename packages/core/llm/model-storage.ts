// Model Storage — Platform path resolution, model file operations, storage management.
// CRITICAL: No network imports. File system operations only.

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, statSync, unlinkSync, readdirSync } from 'node:fs';

const MODELS_DIR_NAME = 'models';

/**
 * Get the models directory path.
 * Default: ~/.semblance/models/
 */
export function getModelsDir(dataDir?: string): string {
  const base = dataDir ?? join(homedir(), '.semblance');
  const modelsDir = join(base, MODELS_DIR_NAME);
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true });
  }
  return modelsDir;
}

/**
 * Get the full path for a model file.
 */
export function getModelPath(modelId: string, dataDir?: string): string {
  return join(getModelsDir(dataDir), `${modelId}.gguf`);
}

/**
 * Check if a model file exists locally.
 */
export function isModelDownloaded(modelId: string, dataDir?: string): boolean {
  return existsSync(getModelPath(modelId, dataDir));
}

/**
 * Get the size of a downloaded model file in bytes.
 * Returns 0 if the file doesn't exist.
 */
export function getModelFileSize(modelId: string, dataDir?: string): number {
  const path = getModelPath(modelId, dataDir);
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

/**
 * Delete a model file.
 */
export function deleteModel(modelId: string, dataDir?: string): boolean {
  const path = getModelPath(modelId, dataDir);
  if (!existsSync(path)) return false;
  unlinkSync(path);
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
  const dir = getModelsDir(dataDir);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter(f => f.endsWith('.gguf'))
    .map(filename => {
      const fullPath = join(dir, filename);
      const stat = statSync(fullPath);
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
  // This will be implemented platform-specifically in Sprint 4.
  // For now, return -1 (unknown).
  return -1;
}
