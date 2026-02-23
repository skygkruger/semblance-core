// Style Profile Provider — Wraps StyleProfileStore for the Digital Representative.
// Delegates to existing style infrastructure (style-profile, style-injector, style-scorer).
// CRITICAL: This file is in packages/core/. No network imports.

import type { StyleProfileStore, StyleProfile } from '../style/style-profile.js';
import { buildStylePrompt, buildInactiveStylePrompt, buildRetryPrompt } from '../style/style-injector.js';
import type { DraftContext } from '../style/style-injector.js';
import { scoreDraft } from '../style/style-scorer.js';
import type { StyleScore } from '../style/style-scorer.js';
import type { StyleProfileProvider } from './types.js';

export class StyleProfileProviderImpl implements StyleProfileProvider {
  private store: StyleProfileStore;

  constructor(store: StyleProfileStore) {
    this.store = store;
  }

  getProfile(): StyleProfile | null {
    return this.store.getActiveProfile();
  }

  hasMinimumData(): boolean {
    const profile = this.store.getActiveProfile();
    return profile !== null && profile.isActive;
  }

  getStyleScore(text: string): StyleScore | null {
    const profile = this.store.getActiveProfile();
    if (!profile || !profile.isActive) return null;
    return scoreDraft(text, profile);
  }

  getStylePrompt(ctx: DraftContext): string {
    const profile = this.store.getActiveProfile();
    if (!profile || !profile.isActive) {
      return buildInactiveStylePrompt();
    }
    return buildStylePrompt(profile, ctx);
  }

  getRetryPrompt(weakDimensions: Array<{ name: string; score: number }>): string {
    const profile = this.store.getActiveProfile();
    if (!profile || !profile.isActive) return '';
    return buildRetryPrompt(weakDimensions, profile);
  }
}
