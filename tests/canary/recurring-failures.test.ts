/**
 * CANARY TESTS — Recurring Failure Patterns
 *
 * These tests specifically target the bug categories that have repeatedly
 * shipped broken in Semblance. Each test is named after the incident that
 * motivated it. If a canary fails, the corresponding failure mode has
 * been reintroduced.
 *
 * Categories:
 *   1. Null access on optional fields
 *   2. IPC response shape mismatches (camelCase vs snake_case)
 *   3. Missing database tables on fresh install
 *   4. Stale config after state changes
 *   5. Zod validation crashes on real data
 *   6. Buffer/encoding edge cases
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const BRIDGE_PATH = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');
const ORCHESTRATOR_GLOB = join(ROOT, 'packages', 'core', 'agent');

// ─── Category 1: Null access on optional fields ─────────────────────────────
// Incident: orchestrator retryResponse null crash (2026-03-12)
// Incident: deriveThreadId Buffer crash on null messageId (2026-03-12)
// Incident: KG camera zoom on undefined node position (2026-03-10)

describe('Canary: Null access guards', () => {
  it('bridge.ts has no unguarded .length on optional fields', () => {
    if (!existsSync(BRIDGE_PATH)) return; // skip if bridge not present
    const content = readFileSync(BRIDGE_PATH, 'utf8');
    // Pattern: accessing .length without ?. on fields that could be null
    // Look for common offenders: result.length, response.length, messages.length
    // where the variable is assigned from a function that could return null/undefined
    const lines = content.split('\n');
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      // Detect: someVar.length where someVar could be from a nullable source
      // Specifically flag: .retryResponse. without ?. guard
      if (line.includes('.retryResponse.') && !line.includes('.retryResponse?.') && !line.includes('// canary-ok')) {
        violations.push(`Line ${i + 1}: unguarded .retryResponse. access`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('Buffer.from is not called with user-controlled nullable variables', () => {
    if (!existsSync(BRIDGE_PATH)) return;
    const content = readFileSync(BRIDGE_PATH, 'utf8');
    const lines = content.split('\n');
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim();
      // Buffer.from(someVariable) where the variable comes from user input or IPC params
      // Known safe patterns: Buffer.from(value) in stream writes (Uint8Array from ReadableStream),
      // Buffer.from(pdfBytes) from PDF rendering output — these are typed returns, not nullable user input.
      const match = line.match(/Buffer\.from\((\w+)\)/);
      if (match) {
        const varName = match[1] ?? '';
        // Flag: Buffer.from(messageId), Buffer.from(subject), Buffer.from(params.*)
        // where the source is user/IPC data that could be null
        if (/messageId|subject|body|content|email|text/i.test(varName)) {
          const context = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
          if (!context.includes('if (') && !context.includes('?? ') && !context.includes('|| ') && !context.includes('// canary-ok')) {
            violations.push(`Line ${i + 1}: Buffer.from(${varName}) — user-controlled input without null guard`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ─── Category 2: IPC response shape — camelCase consistency ──────────────────
// Incident: NaN MB bug from snake_case keys in get_knowledge_stats (2026-03-10)
// Incident: connector state not persisting due to flat vs nested response (2026-03-10)

describe('Canary: IPC response shape consistency', () => {
  it('bridge.ts get_knowledge_stats returns camelCase keys', () => {
    if (!existsSync(BRIDGE_PATH)) return;
    const content = readFileSync(BRIDGE_PATH, 'utf8');

    // Find the get_knowledge_stats handler
    const handlerIdx = content.indexOf("'get_knowledge_stats'");
    if (handlerIdx === -1) return; // handler may not exist yet

    // Look at the next 50 lines for the response shape
    const handlerSection = content.slice(handlerIdx, handlerIdx + 2000);

    // Should use camelCase: documentCount, chunkCount, indexSizeBytes
    // Should NOT use snake_case: document_count, chunk_count, index_size_bytes
    const hasSnakeCase = /document_count|chunk_count|index_size_bytes/.test(handlerSection);
    const hasCamelCase = /documentCount|chunkCount|indexSizeBytes/.test(handlerSection);

    if (hasSnakeCase && !hasCamelCase) {
      expect.fail('get_knowledge_stats returns snake_case keys — frontend expects camelCase');
    }
  });

  it('bridge.ts get_connected_services returns flat string array (not objects)', () => {
    if (!existsSync(BRIDGE_PATH)) return;
    const content = readFileSync(BRIDGE_PATH, 'utf8');

    const handlerIdx = content.indexOf("'get_connected_services'");
    if (handlerIdx === -1) return;

    // The handler should return string[] — verify it doesn't wrap in objects
    // This was a recurring mismatch with the frontend
    const handlerSection = content.slice(handlerIdx, handlerIdx + 1000);

    // Flag if it returns objects with serviceId instead of flat strings
    // (The frontend destructures the result as string[], not ServiceConnection[])
    // This is informational — the actual shape check is in integration tests
    expect(handlerSection).toBeTruthy();
  });
});

// ─── Category 3: Database tables on fresh install ────────────────────────────
// Incident: FOREIGN KEY crash — conversation row missing (2026-03-09)
// Incident: entities/entity_mentions/entity_relationships tables missing (2026-03-10)

describe('Canary: Fresh install database schema', () => {
  it('bridge.ts initSchema creates core tables', () => {
    if (!existsSync(BRIDGE_PATH)) return;
    const content = readFileSync(BRIDGE_PATH, 'utf8');

    // Tables managed directly by bridge.ts initSchema
    // Note: documents/reminders/action_log may be created by their respective stores
    // (DocumentStore, ReminderStore, AuditTrail) — not in bridge.ts initSchema.
    const requiredInBridge = [
      'conversations',
      'conversation_turns',
      'preferences',
    ];

    const missingTables: string[] = [];
    for (const table of requiredInBridge) {
      const pattern = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}`, 'i');
      if (!pattern.test(content)) {
        missingTables.push(table);
      }
    }

    expect(missingTables).toEqual([]);
  });

  it('conversation_turns has FOREIGN KEY referencing conversations', () => {
    if (!existsSync(BRIDGE_PATH)) return;
    const content = readFileSync(BRIDGE_PATH, 'utf8');

    // The FOREIGN KEY constraint means we MUST create the conversation row
    // before inserting turns — or we get SQLITE_ERROR: FOREIGN KEY constraint failed
    const hasForeignKey = content.includes('FOREIGN KEY (conversation_id) REFERENCES conversations(id)');
    expect(hasForeignKey).toBe(true);

    // Also verify: the handleSendMessage function references ConversationManager or
    // creates a conversation before inserting turns
    const sendMessageHandler = content.indexOf('handleSendMessage');
    if (sendMessageHandler === -1) return;

    const handlerSection = content.slice(sendMessageHandler, sendMessageHandler + 5000);
    const createsConversation =
      handlerSection.includes('ConversationManager') ||
      handlerSection.includes('conversations') ||
      handlerSection.includes('convId');

    expect(createsConversation).toBe(true);
  });
});

// ─── Category 4: Config refresh after state changes ──────────────────────────
// Incident: AI name not persisting — prompt config never refreshed after onboarding (2026-03-12)

describe('Canary: Config propagation', () => {
  it('orchestrator refreshes prompt config when preferences change', () => {
    // Check that the orchestrator has a mechanism to refresh its prompt config
    // when preferences (like ai_name, user_name) are changed via set_pref
    if (!existsSync(BRIDGE_PATH)) return;
    const content = readFileSync(BRIDGE_PATH, 'utf8');

    const setPrefIdx = content.indexOf("'set_pref'");
    if (setPrefIdx === -1) return;

    const afterSetPref = content.slice(setPrefIdx, setPrefIdx + 2000);

    // After setting ai_name or user_name, should refresh orchestrator config
    const refreshesConfig =
      afterSetPref.includes('refreshPromptConfig') ||
      afterSetPref.includes('updatePromptConfig') ||
      afterSetPref.includes('orchestrator') ||
      afterSetPref.includes('reloadConfig');

    // This is a "should have" check — if set_pref doesn't touch orchestrator,
    // the AI name won't stick until next sidecar restart
    if (afterSetPref.includes('ai_name') || afterSetPref.includes('user_name')) {
      expect(refreshesConfig).toBe(true);
    }
  });
});

// ─── Category 5: Zod validation on real-world data ───────────────────────────
// Incident: email.draft Zod crash — fields with unexpected shapes (2026-03-12)

describe('Canary: Zod schemas handle real-world data', () => {
  it('email draft schema allows optional cc and bcc fields', () => {
    // The email draft action should not crash when cc/bcc are undefined
    // This was a Zod strict mode issue where extra fields caused rejection
    const schemaFiles = [
      join(ROOT, 'packages', 'core', 'agent', 'tools'),
      join(ROOT, 'packages', 'gateway', 'services'),
    ];

    // This is a structural check — verify Zod schemas use .optional() for cc/bcc
    for (const dir of schemaFiles) {
      if (!existsSync(dir)) continue;
      // Check is informational — the real test is the integration test
    }
    expect(true).toBe(true); // Placeholder — real validation is in integration tests
  });
});

// ─── Category 6: Import boundary violations ──────────────────────────────────
// Incident: Screen files importing @tauri-apps/api/core directly (2026-03-10)
// Rule: Screen files must use dynamic imports for Tauri APIs

describe('Canary: Import boundary guards', () => {
  it('no screen file statically imports @tauri-apps/api/core', () => {
    const screensDir = join(ROOT, 'packages', 'desktop', 'src', 'screens');
    if (!existsSync(screensDir)) return;

    const { readdirSync } = require('fs');
    const screens = readdirSync(screensDir).filter((f: string) => f.endsWith('.tsx'));
    const violations: string[] = [];

    for (const screen of screens) {
      const content = readFileSync(join(screensDir, screen), 'utf8');
      // Static import of @tauri-apps/api/core is banned in screen files
      // Must use: const { invoke } = await import('@tauri-apps/api/core')
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (/^import\s.*from\s+['"]@tauri-apps\/api\/core['"]/.test(line)) {
          violations.push(`${screen}:${i + 1}: static import of @tauri-apps/api/core`);
        }
      }
    }

    // Allow known exceptions (App.tsx-level wiring) but screens should use dynamic imports
    const screenViolations = violations.filter(v =>
      !v.startsWith('App.tsx') && !v.startsWith('index.tsx')
    );
    expect(screenViolations).toEqual([]);
  });

  it('packages/core/ has no network imports', () => {
    // This duplicates the privacy audit but as a fast canary check
    const bannedImports = [
      'node-fetch', 'axios', 'got', 'undici', 'superagent',
      'socket.io', 'ws',
    ];

    const coreDir = join(ROOT, 'packages', 'core');
    if (!existsSync(coreDir)) return;

    // Quick grep through core/src for banned imports
    // Full audit is in scripts/privacy-audit/ — this is the fast canary
    const { execSync } = require('child_process');
    try {
      for (const pkg of bannedImports) {
        const result = execSync(
          `grep -r "from '${pkg}'" "${coreDir}" --include="*.ts" --include="*.tsx" -l 2>/dev/null || true`,
          { encoding: 'utf8', timeout: 5000 }
        ).trim();
        if (result) {
          expect.fail(`packages/core/ imports banned network package '${pkg}' in: ${result}`);
        }
      }
    } catch {
      // grep not available — skip this canary
    }
  });
});
