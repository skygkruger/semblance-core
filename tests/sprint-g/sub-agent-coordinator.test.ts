import { describe, it, expect, beforeEach } from 'vitest';
import { SubAgentCoordinator } from '../../packages/core/agent/sub-agent-coordinator.js';

describe('Sprint G — Sub-Agent Coordinator', () => {
  let coordinator: SubAgentCoordinator;

  beforeEach(() => {
    coordinator = new SubAgentCoordinator();
  });

  it('creates a sub-agent and returns an ID', async () => {
    const agentId = await coordinator.createSubAgent({
      sessionKey: 'work:email:drafts',
      allowedTools: ['search_emails', 'draft_email'],
    });
    expect(agentId).toBeTruthy();
    expect(agentId).toContain('agent_');
  });

  it('lists active sub-agents', async () => {
    await coordinator.createSubAgent({
      sessionKey: 'work:email:drafts',
      allowedTools: ['search_emails'],
    });
    await coordinator.createSubAgent({
      sessionKey: 'personal:calendar:scheduler',
      allowedTools: ['list_calendar_events', 'create_calendar_event'],
    });

    const agents = coordinator.listSubAgents();
    expect(agents).toHaveLength(2);
  });

  it('isToolAllowed enforces tool restrictions', async () => {
    await coordinator.createSubAgent({
      sessionKey: 'restricted',
      allowedTools: ['search_emails'],
    });

    expect(coordinator.isToolAllowed('restricted', 'search_emails')).toBe(true);
    expect(coordinator.isToolAllowed('restricted', 'send_email')).toBe(false);
  });

  it('isToolAllowed returns true for non-agent sessions (unrestricted)', () => {
    expect(coordinator.isToolAllowed('no-agent-here', 'anything')).toBe(true);
  });

  it('terminates a sub-agent', async () => {
    await coordinator.createSubAgent({
      sessionKey: 'temp',
      allowedTools: ['test_tool'],
    });

    coordinator.terminateSubAgent('temp');
    expect(coordinator.listSubAgents()).toHaveLength(0);
  });

  it('getActiveCount returns correct count', async () => {
    expect(coordinator.getActiveCount()).toBe(0);
    await coordinator.createSubAgent({ sessionKey: 'a', allowedTools: [] });
    expect(coordinator.getActiveCount()).toBe(1);
  });

  it('supports system prompt override', async () => {
    await coordinator.createSubAgent({
      sessionKey: 'custom',
      allowedTools: ['tool1'],
      systemPromptOverride: 'You are a specialized email agent.',
    });

    const agent = coordinator.getSubAgent('custom');
    expect(agent).not.toBeNull();
    expect(agent!.systemPromptOverride).toBe('You are a specialized email agent.');
  });

  it('supports autonomy overrides', async () => {
    await coordinator.createSubAgent({
      sessionKey: 'strict',
      allowedTools: ['tool1'],
      autonomyOverrides: { email: 'guardian' },
    });

    const agent = coordinator.getSubAgent('strict');
    expect(agent?.autonomyOverrides).toEqual({ email: 'guardian' });
  });
});
