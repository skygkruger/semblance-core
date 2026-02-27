import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['ghost', 'solid', 'subtle', 'approve', 'dismiss', 'destructive'],
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

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost Button' },
};

export const Solid: Story = {
  args: { variant: 'solid', children: 'Solid Button' },
};

export const Subtle: Story = {
  args: { variant: 'subtle', children: 'Subtle Button' },
};

export const Approve: Story = {
  args: { variant: 'approve', children: 'Approve Action' },
};

export const Dismiss: Story = {
  args: { variant: 'dismiss', children: 'Dismiss' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete' },
};

export const Disabled: Story = {
  args: { variant: 'ghost', children: 'Disabled', disabled: true },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(['sm', 'md', 'lg'] as const).map(size => (
        <div key={size} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--sv1)', fontFamily: 'var(--fm)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', width: 28 }}>{size}</span>
          <Button variant="ghost" size={size}>Ghost</Button>
          <Button variant="solid" size={size}>Solid</Button>
          <Button variant="subtle" size={size}>Subtle</Button>
          <Button variant="approve" size={size}>Approve</Button>
          <Button variant="dismiss" size={size}>Dismiss</Button>
          <Button variant="destructive" size={size}>Delete</Button>
        </div>
      ))}
    </div>
  ),
};

export const AllDisabled: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Button variant="ghost" disabled>Ghost</Button>
      <Button variant="solid" disabled>Solid</Button>
      <Button variant="subtle" disabled>Subtle</Button>
      <Button variant="approve" disabled>Approve</Button>
      <Button variant="dismiss" disabled>Dismiss</Button>
      <Button variant="destructive" disabled>Delete</Button>
    </div>
  ),
};
