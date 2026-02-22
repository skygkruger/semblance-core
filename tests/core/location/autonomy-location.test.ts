// Autonomy Location Tests — Verify location domain is properly integrated.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AutonomyManager } from '../../../packages/core/agent/autonomy';
import type { DatabaseHandle } from '../../../packages/core/platform/types';

let db: DatabaseHandle;
let manager: AutonomyManager;

beforeEach(() => {
  db = new Database(':memory:') as unknown as DatabaseHandle;
  manager = new AutonomyManager(db);
});

describe('Autonomy — Location Domain', () => {
  it('getConfig() includes location domain', () => {
    const config = manager.getConfig();
    expect(config).toHaveProperty('location');
    // Default tier is 'partner'
    expect(config.location).toBe('partner');
  });

  it('ACTION_DOMAIN_MAP includes all location action types', () => {
    // All location actions should map to the 'location' domain
    expect(manager.getDomainForAction('location.reminder_fire')).toBe('location');
    expect(manager.getDomainForAction('location.commute_alert')).toBe('location');
    expect(manager.getDomainForAction('location.weather_query')).toBe('location');

    // All location actions are read-only risk, so partner auto-approves
    expect(manager.decide('location.reminder_fire')).toBe('auto_approve');
    expect(manager.decide('location.commute_alert')).toBe('auto_approve');
    expect(manager.decide('location.weather_query')).toBe('auto_approve');
  });
});
