// Backup Nudge Tracker — Proactive insights to encourage backup setup.
// NOT premium-gated. Backup is a sovereignty fundamental.
// CRITICAL: No networking imports. No PremiumGate check.

import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import { nanoid } from 'nanoid';

const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STALE_BACKUP_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const ENTITY_THRESHOLD = 100;

export interface BackupNudgeTrackerDeps {
  /** Get total entity count in the knowledge graph */
  getEntityCount: () => number;
  /** Get ISO timestamp of last backup, or null if never backed up */
  getLastBackupAt: () => string | null;
  /** Get number of paired sync devices */
  getPairedDeviceCount: () => number;
  /** Check if user permanently dismissed backup nudges */
  isDismissedPermanently: () => boolean;
  /** Get ISO timestamp of last nudge, or null */
  getLastNudgeAt: () => string | null;
  /** Record when a nudge was shown */
  setLastNudgeAt: (iso: string) => void;
}

/**
 * Generates proactive insights nudging users to set up or update backups.
 * NOT premium-gated — backup is a sovereignty fundamental.
 */
export class BackupNudgeTracker implements ExtensionInsightTracker {
  private deps: BackupNudgeTrackerDeps;

  constructor(deps: BackupNudgeTrackerDeps) {
    this.deps = deps;
  }

  generateInsights(): ProactiveInsight[] {
    // Respect permanent dismissal
    if (this.deps.isDismissedPermanently()) {
      return [];
    }

    // Respect cooldown
    const lastNudge = this.deps.getLastNudgeAt();
    if (lastNudge) {
      const elapsed = Date.now() - new Date(lastNudge).getTime();
      if (elapsed < NUDGE_COOLDOWN_MS) {
        return [];
      }
    }

    const entityCount = this.deps.getEntityCount();
    const lastBackupAt = this.deps.getLastBackupAt();
    const pairedDevices = this.deps.getPairedDeviceCount();

    const now = new Date().toISOString();

    // Case 1: Single device, no backup at all — highest priority
    if (pairedDevices === 0 && !lastBackupAt && entityCount > ENTITY_THRESHOLD) {
      this.deps.setLastNudgeAt(now);
      return [this.createInsight(
        'backup-single-device',
        'high',
        'Single device, no backup',
        'Your data exists on only one device with no backup. If this device is lost or damaged, your Semblance data is gone. Set up an encrypted backup to protect your digital self.',
      )];
    }

    // Case 2: No backup configured but data is accumulating
    if (!lastBackupAt && entityCount > ENTITY_THRESHOLD) {
      this.deps.setLastNudgeAt(now);
      return [this.createInsight(
        'backup-not-configured',
        'normal',
        'Set up encrypted backup',
        `You have ${entityCount} entities in your knowledge graph but no backup configured. An encrypted local backup protects against device loss.`,
      )];
    }

    // Case 3: Backup exists but is stale
    if (lastBackupAt) {
      const backupAge = Date.now() - new Date(lastBackupAt).getTime();
      if (backupAge > STALE_BACKUP_MS) {
        this.deps.setLastNudgeAt(now);
        const daysSince = Math.floor(backupAge / (24 * 60 * 60 * 1000));
        return [this.createInsight(
          'backup-stale',
          'normal',
          'Backup is stale',
          `Your last backup was ${daysSince} days ago. Run a fresh backup to capture recent changes.`,
        )];
      }
    }

    return [];
  }

  private createInsight(
    id: string,
    priority: 'high' | 'normal' | 'low',
    title: string,
    summary: string,
  ): ProactiveInsight {
    return {
      id: nanoid(),
      type: id,
      priority,
      title,
      summary,
      sourceIds: [],
      suggestedAction: {
        actionType: 'open-backup-settings',
        payload: {},
        description: 'Open backup settings to configure encrypted backup',
      },
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 0,
    };
  }
}
