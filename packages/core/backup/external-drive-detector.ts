// External Drive Detector — Monitors external drive connections for backup prompts.
// CRITICAL: No networking imports. Entirely local.

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Configuration for external drive detection.
 */
export interface DriveDetectionConfig {
  /** Whether drive detection is enabled */
  enabled: boolean;
  /** Whether to prompt for backup when a known drive connects */
  autoBackupOnConnect: boolean;
  /** Drives the user has previously used for backups */
  knownDrives: KnownDrive[];
}

/**
 * A drive the user has previously configured for backups.
 */
export interface KnownDrive {
  /** Unique drive identifier (filesystem UUID or volume serial) */
  id: string;
  /** User-facing label */
  label: string;
  /** Last backup path on this drive */
  lastBackupPath: string;
  /** ISO timestamp of last backup to this drive */
  lastBackupAt: string;
}

/**
 * Event emitted when an external drive is connected or disconnected.
 */
export interface DriveEvent {
  type: 'connected' | 'disconnected';
  driveId: string;
  label: string;
  mountPath: string;
  availableSpaceBytes: number;
}

/**
 * Notification generated in response to a drive event.
 */
export interface DriveNotification {
  type: 'backup-now' | 'setup-backup' | 'none';
  title: string;
  body: string;
  driveLabel: string;
}

export const DEFAULT_DRIVE_DETECTION_CONFIG: DriveDetectionConfig = {
  enabled: true,
  autoBackupOnConnect: true,
  knownDrives: [],
};

// ─── Detector ───────────────────────────────────────────────────────────────

/**
 * Detects external drive connections and generates backup notifications.
 */
export class ExternalDriveDetector {
  private config: DriveDetectionConfig;
  private recentNotifications = new Set<string>();

  constructor(config?: DriveDetectionConfig) {
    this.config = config ? { ...config } : { ...DEFAULT_DRIVE_DETECTION_CONFIG };
  }

  /**
   * Register a drive as a known backup destination.
   */
  registerKnownDrive(drive: KnownDrive): void {
    const existing = this.config.knownDrives.findIndex((d) => d.id === drive.id);
    if (existing >= 0) {
      this.config.knownDrives[existing] = drive;
    } else {
      this.config.knownDrives.push(drive);
    }
  }

  /**
   * Remove a drive from known backup destinations.
   */
  removeKnownDrive(driveId: string): void {
    this.config.knownDrives = this.config.knownDrives.filter((d) => d.id !== driveId);
  }

  /**
   * Check if a drive is a known backup destination.
   */
  isKnownDrive(driveId: string): boolean {
    return this.config.knownDrives.some((d) => d.id === driveId);
  }

  /**
   * Get all known backup drives.
   */
  getKnownDrives(): KnownDrive[] {
    return [...this.config.knownDrives];
  }

  /**
   * Generate a notification for a drive event.
   * Returns appropriate notification type based on drive familiarity.
   */
  getNotification(event: DriveEvent): DriveNotification {
    // Disconnected events don't generate notifications
    if (event.type === 'disconnected') {
      this.recentNotifications.delete(event.driveId);
      return { type: 'none', title: '', body: '', driveLabel: event.label };
    }

    // Deduplicate — no duplicate notifications for same drive connection
    if (this.recentNotifications.has(event.driveId)) {
      return { type: 'none', title: '', body: '', driveLabel: event.label };
    }

    this.recentNotifications.add(event.driveId);

    // Known drive → prompt to backup now
    if (this.isKnownDrive(event.driveId)) {
      return {
        type: 'backup-now',
        title: 'Backup drive connected',
        body: `Back up to ${event.label} now?`,
        driveLabel: event.label,
      };
    }

    // Unknown drive → offer to set up backup
    return {
      type: 'setup-backup',
      title: 'External drive detected',
      body: `Set up encrypted backup to ${event.label}?`,
      driveLabel: event.label,
    };
  }
}
