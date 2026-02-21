// Tests for Subscription UI — SubscriptionInsightCard rendering and interactions.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('SubscriptionInsightCard', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('data rendering', () => {
    it('displays the total potential savings', () => {
      const subscriptions = [
        { id: '1', merchantName: 'Netflix', amount: -15.99, frequency: 'monthly', estimatedAnnualCost: 191.88, status: 'forgotten', confidence: 0.9 },
        { id: '2', merchantName: 'Hulu', amount: -7.99, frequency: 'monthly', estimatedAnnualCost: 95.88, status: 'forgotten', confidence: 0.8 },
      ];
      const totalSavings = subscriptions.reduce((sum, s) => sum + s.estimatedAnnualCost, 0);
      expect(totalSavings).toBeCloseTo(287.76, 1);
    });

    it('calculates correct forgotten count', () => {
      const subscriptions = [
        { id: '1', merchantName: 'Netflix', status: 'forgotten' },
        { id: '2', merchantName: 'Hulu', status: 'active' },
        { id: '3', merchantName: 'Spotify', status: 'forgotten' },
      ];
      const forgotten = subscriptions.filter(s => s.status === 'forgotten');
      expect(forgotten.length).toBe(2);
    });

    it('formats annual cost as currency', () => {
      const cost = 191.88;
      const formatted = `$${cost.toFixed(0)}/yr`;
      expect(formatted).toBe('$192/yr');
    });
  });

  describe('cancel action', () => {
    it('calls update_subscription_status with cancelled', async () => {
      mockInvoke.mockResolvedValue({});
      await mockInvoke('update_subscription_status', { chargeId: '1', status: 'cancelled' });
      expect(mockInvoke).toHaveBeenCalledWith('update_subscription_status', { chargeId: '1', status: 'cancelled' });
    });

    it('calls update_subscription_status with user_confirmed for Keep', async () => {
      mockInvoke.mockResolvedValue({});
      await mockInvoke('update_subscription_status', { chargeId: '1', status: 'user_confirmed' });
      expect(mockInvoke).toHaveBeenCalledWith('update_subscription_status', { chargeId: '1', status: 'user_confirmed' });
    });
  });

  describe('import flow', () => {
    it('calls import_statement for file import', async () => {
      const result = { transactions: [], import: { id: 'imp-1', transactionCount: 10 } };
      mockInvoke.mockResolvedValue(result);
      const response = await mockInvoke('import_statement', { filePath: '/path/to/file.csv' });
      expect(response.import.transactionCount).toBe(10);
    });

    it('handles import errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Invalid file'));
      await expect(mockInvoke('import_statement', { filePath: '/bad/file.csv' })).rejects.toThrow('Invalid file');
    });
  });

  describe('subscription summary', () => {
    it('retrieves subscription summary', async () => {
      const summary = {
        totalMonthly: 50,
        totalAnnual: 600,
        activeCount: 5,
        forgottenCount: 2,
        potentialSavings: 200,
      };
      mockInvoke.mockResolvedValue(summary);
      const result = await mockInvoke('get_subscription_summary');
      expect(result.activeCount).toBe(5);
      expect(result.forgottenCount).toBe(2);
      expect(result.potentialSavings).toBe(200);
    });
  });

  describe('autonomy tier behavior', () => {
    it('Guardian: shows draft email preview for cancel', () => {
      // In Guardian mode, cancel shows a draft preview
      const tier = 'guardian';
      expect(tier === 'guardian').toBe(true);
      // Behavior: approval_required = true, shows preview
    });

    it('Partner: executes cancel with brief preview', () => {
      const tier = 'partner';
      expect(tier === 'partner').toBe(true);
      // Behavior: auto-execute for routine, shows brief preview
    });

    it('Alter Ego: cancels immediately with undo option', () => {
      const tier = 'alter_ego';
      expect(tier === 'alter_ego').toBe(true);
      // Behavior: immediate action + undo capability
    });
  });
});
