// Inbox Provider + Settings Sync Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchInbox, createEmptyDataSource } from '../../packages/mobile/src/data/inbox-provider.js';
import type { InboxDataSource } from '../../packages/mobile/src/data/inbox-provider.js';
import type { IndexedEmail, Reminder, AutonomousAction, WeeklyDigest } from '../../packages/mobile/src/data/inbox-adapter.js';
import { SyncEngine } from '../../packages/core/routing/sync.js';
import type { SyncItem } from '../../packages/core/routing/sync.js';
import { syncPreferenceChange, syncAutonomyTierChange, syncDailyDigestPreferences } from '../../packages/core/routing/preferences-sync.js';

// ─── Inbox Provider Tests ──────────────────────────────────────────────

function makeEmail(overrides: Partial<IndexedEmail> = {}): IndexedEmail {
  return {
    id: overrides.id ?? 'e1',
    messageId: overrides.messageId ?? 'msg-1',
    from: overrides.from ?? 'alice@example.com',
    subject: overrides.subject ?? 'Test Subject',
    snippet: overrides.snippet ?? 'Hello there...',
    receivedAt: overrides.receivedAt ?? new Date().toISOString(),
    category: overrides.category ?? 'primary',
    priority: overrides.priority ?? 'normal',
    isRead: overrides.isRead ?? false,
  };
}

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: overrides.id ?? 'r1',
    text: overrides.text ?? 'Call dentist',
    dueAt: overrides.dueAt ?? new Date(Date.now() + 3600_000).toISOString(),
    status: overrides.status ?? 'pending',
  };
}

describe('fetchInbox', () => {
  it('returns real indexed emails when populated', async () => {
    const source: InboxDataSource = {
      getEmails: async () => [makeEmail({ id: 'e1' }), makeEmail({ id: 'e2' })],
      getReminders: async () => [],
      getRecentActions: async () => [],
      getLatestDigest: async () => null,
    };
    const result = await fetchInbox(source);
    expect(result.items.length).toBe(2);
    expect(result.emptyState).toBe('none');
    expect(result.items[0]!.type).toBe('email');
  });

  it('returns empty state (not mock data) when empty', async () => {
    const source = createEmptyDataSource();
    const result = await fetchInbox(source);
    expect(result.items).toEqual([]);
    expect(result.emptyState).toBe('connect_email');
  });

  it('merges emails, reminders, and actions', async () => {
    const source: InboxDataSource = {
      getEmails: async () => [makeEmail()],
      getReminders: async () => [makeReminder()],
      getRecentActions: async () => [{
        id: 'a1', action: 'email.send', description: 'Sent reply',
        timestamp: new Date().toISOString(), status: 'success',
        autonomyTier: 'partner',
      }],
      getLatestDigest: async () => null,
    };
    const result = await fetchInbox(source);
    expect(result.items.length).toBe(3);
    const types = result.items.map(i => i.type);
    expect(types).toContain('email');
    expect(types).toContain('reminder');
    expect(types).toContain('action');
  });

  it('includes digest when available', async () => {
    const digest: WeeklyDigest = {
      id: 'd1', weekStart: '2026-02-15', weekEnd: '2026-02-22',
      totalActions: 42, estimatedTimeSavedMinutes: 30,
      narrative: 'A productive week.',
    };
    const source: InboxDataSource = {
      getEmails: async () => [],
      getReminders: async () => [],
      getRecentActions: async () => [],
      getLatestDigest: async () => digest,
    };
    const result = await fetchInbox(source);
    expect(result.items.length).toBe(1);
    expect(result.items[0]!.type).toBe('digest');
    expect(result.emptyState).toBe('none');
  });

  it('triage categories from Core AI classification', async () => {
    const source: InboxDataSource = {
      getEmails: async () => [
        makeEmail({ id: 'e1', category: 'urgent' }),
        makeEmail({ id: 'e2', category: 'newsletter' }),
      ],
      getReminders: async () => [],
      getRecentActions: async () => [],
      getLatestDigest: async () => null,
    };
    const result = await fetchInbox(source);
    expect(result.items[0]!.category).toBeDefined();
  });
});

// ─── Settings Sync Tests ──────────────────────────────────────────────

describe('Settings sync via SyncEngine', () => {
  let mobileSync: SyncEngine;
  let desktopSync: SyncEngine;

  beforeEach(() => {
    mobileSync = new SyncEngine({ deviceId: 'mobile-1', deviceType: 'mobile' });
    desktopSync = new SyncEngine({ deviceId: 'desktop-1', deviceType: 'desktop' });
  });

  it('settings change on mobile → sync payload includes it', () => {
    const prefItem: SyncItem = {
      id: 'pref-autonomy-email',
      type: 'preference',
      data: { domain: 'email', tier: 'alter_ego' },
      updatedAt: new Date().toISOString(),
      sourceDeviceId: 'mobile-1',
    };
    mobileSync.upsertItem(prefItem);

    const manifest = mobileSync.buildManifest('desktop-1', 'Mobile');
    expect(manifest.items.length).toBe(1);
    expect(manifest.items[0]!.type).toBe('preference');
    expect((manifest.items[0]!.data as { tier: string }).tier).toBe('alter_ego');
  });

  it('receive newer settings → local updated', () => {
    const oldItem: SyncItem = {
      id: 'pref-theme',
      type: 'preference',
      data: { theme: 'light' },
      updatedAt: '2026-02-20T10:00:00Z',
      sourceDeviceId: 'mobile-1',
    };
    mobileSync.upsertItem(oldItem);

    const newerItem: SyncItem = {
      id: 'pref-theme',
      type: 'preference',
      data: { theme: 'dark' },
      updatedAt: '2026-02-21T10:00:00Z',
      sourceDeviceId: 'desktop-1',
    };

    const result = mobileSync.applyManifest({
      deviceId: 'desktop-1', deviceName: 'Desktop',
      lastSyncAt: null, items: [newerItem], protocolVersion: 1,
    }, 'desktop');

    expect(result.accepted).toBe(1);
    const items = mobileSync.getItemsByType('preference');
    expect((items[0]!.data as { theme: string }).theme).toBe('dark');
  });

  it('receive older settings → local preserved', () => {
    const newItem: SyncItem = {
      id: 'pref-theme',
      type: 'preference',
      data: { theme: 'dark' },
      updatedAt: '2026-02-21T10:00:00Z',
      sourceDeviceId: 'mobile-1',
    };
    mobileSync.upsertItem(newItem);

    const olderItem: SyncItem = {
      id: 'pref-theme',
      type: 'preference',
      data: { theme: 'light' },
      updatedAt: '2026-02-20T10:00:00Z',
      sourceDeviceId: 'desktop-1',
    };

    const result = mobileSync.applyManifest({
      deviceId: 'desktop-1', deviceName: 'Desktop',
      lastSyncAt: null, items: [olderItem], protocolVersion: 1,
    }, 'desktop');

    expect(result.rejected).toBe(1);
    const items = mobileSync.getItemsByType('preference');
    expect((items[0]!.data as { theme: string }).theme).toBe('dark');
  });

  it('style profile sync: desktop wins', () => {
    const mobileProfile: SyncItem = {
      id: 'style-profile',
      type: 'style_profile',
      data: { source: 'mobile' },
      updatedAt: '2026-02-22T10:00:00Z', // Even if newer
      sourceDeviceId: 'mobile-1',
    };
    mobileSync.upsertItem(mobileProfile);

    const desktopProfile: SyncItem = {
      id: 'style-profile',
      type: 'style_profile',
      data: { source: 'desktop' },
      updatedAt: '2026-02-20T10:00:00Z', // Older but desktop wins
      sourceDeviceId: 'desktop-1',
    };

    const result = mobileSync.applyManifest({
      deviceId: 'desktop-1', deviceName: 'Desktop',
      lastSyncAt: null, items: [desktopProfile], protocolVersion: 1,
    }, 'desktop');

    expect(result.accepted).toBe(1);
    const items = mobileSync.getItemsByType('style_profile');
    expect((items[0]!.data as { source: string }).source).toBe('desktop');
  });
});

// ─── Preferences Sync Wiring Tests ──────────────────────────────────

describe('Preferences sync wiring — syncPreferenceChange triggers SyncEngine.upsertItem', () => {
  let syncEngine: SyncEngine;

  beforeEach(() => {
    syncEngine = new SyncEngine({ deviceId: 'test-device', deviceType: 'desktop' });
  });

  it('syncPreferenceChange pushes preference to SyncEngine', () => {
    syncPreferenceChange(syncEngine, 'test-device', 'daily_digest_prefs', {
      enabled: true,
      time: '09:00',
    });

    const items = syncEngine.getItemsByType('preference');
    expect(items.length).toBe(1);
    expect(items[0]!.id).toBe('pref-daily_digest_prefs');
    expect((items[0]!.data as { key: string }).key).toBe('daily_digest_prefs');
    expect((items[0]!.data as { value: { enabled: boolean } }).value.enabled).toBe(true);
  });

  it('syncAutonomyTierChange pushes domain tier to SyncEngine', () => {
    syncAutonomyTierChange(syncEngine, 'test-device', 'email', 'alter_ego');

    const items = syncEngine.getItemsByType('preference');
    expect(items.length).toBe(1);
    expect(items[0]!.id).toBe('pref-domain_config');
    const data = items[0]!.data as { key: string; value: { domain: string; tier: string } };
    expect(data.value.domain).toBe('email');
    expect(data.value.tier).toBe('alter_ego');
  });

  it('syncDailyDigestPreferences pushes digest prefs to SyncEngine', () => {
    syncDailyDigestPreferences(syncEngine, 'test-device', {
      enabled: false,
      time: '20:00',
    });

    const items = syncEngine.getItemsByType('preference');
    expect(items.length).toBe(1);
    const data = items[0]!.data as { key: string; value: { enabled: boolean; time: string } };
    expect(data.key).toBe('daily_digest_prefs');
    expect(data.value.enabled).toBe(false);
    expect(data.value.time).toBe('20:00');
  });

  it('preference change appears in sync manifest', () => {
    syncPreferenceChange(syncEngine, 'test-device', 'notification_prefs', {
      pushEnabled: true,
    });

    const manifest = syncEngine.buildManifest('other-device', 'Test');
    expect(manifest.items.length).toBe(1);
    expect(manifest.items[0]!.type).toBe('preference');
  });

  it('multiple preference changes all tracked', () => {
    syncAutonomyTierChange(syncEngine, 'test-device', 'email', 'partner');
    syncDailyDigestPreferences(syncEngine, 'test-device', { enabled: true, time: '08:00' });
    syncPreferenceChange(syncEngine, 'test-device', 'notification_prefs', { push: true });

    const items = syncEngine.getItemsByType('preference');
    expect(items.length).toBe(3);
  });
});

// ─── TabNavigator Inbox Wiring Tests ────────────────────────────────

describe('TabNavigator inbox provider wiring', () => {
  it('InboxScreen receives data from inbox-provider when Core has indexed emails', async () => {
    // Verify fetchInbox with a populated source returns items for InboxScreen
    const source: InboxDataSource = {
      getEmails: async () => [
        makeEmail({ id: 'e1', subject: 'Meeting tomorrow' }),
        makeEmail({ id: 'e2', subject: 'Invoice from vendor' }),
      ],
      getReminders: async () => [makeReminder({ id: 'r1', text: 'Call back' })],
      getRecentActions: async () => [],
      getLatestDigest: async () => null,
    };

    const result = await fetchInbox(source);
    // InboxScreen expects items?: InboxItem[] — verify the shape
    expect(result.items.length).toBe(3);
    expect(result.emptyState).toBe('none');

    // Every item has the fields InboxScreen needs
    for (const item of result.items) {
      expect(item.id).toBeDefined();
      expect(item.type).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.preview).toBeDefined();
      expect(item.timestamp).toBeDefined();
      expect(typeof item.read).toBe('boolean');
    }
  });

  it('createEmptyDataSource provides InboxScreen with empty state', async () => {
    const source = createEmptyDataSource();
    const result = await fetchInbox(source);
    expect(result.items).toEqual([]);
    expect(result.emptyState).toBe('connect_email');
  });
});
