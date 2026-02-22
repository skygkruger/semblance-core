// Clipboard Privacy Guard — Sanitizes clipboard data for audit trail.
//
// CRITICAL: Full clipboard text is NEVER stored in any output or audit trail.
// Only the pattern type and extracted value are persisted.
//
// This module enforces the privacy boundary at the point of audit trail entry.

import type { RecognizedPattern } from './pattern-recognizer.js';

/**
 * Rules for clipboard data in the audit trail.
 */
export const CLIPBOARD_AUDIT_RULES = {
  /** Full clipboard text is NEVER stored in the audit trail */
  fullTextStored: false,
  /** Only pattern type and extracted value are stored */
  storedFields: ['patternType', 'extractedValue', 'actionType'],
  /** Clipboard text is ephemeral — processed in memory only */
  retentionPolicy: 'ephemeral',
} as const;

/**
 * Sanitized clipboard pattern for audit trail logging.
 * Contains ONLY the pattern type and extracted value — never full clipboard text.
 */
export interface SanitizedClipboardEntry {
  patternType: string;
  extractedValue: string;
  actionType?: string;
  confidence: number;
}

/**
 * Sanitize a recognized pattern for audit trail storage.
 * Returns ONLY the pattern type and extracted value.
 * Full clipboard text is never included.
 */
export function sanitizeForAuditTrail(pattern: RecognizedPattern): SanitizedClipboardEntry {
  return {
    patternType: pattern.type,
    extractedValue: pattern.value,
    actionType: pattern.suggestedAction?.actionType,
    confidence: pattern.confidence,
  };
}
