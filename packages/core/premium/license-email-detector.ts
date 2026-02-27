/**
 * License Email Detector — Extracts sem_ license keys from email bodies.
 *
 * When Semblance ingests emails, this detector scans for the sentinel pattern
 * SEMBLANCE_LICENSE_KEY:sem_<key> and returns the key for activation.
 *
 * The Cloudflare Worker embeds this pattern in the license delivery email,
 * making activation automatic when the user connects their email account.
 *
 * Pure function, no side effects. Does not activate the key — that's PremiumGate's job.
 */

/**
 * Pattern: SEMBLANCE_LICENSE_KEY:sem_<header>.<payload>.<signature>
 * The key continues until whitespace, newline, or end of string.
 * Base64url characters + dots + underscores are valid in the key body.
 */
const LICENSE_KEY_PATTERN = /SEMBLANCE_LICENSE_KEY:(sem_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;

/**
 * Extract a license key from an email body.
 *
 * Looks for the pattern SEMBLANCE_LICENSE_KEY:sem_<key> anywhere in the text.
 * Returns the full sem_ key if found, null otherwise.
 * If multiple keys are present, returns the first match.
 */
export function extractLicenseKey(emailBody: string): string | null {
  const match = emailBody.match(LICENSE_KEY_PATTERN);
  if (!match || !match[1]) return null;
  return match[1];
}
