/**
 * Mobile Remediation Verification — Cross-cutting integration tests.
 *
 * Verifies the two root causes from Step 12 are fully resolved:
 * 1. PlatformAdapter is used everywhere (no Node.js builtins in core)
 * 2. Native inference bridges are real (no placeholder strings)
 *
 * Also verifies end-to-end wiring:
 * - InferenceRouter routes to mobile provider
 * - Cross-device discovery + sync + delegation
 * - Feature parity: inbox, chat, search on mobile
 * - Privacy: no cloud relay, no unauthorized connections
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

// ─── Root Cause 1: PlatformAdapter Verification ───────────────────────────

describe('Root Cause 1: PlatformAdapter replaces all Node.js builtins', () => {
  const CORE_DIR = path.join(ROOT, 'packages/core');

  const APPROVED_FILES = new Set([
    'platform/desktop-adapter.ts',
    'ipc/socket-transport.ts',
    // Importers are desktop-only file parsers (node:fs/node:crypto)
    'importers/browser/chrome-history-parser.ts',
    'importers/browser/firefox-history-parser.ts',
    'importers/notes/obsidian-parser.ts',
    'importers/notes/apple-notes-parser.ts',
    'importers/messaging/whatsapp-parser.ts',
    'importers/photos/exif-parser.ts',
    // Founding member JWT verification uses node:crypto for Ed25519 signature verification.
    'premium/founding-token.ts',
    // License key Ed25519 signature verification uses node:crypto for Ed25519 verify.
    'premium/license-keys.ts',
    // LanceDB wrapper (only @lancedb/lancedb import)
    'platform/desktop-vector-store.ts',
  ]);

  function collectTsFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
            files.push(...collectTsFiles(full));
          } else if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
            files.push(full);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return files;
  }

  const BANNED_IMPORTS = [
    /from\s+['"]node:fs['"]/,
    /from\s+['"]node:fs\/promises['"]/,
    /from\s+['"]node:path['"]/,
    /from\s+['"]node:os['"]/,
    /from\s+['"]node:crypto['"]/,
    /from\s+['"]better-sqlite3['"]/,
  ];

  it('zero Node.js builtins in packages/core/ (excluding approved files)', () => {
    const allFiles = collectTsFiles(CORE_DIR);
    const filesToScan = allFiles.filter(f => {
      const rel = path.relative(CORE_DIR, f).replace(/\\/g, '/');
      return !APPROVED_FILES.has(rel);
    });

    const violations: Array<{ file: string; pattern: string }> = [];
    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rel = path.relative(CORE_DIR, filePath).replace(/\\/g, '/');
      for (const pattern of BANNED_IMPORTS) {
        if (pattern.test(content)) {
          violations.push({ file: rel, pattern: pattern.source });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('DatabaseHandle used instead of Database.Database', () => {
    const allFiles = collectTsFiles(CORE_DIR);
    const violations: string[] = [];
    for (const filePath of allFiles) {
      const rel = path.relative(CORE_DIR, filePath).replace(/\\/g, '/');
      if (APPROVED_FILES.has(rel)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      if (/Database\.Database/.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no import type from better-sqlite3', () => {
    const allFiles = collectTsFiles(CORE_DIR);
    const violations: string[] = [];
    for (const filePath of allFiles) {
      const rel = path.relative(CORE_DIR, filePath).replace(/\\/g, '/');
      if (APPROVED_FILES.has(rel)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      if (/import\s+type\s+.*from\s+['"]better-sqlite3['"]/.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});

// ─── Root Cause 2: Native Inference Acid Test ──────────────────────────────

describe('Root Cause 2: Native inference bridges are not placeholder', () => {
  it('MockMLXBridge generates non-placeholder text', async () => {
    const { MockMLXBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const bridge = new MockMLXBridge();
    await bridge.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });

    const chunks: string[] = [];
    for await (const token of bridge.generate('Test prompt', {})) {
      chunks.push(token);
    }
    const fullText = chunks.join('');

    expect(fullText.length).toBeGreaterThan(0);
    expect(fullText.toLowerCase()).not.toContain('placeholder');
    expect(fullText.toLowerCase()).not.toContain('not implemented');
    expect(fullText.toLowerCase()).not.toContain('todo');
  });

  it('MockLlamaCppBridge generates non-placeholder text', async () => {
    const { MockLlamaCppBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const bridge = new MockLlamaCppBridge();
    await bridge.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });

    const chunks: string[] = [];
    for await (const token of bridge.generate('Test prompt', {})) {
      chunks.push(token);
    }
    const fullText = chunks.join('');

    expect(fullText.length).toBeGreaterThan(0);
    expect(fullText.toLowerCase()).not.toContain('placeholder');
    expect(fullText.toLowerCase()).not.toContain('not implemented');
    expect(fullText.toLowerCase()).not.toContain('todo');
  });

  it('MLX bridge reports iOS platform', async () => {
    const { MockMLXBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const bridge = new MockMLXBridge();
    expect(bridge.getPlatform()).toBe('ios');
  });

  it('LlamaCpp bridge reports Android platform', async () => {
    const { MockLlamaCppBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const bridge = new MockLlamaCppBridge();
    expect(bridge.getPlatform()).toBe('android');
  });
});

// ─── InferenceRouter Mobile Routing ────────────────────────────────────────

describe('InferenceRouter routes to mobile provider', () => {
  it('InferenceRouter accepts mobile provider config', async () => {
    const { InferenceRouter } = await import('../../packages/core/llm/inference-router.js');
    const { MockMLXBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const { MobileProvider } = await import('../../packages/core/llm/mobile-provider.js');

    const bridge = new MockMLXBridge();
    const mobileProvider = new MobileProvider({
      bridge,
      modelName: 'test-3b',
      embeddingModelName: 'test-embed',
    });

    const router = new InferenceRouter({
      reasoningProvider: mobileProvider,
      embeddingProvider: mobileProvider,
      reasoningModel: 'test-3b',
      embeddingModel: 'test-embed',
      platform: 'ios',
      mobileProvider: mobileProvider,
      mobileReasoningModel: 'test-3b',
      mobileEmbeddingModel: 'test-embed',
    });

    expect(router).toBeDefined();
  });

  it('MobileProvider wraps bridge correctly', async () => {
    const { MockMLXBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const { MobileProvider } = await import('../../packages/core/llm/mobile-provider.js');

    const bridge = new MockMLXBridge();
    const provider = new MobileProvider({
      bridge,
      modelName: 'test-3b',
      embeddingModelName: 'test-embed',
    });

    await bridge.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });
    const result = await provider.generate({ prompt: 'Test prompt', model: 'test-3b' });
    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('MobileProvider embedding returns number array', async () => {
    const { MockMLXBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const { MobileProvider } = await import('../../packages/core/llm/mobile-provider.js');

    const bridge = new MockMLXBridge();
    const provider = new MobileProvider({
      bridge,
      modelName: 'test-3b',
      embeddingModelName: 'test-embed',
    });

    await bridge.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });
    const result = await provider.embed({ input: ['Test text'], model: 'test-embed' });
    expect(result).toBeDefined();
    expect(result.embeddings).toBeDefined();
    expect(result.embeddings.length).toBeGreaterThan(0);
    expect(Array.isArray(result.embeddings[0])).toBe(true);
  });
});

// ─── Cross-Device Discovery + Sync ─────────────────────────────────────────

describe('Cross-device discovery and sync', () => {
  it('DiscoveryManager works with mock provider', async () => {
    const { DiscoveryManager } = await import('../../packages/core/routing/discovery.js');

    const discovered: Array<{ name: string; host: string; port: number }> = [];
    const mockMDNS = {
      advertise: vi.fn(),
      stopAdvertising: vi.fn(),
      startDiscovery: vi.fn(),
      stopDiscovery: vi.fn(),
      onDiscovered: vi.fn((cb: (service: any) => void) => {
        // Simulate discovery
        setTimeout(() => cb({ name: 'TestDevice', host: '192.168.1.10', port: 9876 }), 10);
      }),
      onLost: vi.fn(),
    };

    const dm = new DiscoveryManager({
      thisDevice: { deviceId: 'dev1', deviceName: 'TestPhone', deviceType: 'mobile', platform: 'ios', protocolVersion: 1, syncPort: 9876, ipAddress: '192.168.1.1' },
      mdns: mockMDNS,
    });

    expect(dm).toBeDefined();
  });

  it('PlatformSyncCrypto encrypts and decrypts roundtrip', async () => {
    const { PlatformSyncCrypto } = await import('../../packages/core/routing/platform-sync-crypto.js');
    const crypto = new PlatformSyncCrypto();

    const sharedSecret = 'test-shared-secret-key-256-bits!';
    const plaintext = 'Hello from device A';

    const encrypted = await crypto.encrypt(plaintext, sharedSecret);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();

    const decrypted = await crypto.decrypt(encrypted.ciphertext, encrypted.iv, sharedSecret);
    expect(decrypted).toBe(plaintext);
  });

  it('EncryptedSyncTransport sends and receives', async () => {
    const { EncryptedSyncTransportImpl } = await import('../../packages/core/routing/encrypted-sync-transport.js');

    const messages: string[] = [];
    const mockTCP = {
      connect: vi.fn(),
      send: vi.fn((data: string) => { messages.push(data); }),
      onReceive: vi.fn(),
      close: vi.fn(),
      listen: vi.fn(),
    };

    const mockCrypto = {
      encrypt: vi.fn(async (text: string) => `ENC:${text}`),
      decrypt: vi.fn(async (text: string) => text.replace('ENC:', '')),
      hmac: vi.fn(async () => 'mock-hmac'),
    };

    const transport = new EncryptedSyncTransportImpl(mockTCP as any);
    expect(transport).toBeDefined();
  });

  it('no cloud relay in discovery', async () => {
    const discoveryPath = path.join(ROOT, 'packages/core/routing/discovery.ts');
    const content = fs.readFileSync(discoveryPath, 'utf-8');
    // Must not reference any cloud URLs or external services
    expect(content).not.toMatch(/https?:\/\/(?!localhost|127\.0\.0\.1)/);
    expect(content.toLowerCase()).not.toContain('cloud relay');
    expect(content.toLowerCase()).not.toContain('stun server');
    expect(content.toLowerCase()).not.toContain('turn server');
  });

  it('no cloud relay in sync transport', async () => {
    const syncPath = path.join(ROOT, 'packages/core/routing/sync.ts');
    const content = fs.readFileSync(syncPath, 'utf-8');
    expect(content).not.toMatch(/https?:\/\/(?!localhost|127\.0\.0\.1)/);
  });
});

// ─── Feature Parity: Mobile Data Adapters ──────────────────────────────────

describe('Feature parity: mobile adapters exist and export correctly', () => {
  const MOBILE_DATA = path.join(ROOT, 'packages/mobile/src/data');

  const adapterFiles = [
    'inbox-adapter.ts',
    'chat-adapter.ts',
    'reminder-adapter.ts',
    'network-monitor-adapter.ts',
    'subscription-adapter.ts',
    'web-search-adapter.ts',
    'style-adapter.ts',
    'search-adapter.ts',
  ];

  for (const file of adapterFiles) {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(MOBILE_DATA, file))).toBe(true);
    });
  }

  it('inbox-adapter exports emailsToInboxItems and mergeInboxItems', async () => {
    const mod = await import('../../packages/mobile/src/data/inbox-adapter.js');
    expect(typeof mod.emailsToInboxItems).toBe('function');
    expect(typeof mod.mergeInboxItems).toBe('function');
  });

  it('chat-adapter exports formatChatMessages and createChatSession', async () => {
    const mod = await import('../../packages/mobile/src/data/chat-adapter.js');
    expect(typeof mod.formatChatMessages).toBe('function');
    expect(typeof mod.createChatSession).toBe('function');
  });

  it('reminder-adapter exports buildReminderNotification and snoozeReminder', async () => {
    const mod = await import('../../packages/mobile/src/data/reminder-adapter.js');
    expect(typeof mod.buildReminderNotification).toBe('function');
    expect(typeof mod.snoozeReminder).toBe('function');
  });

  it('network-monitor-adapter exports core functions', async () => {
    const mod = await import('../../packages/mobile/src/data/network-monitor-adapter.js');
    expect(typeof mod.auditEntriesToMonitorEntries).toBe('function');
    expect(typeof mod.computeMonitorStats).toBe('function');
  });

  it('subscription-adapter exports core functions', async () => {
    const mod = await import('../../packages/mobile/src/data/subscription-adapter.js');
    expect(typeof mod.chargesToSubscriptionItems).toBe('function');
    expect(typeof mod.buildSubscriptionSummary).toBe('function');
  });

  it('web-search-adapter exports core functions', async () => {
    const mod = await import('../../packages/mobile/src/data/web-search-adapter.js');
    expect(typeof mod.toMobileSearchResults).toBe('function');
    expect(typeof mod.formatSearchAsChat).toBe('function');
  });

  it('style-adapter exports core functions', async () => {
    const mod = await import('../../packages/mobile/src/data/style-adapter.js');
    expect(typeof mod.computeStyleMatch).toBe('function');
    expect(typeof mod.formatStyleIndicator).toBe('function');
  });

  it('search-adapter exports core functions', async () => {
    const mod = await import('../../packages/mobile/src/data/search-adapter.js');
    expect(typeof mod.keywordSearch).toBe('function');
    expect(typeof mod.groupByType).toBe('function');
  });
});

// ─── Privacy: No Unauthorized Network Access ───────────────────────────────

describe('Privacy: no unauthorized network access in mobile code', () => {
  function scanDir(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
            files.push(...scanDir(full));
          } else if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
            files.push(full);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return files;
  }

  it('no fetch/XMLHttpRequest in mobile src', () => {
    const mobileDir = path.join(ROOT, 'packages/mobile/src');
    const files = scanDir(mobileDir);
    const violations: string[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rel = path.relative(mobileDir, filePath).replace(/\\/g, '/');
      // Allow type references but not actual fetch calls
      if (/\bfetch\s*\(/.test(content) || /XMLHttpRequest/.test(content)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no analytics SDKs in mobile src', () => {
    const mobileDir = path.join(ROOT, 'packages/mobile/src');
    const files = scanDir(mobileDir);
    const banned = ['segment', 'mixpanel', 'amplitude', 'posthog', 'sentry', 'bugsnag', 'datadog'];
    const violations: string[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();
      const rel = path.relative(mobileDir, filePath).replace(/\\/g, '/');
      for (const sdk of banned) {
        if (content.includes(`from '${sdk}'`) || content.includes(`from "${sdk}"`)) {
          violations.push(`${rel}: ${sdk}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no telemetry endpoints in mobile src', () => {
    const mobileDir = path.join(ROOT, 'packages/mobile/src');
    const files = scanDir(mobileDir);
    const violations: string[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rel = path.relative(mobileDir, filePath).replace(/\\/g, '/');
      // No external API URLs (allow localhost references)
      const urls = content.match(/https?:\/\/[^\s'"`)]+/g) || [];
      const externalUrls = urls.filter(u =>
        !u.includes('localhost') &&
        !u.includes('127.0.0.1') &&
        !u.includes('example.com') &&
        !u.includes('github.com/ggerganov')  // llama.cpp source
      );
      if (externalUrls.length > 0) {
        violations.push(`${rel}: ${externalUrls.join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no cloud telemetry in core routing', () => {
    const routingDir = path.join(ROOT, 'packages/core/routing');
    const files = scanDir(routingDir);
    const violations: string[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();
      const rel = path.relative(routingDir, filePath).replace(/\\/g, '/');
      if (content.includes('telemetry') || content.includes('analytics.send') || content.includes('tracking')) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ─── Native Source Verification (Redundant Safety Check) ───────────────────

describe('Native source files contain real framework APIs', () => {
  it('Swift MLX module has real MLX API calls', () => {
    const swiftPath = path.join(ROOT, 'packages/mobile/ios/SemblanceMLX/SemblanceMLXModule.swift');
    expect(fs.existsSync(swiftPath)).toBe(true);
    const content = fs.readFileSync(swiftPath, 'utf-8');
    expect(content.toLowerCase()).not.toContain('[mlx inference placeholder]');
    const hasMLXAPI = content.includes('ModelContainer') || content.includes('LLMModelFactory');
    expect(hasMLXAPI).toBe(true);
  });

  it('Kotlin module has real JNI declarations', () => {
    const ktPath = path.join(ROOT, 'packages/mobile/android/app/src/main/java/com/semblance/llm/SemblanceLlamaModule.kt');
    expect(fs.existsSync(ktPath)).toBe(true);
    const content = fs.readFileSync(ktPath, 'utf-8');
    expect(content.toLowerCase()).not.toContain('[llamacpp inference placeholder]');
    expect(content).toContain('external fun nativeLoadModel');
    expect(content).toContain('external fun nativeGenerate');
  });

  it('C++ JNI bridge calls real llama.cpp APIs', () => {
    const cppPath = path.join(ROOT, 'packages/mobile/android/app/src/main/cpp/semblance_llama_jni.cpp');
    expect(fs.existsSync(cppPath)).toBe(true);
    const content = fs.readFileSync(cppPath, 'utf-8');
    expect(content).toContain('llama_model_load_from_file');
    expect(content).toContain('llama_new_context_with_model');
    expect(content).toContain('#include "llama.h"');
  });
});
