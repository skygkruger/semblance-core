import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { NamingYourAI } from './NamingYourAI';

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

const meta: Meta<typeof NamingYourAI> = {
  title: 'Pages/Onboarding/NamingYourAI',
  component: NamingYourAI,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <PageWrapper><Story /></PageWrapper>],
};

export default meta;
type Story = StoryObj<typeof NamingYourAI>;

export const NamingYourAIDefault: Story = {
  args: {},
};

export const NamingYourAITyping: Story = {
  args: { defaultValue: 'Atl' },
};

export const NamingYourAIComplete: Story = {
  args: { defaultValue: 'Atlas' },
};
