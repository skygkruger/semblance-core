// Cloud Storage IPC Types Tests — Verify all 7 cloud.* ActionTypes exist,
// payload schemas validate, and exhaustive records are complete.

import { describe, it, expect } from 'vitest';
import {
  ActionType,
  ActionPayloadMap,
  CloudAuthPayload,
  CloudAuthStatusPayload,
  CloudDisconnectPayload,
  CloudListFilesPayload,
  CloudFileMetadataPayload,
  CloudDownloadFilePayload,
  CloudCheckChangedPayload,
} from '../../../packages/core/types/ipc.js';
import { AutonomyManager } from '../../../packages/core/agent/autonomy.js';
import { TIME_SAVED_DEFAULTS } from '../../../packages/gateway/audit/time-saved-defaults.js';

const CLOUD_ACTIONS = [
  'cloud.auth',
  'cloud.auth_status',
  'cloud.disconnect',
  'cloud.list_files',
  'cloud.file_metadata',
  'cloud.download_file',
  'cloud.check_changed',
] as const;

describe('Cloud Storage IPC Types', () => {
  it('ActionType z.enum includes all 7 cloud.* types', () => {
    for (const action of CLOUD_ACTIONS) {
      const result = ActionType.safeParse(action);
      expect(result.success, `ActionType should include ${action}`).toBe(true);
    }
  });

  it('each payload schema validates correctly', () => {
    expect(CloudAuthPayload.safeParse({ provider: 'google_drive' }).success).toBe(true);
    expect(CloudAuthPayload.safeParse({ provider: 'invalid' }).success).toBe(false);

    expect(CloudAuthStatusPayload.safeParse({ provider: 'google_drive' }).success).toBe(true);

    expect(CloudDisconnectPayload.safeParse({ provider: 'dropbox' }).success).toBe(true);

    expect(CloudListFilesPayload.safeParse({
      provider: 'google_drive',
      folderId: 'root',
      pageSize: 50,
    }).success).toBe(true);
    expect(CloudListFilesPayload.safeParse({ provider: 'google_drive' }).success).toBe(true); // minimal

    expect(CloudFileMetadataPayload.safeParse({
      provider: 'google_drive',
      fileId: 'abc123',
    }).success).toBe(true);
    expect(CloudFileMetadataPayload.safeParse({ provider: 'google_drive' }).success).toBe(false); // missing fileId

    expect(CloudDownloadFilePayload.safeParse({
      provider: 'google_drive',
      fileId: 'abc123',
      localPath: '/tmp/test.pdf',
    }).success).toBe(true);

    expect(CloudCheckChangedPayload.safeParse({
      provider: 'google_drive',
      fileId: 'abc123',
      sinceTimestamp: '2026-01-01T00:00:00Z',
    }).success).toBe(true);
  });

  it('ActionPayloadMap has entries for all 7 cloud types', () => {
    for (const action of CLOUD_ACTIONS) {
      expect(
        ActionPayloadMap[action],
        `ActionPayloadMap should have entry for ${action}`,
      ).toBeDefined();
    }
  });

  it('ACTION_DOMAIN_MAP maps all cloud.* to cloud-storage', () => {
    // We test via AutonomyManager.getDomainForAction which reads ACTION_DOMAIN_MAP
    const mockDb = {
      exec: () => {},
      prepare: () => ({ get: () => undefined, all: () => [], run: () => ({ changes: 0, lastInsertRowid: 0 }) }),
      pragma: () => {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transaction: <T extends (...args: any[]) => any>(fn: T): T => fn,
      close: () => {},
    };
    const manager = new AutonomyManager(mockDb);

    for (const action of CLOUD_ACTIONS) {
      expect(
        manager.getDomainForAction(action),
        `${action} should map to cloud-storage domain`,
      ).toBe('cloud-storage');
    }
  });

  it('ACTION_RISK_MAP: cloud.auth = write, cloud.list_files = read', () => {
    const mockDb = {
      exec: () => {},
      prepare: () => ({ get: () => undefined, all: () => [], run: () => ({ changes: 0, lastInsertRowid: 0 }) }),
      pragma: () => {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transaction: <T extends (...args: any[]) => any>(fn: T): T => fn,
      close: () => {},
    };
    const manager = new AutonomyManager(mockDb);

    // Default tier is 'partner'. In partner mode, 'write' risk = auto_approve, 'read' = auto_approve.
    // cloud.auth and cloud.disconnect are 'write' — auto_approve in partner mode
    expect(manager.decide('cloud.auth')).toBe('auto_approve');
    expect(manager.decide('cloud.disconnect')).toBe('auto_approve');

    // Read actions — auto-approve in partner mode
    expect(manager.decide('cloud.list_files')).toBe('auto_approve');
    expect(manager.decide('cloud.file_metadata')).toBe('auto_approve');
    expect(manager.decide('cloud.download_file')).toBe('auto_approve');
    expect(manager.decide('cloud.check_changed')).toBe('auto_approve');
    expect(manager.decide('cloud.auth_status')).toBe('auto_approve');

    // In guardian mode, ALL actions require approval (including write)
    const guardianDb = {
      exec: () => {},
      prepare: () => ({ get: () => undefined, all: () => [], run: () => ({ changes: 0, lastInsertRowid: 0 }) }),
      pragma: () => {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transaction: <T extends (...args: any[]) => any>(fn: T): T => fn,
      close: () => {},
    };
    const guardianManager = new AutonomyManager(guardianDb, { defaultTier: 'guardian', domainOverrides: {} });
    expect(guardianManager.decide('cloud.auth')).toBe('requires_approval');
    expect(guardianManager.decide('cloud.list_files')).toBe('requires_approval');
  });

  it('getConfig() includes cloud-storage domain', () => {
    const mockDb = {
      exec: () => {},
      prepare: () => ({ get: () => undefined, all: () => [], run: () => ({ changes: 0, lastInsertRowid: 0 }) }),
      pragma: () => {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transaction: <T extends (...args: any[]) => any>(fn: T): T => fn,
      close: () => {},
    };
    const manager = new AutonomyManager(mockDb);
    const config = manager.getConfig();
    expect('cloud-storage' in config).toBe(true);
    expect(config['cloud-storage']).toBe('partner'); // default
  });
});
