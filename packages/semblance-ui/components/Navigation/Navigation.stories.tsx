import type { Meta, StoryObj } from '@storybook/react';
import { Navigation } from './Navigation';

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BriefIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M9.5 10.5 6.5 7.5M14.5 10.5l3-3M9.5 13.5 6.5 16.5M14.5 13.5l3 3" />
    </svg>
  );
}

function ConnectionsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const navItems = [
  { id: 'chat', icon: <ChatIcon />, label: 'Chat' },
  { id: 'brief', icon: <BriefIcon />, label: 'Morning Brief' },
  { id: 'knowledge', icon: <GraphIcon />, label: 'Knowledge Graph' },
  { id: 'connections', icon: <ConnectionsIcon />, label: 'Connections' },
  { id: 'settings', icon: <SettingsIcon />, label: 'Settings' },
];

const meta: Meta<typeof Navigation> = {
  title: 'Components/Navigation',
  component: Navigation,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', height: '100vh', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Navigation>;

export const Expanded: Story = {
  args: {
    items: navItems,
    activeId: 'chat',
    onNavigate: () => {},
    collapsed: false,
  },
};

export const Collapsed: Story = {
  args: {
    items: navItems,
    activeId: 'chat',
    onNavigate: () => {},
    collapsed: true,
  },
};

export const KnowledgeActive: Story = {
  args: {
    items: navItems,
    activeId: 'knowledge',
    onNavigate: () => {},
    collapsed: false,
  },
};

export const SettingsActive: Story = {
  args: {
    items: navItems,
    activeId: 'settings',
    onNavigate: () => {},
    collapsed: false,
  },
};

export const WithFooter: Story = {
  args: {
    items: navItems,
    activeId: 'chat',
    onNavigate: () => {},
    collapsed: false,
    footer: (
      <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#525A64', fontFamily: "'DM Mono', monospace" }}>
        v1.0.0
      </div>
    ),
  },
};
