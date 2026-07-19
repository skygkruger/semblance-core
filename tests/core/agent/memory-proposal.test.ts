import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';
import {
  MemoryProposalError,
  MemoryProposalStore,
  confirmProposal,
  correctProposal,
  createMemoryProposal,
  dismissProposal,
  proposeFromPreferenceSignal,
} from '../../../packages/core/agent/memory/memory-proposal.js';
import {
  MemoryPromotionError,
  buildPromotedMemoryAssertion,
  isPromotableMemory,
  promoteConfirmedMemory,
  type MemoryPromotionWriter,
} from '../../../packages/core/agent/memory/memory-promotion.js';

describe('memory proposals', () => {
  let db: Database.Database;
  let store: MemoryProposalStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new MemoryProposalStore(db as unknown as DatabaseHandle);
  });

  it('creates a proposed memory with inferred derivation', () => {
    const proposal = createMemoryProposal({
      text: 'email: prefers concise replies',
      derivationMethod: 'inferred',
      confidence: 0.72,
    });

    expect(proposal.status).toBe('proposed');
    expect(proposal.derivationMethod).toBe('inferred');
    expect(proposal.id).toMatch(/^memprop_/);
  });

  it('blocks inferred confirmation without evidence or user confirmation', () => {
    const proposal = createMemoryProposal({
      text: 'calendar: prefers afternoon meetings',
      derivationMethod: 'inferred',
      confidence: 0.6,
    });

    expect(() => confirmProposal(proposal)).toThrow(MemoryProposalError);
    expect(() => confirmProposal(proposal)).toThrow(/inferred memories cannot become confirmed/);
  });

  it('confirms inferred memory with explicit user confirmation', () => {
    const proposal = createMemoryProposal({
      text: 'calendar: prefers afternoon meetings',
      derivationMethod: 'inferred',
      confidence: 0.6,
    });

    const confirmed = confirmProposal(proposal, { userConfirmation: true });
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confidence).toBe(1);
  });

  it('corrects a confirmed memory and links priorProposalId', () => {
    const original = createMemoryProposal({
      text: 'email: responds within 1 hour',
      derivationMethod: 'direct_extraction',
      confidence: 0.9,
      evidenceSourceIds: ['message:abc123'],
    });
    const confirmed = confirmProposal(original);

    const corrected = correctProposal(confirmed, {
      text: 'email: responds within 2 hours',
    });

    expect(corrected.status).toBe('corrected');
    expect(corrected.priorProposalId).toBe(confirmed.id);
    expect(corrected.derivationMethod).toBe('corrected');
  });

  it('dismisses only proposed memories', () => {
    const proposal = createMemoryProposal({
      text: 'system: prefers markdown files',
      derivationMethod: 'inferred',
      confidence: 0.5,
    });

    const dismissed = dismissProposal(proposal);
    expect(dismissed.status).toBe('dismissed');

    expect(() => dismissProposal(dismissed)).toThrow(MemoryProposalError);
  });

  it('persists proposals across store reopen', () => {
    const proposal = proposeFromPreferenceSignal({
      domain: 'email',
      pattern: 'prefers concise communication',
      confidence: 0.66,
      evidence: { contactId: 'ct_123' },
    });
    store.save(proposal);

    const reopened = new MemoryProposalStore(db as unknown as DatabaseHandle);
    const loaded = reopened.getById(proposal.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.text).toBe('email: prefers concise communication');
    expect(loaded!.evidenceSourceIds).toEqual(['contact:ct_123']);
    expect(loaded!.status).toBe('proposed');
  });

  it('roundtrips confirm and correct through persistence', () => {
    const proposal = createMemoryProposal({
      text: 'email: auto-archive newsletters',
      derivationMethod: 'inferred',
      confidence: 0.7,
    });
    store.save(proposal);

    const confirmed = confirmProposal(proposal, { userConfirmation: true });
    store.save(confirmed);

    const corrected = correctProposal(confirmed, {
      text: 'email: auto-archive marketing newsletters only',
    });
    store.save(corrected);

    const reopened = new MemoryProposalStore(db as unknown as DatabaseHandle);
    const rows = reopened.list();
    expect(rows).toHaveLength(2);

    const latest = reopened.getById(corrected.id);
    expect(latest?.status).toBe('corrected');
    expect(latest?.priorProposalId).toBe(confirmed.id);
    expect(latest?.text).toContain('marketing newsletters');
  });

  it('updates confidence for repeated preference signals with same text', () => {
    const first = store.recordPreferenceSignal({
      domain: 'email',
      pattern: 'responds quickly',
      confidence: 0.7,
      evidence: {},
    });
    const second = store.recordPreferenceSignal({
      domain: 'email',
      pattern: 'responds quickly',
      confidence: 0.9,
      evidence: {},
    });

    expect(first.id).toBe(second.id);
    expect(second.confidence).toBeCloseTo(0.72, 2);
    expect(store.list()).toHaveLength(1);
  });
});

describe('memory promotion', () => {
  const writer: MemoryPromotionWriter = {
    promoteAssertion(assertion) {
      return { assertionId: assertion.assertionId };
    },
  };

  it('promotes confirmed memories', async () => {
    const proposal = createMemoryProposal({
      text: 'calendar: prefers afternoon meetings',
      derivationMethod: 'inferred',
      confidence: 0.6,
    });
    const confirmed = confirmProposal(proposal, { userConfirmation: true });

    const result = await promoteConfirmedMemory(confirmed, writer);
    expect(result.assertionId).toBe(`assertion-${confirmed.id}`);
  });

  it('promotes evidence-backed proposed memories', async () => {
    const proposal = createMemoryProposal({
      text: 'email: responds to accountant within 1 hour',
      derivationMethod: 'direct_extraction',
      confidence: 0.91,
      evidenceSourceIds: ['message:abc123'],
    });

    expect(isPromotableMemory(proposal)).toBe(true);
    const result = await promoteConfirmedMemory(proposal, writer);
    expect(result.assertionId).toBe(`assertion-${proposal.id}`);
  });

  it('blocks promotion for dismissed proposals', async () => {
    const proposal = createMemoryProposal({
      text: 'system: prefers .pdf files',
      derivationMethod: 'inferred',
      confidence: 0.5,
    });
    const dismissed = dismissProposal(proposal);

    await expect(promoteConfirmedMemory(dismissed, writer)).rejects.toThrow(MemoryPromotionError);
  });

  it('blocks inferred proposed memories without evidence', async () => {
    const proposal = createMemoryProposal({
      text: 'email: prefers short replies',
      derivationMethod: 'inferred',
      confidence: 0.55,
    });

    expect(isPromotableMemory(proposal)).toBe(false);
    await expect(promoteConfirmedMemory(proposal, writer)).rejects.toThrow(/evidence source refs/);
  });

  it('builds vault-ready assertion payload from corrected memory', () => {
    const original = createMemoryProposal({
      text: 'email: prefers formal tone',
      derivationMethod: 'direct_extraction',
      confidence: 0.9,
      evidenceSourceIds: ['message:001'],
    });
    const confirmed = confirmProposal(original);
    const corrected = correctProposal(confirmed, {
      text: 'email: prefers casual tone',
    });

    const assertion = buildPromotedMemoryAssertion(corrected);
    expect(assertion.predicate).toBe('prefers_email');
    expect(assertion.object).toBe('prefers casual tone');
    expect(assertion.priorAssertionId).toBe(`assertion-${confirmed.id}`);
  });
});
