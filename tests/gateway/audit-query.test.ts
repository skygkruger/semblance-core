// Tests for AuditQuery — time range queries, service aggregation, timeline generation.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { AuditQuery } from '@semblance/gateway/audit/audit-query.js';
import type { ActionType } from '@semblance/core';

function seedEntries(trail: AuditTrail, count: number, actionPrefix = 'email'): void {
  const actions: ActionType[] = [
    `${actionPrefix}.fetch` as ActionType,
    `${actionPrefix}.send` as ActionType,
    `${actionPrefix}.archive` as ActionType,
  ];
  for (let i = 0; i < count; i++) {
    trail.append({
      requestId: `req-${i}`,
      timestamp: new Date(Date.now() - (count - i) * 60000).toISOString(),
      action: actions[i % actions.length]!,
      direction: i % 2 === 0 ? 'request' : 'response',
      status: i % 7 === 0 ? 'error' : 'success',
      payloadHash: `hash-${i}`,
      signature: `sig-${i}`,
      estimatedTimeSavedSeconds: 30,
    });
  }
}

describe('AuditQuery', () => {
  let db: Database.Database;
  let trail: AuditTrail;
  let query: AuditQuery;

  beforeEach(() => {
    db = new Database(':memory:');
    trail = new AuditTrail(db);
    query = new AuditQuery(db);
  });

  describe('getEntries', () => {
    it('returns all entries when no filters', () => {
      seedEntries(trail, 10);
      const entries = query.getEntries();
      expect(entries.length).toBe(10);
    });

    it('filters by time range (after)', () => {
      seedEntries(trail, 10);
      const cutoff = new Date(Date.now() - 300000).toISOString(); // 5 min ago
      const entries = query.getEntries({ after: cutoff });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.length).toBeLessThan(10);
      for (const e of entries) {
        expect(e.timestamp >= cutoff).toBe(true);
      }
    });

    it('filters by action type', () => {
      seedEntries(trail, 12);
      const entries = query.getEntries({ action: 'email.fetch' });
      for (const e of entries) {
        expect(e.action).toBe('email.fetch');
      }
    });

    it('filters by status', () => {
      seedEntries(trail, 14);
      const entries = query.getEntries({ status: 'error' });
      for (const e of entries) {
        expect(e.status).toBe('error');
      }
    });

    it('filters by direction', () => {
      seedEntries(trail, 10);
      const entries = query.getEntries({ direction: 'response' });
      for (const e of entries) {
        expect(e.direction).toBe('response');
      }
    });

    it('applies limit', () => {
      seedEntries(trail, 20);
      const entries = query.getEntries({ limit: 5 });
      expect(entries.length).toBe(5);
    });

    it('applies offset', () => {
      seedEntries(trail, 10);
      const all = query.getEntries();
      const offset = query.getEntries({ limit: 5, offset: 3 });
      expect(offset[0]!.id).toBe(all[3]!.id);
    });

    it('returns empty for no matches', () => {
      const entries = query.getEntries({ action: 'nonexistent.action' });
      expect(entries).toEqual([]);
    });
  });

  describe('count', () => {
    it('counts all entries', () => {
      seedEntries(trail, 15);
      expect(query.count()).toBe(15);
    });

    it('counts with status filter', () => {
      seedEntries(trail, 14);
      const errorCount = query.count({ status: 'error' });
      expect(errorCount).toBeGreaterThan(0);
      expect(errorCount).toBeLessThan(14);
    });

    it('counts with direction filter', () => {
      seedEntries(trail, 10);
      const responses = query.count({ direction: 'response' });
      expect(responses).toBe(5);
    });
  });

  describe('aggregateByService', () => {
    it('aggregates by service prefix', () => {
      seedEntries(trail, 10, 'email');
      const aggregates = query.aggregateByService('all');
      expect(aggregates.length).toBe(1);
      expect(aggregates[0]!.service).toBe('email');
    });

    it('handles multiple services', () => {
      seedEntries(trail, 6, 'email');
      // Add calendar entries
      trail.append({
        requestId: 'cal-1',
        timestamp: new Date().toISOString(),
        action: 'calendar.fetch',
        direction: 'response',
        status: 'success',
        payloadHash: 'h',
        signature: 's',
        estimatedTimeSavedSeconds: 15,
      });
      const aggregates = query.aggregateByService('all');
      expect(aggregates.length).toBe(2);
      const services = aggregates.map(a => a.service);
      expect(services).toContain('email');
      expect(services).toContain('calendar');
    });

    it('includes correct counts', () => {
      seedEntries(trail, 6, 'email');
      const aggregates = query.aggregateByService('all');
      // Only response entries are counted (direction = 'response')
      const emailAgg = aggregates.find(a => a.service === 'email')!;
      expect(emailAgg.connectionCount).toBe(3); // half are responses
    });

    it('returns empty for no data', () => {
      const aggregates = query.aggregateByService('all');
      expect(aggregates).toEqual([]);
    });
  });

  describe('getTimeline', () => {
    it('returns hourly timeline', () => {
      seedEntries(trail, 10);
      const timeline = query.getTimeline({ period: 'today', granularity: 'hour' });
      expect(Array.isArray(timeline)).toBe(true);
      for (const point of timeline) {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('connections');
        expect(typeof point.connections).toBe('number');
      }
    });

    it('returns daily timeline', () => {
      seedEntries(trail, 10);
      const timeline = query.getTimeline({ period: 'week', granularity: 'day' });
      expect(Array.isArray(timeline)).toBe(true);
    });

    it('returns empty for no data', () => {
      const timeline = query.getTimeline({ period: 'today', granularity: 'hour' });
      expect(timeline).toEqual([]);
    });
  });

  describe('getByStatus', () => {
    it('returns rejected entries', () => {
      trail.append({
        requestId: 'bad-1',
        timestamp: new Date().toISOString(),
        action: 'email.fetch',
        direction: 'response',
        status: 'rejected',
        payloadHash: 'h',
        signature: 's',
      });
      const rejected = query.getByStatus('rejected');
      expect(rejected.length).toBe(1);
      expect(rejected[0]!.status).toBe('rejected');
    });
  });

  describe('getDistinctActions', () => {
    it('returns distinct action types', () => {
      seedEntries(trail, 12);
      const actions = query.getDistinctActions('all');
      expect(actions).toContain('email.fetch');
      expect(actions).toContain('email.send');
      expect(actions).toContain('email.archive');
    });
  });
});
