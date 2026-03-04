import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { SplashScreen } from './SplashScreen';

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

const meta: Meta<typeof SplashScreen> = {
  title: 'Onboarding/SplashScreen',
  component: SplashScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <PageWrapper><Story /></PageWrapper>],
};

export default meta;
type Story = StoryObj<typeof SplashScreen>;

export const Default: Story = {
  args: {
    onBegin: () => {},
  },
};

export const WithAutoAdvance: Story = {
  args: {
    onBegin: () => {},
    autoAdvanceMs: 5000,
  },
};

export const Mobile: Story = {
  args: {
    onBegin: () => {},
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
