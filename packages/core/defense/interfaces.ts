// Defense Adapter Interfaces — Public contracts for IP-separated defense modules.
// Implementation lives in @semblance/dr (private). These interfaces stay public.
// CRITICAL: This file is in packages/core/. No implementation logic. Types only.

// Re-export the types that are already in types.ts (stays public)
export type {
  ContentForAnalysis,
  DetectedPattern,
  DarkPatternResult,
  SubscriptionAdvocacy,
} from './types.js';

import type { ContentForAnalysis, DarkPatternResult, DetectedPattern } from './types.js';

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface IDarkPatternDetector {
  initSchema(): void;
  analyze(content: ContentForAnalysis): Promise<DarkPatternResult>;
  analyzeBatch(items: ContentForAnalysis[]): Promise<DarkPatternResult[]>;
  getDismissedIds(): Set<string>;
  dismissFlag(contentId: string): void;
  getRecentFlags(limit?: number): Array<{
    id: string;
    contentId: string;
    contentType: string;
    flaggedAt: string;
    confidence: number;
    patterns: DetectedPattern[];
    reframe: string;
  }>;
}
