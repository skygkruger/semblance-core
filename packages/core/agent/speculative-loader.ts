// Speculative Context Pre-Loading — Assembles answers before the user asks.
//
// Cloud AI bills per token and cannot pre-load context speculatively.
// Local AI costs nothing per inference token. This asymmetry enables
// assembling the answer before the user asks the question.
//
// In-memory only — not persisted to disk. Rebuilt on each daemon start.
// TTL varies by trigger type.
//
// CRITICAL: This file is in packages/core/. No network imports.

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SpeculativeEntry {
  key: string;
  contextData: Record<string, unknown>;
  assembledAt: string;
  ttlMs: number;
  hitCount: number;
}

export interface PreloadResult {
  entriesCreated: number;
  entriesPruned: number;
  totalEntries: number;
}

export interface SpeculativeLoaderDeps {
  getUpcomingMeetings: (minutesAhead: number) => Array<{ eventId: string; title: string; startTime: string; attendees: string[] }>;
  assembleMeetingBrief: (eventId: string) => Promise<Record<string, unknown>>;
  assembleMorningBrief: () => Promise<Record<string, unknown>>;
  getHighRelationshipSenders: () => Array<{ senderId: string; name: string }>;
  assembleRelationshipContext: (senderId: string) => Promise<Record<string, unknown>>;
}

// ─── TTL Constants ─────────────────────────────────────────────────────────────

const TTL_MEETING_PREP = 2 * 60 * 60 * 1000;   // 2 hours
const TTL_MORNING_BRIEF = 4 * 60 * 60 * 1000;   // 4 hours
const TTL_EMAIL_CONTEXT = 30 * 60 * 1000;        // 30 minutes

// ─── Speculative Loader ────────────────────────────────────────────────────────

export class SpeculativeLoader {
  private cache: Map<string, SpeculativeEntry> = new Map();

  /**
   * Check the cache for a pre-assembled context entry.
   * Returns null if not found or expired.
   */
  get(key: string): SpeculativeEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    const age = Date.now() - new Date(entry.assembledAt).getTime();
    if (age > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.hitCount++;
    return entry;
  }

  /**
   * Store a pre-assembled context entry.
   */
  set(key: string, data: Record<string, unknown>, ttlMs: number): void {
    this.cache.set(key, {
      key,
      contextData: data,
      assembledAt: new Date().toISOString(),
      ttlMs,
      hitCount: 0,
    });
  }

  /**
   * Run the speculative pre-load pass.
   * Called by the daemon's background scheduler — low CPU priority, non-blocking.
   */
  async runPreloadPass(deps: SpeculativeLoaderDeps): Promise<PreloadResult> {
    let entriesCreated = 0;

    // Pre-load meeting briefs for events starting within 45 minutes
    try {
      const upcomingMeetings = deps.getUpcomingMeetings(45);
      for (const meeting of upcomingMeetings) {
        const cacheKey = `meeting:${meeting.eventId}`;
        if (!this.cache.has(cacheKey)) {
          try {
            const brief = await deps.assembleMeetingBrief(meeting.eventId);
            this.set(cacheKey, brief, TTL_MEETING_PREP);
            entriesCreated++;
          } catch (e) {
            console.error(`[SpeculativeLoader] Failed to pre-load meeting brief for ${meeting.eventId}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('[SpeculativeLoader] Meeting pre-load failed:', e);
    }

    // Pre-load morning brief (for the morning-brief-preload cron job at 5am)
    try {
      const today = new Date().toISOString().split('T')[0];
      const briefKey = `morning_brief:${today}`;
      if (!this.cache.has(briefKey)) {
        const brief = await deps.assembleMorningBrief();
        this.set(briefKey, brief, TTL_MORNING_BRIEF);
        entriesCreated++;
      }
    } catch (e) {
      console.error('[SpeculativeLoader] Morning brief pre-load failed:', e);
    }

    // Pre-load relationship context for high-relationship contacts
    try {
      const senders = deps.getHighRelationshipSenders();
      for (const sender of senders.slice(0, 5)) { // top 5 only
        const cacheKey = `email:sender:${sender.senderId}`;
        if (!this.cache.has(cacheKey)) {
          try {
            const context = await deps.assembleRelationshipContext(sender.senderId);
            this.set(cacheKey, context, TTL_EMAIL_CONTEXT);
            entriesCreated++;
          } catch {
            // Skip individual failures
          }
        }
      }
    } catch (e) {
      console.error('[SpeculativeLoader] Relationship pre-load failed:', e);
    }

    // Prune expired entries
    const entriesPruned = this.pruneExpired();

    return {
      entriesCreated,
      entriesPruned,
      totalEntries: this.cache.size,
    };
  }

  /**
   * Clear all expired entries. Returns count of pruned entries.
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      const age = now - new Date(entry.assembledAt).getTime();
      if (age > entry.ttlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache status for monitoring.
   */
  getStatus(): { entries: number; hitRate: number; oldestEntryAge: string } {
    let totalHits = 0;
    let totalEntries = 0;
    let oldestAge = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      totalEntries++;
      totalHits += entry.hitCount;
      const age = now - new Date(entry.assembledAt).getTime();
      if (age > oldestAge) oldestAge = age;
    }

    const hitRate = totalEntries > 0 ? totalHits / totalEntries : 0;
    const oldestAgeStr = totalEntries > 0
      ? `${Math.round(oldestAge / 60000)}m`
      : 'none';

    return { entries: totalEntries, hitRate, oldestEntryAge: oldestAgeStr };
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }
}
