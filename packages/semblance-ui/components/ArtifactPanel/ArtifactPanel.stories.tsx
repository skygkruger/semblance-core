import type { Meta, StoryObj } from '@storybook/react';
import { ArtifactPanel } from './ArtifactPanel';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof ArtifactPanel> = {
  title: 'Chat/ArtifactPanel',
  component: ArtifactPanel,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ArtifactPanel>;

export const CodeArtifact: Story = {
  args: {
    open: true,
    artifact: {
      id: 'a1',
      type: 'code',
      title: 'Email cancellation template',
      content: `async function cancelSubscription(serviceId: string) {\n  const service = await getService(serviceId);\n  const template = generateCancellationEmail({\n    provider: service.name,\n    accountEmail: service.email,\n    reason: 'unused',\n    lastUsed: service.lastAccessDate,\n  });\n  return template;\n}`,
      language: 'typescript',
    },
    onClose: () => {},
    onDownload: () => {},
  },
};

export const MarkdownArtifact: Story = {
  args: {
    open: true,
    artifact: {
      id: 'a2',
      type: 'markdown',
      title: 'Weekly digest — March 3, 2026',
      content: '# Weekly Digest\n\n## Actions Taken\n- Rescheduled dentist to Thursday 2pm\n- Cancelled Figma subscription ($15/mo saved)\n- Archived 47 promotional emails\n\n## Time Saved\nEstimated 2h 14m this week\n\n## Upcoming\n- Tax filing deadline in 12 days\n- Car insurance renewal next Tuesday',
    },
    onClose: () => {},
    onDownload: () => {},
  },
};

export const CSVArtifact: Story = {
  args: {
    open: true,
    artifact: {
      id: 'a3',
      type: 'csv',
      title: 'Subscription audit',
      content: 'Service,Monthly Cost,Last Used,Status\nFigma,$15,47 days ago,Unused\nNotion,$10,52 days ago,Unused\nHeadspace,$13,61 days ago,Unused\nSpotify,$11,Today,Active\nGitHub Pro,$4,Yesterday,Active',
    },
    onClose: () => {},
    onDownload: () => {},
  },
};

export const JSONArtifact: Story = {
  args: {
    open: true,
    artifact: {
      id: 'a4',
      type: 'json',
      title: 'Calendar export',
      content: JSON.stringify({
        events: [
          { title: 'Standup', time: '10:00', duration: 30 },
          { title: 'Design Review', time: '13:00', duration: 60 },
          { title: '1:1 with Jordan', time: '15:00', duration: 45 },
        ],
      }, null, 2),
    },
    onClose: () => {},
  },
};

export const Generating: Story = {
  args: {
    open: true,
    generating: true,
    artifact: null,
    onClose: () => {},
  },
};
