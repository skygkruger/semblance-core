import type { Meta, StoryObj } from '@storybook/react';
import { LicenseActivation } from './LicenseActivation';

const meta: Meta<typeof LicenseActivation> = {
  title: 'License/LicenseActivation',
  component: LicenseActivation,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LicenseActivation>;

export const Empty: Story = {
  args: {
    onActivate: async (key: string) => {
      await new Promise((r) => setTimeout(r, 1000));
      if (key.startsWith('sem_')) return { success: true };
      return { success: false, error: 'Invalid license key format' };
    },
  },
};

export const Validating: Story = {
  args: {
    onActivate: async () => {
      // Never resolves, simulating loading state
      await new Promise(() => {});
      return { success: false };
    },
  },
};

export const Success: Story = {
  args: {
    onActivate: async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { success: true };
    },
  },
};

export const Error: Story = {
  args: {
    onActivate: async () => {
      await new Promise((r) => setTimeout(r, 500));
      return { success: false, error: 'Invalid license key: signature verification failed' };
    },
  },
};

export const AlreadyActive: Story = {
  args: {
    onActivate: async () => ({ success: true }),
    alreadyActive: true,
  },
};
