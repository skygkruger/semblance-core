// Style Adapter Interface — Decouples orchestrator from style implementation.
// Implementation lives in @semblance/dr (private). This interface stays public.
// CRITICAL: This file is in packages/core/. No implementation logic. Types only.

import type { StyleProfile } from './style-profile.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DraftContext {
  recipientEmail?: string;
  recipientName?: string;
  isReply: boolean;
  subject: string;
  recipientContext?: string;
}

export interface StyleScore {
  overall: number;
  breakdown: {
    greeting: number;
    signoff: number;
    sentenceLength: number;
    formality: number;
    vocabulary: number;
  };
}

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface StyleAdapter {
  buildStylePrompt(profile: StyleProfile, context: DraftContext): string;
  buildInactiveStylePrompt(): string;
  buildRetryPrompt(
    weakDimensions: Array<{ name: string; score: number }>,
    profile: StyleProfile,
  ): string;
  scoreDraft(draft: string, profile: StyleProfile): StyleScore;
}
