import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { AutonomyTier } from './AutonomyTier';
import type { AutonomyTier as AutonomyTierType } from '../../components/AutonomySelector/AutonomySelector.types';

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#0B0E11',
    overflow: 'hidden',
  }}>
    <DotMatrix />
    <div style={{
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 40,
    }}>
      {children}
    </div>
  </div>
);

const meta: Meta<typeof AutonomyTier> = {
  title: 'Onboarding/AutonomyTier',
  component: AutonomyTier,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <PageWrapper><Story /></PageWrapper>],
};

export default meta;
type Story = StoryObj<typeof AutonomyTier>;

export const Guardian: Story = {
  args: {
    value: 'guardian',
    onChange: () => {},
    onContinue: () => {},
  },
};

export const Partner: Story = {
  args: {
    value: 'partner',
    onChange: () => {},
    onContinue: () => {},
  },
};

export const AlterEgo: Story = {
  args: {
    value: 'alter_ego',
    onChange: () => {},
    onContinue: () => {},
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<AutonomyTierType>('partner');
    return <AutonomyTier value={value} onChange={setValue} onContinue={() => {}} />;
  },
};

export const Mobile: Story = {
  args: {
    value: 'partner',
    onChange: () => {},
    onContinue: () => {},
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <PageWrapper>
        <div style={{ maxWidth: 390, padding: 16 }}>
          <Story />
        </div>
      </PageWrapper>
    ),
  ],
};
