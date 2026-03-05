import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import {
  EnvelopeIcon,
  CalendarIcon,
  PersonIcon,
  HeartIcon,
  ChatIcon,
  MusicIcon,
  CodeIcon,
  FolderIcon,
  DollarIcon,
  GlobeIcon,
  FileUpIcon,
  LinkIcon,
  PhotoIcon,
  MapPinIcon,
} from './ConnectorIcons';

const AllIcons = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 24 }}>
    {[
      { Icon: EnvelopeIcon, label: 'Envelope' },
      { Icon: CalendarIcon, label: 'Calendar' },
      { Icon: PersonIcon, label: 'Person' },
      { Icon: HeartIcon, label: 'Heart' },
      { Icon: ChatIcon, label: 'Chat' },
      { Icon: MusicIcon, label: 'Music' },
      { Icon: CodeIcon, label: 'Code' },
      { Icon: FolderIcon, label: 'Folder' },
      { Icon: DollarIcon, label: 'Dollar' },
      { Icon: GlobeIcon, label: 'Globe' },
      { Icon: FileUpIcon, label: 'FileUp' },
      { Icon: LinkIcon, label: 'Link' },
      { Icon: PhotoIcon, label: 'Photo' },
      { Icon: MapPinIcon, label: 'MapPin' },
    ].map(({ Icon, label }) => (
      <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#8593A4' }}>
          <Icon size={24} />
        </div>
        <span style={{ fontSize: 10, color: '#525A64', fontFamily: 'var(--fm)' }}>{label}</span>
      </div>
    ))}
  </div>
);

const meta: Meta = {
  title: 'Components/ConnectorIcons',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const AllIconsGrid: Story = {
  render: () => <AllIcons />,
};

export const LargeSize: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, color: '#6ECFA3' }}>
      <EnvelopeIcon size={32} />
      <CalendarIcon size={32} />
      <PersonIcon size={32} />
      <HeartIcon size={32} />
      <DollarIcon size={32} />
    </div>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, color: '#B09A8A' }}>
      <EnvelopeIcon size={12} />
      <CalendarIcon size={12} />
      <PersonIcon size={12} />
      <HeartIcon size={12} />
      <DollarIcon size={12} />
    </div>
  ),
};
