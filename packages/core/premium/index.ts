export { PremiumGate } from './premium-gate.js';
export type { LicenseTier, PremiumFeature, ActivationResult, EntitlementSnapshot, EntitlementSnapshotSource } from './premium-gate.js';
export { createKernelEntitlementSnapshotSource, KernelEntitlementSnapshotSource } from './kernel-entitlement-source.js';
export type { KernelBackedEntitlementSnapshot } from './kernel-entitlement-source.js';
export { verifyFoundingToken } from './founding-token.js';
export type { FoundingTokenResult, ReservationVerification } from './founding-token.js';
export { FoundingReservationStore } from './founding-reservation-store.js';
export type {
  FoundingReservation,
  ReservationHasher,
  ReservationImportResult,
} from './founding-reservation-store.js';
export {
  rollbackReservationEntitlementSplit,
  runReservationEntitlementSplit,
} from './migrations/reservation-entitlement-split.js';
export type {
  ReservationEntitlementMigrationOptions,
  ReservationEntitlementMigrationResult,
  ReservationMigrationCheckpoint,
  ReservationMigrationPlatformAdapter,
  SecureMigrationBackupAdapter,
} from './migrations/reservation-entitlement-split.js';
export {
  setLicensePublicKey,
  validatePaidLicenseKey,
  verifyLicenseKeySignature,
} from './license-keys.js';
export type {
  LicenseKeyVerification,
  PaidLicensePayload,
  PaidLicenseValidation,
} from './license-keys.js';
export { extractLicenseKey } from './license-email-detector.js';
export {
  assertDigitalRepresentativeReady,
  evaluateDigitalRepresentativeReadiness,
  DigitalRepresentativeNotReadyError,
} from './dr-readiness.js';
export type {
  DigitalRepresentativeReadinessInput,
  DigitalRepresentativeReadinessResult,
} from './dr-readiness.js';
