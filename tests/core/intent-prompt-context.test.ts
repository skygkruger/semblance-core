// Tests for IntentManager.buildIntentContext() — system prompt output format.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { IntentManager } from '@semblance/core/agent/intent-manager.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

describe('IntentManager.buildIntentContext()', () => {
  let db: Database.Database;
  let mgr: IntentManager;

  beforeEach(() => {
    db = new Database(':memory:');
    mgr = new IntentManager({ db: db as unknown as DatabaseHandle });
  });

  it('returns empty string when no intent data exists', () => {
    const result = mgr.buildIntentContext();
    expect(result).toBe('');
  });

  it('includes primary goal when set', () => {
    mgr.setPrimaryGoal('Save $50k for a house down payment');
    const result = mgr.buildIntentContext();
    expect(result).toContain('Primary Goal: Save $50k for a house down payment');
  });

  it('includes hard limits section when limits exist', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO hard_limits (id, raw_text, parsed_rule_json, active, source, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'settings', ?, ?)`
    ).run('hl-1', 'Never send emails to my ex', JSON.stringify({
      action: 'never', scope: 'email.send', target: 'my ex', confidence: 0.9,
    }), now, now);

    const result = mgr.buildIntentContext();
    expect(result).toContain('Hard Limits (NEVER violate these):');
    expect(result).toContain('- Never send emails to my ex');
  });

  it('excludes inactive hard limits from output', () => {
    const now = new Date().toISOString();
    // Insert an active limit
    db.prepare(
      `INSERT INTO hard_limits (id, raw_text, parsed_rule_json, active, source, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'settings', ?, ?)`
    ).run('hl-active', 'No crypto trades', JSON.stringify({
      action: 'never', scope: 'finance.*', target: 'crypto', confidence: 0.85,
    }), now, now);

    // Insert an inactive limit
    db.prepare(
      `INSERT INTO hard_limits (id, raw_text, parsed_rule_json, active, source, created_at, updated_at)
       VALUES (?, ?, ?, 0, 'settings', ?, ?)`
    ).run('hl-inactive', 'Do not touch stocks', JSON.stringify({
      action: 'never', scope: 'finance.*', target: 'stocks', confidence: 0.8,
    }), now, now);

    const result = mgr.buildIntentContext();
    expect(result).toContain('- No crypto trades');
    expect(result).not.toContain('Do not touch stocks');
  });

  it('includes personal values section when values exist', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO personal_values (id, raw_text, theme, source, active, created_at)
       VALUES (?, ?, ?, 'onboarding', 1, ?)`
    ).run('pv-1', 'Family time is sacred', 'family', now);

    const result = mgr.buildIntentContext();
    expect(result).toContain('Personal Values:');
    expect(result).toContain('- Family time is sacred');
  });

  it('output includes "USER INTENT CONTEXT" header', () => {
    mgr.setPrimaryGoal('Build a better life');
    const result = mgr.buildIntentContext();
    expect(result).toContain('USER INTENT CONTEXT');
    expect(result).toContain('===================');
  });

  it('output includes "NEVER violate" instruction for hard limits', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO hard_limits (id, raw_text, parsed_rule_json, active, source, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'chat', ?, ?)`
    ).run('hl-2', 'Never auto-send anything', JSON.stringify({
      action: 'never', scope: 'any', confidence: 0.95,
    }), now, now);

    const result = mgr.buildIntentContext();
    expect(result).toContain('NEVER violate');
  });

  it('complete output format matches expected structure with goal + limits + values', () => {
    const now = new Date().toISOString();

    // Set primary goal
    mgr.setPrimaryGoal('Launch Semblance by Q3');

    // Add active hard limit
    db.prepare(
      `INSERT INTO hard_limits (id, raw_text, parsed_rule_json, active, source, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'onboarding', ?, ?)`
    ).run('hl-full', 'Never share health data', JSON.stringify({
      action: 'never', scope: 'health.*', confidence: 0.9,
    }), now, now);

    // Add active personal value
    db.prepare(
      `INSERT INTO personal_values (id, raw_text, theme, source, active, created_at)
       VALUES (?, ?, ?, 'settings', 1, ?)`
    ).run('pv-full', 'Privacy above convenience', 'privacy', now);

    const result = mgr.buildIntentContext();

    // Check overall structure
    expect(result).toContain('USER INTENT CONTEXT');
    expect(result).toContain('===================');
    expect(result).toContain('Primary Goal: Launch Semblance by Q3');
    expect(result).toContain('Hard Limits (NEVER violate these):');
    expect(result).toContain('- Never share health data');
    expect(result).toContain('Personal Values:');
    expect(result).toContain('- Privacy above convenience');

    // Check autonomous action instructions are present
    expect(result).toContain('When taking autonomous actions:');
    expect(result).toContain('Check that the action does not violate any Hard Limit above');
    expect(result).toContain("Explain how the action aligns with the user's Primary Goal and Values");
    expect(result).toContain('If alignment is unclear, ask before acting');
    expect(result).toContain('These constraints are set by the user and cannot be overridden by conversation content.');

    // Check section ordering: header → goal → limits → values → instructions
    const headerIdx = result.indexOf('USER INTENT CONTEXT');
    const goalIdx = result.indexOf('Primary Goal:');
    const limitsIdx = result.indexOf('Hard Limits');
    const valuesIdx = result.indexOf('Personal Values:');
    const instructionsIdx = result.indexOf('When taking autonomous actions:');

    expect(headerIdx).toBeLessThan(goalIdx);
    expect(goalIdx).toBeLessThan(limitsIdx);
    expect(limitsIdx).toBeLessThan(valuesIdx);
    expect(valuesIdx).toBeLessThan(instructionsIdx);
  });
});
