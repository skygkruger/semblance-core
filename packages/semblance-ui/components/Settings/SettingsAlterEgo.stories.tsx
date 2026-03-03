import type { Meta, StoryObj } from '@storybook/react';
import { SettingsAlterEgo } from './SettingsAlterEgo';

const meta: Meta<typeof SettingsAlterEgo> = {
  title: 'Settings/AlterEgo',
  component: SettingsAlterEgo,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', width: '100%', maxWidth: 600, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SettingsAlterEgo>;

export const Default: Story = {
  args: {
    dollarThreshold: 50,
    confirmationDisabledCategories: [],
    onChange: () => {},
    onBack: () => {},
  },
};

export const SomeCategoriesDisabled: Story = {
  args: {
    dollarThreshold: 100,
    confirmationDisabledCategories: ['email', 'calendar'],
    onChange: () => {},
    onBack: () => {},
  },
};

export const HighThreshold: Story = {
  args: {
    dollarThreshold: 500,
    confirmationDisabledCategories: ['email', 'message', 'calendar', 'file'],
    onChange: () => {},
    onBack: () => {},
  },
};

export const Mobile: Story = {
  args: {
    dollarThreshold: 50,
    confirmationDisabledCategories: [],
    onChange: () => {},
    onBack: () => {},
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', width: '100%', maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
