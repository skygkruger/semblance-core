import type { Meta, StoryObj } from '@storybook/react';
import { MobileTabBar } from './MobileTabBar';

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const tabItems = [
  { id: 'inbox', label: 'Inbox', icon: icon('M22 12h-6l-2 3h-4l-2-3H2') },
  { id: 'brief', label: 'Brief', icon: icon('M12 2L2 7l10 5 10-5-10-5z') },
  { id: 'knowledge', label: 'Knowledge', icon: icon('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z') },
  { id: 'actions', label: 'Actions', icon: icon('M13 2L3 14h9l-1 8 10-12h-9l1-8z') },
  { id: 'settings', label: 'Settings', icon: icon('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z') },
];

const meta: Meta<typeof MobileTabBar> = {
  title: 'Navigation/MobileTabBar',
  component: MobileTabBar,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
  },
};

export default meta;
type Story = StoryObj<typeof MobileTabBar>;

export const InboxActive: Story = {
  args: { items: tabItems, activeId: 'inbox' },
};

export const BriefActive: Story = {
  args: { items: tabItems, activeId: 'brief' },
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 80, paddingBottom: 80 }}>
      {tabItems.map(tab => (
        <div key={tab.id}>
          <p style={{ color: 'var(--sv1)', fontFamily: 'var(--fm)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 16px', marginBottom: 8 }}>
            Active: {tab.label}
          </p>
          <MobileTabBar items={tabItems} activeId={tab.id} />
        </div>
      ))}
    </div>
  ),
};
