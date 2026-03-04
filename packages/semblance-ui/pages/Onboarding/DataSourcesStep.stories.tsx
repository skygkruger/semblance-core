import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { DataSourcesStep } from './DataSourcesStep';

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

const meta: Meta<typeof DataSourcesStep> = {
  title: 'Onboarding/DataSourcesStep',
  component: DataSourcesStep,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <PageWrapper><Story /></PageWrapper>],
};

export default meta;
type Story = StoryObj<typeof DataSourcesStep>;

export const Default: Story = {
  args: {
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const SomeConnected: Story = {
  args: {
    initialConnected: new Set(['email', 'calendar']),
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const AllConnected: Story = {
  args: {
    initialConnected: new Set(['email', 'calendar', 'files', 'contacts', 'health', 'slack']),
    onContinue: () => {},
    onSkip: () => {},
  },
};

export const Mobile: Story = {
  args: {
    onContinue: () => {},
    onSkip: () => {},
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
