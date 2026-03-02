import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { AlterEgoStore } from '@semblance/core/agent/alter-ego-store.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

const ROOT = join(__dirname, '..', '..');

// ─── Bridge Wiring ────────────────────────────────────────────────────────

describe('bridge alter ego wiring', () => {
  const bridgeSrc = readFileSync(
    join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts'),
    'utf-8',
  );

  it('imports AlterEgoStore', () => {
    expect(bridgeSrc).toContain("import { AlterEgoStore }");
  });

  it('imports AlterEgoGuardrails', () => {
    expect(bridgeSrc).toContain("import { AlterEgoGuardrails }");
  });

  const requiredCases = [
    'alterEgo:getSettings',
    'alterEgo:updateSettings',
    'alterEgo:getReceipts',
    'alterEgo:approveBatch',
    'alterEgo:rejectBatch',
    'alterEgo:sendDraft',
    'alterEgo:undoReceipt',
  ];

  for (const c of requiredCases) {
    it(`has dispatch case '${c}'`, () => {
      expect(bridgeSrc).toContain(`'${c}'`);
    });
  }
});

// ─── lib.rs Wiring ────────────────────────────────────────────────────────

describe('lib.rs alter ego wiring', () => {
  const libSrc = readFileSync(
    join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs'),
    'utf-8',
  );

  const requiredCommands = [
    'alter_ego_get_settings',
    'alter_ego_update_settings',
    'alter_ego_get_receipts',
    'alter_ego_approve_batch',
    'alter_ego_reject_batch',
    'alter_ego_send_draft',
    'alter_ego_undo_receipt',
  ];

  for (const cmd of requiredCommands) {
    it(`has Tauri command '${cmd}'`, () => {
      expect(libSrc).toContain(`fn ${cmd}(`);
    });
  }

  it('all commands registered in generate_handler', () => {
    for (const cmd of requiredCommands) {
      expect(libSrc).toContain(cmd);
      // Verify it appears in the generate_handler block
      const handlerBlock = libSrc.slice(libSrc.indexOf('generate_handler!'));
      expect(handlerBlock).toContain(cmd);
    }
  });
});

// ─── IPC Types ────────────────────────────────────────────────────────────

describe('IPC types alter ego wiring', () => {
  const typesSrc = readFileSync(
    join(ROOT, 'packages', 'desktop', 'src', 'ipc', 'types.ts'),
    'utf-8',
  );

  it('exports AlterEgoSettingsData', () => {
    expect(typesSrc).toContain('AlterEgoSettingsData');
  });

  it('exports AlterEgoReceiptData', () => {
    expect(typesSrc).toContain('AlterEgoReceiptData');
  });

  it('exports AlterEgoBatchItemData', () => {
    expect(typesSrc).toContain('AlterEgoBatchItemData');
  });
});

// ─── IPC Commands ─────────────────────────────────────────────────────────

describe('IPC commands alter ego wiring', () => {
  const cmdSrc = readFileSync(
    join(ROOT, 'packages', 'desktop', 'src', 'ipc', 'commands.ts'),
    'utf-8',
  );

  const requiredFunctions = [
    'getAlterEgoSettings',
    'updateAlterEgoSettings',
    'getAlterEgoReceipts',
    'approveAlterEgoBatch',
    'rejectAlterEgoBatch',
    'sendAlterEgoDraft',
    'undoAlterEgoReceipt',
  ];

  for (const fn of requiredFunctions) {
    it(`exports function '${fn}'`, () => {
      expect(cmdSrc).toContain(`export function ${fn}`);
    });
  }
});

// ─── AppState ─────────────────────────────────────────────────────────────

describe('AppState alter ego wiring', () => {
  const stateSrc = readFileSync(
    join(ROOT, 'packages', 'desktop', 'src', 'state', 'AppState.tsx'),
    'utf-8',
  );

  it('has alterEgoSettings field', () => {
    expect(stateSrc).toContain('alterEgoSettings');
  });

  it('has SET_ALTER_EGO_SETTINGS action type', () => {
    expect(stateSrc).toContain('SET_ALTER_EGO_SETTINGS');
  });
});

// ─── Batch Expiry Cleanup ─────────────────────────────────────────────────

describe('batch expiry cleanup', () => {
  it('rejects items older than 1 hour', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        domain TEXT NOT NULL,
        tier TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_approval',
        created_at TEXT NOT NULL,
        executed_at TEXT
      )
    `);

    // Insert a stale item (2 hours old)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare(
      "INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?)"
    ).run('stale_1', 'email.send', '{}', 'test', 'email', 'alter_ego', twoHoursAgo);

    // Simulate cleanup
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = db.prepare(
      "UPDATE pending_actions SET status = 'rejected' WHERE status = 'pending_approval' AND tier = 'alter_ego' AND created_at < ?"
    ).run(oneHourAgo);

    expect(result.changes).toBe(1);

    const row = db.prepare('SELECT status FROM pending_actions WHERE id = ?').get('stale_1') as { status: string };
    expect(row.status).toBe('rejected');

    db.close();
  });

  it('leaves items younger than 1 hour untouched', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        domain TEXT NOT NULL,
        tier TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_approval',
        created_at TEXT NOT NULL,
        executed_at TEXT
      )
    `);

    // Insert a fresh item (5 minutes old)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.prepare(
      "INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?)"
    ).run('fresh_1', 'email.send', '{}', 'test', 'email', 'alter_ego', fiveMinAgo);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = db.prepare(
      "UPDATE pending_actions SET status = 'rejected' WHERE status = 'pending_approval' AND tier = 'alter_ego' AND created_at < ?"
    ).run(oneHourAgo);

    expect(result.changes).toBe(0);

    const row = db.prepare('SELECT status FROM pending_actions WHERE id = ?').get('fresh_1') as { status: string };
    expect(row.status).toBe('pending_approval');

    db.close();
  });
});
