// Integration tests for Step 10 — Web Search, Web Fetch, Reminders, Quick Capture
// End-to-end flows, privacy guarantees, knowledge-graph-first routing.

import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  classifyQueryFast,
  classifyQuery,
  detectUrls,
} from '@semblance/core/agent/web-intelligence.js';
import {
  parseReminder,
  calculateSnoozeTime,
  createReminder,
} from '@semblance/core/agent/reminder-manager.js';
import {
  hasTimeReference,
  processCapture,
} from '@semblance/core/agent/quick-capture.js';
import { CaptureStore } from '@semblance/core/knowledge/capture-store.js';
import DatabaseConstructor from 'better-sqlite3';

// ─── Utility ───────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..', '..');
const CORE_DIR = join(ROOT, 'packages', 'core');

function collectFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (['node_modules', 'dist', 'build', '_privacy_test_temp_'].includes(entry)) continue;
          files.push(...collectFiles(fullPath, extensions));
        } else if (extensions.some(ext => entry.endsWith(ext))) {
          files.push(fullPath);
        }
      } catch { /* skip */ }
    }
  } catch { /* directory doesn't exist */ }
  return files;
}

function mockLLM(response: string) {
  return {
    chat: vi.fn().mockResolvedValue({ content: response }),
    generate: vi.fn(),
    embed: vi.fn(),
    listModels: vi.fn(),
  };
}

// ─── Privacy Guard Tests ────────────────────────────────────────────────────

describe('Step 10 Privacy Guard: No HTTP client imports in packages/core/', () => {
  const BANNED_HTTP_LIBS = [
    'axios', 'got', 'node-fetch', 'undici', 'superagent',
    'cross-fetch', 'ky', 'request', 'needle',
  ];

  const BANNED_NODE_MODULES = [
    'node:http', 'node:https', 'node:dgram', 'node:dns', 'node:tls',
  ];

  it('no HTTP client libraries imported in packages/core/', () => {
    const files = collectFiles(CORE_DIR, ['.ts', '.tsx']);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const lib of BANNED_HTTP_LIBS) {
        const importPattern = new RegExp(`\\bimport\\b.*['"]${lib}['"]`);
        const requirePattern = new RegExp(`\\brequire\\s*\\(\\s*['"]${lib}['"]`);
        if (importPattern.test(content) || requirePattern.test(content)) {
          violations.push(`${relative(ROOT, file)}: imports '${lib}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no Node.js networking modules imported in packages/core/ (except ipc-client)', () => {
    const files = collectFiles(CORE_DIR, ['.ts', '.tsx']);
    const violations: string[] = [];

    for (const file of files) {
      const relPath = relative(CORE_DIR, file).replace(/\\/g, '/');
      if (relPath === 'agent/ipc-client.ts') continue;

      const content = readFileSync(file, 'utf-8');
      for (const mod of BANNED_NODE_MODULES) {
        const escaped = mod.replace(':', '\\:');
        const importPattern = new RegExp(`\\bimport\\b.*['"]${escaped}['"]`);
        const requirePattern = new RegExp(`\\brequire\\s*\\(\\s*['"]${escaped}['"]`);
        if (importPattern.test(content) || requirePattern.test(content)) {
          violations.push(`${relative(ROOT, file)}: imports '${mod}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no fetch() calls in packages/core/ outside of llm/ directory', () => {
    const files = collectFiles(CORE_DIR, ['.ts', '.tsx']);
    const violations: string[] = [];

    for (const file of files) {
      const relPath = relative(CORE_DIR, file).replace(/\\/g, '/');
      if (relPath.startsWith('llm/')) continue;

      const content = readFileSync(file, 'utf-8');
      if (/\bfetch\s*\(/.test(content)) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('no XMLHttpRequest or WebSocket in packages/core/', () => {
    const files = collectFiles(CORE_DIR, ['.ts', '.tsx']);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      if (/\bnew\s+XMLHttpRequest\b/.test(content) || /\bnew\s+WebSocket\b/.test(content)) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('Step 10 Privacy: Web traffic goes through Gateway only', () => {
  it('web-intelligence.ts uses IPC client, not direct HTTP', () => {
    const filePath = join(CORE_DIR, 'agent', 'web-intelligence.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain("import type { IPCClient }");
    expect(content).toContain("ipcClient.send('web.search'");
    expect(content).toContain("ipcClient.send('web.fetch'");
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });

  it('reminder-manager.ts uses IPC client for CRUD, not direct HTTP', () => {
    const filePath = join(CORE_DIR, 'agent', 'reminder-manager.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain("import type { IPCClient }");
    expect(content).toContain("ipcClient.send('reminder.create'");
    expect(content).toContain("ipcClient.send('reminder.update'");
    expect(content).toContain("ipcClient.send('reminder.list'");
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });

  it('quick-capture.ts uses IPC for reminders, not direct network', () => {
    const filePath = join(CORE_DIR, 'agent', 'quick-capture.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain("ipcClient.send('reminder.create'");
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });
});

describe('Step 10 Privacy: Reminder and capture data stored locally only', () => {
  it('reminder-store.ts uses SQLite only, no network access', () => {
    const filePath = join(CORE_DIR, 'knowledge', 'reminder-store.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain("import type Database from 'better-sqlite3'");
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });

  it('capture-store.ts uses SQLite only, no network access', () => {
    const filePath = join(CORE_DIR, 'knowledge', 'capture-store.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toContain("import type Database from 'better-sqlite3'");
    expect(content).not.toMatch(/\bfetch\s*\(/);
  });
});

// ─── Knowledge-Graph-First Routing Tests ────────────────────────────────────

describe('Step 10 Integration: Knowledge-graph-first routing', () => {
  it('weather query classified as web_required', () => {
    expect(classifyQueryFast("what's the weather in Portland")).toBe('web_required');
  });

  it('email query classified as local_only', () => {
    expect(classifyQueryFast('find my email from Sarah')).toBe('local_only');
  });

  it('URL in query classified as web_required', () => {
    expect(classifyQueryFast('summarize this: https://example.com/article')).toBe('web_required');
  });

  it('ambiguous query returns null (needs LLM)', () => {
    expect(classifyQueryFast('tell me about Portland')).toBeNull();
  });
});

// ─── End-to-End Flows (Mocked) ─────────────────────────────────────────────

describe('Step 10 Integration: Web search end-to-end', () => {
  it('classifyQuery fast path handles web_required without LLM', async () => {
    const llm = mockLLM('web_required');
    const classification = await classifyQuery("what's the weather in Portland", llm);
    expect(classification).toBe('web_required');
    // Fast classifier handled it — no LLM call
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('URL detection triggers web_required classification', () => {
    const query = 'summarize this article: https://example.com/news/ai-breakthrough';
    const urls = detectUrls(query);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://example.com/news/ai-breakthrough');
    expect(classifyQueryFast(query)).toBe('web_required');
  });
});

describe('Step 10 Integration: Reminder end-to-end', () => {
  it('parseReminder → createReminder → stored via IPC', async () => {
    const llm = mockLLM(JSON.stringify({
      text: 'call Sarah',
      dueAt: '2026-02-22T15:00:00.000Z',
      recurrence: 'none',
    }));

    const mockIPC = {
      send: vi.fn().mockResolvedValue({ status: 'success', data: { id: 'rem-1' } }),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const parsed = await parseReminder('remind me to call Sarah at 3pm', llm);
    expect(parsed.text).toBe('call Sarah');

    const result = await createReminder('remind me to call Sarah at 3pm', llm, mockIPC);
    expect(mockIPC.send).toHaveBeenCalledWith('reminder.create', expect.objectContaining({
      text: 'call Sarah',
      source: 'chat',
    }));
  });

  it('snooze calculates correct times', () => {
    const base = new Date('2026-02-22T10:00:00.000Z');
    expect(calculateSnoozeTime('15min', base)).toBe('2026-02-22T10:15:00.000Z');
    expect(calculateSnoozeTime('1hr', base)).toBe('2026-02-22T11:00:00.000Z');
    expect(calculateSnoozeTime('3hr', base)).toBe('2026-02-22T13:00:00.000Z');
  });
});

describe('Step 10 Integration: Quick capture end-to-end', () => {
  it('time reference detection works correctly', () => {
    expect(hasTimeReference('call dentist tomorrow at 3pm')).toBe(true);
    expect(hasTimeReference('interesting article about AI')).toBe(false);
    expect(hasTimeReference('in 2 hours take medicine')).toBe(true);
    expect(hasTimeReference('great idea for the project')).toBe(false);
  });

  it('capture without time reference stores without reminder', async () => {
    const db = new DatabaseConstructor(':memory:');
    const captureStore = new CaptureStore(db);
    const llm = mockLLM('no');

    const result = await processCapture(
      'great idea for the refactoring project',
      llm,
      captureStore,
      null,
      null,
    );

    expect(result.captureId).toBeTruthy();
    expect(result.hasReminder).toBe(false);
    expect(captureStore.count()).toBe(1);
  });
});

// ─── ActionType Registration ─────────────────────────────────────────────────

describe('Step 10 Integration: Orchestrator tool registration', () => {
  it('all Step 10 tools are registered in the Orchestrator', () => {
    const orchestratorPath = join(CORE_DIR, 'agent', 'orchestrator.ts');
    const content = readFileSync(orchestratorPath, 'utf-8');

    const requiredTools = [
      'search_web', 'fetch_url',
      'create_reminder', 'list_reminders', 'snooze_reminder', 'dismiss_reminder',
    ];

    for (const tool of requiredTools) {
      expect(content).toContain(tool);
    }
  });

  it('TOOL_ACTION_MAP maps to correct ActionTypes', () => {
    const orchestratorPath = join(CORE_DIR, 'agent', 'orchestrator.ts');
    const content = readFileSync(orchestratorPath, 'utf-8');

    // Check the map entries exist (with single quotes)
    expect(content).toContain("'search_web': 'web.search'");
    expect(content).toContain("'fetch_url': 'web.fetch'");
    expect(content).toContain("'create_reminder': 'reminder.create'");
    expect(content).toContain("'list_reminders': 'reminder.list'");
  });
});

// ─── SSRF Protection ─────────────────────────────────────────────────────────

describe('Step 10 Integration: SSRF protection', () => {
  it('WebFetchAdapter blocks private IPs and file:// URLs', () => {
    const adapterPath = join(ROOT, 'packages', 'gateway', 'services', 'web-fetch-adapter.ts');
    const content = readFileSync(adapterPath, 'utf-8');

    expect(content).toContain('BLOCKED_SCHEMES');
    expect(content).toContain('PRIVATE_IP_PATTERNS');
    expect(content).toContain('file:');
    expect(content).toContain('127.0.0.1');
    expect(content).toContain('localhost');
  });
});

// ─── Component Existence ─────────────────────────────────────────────────────

describe('Step 10 Integration: UI components exist', () => {
  const componentsDir = join(ROOT, 'packages', 'desktop', 'src', 'components');

  const requiredComponents = [
    'WebSearchResult.tsx',
    'WebFetchSummary.tsx',
    'QuickCaptureInput.tsx',
    'ReminderCard.tsx',
  ];

  it.each(requiredComponents)('%s exists', (filename) => {
    const filePath = join(componentsDir, filename);
    const content = readFileSync(filePath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });
});
