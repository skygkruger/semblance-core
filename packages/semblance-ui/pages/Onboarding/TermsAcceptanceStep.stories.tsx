import type { Meta, StoryObj } from '@storybook/react';
import { TermsAcceptanceStep } from './TermsAcceptanceStep';

const meta: Meta<typeof TermsAcceptanceStep> = {
  title: 'Onboarding/TermsAcceptanceStep',
  component: TermsAcceptanceStep,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TermsAcceptanceStep>;

export const Default: Story = {
  args: {
    onAccept: () => {},
    termsVersion: '1.0',
  },
};

export const CustomVersion: Story = {
  args: {
    onAccept: () => {},
    termsVersion: '2.1',
  },
};

export const Mobile: Story = {
  args: {
    onAccept: () => {},
    termsVersion: '1.0',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
