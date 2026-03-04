import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { SubscriptionInsightCard } from './SubscriptionInsightCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof SubscriptionInsightCard> = {
  title: 'Desktop/Finance/SubscriptionInsightCard',
  component: SubscriptionInsightCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof SubscriptionInsightCard>;

export const WithForgottenSubscriptions: Story = {
  args: {
    charges: [
      { id: 'c-1', merchantName: 'CloudSync Pro', amount: 9.99, frequency: 'monthly', confidence: 0.92, lastChargeDate: '2026-02-15', chargeCount: 8, estimatedAnnualCost: 119.88, status: 'forgotten' },
      { id: 'c-2', merchantName: 'DesignTools.io', amount: 14.99, frequency: 'monthly', confidence: 0.85, lastChargeDate: '2026-02-20', chargeCount: 5, estimatedAnnualCost: 179.88, status: 'forgotten' },
      { id: 'c-3', merchantName: 'Spotify', amount: 10.99, frequency: 'monthly', confidence: 0.98, lastChargeDate: '2026-02-28', chargeCount: 24, estimatedAnnualCost: 131.88, status: 'active' },
      { id: 'c-4', merchantName: 'iCloud+', amount: 2.99, frequency: 'monthly', confidence: 0.99, lastChargeDate: '2026-03-01', chargeCount: 36, estimatedAnnualCost: 35.88, status: 'active' },
      { id: 'c-5', merchantName: 'GitHub Pro', amount: 4.00, frequency: 'monthly', confidence: 0.97, lastChargeDate: '2026-02-25', chargeCount: 18, estimatedAnnualCost: 48.00, status: 'active' },
    ],
    summary: {
      totalMonthly: 42.96,
      totalAnnual: 515.52,
      activeCount: 5,
      forgottenCount: 2,
      potentialSavings: 299.76,
    },
    onDismiss: () => {},
  },
};

export const AllActive: Story = {
  args: {
    charges: [
      { id: 'c-3', merchantName: 'Spotify', amount: 10.99, frequency: 'monthly', confidence: 0.98, lastChargeDate: '2026-02-28', chargeCount: 24, estimatedAnnualCost: 131.88, status: 'active' },
      { id: 'c-4', merchantName: 'iCloud+', amount: 2.99, frequency: 'monthly', confidence: 0.99, lastChargeDate: '2026-03-01', chargeCount: 36, estimatedAnnualCost: 35.88, status: 'active' },
    ],
    summary: {
      totalMonthly: 13.98,
      totalAnnual: 167.76,
      activeCount: 2,
      forgottenCount: 0,
      potentialSavings: 0,
    },
    onDismiss: () => {},
  },
};
