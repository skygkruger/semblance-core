/**
 * Desktop Audit Trail Integration Tests
 *
 * Validates the audit trail and privacy status wiring:
 * - Action log queries route to Gateway's AuditTrail
 * - Audit entries mapped to frontend format
 * - Privacy status reflects real Gateway state
 * - Pagination support for action log
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BRIDGE_TS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');
const LIB_RS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');

const bridgeContent = readFileSync(BRIDGE_TS, 'utf-8');
const libContent = readFileSync(LIB_RS, 'utf-8');

describe('Audit Trail: Query', () => {
  it('accesses Gateway audit trail', () => {
    expect(bridgeContent).toContain('gateway.getAuditTrail()');
  });

  it('fetches recent entries', () => {
    expect(bridgeContent).toContain('trail.getRecent');
  });

  it('supports pagination via limit and offset', () => {
    expect(bridgeContent).toContain('params.limit');
    expect(bridgeContent).toContain('params.offset');
  });
});

describe('Audit Trail: Entry Mapping', () => {
  it('maps audit entry ID', () => {
    expect(bridgeContent).toContain('id: entry.id');
  });

  it('maps audit entry timestamp', () => {
    expect(bridgeContent).toContain('timestamp: entry.timestamp');
  });

  it('maps audit entry action type', () => {
    expect(bridgeContent).toContain('action: entry.action');
  });

  it('maps audit entry status', () => {
    expect(bridgeContent).toContain('status: entry.status');
  });

  it('generates human-readable descriptions', () => {
    expect(bridgeContent).toContain('formatAuditDescription');
    expect(bridgeContent).toContain('Gateway started');
    expect(bridgeContent).toContain('File indexing');
    expect(bridgeContent).toContain('Chat message');
  });
});

describe('Privacy Status: Real Gateway State', () => {
  it('queries audit trail entry count', () => {
    expect(bridgeContent).toContain('trail.count()');
  });

  it('gets most recent audit entry timestamp', () => {
    expect(bridgeContent).toContain('trail.getRecent(1)');
  });

  it('reports all_local status', () => {
    expect(bridgeContent).toContain('all_local: true');
  });

  it('reports connection count', () => {
    expect(bridgeContent).toContain('connection_count: 0');
  });

  it('reports anomaly detection status', () => {
    expect(bridgeContent).toContain('anomaly_detected: false');
  });

  it('returns last audit entry timestamp', () => {
    expect(bridgeContent).toContain('lastEntry');
  });
});

describe('Audit Trail: Rust Command Routing', () => {
  it('routes get_action_log through sidecar', () => {
    expect(libContent).toContain('"get_action_log"');
  });

  it('routes get_privacy_status through sidecar', () => {
    expect(libContent).toContain('"get_privacy_status"');
  });

  it('parses action log entries from sidecar response', () => {
    expect(libContent).toContain('ActionLogEntry');
  });

  it('parses privacy status from sidecar response', () => {
    expect(libContent).toContain('PrivacyStatus');
  });
});
