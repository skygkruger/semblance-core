import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  argTypes: {
    hoverable: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#ECEDF0', marginBottom: 8 }}>Card Title</h3>
        <p style={{ fontSize: 14, color: '#9BA0B0' }}>Card content goes here. This is a default non-hoverable card.</p>
      </div>
    ),
  },
};

export const Hoverable: Story = {
  args: {
    hoverable: true,
    children: (
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#ECEDF0', marginBottom: 8 }}>Hoverable Card</h3>
        <p style={{ fontSize: 14, color: '#9BA0B0' }}>Hover over this card to see the lift effect.</p>
      </div>
    ),
  },
};
