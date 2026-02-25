// Backup Restoration Tests — Decrypt and restore .sbk backup files.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { BackupManager } from '@semblance/core/backup/backup-manager.js';
import type { BackupManagerDeps, BackupDataSection } from '@semblance/core/backup/backup-manager.js';
import { setPlatform, getPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';
import type { SecureStorageAdapter, DatabaseHandle } from '@semblance/core/platform/types.js';

function createMockSecureStorage(): SecureStorageAdapter {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
  };
}

function createMockDb(): DatabaseHandle {
  return {
    pragma: vi.fn(),
    prepare: vi.fn().mockReturnValue({ get: vi.fn(), all: vi.fn(), run: vi.fn() }),
    exec: vi.fn(),
    transaction: vi.fn((fn: unknown) => fn),
    close: vi.fn(),
  };
}

const writtenFiles = new Map<string, string>();

function createDeps(overrides: Partial<BackupManagerDeps> = {}): BackupManagerDeps {
  return {
    db: createMockDb(),
    secureStorage: createMockSecureStorage(),
    deviceId: 'test-device-001',
    dataCollector: {
      collectSections: () => ({
        sections: [
          { name: 'knowledge-graph', type: 'sqlite' as const, data: { documents: [{ id: 1 }] } },
          { name: 'audit-trail', type: 'audit-trail' as const, data: { entries: [] } },
          { name: 'config', type: 'config' as const, data: { theme: 'dark' } },
          { name: 'inheritanceConfig', type: 'config' as const, data: { trustees: ['alice'] } },
        ],
        entityCounts: { documents: 1 },
      }),
    },
    ...overrides,
  };
}

beforeAll(() => {
  const adapter = createDesktopAdapter();

  adapter.fs.writeFileSync = (path: string, data: string | Buffer) => {
    writtenFiles.set(path, typeof data === 'string' ? data : data.toString('utf-8'));
  };
  adapter.fs.existsSync = (path: string) => writtenFiles.has(path) || path.includes('backups');
  adapter.fs.mkdirSync = () => {};
  adapter.fs.readFileSync = ((path: string) => {
    const content = writtenFiles.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    return content;
  }) as typeof adapter.fs.readFileSync;
  adapter.fs.unlinkSync = (path: string) => { writtenFiles.delete(path); };

  setPlatform(adapter);
});

beforeEach(() => {
  writtenFiles.clear();
});

describe('Backup Restoration', () => {
  it('restores backup with correct passphrase — data matches', async () => {
    const deps = createDeps();
    const creator = new BackupManager(deps);
    creator.configure({ destinationPath: '/tmp/backups' });

    const createResult = await creator.createBackup('correct-pass');
    expect(createResult.success).toBe(true);

    // Restore with a fresh manager that shares the same secureStorage (for key verification)
    const restorer = new BackupManager(deps);
    const restoreResult = await restorer.restoreFromBackup(createResult.filePath!, 'correct-pass');

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.sectionsRestored).toContain('knowledge-graph');
    expect(restoreResult.sectionsRestored).toContain('audit-trail');
    expect(restoreResult.sectionsRestored).toContain('config');
  });

  it('fails with wrong passphrase', async () => {
    const deps = createDeps();
    const creator = new BackupManager(deps);
    creator.configure({ destinationPath: '/tmp/backups' });

    const createResult = await creator.createBackup('correct-pass');
    expect(createResult.success).toBe(true);

    const restorer = new BackupManager(deps);
    const restoreResult = await restorer.restoreFromBackup(createResult.filePath!, 'wrong-pass');

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Wrong passphrase');
  });

  it('fails with tampered payload (integrity hash mismatch)', async () => {
    const deps = createDeps();
    const creator = new BackupManager(deps);
    creator.configure({ destinationPath: '/tmp/backups' });

    const createResult = await creator.createBackup('my-pass');
    expect(createResult.success).toBe(true);

    // Tamper with the payload
    const content = writtenFiles.get(createResult.filePath!)!;
    const sepIndex = content.indexOf('\x00\x00\x00\x00');
    const manifest = content.substring(0, sepIndex);
    const rest = content.substring(sepIndex + 4);

    // Modify a byte in the payload portion
    const tampered = manifest + '\x00\x00\x00\x00' + 'TAMPERED' + rest.substring(8);
    writtenFiles.set(createResult.filePath!, tampered);

    const restorer = new BackupManager(deps);
    const restoreResult = await restorer.restoreFromBackup(createResult.filePath!, 'my-pass');

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Integrity hash mismatch');
  });

  it('warns but proceeds with unverifiable signature', async () => {
    // Create backup with one device key, then try to verify with a different key context
    const deps1 = createDeps();
    const creator = new BackupManager(deps1);
    creator.configure({ destinationPath: '/tmp/backups' });

    const createResult = await creator.createBackup('my-pass');
    expect(createResult.success).toBe(true);

    // Modify the manifest to have a different public key (simulating different device)
    const content = writtenFiles.get(createResult.filePath!)!;
    const sepIndex = content.indexOf('\x00\x00\x00\x00');
    const manifestRaw = content.substring(0, sepIndex);
    const rest = content.substring(sepIndex + 4);

    const manifest = JSON.parse(manifestRaw);
    // Replace with a different (but valid-length) public key hex
    manifest.signaturePublicKey = 'a'.repeat(64);
    const newManifest = JSON.stringify(manifest);

    // Recompute hash for the existing payload (so integrity check passes)
    const payloadJson = rest.substring(0, rest.length - 128);
    const p = getPlatform();
    const newHash = p.crypto.sha256(payloadJson);
    manifest.integrityHash = newHash;
    const correctedManifest = JSON.stringify(manifest);

    writtenFiles.set(
      createResult.filePath!,
      correctedManifest + '\x00\x00\x00\x00' + rest,
    );

    const restorer = new BackupManager(deps1);
    const restoreResult = await restorer.restoreFromBackup(createResult.filePath!, 'my-pass');

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.warnings.some((w: string) => w.includes('Signature verification failed') || w.includes('Could not verify'))).toBe(true);
  });

  it('inheritance packages marked invalid after restore', async () => {
    const inheritanceIntegration = {
      importInheritanceConfig: vi.fn().mockReturnValue({
        success: true,
        warnings: ['Existing inheritance packages invalidated — re-generate required'],
      }),
    };

    const deps = createDeps({ inheritanceIntegration });
    const creator = new BackupManager(deps);
    creator.configure({ destinationPath: '/tmp/backups' });

    const createResult = await creator.createBackup('my-pass');
    expect(createResult.success).toBe(true);

    const restorer = new BackupManager(deps);
    const restoreResult = await restorer.restoreFromBackup(createResult.filePath!, 'my-pass');

    expect(restoreResult.success).toBe(true);
    expect(inheritanceIntegration.importInheritanceConfig).toHaveBeenCalled();
    expect(restoreResult.warnings).toContain('Existing inheritance packages invalidated — re-generate required');
  });

  it('Knowledge Moment fires after 3+ sections restored', async () => {
    const knowledgeMomentTrigger = {
      triggerIfReady: vi.fn(),
    };

    const deps = createDeps({ knowledgeMomentTrigger });
    const creator = new BackupManager(deps);
    creator.configure({ destinationPath: '/tmp/backups' });

    const createResult = await creator.createBackup('my-pass');
    expect(createResult.success).toBe(true);

    const restorer = new BackupManager(deps);
    const restoreResult = await restorer.restoreFromBackup(createResult.filePath!, 'my-pass');

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.sectionsRestored.length).toBeGreaterThanOrEqual(3);
    expect(knowledgeMomentTrigger.triggerIfReady).toHaveBeenCalledWith(
      restoreResult.sectionsRestored.length,
    );
  });

  it('returns error for corrupted file', async () => {
    writtenFiles.set('/tmp/corrupted.sbk', 'this is not a valid backup file');

    const restorer = new BackupManager(createDeps());
    const restoreResult = await restorer.restoreFromBackup('/tmp/corrupted.sbk', 'any-pass');

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toBeTruthy();
  });
});
