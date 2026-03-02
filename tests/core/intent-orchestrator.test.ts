// Structural tests for orchestrator integration: intent system prompt injection and hard limit enforcement.
// These verify the orchestrator source code is correctly wired to IntentManager,
// NOT full integration tests.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ORCHESTRATOR_PATH = path.resolve(
  __dirname,
  '../../packages/core/agent/orchestrator.ts',
);
const source = fs.readFileSync(ORCHESTRATOR_PATH, 'utf-8');

describe('Orchestrator ↔ IntentManager wiring (structural)', () => {
  it('orchestrator.ts imports IntentManager type', () => {
    expect(source).toMatch(/import\s+type\s*\{[^}]*IntentManager[^}]*\}\s+from\s+['"]\.\/intent-manager/);
  });

  it('orchestrator.ts has intentManager private field', () => {
    expect(source).toMatch(/private\s+intentManager\s*:\s*IntentManager\s*\|\s*null/);
  });

  it('OrchestratorImpl constructor config includes intentManager', () => {
    // The constructor parameter object includes intentManager?: IntentManager
    expect(source).toMatch(/intentManager\??:\s*IntentManager/);
  });

  it('buildMessages() includes intent context injection code', () => {
    // The method should append intentCtx to systemContent
    expect(source).toContain('intentCtx');
    expect(source).toContain('systemContent += ');
    expect(source).toMatch(/if\s*\(\s*intentCtx\s*\)/);
  });

  it('buildMessages() calls buildIntentContext()', () => {
    expect(source).toContain('.buildIntentContext()');
    // Verify it's called on the intentManager instance
    expect(source).toMatch(/this\.intentManager\.buildIntentContext\(\)/);
  });

  it('processToolCalls() includes hard limit enforcement block', () => {
    // The enforcement block checks intentManager and calls checkAction
    expect(source).toContain('HARD LIMIT ENFORCEMENT');
    expect(source).toContain('intentCheck.allowed');
    expect(source).toContain('intentCheck.matchedLimits');
  });

  it('processToolCalls() calls checkAction for intent checking', () => {
    expect(source).toContain('.checkAction(actionType, tc.arguments)');
    expect(source).toMatch(/this\.intentManager\.checkAction\(/);
  });

  it('hard limit block appears BEFORE extension handler check', () => {
    const hardLimitIdx = source.indexOf('HARD LIMIT ENFORCEMENT');
    const extensionIdx = source.indexOf('Extension tools — dispatch to registered handlers');

    expect(hardLimitIdx).toBeGreaterThan(-1);
    expect(extensionIdx).toBeGreaterThan(-1);
    expect(hardLimitIdx).toBeLessThan(extensionIdx);
  });

  it('setIntentManager method exists', () => {
    // The class should have a setIntentManager method that assigns the manager
    expect(source).toMatch(/setIntentManager\s*\(\s*manager\s*:\s*IntentManager\s*\)/);
    expect(source).toContain('this.intentManager = manager');
  });

  it('Orchestrator interface includes setIntentManager', () => {
    // The interface declaration should include setIntentManager as an optional method
    // Extract the interface block to verify
    const interfaceMatch = source.match(/export\s+interface\s+Orchestrator\s*\{[\s\S]*?\n\}/);
    expect(interfaceMatch).not.toBeNull();
    const interfaceBlock = interfaceMatch![0];
    expect(interfaceBlock).toContain('setIntentManager');
    expect(interfaceBlock).toMatch(/setIntentManager\??\s*\(\s*manager\s*:\s*IntentManager\s*\)/);
  });
});
