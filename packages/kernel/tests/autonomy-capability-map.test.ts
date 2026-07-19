import { describe, expect, it } from 'vitest';
import {
  evaluateAutonomyCapability,
  capabilityEscalationWouldHelp,
} from '../src/policy/autonomy-capability-map.js';

describe('evaluateAutonomyCapability', () => {
  it('Guardian email.send always requires approval', () => {
    const result = evaluateAutonomyCapability({
      tier: 'guardian',
      action: 'email.send',
      destination: 'user@example.com',
      priorApprovalsForThisCapability: 100,
    });

    expect(result.allow).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toContain('requires approval');
  });

  it('10 approvals of email.draft do NOT auto-grant email.send', () => {
    const draftResult = evaluateAutonomyCapability({
      tier: 'partner',
      action: 'email.draft',
      priorApprovalsForThisCapability: 10,
    });
    expect(draftResult.requiresApproval).toBe(false);

    const sendResult = evaluateAutonomyCapability({
      tier: 'partner',
      action: 'email.send',
      destination: 'novel@unknown.com',
      priorApprovalsForThisCapability: 0,
    });

    expect(sendResult.requiresApproval).toBe(true);
    expect(sendResult.reason).toContain('Novel destination');
  });

  it('Partner novel destination requires approval for email.send', () => {
    const result = evaluateAutonomyCapability({
      tier: 'partner',
      action: 'email.send',
      destination: 'novel@unknown.com',
      priorApprovalsForThisCapability: 0,
    });

    expect(result.allow).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toContain('novel@unknown.com');
  });

  it('Partner routine email.draft is autonomous', () => {
    const result = evaluateAutonomyCapability({
      tier: 'partner',
      action: 'email.draft',
      priorApprovalsForThisCapability: 0,
    });

    expect(result.allow).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('Alter Ego gates high-stakes email.send', () => {
    const routine = evaluateAutonomyCapability({
      tier: 'alter_ego',
      action: 'email.send',
      destination: 'user@example.com',
      sensitivity: 10,
    });
    expect(routine.requiresApproval).toBe(false);

    const highStakes = evaluateAutonomyCapability({
      tier: 'alter_ego',
      action: 'email.send',
      destination: 'user@example.com',
      sensitivity: 95,
    });
    expect(highStakes.requiresApproval).toBe(true);
  });
});

describe('capabilityEscalationWouldHelp', () => {
  it('email.draft approvals can escalate but email.send remains gated separately', () => {
    expect(capabilityEscalationWouldHelp('email.draft', 10)).toBe(true);
    expect(
      evaluateAutonomyCapability({
        tier: 'partner',
        action: 'email.send',
        destination: 'novel@unknown.com',
        priorApprovalsForThisCapability: 10,
      }).requiresApproval,
    ).toBe(false);
    expect(
      evaluateAutonomyCapability({
        tier: 'partner',
        action: 'email.send',
        destination: 'novel@unknown.com',
        priorApprovalsForThisCapability: 0,
      }).requiresApproval,
    ).toBe(true);
  });
});
