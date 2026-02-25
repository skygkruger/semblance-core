// Backup Creation Tests — Encrypted .sbk backup file creation.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { BackupManager } from '@semblance/core/backup/backup-manager.js';
import type { BackupManagerDeps, BackupDataSection } from '@semblance/core/backup/backup-manager.js';
import { setPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';
import type { SecureStorageAdapter, DatabaseHandle } from '@semblance/core/platform/types.js';

// In-memory secure storage for tests
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

function createMockSections(): BackupDataSection[] {
  return [
    { name: 'knowledge-graph', type: 'sqlite', data: { documents: [{ id: 1 }] } },
    { name: 'audit-trail', type: 'audit-trail', data: { entries: [] } },
    { name: 'config', type: 'config', data: { theme: 'dark' } },
  ];
}

// Track written files in-memory
const writtenFiles = new Map<string, string>();
const deletedFiles = new Set<string>();

function createDeps(overrides: Partial<BackupManagerDeps> = {}): BackupManagerDeps {
  return {
    db: createMockDb(),
    secureStorage: createMockSecureStorage(),
    deviceId: 'test-device-001',
    dataCollector: {
      collectSections: () => ({
        sections: createMockSections(),
        entityCounts: { documents: 1 },
      }),
    },
    ...overrides,
  };
}

beforeAll(() => {
  const adapter = createDesktopAdapter();
  // Override fs methods to work in-memory for tests
  const originalWriteFileSync = adapter.fs.writeFileSync;
  const originalExistsSync = adapter.fs.existsSync;
  const originalReadFileSync = adapter.fs.readFileSync;
  const originalUnlinkSync = adapter.fs.unlinkSync;

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
  adapter.fs.unlinkSync = (path: string) => {
    writtenFiles.delete(path);
    deletedFiles.add(path);
  };

  setPlatform(adapter);
});

beforeEach(() => {
  writtenFiles.clear();
  deletedFiles.clear();
});

describe('Backup Creation', () => {
  it('creates backup file at configured destination path', async () => {
    const manager = new BackupManager(createDeps());
    manager.configure({ destinationPath: '/tmp/backups' });

    const result = await manager.createBackup('my-passphrase');

    expect(result.success).toBe(true);
    expect(result.filePath).toBeTruthy();
    expect(result.filePath).toContain('semblance-backup-');
    expect(result.filePath!.endsWith('.sbk')).toBe(true);
    expect(writtenFiles.has(result.filePath!)).toBe(true);
  });

  it('backup manifest has kdf=argon2id', async () => {
    const manager = new BackupManager(createDeps());
    manager.configure({ destinationPath: '/tmp/backups' });

    const result = await manager.createBackup('my-passphrase');
    expect(result.success).toBe(true);

    // Read the written file and parse manifest
    const content = writtenFiles.get(result.filePath!);
    expect(content).toBeTruthy();

    const sepIndex = content!.indexOf('\x00\x00\x00\x00');
    const manifestRaw = content!.substring(0, sepIndex);
    const manifest = JSON.parse(manifestRaw);

    expect(manifest.encryptedWith).toBe('argon2id');
    expect(manifest.version).toBe(2);
  });

  it('backup payload is encrypted (not readable as plaintext)', async () => {
    const manager = new BackupManager(createDeps());
    manager.configure({ destinationPath: '/tmp/backups' });

    const result = await manager.createBackup('my-passphrase');
    expect(result.success).toBe(true);

    const content = writtenFiles.get(result.filePath!)!;
    const sepIndex = content.indexOf('\x00\x00\x00\x00');
    const rest = content.substring(sepIndex + 4);

    // The payload should be encrypted — should NOT contain plaintext data
    expect(rest).not.toContain('"knowledge-graph"');
    expect(rest).not.toContain('"documents"');
  });

  it('backup is signed with Ed25519 device key', async () => {
    const manager = new BackupManager(createDeps());
    manager.configure({ destinationPath: '/tmp/backups' });

    const result = await manager.createBackup('my-passphrase');
    expect(result.success).toBe(true);

    const content = writtenFiles.get(result.filePath!)!;
    const sepIndex = content.indexOf('\x00\x00\x00\x00');
    const rest = content.substring(sepIndex + 4);

    // Last 128 chars should be hex signature
    const signatureHex = rest.substring(rest.length - 128);
    expect(signatureHex).toMatch(/^[0-9a-f]{128}$/);
  });

  it('manifest integrityHash matches payload hash', async () => {
    const manager = new BackupManager(createDeps());
    manager.configure({ destinationPath: '/tmp/backups' });

    const result = await manager.createBackup('my-passphrase');
    expect(result.success).toBe(true);

    const content = writtenFiles.get(result.filePath!)!;
    const sepIndex = content.indexOf('\x00\x00\x00\x00');
    const manifestRaw = content.substring(0, sepIndex);
    const rest = content.substring(sepIndex + 4);
    const payloadJson = rest.substring(0, rest.length - 128);

    const manifest = JSON.parse(manifestRaw);
    const { getPlatform } = await import('@semblance/core/platform/index.js');
    const computedHash = getPlatform().crypto.sha256(payloadJson);

    expect(manifest.integrityHash).toBe(computedHash);
  });

  it('rolling window deletes oldest when maxBackups exceeded', async () => {
    const manager = new BackupManager(createDeps());
    manager.configure({ destinationPath: '/tmp/backups', maxBackups: 2 });

    // Create 3 backups — first one should be deleted
    const r1 = await manager.createBackup('pass1');
    const r2 = await manager.createBackup('pass2');
    const r3 = await manager.createBackup('pass3');

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);

    // First backup should have been deleted
    expect(deletedFiles.has(r1.filePath!)).toBe(true);
    expect(manager.getBackupHistory()).toHaveLength(2);
  });

  it('updates lastBackupAt in config after backup', async () => {
    const manager = new BackupManager(createDeps());
    manager.configure({ destinationPath: '/tmp/backups' });

    expect(manager.getConfig().lastBackupAt).toBeNull();

    await manager.createBackup('my-passphrase');

    expect(manager.getConfig().lastBackupAt).toBeTruthy();
    expect(manager.getConfig().lastBackupSizeBytes).toBeGreaterThan(0);
  });

  it('returns error when destinationPath not configured', async () => {
    const manager = new BackupManager(createDeps());
    // Do NOT configure destinationPath

    const result = await manager.createBackup('my-passphrase');

    expect(result.success).toBe(false);
    expect(result.error).toContain('destination path not configured');
  });
});
