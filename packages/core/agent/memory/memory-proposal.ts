// Memory Proposals — Inspectable, user-reviewable memory learned from preferences and chat.
// Proposals stay in core SQLite until confirmed/corrected and promoted to vault assertions.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../../platform/types.js';
import type { PreferenceSignal } from '../preference-graph.js';
import { nanoid } from 'nanoid';

export type MemoryProposalStatus = 'proposed' | 'confirmed' | 'corrected' | 'dismissed';

export type MemoryDerivationMethod =
  | 'inferred'
  | 'direct_extraction'
  | 'user_stated'
  | 'corrected';

export interface MemoryProposal {
  id: string;
  text: string;
  evidenceSourceIds: string[];
  derivationMethod: MemoryDerivationMethod;
  confidence: number;
  status: MemoryProposalStatus;
  createdAt: string;
  priorProposalId?: string;
}

export type MemoryProposalErrorCode =
  | 'INVALID_STATUS_TRANSITION'
  | 'INFERRED_CONFIRMATION_BLOCKED'
  | 'PROPOSAL_NOT_FOUND';

export class MemoryProposalError extends Error {
  readonly code: MemoryProposalErrorCode;

  constructor(code: MemoryProposalErrorCode, message: string) {
    super(message);
    this.name = 'MemoryProposalError';
    this.code = code;
  }
}

export interface CreateMemoryProposalInput {
  text: string;
  evidenceSourceIds?: string[];
  derivationMethod: MemoryDerivationMethod;
  confidence: number;
  createdAt?: string;
}

export interface ConfirmMemoryProposalOptions {
  userConfirmation?: boolean;
  additionalEvidenceSourceIds?: string[];
  confirmedAt?: string;
}

export interface CorrectMemoryProposalInput {
  text: string;
  evidenceSourceIds?: string[];
  derivationMethod?: MemoryDerivationMethod;
  confidence?: number;
  createdAt?: string;
}

const CREATE_MEMORY_PROPOSALS_TABLE = `
  CREATE TABLE IF NOT EXISTS memory_proposals (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    evidence_source_ids TEXT NOT NULL DEFAULT '[]',
    derivation_method TEXT NOT NULL,
    confidence REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    prior_proposal_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_memory_proposals_status ON memory_proposals(status);
  CREATE INDEX IF NOT EXISTS idx_memory_proposals_text ON memory_proposals(text);
`;

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function uniqueSourceIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

function hasEvidenceSources(proposal: MemoryProposal): boolean {
  return proposal.evidenceSourceIds.length > 0;
}

function isInferredDerivation(method: MemoryDerivationMethod): boolean {
  return method === 'inferred';
}

export function createMemoryProposal(input: CreateMemoryProposalInput): MemoryProposal {
  return {
    id: `memprop_${nanoid()}`,
    text: input.text.trim(),
    evidenceSourceIds: uniqueSourceIds(input.evidenceSourceIds ?? []),
    derivationMethod: input.derivationMethod,
    confidence: clampConfidence(input.confidence),
    status: 'proposed',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function confirmProposal(
  proposal: MemoryProposal,
  options: ConfirmMemoryProposalOptions = {},
): MemoryProposal {
  if (proposal.status !== 'proposed') {
    throw new MemoryProposalError(
      'INVALID_STATUS_TRANSITION',
      `only proposed memories can be confirmed; current status is ${proposal.status}`,
    );
  }

  const mergedEvidence = uniqueSourceIds([
    ...proposal.evidenceSourceIds,
    ...(options.additionalEvidenceSourceIds ?? []),
  ]);
  const userConfirmed = options.userConfirmation === true;

  if (
    isInferredDerivation(proposal.derivationMethod) &&
    mergedEvidence.length === 0 &&
    !userConfirmed
  ) {
    throw new MemoryProposalError(
      'INFERRED_CONFIRMATION_BLOCKED',
      'inferred memories cannot become confirmed without evidence source refs or explicit userConfirmation: true',
    );
  }

  return {
    ...proposal,
    evidenceSourceIds: mergedEvidence,
    status: 'confirmed',
    confidence: 1,
  };
}

export function correctProposal(
  priorProposal: MemoryProposal,
  input: CorrectMemoryProposalInput,
): MemoryProposal {
  if (priorProposal.status === 'dismissed') {
    throw new MemoryProposalError(
      'INVALID_STATUS_TRANSITION',
      'dismissed memories cannot be corrected',
    );
  }

  const corrected = createMemoryProposal({
    text: input.text,
    evidenceSourceIds: input.evidenceSourceIds ?? priorProposal.evidenceSourceIds,
    derivationMethod: input.derivationMethod ?? 'corrected',
    confidence: input.confidence ?? 1,
    createdAt: input.createdAt,
  });

  return {
    ...corrected,
    priorProposalId: priorProposal.id,
    status: 'corrected',
    derivationMethod: 'corrected',
  };
}

export function dismissProposal(proposal: MemoryProposal): MemoryProposal {
  if (proposal.status !== 'proposed') {
    throw new MemoryProposalError(
      'INVALID_STATUS_TRANSITION',
      `only proposed memories can be dismissed; current status is ${proposal.status}`,
    );
  }

  return {
    ...proposal,
    status: 'dismissed',
  };
}

export function formatPreferenceSignalAsMemoryText(signal: PreferenceSignal): string {
  return `${signal.domain}: ${signal.pattern}`;
}

export function extractEvidenceSourceIdsFromPreferenceEvidence(
  evidence: Record<string, unknown>,
): string[] {
  const ids: string[] = [];

  if (typeof evidence.contactId === 'string') {
    ids.push(`contact:${evidence.contactId}`);
  }
  if (typeof evidence.messageId === 'string') {
    ids.push(`message:${evidence.messageId}`);
  }
  if (typeof evidence.documentId === 'string') {
    ids.push(`document:${evidence.documentId}`);
  }
  if (Array.isArray(evidence.sourceIds)) {
    for (const sourceId of evidence.sourceIds) {
      if (typeof sourceId === 'string') {
        ids.push(sourceId);
      }
    }
  }

  return uniqueSourceIds(ids);
}

export function proposeFromPreferenceSignal(signal: PreferenceSignal): MemoryProposal {
  return createMemoryProposal({
    text: formatPreferenceSignalAsMemoryText(signal),
    evidenceSourceIds: extractEvidenceSourceIdsFromPreferenceEvidence(signal.evidence),
    derivationMethod: 'inferred',
    confidence: signal.confidence,
  });
}

interface MemoryProposalRow {
  id: string;
  text: string;
  evidence_source_ids: string;
  derivation_method: string;
  confidence: number;
  status: string;
  created_at: string;
  prior_proposal_id: string | null;
}

function rowToProposal(row: MemoryProposalRow): MemoryProposal {
  let evidenceSourceIds: string[] = [];
  try {
    const parsed = JSON.parse(row.evidence_source_ids) as unknown;
    if (Array.isArray(parsed)) {
      evidenceSourceIds = parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    evidenceSourceIds = [];
  }

  return {
    id: row.id,
    text: row.text,
    evidenceSourceIds,
    derivationMethod: row.derivation_method as MemoryDerivationMethod,
    confidence: row.confidence,
    status: row.status as MemoryProposalStatus,
    createdAt: row.created_at,
    priorProposalId: row.prior_proposal_id ?? undefined,
  };
}

export class MemoryProposalStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_MEMORY_PROPOSALS_TABLE);
  }

  save(proposal: MemoryProposal): void {
    this.db.prepare(`
      INSERT INTO memory_proposals (
        id, text, evidence_source_ids, derivation_method, confidence, status, created_at, prior_proposal_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        text = excluded.text,
        evidence_source_ids = excluded.evidence_source_ids,
        derivation_method = excluded.derivation_method,
        confidence = excluded.confidence,
        status = excluded.status,
        created_at = excluded.created_at,
        prior_proposal_id = excluded.prior_proposal_id
    `).run(
      proposal.id,
      proposal.text,
      JSON.stringify(proposal.evidenceSourceIds),
      proposal.derivationMethod,
      proposal.confidence,
      proposal.status,
      proposal.createdAt,
      proposal.priorProposalId ?? null,
    );
  }

  getById(id: string): MemoryProposal | null {
    const row = this.db.prepare('SELECT * FROM memory_proposals WHERE id = ?').get(id) as
      | MemoryProposalRow
      | undefined;
    return row ? rowToProposal(row) : null;
  }

  list(status?: MemoryProposalStatus): MemoryProposal[] {
    const rows = status
      ? (this.db.prepare(
          'SELECT * FROM memory_proposals WHERE status = ? ORDER BY created_at DESC',
        ).all(status) as MemoryProposalRow[])
      : (this.db.prepare('SELECT * FROM memory_proposals ORDER BY created_at DESC').all() as MemoryProposalRow[]);

    return rows.map(rowToProposal);
  }

  findOpenByText(text: string): MemoryProposal | null {
    const row = this.db.prepare(`
      SELECT * FROM memory_proposals
      WHERE text = ? AND status IN ('proposed', 'confirmed', 'corrected')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(text) as MemoryProposalRow | undefined;

    return row ? rowToProposal(row) : null;
  }

  recordPreferenceSignal(signal: PreferenceSignal): MemoryProposal {
    const text = formatPreferenceSignalAsMemoryText(signal);
    const existing = this.findOpenByText(text);

    if (existing?.status === 'proposed') {
      const updated: MemoryProposal = {
        ...existing,
        confidence: clampConfidence(existing.confidence * 0.9 + signal.confidence * 0.1),
        evidenceSourceIds: uniqueSourceIds([
          ...existing.evidenceSourceIds,
          ...extractEvidenceSourceIdsFromPreferenceEvidence(signal.evidence),
        ]),
      };
      this.save(updated);
      return updated;
    }

    const proposal = proposeFromPreferenceSignal(signal);
    this.save(proposal);
    return proposal;
  }
}

export function canConfirmProposal(proposal: MemoryProposal, userConfirmation = false): boolean {
  if (proposal.status !== 'proposed') return false;
  if (!isInferredDerivation(proposal.derivationMethod)) return true;
  return hasEvidenceSources(proposal) || userConfirmation;
}
