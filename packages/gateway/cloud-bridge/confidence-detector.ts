// Confidence Detector — Analyzes local model output for confidence signals.
//
// In Smart routing mode, after a local model generates a response, the
// confidence detector evaluates it. If confidence is below the domain's
// threshold AND Cloud Bridge is enabled, the routing engine re-routes
// the request to Cloud Bridge and returns the cloud response instead.
//
// The local response is discarded — the AI Core never sees it.
// This is a Gateway-level decision.
//
// This file is in packages/gateway/. No packages/core/ boundary violation.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfidenceResult {
  score: number;            // 0–1 (0 = no confidence, 1 = fully confident)
  shouldEscalate: boolean;  // true if score < threshold for this domain
  signals: ConfidenceSignal[];
}

export interface ConfidenceSignal {
  type: 'hedging' | 'contradiction' | 'refusal' | 'short_response' | 'repetition' | 'uncertainty';
  severity: number;         // 0–1
  excerpt?: string;         // the matched text
}

export interface ConfidenceThresholds {
  /** Default threshold for all domains (0–1). Default: 0.6 */
  default: number;
  /** Per-domain overrides */
  domains: Record<string, number>;
}

const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  default: 0.6,
  domains: {
    email: 0.7,        // Email drafting should be high quality
    finances: 0.9,     // Financial analysis must be very confident
    health: 0.85,      // Health queries need high confidence
    legal: 0.9,        // Legal queries need very high confidence
    calendar: 0.5,     // Calendar queries are lower stakes
    web: 0.5,          // Web search synthesis is lower stakes
  },
};

// ─── Signal Patterns ──────────────────────────────────────────────────────────

const HEDGING_PATTERNS = [
  /\bI(?:'m| am) not (?:sure|certain|confident)\b/i,
  /\bI think\b(?! you should| that's| it's| this is)/i,   // "I think" but not "I think you should"
  /\bit (?:might|may|could) be\b/i,
  /\bperhaps\b/i,
  /\bpossibly\b/i,
  /\bI (?:believe|suspect)\b/i,
  /\bnot entirely (?:sure|clear|certain)\b/i,
  /\bif I (?:recall|remember) correctly\b/i,
  /\bdon'?t quote me\b/i,
  /\btake this with a grain of salt\b/i,
  /\bI could be wrong\b/i,
  /\bI'?m? not (?:100%|fully) (?:sure|certain)\b/i,
];

const CONTRADICTION_PATTERNS = [
  /\bhowever,?\s+(?:on the other hand|conversely|but|that said)\b/i,
  /\bbut then again\b/i,
  /\bactually,?\s+(?:wait|no|I)\b/i,
  /\bI said .+ but\b/i,
  // Direct self-correction
  /\b(?:actually|wait|correction|sorry),?\s+(?:I|that|the)\b/i,
];

const REFUSAL_PATTERNS = [
  /\bI (?:can'?t|cannot|am unable to|don'?t have (?:access|the ability))\b/i,
  /\bI (?:don'?t|do not) (?:have|know)\b/i,
  /\bbeyond my (?:capabilities|knowledge|scope)\b/i,
  /\bI (?:would|should) recommend (?:consulting|asking|checking)\b/i,
  /\bas an AI\b/i,
];

const UNCERTAINTY_PATTERNS = [
  /\bapproximately\b/i,
  /\broughly\b/i,
  /\baround \d+/i,           // "around 50" — imprecise numbers
  /\bsomewhere between\b/i,
  /\bI'?d (?:guess|estimate)\b/i,
  /\bhard to say\b/i,
  /\bdifficult to determine\b/i,
];

// ─── Detector ─────────────────────────────────────────────────────────────────

export class ConfidenceDetector {
  private thresholds: ConfidenceThresholds;

  constructor(thresholds?: Partial<ConfidenceThresholds>) {
    this.thresholds = {
      default: thresholds?.default ?? DEFAULT_THRESHOLDS.default,
      domains: { ...DEFAULT_THRESHOLDS.domains, ...thresholds?.domains },
    };
  }

  /**
   * Analyze a model response for confidence signals.
   *
   * @param response The model's text response
   * @param domain The domain of the request (for threshold lookup)
   * @param queryComplexity Optional hint about query complexity (0–1)
   */
  evaluate(response: string, domain: string, queryComplexity?: number): ConfidenceResult {
    const signals: ConfidenceSignal[] = [];

    // Detect hedging
    for (const pattern of HEDGING_PATTERNS) {
      const match = response.match(pattern);
      if (match) {
        signals.push({
          type: 'hedging',
          severity: 0.3,
          excerpt: match[0],
        });
      }
    }

    // Detect contradictions
    for (const pattern of CONTRADICTION_PATTERNS) {
      const match = response.match(pattern);
      if (match) {
        signals.push({
          type: 'contradiction',
          severity: 0.5,
          excerpt: match[0],
        });
      }
    }

    // Detect refusals
    for (const pattern of REFUSAL_PATTERNS) {
      const match = response.match(pattern);
      if (match) {
        signals.push({
          type: 'refusal',
          severity: 0.7,
          excerpt: match[0],
        });
      }
    }

    // Detect uncertainty
    for (const pattern of UNCERTAINTY_PATTERNS) {
      const match = response.match(pattern);
      if (match) {
        signals.push({
          type: 'uncertainty',
          severity: 0.2,
          excerpt: match[0],
        });
      }
    }

    // Short response to complex query
    const wordCount = response.split(/\s+/).length;
    const isComplex = (queryComplexity ?? 0.5) > 0.6;
    if (isComplex && wordCount < 30) {
      signals.push({
        type: 'short_response',
        severity: 0.4,
        excerpt: `Response only ${wordCount} words for complex query`,
      });
    }

    // Repetition detection (same phrase appears 3+ times)
    const sentences = response.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 10);
    const seen = new Map<string, number>();
    for (const s of sentences) {
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    for (const [phrase, count] of seen) {
      if (count >= 3) {
        signals.push({
          type: 'repetition',
          severity: 0.6,
          excerpt: `"${phrase.slice(0, 50)}..." repeated ${count} times`,
        });
      }
    }

    // Calculate confidence score
    const score = this.calculateScore(signals, response);

    // Determine escalation
    const threshold = this.thresholds.domains[domain] ?? this.thresholds.default;
    const shouldEscalate = score < threshold;

    return { score, shouldEscalate, signals };
  }

  /** Update thresholds. */
  setThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    if (thresholds.default !== undefined) this.thresholds.default = thresholds.default;
    if (thresholds.domains) {
      Object.assign(this.thresholds.domains, thresholds.domains);
    }
  }

  /** Get current thresholds. */
  getThresholds(): ConfidenceThresholds {
    return { ...this.thresholds, domains: { ...this.thresholds.domains } };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private calculateScore(signals: ConfidenceSignal[], response: string): number {
    if (signals.length === 0) return 1.0;

    // Base score starts at 1.0, reduced by each signal proportional to severity
    let score = 1.0;
    for (const signal of signals) {
      score -= signal.severity * 0.15;
    }

    // Additional penalty for multiple signals (compounding effect)
    if (signals.length >= 3) score -= 0.1;
    if (signals.length >= 5) score -= 0.15;

    // Refusal signals are particularly impactful
    const hasRefusal = signals.some(s => s.type === 'refusal');
    if (hasRefusal) score -= 0.2;

    // Very short responses get an additional penalty
    if (response.split(/\s+/).length < 10) score -= 0.15;

    return Math.max(0, Math.min(1, score));
  }
}
