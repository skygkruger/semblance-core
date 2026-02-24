/**
 * Adversarial Self-Defense Types — Dark pattern detection and financial advocacy.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

export interface ContentForAnalysis {
  /** Unique identifier for the content */
  id: string;
  /** Type of content (email, notification, webpage, etc.) */
  contentType: 'email' | 'notification' | 'webpage' | 'sms';
  /** Subject line or title */
  subject: string;
  /** Body text (may be truncated snippet) */
  body: string;
  /** Sender or source domain */
  sender: string;
  /** ISO 8601 timestamp */
  receivedAt: string;
}

export interface DetectedPattern {
  /** Pattern category (urgency, scarcity, social_proof, guilt, etc.) */
  category: string;
  /** Specific evidence text from the content */
  evidence: string;
  /** Confidence score for this specific pattern (0-1) */
  confidence: number;
}

export interface DarkPatternResult {
  /** Content ID that was analyzed */
  contentId: string;
  /** Whether the content was flagged as manipulative */
  flagged: boolean;
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Detected manipulation patterns */
  patterns: DetectedPattern[];
  /** User-friendly reframe of the manipulative content */
  reframe: string;
  /** Analysis method used ('regex' | 'llm' | 'both') */
  method: 'regex' | 'llm' | 'both';
}

export interface SubscriptionAdvocacy {
  /** Recurring charge ID */
  chargeId: string;
  /** Merchant/service name */
  merchantName: string;
  /** Monthly cost */
  monthlyCost: number;
  /** Annual cost */
  annualCost: number;
  /** Estimated usage metrics */
  usage: {
    emailMentions: number;
    browserVisits: number;
    transactionCount: number;
  };
  /** Value-to-cost ratio (0-1+) */
  valueToCostRatio: number;
  /** Recommendation */
  recommendation: 'keep' | 'review' | 'consider_cancelling';
  /** Explanation of the recommendation */
  reasoning: string;
}
