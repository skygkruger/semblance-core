import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { TermsAcceptanceStep } from './TermsAcceptanceStep';

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

const meta: Meta<typeof TermsAcceptanceStep> = {
  title: 'Onboarding/TermsAcceptanceStep',
  component: TermsAcceptanceStep,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <PageWrapper><Story /></PageWrapper>],
};

export default meta;
type Story = StoryObj<typeof TermsAcceptanceStep>;

export const Default: Story = {
  args: {
    onAccept: () => {},
    termsVersion: '1.0',
  },
};

export const CustomVersion: Story = {
  args: {
    onAccept: () => {},
    termsVersion: '2.1',
  },
};

export const Mobile: Story = {
  args: {
    onAccept: () => {},
    termsVersion: '1.0',
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
