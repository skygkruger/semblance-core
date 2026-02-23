// Digital Representative Types — Shared types for style-matched email drafting,
// subscription cancellation, customer service templates, follow-up tracking,
// and autonomy-aware approval flows.
// CRITICAL: This file is in packages/core/. No network imports.

import type { StyleProfile } from '../style/style-profile.js';
import type { StyleScore } from '../style/style-scorer.js';
import type { DraftContext } from '../style/style-injector.js';
import type { SearchResult } from '../knowledge/types.js';

// ─── Style Profile Provider ─────────────────────────────────────────────────

export interface StyleProfileProvider {
  /** Get the active style profile, or null if none exists. */
  getProfile(): StyleProfile | null;
  /** True if the profile has analyzed enough emails to be useful. */
  hasMinimumData(): boolean;
  /** Score a draft text against the active profile. */
  getStyleScore(text: string): StyleScore | null;
  /** Build a style prompt fragment for the LLM. */
  getStylePrompt(ctx: DraftContext): string;
  /** Build a retry prompt for weak dimensions. */
  getRetryPrompt(weakDimensions: Array<{ name: string; score: number }>): string;
}

// ─── Knowledge Provider ──────────────────────────────────────────────────────

export interface KnowledgeSearchOptions {
  limit?: number;
  sourceTypes?: string[];
}

export interface KnowledgeProvider {
  /** Search the knowledge graph for context related to a query. */
  searchContext(query: string, limit?: number): Promise<SearchResult[]>;
  /** Search indexed emails specifically. */
  searchEmails(query: string, opts?: KnowledgeSearchOptions): Promise<SearchResult[]>;
}

// ─── Draft Types ─────────────────────────────────────────────────────────────

export type DraftType =
  | 'cancellation'
  | 'refund'
  | 'billing'
  | 'inquiry'
  | 'escalation'
  | 'warranty'
  | 'follow-up'
  | 'confirmation'
  | 'general';

export interface DraftEmailRequest {
  to: string;
  subject: string;
  intent: string;
  draftType: DraftType;
  recipientName?: string;
  recipientContext?: string;
  additionalContext?: string;
  replyToMessageId?: string;
}

export interface RepresentativeDraft {
  to: string;
  subject: string;
  body: string;
  draftType: DraftType;
  styleScore: StyleScore | null;
  attempts: number;
  replyToMessageId?: string;
}

// ─── Action Classification ───────────────────────────────────────────────────

export type RepresentativeActionClassification = 'routine' | 'standard' | 'high-stakes';

export interface RepresentativeAction {
  id: string;
  draft: RepresentativeDraft;
  classification: RepresentativeActionClassification;
  status: 'pending' | 'approved' | 'sent' | 'rejected' | 'failed';
  reasoning: string;
  auditRef: string | null;
  createdAt: string;
  resolvedAt: string | null;
  estimatedTimeSavedSeconds: number;
}

// ─── Cancellation Types ──────────────────────────────────────────────────────

export interface SupportContact {
  email: string;
  cancellationUrl?: string;
  method: 'email' | 'url' | 'phone' | 'unknown';
  source: 'known-database' | 'email-history' | 'llm-extraction' | 'not-found';
}

export interface CancellableSubscription {
  chargeId: string;
  merchantName: string;
  amount: number;
  frequency: string;
  estimatedAnnualCost: number;
  supportContact: SupportContact | null;
  cancellationStatus: 'not-started' | 'draft-ready' | 'sent' | 'confirmed' | 'failed';
}

// ─── Follow-Up Types ─────────────────────────────────────────────────────────

export type FollowUpStage = 'initial' | 'follow-up-1' | 'follow-up-2' | 'needs-attention' | 'resolved';

export interface FollowUp {
  id: string;
  actionId: string;
  merchantName: string;
  subject: string;
  stage: FollowUpStage;
  followUpCount: number;
  maxFollowUps: number;
  nextFollowUpAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

// ─── Template Types ──────────────────────────────────────────────────────────

export interface TemplateField {
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

export interface EmailTemplate {
  name: string;
  label: string;
  description: string;
  fields: TemplateField[];
  draftType: DraftType;
}
