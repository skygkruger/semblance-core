// Inheritance Protocol — Barrel exports.
// CRITICAL: No networking imports.

export type {
  TrustedParty,
  InheritanceAction,
  InheritanceActionCategory,
  NotificationTemplate,
  ActivationPackage,
  ActivationPackageHeader,
  Activation,
  ActivationState,
  InheritanceConfig,
  TestRunResult,
  TestRunActionResult,
  ActionExecutionResult,
  ExecutionResult,
  NotificationDraftInput,
  NotificationDraft,
  InheritanceExportData,
} from './types.js';

export { InheritanceConfigStore } from './inheritance-config-store.js';
export { TrustedPartyManager } from './trusted-party-manager.js';
export { ActivationPackageGenerator } from './activation-package-generator.js';
export { ActivationHandler } from './activation-handler.js';
export type { ActivationResult } from './activation-handler.js';
export { InheritanceExecutor } from './inheritance-executor.js';
export type { AuditLogger, WitnessGeneratorLike, IpcDispatcher } from './inheritance-executor.js';
export { NotificationDrafter } from './notification-drafter.js';
export { TestRunEngine } from './test-run-engine.js';
export { InheritanceLivingWillIntegration } from './living-will-integration.js';
export { InheritanceTracker } from './inheritance-tracker.js';
export {
  enableInheritanceMode,
  disableInheritanceMode,
  isInheritanceModeActive,
  assertNotInInheritanceMode,
  assertCanModify,
} from './inheritance-mode-guard.js';
