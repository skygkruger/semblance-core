// Phone Number Utilities — Masking, validation, and normalization for SMS.
//
// CRITICAL: maskPhoneNumber is used at the audit trail boundary to ensure
// phone numbers are never stored in full in the audit log.

/**
 * Mask a phone number for audit trail logging.
 * Shows only the last 4 digits: '+1555***4567'
 */
export function maskPhoneNumber(phone: string): string {
  const stripped = phone.replace(/[\s\-\(\)\.]/g, '');
  if (stripped.length < 4) return '***';

  const last4 = stripped.slice(-4);
  const prefix = stripped.slice(0, stripped.length - 4);
  const masked = prefix.replace(/\d/g, '*');
  return masked + last4;
}

/**
 * Validate a phone number (basic structural check).
 * Accepts various formats: +1 (555) 123-4567, 5551234567, +44 7911 123456, etc.
 */
export function validatePhoneNumber(phone: string): boolean {
  const stripped = phone.replace(/[\s\-\(\)\.]/g, '');
  // Must be at least 7 digits, optionally starting with +
  if (stripped.startsWith('+')) {
    return /^\+\d{7,15}$/.test(stripped);
  }
  return /^\d{7,15}$/.test(stripped);
}

/**
 * Normalize a phone number to a stripped format.
 * Removes spaces, dashes, parentheses, dots.
 */
export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[\s\-\(\)\.]/g, '');
}
