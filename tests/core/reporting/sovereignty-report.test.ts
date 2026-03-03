// Sovereignty Report — Tests for report generation, signing, verification,
// data aggregation, and comparison statement generation.
// 25+ tests covering all report sections and edge cases.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  generateSovereigntyReport,
  verifySovereigntyReport,
  buildSignablePayload,
  renderSovereigntyReportPDF,
} from '../../../packages/core/reporting/sovereignty-report.js';
import type {
  SovereigntyReport,
  SovereigntyReportDeps,
} from '../../../packages/core/reporting/sovereignty-report.js';
import { generateKeyPair } from '../../../packages/core/crypto/ed25519.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:');

  // Create pending_actions table (core schema)
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
      executed_at TEXT,
      response_json TEXT,
      reasoning_context TEXT,
      estimated_time_saved_seconds INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dark_pattern_flags (
      id TEXT PRIMARY KEY,
      content_id TEXT NOT NULL,
      content_type TEXT NOT NULL,
      flagged_at TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      patterns_json TEXT NOT NULL DEFAULT '[]',
      reframe TEXT NOT NULL DEFAULT '',
      dismissed INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

function createAuditDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      chain_hash TEXT NOT NULL,
      metadata TEXT,
      estimated_time_saved_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function seedActions(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at, estimated_time_saved_seconds)
     VALUES (?, ?, '{}', 'test', ?, ?, ?, ?, ?)`
  );

  insert.run('a1', 'email.send', 'email', 'partner', 'executed', '2026-01-15T10:00:00Z', 120);
  insert.run('a2', 'email.draft', 'email', 'partner', 'executed', '2026-01-16T10:00:00Z', 60);
  insert.run('a3', 'calendar.create', 'calendar', 'guardian', 'executed', '2026-01-17T10:00:00Z', 30);
  insert.run('a4', 'research.search', 'research', 'alter_ego', 'executed', '2026-01-18T10:00:00Z', 180);
  insert.run('a5', 'email.archive', 'email', 'partner', 'rejected', '2026-01-19T10:00:00Z', 0);
  insert.run('a6', 'finance.review', 'finance', 'guardian', 'rejected', '2026-01-20T10:00:00Z', 0);
}

function seedDocuments(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT INTO documents (id, source, title) VALUES (?, ?, ?)`
  );
  for (let i = 0; i < 100; i++) insert.run(`doc-email-${i}`, 'email', `Email ${i}`);
  for (let i = 0; i < 50; i++) insert.run(`doc-file-${i}`, 'file', `File ${i}`);
  for (let i = 0; i < 30; i++) insert.run(`doc-calendar-${i}`, 'calendar', `Event ${i}`);
}

function seedDarkPatterns(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT INTO dark_pattern_flags (id, content_id, content_type, flagged_at, confidence, patterns_json, reframe)
     VALUES (?, ?, ?, ?, 0.9, '[]', 'reframed')`
  );
  insert.run('dp1', 'email-1', 'email', '2026-01-15T12:00:00Z');
  insert.run('dp2', 'email-2', 'email', '2026-01-16T12:00:00Z');
  insert.run('dp3', 'ad-1', 'advertisement', '2026-01-17T12:00:00Z');
}

function seedAuditLog(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT INTO audit_log (id, request_id, timestamp, action, direction, status, payload_hash, signature, chain_hash, estimated_time_saved_seconds)
     VALUES (?, ?, ?, ?, 'request', 'success', 'hash', 'sig', 'chain', ?)`
  );
  for (let i = 0; i < 20; i++) {
    const day = String(15 + (i % 5)).padStart(2, '0');
    insert.run(`audit-${i}`, `req-${i}`, `2026-01-${day}T10:00:00Z`, 'email.fetch', 60);
  }
  for (let i = 0; i < 10; i++) {
    insert.run(`audit-cal-${i}`, `req-cal-${i}`, `2026-01-16T10:00:00Z`, 'calendar.sync', 30);
  }
  for (let i = 0; i < 5; i++) {
    insert.run(`audit-search-${i}`, `req-s-${i}`, `2026-01-17T10:00:00Z`, 'search.brave', 10);
  }
}

const PERIOD_START = '2026-01-01T00:00:00Z';
const PERIOD_END = '2026-01-31T23:59:59Z';

// ─── Report Generation ──────────────────────────────────────────────────────

describe('generateSovereigntyReport', () => {
  let coreDb: Database.Database;
  let auditDb: Database.Database;
  let keyPair: ReturnType<typeof generateKeyPair>;

  beforeEach(() => {
    coreDb = createTestDb();
    auditDb = createAuditDb();
    keyPair = generateKeyPair();
    seedActions(coreDb);
    seedDocuments(coreDb);
    seedDarkPatterns(coreDb);
    seedAuditLog(auditDb);
  });

  afterEach(() => {
    coreDb.close();
    auditDb.close();
  });

  function makeDeps(): SovereigntyReportDeps {
    return {
      coreDb: coreDb as unknown as DatabaseHandle,
      auditDb: auditDb as unknown as DatabaseHandle,
      deviceId: 'test-device-001',
      keyPair,
    };
  }

  it('generates a valid report with all sections populated', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.version).toBe('1.0');
    expect(report.generatedAt).toBeTruthy();
    expect(report.periodStart).toBe(PERIOD_START);
    expect(report.periodEnd).toBe(PERIOD_END);
    expect(report.deviceId).toBe('test-device-001');
  });

  it('knowledge summary counts match document source counts', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.knowledgeSummary['email']).toBe(100);
    expect(report.knowledgeSummary['file']).toBe(50);
    expect(report.knowledgeSummary['calendar']).toBe(30);
  });

  it('autonomous actions aggregate correctly by domain', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.autonomousActions.byDomain['email']).toBeGreaterThanOrEqual(2);
    expect(report.autonomousActions.byDomain['calendar']).toBeGreaterThanOrEqual(1);
    expect(report.autonomousActions.byDomain['research']).toBeGreaterThanOrEqual(1);
  });

  it('autonomous actions aggregate correctly by tier', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.autonomousActions.byTier['partner']).toBeGreaterThanOrEqual(2);
    expect(report.autonomousActions.byTier['guardian']).toBeGreaterThanOrEqual(1);
    expect(report.autonomousActions.byTier['alter_ego']).toBeGreaterThanOrEqual(1);
  });

  it('time saved calculation is correct', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    // Sum: 120 + 60 + 30 + 180 + 0 + 0 = 390
    expect(report.autonomousActions.totalTimeSavedSeconds).toBe(390);
  });

  it('hard limits count matches rejected actions', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    // 2 rejected actions (a5 and a6)
    expect(report.hardLimitsEnforced).toBe(2);
  });

  it('network activity pulls from audit log grouped by service', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.networkActivity.connectionsByService['email']).toBe(20);
    expect(report.networkActivity.connectionsByService['calendar']).toBe(10);
    expect(report.networkActivity.connectionsByService['search']).toBe(5);
  });

  it('AI Core connections is always 0', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.networkActivity.aiCoreConnections).toBe(0);
  });

  it('Veridian connections is always 0', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.networkActivity.veridianConnections).toBe(0);
  });

  it('analytics connections is always 0', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.networkActivity.analyticsConnections).toBe(0);
  });

  it('adversarial defense counts pull from dark_pattern_flags', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.adversarialDefense.darkPatternsDetected).toBe(3);
    expect(report.adversarialDefense.manipulativeEmailsNeutralized).toBe(2);
  });

  it('audit chain status reports entry count and days', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.auditChainStatus.totalEntries).toBe(35); // 20 + 10 + 5
    expect(report.auditChainStatus.daysCovered).toBeGreaterThanOrEqual(3);
  });

  it('comparison statement includes data values', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.comparisonStatement).toContain('zero bytes');
    expect(report.comparisonStatement).toContain('180 items'); // 100+50+30
    expect(report.comparisonStatement).toContain('signed with your key');
    expect(report.comparisonStatement).toContain('verifiable without contacting any server');
  });
});

// ─── Signing and Verification ───────────────────────────────────────────────

describe('sovereignty report signing', () => {
  let coreDb: Database.Database;
  let keyPair: ReturnType<typeof generateKeyPair>;

  beforeEach(() => {
    coreDb = createTestDb();
    keyPair = generateKeyPair();
  });

  afterEach(() => {
    coreDb.close();
  });

  function makeDeps(): SovereigntyReportDeps {
    return {
      coreDb: coreDb as unknown as DatabaseHandle,
      auditDb: null,
      deviceId: 'test-device',
      keyPair,
    };
  }

  it('signature is valid Ed25519 over canonical JSON', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    expect(report.signature.algorithm).toBe('Ed25519');
    expect(report.signature.signatureHex).toMatch(/^[0-9a-f]+$/);
    expect(report.signature.publicKeyFingerprint).toHaveLength(16);
  });

  it('verifySovereigntyReport returns true for untampered report', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    const valid = verifySovereigntyReport(report, keyPair.publicKey);
    expect(valid).toBe(true);
  });

  it('verifySovereigntyReport returns false for tampered field', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    report.hardLimitsEnforced = 9999;
    const valid = verifySovereigntyReport(report, keyPair.publicKey);
    expect(valid).toBe(false);
  });

  it('verifySovereigntyReport returns false for tampered signature', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    report.signature.signatureHex = 'deadbeef'.repeat(16);
    const valid = verifySovereigntyReport(report, keyPair.publicKey);
    expect(valid).toBe(false);
  });

  it('verifySovereigntyReport returns false with wrong key', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    const wrongKey = generateKeyPair();
    const valid = verifySovereigntyReport(report, wrongKey.publicKey);
    expect(valid).toBe(false);
  });

  it('buildSignablePayload excludes signatureHex', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    const payload = buildSignablePayload(report);
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const sig = (parsed['signature'] as Record<string, unknown>)['signatureHex'];
    expect(sig).toBe('');
  });

  it('buildSignablePayload is deterministic', () => {
    const report = generateSovereigntyReport(makeDeps(), PERIOD_START, PERIOD_END);
    const p1 = buildSignablePayload(report);
    const p2 = buildSignablePayload(report);
    expect(p1).toBe(p2);
  });
});

// ─── Empty Period (Edge Case) ───────────────────────────────────────────────

describe('sovereignty report with empty period', () => {
  it('generates without error when no activity exists', () => {
    const db = createTestDb();
    const keyPair = generateKeyPair();
    const deps: SovereigntyReportDeps = {
      coreDb: db as unknown as DatabaseHandle,
      auditDb: null,
      deviceId: 'empty-device',
      keyPair,
    };

    const report = generateSovereigntyReport(deps, PERIOD_START, PERIOD_END);
    expect(report.version).toBe('1.0');
    expect(Object.keys(report.knowledgeSummary)).toHaveLength(0);
    expect(Object.keys(report.autonomousActions.byDomain)).toHaveLength(0);
    expect(report.autonomousActions.totalTimeSavedSeconds).toBe(0);
    expect(report.hardLimitsEnforced).toBe(0);
    expect(Object.keys(report.networkActivity.connectionsByService)).toHaveLength(0);
    expect(report.adversarialDefense.darkPatternsDetected).toBe(0);
    expect(report.auditChainStatus.totalEntries).toBe(0);

    // Still valid signature
    const valid = verifySovereigntyReport(report, keyPair.publicKey);
    expect(valid).toBe(true);

    db.close();
  });

  it('comparison statement handles zero counts gracefully', () => {
    const db = createTestDb();
    const keyPair = generateKeyPair();
    const deps: SovereigntyReportDeps = {
      coreDb: db as unknown as DatabaseHandle,
      auditDb: null,
      deviceId: 'empty-device',
      keyPair,
    };

    const report = generateSovereigntyReport(deps, PERIOD_START, PERIOD_END);
    expect(report.comparisonStatement).toContain('0 items');
    expect(report.comparisonStatement).toContain('0 autonomous actions');
    expect(report.comparisonStatement).toContain('zero bytes');

    db.close();
  });
});

// ─── Null Audit DB ──────────────────────────────────────────────────────────

describe('sovereignty report without audit db', () => {
  it('generates report with empty network activity when audit db is null', () => {
    const db = createTestDb();
    seedActions(db);
    seedDocuments(db);
    const keyPair = generateKeyPair();

    const report = generateSovereigntyReport(
      { coreDb: db as unknown as DatabaseHandle, auditDb: null, deviceId: 'test', keyPair },
      PERIOD_START, PERIOD_END,
    );

    expect(Object.keys(report.networkActivity.connectionsByService)).toHaveLength(0);
    expect(report.auditChainStatus.verified).toBe(true);
    expect(report.auditChainStatus.totalEntries).toBe(0);

    // Actions still present
    expect(Object.keys(report.autonomousActions.byDomain).length).toBeGreaterThan(0);

    db.close();
  });
});

// ─── IPC Type Alignment ─────────────────────────────────────────────────────

describe('IPC type alignment', () => {
  it('SovereigntyReport structure matches IPC SovereigntyReportData fields', () => {
    const db = createTestDb();
    const keyPair = generateKeyPair();
    const report = generateSovereigntyReport(
      { coreDb: db as unknown as DatabaseHandle, auditDb: null, deviceId: 'test', keyPair },
      PERIOD_START, PERIOD_END,
    );

    // Verify all required fields exist and have correct types
    expect(report.version).toBe('1.0');
    expect(typeof report.generatedAt).toBe('string');
    expect(typeof report.periodStart).toBe('string');
    expect(typeof report.periodEnd).toBe('string');
    expect(typeof report.deviceId).toBe('string');
    expect(typeof report.knowledgeSummary).toBe('object');
    expect(typeof report.autonomousActions.byDomain).toBe('object');
    expect(typeof report.autonomousActions.byTier).toBe('object');
    expect(typeof report.autonomousActions.totalTimeSavedSeconds).toBe('number');
    expect(typeof report.hardLimitsEnforced).toBe('number');
    expect(typeof report.networkActivity.connectionsByService).toBe('object');
    expect(report.networkActivity.aiCoreConnections).toBe(0);
    expect(report.networkActivity.veridianConnections).toBe(0);
    expect(report.networkActivity.analyticsConnections).toBe(0);
    expect(typeof report.adversarialDefense.darkPatternsDetected).toBe('number');
    expect(typeof report.adversarialDefense.manipulativeEmailsNeutralized).toBe('number');
    expect(typeof report.adversarialDefense.optOutActionsTaken).toBe('number');
    expect(typeof report.auditChainStatus.verified).toBe('boolean');
    expect(typeof report.auditChainStatus.totalEntries).toBe('number');
    expect(typeof report.auditChainStatus.daysCovered).toBe('number');
    expect(Array.isArray(report.auditChainStatus.breaks)).toBe(true);
    expect(report.signature.algorithm).toBe('Ed25519');
    expect(typeof report.signature.signatureHex).toBe('string');
    expect(typeof report.signature.publicKeyFingerprint).toBe('string');
    expect(typeof report.signature.verificationInstructions).toBe('string');
    expect(typeof report.comparisonStatement).toBe('string');

    db.close();
  });

  it('report JSON round-trips cleanly', () => {
    const db = createTestDb();
    seedDocuments(db);
    const keyPair = generateKeyPair();
    const report = generateSovereigntyReport(
      { coreDb: db as unknown as DatabaseHandle, auditDb: null, deviceId: 'test', keyPair },
      PERIOD_START, PERIOD_END,
    );

    const json = JSON.stringify(report);
    const parsed = JSON.parse(json) as SovereigntyReport;
    expect(parsed.version).toBe(report.version);
    expect(parsed.deviceId).toBe(report.deviceId);
    expect(parsed.signature.signatureHex).toBe(report.signature.signatureHex);

    // Verification still works after round-trip
    const valid = verifySovereigntyReport(parsed, keyPair.publicKey);
    expect(valid).toBe(true);

    db.close();
  });
});

// ─── PDF Rendering ─────────────────────────────────────────────────────────

describe('renderSovereigntyReportPDF', () => {
  it('returns a non-empty Uint8Array with valid PDF header', async () => {
    const db = createTestDb();
    seedDocuments(db);
    seedActions(db);
    const keyPair = generateKeyPair();
    const report = generateSovereigntyReport(
      { coreDb: db as unknown as DatabaseHandle, auditDb: null, deviceId: 'test', keyPair },
      PERIOD_START, PERIOD_END,
    );

    const pdf = await renderSovereigntyReportPDF(report);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(1000);
    // PDF header magic bytes: %PDF
    const header = String.fromCharCode(pdf[0]!, pdf[1]!, pdf[2]!, pdf[3]!);
    expect(header).toBe('%PDF');

    db.close();
  });

  it('renders an empty report without error', async () => {
    const db = createTestDb();
    const keyPair = generateKeyPair();
    const report = generateSovereigntyReport(
      { coreDb: db as unknown as DatabaseHandle, auditDb: null, deviceId: 'empty-device', keyPair },
      PERIOD_START, PERIOD_END,
    );

    const pdf = await renderSovereigntyReportPDF(report);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(500);

    db.close();
  });

  it('renders a report with all sections populated', async () => {
    const db = createTestDb();
    const auditDb = createAuditDb();
    seedDocuments(db);
    seedActions(db);
    seedDarkPatterns(db);
    seedAuditLog(auditDb);
    const keyPair = generateKeyPair();
    const report = generateSovereigntyReport(
      { coreDb: db as unknown as DatabaseHandle, auditDb: auditDb as unknown as DatabaseHandle, deviceId: 'full-device', keyPair },
      PERIOD_START, PERIOD_END,
    );

    const pdf = await renderSovereigntyReportPDF(report);
    expect(pdf).toBeInstanceOf(Uint8Array);
    // Full report with all sections should be larger
    expect(pdf.length).toBeGreaterThan(2000);

    db.close();
    auditDb.close();
  });
});
