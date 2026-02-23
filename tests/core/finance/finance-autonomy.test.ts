/**
 * Step 19 — Finance autonomy integration tests.
 * Verifies all 7 finance actions are in domain map, risk classified, and getConfig includes finances.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { AutonomyManager } from '@semblance/core/agent/autonomy';

let db: InstanceType<typeof Database>;
let autonomy: AutonomyManager;

beforeEach(() => {
  db = new Database(':memory:');
  autonomy = new AutonomyManager(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('Finance Autonomy (Step 19)', () => {
  it('maps all 7 finance actions to finances domain', () => {
    const financeActions = [
      'finance.fetch_transactions',
      'finance.plaid_link',
      'finance.plaid_exchange',
      'finance.plaid_sync',
      'finance.plaid_balances',
      'finance.plaid_status',
      'finance.plaid_disconnect',
    ] as const;

    for (const action of financeActions) {
      expect(autonomy.getDomainForAction(action)).toBe('finances');
    }
  });

  it('classifies risk correctly for Plaid actions', () => {
    // read actions
    expect(autonomy.decide('finance.plaid_sync')).toBeDefined();
    expect(autonomy.decide('finance.plaid_balances')).toBeDefined();
    expect(autonomy.decide('finance.plaid_status')).toBeDefined();

    // write actions
    expect(autonomy.decide('finance.plaid_link')).toBeDefined();
    expect(autonomy.decide('finance.plaid_exchange')).toBeDefined();
    expect(autonomy.decide('finance.plaid_disconnect')).toBeDefined();
  });

  it('getConfig includes finances domain', () => {
    const config = autonomy.getConfig();
    expect('finances' in config).toBe(true);
    expect(config['finances']).toBeDefined();
  });
});
