import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { InitializeStep } from './InitializeStep';
import type { ModelDownload, KnowledgeMomentData } from './InitializeStep.types';
import './Onboarding.css';

// --- Fixtures ----------------------------------------------------------------

const DOWNLOADS_IN_PROGRESS: ModelDownload[] = [
  {
    modelName: 'Llama 3.2 3B Q4',
    totalBytes: 2_147_483_648,
    downloadedBytes: 1_288_490_189,
    speedBytesPerSec: 52_428_800,
    status: 'downloading',
  },
  {
    modelName: 'nomic-embed-text',
    totalBytes: 274_877_907,
    downloadedBytes: 274_877_907,
    speedBytesPerSec: 0,
    status: 'complete',
  },
];

const DOWNLOADS_COMPLETE: ModelDownload[] = [
  {
    modelName: 'Llama 3.2 3B Q4',
    totalBytes: 2_147_483_648,
    downloadedBytes: 2_147_483_648,
    speedBytesPerSec: 0,
    status: 'complete',
  },
  {
    modelName: 'nomic-embed-text',
    totalBytes: 274_877_907,
    downloadedBytes: 274_877_907,
    speedBytesPerSec: 0,
    status: 'complete',
  },
];

const KNOWLEDGE_MOMENT: KnowledgeMomentData = {
  title: 'You have a dentist appointment this Thursday that conflicts with your team standup.',
  summary: 'Your calendar shows a dental cleaning at 10:00 AM on Thursday, but your recurring engineering standup is at 10:15 AM. Based on past patterns, you usually reschedule medical appointments rather than skip standups.',
  connections: ['Google Calendar', 'Email', 'Contacts'],
};

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

const meta: Meta<typeof InitializeStep> = {
  title: 'Pages/Onboarding/InitializeStep',
  component: InitializeStep,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof InitializeStep>;

// --- Stories -----------------------------------------------------------------

/** Model downloads in progress — SkeletonCard + progress bars visible. */
export const Downloading: Story = {
  render: () => (
    <PageWrapper>
      <InitializeStep
        downloads={DOWNLOADS_IN_PROGRESS}
        knowledgeMoment={null}
        loading={false}
        aiName="Nova"
      />
    </PageWrapper>
  ),
};

/** Downloads complete, knowledge graph building — SkeletonCard indexing variant. */
export const BuildingKnowledge: Story = {
  render: () => (
    <PageWrapper>
      <InitializeStep
        downloads={DOWNLOADS_COMPLETE}
        knowledgeMoment={null}
        loading={true}
        aiName="Nova"
      />
    </PageWrapper>
  ),
};

/** Knowledge Moment card revealed — opal-bordered card with AI name shimmer. */
export const KnowledgeMomentReady: Story = {
  render: () => (
    <PageWrapper>
      <InitializeStep
        downloads={DOWNLOADS_COMPLETE}
        knowledgeMoment={KNOWLEDGE_MOMENT}
        loading={false}
        onComplete={() => console.log('[Story] onComplete fired')}
        aiName="Nova"
        runtimeReady
      />
    </PageWrapper>
  ),
};

/** Ready without a knowledge moment — fallback text + Start button. */
export const ReadyNoMoment: Story = {
  render: () => (
    <PageWrapper>
      <InitializeStep
        downloads={DOWNLOADS_COMPLETE}
        knowledgeMoment={null}
        loading={false}
        onComplete={() => console.log('[Story] onComplete fired')}
        aiName="Nova"
        runtimeReady
      />
    </PageWrapper>
  ),
};

/** Downloads complete but runtime still loading — button disabled. */
export const RuntimeNotReady: Story = {
  render: () => (
    <PageWrapper>
      <InitializeStep
        downloads={DOWNLOADS_COMPLETE}
        knowledgeMoment={KNOWLEDGE_MOMENT}
        loading={false}
        onComplete={() => console.log('[Story] onComplete fired')}
        aiName="Nova"
        runtimeReady={false}
      />
    </PageWrapper>
  ),
};
