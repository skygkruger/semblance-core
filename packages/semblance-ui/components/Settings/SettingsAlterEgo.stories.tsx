import type { Meta, StoryObj } from '@storybook/react';
import { SettingsAlterEgo } from './SettingsAlterEgo';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof SettingsAlterEgo> = {
  title: 'Settings/AlterEgo',
  component: SettingsAlterEgo,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto', minHeight: '100vh' }}>
          <Story />
        </div>
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
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 390, minHeight: '100vh' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};
