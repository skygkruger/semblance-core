// Voice Autonomy Tests — Verify voice domain, action mapping, and risk classification.

import { describe, it, expect } from 'vitest';
import { AutonomyManager } from '../../../packages/core/agent/autonomy';

// Minimal SQLite mock for AutonomyManager
function createMockDb() {
  const data: Record<string, string> = {};
  return {
    exec(_sql: string) {},
    prepare(sql: string) {
      return {
        get(...params: unknown[]) {
          if (sql.includes('SELECT')) {
            return data[params[0] as string] ? { tier: data[params[0] as string] } : undefined;
          }
          return undefined;
        },
        all() { return []; },
        run(...params: unknown[]) {
          if (sql.includes('INSERT OR REPLACE')) {
            data[params[0] as string] = params[1] as string;
          }
          return { changes: 1, lastInsertRowid: 1 };
        },
      };
    },
    pragma() { return undefined; },
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T { return fn; },
    close() {},
  };
}

describe('Voice Autonomy', () => {
  it('getConfig includes voice domain', () => {
    const db = createMockDb();
    const mgr = new AutonomyManager(db as never);
    const config = mgr.getConfig();
    expect(config).toHaveProperty('voice');
  });

  it('ACTION_DOMAIN_MAP includes voice.transcribe, voice.speak, voice.conversation', () => {
    const db = createMockDb();
    const mgr = new AutonomyManager(db as never);

    expect(mgr.getDomainForAction('voice.transcribe')).toBe('voice');
    expect(mgr.getDomainForAction('voice.speak')).toBe('voice');
    expect(mgr.getDomainForAction('voice.conversation')).toBe('voice');
  });

  it('ACTION_RISK_MAP classifies all voice actions as read', () => {
    const db = createMockDb();
    const mgr = new AutonomyManager(db as never, { defaultTier: 'partner', domainOverrides: {} });

    // Partner tier + read risk → auto_approve
    expect(mgr.decide('voice.transcribe')).toBe('auto_approve');
    expect(mgr.decide('voice.speak')).toBe('auto_approve');
    expect(mgr.decide('voice.conversation')).toBe('auto_approve');
  });
});
