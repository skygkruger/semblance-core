/**
 * LicenseContext — React context for license state and activation actions.
 *
 * Wraps AppState.license with convenience methods for:
 * - Checking premium status and current tier
 * - Activating sem_ license keys and founding tokens via Tauri commands
 * - Opening checkout in system browser (NO in-app network)
 * - Managing subscription via Stripe Billing Portal
 * - Refreshing license status from the sidecar
 *
 * Uses existing AppStateContext and AppDispatchContext — reads state.license,
 * dispatches SET_LICENSE.
 */

import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { useAppState, useAppDispatch } from '../state/AppState';
import type { AppState } from '../state/AppState';
import { getLicenseStatus, activateLicenseKey, activateFoundingToken } from '../ipc/commands';
import type { ActivationResult } from '../ipc/types';

// ─── Types ──────────────────────────────────────────────────────────────

export type LicenseTier = AppState['license']['tier'];

export type { ActivationResult } from '../ipc/types';

export interface LicenseContextValue {
  tier: LicenseTier;
  isPremium: boolean;
  isFoundingMember: boolean;
  foundingSeat: number | null;
  activateKey: (key: string) => Promise<ActivationResult>;
  activateFoundingToken: (token: string) => Promise<ActivationResult>;
  openCheckout: (plan: 'monthly' | 'founding' | 'lifetime') => void;
  manageSubscription: () => void;
  refresh: () => Promise<void>;
}

// ─── Payment Links ──────────────────────────────────────────────────────

const PAYMENT_LINKS: Record<'monthly' | 'founding' | 'lifetime', string> = {
  monthly: 'https://buy.stripe.com/7sYcN6dS98Ob7TYc4a1VK03',
  founding: 'https://buy.stripe.com/5kQ8wQ8xP2pN1vA0ls1VK04',
  lifetime: 'https://buy.stripe.com/8x23cw6pH7K71vAfgm1VK05',
};

const WORKER_URL = 'https://semblance-license-worker.conduit-gw.workers.dev';

// ─── Context ────────────────────────────────────────────────────────────

const DEFAULT_LICENSE: LicenseContextValue = {
  tier: 'free',
  isPremium: false,
  isFoundingMember: false,
  foundingSeat: null,
  activateKey: async () => ({ success: false, error: 'LicenseProvider not mounted' }),
  activateFoundingToken: async () => ({ success: false, error: 'LicenseProvider not mounted' }),
  openCheckout: () => {},
  manageSubscription: () => {},
  refresh: async () => {},
};

const LicenseContext = createContext<LicenseContextValue>(DEFAULT_LICENSE);

// ─── Provider ───────────────────────────────────────────────────────────

export function LicenseProvider({ children }: { children: ReactNode }) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const { tier, isFoundingMember, foundingSeat, licenseKey } = state.license;
  const isPremium = tier !== 'free';

  const refresh = useCallback(async () => {
    try {
      const status = await getLicenseStatus();
      dispatch({
        type: 'SET_LICENSE',
        license: {
          tier: status.tier,
          isFoundingMember: status.isFoundingMember,
          foundingSeat: status.foundingSeat,
          licenseKey: status.licenseKey,
        },
      });
    } catch {
      // License status not available — keep current state
    }
  }, [dispatch]);

  const activateKey = useCallback(async (key: string): Promise<ActivationResult> => {
    try {
      const result = await activateLicenseKey(key);
      if (result.success) {
        await refresh();
      }
      return result;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }, [refresh]);

  const activateFoundingToken = useCallback(async (token: string): Promise<ActivationResult> => {
    try {
      const result = await activateFoundingToken(token);
      if (result.success) {
        await refresh();
      }
      return result;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }, [refresh]);

  const openCheckout = useCallback((plan: 'monthly' | 'founding' | 'lifetime') => {
    const url = PAYMENT_LINKS[plan];
    // Open in system browser — NO in-app network calls
    // @ts-expect-error — Tauri shell plugin may not have types in all environments
    window.__TAURI__?.shell?.open?.(url)?.catch?.(() => {
      // Fallback: window.open (won't work in Tauri webview but is a safe fallback)
      window.open(url, '_blank');
    });
  }, []);

  const manageSubscription = useCallback(() => {
    if (!licenseKey) return;

    // Request a Stripe Billing Portal session from the license worker.
    // The worker returns a portal URL which we open in the system browser.
    // This fetch is intentional — it goes to our own infrastructure, not
    // arbitrary network. The response is a single URL string, not user data.
    fetch(`${WORKER_URL}/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    })
      .then((res) => res.json() as Promise<{ url?: string; error?: string }>)
      .then((data) => {
        if (data.url) {
          // @ts-expect-error — Tauri shell plugin may not have types in all environments
          window.__TAURI__?.shell?.open?.(data.url)?.catch?.(() => {
            window.open(data.url, '_blank');
          });
        }
      })
      .catch(() => {
        // Portal unavailable — silently fail, user can manage at stripe.com directly
      });
  }, [licenseKey]);

  const value = useMemo((): LicenseContextValue => ({
    tier,
    isPremium,
    isFoundingMember,
    foundingSeat,
    activateKey,
    activateFoundingToken,
    openCheckout,
    manageSubscription,
    refresh,
  }), [tier, isPremium, isFoundingMember, foundingSeat, activateKey, activateFoundingToken, openCheckout, manageSubscription, refresh]);

  return (
    <LicenseContext.Provider value={value}>
      {children}
    </LicenseContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useLicense(): LicenseContextValue {
  return useContext(LicenseContext);
}
