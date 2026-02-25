import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', size: 'md', children: 'Primary Button' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', size: 'md', children: 'Secondary Button' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', size: 'md', children: 'Ghost Button' },
};

export const Danger: Story = {
  args: { variant: 'danger', size: 'md', children: 'Danger Button' },
};

export const Small: Story = {
  args: { variant: 'primary', size: 'sm', children: 'Small' },
};

export const Medium: Story = {
  args: { variant: 'primary', size: 'md', children: 'Medium' },
};

export const Large: Story = {
  args: { variant: 'primary', size: 'lg', children: 'Large' },
};

export const Disabled: Story = {
  args: { variant: 'primary', size: 'md', children: 'Disabled', disabled: true },
};

export const AllVariantsSmall: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant="primary" size="sm">Primary</Button>
      <Button variant="secondary" size="sm">Secondary</Button>
      <Button variant="ghost" size="sm">Ghost</Button>
      <Button variant="danger" size="sm">Danger</Button>
    </div>
  ),
};

export const AllVariantsMedium: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant="primary" size="md">Primary</Button>
      <Button variant="secondary" size="md">Secondary</Button>
      <Button variant="ghost" size="md">Ghost</Button>
      <Button variant="danger" size="md">Danger</Button>
    </div>
  ),
};

export const AllVariantsLarge: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant="primary" size="lg">Primary</Button>
      <Button variant="secondary" size="lg">Secondary</Button>
      <Button variant="ghost" size="lg">Ghost</Button>
      <Button variant="danger" size="lg">Danger</Button>
    </div>
  ),
};

export const AllDisabled: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant="primary" disabled>Primary</Button>
      <Button variant="secondary" disabled>Secondary</Button>
      <Button variant="ghost" disabled>Ghost</Button>
      <Button variant="danger" disabled>Danger</Button>
    </div>
  ),
};
