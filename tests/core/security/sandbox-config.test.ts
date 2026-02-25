// Sandbox Config Tests — OS sandboxing entitlements and restrictions.

import { describe, it, expect } from 'vitest';
import {
  MACOS_ENTITLEMENTS,
  LINUX_APPARMOR_RESTRICTIONS,
  WINDOWS_CAPABILITIES,
} from '@semblance/core/security/sandbox-config.js';
import { auditSandboxConfig } from '@semblance/core/security/sandbox-verifier.js';

describe('macOS Entitlements', () => {
  it('denies network.server', () => {
    expect(MACOS_ENTITLEMENTS['com.apple.security.network.server']).toBe(false);
  });

  it('denies camera and microphone', () => {
    expect(MACOS_ENTITLEMENTS['com.apple.security.device.camera']).toBe(false);
    expect(MACOS_ENTITLEMENTS['com.apple.security.device.microphone']).toBe(false);
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
