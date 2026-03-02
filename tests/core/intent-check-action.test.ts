// IntentManager.checkAction() — Unit tests for synchronous hard limit enforcement.
//
// Tests verify scope matching (exact, wildcard, 'any'), target matching
// (string values, nested objects, case-insensitive), inactive/unparsed skipping,
// and result structure (allowed, matchedLimits, reasoning).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { IntentManager } from '@semblance/core/agent/intent-manager.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import type { ParsedRule } from '@semblance/core/agent/intent-types.js';

let db: Database.Database;
let manager: IntentManager;

/** Insert a hard limit row with a pre-built ParsedRule (bypasses LLM parsing). */
function insertLimit(
  id: string,
  rawText: string,
  parsedRule: ParsedRule,
  active: boolean = true,
  source: 'onboarding' | 'settings' | 'chat' = 'settings',
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO hard_limits (id, raw_text, parsed_rule_json, active, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, rawText, JSON.stringify(parsedRule), active ? 1 : 0, source, now, now);
}

beforeEach(() => {
  db = new Database(':memory:');
  manager = new IntentManager({ db: db as unknown as DatabaseHandle });
});

afterEach(() => {
  db.close();
});

// ─── checkAction — basic allow / block ─────────────────────────────────────

describe('IntentManager.checkAction()', () => {
  it('returns allowed:true when no limits exist', () => {
    const result = manager.checkAction('email.send', { to: ['alice@example.com'], subject: 'Hello' });

    expect(result.allowed).toBe(true);
    expect(result.matchedLimits).toEqual([]);
    expect(result.alignmentScore).toBe(1);
    expect(result.reasoning).toBe('');
  });

  it('returns allowed:true when no active limits exist', () => {
    // Insert a limit but set it inactive
    insertLimit('lim-1', 'Never send emails', {
      action: 'never',
      scope: 'email.send',
      confidence: 0.9,
    }, false);

    const result = manager.checkAction('email.send', { to: ['bob@example.com'] });

    expect(result.allowed).toBe(true);
    expect(result.matchedLimits).toHaveLength(0);
  });

  // ─── Scope matching ────────────────────────────────────────────────────

  it('blocks exact scope match (scope="email.send", action="email.send")', () => {
    insertLimit('lim-exact', 'Never send emails automatically', {
      action: 'never',
      scope: 'email.send',
      confidence: 0.95,
    });

    const result = manager.checkAction('email.send', { to: ['someone@example.com'] });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
    expect(result.matchedLimits[0]!.id).toBe('lim-exact');
    expect(result.hardLimitTriggered).toBeDefined();
    expect(result.hardLimitTriggered!.id).toBe('lim-exact');
  });

  it('blocks wildcard scope (scope="email.*", action="email.send")', () => {
    insertLimit('lim-wildcard', 'Never do anything with email', {
      action: 'never',
      scope: 'email.*',
      confidence: 0.85,
    });

    const result = manager.checkAction('email.send', { to: ['test@example.com'] });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
    expect(result.matchedLimits[0]!.id).toBe('lim-wildcard');
  });

  it('does not block unrelated scope (scope="email.send", action="calendar.create")', () => {
    insertLimit('lim-email', 'Never send emails', {
      action: 'never',
      scope: 'email.send',
      confidence: 0.9,
    });

    const result = manager.checkAction('calendar.create', { title: 'Team standup' });

    expect(result.allowed).toBe(true);
    expect(result.matchedLimits).toHaveLength(0);
  });

  it('blocks "any" scope for all actions', () => {
    insertLimit('lim-any', 'Never do anything involving crypto', {
      action: 'never',
      scope: 'any',
      target: 'crypto',
      category: 'topic',
      confidence: 0.88,
    });

    const result = manager.checkAction('finance.fetch_transactions', {
      account: 'checking',
      memo: 'Crypto exchange deposit',
    });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
    expect(result.matchedLimits[0]!.id).toBe('lim-any');
  });

  // ─── Target matching ───────────────────────────────────────────────────

  it('matches target in payload string values', () => {
    insertLimit('lim-target', 'Never email my ex', {
      action: 'never',
      scope: 'email.send',
      target: 'my ex',
      category: 'person',
      confidence: 0.92,
    });

    const result = manager.checkAction('email.send', {
      to: ['ex@example.com'],
      subject: 'Message to my ex about logistics',
    });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
  });

  it('matches target in nested payload values', () => {
    insertLimit('lim-nested', 'Never discuss crypto', {
      action: 'never',
      scope: 'email.send',
      target: 'crypto',
      category: 'topic',
      confidence: 0.87,
    });

    const result = manager.checkAction('email.send', {
      to: ['bob@example.com'],
      metadata: {
        tags: ['finance', 'crypto-trading'],
        priority: 'high',
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
    expect(result.matchedLimits[0]!.id).toBe('lim-nested');
  });

  it('is case-insensitive for target matching', () => {
    insertLimit('lim-case', 'Never interact with ToxicCorp', {
      action: 'never',
      scope: 'email.send',
      target: 'ToxicCorp',
      category: 'person',
      confidence: 0.9,
    });

    const result = manager.checkAction('email.send', {
      to: ['info@toxiccorp.com'],
      body: 'Partnership with TOXICCORP International',
    });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
  });

  // ─── Multiple limits ───────────────────────────────────────────────────

  it('returns all matching limits in matchedLimits array', () => {
    insertLimit('lim-a', 'No emails', {
      action: 'never',
      scope: 'email.send',
      confidence: 0.9,
    });
    insertLimit('lim-b', 'No emails involving crypto', {
      action: 'never',
      scope: 'email.*',
      target: 'crypto',
      category: 'topic',
      confidence: 0.85,
    });

    const result = manager.checkAction('email.send', {
      subject: 'Buy crypto now',
    });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(2);
    const ids = result.matchedLimits.map(l => l.id);
    expect(ids).toContain('lim-a');
    expect(ids).toContain('lim-b');
    // hardLimitTriggered is the first match
    expect(result.hardLimitTriggered!.id).toBe('lim-a');
  });

  // ─── Skipping logic ────────────────────────────────────────────────────

  it('skips inactive limits', () => {
    insertLimit('lim-inactive', 'Never send emails', {
      action: 'never',
      scope: 'email.send',
      confidence: 0.9,
    }, false); // inactive

    insertLimit('lim-active', 'Always ask before calendar changes', {
      action: 'always_ask',
      scope: 'calendar.create',
      confidence: 0.88,
    }, true); // active

    const emailResult = manager.checkAction('email.send', { to: ['x@test.com'] });
    expect(emailResult.allowed).toBe(true);

    const calendarResult = manager.checkAction('calendar.create', { title: 'Meeting' });
    expect(calendarResult.allowed).toBe(false);
  });

  it('skips unparsed limits (confidence=0 with empty scope)', () => {
    insertLimit('lim-unparsed', 'Something vague the LLM could not parse', {
      action: 'never',
      scope: '',
      confidence: 0,
    });

    const result = manager.checkAction('email.send', { to: ['anyone@example.com'] });

    expect(result.allowed).toBe(true);
    expect(result.matchedLimits).toHaveLength(0);
  });

  // ─── always_ask action ─────────────────────────────────────────────────

  it('with "always_ask" action returns allowed:false', () => {
    insertLimit('lim-ask', 'Always ask before sending emails', {
      action: 'always_ask',
      scope: 'email.send',
      confidence: 0.95,
    });

    const result = manager.checkAction('email.send', { to: ['colleague@work.com'] });

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
    expect(result.matchedLimits[0]!.parsedRule.action).toBe('always_ask');
  });

  // ─── Reasoning string ──────────────────────────────────────────────────

  it('returns reasoning string when blocked', () => {
    insertLimit('lim-reason', 'Never touch my retirement accounts', {
      action: 'never',
      scope: 'finance.*',
      target: 'retirement',
      category: 'topic',
      confidence: 0.91,
    });

    const result = manager.checkAction('finance.fetch_transactions', {
      account: 'retirement-401k',
    });

    expect(result.allowed).toBe(false);
    expect(result.reasoning).toContain('Blocked by hard limit');
    expect(result.reasoning).toContain('Never touch my retirement accounts');
    expect(result.alignmentScore).toBe(0);
  });

  // ─── Empty payload ─────────────────────────────────────────────────────

  it('with empty payload still matches on scope-only limits', () => {
    insertLimit('lim-scope-only', 'Never fetch health data', {
      action: 'never',
      scope: 'health.fetch',
      confidence: 0.93,
    });

    const result = manager.checkAction('health.fetch', {});

    expect(result.allowed).toBe(false);
    expect(result.matchedLimits).toHaveLength(1);
    expect(result.matchedLimits[0]!.id).toBe('lim-scope-only');
  });
});
