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
import { getLicenseStatus, activateLicenseKey, importFoundingReservation } from '../ipc/commands';
import type { ActivationResult, ReservationImportResult } from '../ipc/types';
import releaseManifest from '../../../../release/release-manifest.json';
import {
  openCheckout as openCheckoutUrl,
  requestPortalUrl,
  type CheckoutPlan,
} from './license-commerce';

// ─── Types ──────────────────────────────────────────────────────────────

export type LicenseTier = AppState['license']['tier'];

export type { ActivationResult } from '../ipc/types';

export interface LicenseContextValue {
  tier: LicenseTier;
  isPremium: boolean;
  isFoundingMember: boolean;
  foundingSeat: number | null;
  activateKey: (key: string) => Promise<ActivationResult>;
  importReservation: (token: string) => Promise<ReservationImportResult>;
  newSalesEnabled: boolean;
  openCheckout: (plan: 'monthly' | 'founding' | 'lifetime') => void;
  manageSubscription: () => void;
  refresh: () => Promise<void>;
}

// ─── Context ────────────────────────────────────────────────────────────

const DEFAULT_LICENSE: LicenseContextValue = {
  tier: 'free',
  isPremium: false,
  isFoundingMember: false,
  foundingSeat: null,
  activateKey: async () => ({ success: false, error: 'LicenseProvider not mounted' }),
  importReservation: async () => ({
    valid: false,
    kind: 'reservation_only',
    seat: null,
    error: 'LicenseProvider not mounted',
  }),
  newSalesEnabled: false,
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

  const importReservation = useCallback(async (token: string): Promise<ReservationImportResult> => {
    try {
      return await importFoundingReservation(token);
    } catch (err) {
      return {
        valid: false,
        kind: 'reservation_only',
        seat: null,
        error: String(err),
      };
    }
  }, []);

  const openExternal = useCallback((url: string) => {
    import('@tauri-apps/plugin-shell').then((shell) => {
      void shell.open(url);
    }).catch(() => {
      // Fallback for environments without shell plugin
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }, []);

  const openCheckout = useCallback((plan: CheckoutPlan) => {
    openCheckoutUrl(
      plan,
      releaseManifest.commerce.newSalesEnabled,
      openExternal,
    );
  }, [openExternal]);

  const manageSubscription = useCallback(() => {
    if (!licenseKey) return;

    requestPortalUrl(licenseKey)
      .then((approvedUrl) => {
        if (approvedUrl) {
          openExternal(approvedUrl);
        }
      })
      .catch(() => {
        // Portal unavailable — silently fail, user can manage at stripe.com directly
      });
  }, [licenseKey, openExternal]);

  const value = useMemo((): LicenseContextValue => ({
    tier,
    isPremium,
    isFoundingMember,
    foundingSeat,
    activateKey,
    importReservation,
    newSalesEnabled: releaseManifest.commerce.newSalesEnabled,
    openCheckout,
    manageSubscription,
    refresh,
  }), [tier, isPremium, isFoundingMember, foundingSeat, activateKey, importReservation, openCheckout, manageSubscription, refresh]);

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
