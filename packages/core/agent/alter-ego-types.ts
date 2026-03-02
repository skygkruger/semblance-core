// Alter Ego Guardrails — Type definitions for the guardrail system.
//
// Defines categories, irreversibility levels, settings, trust tracking,
// action receipts, anomaly detection, batch items, and guardrail decisions.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { ActionType } from '../types/ipc.js';

// ─── Action Categories ──────────────────────────────────────────────────────

export type ActionCategory =
  | 'email'
  | 'message'
  | 'calendar'
  | 'file'
  | 'financial_routine'
  | 'financial_significant'
  | 'irreversible';

export type IrreversibilityLevel = 'reversible' | 'recoverable' | 'irreversible';

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AlterEgoSettings {
  dollarThreshold: number;
  confirmationDisabledCategories: string[];
}

// ─── Trust ───────────────────────────────────────────────────────────────────

export interface AlterEgoTrust {
  contactEmail: string;
  scope: string;
  successfulSends: number;
  lastSendAt: string | null;
  trusted: boolean;
}

// ─── Receipts ────────────────────────────────────────────────────────────────

export interface AlterEgoReceipt {
  id: string;
  actionType: ActionType;
  summary: string;
  reasoning: string;
  status: 'executed' | 'undone';
  undoAvailable: boolean;
  undoExpiresAt: string | null;
  weekGroup: string;
  createdAt: string;
  executedAt: string;
}

// ─── Anomalies ───────────────────────────────────────────────────────────────

export interface AlterEgoAnomaly {
  actionType: string;
  firstSeenAt: string;
  acknowledged: boolean;
}

// ─── Batch Items ─────────────────────────────────────────────────────────────

export interface AlterEgoBatchItem {
  id: string;
  actionType: string;
  summary: string;
  reasoning: string;
  category: string;
  createdAt: string;
}

// ─── Guardrail Results ───────────────────────────────────────────────────────

export type GuardrailResult =
  | { decision: 'PROCEED'; reasoning: string }
  | { decision: 'BATCH_PENDING'; reason: string; category: string }
  | { decision: 'DRAFT_FIRST'; reason: string; contactEmail: string }
  | { decision: 'BLOCK'; reason: string };
