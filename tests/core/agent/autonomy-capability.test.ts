import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import { evaluateAutonomyCapability } from '@semblance/kernel';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

describe('AutonomyManager capability integration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('Guardian email.send requires approval through AutonomyManager', () => {
    const manager = new AutonomyManager(db as unknown as DatabaseHandle, {
      defaultTier: 'guardian',
      domainOverrides: {},
    });

    expect(manager.decide('email.send', { to: ['user@example.com'] })).toBe('requires_approval');
  });

  it('Partner novel destination requires approval for email.send', () => {
    const manager = new AutonomyManager(db as unknown as DatabaseHandle, {
      defaultTier: 'partner',
      domainOverrides: {},
      getPriorApprovalsForCapability: () => 0,
    });

    expect(
      manager.decide('email.send', { to: ['novel@unknown.com'] }),
    ).toBe('requires_approval');
  });

  it('10 email.draft approvals do not grant email.send autonomy', () => {
    const draftApprovals = evaluateAutonomyCapability({
      tier: 'partner',
      action: 'email.draft',
      priorApprovalsForThisCapability: 10,
    });
    expect(draftApprovals.requiresApproval).toBe(false);

    const manager = new AutonomyManager(db as unknown as DatabaseHandle, {
      defaultTier: 'partner',
      domainOverrides: {},
      getPriorApprovalsForCapability: (action) =>
        action === 'email.draft' ? 10 : 0,
    });

    expect(manager.decide('email.draft')).toBe('auto_approve');
    expect(manager.decide('email.send', { to: ['novel@unknown.com'] })).toBe('requires_approval');
  });
});
