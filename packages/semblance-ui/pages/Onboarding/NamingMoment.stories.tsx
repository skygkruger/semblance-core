import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { NamingMoment } from './NamingMoment';

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

const meta: Meta<typeof NamingMoment> = {
  title: 'Onboarding/NamingMoment',
  component: NamingMoment,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <PageWrapper><Story /></PageWrapper>],
};

export default meta;
type Story = StoryObj<typeof NamingMoment>;

export const Default: Story = {
  args: {
    onComplete: () => {},
  },
};

export const WithDefaultValue: Story = {
  args: {
    onComplete: () => {},
    defaultValue: 'Sky',
  },
};

export const Mobile: Story = {
  args: {
    onComplete: () => {},
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
