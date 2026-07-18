/**
 * Founding Reservation Import — Integration / Wiring Tests
 *
 * Validates the full stack wiring: deep link → Rust handler → sidecar bridge →
 * reservation verification → hash-only reservation storage without entitlement.
 *
 * These are structural wiring tests that verify files contain the correct
 * integration points. Actual deep link testing requires a running Tauri app.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BRIDGE_TS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');
const LIB_RS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');
const TAURI_CONF = join(ROOT, 'packages', 'desktop', 'src-tauri', 'tauri.conf.json');
const CARGO_TOML = join(ROOT, 'packages', 'desktop', 'src-tauri', 'Cargo.toml');
const APP_TSX = join(ROOT, 'packages', 'desktop', 'src', 'App.tsx');
const APP_STATE_TSX = join(ROOT, 'packages', 'desktop', 'src', 'state', 'AppState.tsx');
const FOUNDING_TOKEN_TS = join(ROOT, 'packages', 'core', 'premium', 'founding-token.ts');
const PREMIUM_GATE_TS = join(ROOT, 'packages', 'core', 'premium', 'premium-gate.ts');
const PREMIUM_INDEX_TS = join(ROOT, 'packages', 'core', 'premium', 'index.ts');

const bridgeContent = readFileSync(BRIDGE_TS, 'utf-8');
const libContent = readFileSync(LIB_RS, 'utf-8');
const tauriConf = JSON.parse(readFileSync(TAURI_CONF, 'utf-8'));
const cargoContent = readFileSync(CARGO_TOML, 'utf-8');
const appContent = readFileSync(APP_TSX, 'utf-8');
const appStateContent = readFileSync(APP_STATE_TSX, 'utf-8');
const foundingTokenContent = readFileSync(FOUNDING_TOKEN_TS, 'utf-8');
const premiumGateContent = readFileSync(PREMIUM_GATE_TS, 'utf-8');
const premiumIndexContent = readFileSync(PREMIUM_INDEX_TS, 'utf-8');

// ─── Phase 1: Token Verification Module ─────────────────────────────────────

describe('Phase 1: Founding Token Module', () => {
  it('founding-token.ts exists with verifyFoundingToken export', () => {
    expect(foundingTokenContent).toContain('export function verifyFoundingToken');
  });

  it('founding-token.ts embeds an Ed25519 public key', () => {
    expect(foundingTokenContent).toContain('-----BEGIN PUBLIC KEY-----');
    expect(foundingTokenContent).toContain('Ed25519');
  });

  it('founding-token.ts uses node:crypto for verification (no network)', () => {
    expect(foundingTokenContent).toContain("from 'node:crypto'");
    expect(foundingTokenContent).not.toContain("from 'node:http'");
    expect(foundingTokenContent).not.toContain("from 'node:https'");
    expect(foundingTokenContent).not.toContain("from 'node:net'");
  });

  it('founding-token.ts validates seat number range (1-500)', () => {
    expect(foundingTokenContent).toContain('MAX_FOUNDING_SEAT');
    expect(foundingTokenContent).toContain('500');
  });

});

describe('Phase 1b: PremiumGate Founding Extension', () => {
  it('LicenseTier includes founding', () => {
    expect(premiumGateContent).toContain("'founding'");
  });

  it('TIER_RANK includes founding at rank 1', () => {
    expect(premiumGateContent).toContain("'founding': 1");
  });

  it('has no founding-reservation activation writer', () => {
    expect(premiumGateContent).not.toContain('activateFoundingMember');
  });

  it('isFoundingMember method exists', () => {
    expect(premiumGateContent).toContain('isFoundingMember');
  });

  it('getFoundingSeat method exists', () => {
    expect(premiumGateContent).toContain('getFoundingSeat');
  });

  it('founding_seat column added to license table', () => {
    expect(premiumGateContent).toContain('founding_seat');
  });

  it('founding tier never expires (handled in isPremium)', () => {
    expect(premiumGateContent).toContain("tier === 'founding'");
  });

  it('premium index exports founding token types', () => {
    expect(premiumIndexContent).toContain('verifyFoundingToken');
    expect(premiumIndexContent).toContain('FoundingTokenResult');
    expect(premiumIndexContent).toContain('ReservationVerification');
  });
});

// ─── Phase 2: Tauri Deep Link Support ───────────────────────────────────────

describe('Phase 2: Tauri Deep Link Plugin', () => {
  it('Cargo.toml includes tauri-plugin-deep-link', () => {
    expect(cargoContent).toContain('tauri-plugin-deep-link');
  });

  it('tauri.conf.json registers semblance:// scheme', () => {
    expect(tauriConf.plugins).toBeDefined();
    expect(tauriConf.plugins['deep-link']).toBeDefined();
    expect(tauriConf.plugins['deep-link'].desktop.schemes).toContain('semblance');
  });

  it('lib.rs initializes deep link plugin', () => {
    expect(libContent).toContain('tauri_plugin_deep_link::init()');
  });

  it('lib.rs listens for deep-link://new-url events', () => {
    expect(libContent).toContain('deep-link://new-url');
  });

  it('lib.rs emits reservation-import event to frontend', () => {
    expect(libContent).toContain('reservation-import');
    expect(libContent).not.toContain('founding-activate');
  });

  it('import_founding_reservation Tauri command exists', () => {
    expect(libContent).toContain('fn import_founding_reservation');
  });

  it('get_license_status Tauri command exists', () => {
    expect(libContent).toContain('fn get_license_status');
  });

  it('commands registered in invoke_handler', () => {
    expect(libContent).toContain('import_founding_reservation,');
    expect(libContent).toContain('get_license_status,');
  });
});

// ─── Phase 3: Sidecar Bridge Handlers ───────────────────────────────────────

describe('Phase 3: Sidecar Bridge License Handlers', () => {
  it('bridge.ts imports PremiumGate', () => {
    expect(bridgeContent).toContain('PremiumGate,');
  });

  it('bridge.ts initializes premiumGate', () => {
    expect(bridgeContent).toContain('premiumGate = new PremiumGate');
  });

  it('bridge.ts handles reservation:import method', () => {
    expect(bridgeContent).toContain("case 'reservation:import'");
    expect(bridgeContent).not.toContain("case 'license:activate_founding'");
  });

  it('bridge.ts handles license:status method', () => {
    expect(bridgeContent).toContain("case 'license:status'");
  });

  it('reservation:import calls reservation storage, not PremiumGate', () => {
    expect(bridgeContent).toContain('reservationStore.importReservation');
    expect(bridgeContent).not.toContain('activateFoundingMember');
  });

  it('license:status returns tier, isPremium, isFoundingMember, foundingSeat', () => {
    expect(bridgeContent).toContain('getLicenseTier()');
    expect(bridgeContent).toContain('isPremium()');
    expect(bridgeContent).toContain('isFoundingMember()');
    expect(bridgeContent).toContain('getFoundingSeat()');
  });
});

// ─── Phase 4: Frontend Integration ──────────────────────────────────────────

describe('Phase 4a: AppState License Fields', () => {
  it('AppState includes license field', () => {
    expect(appStateContent).toContain('license: {');
  });

  it('license field has tier, isFoundingMember, foundingSeat', () => {
    expect(appStateContent).toContain('isFoundingMember');
    expect(appStateContent).toContain('foundingSeat');
  });

  it('SET_LICENSE action type exists', () => {
    expect(appStateContent).toContain("'SET_LICENSE'");
  });

  it('reducer handles SET_LICENSE', () => {
    expect(appStateContent).toContain("case 'SET_LICENSE'");
  });

  it('initial license state is free', () => {
    expect(appStateContent).toContain("tier: 'free'");
    expect(appStateContent).toContain('isFoundingMember: false');
    expect(appStateContent).toContain('foundingSeat: null');
  });
});

describe('Phase 4b: App.tsx Deep Link Listener', () => {
  it('App.tsx imports listen from tauri events', () => {
    expect(appContent).toContain("from '@tauri-apps/api/event'");
  });

  it('App.tsx imports listen from tauri events for deep link handling', () => {
    // Phase 5 migrated raw invoke() to typed IPC wrappers; App.tsx uses listen for events
    expect(appContent).toContain("from '@tauri-apps/api/event'");
  });

  it('App.tsx hydrates license status on startup', () => {
    // License hydration is now done via LicenseContext.refresh()
    expect(appContent).toContain("license.refresh()");
  });

  it('App.tsx listens for reservation-import events', () => {
    expect(appContent).toContain("listen<{ token: string }>('reservation-import'");
  });

  it('App.tsx imports reservation recovery from a deep link', () => {
    expect(appContent).toContain("license.importReservation(event.payload.token)");
  });
});

describe('Phase 4c: Founding Member Integration', () => {
  // Founding member logic moved from OnboardingScreen (deleted) to LicenseContext and App.tsx.
  // OnboardingFlow delegates to semblance-ui components and does not contain founding member UI.
  const licenseContextContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src', 'contexts', 'LicenseContext.tsx'), 'utf-8');

  it('LicenseContext tracks isFoundingMember state', () => {
    expect(licenseContextContent).toContain('isFoundingMember');
  });

  it('LicenseContext tracks foundingSeat state', () => {
    expect(licenseContextContent).toContain('foundingSeat');
  });

  it('LicenseContext dispatches SET_LICENSE on activation', () => {
    expect(licenseContextContent).toContain("type: 'SET_LICENSE'");
  });

  it('App.tsx listens for reservation-import and calls importReservation', () => {
    expect(appContent).toContain("listen<{ token: string }>('reservation-import'");
    expect(appContent).toContain('license.importReservation');
  });

  it('App.tsx passes isFoundingMember and foundingSeat to UI', () => {
    expect(appContent).toContain('isFoundingMember={license.isFoundingMember}');
    expect(appContent).toContain('foundingSeat={license.foundingSeat}');
  });

  it('SettingsScreen passes license status to SettingsNavigator', () => {
    const settingsContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src', 'screens', 'SettingsScreen.tsx'), 'utf-8');
    // SettingsScreen delegates to SettingsNavigator, passing license status as props
    expect(settingsContent).toContain('licenseStatus=');
    expect(settingsContent).toContain('license.isPremium');
  });
});
