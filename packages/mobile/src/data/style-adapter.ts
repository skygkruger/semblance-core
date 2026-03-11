// Style Adapter — Style-matched drafting for mobile.
// Uses the same StyleProfile from Core (synced from desktop or extracted from mobile emails).
// StyleMatchIndicator shown on draft previews.

import { getRuntimeState } from '../runtime/mobile-runtime.js';
import { StyleProfileStore } from '@semblance/core/style/style-profile';
import type { StyleProfile } from '@semblance/core/style/style-profile';
import { getPlatform } from '@semblance/core/platform/index';

export interface MobileStyleProfile {
  id: string;
  userName: string;
  avgSentenceLength: number;
  avgWordLength: number;
  formality: number;     // 0 (casual) to 1 (formal)
  enthusiasm: number;    // 0 (reserved) to 1 (enthusiastic)
  verbosity: number;     // 0 (terse) to 1 (verbose)
  greetingStyle: string;
  signoffStyle: string;
  commonPhrases: string[];
  sampleCount: number;
}

export interface StyleMatchResult {
  score: number;          // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  feedback: string;
  adjustments: StyleAdjustment[];
}

export interface StyleAdjustment {
  type: 'formality' | 'length' | 'greeting' | 'signoff' | 'vocabulary';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Compute a simple style match score between a draft and the user's style profile.
 * Returns 0–100 where 100 is a perfect match.
 */
export function computeStyleMatch(
  draft: string,
  profile: MobileStyleProfile
): StyleMatchResult {
  const adjustments: StyleAdjustment[] = [];
  let score = 100;

  // Check sentence length
  const sentences = draft.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgLen = sentences.length > 0
    ? sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length
    : 0;
  const lenDiff = Math.abs(avgLen - profile.avgSentenceLength);
  if (lenDiff > 5) {
    score -= Math.min(20, lenDiff * 2);
    adjustments.push({
      type: 'length',
      description: avgLen > profile.avgSentenceLength
        ? 'Sentences are longer than your typical style'
        : 'Sentences are shorter than your typical style',
      severity: lenDiff > 10 ? 'high' : 'medium',
    });
  }

  // Check greeting
  if (profile.greetingStyle && draft.length > 0) {
    const firstLine = draft.split('\n')[0]!.toLowerCase();
    if (!firstLine.includes(profile.greetingStyle.toLowerCase().split(' ')[0]!)) {
      score -= 10;
      adjustments.push({
        type: 'greeting',
        description: `Your typical greeting is "${profile.greetingStyle}"`,
        severity: 'low',
      });
    }
  }

  // Check signoff
  if (profile.signoffStyle && draft.length > 0) {
    const lastLine = draft.split('\n').filter(l => l.trim()).pop()?.toLowerCase() ?? '';
    if (!lastLine.includes(profile.signoffStyle.toLowerCase().split(' ')[0]!)) {
      score -= 10;
      adjustments.push({
        type: 'signoff',
        description: `Your typical sign-off is "${profile.signoffStyle}"`,
        severity: 'low',
      });
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    grade: scoreToGrade(score),
    feedback: generateFeedback(score, adjustments),
    adjustments,
  };
}

/**
 * Format style match for display in mobile draft preview.
 */
export function formatStyleIndicator(result: StyleMatchResult): string {
  return `Style: ${result.grade} (${result.score}%)`;
}

function scoreToGrade(score: number): StyleMatchResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function generateFeedback(score: number, adjustments: StyleAdjustment[]): string {
  if (score >= 90) return 'Matches your writing style well.';
  if (adjustments.length === 0) return 'Mostly matches your style.';
  return adjustments.map(a => a.description).join(' ');
}

// ─── Core Integration ─────────────────────────────────────────────────────────

/**
 * Load the user's style profile from Core's StyleProfileStore.
 *
 * The StyleProfileStore is backed by SQLite in the data directory. On mobile,
 * the profile is either:
 * 1. Extracted from locally-indexed sent emails (if email connector is active)
 * 2. Synced from desktop via the knowledge graph sync mechanism
 *
 * Returns null if no profile exists yet (user hasn't connected email or
 * doesn't have enough samples). This is the truthful state, not a stub.
 */
export function loadStyleProfile(): MobileStyleProfile | null {
  const { core, dataDir } = getRuntimeState();
  if (!core || !dataDir) return null;

  try {
    const p = getPlatform();
    const dbPath = p.path.join(dataDir, 'core.db');

    // Only attempt to open if the database file exists
    if (!p.fs.existsSync(dbPath)) return null;

    const db = p.sqlite.openDatabase(dbPath);
    const store = new StyleProfileStore(db);
    const profile = store.getActiveProfile();

    if (!profile) return null;

    return coreProfileToMobileProfile(profile);
  } catch (err) {
    console.error('[StyleAdapter] Failed to load style profile:', err);
    return null;
  }
}

/**
 * Convert Core's StyleProfile to the mobile MobileStyleProfile format.
 *
 * Core's StyleProfile has a richer structure (greetings with context, tone scores,
 * vocabulary analysis). We flatten it into the simpler MobileStyleProfile for
 * the mobile style-match indicator.
 */
function coreProfileToMobileProfile(profile: StyleProfile): MobileStyleProfile {
  const topGreeting = profile.greetings.patterns[0];
  const topSignoff = profile.signoffs.patterns[0];

  // Derive avgWordLength from contraction rate + formality (no direct metric in Core)
  const estimatedAvgWordLength = profile.vocabulary.usesContractions ? 4.2 : 5.0;

  // Map Core's warmthScore (0-1) to enthusiasm
  const enthusiasm = profile.tone.warmthScore;

  // Map Core's formalityScore to formality
  const formality = profile.tone.formalityScore;

  // Derive verbosity from average email/paragraph length
  const verbosity = Math.min(1, profile.structure.avgEmailLength / 500);

  return {
    id: profile.id,
    userName: '', // Core profile doesn't store userName directly
    avgSentenceLength: profile.structure.avgSentenceLength,
    avgWordLength: estimatedAvgWordLength,
    formality,
    enthusiasm,
    verbosity,
    greetingStyle: topGreeting?.text ?? '',
    signoffStyle: topSignoff?.text ?? '',
    commonPhrases: profile.vocabulary.commonPhrases,
    sampleCount: profile.emailsAnalyzed,
  };
}
