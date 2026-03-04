import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { KnowledgeMomentDisplay } from './KnowledgeMomentDisplay';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof KnowledgeMomentDisplay> = {
  title: 'Desktop/Knowledge/KnowledgeMomentDisplay',
  component: KnowledgeMomentDisplay,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof KnowledgeMomentDisplay>;

const fullMoment = {
  tier: 3 as const,
  upcomingMeeting: {
    title: 'Product Review with Engineering',
    startTime: '2026-03-03T10:00:00Z',
    attendees: ['Sarah Chen', 'Alex Rivera', 'Dana Kim'],
  },
  emailContext: {
    attendeeName: 'Sarah Chen',
    recentEmailCount: 7,
    lastEmailSubject: 'Q1 Budget Approval',
    lastEmailDate: '2026-03-02T16:30:00Z',
    hasUnansweredEmail: true,
    unansweredSubject: 'Timeline concerns for Phase 2',
  },
  relatedDocuments: [
    { fileName: 'Q1_Budget_Final.xlsx', filePath: '/docs/Q1_Budget_Final.xlsx', relevanceReason: 'Referenced in recent emails' },
    { fileName: 'Sprint_Retro_Notes.md', filePath: '/docs/Sprint_Retro_Notes.md', relevanceReason: 'Shared by attendee' },
  ],
  message: 'You have context across 7 emails, a meeting, and 2 related documents. Sarah is waiting on your timeline response.',
  suggestedAction: { type: 'draft_reply' as const, description: 'Draft reply to Sarah about timeline' },
};

export const FullContext: Story = {
  args: {
    moment: fullMoment,
    aiName: 'Semblance',
    onSuggestedAction: () => {},
    onContinue: () => {},
    isOnboarding: false,
  },
};

export const OnboardingProgressive: Story = {
  args: {
    moment: fullMoment,
    aiName: 'Nova',
    onSuggestedAction: () => {},
    onContinue: () => {},
    isOnboarding: true,
  },
};

export const MeetingOnly: Story = {
  args: {
    moment: {
      tier: 1 as const,
      upcomingMeeting: {
        title: 'Sprint Planning',
        startTime: '2026-03-03T15:00:00Z',
        attendees: ['Team'],
      },
      emailContext: null,
      relatedDocuments: [],
      message: 'You have a meeting coming up this afternoon.',
      suggestedAction: null,
    },
    aiName: 'Semblance',
    onContinue: () => {},
    isOnboarding: false,
  },
};
