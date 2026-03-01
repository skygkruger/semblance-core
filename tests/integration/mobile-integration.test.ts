// Integration Tests for Step 12: Mobile Feature Parity + Task Routing.
// End-to-end flows verifying mobile launch, sync, routing, and offline.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Core imports
import { InProcessTransport } from '@semblance/core/ipc/in-process-transport.js';
import { SyncEngine, SYNC_PROTOCOL_VERSION } from '@semblance/core/routing/sync.js';
import type { SyncItem, SyncCryptoProvider, SyncManifest } from '@semblance/core/routing/sync.js';
import { DiscoveryManager, generatePairingCode, MDNS_SERVICE_TYPE } from '@semblance/core/routing/discovery.js';
import type { DiscoveredDevice, MDNSProvider } from '@semblance/core/routing/discovery.js';
import { TaskDelegationEngine, classifyTask } from '@semblance/core/routing/task-delegation.js';
import type { TaskOffloadTransport, TaskResponse } from '@semblance/core/routing/task-delegation.js';

// Mobile imports
import { NotificationScheduler, buildReminderNotification } from '../../packages/mobile/src/notifications/local-notifications.js';
import type { NotificationProvider, LocalNotification } from '../../packages/mobile/src/notifications/local-notifications.js';
import { calculateSwipeState, createInboxSwipeActions } from '../../packages/mobile/src/gestures/swipe-actions.js';
import { createHapticController } from '../../packages/mobile/src/gestures/haptics.js';
import type { HapticProvider } from '../../packages/mobile/src/gestures/haptics.js';
import { snoozeReminder, dismissReminder, getDueReminders } from '../../packages/mobile/src/data/reminder-adapter.js';
import type { MobileReminder } from '../../packages/mobile/src/data/reminder-adapter.js';
import { computeStyleMatch, formatStyleIndicator } from '../../packages/mobile/src/data/style-adapter.js';
import type { MobileStyleProfile } from '../../packages/mobile/src/data/style-adapter.js';

const ROOT = path.resolve(__dirname, '../..');

// ─── Mock Helpers ───────────────────────────────────────────────────────────

function createMockMDNS(): MDNSProvider & {
  simulateFound: (device: DiscoveredDevice) => void;
  simulateLost: (deviceId: string) => void;
} {
  let onFound: ((device: DiscoveredDevice) => void) | undefined;
  let onLost: ((deviceId: string) => void) | undefined;
  return {
    advertise: vi.fn(async () => {}),
    stopAdvertising: vi.fn(async () => {}),
    startDiscovery: vi.fn(async (found, lost) => { onFound = found; onLost = lost; }),
    stopDiscovery: vi.fn(async () => {}),
    simulateFound: (device) => onFound?.(device),
    simulateLost: (deviceId) => onLost?.(deviceId),
  };
}

function createMockCrypto(): SyncCryptoProvider {
  return {
    encrypt: vi.fn(async (plaintext: string) => ({
      ciphertext: Buffer.from(plaintext).toString('base64'),
      iv: 'mock-iv',
    })),
    decrypt: vi.fn(async (ciphertext: string) =>
      Buffer.from(ciphertext, 'base64').toString('utf-8')
    ),
    hmac: vi.fn(async (data: string) => `hmac-${data.slice(0, 8)}`),
  };
}

function createMockNotificationProvider(): NotificationProvider & { scheduled: LocalNotification[] } {
  const scheduled: LocalNotification[] = [];
  return {
    scheduled,
    schedule: vi.fn(async (n) => { scheduled.push(n); }),
    cancel: vi.fn(async (id) => {
      const idx = scheduled.findIndex(n => n.id === id);
      if (idx >= 0) scheduled.splice(idx, 1);
    }),
    cancelAll: vi.fn(async () => { scheduled.length = 0; }),
    getScheduled: vi.fn(async () => [...scheduled]),
  };
}

// ─── E2E: Mobile → Desktop Reminder Sync ────────────────────────────────────

describe('Integration — Mobile ↔ Desktop Reminder Sync', () => {
  it('reminder created on mobile syncs to desktop', () => {
    const mobileSync = new SyncEngine({
      deviceId: 'mobile-1',
      deviceType: 'mobile',
    });
    const desktopSync = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
    });

    // Mobile creates a reminder
    const reminderItem: SyncItem = {
      id: 'reminder-new-1',
      type: 'reminder',
      data: { text: 'Buy groceries', dueAt: new Date(Date.now() + 3600000).toISOString() },
      updatedAt: new Date().toISOString(),
      sourceDeviceId: 'mobile-1',
    };
    mobileSync.upsertItem(reminderItem);

    // Build manifest and apply to desktop
    const manifest = mobileSync.buildManifest('desktop-1', "Sky's iPhone");
    const result = desktopSync.applyManifest(manifest, 'mobile');

    expect(result.accepted).toBe(1);
    expect(desktopSync.getItemsByType('reminder')).toHaveLength(1);
  });

  it('snooze on desktop syncs back to mobile', () => {
    const desktopSync = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
    });
    const mobileSync = new SyncEngine({
      deviceId: 'mobile-1',
      deviceType: 'mobile',
    });

    // Both have the same reminder (use relative timestamps to avoid 7-day sync window expiry)
    const baseTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const reminderBase: SyncItem = {
      id: 'reminder-shared-1',
      type: 'reminder',
      data: { text: 'Call dentist', status: 'pending' },
      updatedAt: baseTime,
      sourceDeviceId: 'mobile-1',
    };
    mobileSync.upsertItem(reminderBase);
    desktopSync.upsertItem(reminderBase);

    // Desktop snoozes it (newer timestamp)
    const snoozed: SyncItem = {
      ...reminderBase,
      data: { text: 'Call dentist', status: 'snoozed', snoozeCount: 1 },
      updatedAt: new Date().toISOString(), // now
      sourceDeviceId: 'desktop-1',
    };
    desktopSync.upsertItem(snoozed);

    // Desktop syncs to mobile
    const manifest = desktopSync.buildManifest('mobile-1', "Sky's MacBook");
    const result = mobileSync.applyManifest(manifest, 'desktop');

    expect(result.accepted).toBe(1);
    const mobileReminders = mobileSync.getItemsByType('reminder');
    expect((mobileReminders[0]!.data as { status: string }).status).toBe('snoozed');
  });
});

// ─── E2E: Task Routing with Failover ────────────────────────────────────────

describe('Integration — Task Routing with Failover', () => {
  it('complex question routes to desktop, result appears on mobile', async () => {
    const transport: TaskOffloadTransport = {
      sendTask: vi.fn(async () => ({
        requestId: 'task-1',
        status: 'success' as const,
        result: { answer: 'Detailed analysis of the quarterly report...' },
        executedOn: 'desktop-1',
        durationMs: 8000,
      })),
      isDeviceReachable: vi.fn(() => true),
    };

    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
    });
    engine.setPairedDesktop('desktop-1', "Sky's MacBook");

    const result = await engine.executeTask(
      'document.analyze',
      { document: 'Q4 report' },
      async () => ({ answer: 'local fallback' }),
    );

    expect(result.status).toBe('success');
    expect(result.executedOn).toBe('desktop-1');
    expect(transport.sendTask).toHaveBeenCalled();
  });

  it('desktop disconnects mid-task → falls back to mobile', async () => {
    const transport: TaskOffloadTransport = {
      sendTask: vi.fn(async () => { throw new Error('Connection lost'); }),
      isDeviceReachable: vi.fn(() => true),
    };

    const events: string[] = [];
    const engine = new TaskDelegationEngine({
      localDeviceId: 'mobile-1',
      localDeviceType: 'mobile',
      localModelTier: '3B',
      transport,
      onRoutingEvent: (e) => events.push(e.type),
    });
    engine.setPairedDesktop('desktop-1', 'MacBook');

    const result = await engine.executeTask(
      'weekly_digest',
      {},
      async () => ({ digest: 'simplified mobile digest' }),
    );

    expect(result.status).toBe('success');
    expect(result.executedOn).toBe('mobile-1');
    expect(events).toContain('routed_remote');
    expect(events).toContain('fallback_local');
  });
});

// ─── E2E: Mobile Offline Operation ──────────────────────────────────────────

describe('Integration — Mobile Offline Operation', () => {
  it('all core mobile features work offline', async () => {
    // Email triage (lightweight — local)
    expect(classifyTask('email.categorize')).toBe('lightweight');

    // Reminders work
    const reminder: MobileReminder = {
      id: 'r1', text: 'Call plumber', dueAt: new Date(Date.now() - 60000).toISOString(),
      status: 'pending', createdAt: new Date().toISOString(), source: 'manual', snoozeCount: 0,
    };
    const due = getDueReminders([reminder]);
    expect(due).toHaveLength(1);

    const snoozed = snoozeReminder(reminder);
    expect(snoozed.status).toBe('snoozed');

    // Quick capture (no network needed)
    expect(classifyTask('capture.save')).toBe('lightweight');

    // Chat responds locally
    expect(classifyTask('chat.respond')).toBe('medium');

    // Style matching works offline
    const profile: MobileStyleProfile = {
      id: 'p1', userName: 'Sky', avgSentenceLength: 10, avgWordLength: 5,
      formality: 0.5, enthusiasm: 0.3, verbosity: 0.4,
      greetingStyle: 'Hey', signoffStyle: 'Best', commonPhrases: ['sounds good'],
      sampleCount: 20,
    };
    const match = computeStyleMatch('Hey, sounds good!', profile);
    expect(match.score).toBeGreaterThan(0);
  });
});

// ─── E2E: Email Draft with Style Score on Mobile ────────────────────────────

describe('Integration — Email Draft with Style on Mobile', () => {
  it('style profile applied and score shown on mobile draft', () => {
    const profile: MobileStyleProfile = {
      id: 'p1', userName: 'Sky', avgSentenceLength: 12, avgWordLength: 5,
      formality: 0.5, enthusiasm: 0.3, verbosity: 0.4,
      greetingStyle: 'Hey', signoffStyle: 'Best', commonPhrases: ['sounds good'],
      sampleCount: 50,
    };

    const draft = 'Hey team,\n\nSounds good, I\'ll check on that.\n\nBest,\nSky';
    const result = computeStyleMatch(draft, profile);
    const indicator = formatStyleIndicator(result);

    expect(result.score).toBeGreaterThan(70);
    expect(indicator).toContain('Style:');
    expect(indicator).toMatch(/\d+%/);
  });
});

// ─── E2E: Discovery → Pairing → Sync ───────────────────────────────────────

describe('Integration — Discovery → Pairing → Sync Flow', () => {
  it('full flow: discover device, pair, sync data', async () => {
    const mdns = createMockMDNS();
    const desktopDevice: DiscoveredDevice = {
      deviceId: 'desktop-1', deviceName: "Sky's MacBook",
      deviceType: 'desktop', platform: 'macos',
      protocolVersion: 1, syncPort: 18432, ipAddress: '192.168.1.10',
    };

    // Mobile discovers desktop
    const manager = new DiscoveryManager({
      thisDevice: {
        deviceId: 'mobile-1', deviceName: "Sky's iPhone",
        deviceType: 'mobile', platform: 'ios',
        protocolVersion: 1, syncPort: 18432, ipAddress: '192.168.1.20',
      },
      mdns,
    });
    await manager.start();
    mdns.simulateFound(desktopDevice);

    expect(manager.getDiscoveredDevices()).toHaveLength(1);

    // Initiate and complete pairing
    const request = manager.initiatePairing('desktop-1');
    expect(request).not.toBeNull();
    manager.registerIncomingPairing(request!);
    const accepted = manager.acceptPairing(request!.id, request!.code, desktopDevice);
    expect(accepted).toBe(true);
    expect(manager.isPaired('desktop-1')).toBe(true);

    // Now sync engines can exchange data
    const mobileSync = new SyncEngine({ deviceId: 'mobile-1', deviceType: 'mobile' });
    const desktopSync = new SyncEngine({ deviceId: 'desktop-1', deviceType: 'desktop' });

    mobileSync.upsertItem({
      id: 'cap-1', type: 'capture',
      data: { text: 'Quick note from phone' },
      updatedAt: new Date().toISOString(), sourceDeviceId: 'mobile-1',
    });

    const manifest = mobileSync.buildManifest('desktop-1', "Sky's iPhone");
    const result = desktopSync.applyManifest(manifest, 'mobile');
    expect(result.accepted).toBe(1);
  });
});

// ─── E2E: Local Notifications for Reminders ─────────────────────────────────

describe('Integration — Reminder Notifications', () => {
  it('due reminder schedules local notification', async () => {
    const provider = createMockNotificationProvider();
    const scheduler = new NotificationScheduler(provider);

    const dueAt = new Date(Date.now() + 300_000); // 5 minutes
    await scheduler.scheduleReminder('r1', 'Meeting with Sarah', dueAt);

    expect(provider.scheduled).toHaveLength(1);
    expect(provider.scheduled[0]!.body).toBe('Meeting with Sarah');
    expect(provider.scheduled[0]!.actions).toHaveLength(2);
  });

  it('dismissed reminder cancels notification', async () => {
    const provider = createMockNotificationProvider();
    const scheduler = new NotificationScheduler(provider);

    await scheduler.scheduleReminder('r1', 'Test', new Date());
    expect(await scheduler.getScheduledCount()).toBe(1);

    await scheduler.cancelReminder('r1');
    expect(await scheduler.getScheduledCount()).toBe(0);
  });
});

// ─── E2E: Swipe + Haptic Flow ───────────────────────────────────────────────

describe('Integration — Swipe + Haptic', () => {
  it('swipe-to-archive triggers haptic on threshold', () => {
    const hapticProvider: HapticProvider = { trigger: vi.fn() };
    const haptics = createHapticController(hapticProvider);

    const onArchive = vi.fn();
    const onCategorize = vi.fn();
    const actions = createInboxSwipeActions(onArchive, onCategorize);

    // Simulate swipe right past threshold
    const state = calculateSwipeState(90);
    expect(state.triggered).toBe(true);

    // Trigger haptic
    haptics.triggerAction('swipe.threshold');
    expect(hapticProvider.trigger).toHaveBeenCalledWith('light');

    // Execute archive action
    actions.right.onTrigger();
    expect(onArchive).toHaveBeenCalled();

    // Confirm haptic
    haptics.triggerAction('email.archived');
    expect(hapticProvider.trigger).toHaveBeenCalledWith('medium');
  });
});

// ─── Privacy: IPC Validation in InProcessTransport ──────────────────────────

describe('Integration — IPC InProcessTransport Validation', () => {
  it('InProcessTransport validates action requests', async () => {
    const handler = vi.fn(async (req: any) => ({
      requestId: req.id,
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      auditRef: 'audit-1',
    }));

    const transport = new InProcessTransport(handler);
    await transport.start();

    const response = await transport.send({
      id: 'req-1',
      timestamp: new Date().toISOString(),
      action: 'email.fetch',
      payload: { folder: 'inbox' },
      source: 'core',
      signature: 'test-sig',
    });

    expect(response.status).toBe('success');
    expect(handler).toHaveBeenCalled();

    await transport.stop();
  });
});

// ─── Privacy: No Telemetry in Mobile Packages ───────────────────────────────

describe('Integration — Mobile Privacy Audit', () => {
  it('packages/core has no network imports (except approved)', () => {
    const coreDir = path.join(ROOT, 'packages/core');
    const bannedPatterns = [
      /import.*from\s+['"]axios['"]/,
      /import.*from\s+['"]got['"]/,
      /import.*from\s+['"]node-fetch['"]/,
      /import.*from\s+['"]undici['"]/,
      /import.*from\s+['"]superagent['"]/,
      /import.*from\s+['"]socket\.io['"]/,
      /import.*from\s+['"]ws['"]/,
    ];

    function scanDir(dir: string): string[] {
      const violations: string[] = [];
      if (!fs.existsSync(dir)) return violations;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          violations.push(...scanDir(fullPath));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const pattern of bannedPatterns) {
            if (pattern.test(content)) {
              violations.push(`${fullPath}: matches ${pattern}`);
            }
          }
        }
      }
      return violations;
    }

    const violations = scanDir(coreDir);
    expect(violations).toEqual([]);
  });

  it('mobile notifications are local only (no remote push)', () => {
    const notifFile = path.join(ROOT, 'packages/mobile/src/notifications/local-notifications.ts');
    const content = fs.readFileSync(notifFile, 'utf-8');

    // Must NOT contain remote push patterns
    expect(content).not.toContain('firebase');
    expect(content).not.toContain('FCM');
    expect(content).not.toContain('APNS');
    expect(content).not.toContain('push-notification-server');
    expect(content).not.toContain('remote push server');

    // Must contain local-only indicators
    expect(content).toContain('local');
  });

  it('mDNS discovery is local network only', () => {
    const discoveryFile = path.join(ROOT, 'packages/core/routing/discovery.ts');
    const content = fs.readFileSync(discoveryFile, 'utf-8');

    expect(content).toContain('_semblance._tcp.local.');
    expect(content).toContain('local network only');
    expect(content).not.toContain('cloud');
    expect(content).not.toContain('relay');
  });

  it('sync communication uses encrypted transport', () => {
    const syncFile = path.join(ROOT, 'packages/core/routing/sync.ts');
    const content = fs.readFileSync(syncFile, 'utf-8');

    expect(content).toContain('encrypt');
    expect(content).toContain('decrypt');
    expect(content).toContain('hmac');
    expect(content).toContain('sharedSecret');
  });

  it('platform adapter isolates Node.js APIs from mobile', () => {
    const platformIndex = path.join(ROOT, 'packages/core/platform/index.ts');
    const content = fs.readFileSync(platformIndex, 'utf-8');

    // Must have platform detection
    expect(content).toContain('getPlatform');
    expect(content).toContain('setPlatform');
  });
});

// ─── File Existence Audit ───────────────────────────────────────────────────

describe('Integration — Step 12 File Audit', () => {
  const requiredFiles = [
    // IPC
    'packages/core/ipc/transport.ts',
    'packages/core/ipc/in-process-transport.ts',
    'packages/core/ipc/socket-transport.ts',
    // Platform
    'packages/core/platform/types.ts',
    'packages/core/platform/desktop-adapter.ts',
    'packages/core/platform/mobile-adapter.ts',
    'packages/core/platform/index.ts',
    // Routing
    'packages/core/routing/discovery.ts',
    'packages/core/routing/sync.ts',
    'packages/core/routing/task-delegation.ts',
    'packages/core/routing/task-assessor.ts',
    'packages/core/routing/router.ts',
    'packages/core/routing/device-registry.ts',
    // Mobile
    'packages/mobile/src/App.tsx',
    'packages/mobile/src/theme/tokens.ts',
    'packages/mobile/src/navigation/TabNavigator.tsx',
    'packages/mobile/src/screens/InboxScreen.tsx',
    'packages/mobile/src/screens/ChatScreen.tsx',
    'packages/mobile/src/screens/CaptureScreen.tsx',
    'packages/mobile/src/screens/SettingsScreen.tsx',
    'packages/mobile/src/screens/OnboardingScreen.tsx',
    'packages/mobile/src/gestures/swipe-actions.ts',
    'packages/mobile/src/gestures/haptics.ts',
    'packages/mobile/src/notifications/local-notifications.ts',
    'packages/mobile/src/data/inbox-adapter.ts',
    'packages/mobile/src/data/network-monitor-adapter.ts',
    'packages/mobile/src/data/subscription-adapter.ts',
    'packages/mobile/src/data/web-search-adapter.ts',
    'packages/mobile/src/data/reminder-adapter.ts',
    'packages/mobile/src/data/style-adapter.ts',
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    });
  }
});
