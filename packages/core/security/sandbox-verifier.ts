// Sandbox Verifier — Validates OS sandboxing configuration.
// CRITICAL: No networking imports. Configuration audit only.

import { MACOS_ENTITLEMENTS, LINUX_APPARMOR_RESTRICTIONS, WINDOWS_CAPABILITIES } from './sandbox-config.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A single violation found during sandbox audit.
 */
export interface SandboxViolation {
  type: string;
  description: string;
  severity: 'critical' | 'warning';
}

/**
 * Overall sandbox status for the current platform.
 */
export interface SandboxStatus {
  platform: string;
  sandboxActive: boolean;
  violations: SandboxViolation[];
  checkedAt: string;
}

// ─── Verification ───────────────────────────────────────────────────────────

/**
 * Verify sandbox status for the current platform.
 * In production, this delegates to platform-specific APIs.
 * Returns a status object summarizing the sandbox state.
 */
export function verifySandbox(platform: string): SandboxStatus {
  const violations = auditSandboxConfig(platform);

  return {
    platform,
    sandboxActive: violations.length === 0,
    violations,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Audit the sandbox configuration for a given platform.
 * Returns violations if the config has overly permissive entries.
 */
export function auditSandboxConfig(platform: string): SandboxViolation[] {
  switch (platform) {
    case 'darwin':
      return auditMacOS();
    case 'linux':
      return auditLinux();
    case 'win32':
      return auditWindows();
    default:
      return [{
        type: 'unknown-platform',
        description: `Unknown platform: ${platform}`,
        severity: 'warning',
      }];
  }
}

function auditMacOS(): SandboxViolation[] {
  const violations: SandboxViolation[] = [];

  // Verify denied entitlements are actually denied
  if (MACOS_ENTITLEMENTS['com.apple.security.network.server'] !== false) {
    violations.push({
      type: 'network-server-allowed',
      description: 'macOS entitlements allow inbound network connections',
      severity: 'critical',
    });
  }

  if (MACOS_ENTITLEMENTS['com.apple.security.device.camera'] !== false) {
    violations.push({
      type: 'camera-allowed',
      description: 'macOS entitlements allow camera access',
      severity: 'critical',
    });
  }

  if (MACOS_ENTITLEMENTS['com.apple.security.device.microphone'] !== false) {
    violations.push({
      type: 'microphone-allowed',
      description: 'macOS entitlements allow microphone access',
      severity: 'critical',
    });
  }

  // Verify sandbox is enabled
  if (MACOS_ENTITLEMENTS['com.apple.security.app-sandbox'] !== true) {
    violations.push({
      type: 'sandbox-disabled',
      description: 'macOS App Sandbox is not enabled',
      severity: 'critical',
    });
  }

  return violations;
}

function auditLinux(): SandboxViolation[] {
  const violations: SandboxViolation[] = [];

  if (LINUX_APPARMOR_RESTRICTIONS.deny_ptrace !== true) {
    violations.push({
      type: 'ptrace-allowed',
      description: 'Linux AppArmor does not deny ptrace',
      severity: 'critical',
    });
  }

  if (LINUX_APPARMOR_RESTRICTIONS.deny_raw_socket !== true) {
    violations.push({
      type: 'raw-socket-allowed',
      description: 'Linux AppArmor does not deny raw sockets',
      severity: 'critical',
    });
  }

  if (LINUX_APPARMOR_RESTRICTIONS.deny_inbound_network !== true) {
    violations.push({
      type: 'inbound-network-allowed',
      description: 'Linux AppArmor does not deny inbound network',
      severity: 'critical',
    });
  }

  return violations;
}

function auditWindows(): SandboxViolation[] {
  const violations: SandboxViolation[] = [];

  if (WINDOWS_CAPABILITIES.internetClientServer !== false) {
    violations.push({
      type: 'server-capability-allowed',
      description: 'Windows capabilities allow internetClientServer (inbound connections)',
      severity: 'critical',
    });
  }

  if (WINDOWS_CAPABILITIES.webcam !== false) {
    violations.push({
      type: 'webcam-allowed',
      description: 'Windows capabilities allow webcam access',
      severity: 'critical',
    });
  }

  if (WINDOWS_CAPABILITIES.microphone !== false) {
    violations.push({
      type: 'microphone-allowed',
      description: 'Windows capabilities allow microphone access',
      severity: 'critical',
    });
  }

  return violations;
}
