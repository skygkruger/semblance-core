/**
 * Strangler flag for dual-read cutover during Slice 3 vault migration.
 * When enabled, callers may prefer vault projections while legacy stores remain available.
 */
export function isVaultCanonicalReadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SEMBLANCE_VAULT_CANONICAL === '1';
}
