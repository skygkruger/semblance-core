import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['ghost', 'solid', 'subtle', 'opal', 'dismiss', 'destructive'],
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

export const Opal: Story = {
  args: { variant: 'opal', children: <span className="btn__text">Approve Action</span> },
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
          <Button variant="opal" size={size}><span className="btn__text">Approve</span></Button>
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
      <Button variant="opal" disabled><span className="btn__text">Approve</span></Button>
      <Button variant="dismiss" disabled>Dismiss</Button>
      <Button variant="destructive" disabled>Delete</Button>
    </div>
  ),
};
