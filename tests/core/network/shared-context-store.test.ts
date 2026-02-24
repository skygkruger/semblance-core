/**
 * Step 28 — SharedContextStore tests.
 * Verifies store/retrieve and hard delete for revocation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { NetworkConfigStore } from '@semblance/core/network/network-config-store';
import { SharedContextStore } from '@semblance/core/network/shared-context-store';

let db: InstanceType<typeof Database>;
let store: SharedContextStore;

beforeEach(() => {
  db = new Database(':memory:');
  // NetworkConfigStore creates the shared_context_cache table
  new NetworkConfigStore(db as unknown as DatabaseHandle);
  store = new SharedContextStore(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('SharedContextStore (Step 28)', () => {
  it('stores and retrieves peer context', () => {
    store.storeContext({
      peerId: 'peer-1',
      category: 'calendar-availability',
      summaryText: '5 events this week',
      structuredData: { busyBlocks: [{ start: '09:00', end: '10:00' }] },
    });

    const ctx = store.getContext('peer-1', 'calendar-availability');
    expect(ctx).not.toBeNull();
    expect(ctx!.summaryText).toBe('5 events this week');
    expect(ctx!.structuredData).toEqual({ busyBlocks: [{ start: '09:00', end: '10:00' }] });

    // Upsert — same peer+category overwrites
    store.storeContext({
      peerId: 'peer-1',
      category: 'calendar-availability',
      summaryText: '3 events this week (updated)',
    });

    const updated = store.getContext('peer-1', 'calendar-availability');
    expect(updated!.summaryText).toBe('3 events this week (updated)');

    // All context from peer
    store.storeContext({
      peerId: 'peer-1',
      category: 'communication-style',
      summaryText: 'Formal, direct',
    });

    const all = store.getContextFromPeer('peer-1');
    expect(all).toHaveLength(2);
  });

  it('hard deletes cached context on revocation', () => {
    store.storeContext({
      peerId: 'peer-1',
      category: 'calendar-availability',
      summaryText: 'Busy Mon-Wed',
    });
    store.storeContext({
      peerId: 'peer-1',
      category: 'communication-style',
      summaryText: 'Casual',
    });

    // Delete single category
    const deleted = store.deleteContextCategory('peer-1', 'calendar-availability');
    expect(deleted).toBe(true);
    expect(store.getContext('peer-1', 'calendar-availability')).toBeNull();
    expect(store.getContext('peer-1', 'communication-style')).not.toBeNull();

    // Delete all from peer (full relationship revocation)
    store.storeContext({
      peerId: 'peer-1',
      category: 'project-context',
      summaryText: '10 docs',
    });
    const count = store.deleteContextFromPeer('peer-1');
    expect(count).toBe(2); // communication-style + project-context
    expect(store.getContextFromPeer('peer-1')).toHaveLength(0);
  });
});
