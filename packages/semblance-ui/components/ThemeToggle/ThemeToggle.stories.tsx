import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeToggle } from './ThemeToggle';
import type { ThemeMode } from './ThemeToggle.types';

const meta: Meta<typeof ThemeToggle> = {
  title: 'Primitives/ThemeToggle',
  component: ThemeToggle,
};

export default meta;
type Story = StoryObj<typeof ThemeToggle>;

export const Dark: Story = {
  args: { value: 'dark', onChange: () => {} },
};

export const Light: Story = {
  args: { value: 'light', onChange: () => {} },
};

export const System: Story = {
  args: { value: 'system', onChange: () => {} },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<ThemeMode>('dark');
    return <ThemeToggle value={value} onChange={setValue} />;
  },
};
