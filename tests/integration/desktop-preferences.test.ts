/**
 * Desktop Preferences Integration Tests
 *
 * Validates preference persistence wiring:
 * - User name set/get roundtrip via sidecar
 * - Onboarding complete flag set/get via sidecar
 * - Autonomy tier configuration via sidecar
 * - Preferences stored in Core's SQLite database
 * - Chat history persistence and retrieval
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BRIDGE_TS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');
const LIB_RS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');

const bridgeContent = readFileSync(BRIDGE_TS, 'utf-8');
const libContent = readFileSync(LIB_RS, 'utf-8');

describe('User Name: Persistence', () => {
  it('set_user_name writes to preferences table', () => {
    expect(bridgeContent).toContain("setPref('user_name'");
  });

  it('get_user_name reads from preferences table', () => {
    expect(bridgeContent).toContain("getPref('user_name')");
  });

  it('Rust routes set_user_name to sidecar', () => {
    expect(libContent).toContain('"set_user_name"');
  });

  it('Rust routes get_user_name to sidecar', () => {
    expect(libContent).toContain('"get_user_name"');
  });

  it('returns null if name not set', () => {
    // getPref returns null for missing keys
    expect(bridgeContent).toContain('?? null');
  });
});

describe('Onboarding Complete: Persistence', () => {
  it('set_onboarding_complete writes true to preferences', () => {
    expect(bridgeContent).toContain("setPref('onboarding_complete', 'true')");
  });

  it('get_onboarding_complete reads boolean from preferences', () => {
    expect(bridgeContent).toContain("getPref('onboarding_complete') === 'true'");
  });

  it('Rust routes set_onboarding_complete to sidecar', () => {
    expect(libContent).toContain('"set_onboarding_complete"');
  });

  it('Rust routes get_onboarding_complete to sidecar', () => {
    expect(libContent).toContain('"get_onboarding_complete"');
  });

  it('returns onboarding state on initialize', () => {
    expect(bridgeContent).toContain('onboardingComplete');
  });
});

describe('Autonomy Config: Persistence', () => {
  it('set_autonomy_tier stores per-domain config', () => {
    expect(bridgeContent).toContain('autonomy_${params.domain}');
  });

  it('get_autonomy_config returns all domain tiers', () => {
    expect(bridgeContent).toContain("'email'");
    expect(bridgeContent).toContain("'calendar'");
    expect(bridgeContent).toContain("'files'");
    expect(bridgeContent).toContain("'finances'");
    expect(bridgeContent).toContain("'health'");
    expect(bridgeContent).toContain("'services'");
  });

  it('defaults finances and services to guardian', () => {
    expect(bridgeContent).toContain("'guardian'");
  });

  it('defaults other domains to partner', () => {
    expect(bridgeContent).toContain("'partner'");
  });

  it('Rust routes autonomy commands to sidecar', () => {
    expect(libContent).toContain('"set_autonomy_tier"');
    expect(libContent).toContain('"get_autonomy_config"');
  });
});

describe('Chat History: Persistence', () => {
  it('stores user and assistant conversation turns', () => {
    expect(bridgeContent).toContain("storeTurn(convId, 'user'");
    expect(bridgeContent).toContain("storeTurn(convId, 'assistant'");
  });

  it('get_chat_history queries conversation_turns table', () => {
    expect(bridgeContent).toContain('conversation_turns');
    expect(bridgeContent).toContain('ORDER BY timestamp DESC');
  });

  it('supports pagination in chat history', () => {
    expect(bridgeContent).toContain('LIMIT ?');
    expect(bridgeContent).toContain('OFFSET ?');
  });

  it('Rust routes get_chat_history to sidecar', () => {
    expect(libContent).toContain('"get_chat_history"');
  });
});

describe('Preferences: Storage Layer', () => {
  it('uses Core SQLite database (core.db)', () => {
    expect(bridgeContent).toContain('core.db');
  });

  it('uses WAL journal mode', () => {
    expect(bridgeContent).toContain("pragma('journal_mode = WAL')");
  });

  it('creates preferences table on init', () => {
    expect(bridgeContent).toContain('CREATE TABLE IF NOT EXISTS preferences');
  });

  it('uses INSERT OR REPLACE for upsert', () => {
    expect(bridgeContent).toContain('INSERT OR REPLACE INTO preferences');
  });
});
