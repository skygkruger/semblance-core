import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PreMigrationBackupFile, PreMigrationBackupSnapshot, RollbackResult } from './types.js';

function sha256File(path: string): string {
  const data = readFileSync(path);
  return createHash('sha256').update(data).digest('hex');
}

export function createPreMigrationBackup(options: {
  sourcePaths: string[];
  backupRootDir: string;
  backupId?: string;
}): PreMigrationBackupSnapshot {
  if (options.sourcePaths.length === 0) {
    throw new Error('At least one source path is required for pre-migration backup');
  }

  const backupId = options.backupId ?? randomUUID();
  const backupDir = join(options.backupRootDir, backupId);
  mkdirSync(backupDir, { recursive: true });

  const files: PreMigrationBackupFile[] = [];

  for (const sourcePath of options.sourcePaths) {
    if (!existsSync(sourcePath)) {
      throw new Error(`Backup source path does not exist: ${sourcePath}`);
    }

    const backupPath = join(backupDir, basename(sourcePath));
    copyFileSync(sourcePath, backupPath);

    const sha256 = sha256File(backupPath);
    writeFileSync(`${backupPath}.sha256`, `${sha256}\n`, { mode: 0o600 });

    files.push({
      sourcePath,
      backupPath,
      sha256,
    });
  }

  const manifestPath = join(backupDir, 'backup-manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        backupId,
        createdAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  return {
    backupId,
    createdAt: new Date().toISOString(),
    backupDir,
    files,
  };
}

export function verifyPreMigrationBackup(snapshot: PreMigrationBackupSnapshot): boolean {
  for (const file of snapshot.files) {
    if (!existsSync(file.backupPath)) {
      return false;
    }

    const markerPath = `${file.backupPath}.sha256`;
    if (!existsSync(markerPath)) {
      return false;
    }

    const marker = readFileSync(markerPath, 'utf-8').trim();
    const actual = sha256File(file.backupPath);
    if (marker !== actual || marker !== file.sha256) {
      return false;
    }
  }

  return true;
}

export function rollbackFromBackup(snapshot: PreMigrationBackupSnapshot): RollbackResult {
  if (!verifyPreMigrationBackup(snapshot)) {
    throw new Error('Pre-migration backup verification failed; rollback aborted');
  }

  const restoredFiles: PreMigrationBackupFile[] = [];

  for (const file of snapshot.files) {
    copyFileSync(file.backupPath, file.sourcePath);
    const restoredSha256 = sha256File(file.sourcePath);
    if (restoredSha256 !== file.sha256) {
      throw new Error(`Rollback hash mismatch for ${file.sourcePath}`);
    }

    restoredFiles.push({
      ...file,
      sha256: restoredSha256,
    });
  }

  return {
    restoredFiles,
    verified: true,
  };
}

export function readBackupManifest(backupDir: string): PreMigrationBackupSnapshot {
  const manifestPath = join(backupDir, 'backup-manifest.json');
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as PreMigrationBackupSnapshot;
  return parsed;
}

export async function sha256FileStream(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
