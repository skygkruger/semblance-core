import { describe, it, expect, beforeEach } from 'vitest';
import { SpeculativeLoader } from '../../packages/core/agent/speculative-loader.js';

describe('Sprint E — Speculative Loader', () => {
  let loader: SpeculativeLoader;

  beforeEach(() => {
    loader = new SpeculativeLoader();
  });

  describe('get/set', () => {
    it('stores and retrieves a cache entry', () => {
      loader.set('meeting:123', { brief: 'test' }, 60_000);
      const entry = loader.get('meeting:123');
      expect(entry).not.toBeNull();
      expect(entry!.contextData).toEqual({ brief: 'test' });
      expect(entry!.hitCount).toBe(1);
    });

    it('returns null for missing keys', () => {
      expect(loader.get('nonexistent')).toBeNull();
    });

    it('returns null for expired entries', () => {
      loader.set('expired', { data: 'old' }, 1); // 1ms TTL
      // Wait for expiry
      const start = Date.now();
      while (Date.now() - start < 5) { /* busy wait */ }
      expect(loader.get('expired')).toBeNull();
    });

    it('increments hitCount on each get', () => {
      loader.set('test', { data: 'val' }, 60_000);
      loader.get('test');
      loader.get('test');
      const entry = loader.get('test');
      expect(entry!.hitCount).toBe(3);
    });
  });

  describe('pruneExpired', () => {
    it('removes expired entries', () => {
      loader.set('valid', { data: 'good' }, 60_000);
      loader.set('expired', { data: 'old' }, 1);
      const start = Date.now();
      while (Date.now() - start < 5) { /* busy wait */ }

      const pruned = loader.pruneExpired();
      expect(pruned).toBe(1);
      expect(loader.get('valid')).not.toBeNull();
      expect(loader.get('expired')).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('returns correct entry count', () => {
      loader.set('a', {}, 60_000);
      loader.set('b', {}, 60_000);
      const status = loader.getStatus();
      expect(status.entries).toBe(2);
    });

    it('calculates hit rate', () => {
      loader.set('a', {}, 60_000);
      loader.get('a');
      loader.get('a');
      const status = loader.getStatus();
      expect(status.hitRate).toBe(2); // 2 hits / 1 entry
    });

    it('reports no entries correctly', () => {
      const status = loader.getStatus();
      expect(status.entries).toBe(0);
      expect(status.hitRate).toBe(0);
      expect(status.oldestEntryAge).toBe('none');
    });
  });

  describe('runPreloadPass', () => {
    it('creates entries from pre-load triggers', async () => {
      const result = await loader.runPreloadPass({
        getUpcomingMeetings: () => [
          { eventId: 'evt1', title: 'Standup', startTime: new Date(Date.now() + 30 * 60_000).toISOString(), attendees: ['a@b.com'] },
        ],
        assembleMeetingBrief: async (eventId) => ({ eventId, prepared: true }),
        assembleMorningBrief: async () => ({ briefReady: true }),
        getHighRelationshipSenders: () => [],
        assembleRelationshipContext: async () => ({}),
      });

      expect(result.entriesCreated).toBeGreaterThanOrEqual(2); // meeting + morning brief
      expect(result.totalEntries).toBeGreaterThanOrEqual(2);
      expect(loader.get('meeting:evt1')).not.toBeNull();
    });
  });

  describe('clear', () => {
    it('clears all entries', () => {
      loader.set('a', {}, 60_000);
      loader.set('b', {}, 60_000);
      loader.clear();
      expect(loader.getStatus().entries).toBe(0);
    });
  });
});
