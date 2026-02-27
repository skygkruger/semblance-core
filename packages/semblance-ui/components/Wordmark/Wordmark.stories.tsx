import type { Meta, StoryObj } from '@storybook/react';
import { Wordmark } from './Wordmark';

const meta: Meta<typeof Wordmark> = {
  title: 'Brand/Wordmark',
  component: Wordmark,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Wordmark>;

export const Nav: Story = {
  args: { size: 'nav', shimmer: true },
};

export const Hero: Story = {
  args: { size: 'hero', shimmer: true },
};

export const Footer: Story = {
  args: { size: 'footer', shimmer: false },
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, alignItems: 'center' }}>
      <Wordmark size="hero" />
      <Wordmark size="nav" />
      <Wordmark size="footer" />
    </div>
  ),
};
