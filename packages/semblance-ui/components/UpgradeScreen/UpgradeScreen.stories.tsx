import type { Meta, StoryObj } from '@storybook/react';
import { UpgradeScreen } from './UpgradeScreen';

const meta: Meta<typeof UpgradeScreen> = {
  title: 'License/UpgradeScreen',
  component: UpgradeScreen,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof UpgradeScreen>;

const defaultHandlers = {
  onCheckout: (plan: 'monthly' | 'founding' | 'lifetime') => alert(`Checkout: ${plan}`),
  onActivateKey: async (key: string) => {
    await new Promise((r) => setTimeout(r, 1000));
    if (key.startsWith('sem_')) return { success: true };
    return { success: false, error: 'Invalid license key' };
  },
  onBack: () => alert('Back'),
};

export const FreeTier: Story = {
  args: {
    currentTier: 'free',
    isFoundingMember: false,
    foundingSeat: null,
    ...defaultHandlers,
  },
};

export const FoundingMember: Story = {
  args: {
    currentTier: 'founding',
    isFoundingMember: true,
    foundingSeat: 42,
    ...defaultHandlers,
  },
};

export const ActiveMonthly: Story = {
  args: {
    currentTier: 'digital-representative',
    isFoundingMember: false,
    foundingSeat: null,
    ...defaultHandlers,
  },
};

export const ActiveLifetime: Story = {
  args: {
    currentTier: 'lifetime',
    isFoundingMember: false,
    foundingSeat: null,
    ...defaultHandlers,
  },
};

export const Mobile: Story = {
  args: {
    currentTier: 'free',
    isFoundingMember: false,
    foundingSeat: null,
    ...defaultHandlers,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
