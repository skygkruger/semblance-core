import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MODEL_EXTENSIONS = ['.gguf', '.bin'] as const;

export interface ModelFileEntry {
  modelId: string;
  filename: string;
  path: string;
  sizeBytes: number;
  sha256: string;
}

export interface ModelInventoryManifest {
  version: 1;
  files: Record<string, { sha256: string; sizeBytes: number }>;
}

export class InventoryMismatchError extends Error {
  constructor(
    public readonly mismatches: Array<{
      modelId: string;
      expectedSha256: string;
      actualSha256: string;
    }>,
  ) {
    super(
      `Model inventory hash mismatch for: ${mismatches.map((entry) => entry.modelId).join(', ')}`,
    );
    this.name = 'InventoryMismatchError';
  }
}

export function getModelsDirectory(dataDir: string): string {
  return join(dataDir, 'models');
}

function isModelFilename(filename: string): boolean {
  return MODEL_EXTENSIONS.some((extension) => filename.endsWith(extension));
}

function modelIdFromFilename(filename: string): string {
  for (const extension of MODEL_EXTENSIONS) {
    if (filename.endsWith(extension)) {
      return filename.slice(0, -extension.length);
    }
  }
  return filename;
}

export function sha256File(path: string): string {
  const content = readFileSync(path);
  return createHash('sha256').update(content).digest('hex');
}

export function listLocalModelFiles(dataDir: string): ModelFileEntry[] {
  const modelsDir = getModelsDirectory(dataDir);
  if (!existsSync(modelsDir)) {
    return [];
  }

  return readdirSync(modelsDir)
    .filter(isModelFilename)
    .map((filename) => {
      const fullPath = join(modelsDir, filename);
      const stat = statSync(fullPath);
      return {
        modelId: modelIdFromFilename(filename),
        filename,
        path: fullPath,
        sizeBytes: stat.size,
        sha256: sha256File(fullPath),
      };
    });
}

export function loadInventoryManifest(dataDir: string): ModelInventoryManifest | null {
  const manifestPath = join(dataDir, 'model-inventory.v1.json');
  if (!existsSync(manifestPath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as ModelInventoryManifest;
  if (parsed.version !== 1 || typeof parsed.files !== 'object') {
    throw new Error(`Invalid model inventory manifest at ${manifestPath}`);
  }
  return parsed;
}

export function validateInventoryAgainstManifest(
  dataDir: string,
  manifest: ModelInventoryManifest,
): ModelFileEntry[] {
  const files = listLocalModelFiles(dataDir);
  const byModelId = new Map(files.map((entry) => [entry.modelId, entry]));
  const mismatches: InventoryMismatchError['mismatches'] = [];

  for (const [modelId, expected] of Object.entries(manifest.files)) {
    const actual = byModelId.get(modelId);
    if (!actual) {
      mismatches.push({
        modelId,
        expectedSha256: expected.sha256,
        actualSha256: '(missing)',
      });
      continue;
    }

    if (actual.sha256 !== expected.sha256) {
      mismatches.push({
        modelId,
        expectedSha256: expected.sha256,
        actualSha256: actual.sha256,
      });
    }

    if (actual.sizeBytes !== expected.sizeBytes) {
      mismatches.push({
        modelId,
        expectedSha256: `${expected.sha256} (size ${expected.sizeBytes})`,
        actualSha256: `${actual.sha256} (size ${actual.sizeBytes})`,
      });
    }
  }

  if (mismatches.length > 0) {
    throw new InventoryMismatchError(mismatches);
  }

  return files;
}

export function validateLocalInventory(dataDir: string): ModelFileEntry[] {
  const manifest = loadInventoryManifest(dataDir);
  if (!manifest) {
    return listLocalModelFiles(dataDir);
  }
  return validateInventoryAgainstManifest(dataDir, manifest);
}
