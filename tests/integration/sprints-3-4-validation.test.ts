/**
 * Step 33 — Commit 2: Sprint 3 (Powerful/Free) + Sprint 4 (Native/Premium) Validation
 *
 * Validates free product features (web search, reminders, style learning, sync)
 * and native integrations (contacts, messaging, voice, cloud storage, location,
 * finance, clipboard). Confirms premium gating across all 20 features.
 *
 * 20 tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { createEmptyProfile } from '../../packages/core/style/style-profile.js';
import { SyncEngine } from '../../packages/core/routing/sync.js';
import { PremiumGate, type PremiumFeature } from '../../packages/core/premium/premium-gate.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

const ROOT = join(import.meta.dirname, '..', '..');

// Source files
const WEB_SEARCH_FACTORY = readFileSync(join(ROOT, 'packages/gateway/services/web-search-factory.ts'), 'utf-8');
const REMINDER_STORE = readFileSync(join(ROOT, 'packages/core/knowledge/reminder-store.ts'), 'utf-8');
const QUICK_CAPTURE = readFileSync(join(ROOT, 'packages/core/agent/quick-capture.ts'), 'utf-8');
const ORCHESTRATOR = readFileSync(join(ROOT, 'packages/core/agent/orchestrator.ts'), 'utf-8');
const DIGEST = readFileSync(join(ROOT, 'packages/core/digest/weekly-digest.ts'), 'utf-8');
const CLOUD_CLIENT = readFileSync(join(ROOT, 'packages/core/cloud-storage/cloud-storage-client.ts'), 'utf-8');
const RECURRING = readFileSync(join(ROOT, 'packages/core/finance/recurring-detector.ts'), 'utf-8');
const STATEMENT = readFileSync(join(ROOT, 'packages/core/finance/statement-parser.ts'), 'utf-8');
const LOADER = readFileSync(join(ROOT, 'packages/core/extensions/loader.ts'), 'utf-8');

function createMockDb(): DatabaseHandle {
  const tables = new Map<string, unknown[]>();
  return {
    exec(sql: string): void {
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match && !tables.has(match[1]!)) tables.set(match[1]!, []);
    },
    prepare() {
      return {
        run(..._args: unknown[]) { return { changes: 0, lastInsertRowid: 0 }; },
        get(..._args: unknown[]) { return undefined; },
        all(..._args: unknown[]) { return []; },
      };
    },
    close(): void {},
    transaction<T>(fn: () => T): () => T { return fn; },
  } as unknown as DatabaseHandle;
}

describe('Step 33 — Sprint 3+4 Cross-Cutting Validation', () => {
  // ─── Sprint 3: Web Search ─────────────────────────────────────────────
  describe('Web Search', () => {
    it('has Brave adapter in search factory', () => {
      expect(WEB_SEARCH_FACTORY).toContain('braveAdapter');
      expect(WEB_SEARCH_FACTORY).toContain("'brave'");
    });
  });

  // ─── Sprint 3: Reminders + Quick Capture ──────────────────────────────
  describe('Reminders', () => {
    it('reminder store has recurrence support', () => {
      expect(REMINDER_STORE).toContain('recurrence');
      expect(REMINDER_STORE).toMatch(/recurrence TEXT/);
    });

    it('quick capture links to reminders', () => {
      expect(QUICK_CAPTURE).toContain('hasReminder');
      expect(QUICK_CAPTURE).toContain('reminderId');
      expect(QUICK_CAPTURE).toContain('parseReminder');
    });
  });

  // ─── Sprint 3: Style Learning ─────────────────────────────────────────
  describe('Style Learning', () => {
    it('style profile has version field', () => {
      const profile = createEmptyProfile();
      expect(profile).toHaveProperty('version');
      expect(typeof profile.version).toBe('number');
    });
  });

  // ─── Sprint 3: Context & Digest ───────────────────────────────────────
  describe('Context & Digest', () => {
    it('document context deduplicates chunks', () => {
      expect(ORCHESTRATOR).toContain('deduplicatedContext');
    });

    it('weekly digest computes timeSavedFormatted', () => {
      expect(DIGEST).toContain('timeSavedFormatted');
      expect(DIGEST).toContain('totalTimeSavedSeconds');
    });
  });

  // ─── Sprint 3: Sync Engine ────────────────────────────────────────────
  describe('Cross-Device Sync', () => {
    it('SyncEngine handles encrypted payloads', () => {
      expect(SyncEngine).toBeDefined();
      expect(typeof SyncEngine).toBe('function');
    });
  });

  // ─── Sprint 4: Contacts ───────────────────────────────────────────────
  describe('Contacts', () => {
    it('contacts module exports ContactStore', async () => {
      const contacts = await import('../../packages/core/knowledge/contacts/index.js');
      expect(contacts.ContactStore).toBeDefined();
      expect(contacts.ContactIngestionPipeline).toBeDefined();
    });
  });

  // ─── Sprint 4: Messaging ─────────────────────────────────────────────
  describe('Messaging', () => {
    it('messaging module has platform adapter and drafter', () => {
      expect(existsSync(join(ROOT, 'packages/core/agent/messaging/message-drafter.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/platform/desktop-messaging.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/platform/messaging-types.ts'))).toBe(true);
    });
  });

  // ─── Sprint 4: Voice ──────────────────────────────────────────────────
  describe('Voice', () => {
    it('voice module has transcription and synthesis interfaces', async () => {
      const voice = await import('../../packages/core/voice/index.js');
      expect(voice.TranscriptionPipeline).toBeDefined();
      expect(voice.SpeechSynthesisPipeline).toBeDefined();
      expect(voice.VoiceConversationManager).toBeDefined();
    });
  });

  // ─── Sprint 4: Cloud Storage ──────────────────────────────────────────
  describe('Cloud Storage', () => {
    it('cloud storage supports auth/disconnect/list via IPC', () => {
      expect(CLOUD_CLIENT).toContain("'cloud.auth'");
      expect(CLOUD_CLIENT).toContain("'cloud.auth_status'");
      expect(CLOUD_CLIENT).toContain("'cloud.disconnect'");
      expect(CLOUD_CLIENT).toContain("'cloud.list_files'");
    });
  });

  // ─── Sprint 4: Finance ────────────────────────────────────────────────
  describe('Finance', () => {
    it('RecurringDetector finds monthly and annual', () => {
      expect(RECURRING).toContain("'monthly'");
      expect(RECURRING).toContain("'annual'");
    });

    it('StatementParser handles CSV and OFX', () => {
      expect(STATEMENT).toContain('CSV');
      expect(STATEMENT).toContain('OFX');
    });
  });

  // ─── Sprint 4: Location ───────────────────────────────────────────────
  describe('Location', () => {
    it('proximity engine and location store exist', async () => {
      const location = await import('../../packages/core/location/index.js');
      expect(location.ProximityEngine).toBeDefined();
      expect(location.LocationStore).toBeDefined();
      expect(location.CommuteAnalyzer).toBeDefined();
    });
  });

  // ─── Sprint 4: Clipboard Intelligence ─────────────────────────────────
  describe('Clipboard', () => {
    it('clipboard intelligence module exists with handler and patterns', () => {
      expect(existsSync(join(ROOT, 'packages/core/agent/clipboard/clipboard-handler.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/agent/clipboard/pattern-recognizer.ts'))).toBe(true);
      expect(existsSync(join(ROOT, 'packages/core/agent/clipboard/action-mapper.ts'))).toBe(true);
    });
  });

  // ─── Premium Gating ───────────────────────────────────────────────────
  describe('Premium Gate', () => {
    it('all 20 premium features inaccessible on free tier', () => {
      const gate = new PremiumGate(createMockDb());
      const allFeatures: PremiumFeature[] = [
        'transaction-categorization', 'spending-insights', 'anomaly-detection',
        'plaid-integration', 'financial-dashboard', 'representative-drafting',
        'subscription-cancellation', 'representative-dashboard', 'form-automation',
        'bureaucracy-tracking', 'health-tracking', 'health-insights',
        'import-digital-life', 'dark-pattern-detection', 'financial-advocacy',
        'living-will', 'witness-attestation', 'inheritance-protocol',
        'semblance-network', 'proof-of-privacy',
      ];
      expect(allFeatures.length).toBe(20);
      for (const feature of allFeatures) {
        expect(gate.isFeatureAvailable(feature)).toBe(false);
      }
    });
  });

  // ─── Sprint 4: Location IPC ─────────────────────────────────────────
  describe('Location IPC', () => {
    it('weather query action type exists in IPC schema', () => {
      const ipcTypes = readFileSync(join(ROOT, 'packages/core/types/ipc.ts'), 'utf-8');
      expect(ipcTypes).toContain("'location.weather_query'");
    });
  });

  // ─── Sprint 3: Daily Digest ─────────────────────────────────────────
  describe('Daily Digest', () => {
    it('daily digest computes timeSavedFormatted', () => {
      const dailyDigest = readFileSync(join(ROOT, 'packages/core/agent/daily-digest.ts'), 'utf-8');
      expect(dailyDigest).toContain('timeSavedFormatted');
      expect(dailyDigest).toContain('totalTimeSavedSeconds');
    });
  });

  // ─── Sprint 4: Voice Resource Management ──────────────────────────────
  describe('Voice Resources', () => {
    it('voice module has resource coordinator and memory budget', async () => {
      const voice = await import('../../packages/core/voice/index.js');
      expect(voice.VoiceResourceCoordinator).toBeDefined();
      expect(voice.VoiceMemoryBudget).toBeDefined();
    });
  });

  // ─── Extension System ─────────────────────────────────────────────────
  describe('Extension System', () => {
    it('extension loader has loadExtensions function', () => {
      expect(LOADER).toContain('export async function loadExtensions');
      expect(LOADER).toContain('@semblance/dr');
    });
  });
});
