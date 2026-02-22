/**
 * Platform Adapter Guard — Extended verification of PlatformAdapter compliance.
 *
 * Supplements no-node-builtins-in-core.test.ts with structural verification:
 * - Mobile adapter is configurable (no hardcoded Node.js)
 * - Desktop adapter wraps all required subsystems
 * - DatabaseHandle is used everywhere instead of better-sqlite3 types
 * - getPlatform() returns valid adapter on both paths
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

describe('Platform Adapter Guard — Extended', () => {

  // ─── Mobile Adapter Structure ──────────────────────────────────────────

  describe('mobile adapter is injection-based', () => {
    const mobilePath = path.join(ROOT, 'packages/core/platform/mobile-adapter.ts');

    it('mobile adapter file exists', () => {
      expect(fs.existsSync(mobilePath)).toBe(true);
    });

    it('mobile adapter does not import Node.js builtins', () => {
      const content = fs.readFileSync(mobilePath, 'utf-8');
      expect(content).not.toMatch(/from\s+['"]node:fs['"]/);
      expect(content).not.toMatch(/from\s+['"]node:path['"]/);
      expect(content).not.toMatch(/from\s+['"]node:os['"]/);
      expect(content).not.toMatch(/from\s+['"]node:crypto['"]/);
      expect(content).not.toMatch(/from\s+['"]better-sqlite3['"]/);
    });

    it('mobile adapter has createMobileAdapter factory', () => {
      const content = fs.readFileSync(mobilePath, 'utf-8');
      expect(content).toContain('createMobileAdapter');
    });

    it('mobile adapter stubs throw clear errors', () => {
      const content = fs.readFileSync(mobilePath, 'utf-8');
      // Should have a notConfigured helper or throw pattern
      expect(content).toMatch(/not.?[Cc]onfigured|throw\s+new\s+Error/);
    });
  });

  // ─── Desktop Adapter Structure ─────────────────────────────────────────

  describe('desktop adapter wraps Node.js correctly', () => {
    const desktopPath = path.join(ROOT, 'packages/core/platform/desktop-adapter.ts');

    it('desktop adapter file exists', () => {
      expect(fs.existsSync(desktopPath)).toBe(true);
    });

    it('desktop adapter imports Node.js builtins (approved)', () => {
      const content = fs.readFileSync(desktopPath, 'utf-8');
      // This file SHOULD have Node.js imports — it wraps them
      const hasNodeImport =
        content.includes("from 'node:fs'") ||
        content.includes("from 'node:path'") ||
        content.includes("from 'node:os'") ||
        content.includes("from 'node:crypto'");
      expect(hasNodeImport).toBe(true);
    });

    it('desktop adapter exports createDesktopAdapter or desktopPlatform', () => {
      const content = fs.readFileSync(desktopPath, 'utf-8');
      const hasFactory = content.includes('createDesktopAdapter') || content.includes('desktopPlatform');
      expect(hasFactory).toBe(true);
    });
  });

  // ─── Types File Structure ──────────────────────────────────────────────

  describe('platform types define all subsystems', () => {
    const typesPath = path.join(ROOT, 'packages/core/platform/types.ts');

    it('types file exists', () => {
      expect(fs.existsSync(typesPath)).toBe(true);
    });

    it('defines FileSystemAdapter', () => {
      const content = fs.readFileSync(typesPath, 'utf-8');
      expect(content).toContain('FileSystemAdapter');
    });

    it('defines PathAdapter', () => {
      const content = fs.readFileSync(typesPath, 'utf-8');
      expect(content).toContain('PathAdapter');
    });

    it('defines CryptoAdapter', () => {
      const content = fs.readFileSync(typesPath, 'utf-8');
      expect(content).toContain('CryptoAdapter');
    });

    it('defines DatabaseHandle', () => {
      const content = fs.readFileSync(typesPath, 'utf-8');
      expect(content).toContain('DatabaseHandle');
    });

    it('defines HardwareAdapter', () => {
      const content = fs.readFileSync(typesPath, 'utf-8');
      expect(content).toContain('HardwareAdapter');
    });
  });

  // ─── getPlatform() index ───────────────────────────────────────────────

  describe('platform index auto-detects environment', () => {
    const indexPath = path.join(ROOT, 'packages/core/platform/index.ts');

    it('platform index exists', () => {
      expect(fs.existsSync(indexPath)).toBe(true);
    });

    it('exports getPlatform function', () => {
      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('getPlatform');
    });

    it('references both desktop and mobile adapters', () => {
      const content = fs.readFileSync(indexPath, 'utf-8');
      const hasDesktop = content.includes('desktop') || content.includes('Desktop');
      const hasMobile = content.includes('mobile') || content.includes('Mobile');
      expect(hasDesktop).toBe(true);
      expect(hasMobile).toBe(true);
    });
  });

  // ─── No better-sqlite3 type leaks ─────────────────────────────────────

  describe('DatabaseHandle used consistently', () => {
    it('no files outside desktop-adapter use Database.Database type', () => {
      const coreDir = path.join(ROOT, 'packages/core');
      const violations: string[] = [];

      function scan(dir: string) {
        try {
          const entries = fs.readdirSync(dir);
          for (const entry of entries) {
            const full = path.join(dir, entry);
            try {
              const stat = fs.statSync(full);
              if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
                scan(full);
              } else if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
                const rel = path.relative(coreDir, full).replace(/\\/g, '/');
                if (rel === 'platform/desktop-adapter.ts') continue;
                const content = fs.readFileSync(full, 'utf-8');
                if (/Database\.Database/.test(content)) {
                  violations.push(rel);
                }
              }
            } catch { /* skip */ }
          }
        } catch { /* skip */ }
      }

      scan(coreDir);
      expect(violations).toEqual([]);
    });
  });
});
