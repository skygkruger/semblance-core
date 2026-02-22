// Style Adapter — Style-matched drafting for mobile.
// Uses the same StyleProfile from Core (synced from desktop or extracted from mobile emails).
// StyleMatchIndicator shown on draft previews.

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
