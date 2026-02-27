import type { Meta, StoryObj } from '@storybook/react';
import { DesktopSidebar } from './DesktopSidebar';

const icon = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const navItems = [
  { id: 'inbox', label: 'Inbox', icon: icon('M22 12h-6l-2 3h-4l-2-3H2') },
  { id: 'brief', label: 'Morning Brief', icon: icon('M12 2L2 7l10 5 10-5-10-5z') },
  { id: 'knowledge', label: 'Knowledge', icon: icon('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z') },
  { id: 'actions', label: 'Actions', icon: icon('M13 2L3 14h9l-1 8 10-12h-9l1-8z') },
  { id: 'settings', label: 'Settings', icon: icon('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z') },
];

const meta: Meta<typeof DesktopSidebar> = {
  title: 'Navigation/DesktopSidebar',
  component: DesktopSidebar,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof DesktopSidebar>;

export const Default: Story = {
  args: { items: navItems, activeId: 'inbox' },
};

export const InboxActive: Story = {
  args: { items: navItems, activeId: 'inbox' },
};

export const Collapsed: Story = {
  args: { items: navItems, activeId: 'inbox', collapsed: true },
};
