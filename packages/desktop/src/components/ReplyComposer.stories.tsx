import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { ReplyComposer } from './ReplyComposer';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof ReplyComposer> = {
  title: 'Desktop/Inbox/ReplyComposer',
  component: ReplyComposer,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof ReplyComposer>;

export const EmptyReply: Story = {
  args: {
    email: {
      messageId: 'msg-001',
      from: 'sarah@company.com',
      fromName: 'Sarah Chen',
      subject: 'Q1 Budget Approval',
    },
    onSend: () => {},
    onSaveDraft: () => {},
    onCancel: () => {},
  },
};

export const WithDraft: Story = {
  args: {
    email: {
      messageId: 'msg-002',
      from: 'alex@company.com',
      fromName: 'Alex Rivera',
      subject: 'Re: Sprint retrospective notes',
    },
    draftBody: 'Hi Alex,\n\nThanks for sharing the retrospective notes. I agree with the points about improving our deployment process.\n\nBest,',
    onSend: () => {},
    onSaveDraft: () => {},
    onCancel: () => {},
  },
};

export const AlreadyRePrefixed: Story = {
  args: {
    email: {
      messageId: 'msg-003',
      from: 'dana@partner.org',
      fromName: 'Dana Kim',
      subject: 'Re: Partnership proposal follow-up',
    },
    onSend: () => {},
    onSaveDraft: () => {},
    onCancel: () => {},
  },
};
