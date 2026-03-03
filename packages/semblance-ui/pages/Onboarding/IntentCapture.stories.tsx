import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { IntentCapture } from './IntentCapture';
import './Onboarding.css';

// ─── Wrapper — dark background + centering ───────────────────────────────────

const CenterWrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    backgroundColor: '#0B0E11',
    padding: 32,
  }}>
    {children}
  </div>
);

// ─── Meta ────────────────────────────────────────────────────────────────────

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

// ─── Stories ─────────────────────────────────────────────────────────────────

/** Step 1 — Primary goal question. First sub-step, skip-all link visible. */
export const GoalStep: Story = {
  render: (args) => (
    <CenterWrap>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </CenterWrap>
  ),
};

/** Step 1 with no onSkip — skip-all link hidden. */
export const GoalStepNoSkipAll: Story = {
  render: (args) => (
    <CenterWrap>
      <IntentCapture onComplete={args.onComplete} />
    </CenterWrap>
  ),
};

/** Interactive — all three sub-steps navigable. Default render. */
export const Interactive: Story = {
  render: (args) => (
    <CenterWrap>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </CenterWrap>
  ),
};

/** With skip callback — demonstrates skip-all link at bottom. */
export const WithSkipAll: Story = {
  render: (args) => (
    <CenterWrap>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </CenterWrap>
  ),
};

/** Without skip callback — no skip-all link. */
export const WithoutSkipAll: Story = {
  render: (args) => (
    <CenterWrap>
      <IntentCapture onComplete={args.onComplete} />
    </CenterWrap>
  ),
};

/** Narrow viewport — responsive layout test. */
export const NarrowViewport: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: (args) => (
    <CenterWrap>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </CenterWrap>
  ),
};

/** Wide viewport — spacious desktop layout test. */
export const WideViewport: Story = {
  parameters: {
    viewport: { defaultViewport: 'responsive' },
  },
  render: (args) => (
    <CenterWrap>
      <IntentCapture onComplete={args.onComplete} onSkip={args.onSkip} />
    </CenterWrap>
  ),
};
