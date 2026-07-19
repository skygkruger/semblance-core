import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInMemoryOutcomeLinker,
  type OutcomeLinker,
} from '@semblance/core/agent/proactive/outcome-linker.js';
import type { ProactiveInsight } from '@semblance/core/agent/proactive-engine.js';
import { ApprovalPatternTracker } from '@semblance/core/agent/approval-patterns.js';
import { EscalationEngine } from '@semblance/core/agent/autonomy-escalation.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

function sampleInsight(overrides: Partial<ProactiveInsight> = {}): ProactiveInsight {
  return {
    id: 'insight-1',
    type: 'follow_up',
    priority: 'normal',
    title: 'Follow up needed',
    summary: 'Awaiting reply',
    sourceIds: ['email-1'],
    suggestedAction: {
      actionType: 'email.send',
      payload: { to: ['user@example.com'], subject: 'Re: hello', body: '' },
      description: 'Send follow-up',
    },
    createdAt: new Date().toISOString(),
    expiresAt: null,
    estimatedTimeSavedSeconds: 30,
    ...overrides,
  };
}

describe('OutcomeLinker', () => {
  let linker: OutcomeLinker;

  beforeEach(() => {
    linker = createInMemoryOutcomeLinker();
  });

  it('creates a link chain from insight with recommendation', () => {
    const link = linker.createLinkFromInsight(sampleInsight());
    expect(link.insightId).toBe('insight-1');
    expect(link.recommendationId).toBeTruthy();
    expect(link.capability).toBe('email');
    expect(link.status).toBe('open');
  });

  it('learns only from measured outcomes', () => {
    const link = linker.createLinkFromInsight(sampleInsight());
    const result = linker.recordOutcome({
      linkId: link.id,
      value: { savedSeconds: 30 },
      measured: true,
    });
    expect(result.learned).toBe(true);
    expect(result.reason).toBe('measured_outcome');
    expect(linker.listLearnedOutcomes()).toHaveLength(1);
  });

  it('learns only from user-confirmed outcomes', () => {
    const link = linker.createLinkFromInsight(sampleInsight());
    const result = linker.recordOutcome({
      linkId: link.id,
      value: { confirmed: true },
      userConfirmed: true,
    });
    expect(result.learned).toBe(true);
    expect(result.reason).toBe('user_confirmed_outcome');
  });

  it('rejects learning on unconfirmed speculation', () => {
    const link = linker.createLinkFromInsight(sampleInsight());
    const result = linker.recordOutcome({
      linkId: link.id,
      value: { guess: 'maybe worked' },
    });
    expect(result.learned).toBe(false);
    expect(result.reason).toBe('speculative_outcome_not_learned');
    expect(linker.listLearnedOutcomes()).toHaveLength(0);
  });

  it('enforces capability isolation when attaching actions', () => {
    const link = linker.createLinkFromInsight(sampleInsight({
      suggestedAction: {
        actionType: 'email.send',
        payload: {},
        description: 'email action',
      },
    }));

    const mismatched = linker.attachAction(link.id, 'action-1', 'finance.plaid_sync');
    expect(mismatched).toBeNull();

    const matched = linker.attachAction(link.id, 'action-1', 'email.send');
    expect(matched?.actionId).toBe('action-1');
    expect(matched?.actionType).toBe('email.send');
  });

  it('feeds trust ladder hooks without cross-capability privilege', () => {
    const db = new Database(':memory:');
    const autonomy = new AutonomyManager(db as unknown as DatabaseHandle);
    const approvalPatterns = new ApprovalPatternTracker(db as unknown as DatabaseHandle);
    const escalationEngine = new EscalationEngine({ db: db as unknown as DatabaseHandle, autonomy });
    const checkSpy = vi.spyOn(escalationEngine, 'checkForEscalations');

    const scopedLinker = createInMemoryOutcomeLinker({
      approvalPatterns,
      escalationEngine,
    });

    for (let i = 0; i < 10; i += 1) {
      approvalPatterns.recordApproval('email.draft', { replyToMessageId: 'msg-1' });
    }

    const emailLink = scopedLinker.createLinkFromInsight(sampleInsight({
      suggestedAction: {
        actionType: 'email.draft',
        payload: { replyToMessageId: 'msg-1' },
        description: 'Draft follow-up',
      },
    }));
    scopedLinker.attachAction(emailLink.id, 'action-email', 'email.draft');
    const emailResult = scopedLinker.recordOutcome({
      linkId: emailLink.id,
      value: { ok: true },
      measured: true,
    });
    expect(emailResult.escalationEligible).toBe(true);
    expect(checkSpy).toHaveBeenCalled();

    const financeInsight = sampleInsight({
      id: 'insight-finance',
      type: 'subscription_cancel',
      suggestedAction: {
        actionType: 'finance.plaid_sync',
        payload: {},
        description: 'sync finance',
      },
    });
    const financeLink = scopedLinker.createLinkFromInsight(financeInsight);
    scopedLinker.attachAction(financeLink.id, 'action-finance', 'finance.plaid_sync');
    scopedLinker.recordOutcome({
      linkId: financeLink.id,
      value: { ok: true },
      measured: true,
    });

    const calledActionTypes = checkSpy.mock.calls.flatMap((call) =>
      (call[0] as Array<{ actionType: string }>).map((pattern) => pattern.actionType),
    );
    expect(calledActionTypes).toContain('email.draft');
    expect(calledActionTypes.filter((type) => type === 'finance.plaid_sync').length).toBeLessThanOrEqual(1);
  });
});
