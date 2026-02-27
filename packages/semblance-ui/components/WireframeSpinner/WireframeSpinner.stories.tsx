import type { Meta, StoryObj } from '@storybook/react';
import { WireframeSpinner } from './WireframeSpinner';

const meta: Meta<typeof WireframeSpinner> = {
  title: 'Components/WireframeSpinner',
  component: WireframeSpinner,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof WireframeSpinner>;

export const Default: Story = { args: { size: 48 } };
export const Large: Story = { args: { size: 96 } };
export const Slow: Story = { args: { size: 48, speed: 0.4 } };
export const Fast: Story = { args: { size: 48, speed: 2.0 } };

export const OnCard: Story = {
  render: () => (
    <div style={{
      background: 'linear-gradient(135deg, #171B1F, #111518)',
      border: '1px solid rgba(255, 255, 255, 0.09)',
      borderRadius: 12,
      padding: 48,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      width: 320,
    }}>
      <WireframeSpinner size={64} />
      <span style={{
        fontFamily: 'DM Mono, monospace',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color: '#8593A4',
      }}>
        Semblance is thinking
      </span>
    </div>
  ),
};
