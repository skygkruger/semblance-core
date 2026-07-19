import type { DecryptedVaultEvent } from '../agency-graph/types.js';
import { projectVaultSources, type VaultSourceSummary } from '../surface/vault-surface.js';

const EMAIL_SOURCE_TYPES = new Set(['gmail', 'email']);
const CALENDAR_SOURCE_TYPES = new Set(['google_calendar', 'calendar']);

export type VaultConnectedSourceDomain = 'email' | 'calendar';

/**
 * List vault-connected sources for a connector domain using document projections.
 */
export function listVaultConnectedSources(
  events: DecryptedVaultEvent[],
  domain: VaultConnectedSourceDomain,
): VaultSourceSummary[] {
  const allowed = domain === 'email' ? EMAIL_SOURCE_TYPES : CALENDAR_SOURCE_TYPES;
  return projectVaultSources(events).filter((source) => allowed.has(source.sourceType));
}
