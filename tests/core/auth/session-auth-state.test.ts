// SessionAuthState Tests — In-memory session-scoped biometric auth state.
//
// Covers:
// - Session-scoped features unlock once and stay unlocked
// - Per-activation features always return false from isAuthenticated()
// - markAuthenticated() is a no-op for per-activation features
// - clearAll() resets all unlocked features
// - State is never persisted (structural — verified by source scan)

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionAuthState } from '@semblance/desktop/auth/session';
import type { ProtectedFeature } from '@semblance/core/auth/types';
import { PER_ACTIVATION_FEATURES } from '@semblance/core/auth/types';

describe('SessionAuthState', () => {
  let session: SessionAuthState;

  beforeEach(() => {
    session = new SessionAuthState();
  });

  // ─── Session-Scoped Features ────────────────────────────────────────────

  it('isAuthenticated returns false before any authentication', () => {
    expect(session.isAuthenticated('app_launch')).toBe(false);
    expect(session.isAuthenticated('privacy_dashboard')).toBe(false);
    expect(session.isAuthenticated('financial_screen')).toBe(false);
    expect(session.isAuthenticated('health_screen')).toBe(false);
  });

  it('markAuthenticated unlocks a session-scoped feature', () => {
    session.markAuthenticated('app_launch');
    expect(session.isAuthenticated('app_launch')).toBe(true);
  });

  it('unlocked feature stays unlocked within session', () => {
    session.markAuthenticated('privacy_dashboard');
    expect(session.isAuthenticated('privacy_dashboard')).toBe(true);
    // Repeated checks still return true
    expect(session.isAuthenticated('privacy_dashboard')).toBe(true);
    expect(session.isAuthenticated('privacy_dashboard')).toBe(true);
  });

  it('different session-scoped features are independent', () => {
    session.markAuthenticated('privacy_dashboard');
    expect(session.isAuthenticated('privacy_dashboard')).toBe(true);
    expect(session.isAuthenticated('financial_screen')).toBe(false);
    expect(session.isAuthenticated('health_screen')).toBe(false);
  });

  it('multiple features can be unlocked simultaneously', () => {
    session.markAuthenticated('app_launch');
    session.markAuthenticated('privacy_dashboard');
    session.markAuthenticated('health_screen');

    expect(session.isAuthenticated('app_launch')).toBe(true);
    expect(session.isAuthenticated('privacy_dashboard')).toBe(true);
    expect(session.isAuthenticated('health_screen')).toBe(true);
    expect(session.isAuthenticated('financial_screen')).toBe(false);
  });

  // ─── Per-Activation Features ────────────────────────────────────────────

  it('isAuthenticated always returns false for alter_ego_activation', () => {
    session.markAuthenticated('alter_ego_activation');
    expect(session.isAuthenticated('alter_ego_activation')).toBe(false);
  });

  it('isAuthenticated always returns false for digital_representative_activation', () => {
    session.markAuthenticated('digital_representative_activation');
    expect(session.isAuthenticated('digital_representative_activation')).toBe(false);
  });

  it('markAuthenticated is a no-op for per-activation features', () => {
    session.markAuthenticated('alter_ego_activation');
    session.markAuthenticated('digital_representative_activation');
    // Even after marking, they should not be in the unlocked set
    expect(session.isAuthenticated('alter_ego_activation')).toBe(false);
    expect(session.isAuthenticated('digital_representative_activation')).toBe(false);
  });

  it('PER_ACTIVATION_FEATURES includes exactly alter_ego and digital_representative', () => {
    expect(PER_ACTIVATION_FEATURES.has('alter_ego_activation')).toBe(true);
    expect(PER_ACTIVATION_FEATURES.has('digital_representative_activation')).toBe(true);
    expect(PER_ACTIVATION_FEATURES.has('app_launch' as ProtectedFeature)).toBe(false);
    expect(PER_ACTIVATION_FEATURES.has('privacy_dashboard' as ProtectedFeature)).toBe(false);
    expect(PER_ACTIVATION_FEATURES.size).toBe(2);
  });

  // ─── clearAll ──────────────────────────────────────────────────────────

  it('clearAll resets all unlocked features', () => {
    session.markAuthenticated('app_launch');
    session.markAuthenticated('privacy_dashboard');
    session.markAuthenticated('financial_screen');
    session.markAuthenticated('health_screen');

    session.clearAll();

    expect(session.isAuthenticated('app_launch')).toBe(false);
    expect(session.isAuthenticated('privacy_dashboard')).toBe(false);
    expect(session.isAuthenticated('financial_screen')).toBe(false);
    expect(session.isAuthenticated('health_screen')).toBe(false);
  });

  it('clearAll is safe to call when nothing is unlocked', () => {
    // Should not throw
    session.clearAll();
    expect(session.isAuthenticated('app_launch')).toBe(false);
  });

  it('features can be re-unlocked after clearAll', () => {
    session.markAuthenticated('app_launch');
    session.clearAll();
    expect(session.isAuthenticated('app_launch')).toBe(false);

    session.markAuthenticated('app_launch');
    expect(session.isAuthenticated('app_launch')).toBe(true);
  });
});
