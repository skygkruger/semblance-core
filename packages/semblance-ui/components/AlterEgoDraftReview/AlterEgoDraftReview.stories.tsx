import type { Meta, StoryObj } from '@storybook/react';
import { AlterEgoDraftReview } from './AlterEgoDraftReview';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof AlterEgoDraftReview> = {
  title: 'AlterEgo/DraftReview',
  component: AlterEgoDraftReview,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 520 }}>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AlterEgoDraftReview>;

export const Default: Story = {
  args: {
    actionId: 'act-001',
    contactEmail: 'support@figma.com',
    subject: 'Cancellation request — Pro plan',
    body: 'Hi,\n\nI would like to cancel my Figma Pro subscription effective immediately. My account email is sky@veridian.run.\n\nPlease confirm the cancellation and let me know if there are any remaining charges.\n\nThank you,\nSky',
    trustCount: 3,
    trustThreshold: 5,
    onSend: () => {},
    onEdit: () => {},
  },
};

export const HighTrust: Story = {
  args: {
    actionId: 'act-002',
    contactEmail: 'jordan@acme.co',
    subject: 'Re: Design review feedback',
    body: 'Hey Jordan,\n\nThanks for the detailed review. I agree with points 2 and 4 — I\'ll update the component spacing and fix the contrast issue by EOD.\n\nFor point 1, I think the current hierarchy works better with the new nav. Happy to walk through it in our 1:1 Thursday.\n\nBest,\nSky',
    trustCount: 12,
    trustThreshold: 5,
    onSend: () => {},
    onEdit: () => {},
  },
};

export const NoSubject: Story = {
  args: {
    actionId: 'act-003',
    contactEmail: 'reminders@dentistoffice.com',
    body: 'Hi, I need to reschedule my Tuesday 10am appointment to Thursday at 2pm if that slot is available. Thank you.',
    trustCount: 0,
    trustThreshold: 5,
    onSend: () => {},
    onEdit: () => {},
  },
};
