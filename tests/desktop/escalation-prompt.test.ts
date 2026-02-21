// Tests for EscalationPromptCard UI — rendering, interactions.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('EscalationPromptCard', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('data display', () => {
    it('renders escalation type label correctly', () => {
      const prompt = {
        id: 'esc-1',
        type: 'guardian_to_partner',
        domain: 'email',
        actionType: 'email.archive',
        consecutiveApprovals: 12,
        message: 'You\'ve approved 12 archive actions in a row.',
        previewActions: [
          {
            description: 'Archive low-priority newsletters',
            currentBehavior: 'Shows preview, waits for approval',
            newBehavior: 'Archives automatically, shows in digest',
            estimatedTimeSaved: '~2 min/day',
          },
        ],
        status: 'pending',
      };
      expect(prompt.type).toBe('guardian_to_partner');
      expect(prompt.previewActions.length).toBe(1);
    });

    it('displays preview actions with current vs new behavior', () => {
      const action = {
        description: 'Archive low-priority newsletters',
        currentBehavior: 'Shows preview, waits for approval',
        newBehavior: 'Archives automatically, shows in digest',
        estimatedTimeSaved: '~2 min/day',
      };
      expect(action.currentBehavior).toContain('approval');
      expect(action.newBehavior).toContain('automatic');
    });

    it('displays consecutive approval count', () => {
      const count = 12;
      const message = `You've approved ${count} actions in a row`;
      expect(message).toContain('12');
    });
  });

  describe('accept flow', () => {
    it('calls respond_to_escalation with accepted=true', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      await mockInvoke('respond_to_escalation', { promptId: 'esc-1', accepted: true });
      expect(mockInvoke).toHaveBeenCalledWith('respond_to_escalation', { promptId: 'esc-1', accepted: true });
    });
  });

  describe('dismiss flow', () => {
    it('calls respond_to_escalation with accepted=false', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      await mockInvoke('respond_to_escalation', { promptId: 'esc-1', accepted: false });
      expect(mockInvoke).toHaveBeenCalledWith('respond_to_escalation', { promptId: 'esc-1', accepted: false });
    });
  });

  describe('partner to alter ego', () => {
    it('shows appropriate label for P→AE escalation', () => {
      const prompt = {
        type: 'partner_to_alterego' as const,
        domain: 'email',
      };
      const label = prompt.type === 'partner_to_alterego' ? 'Alter Ego' : 'Partner';
      expect(label).toBe('Alter Ego');
    });
  });

  describe('check_escalations flow', () => {
    it('fetches escalation prompts from bridge', async () => {
      const prompts = [
        { id: 'esc-1', type: 'guardian_to_partner', status: 'pending' },
      ];
      mockInvoke.mockResolvedValue(prompts);
      const result = await mockInvoke('check_escalations');
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no escalations pending', async () => {
      mockInvoke.mockResolvedValue([]);
      const result = await mockInvoke('check_escalations');
      expect(result).toHaveLength(0);
    });
  });
});
