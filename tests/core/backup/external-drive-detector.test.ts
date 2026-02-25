// External Drive Detector Tests — Drive connection notifications.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExternalDriveDetector,
} from '@semblance/core/backup/external-drive-detector.js';
import type { DriveEvent, KnownDrive } from '@semblance/core/backup/external-drive-detector.js';

describe('ExternalDriveDetector', () => {
  let detector: ExternalDriveDetector;

  const knownDrive: KnownDrive = {
    id: 'drive-usb-001',
    label: 'My Backup Drive',
    lastBackupPath: '/Volumes/MyBackup/semblance',
    lastBackupAt: '2026-02-20T10:00:00Z',
  };

  beforeEach(() => {
    detector = new ExternalDriveDetector();
  });

  it('known backup drive triggers backup-now notification', () => {
    detector.registerKnownDrive(knownDrive);

    const event: DriveEvent = {
      type: 'connected',
      driveId: 'drive-usb-001',
      label: 'My Backup Drive',
      mountPath: '/Volumes/MyBackup',
      availableSpaceBytes: 50_000_000_000,
    };

    const notification = detector.getNotification(event);
    expect(notification.type).toBe('backup-now');
    expect(notification.title).toBe('Backup drive connected');
    expect(notification.body).toContain('My Backup Drive');
  });

  it('known drive with autoBackupOnConnect returns backup-now', () => {
    detector = new ExternalDriveDetector({
      enabled: true,
      autoBackupOnConnect: true,
      knownDrives: [knownDrive],
    });

    const event: DriveEvent = {
      type: 'connected',
      driveId: 'drive-usb-001',
      label: 'My Backup Drive',
      mountPath: '/Volumes/MyBackup',
      availableSpaceBytes: 50_000_000_000,
    };

    const notification = detector.getNotification(event);
    expect(notification.type).toBe('backup-now');
  });

  it('unknown drive triggers setup-backup notification', () => {
    const event: DriveEvent = {
      type: 'connected',
      driveId: 'drive-usb-unknown',
      label: 'New USB Drive',
      mountPath: '/Volumes/NewDrive',
      availableSpaceBytes: 100_000_000_000,
    };

    const notification = detector.getNotification(event);
    expect(notification.type).toBe('setup-backup');
    expect(notification.title).toBe('External drive detected');
    expect(notification.body).toContain('New USB Drive');
  });

  it('unknown drive with backup configured elsewhere triggers setup-backup', () => {
    // A different drive is registered, but this one is not
    detector.registerKnownDrive(knownDrive);

    const event: DriveEvent = {
      type: 'connected',
      driveId: 'drive-usb-other',
      label: 'Other Drive',
      mountPath: '/Volumes/Other',
      availableSpaceBytes: 200_000_000_000,
    };

    const notification = detector.getNotification(event);
    // Unknown drive still prompts setup — user might want a second backup destination
    expect(notification.type).toBe('setup-backup');
  });

  it('disconnect event returns none notification', () => {
    const event: DriveEvent = {
      type: 'disconnected',
      driveId: 'drive-usb-001',
      label: 'My Backup Drive',
      mountPath: '/Volumes/MyBackup',
      availableSpaceBytes: 0,
    };

    const notification = detector.getNotification(event);
    expect(notification.type).toBe('none');
  });

  it('no duplicate notifications for same drive connection event', () => {
    const event: DriveEvent = {
      type: 'connected',
      driveId: 'drive-usb-new',
      label: 'New Drive',
      mountPath: '/Volumes/New',
      availableSpaceBytes: 50_000_000_000,
    };

    const first = detector.getNotification(event);
    expect(first.type).toBe('setup-backup');

    // Second connection of same drive without disconnect
    const second = detector.getNotification(event);
    expect(second.type).toBe('none');
  });
});
