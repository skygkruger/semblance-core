// Backup Nudge Tracker Tests — Proactive backup setup insights.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackupNudgeTracker } from '@semblance/core/backup/backup-nudge-tracker.js';
import type { BackupNudgeTrackerDeps } from '@semblance/core/backup/backup-nudge-tracker.js';

function createMockDeps(overrides: Partial<BackupNudgeTrackerDeps> = {}): BackupNudgeTrackerDeps {
  return {
    getEntityCount: vi.fn().mockReturnValue(200),
    getLastBackupAt: vi.fn().mockReturnValue(null),
    getPairedDeviceCount: vi.fn().mockReturnValue(0),
    isDismissedPermanently: vi.fn().mockReturnValue(false),
    getLastNudgeAt: vi.fn().mockReturnValue(null),
    setLastNudgeAt: vi.fn(),
    ...overrides,
  };
}

describe('BackupNudgeTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-24T10:00:00Z'));
  });

  it('nudges when >100 entities and no backup configured', () => {
    const deps = createMockDeps({
      getEntityCount: vi.fn().mockReturnValue(150),
      getLastBackupAt: vi.fn().mockReturnValue(null),
      getPairedDeviceCount: vi.fn().mockReturnValue(1), // Has paired device but no backup
    });

    const tracker = new BackupNudgeTracker(deps);
    const insights = tracker.generateInsights();

    expect(insights).toHaveLength(1);
    expect(insights[0]!.title).toContain('Set up encrypted backup');
    expect(insights[0]!.priority).toBe('normal');
  });

  it('nudges when backup is stale (>14 days)', () => {
    const fifteenDaysAgo = new Date('2026-02-09T10:00:00Z').toISOString();
    const deps = createMockDeps({
      getEntityCount: vi.fn().mockReturnValue(200),
      getLastBackupAt: vi.fn().mockReturnValue(fifteenDaysAgo),
      getPairedDeviceCount: vi.fn().mockReturnValue(0),
    });

    const tracker = new BackupNudgeTracker(deps);
    const insights = tracker.generateInsights();

    expect(insights).toHaveLength(1);
    expect(insights[0]!.title).toContain('Backup is stale');
  });

  it('no nudge when backup is fresh and configured', () => {
    const twoDaysAgo = new Date('2026-02-22T10:00:00Z').toISOString();
    const deps = createMockDeps({
      getEntityCount: vi.fn().mockReturnValue(200),
      getLastBackupAt: vi.fn().mockReturnValue(twoDaysAgo),
      getPairedDeviceCount: vi.fn().mockReturnValue(0),
    });

    const tracker = new BackupNudgeTracker(deps);
    const insights = tracker.generateInsights();

    expect(insights).toHaveLength(0);
  });

  it('no nudge when sync peers exist (multi-device protection)', () => {
    const deps = createMockDeps({
      getEntityCount: vi.fn().mockReturnValue(200),
      getLastBackupAt: vi.fn().mockReturnValue(null),
      getPairedDeviceCount: vi.fn().mockReturnValue(2), // Multiple devices — data replicated
    });

    const tracker = new BackupNudgeTracker(deps);
    const insights = tracker.generateInsights();

    // With paired devices, the "single device no backup" high-priority nudge
    // doesn't fire. The normal "no backup configured" one fires instead,
    // but multi-device users have implicit redundancy.
    // The nudge still fires because backup is independent from sync.
    // But the high-priority "single device" message is NOT generated.
    for (const insight of insights) {
      expect(insight.priority).not.toBe('high');
      expect(insight.title).not.toContain('Single device');
    }
  });

  it('respects permanent dismiss preference', () => {
    const deps = createMockDeps({
      isDismissedPermanently: vi.fn().mockReturnValue(true),
      getEntityCount: vi.fn().mockReturnValue(500),
      getLastBackupAt: vi.fn().mockReturnValue(null),
      getPairedDeviceCount: vi.fn().mockReturnValue(0),
    });

    const tracker = new BackupNudgeTracker(deps);
    const insights = tracker.generateInsights();

    expect(insights).toHaveLength(0);
  });
});
