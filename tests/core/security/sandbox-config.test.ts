// Sandbox Config Tests — OS sandboxing entitlements and restrictions.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MACOS_ENTITLEMENTS,
  LINUX_APPARMOR_RESTRICTIONS,
  WINDOWS_CAPABILITIES,
} from '@semblance/core/security/sandbox-config.js';
import { auditSandboxConfig } from '@semblance/core/security/sandbox-verifier.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const PLIST_PATH = join(ROOT, 'packages', 'desktop', 'src-tauri', 'entitlements.plist');

describe('macOS Entitlements', () => {
  it('denies network.server', () => {
    expect(MACOS_ENTITLEMENTS['com.apple.security.network.server']).toBe(false);
  });

  it('denies camera and microphone', () => {
    expect(MACOS_ENTITLEMENTS['com.apple.security.device.camera']).toBe(false);
    expect(MACOS_ENTITLEMENTS['com.apple.security.device.microphone']).toBe(false);
  });

  it('denies audio-input', () => {
    expect(MACOS_ENTITLEMENTS['com.apple.security.device.audio-input']).toBe(false);
  });
});

describe('Entitlements plist / sandbox-config alignment', () => {
  const plistContent = readFileSync(PLIST_PATH, 'utf-8');

  // Parse granted entitlements from plist (keys followed by <true/>)
  function parseGrantedEntitlements(plist: string): Set<string> {
    const granted = new Set<string>();
    const lines = plist.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const keyMatch = lines[i]?.match(/<key>(com\.apple\.security\.[^<]+)<\/key>/);
      if (keyMatch && lines[i + 1]?.trim() === '<true/>') {
        granted.add(keyMatch[1]!);
      }
    }
    return granted;
  }

  const plistGranted = parseGrantedEntitlements(plistContent);

  it('plist does NOT grant network.server', () => {
    expect(plistGranted.has('com.apple.security.network.server')).toBe(false);
  });

  it('plist does NOT grant device.microphone', () => {
    expect(plistGranted.has('com.apple.security.device.microphone')).toBe(false);
  });

  it('plist does NOT grant device.audio-input', () => {
    expect(plistGranted.has('com.apple.security.device.audio-input')).toBe(false);
  });

  it('every plist-granted entitlement is true in MACOS_ENTITLEMENTS', () => {
    for (const key of plistGranted) {
      const configValue = (MACOS_ENTITLEMENTS as Record<string, boolean>)[key];
      expect(
        configValue,
        `entitlements.plist grants ${key} but sandbox-config.ts does not list it as true`
      ).toBe(true);
    }
  });

  it('every MACOS_ENTITLEMENTS=true entry is granted in plist', () => {
    for (const [key, value] of Object.entries(MACOS_ENTITLEMENTS)) {
      if (value === true) {
        expect(
          plistGranted.has(key),
          `sandbox-config.ts grants ${key} but entitlements.plist does not`
        ).toBe(true);
      }
    }
  });

  it('every MACOS_ENTITLEMENTS=false entry is NOT granted in plist', () => {
    for (const [key, value] of Object.entries(MACOS_ENTITLEMENTS)) {
      if (value === false) {
        expect(
          plistGranted.has(key),
          `sandbox-config.ts denies ${key} but entitlements.plist grants it`
        ).toBe(false);
      }
    }
  });
});

describe('Linux AppArmor', () => {
  it('denies inbound network', () => {
    expect(LINUX_APPARMOR_RESTRICTIONS.deny_inbound_network).toBe(true);
  });

  it('denies raw sockets and ptrace', () => {
    expect(LINUX_APPARMOR_RESTRICTIONS.deny_raw_socket).toBe(true);
    expect(LINUX_APPARMOR_RESTRICTIONS.deny_ptrace).toBe(true);
  });
});

describe('Windows Capabilities', () => {
  it('denies internetClientServer', () => {
    expect(WINDOWS_CAPABILITIES.internetClientServer).toBe(false);
  });
});

describe('auditSandboxConfig', () => {
  it('returns no violations for default configs', () => {
    // All three platforms should pass audit with the shipped config
    expect(auditSandboxConfig('darwin')).toEqual([]);
    expect(auditSandboxConfig('linux')).toEqual([]);
    expect(auditSandboxConfig('win32')).toEqual([]);
  });
});
