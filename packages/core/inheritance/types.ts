// Inheritance Protocol Types — All interfaces for the digital will system.
// CRITICAL: No networking imports. All data structures are local-only.

import type { EncryptedPayload } from '../platform/types.js';

// ─── Trusted Party ──────────────────────────────────────────────────────────

/**
 * A person designated by the user to activate the Inheritance Protocol.
 * passphraseHash is sha256(passphrase) — plaintext NEVER stored.
 */
export interface TrustedParty {
  id: string;
  name: string;
  email: string;
  relationship: string;
  passphraseHash: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Pre-Authorized Actions ─────────────────────────────────────────────────

export type InheritanceActionCategory =
  | 'notification'
  | 'account-action'
  | 'data-sharing'
  | 'preservation';

/**
 * A single pre-authorized action to execute during activation.
 */
export interface InheritanceAction {
  id: string;
  partyId: string;
  category: InheritanceActionCategory;
  sequenceOrder: number;
  actionType: string;
  payload: Record<string, unknown>;
  label: string;
  requiresDeletionConsensus: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Notification Templates ─────────────────────────────────────────────────

/**
 * A notification template drafted in the user's voice.
 */
export interface NotificationTemplate {
  id: string;
  partyId: string;
  actionId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  lastReviewedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Activation Package ─────────────────────────────────────────────────────

/**
 * Unencrypted header — readable without passphrase.
 */
export interface ActivationPackageHeader {
  partyId: string;
  version: number;
  createdAt: string;
  /** KDF algorithm — absent in v1 (sha256 implicit), present in v2+ */
  kdf?: 'argon2id' | 'sha256';
  /** KDF salt as hex — absent in v1, present in v2+ (argon2id) */
  salt?: string;
}

/**
 * The encrypted activation package given to a trusted party.
 */
export interface ActivationPackage {
  header: ActivationPackageHeader;
  payload: EncryptedPayload;
}

// ─── Activation State ───────────────────────────────────────────────────────

export type ActivationState =
  | 'inactive'
  | 'time_locked'
  | 'executing'
  | 'paused_for_confirmation'
  | 'completed'
  | 'cancelled';

/**
 * Tracks the state of a single activation.
 */
export interface Activation {
  id: string;
  partyId: string;
  state: ActivationState;
  activatedAt: string;
  timeLockExpiresAt: string | null;
  actionsTotal: number;
  actionsCompleted: number;
  currentActionId: string | null;
  requiresStepConfirmation: boolean;
  cancelledAt: string | null;
  completedAt: string | null;
}

// ─── Global Config ──────────────────────────────────────────────────────────

/**
 * Singleton configuration for the Inheritance Protocol.
 */
export interface InheritanceConfig {
  timeLockHours: number;
  requireStepConfirmation: boolean;
  requireAllPartiesForDeletion: boolean;
  lastReviewedAt: string | null;
}

// ─── Test Run ───────────────────────────────────────────────────────────────

export interface TestRunActionResult {
  actionId: string;
  label: string;
  category: InheritanceActionCategory;
  wouldExecute: boolean;
  blockedByConsensus: boolean;
}

export interface TestRunResult {
  partyId: string;
  partyName: string;
  simulatedAt: string;
  actions: TestRunActionResult[];
  totalActions: number;
  wouldExecute: number;
  blockedByConsensus: number;
}

// ─── Execution ──────────────────────────────────────────────────────────────

export interface ActionExecutionResult {
  actionId: string;
  label: string;
  success: boolean;
  skipped: boolean;
  error?: string;
  witnessId?: string;
  auditEntryId?: string;
}

export interface ExecutionResult {
  activationId: string;
  partyId: string;
  actionsExecuted: ActionExecutionResult[];
  totalActions: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  completedAt: string;
}

// ─── Notification Draft ─────────────────────────────────────────────────────

export interface NotificationDraftInput {
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  templateSubject?: string;
  templateBody?: string;
  purpose: string;
}

export interface NotificationDraft {
  subject: string;
  body: string;
}

// ─── Living Will Integration ────────────────────────────────────────────────

export interface InheritanceExportData {
  config: InheritanceConfig;
  parties: Array<{ name: string; email: string; relationship: string; actionCount: number }>;
  actionCount: number;
  templateCount: number;
  lastReviewedAt: string | null;
}
