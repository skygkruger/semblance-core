import type { Meta, StoryObj } from '@storybook/react';
import { ActionLogItem } from './ActionLogItem';

const meta: Meta<typeof ActionLogItem> = {
  title: 'Components/ActionLogItem',
  component: ActionLogItem,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 600 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof ActionLogItem>;

export const Completed: Story = {
  args: {
    status: 'completed',
    text: 'Sent weekly digest to sky@veridian.run',
    domain: 'Email',
    timestamp: '08:12',
  },
};

export const Pending: Story = {
  args: {
    status: 'pending',
    text: 'Waiting for approval: cancel Figma subscription',
    domain: 'Finance',
    timestamp: '08:45',
  },
};

export const Failed: Story = {
  args: {
    status: 'failed',
    text: 'Failed to reschedule dentist — clinic unreachable',
    domain: 'Calendar',
    timestamp: '09:01',
  },
};

export const Undone: Story = {
  args: {
    status: 'undone',
    text: 'Archived promotional email (undone by user)',
    domain: 'Email',
    timestamp: '07:30',
  },
};

export const WithUndo: Story = {
  args: {
    status: 'completed',
    text: 'Moved $500 to savings account',
    domain: 'Finance',
    timestamp: '06:00',
    onUndo: () => {},
  },
};

export const LogList: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <ActionLogItem status="completed" text="Sent weekly digest to sky@veridian.run" domain="Email" timestamp="08:12" onUndo={() => {}} />
      <ActionLogItem status="completed" text="Rescheduled dentist to Thursday 2pm" domain="Calendar" timestamp="08:10" onUndo={() => {}} />
      <ActionLogItem status="completed" text="Archived 8 promotional emails" domain="Email" timestamp="07:45" />
      <ActionLogItem status="pending" text="Cancel Figma subscription — awaiting approval" domain="Finance" timestamp="08:45" />
      <ActionLogItem status="completed" text="Updated contact: Sarah Chen — new phone number" domain="Contacts" timestamp="07:30" />
      <ActionLogItem status="failed" text="Could not fetch bank transactions — auth expired" domain="Finance" timestamp="07:15" />
      <ActionLogItem status="completed" text="Created reminder: renew passport by March 15" domain="Tasks" timestamp="07:00" />
      <ActionLogItem status="undone" text="Sent reply to recruiter (undone)" domain="Email" timestamp="06:45" />
      <ActionLogItem status="completed" text="Downloaded health data from Apple Health" domain="Health" timestamp="06:30" />
      <ActionLogItem status="completed" text="Categorized 23 transactions for February" domain="Finance" timestamp="06:00" onUndo={() => {}} />
    </div>
  ),
};
