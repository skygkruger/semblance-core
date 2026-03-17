import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PreferenceGraph } from '../../packages/core/agent/preference-graph.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

describe('Sprint E — Preference Graph', () => {
  let db: Database.Database;
  let graph: PreferenceGraph;

  beforeEach(() => {
    db = new Database(':memory:');
    graph = new PreferenceGraph(db as unknown as DatabaseHandle);
  });

  describe('recordSignal', () => {
    it('creates a new preference node from a signal', () => {
      graph.recordSignal({
        domain: 'email',
        pattern: 'responds to accountant within 1 hour',
        confidence: 0.7,
        evidence: { contactId: 'ct_123' },
      });

      const prefs = graph.getPreferences('email');
      expect(prefs).toHaveLength(1);
      expect(prefs[0]!.pattern).toBe('responds to accountant within 1 hour');
      expect(prefs[0]!.confidence).toBe(0.7);
      expect(prefs[0]!.evidenceCount).toBe(1);
    });

    it('applies exponential moving average on repeated signals', () => {
      // Record initial signal
      graph.recordSignal({
        domain: 'email',
        pattern: 'responds quickly',
        confidence: 0.7,
        evidence: {},
      });

      // Record confirming signal
      graph.recordSignal({
        domain: 'email',
        pattern: 'responds quickly',
        confidence: 0.9,
        evidence: {},
      });

      const prefs = graph.getPreferences('email');
      expect(prefs).toHaveLength(1);
      // EMA: 0.7 * 0.9 + 0.9 * 0.1 = 0.63 + 0.09 = 0.72
      expect(prefs[0]!.confidence).toBeCloseTo(0.72, 2);
      expect(prefs[0]!.evidenceCount).toBe(2);
    });

    it('does not update overridden preferences', () => {
      graph.recordSignal({
        domain: 'email',
        pattern: 'test pattern',
        confidence: 0.5,
        evidence: {},
      });

      const prefs = graph.getPreferences('email');
      graph.confirmPreference(prefs[0]!.id);

      // Now try to update — should be ignored
      graph.recordSignal({
        domain: 'email',
        pattern: 'test pattern',
        confidence: 0.1,
        evidence: {},
      });

      const updated = graph.getPreferences('email');
      expect(updated[0]!.confidence).toBe(1.0); // Still confirmed
    });
  });

  describe('shouldAutoApprove', () => {
    it('returns null for low-confidence preferences', () => {
      graph.recordSignal({
        domain: 'email',
        pattern: 'low confidence',
        actionType: 'email.send',
        confidence: 0.3,
        evidence: {},
      });

      const result = graph.shouldAutoApprove('email.send', {});
      expect(result).toBeNull();
    });

    it('returns preference node for high-confidence preferences', () => {
      graph.recordSignal({
        domain: 'email',
        pattern: 'auto send',
        actionType: 'email.send',
        confidence: 0.9,
        evidence: {},
      });

      const result = graph.shouldAutoApprove('email.send', {});
      expect(result).not.toBeNull();
      expect(result!.pattern).toBe('auto send');
    });

    it('does not return denied preferences', () => {
      graph.recordSignal({
        domain: 'email',
        pattern: 'denied pattern',
        actionType: 'email.send',
        confidence: 0.95,
        evidence: {},
      });

      const prefs = graph.getPreferences('email');
      graph.denyPreference(prefs[0]!.id);

      const result = graph.shouldAutoApprove('email.send', {});
      expect(result).toBeNull();
    });
  });

  describe('confirmPreference / denyPreference', () => {
    it('confirmPreference sets confidence to 1.0 and override to true', () => {
      graph.recordSignal({
        domain: 'email',
        pattern: 'confirm test',
        confidence: 0.6,
        evidence: {},
      });

      const prefs = graph.getPreferences('email');
      graph.confirmPreference(prefs[0]!.id);

      const updated = graph.getPreferences('email');
      expect(updated[0]!.confidence).toBe(1.0);
      expect(updated[0]!.override).toBe(true);
    });

    it('denyPreference tombstones the preference', () => {
      graph.recordSignal({
        domain: 'email',
        pattern: 'deny test',
        confidence: 0.8,
        evidence: {},
      });

      const prefs = graph.getPreferences('email');
      graph.denyPreference(prefs[0]!.id);

      // Denied preference should not appear in normal queries
      const updated = graph.getPreferences('email');
      expect(updated).toHaveLength(0);
    });
  });

  describe('getHighConfidencePreferences', () => {
    it('returns only preferences with confidence >= 0.85', () => {
      graph.recordSignal({ domain: 'email', pattern: 'low', confidence: 0.5, evidence: {} });
      graph.recordSignal({ domain: 'email', pattern: 'high', confidence: 0.9, evidence: {} });

      const highConf = graph.getHighConfidencePreferences();
      expect(highConf).toHaveLength(1);
      expect(highConf[0]!.pattern).toBe('high');
    });
  });
});
