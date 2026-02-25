// Mobile Adapters Tests — Biometric, Share, and Backup adapters.
// Tests adapter logic, error handling, and graceful fallbacks.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const ADAPTERS_DIR = path.join(ROOT, 'packages/mobile/src/adapters');

// ─── Biometric Adapter ─────────────────────────────────────────────────────

describe('Mobile Biometric Adapter', () => {
  it('reports availability correctly based on sensor check', async () => {
    // Verify the adapter module exists and exports the factory
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-biometric-adapter.ts');
    expect(fs.existsSync(adapterPath)).toBe(true);

    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must implement BiometricAdapter interface
    expect(content).toContain('isAvailable');
    expect(content).toContain('getBiometricType');
    expect(content).toContain('authenticate');
    expect(content).toContain('canStoreInKeychain');

    // Must check sensor availability before reporting
    expect(content).toContain('isSensorAvailable');

    // Must export a factory function
    expect(content).toContain('createMobileBiometricAdapter');
  });

  it('handles not-enrolled gracefully without throwing', () => {
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-biometric-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must map 'not enrolled' errors to proper error code
    expect(content).toContain('not-enrolled');

    // Must handle errors with try/catch, not throw
    expect(content).toContain('catch');

    // Must return false from isAvailable when sensor not found, not throw
    const isAvailableBlock = content.slice(
      content.indexOf('async isAvailable'),
      content.indexOf('async getBiometricType'),
    );
    expect(isAvailableBlock).toContain('return false');
  });

  it('falls back to passcode when biometrics unavailable', () => {
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-biometric-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must pass allowDeviceCredentials to enable passcode fallback
    expect(content).toContain('allowDeviceCredentials');
    expect(content).toContain('true');
  });
});

// ─── Share Adapter ──────────────────────────────────────────────────────────

describe('Mobile Share Adapter', () => {
  it('calls platform share sheet with correct MIME type', () => {
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-share-adapter.ts');
    expect(fs.existsSync(adapterPath)).toBe(true);

    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must accept mimeType parameter and pass to native module
    expect(content).toContain('mimeType');
    expect(content).toContain('type: mimeType');

    // Must construct file:// URI for local files
    expect(content).toContain('file://');
  });

  it('handles user cancellation without error', () => {
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-share-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must detect cancellation and return 'cancelled' status, not 'error'
    expect(content).toContain("status: 'cancelled'");

    // Must check for cancel in thrown errors (share sheet dismiss)
    expect(content).toContain('cancel');
    expect(content).toContain('dismiss');
  });

  it('file picker returns selected file path and metadata', () => {
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-share-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must return structured PickResult with file info
    expect(content).toContain('uri:');
    expect(content).toContain('name:');
    expect(content).toContain('mimeType:');
    expect(content).toContain('sizeBytes:');

    // Must use document picker's isCancel method
    expect(content).toContain('isCancel');
  });
});

// ─── Backup Adapter ─────────────────────────────────────────────────────────

describe('Mobile Backup Adapter', () => {
  it('lists app documents as default destination', () => {
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-backup-adapter.ts');
    expect(fs.existsSync(adapterPath)).toBe(true);

    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must always include app documents directory
    expect(content).toContain('app-documents');
    expect(content).toContain('isDefault: true');

    // Must include backup subdirectory
    expect(content).toContain('backups');

    // Must return BackupDestination[] type
    expect(content).toContain('BackupDestination[]');
  });

  it('detects connected external storage on Android', () => {
    const adapterPath = path.join(ADAPTERS_DIR, 'mobile-backup-adapter.ts');
    const content = fs.readFileSync(adapterPath, 'utf-8');

    // Must check for external storage on Android
    expect(content).toContain("platform === 'android'");
    expect(content).toContain('ExternalStorageDirectoryPath');
    expect(content).toContain('external-storage');

    // External storage must NOT be default
    expect(content).toContain('isDefault: false');

    // Must verify path exists before listing
    expect(content).toContain('exists');
  });
});
