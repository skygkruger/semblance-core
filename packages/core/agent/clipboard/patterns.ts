// Clipboard Pattern Definitions — Regex patterns for recognizing actionable content.
//
// Patterns detect: tracking numbers, flight codes, phone numbers, URLs,
// email addresses, prices, addresses, dates, and code snippets.
//
// CRITICAL: No network imports. Pure regex pattern matching.

export type ClipboardPatternType =
  | 'tracking_number'
  | 'flight_code'
  | 'phone_number'
  | 'url'
  | 'email_address'
  | 'price'
  | 'address'
  | 'date_time'
  | 'code_snippet';

export interface PatternMatch {
  type: ClipboardPatternType;
  value: string;
  confidence: number;
  carrier?: string;
}

interface PatternDefinition {
  type: ClipboardPatternType;
  regex: RegExp;
  confidence: number;
  carrier?: string;
  validate?: (match: string) => boolean;
}

const PATTERNS: PatternDefinition[] = [
  // FedEx tracking: 12-34 digits
  {
    type: 'tracking_number',
    regex: /\b(\d{12,34})\b/,
    confidence: 0.7,
    carrier: 'fedex',
    validate: (m) => m.length >= 12 && m.length <= 34,
  },
  // UPS tracking: 1Z + 16 alphanumeric
  {
    type: 'tracking_number',
    regex: /\b(1Z[A-Z0-9]{16})\b/i,
    confidence: 0.95,
    carrier: 'ups',
  },
  // USPS tracking: 20-30 digits
  {
    type: 'tracking_number',
    regex: /\b(\d{20,30})\b/,
    confidence: 0.75,
    carrier: 'usps',
    validate: (m) => m.length >= 20 && m.length <= 30,
  },
  // Flight code: 2 letter carrier + 1-4 digits
  {
    type: 'flight_code',
    regex: /\b([A-Z]{2}\d{1,4})\b/,
    confidence: 0.8,
  },
  // Phone number: various formats
  {
    type: 'phone_number',
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    confidence: 0.8,
  },
  // International phone number with + prefix
  {
    type: 'phone_number',
    regex: /\+\d{1,3}[-.\s]?\d{4,14}\b/,
    confidence: 0.85,
  },
  // URL
  {
    type: 'url',
    regex: /https?:\/\/[^\s<>"{}|\\^`[\]]+/i,
    confidence: 0.95,
  },
  // Email address
  {
    type: 'email_address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    confidence: 0.95,
  },
  // Price: $X,XXX.XX or $XX.XX
  {
    type: 'price',
    regex: /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/,
    confidence: 0.9,
  },
];

/**
 * Match clipboard text against all known patterns.
 * Returns all matches with their types and confidence levels.
 */
export function matchPatterns(text: string): PatternMatch[] {
  const matches: PatternMatch[] = [];

  for (const pattern of PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const value = match[1] ?? match[0];
      if (pattern.validate && !pattern.validate(value)) continue;

      matches.push({
        type: pattern.type,
        value,
        confidence: pattern.confidence,
        carrier: pattern.carrier,
      });
    }
  }

  // Deduplicate by value — keep highest confidence
  const seen = new Map<string, PatternMatch>();
  for (const m of matches) {
    const existing = seen.get(m.value);
    if (!existing || m.confidence > existing.confidence) {
      seen.set(m.value, m);
    }
  }

  return Array.from(seen.values());
}
