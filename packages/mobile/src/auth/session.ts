// SessionAuthState — In-memory session-scoped biometric authentication state.
//
// Tracks which protected features have been unlocked in the current session.
// Session starts on successful app_launch auth.
// Session ends when app is backgrounded past OS suspend threshold (AppState listener).
//
// Per-activation features (alter_ego_activation, digital_representative_activation)
// always require re-authentication regardless of session state.
//
// CRITICAL: This state is NEVER persisted to disk. In-memory only.

import type { ProtectedFeature } from '@semblance/core/auth/types';
import { PER_ACTIVATION_FEATURES } from '@semblance/core/auth/types';

export class SessionAuthState {
  /** Features unlocked in this session */
  private unlocked: Set<ProtectedFeature> = new Set();

  /**
   * Check if a feature is authenticated for this session.
   * Per-activation features always return false (require re-auth every time).
   */
  isAuthenticated(feature: ProtectedFeature): boolean {
    if (PER_ACTIVATION_FEATURES.has(feature)) {
      return false;
    }
    return this.unlocked.has(feature);
  }

  /**
   * Mark a feature as authenticated for this session.
   * Per-activation features are NOT stored (they always require re-auth).
   */
  markAuthenticated(feature: ProtectedFeature): void {
    if (PER_ACTIVATION_FEATURES.has(feature)) {
      return;
    }
    this.unlocked.add(feature);
  }

  /**
   * Clear all session state. Called on app background past suspend threshold.
   */
  clearAll(): void {
    this.unlocked.clear();
  }
}

/** Singleton session state — one per app lifecycle */
export const sessionAuth = new SessionAuthState();
