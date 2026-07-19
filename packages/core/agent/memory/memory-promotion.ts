// Memory Promotion — Promote confirmed or evidence-backed proposals into vault assertions.
// Core defines the writer contract; bridge/vault supply the concrete writer implementation.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { MemoryDerivationMethod, MemoryProposal } from './memory-proposal.js';
import { MemoryProposalError } from './memory-proposal.js';

export interface PromotedMemoryAssertion {
  assertionId: string;
  subject: string;
  predicate: string;
  object: string;
  derivationMethod: MemoryDerivationMethod;
  confidence: number;
  evidenceSourceIds: string[];
  createdAt: string;
  priorAssertionId?: string;
}

export interface MemoryPromotionWriter {
  promoteAssertion(assertion: PromotedMemoryAssertion): Promise<{ assertionId: string }> | { assertionId: string };
}

export type MemoryPromotionErrorCode =
  | 'NOT_PROMOTABLE'
  | 'DISMISSED_PROPOSAL'
  | 'INFERRED_PROMOTION_BLOCKED';

export class MemoryPromotionError extends Error {
  readonly code: MemoryPromotionErrorCode;

  constructor(code: MemoryPromotionErrorCode, message: string) {
    super(message);
    this.name = 'MemoryPromotionError';
    this.code = code;
  }
}

export function isEvidenceBacked(proposal: MemoryProposal): boolean {
  return proposal.evidenceSourceIds.length > 0;
}

export function isPromotableMemory(proposal: MemoryProposal): boolean {
  if (proposal.status === 'dismissed') return false;
  if (proposal.status === 'confirmed' || proposal.status === 'corrected') return true;
  return isEvidenceBacked(proposal);
}

function parsePreferenceMemory(proposal: MemoryProposal): { domain: string; pattern: string } {
  const separatorIndex = proposal.text.indexOf(': ');
  if (separatorIndex === -1) {
    return { domain: 'memory', pattern: proposal.text };
  }

  return {
    domain: proposal.text.slice(0, separatorIndex),
    pattern: proposal.text.slice(separatorIndex + 2),
  };
}

export function buildPromotedMemoryAssertion(
  proposal: MemoryProposal,
  options: { subject?: string } = {},
): PromotedMemoryAssertion {
  const { domain, pattern } = parsePreferenceMemory(proposal);

  return {
    assertionId: `assertion-${proposal.id}`,
    subject: options.subject ?? 'user:local',
    predicate: `prefers_${domain}`,
    object: pattern,
    derivationMethod: proposal.derivationMethod,
    confidence: proposal.confidence,
    evidenceSourceIds: proposal.evidenceSourceIds,
    createdAt: proposal.createdAt,
    priorAssertionId: proposal.priorProposalId
      ? `assertion-${proposal.priorProposalId}`
      : undefined,
  };
}

export async function promoteConfirmedMemory(
  proposal: MemoryProposal,
  writer: MemoryPromotionWriter,
  options: { subject?: string } = {},
): Promise<{ assertionId: string }> {
  if (proposal.status === 'dismissed') {
    throw new MemoryPromotionError(
      'DISMISSED_PROPOSAL',
      'dismissed memory proposals cannot be promoted',
    );
  }

  if (proposal.derivationMethod === 'inferred' && proposal.status === 'proposed' && !isEvidenceBacked(proposal)) {
    throw new MemoryPromotionError(
      'INFERRED_PROMOTION_BLOCKED',
      'inferred proposals require confirmation or evidence source refs before promotion',
    );
  }

  if (!isPromotableMemory(proposal)) {
    throw new MemoryPromotionError(
      'NOT_PROMOTABLE',
      'memory proposal must be confirmed, corrected, or evidence-backed before promotion',
    );
  }

  const assertion = buildPromotedMemoryAssertion(proposal, options);
  return await writer.promoteAssertion(assertion);
}
