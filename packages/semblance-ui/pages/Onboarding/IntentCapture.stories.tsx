import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { IntentCapture } from './IntentCapture';
import './Onboarding.css';

// --- PageWrapper with DotMatrix background -----------------------------------

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

// --- Meta --------------------------------------------------------------------

const meta: Meta<typeof IntentCapture> = {
  title: 'Pages/Onboarding/IntentCapture',
  component: IntentCapture,
  parameters: { layout: 'fullscreen' },
  args: {
    onComplete: () => {},
    onSkip: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof IntentCapture>;

// --- Stories -----------------------------------------------------------------

/** Step 1 — Primary goal question. First sub-step, skip-all link visible. */
export const GoalStep: Story = {
  render: (args) => (
    <PageWrapper>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </PageWrapper>
  ),
};

/** Step 1 with no onSkip — skip-all link hidden. */
export const GoalStepNoSkipAll: Story = {
  render: (args) => (
    <PageWrapper>
      <IntentCapture onComplete={args.onComplete} />
    </PageWrapper>
  ),
};

/** Interactive — all three sub-steps navigable. Default render. */
export const Interactive: Story = {
  render: (args) => (
    <PageWrapper>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </PageWrapper>
  ),
};

/** With skip callback — demonstrates skip-all link at bottom. */
export const WithSkipAll: Story = {
  render: (args) => (
    <PageWrapper>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </PageWrapper>
  ),
};

/** Without skip callback — no skip-all link. */
export const WithoutSkipAll: Story = {
  render: (args) => (
    <PageWrapper>
      <IntentCapture onComplete={args.onComplete} />
    </PageWrapper>
  ),
};

/** Narrow viewport — responsive layout test. */
export const NarrowViewport: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: (args) => (
    <PageWrapper>
      <div style={{ maxWidth: 390, padding: 16 }}>
        <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
      </div>
    </PageWrapper>
  ),
};

/** Wide viewport — spacious desktop layout test. */
export const WideViewport: Story = {
  parameters: {
    viewport: { defaultViewport: 'responsive' },
  },
  render: (args) => (
    <PageWrapper>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </PageWrapper>
  ),
};
