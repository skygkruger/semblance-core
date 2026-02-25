/**
 * Step 33 — Commit 7: Platform Checklist
 *
 * Platform-specific launch readiness for all 5 target platforms
 * (macOS, Linux, Windows, iOS, Android) plus cross-platform validation.
 *
 * 15 tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

// Source files
const TAURI_CONF = readFileSync(join(ROOT, 'packages/desktop/src-tauri/tauri.conf.json'), 'utf-8');
const LIB_RS = readFileSync(join(ROOT, 'packages/desktop/src-tauri/src/lib.rs'), 'utf-8');
const SANDBOX_CONFIG = readFileSync(join(ROOT, 'packages/core/security/sandbox-config.ts'), 'utf-8');
const MOBILE_PKG = JSON.parse(readFileSync(join(ROOT, 'packages/mobile/package.json'), 'utf-8'));
const TASK_DELEGATION = readFileSync(join(ROOT, 'packages/core/routing/task-delegation.ts'), 'utf-8');
const BACKUP_TYPES = readFileSync(join(ROOT, 'packages/core/backup/types.ts'), 'utf-8');

describe('Step 33 — Platform Checklist', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // DESKTOP (3 platforms)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Desktop', () => {
    it('Tauri config exists and is valid JSON', () => {
      const conf = JSON.parse(TAURI_CONF);
      expect(conf).toHaveProperty('app');
    });

    it('system tray is configured in Rust source', () => {
      expect(LIB_RS).toContain('tray');
      expect(LIB_RS).toContain('TrayIconBuilder');
    });

    it('macOS sandbox entitlements defined', () => {
      expect(SANDBOX_CONFIG).toContain('com.apple.security.app-sandbox');
      expect(SANDBOX_CONFIG).toContain('com.apple.security.network.client');
    });

    it('Windows capabilities defined', () => {
      expect(SANDBOX_CONFIG).toContain('WINDOWS_CAPABILITIES');
    });

    it('Linux AppArmor restrictions defined', () => {
      expect(SANDBOX_CONFIG).toContain('LINUX_APPARMOR_RESTRICTIONS');
      expect(SANDBOX_CONFIG).toContain('deny_ptrace');
      expect(SANDBOX_CONFIG).toContain('deny_raw_socket');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MOBILE (2 platforms)
  // ═══════════════════════════════════════════════════════════════════════
  describe('Mobile', () => {
    it('iOS MLX inference bridge exists', () => {
      expect(existsSync(join(ROOT, 'packages/mobile/src/inference/mlx-bridge.ts'))).toBe(true);
    });

    it('Android llama.cpp inference bridge exists', () => {
      expect(existsSync(join(ROOT, 'packages/mobile/src/inference/llamacpp-bridge.ts'))).toBe(true);
    });

    it('React Native package.json has react-native dependency', () => {
      expect(MOBILE_PKG.dependencies?.['react-native'] || MOBILE_PKG.devDependencies?.['react-native']).toBeDefined();
    });

    it('unified inference bridge abstracts platform differences', () => {
      expect(existsSync(join(ROOT, 'packages/mobile/src/inference/unified-bridge.ts'))).toBe(true);
      const bridge = readFileSync(join(ROOT, 'packages/mobile/src/inference/unified-bridge.ts'), 'utf-8');
      expect(bridge).toContain('mlx');
      expect(bridge).toContain('llama');
    });

    it('ios/ and android/ directories exist', () => {
      expect(existsSync(join(ROOT, 'packages/mobile/ios'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/mobile/android'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CROSS-PLATFORM
  // ═══════════════════════════════════════════════════════════════════════
  describe('Cross-Platform', () => {
    it('task routing logic is platform-agnostic', () => {
      // Task delegation should not import platform-specific code
      expect(TASK_DELEGATION).not.toContain("from 'react-native'");
      expect(TASK_DELEGATION).not.toContain("from '@tauri-apps'");
    });

    it('shared types directory exists with core type definitions', () => {
      expect(existsSync(join(ROOT, 'packages/core/types/ipc.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/types/audit.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/platform/types.ts'))).toBe(true);
    });

    it('design tokens are exportable for all platforms', () => {
      const tokenFiles = readdirSync(join(ROOT, 'packages/semblance-ui/tokens'));
      expect(tokenFiles).toContain('colors.ts');
      expect(tokenFiles).toContain('typography.ts');
      expect(tokenFiles).toContain('spacing.ts');
    });

    it('privacy audit script scans core and desktop for network violations', () => {
      const script = readFileSync(join(ROOT, 'scripts/privacy-audit/index.js'), 'utf-8');
      expect(script).toContain('packages');
      expect(script).toContain('core');
    });

    it('.sbk backup format is platform-agnostic (JSON + encrypted)', () => {
      expect(BACKUP_TYPES).toContain('.sbk');
      // No platform-specific references in backup format
      expect(BACKUP_TYPES).not.toContain('darwin');
      expect(BACKUP_TYPES).not.toContain('win32');
    });
  });
});
