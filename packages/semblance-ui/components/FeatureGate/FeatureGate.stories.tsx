import type { Meta, StoryObj } from '@storybook/react';
import { FeatureGate } from './FeatureGate';

const meta: Meta<typeof FeatureGate> = {
  title: 'License/FeatureGate',
  component: FeatureGate,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof FeatureGate>;

export const Unlocked: Story = {
  args: {
    feature: 'spending-insights',
    isPremium: true,
    children: (
      <div style={{ padding: 24, background: 'var(--s1)', borderRadius: 8, color: 'var(--white)' }}>
        Premium content is visible here.
      </div>
    ),
  },
};

export const Locked: Story = {
  args: {
    feature: 'spending-insights',
    isPremium: false,
    children: <div>This should not be visible</div>,
    onLearnMore: () => alert('Navigate to upgrade screen'),
  },
};

export const LockedWithCustomFallback: Story = {
  args: {
    feature: 'plaid-integration',
    isPremium: false,
    children: <div>This should not be visible</div>,
    fallback: (
      <div style={{ padding: 16, background: 'var(--s2)', borderRadius: 8, color: 'var(--sv3)', border: '1px solid var(--b2)' }}>
        Custom fallback: This feature requires the Digital Representative tier.
      </div>
    ),
  },
};
