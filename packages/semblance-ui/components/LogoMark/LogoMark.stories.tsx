import type { Meta, StoryObj } from '@storybook/react';
import { LogoMark } from './LogoMark';

const meta: Meta<typeof LogoMark> = {
  title: 'Brand/LogoMark',
  component: LogoMark,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof LogoMark>;

export const Small: Story = { args: { size: 64 } };
export const Default: Story = { args: { size: 120 } };
export const Large: Story = { args: { size: 200 } };
export const ExtraLarge: Story = { args: { size: 320 } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <LogoMark size={64} />
      <LogoMark size={120} />
      <LogoMark size={200} />
      <LogoMark size={320} />
    </div>
  ),
};
