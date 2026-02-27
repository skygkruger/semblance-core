import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Card>;

const content = (
  <div>
    <h3 style={{ fontFamily: 'var(--fd)', fontWeight: 300, fontSize: 'var(--text-xl)', color: 'var(--w-dim)', margin: 0 }}>
      Card Title
    </h3>
    <p style={{ color: 'var(--sv3)', fontSize: 'var(--text-base)', marginTop: 8 }}>
      Card body content with v3 typography and color system.
    </p>
  </div>
);

export const Default: Story = {
  args: { children: content },
};

export const Elevated: Story = {
  args: { variant: 'elevated', children: content },
};

export const Briefing: Story = {
  args: { variant: 'briefing', children: content },
};

export const WithHover: Story = {
  args: { hoverable: true, children: content },
};

export const GridLayout: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 280px)', gap: 16 }}>
      <Card hoverable>{content}</Card>
      <Card variant="elevated" hoverable>{content}</Card>
      <Card variant="briefing" hoverable>{content}</Card>
    </div>
  ),
};
