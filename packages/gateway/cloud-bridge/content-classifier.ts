// Content Classifier — Detects sensitive data categories in prompts before
// they are sent via Cloud Bridge.
//
// Used by the routing engine to enforce domain exclusion rules.
// If a prompt contains content from an excluded category, the request
// is blocked and falls back to local inference.
//
// This is a heuristic classifier — it errs on the side of caution.
// False positives are acceptable (fall back to local). False negatives
// are minimized (sensitive data should not leave the device).
//
// This file is in packages/gateway/. No packages/core/ imports needed.

import type { DataCategory } from '@semblance/core';

interface ClassificationResult {
  categories: DataCategory[];
  confidence: Record<DataCategory, number>;
}

// ─── Pattern Dictionaries ─────────────────────────────────────────────────────

const FINANCIAL_PATTERNS = [
  /\b(?:account\s*(?:number|#|num)|routing\s*(?:number|#))\b/i,
  /\b(?:credit\s*card|debit\s*card|card\s*number)\b/i,
  /\b(?:bank\s*(?:statement|balance|account|transfer))\b/i,
  /\b(?:transaction|payment|invoice|billing|expense|revenue|salary|income)\b/i,
  /\b(?:tax\s*(?:return|filing|id|form|deduction))\b/i,
  /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/,          // Dollar amounts
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,  // Card-like numbers
  /\bplaid\b/i,
  /\b(?:portfolio|investment|stock|dividend|401k|ira|brokerage)\b/i,
];

const HEALTH_PATTERNS = [
  /\b(?:diagnosis|medication|prescription|symptom|treatment)\b/i,
  /\b(?:blood\s*(?:pressure|sugar|type|test)|heart\s*rate|bmi|cholesterol)\b/i,
  /\b(?:doctor|physician|hospital|clinic|medical|patient)\b/i,
  /\b(?:health\s*(?:record|data|history|condition|insurance))\b/i,
  /\b(?:allergy|allergies|chronic|disability|mental\s*health)\b/i,
  /\b(?:therapy|therapist|counselor|psychiatric|psycholog)\b/i,
  /\b(?:healthkit|fitbit|apple\s*health|wearable\s*data)\b/i,
  /\b(?:weight|calories|sleep\s*(?:score|data|hours)|steps\s*(?:count|data))\b/i,
];

const LEGAL_PATTERNS = [
  /\b(?:attorney|lawyer|legal\s*(?:advice|counsel|document|matter))\b/i,
  /\b(?:court\s*(?:order|case|hearing|date)|lawsuit|litigation)\b/i,
  /\b(?:contract|agreement|nda|non-disclosure|settlement)\b/i,
  /\b(?:intellectual\s*property|patent|trademark|copyright)\b/i,
  /\b(?:will\s*and\s*testament|estate\s*plan|power\s*of\s*attorney)\b/i,
  /\b(?:compliance|regulatory|subpoena|deposition)\b/i,
];

const PERSONAL_ID_PATTERNS = [
  /\b(?:social\s*security|ssn|ss#)\b/i,
  /\b(?:passport\s*(?:number|#))\b/i,
  /\b(?:driver'?s?\s*licen[sc]e\s*(?:number|#)?)\b/i,
  /\b(?:date\s*of\s*birth|dob|birth\s*(?:date|certificate))\b/i,
  /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/,  // SSN-like pattern
  /\b(?:national\s*id|government\s*id|state\s*id)\b/i,
  /\b(?:biometric|fingerprint|face\s*id|retina)\b/i,
];

const CONTACT_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,  // Email
  /\b(?:\+?1?[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,  // Phone
  /\b(?:home\s*address|mailing\s*address|street\s*address)\b/i,
  /\b\d+\s+[A-Za-z]+\s+(?:St|Ave|Rd|Blvd|Dr|Ln|Ct|Way|Pl)\b/i,  // Street address
];

const CALENDAR_PATTERNS = [
  /\b(?:meeting|appointment|schedule|calendar\s*event)\b/i,
  /\b(?:conference|standup|sync|1-on-1|one-on-one)\b/i,
  /\b(?:invite|rsvp|agenda|attendee)\b/i,
];

// ─── Classifier ───────────────────────────────────────────────────────────────

/**
 * Classify the data categories present in a text string.
 *
 * Returns all detected categories with confidence scores (0-1).
 * A category is included if ANY of its patterns match.
 * Confidence increases with more pattern matches.
 */
export function classifyContent(text: string): ClassificationResult {
  const confidence: Record<DataCategory, number> = {
    financial: 0,
    health: 0,
    legal: 0,
    personal_id: 0,
    contact_info: 0,
    calendar: 0,
    general: 1,
  };

  confidence.financial = scorePatterns(text, FINANCIAL_PATTERNS);
  confidence.health = scorePatterns(text, HEALTH_PATTERNS);
  confidence.legal = scorePatterns(text, LEGAL_PATTERNS);
  confidence.personal_id = scorePatterns(text, PERSONAL_ID_PATTERNS);
  confidence.contact_info = scorePatterns(text, CONTACT_PATTERNS);
  confidence.calendar = scorePatterns(text, CALENDAR_PATTERNS);

  const categories: DataCategory[] = [];
  for (const [cat, score] of Object.entries(confidence)) {
    if (score > 0 && cat !== 'general') {
      categories.push(cat as DataCategory);
    }
  }

  // If no specific categories detected, it's general
  if (categories.length === 0) {
    categories.push('general');
  }

  return { categories, confidence };
}

/**
 * Check if a text contains any content from excluded categories.
 * Returns the list of violated exclusions (empty if safe to send).
 */
export function checkExclusions(
  text: string,
  excludedCategories: string[],
): string[] {
  if (excludedCategories.length === 0) return [];

  const { categories } = classifyContent(text);
  return categories.filter(c => excludedCategories.includes(c));
}

// ─── Private ──────────────────────────────────────────────────────────────────

function scorePatterns(text: string, patterns: RegExp[]): number {
  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      matches++;
    }
  }
  if (matches === 0) return 0;
  // Normalize: 1 match = 0.3, 2 = 0.5, 3+ = 0.7+
  return Math.min(1, 0.2 + matches * 0.15);
}
