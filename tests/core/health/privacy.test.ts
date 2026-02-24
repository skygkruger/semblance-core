/**
 * Step 22 — Privacy tests (STRICTEST for health).
 * Zero network, zero gateway, zero IPC in health/.
 * LLM receives computed statistics only, never raw health entries.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readAllHealthFiles(): string {
  const healthDir = path.join(process.cwd(), 'packages', 'core', 'health');
  if (!fs.existsSync(healthDir)) return '';

  const files = fs.readdirSync(healthDir).filter(f => f.endsWith('.ts'));
  let combined = '';
  for (const file of files) {
    combined += fs.readFileSync(path.join(healthDir, file), 'utf-8') + '\n';
  }
  return combined;
}

describe('Health Privacy Audit (Step 22)', () => {
  const code = readAllHealthFiles();

  it('zero network imports in packages/core/health/', () => {
    expect(code).not.toMatch(/from\s+['"]node:http['"]/);
    expect(code).not.toMatch(/from\s+['"]node:https['"]/);
    expect(code).not.toMatch(/from\s+['"]node:net['"]/);
    expect(code).not.toMatch(/from\s+['"]node:dgram['"]/);
    expect(code).not.toMatch(/from\s+['"]axios['"]/);
    expect(code).not.toMatch(/from\s+['"]got['"]/);
    expect(code).not.toMatch(/from\s+['"]node-fetch['"]/);
    expect(code).not.toMatch(/from\s+['"]undici['"]/);
  });

  it('zero gateway imports in packages/core/health/', () => {
    expect(code).not.toMatch(/from\s+['"].*@semblance\/gateway/);
    expect(code).not.toMatch(/from\s+['"].*packages\/gateway/);
  });

  it('zero IPC client imports in packages/core/health/', () => {
    // Health NEVER uses IPC — all data stays local
    expect(code).not.toMatch(/from\s+['"].*ipc-client/);
    expect(code).not.toMatch(/IPCClient/);
    expect(code).not.toMatch(/ipcClient/);
    expect(code).not.toMatch(/sendAction/);
  });

  it('HealthKit adapter never transmits data (interface-level)', () => {
    // The adapter interface should have fetch methods that return local data
    expect(code).toContain('fetchSteps');
    expect(code).toContain('fetchSleep');
    expect(code).toContain('fetchHeartRate');
    expect(code).toContain('fetchWorkouts');
    // But no send/transmit/upload methods
    expect(code).not.toMatch(/\bsendHealth\b/);
    expect(code).not.toMatch(/\buploadHealth\b/);
    expect(code).not.toMatch(/\btransmitHealth\b/);
  });

  it('LLM receives computed statistics only, never raw health entries', () => {
    // The generateInsightDescription prompt should reference computed stats
    expect(code).toContain('Correlation');
    expect(code).toContain('Sample');
    // Should NOT pass raw HealthEntry arrays to LLM
    expect(code).not.toMatch(/llm\.chat.*health_entries/);
    expect(code).not.toMatch(/llm\.generate.*HealthEntry/);
  });
});
