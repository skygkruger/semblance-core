// Intent Wiring — Structural tests for bridge.ts and lib.rs intent layer integration.
// Verifies imports, state variables, command handlers, and Tauri command registration.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

// ─── Bridge Wiring ─────────────────────────────────────────────────────────

describe('Intent wiring — bridge.ts', () => {
  const bridge = readFile('packages/desktop/src-tauri/sidecar/bridge.ts');

  it('imports IntentManager', () => {
    expect(bridge).toContain('IntentManager');
    const importMatch = bridge.match(/import\s*\{[^}]*IntentManager[^}]*\}\s*from/);
    expect(importMatch).not.toBeNull();
  });

  it('has intentManager state variable', () => {
    expect(bridge).toContain('let intentManager');
  });

  it('initializes IntentManager in handleInitialize', () => {
    expect(bridge).toContain('new IntentManager');
  });

  it("handles 'get_intent' command", () => {
    expect(bridge).toContain("'get_intent'");
  });

  it("handles 'set_primary_goal' command", () => {
    expect(bridge).toContain("'set_primary_goal'");
  });

  it("handles 'add_hard_limit' command", () => {
    expect(bridge).toContain("'add_hard_limit'");
  });

  it("handles 'set_intent_onboarding' command", () => {
    expect(bridge).toContain("'set_intent_onboarding'");
  });
});

// ─── Rust Commands ─────────────────────────────────────────────────────────

describe('Intent wiring — lib.rs Tauri commands', () => {
  const libRs = readFile('packages/desktop/src-tauri/src/lib.rs');

  it('defines get_intent Tauri command', () => {
    expect(libRs).toContain('fn get_intent');
  });

  it('defines set_primary_goal Tauri command', () => {
    expect(libRs).toContain('fn set_primary_goal');
  });

  it('defines add_hard_limit Tauri command', () => {
    expect(libRs).toContain('fn add_hard_limit');
  });

  it('defines remove_hard_limit Tauri command', () => {
    expect(libRs).toContain('fn remove_hard_limit');
  });

  it('defines toggle_hard_limit Tauri command', () => {
    expect(libRs).toContain('fn toggle_hard_limit');
  });

  it('defines add_personal_value Tauri command', () => {
    expect(libRs).toContain('fn add_personal_value');
  });

  it('defines remove_personal_value Tauri command', () => {
    expect(libRs).toContain('fn remove_personal_value');
  });

  it('defines set_intent_onboarding Tauri command', () => {
    expect(libRs).toContain('fn set_intent_onboarding');
  });
});

// ─── generate_handler Registration ─────────────────────────────────────────

describe('Intent wiring — generate_handler registration', () => {
  const libRs = readFile('packages/desktop/src-tauri/src/lib.rs');

  it('registers all intent commands in generate_handler', () => {
    const handlerMatch = libRs.match(/generate_handler!\[([\s\S]*?)\]/);
    expect(handlerMatch).not.toBeNull();
    const handlerBlock = handlerMatch![1]!;
    expect(handlerBlock).toContain('get_intent');
    expect(handlerBlock).toContain('set_primary_goal');
    expect(handlerBlock).toContain('add_hard_limit');
    expect(handlerBlock).toContain('remove_hard_limit');
    expect(handlerBlock).toContain('toggle_hard_limit');
    expect(handlerBlock).toContain('add_personal_value');
    expect(handlerBlock).toContain('remove_personal_value');
    expect(handlerBlock).toContain('get_intent_observations');
    expect(handlerBlock).toContain('dismiss_observation');
    expect(handlerBlock).toContain('check_action_intent');
    expect(handlerBlock).toContain('set_intent_onboarding');
  });
});
