import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeGraph } from './KnowledgeGraph';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type { KnowledgeNode, KnowledgeEdge } from './graph-types';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#0B0E11',
    overflow: 'hidden',
  }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof KnowledgeGraph> = {
  title: 'Components/KnowledgeGraph',
  component: KnowledgeGraph,
  parameters: { layout: 'fullscreen' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof KnowledgeGraph>;

// ─── Realistic small graph ───

const smallNodes: KnowledgeNode[] = [
  { id: 'sarah', type: 'person', label: 'Sarah Chen', sublabel: '47 emails', weight: 18 },
  { id: 'marcus', type: 'person', label: 'Marcus Webb', sublabel: '31 emails', weight: 14 },
  { id: 'david', type: 'person', label: 'David Park', sublabel: '23 emails', weight: 11 },
  { id: 'contract', type: 'file', label: 'Portland Contract.pdf', sublabel: 'PDF \u2022 1.2MB', weight: 8 },
  { id: 'q3report', type: 'file', label: 'Q3 Report.xlsx', sublabel: 'Excel \u2022 847KB', weight: 6 },
  { id: 'meeting1', type: 'calendar', label: 'Strategy Review', sublabel: 'Tomorrow 2pm', weight: 7 },
  { id: 'meeting2', type: 'calendar', label: 'Portland Call', sublabel: 'Friday 10am', weight: 5 },
  { id: 'topic-portland', type: 'topic', label: 'Portland Project', weight: 3 },
  { id: 'topic-q3', type: 'topic', label: 'Q3 Planning', weight: 3 },
];

const smallEdges: KnowledgeEdge[] = [
  { source: 'sarah', target: 'contract', weight: 8 },
  { source: 'sarah', target: 'meeting1', weight: 6 },
  { source: 'sarah', target: 'topic-portland', weight: 5 },
  { source: 'marcus', target: 'q3report', weight: 7 },
  { source: 'marcus', target: 'meeting1', weight: 4 },
  { source: 'marcus', target: 'topic-q3', weight: 6 },
  { source: 'david', target: 'contract', weight: 5 },
  { source: 'david', target: 'topic-portland', weight: 4 },
  { source: 'david', target: 'meeting2', weight: 3 },
  { source: 'contract', target: 'topic-portland', weight: 3 },
  { source: 'meeting1', target: 'topic-q3', weight: 2 },
  { source: 'q3report', target: 'topic-q3', weight: 3 },
  { source: 'meeting2', target: 'topic-portland', weight: 2 },
];

export const SmallGraph: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={smallNodes}
      edges={smallEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── Large graph — multiple clusters ───

function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function generateLargeGraph(): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
  const rand = seededRand(42);
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  const people = [
    'Sarah Chen', 'Marcus Webb', 'David Park', 'Lisa Torres', 'James Kim',
    'Nina Patel', 'Alex Rivera', 'Maya Johnson', 'Chris Nakamura', 'Rachel Green',
    'Tom Bradley', 'Emma Wilson', 'Jake Morrison', 'Sophia Lee', 'Ryan Clarke',
  ];

  const files = [
    'Q3 Report.xlsx', 'Portland Contract.pdf', 'Brand Guidelines.fig', 'Budget 2025.csv',
    'API Spec.md', 'Onboarding Deck.pptx', 'Security Audit.pdf', 'Sprint Retro.md',
    'Investor Update.pdf', 'Product Roadmap.md', 'Design System.fig', 'Team Handbook.pdf',
  ];

  const events = [
    'Strategy Review', 'Portland Call', 'Sprint Planning', 'Board Meeting',
    'Design Review', 'Standup', '1:1 with Sarah', 'Team Offsite',
    'Product Demo', 'Quarterly Review',
  ];

  const topics = [
    'Portland Project', 'Q3 Planning', 'Series A', 'Product Launch',
    'Hiring Pipeline', 'Cost Reduction', 'Mobile App', 'Infrastructure',
    'Customer Success', 'Brand Refresh', 'Security Compliance',
  ];

  const emailSubjects = [
    'Re: Portland timeline', 'Fwd: Contract review', 'Weekly digest',
    'Invoice #4521', 'Meeting notes 2/24', 'Standup update',
    'PR Review request', 'Design feedback', 'Budget approval',
    'Launch checklist', 'Re: Hiring update', 'Security report',
    'Re: Mobile mockups', 'Customer feedback', 'Re: Sprint goals',
    'Fwd: Board deck', 'Re: Offsite venue', 'Travel itinerary',
    'Re: API changes', 'Feature request',
  ];

  people.forEach((name, i) => {
    const w = Math.floor(4 + rand() * 16);
    nodes.push({ id: `p${i}`, type: 'person', label: name, sublabel: `${Math.floor(10 + rand() * 60)} emails`, weight: w });
  });

  files.forEach((name, i) => {
    const w = Math.floor(2 + rand() * 8);
    const types = ['PDF', 'Excel', 'Figma', 'Markdown', 'CSV'];
    nodes.push({ id: `f${i}`, type: 'file', label: name, sublabel: `${types[i % 5]} \u2022 ${(rand() * 3).toFixed(1)}MB`, weight: w });
  });

  events.forEach((name, i) => {
    const w = Math.floor(3 + rand() * 7);
    const days = ['Today', 'Tomorrow', 'Wednesday', 'Thursday', 'Friday'];
    nodes.push({ id: `ev${i}`, type: 'calendar', label: name, sublabel: `${days[i % 5]} ${Math.floor(9 + rand() * 8)}am`, weight: w });
  });

  topics.forEach((name, i) => {
    nodes.push({ id: `t${i}`, type: 'topic', label: name, weight: Math.floor(1 + rand() * 4) });
  });

  emailSubjects.forEach((name, i) => {
    const w = Math.floor(1 + rand() * 5);
    nodes.push({ id: `em${i}`, type: 'email', label: name, weight: w });
  });

  const personIds = nodes.filter(n => n.type === 'person').map(n => n.id);
  const nonPersonIds = nodes.filter(n => n.type !== 'person').map(n => n.id);

  personIds.forEach(pid => {
    const connCount = 3 + Math.floor(rand() * 6);
    const targets = new Set<string>();
    for (let c = 0; c < connCount; c++) {
      const tid = nonPersonIds[Math.floor(rand() * nonPersonIds.length)]!;
      if (!targets.has(tid)) {
        targets.add(tid);
        edges.push({ source: pid, target: tid, weight: Math.floor(1 + rand() * 8) });
      }
    }
  });

  for (let i = 0; i < 8; i++) {
    const a = personIds[Math.floor(rand() * personIds.length)]!;
    const b = personIds[Math.floor(rand() * personIds.length)]!;
    if (a !== b) edges.push({ source: a, target: b, weight: Math.floor(2 + rand() * 6) });
  }

  nodes.filter(n => n.type === 'topic').forEach(topic => {
    const connCount = 2 + Math.floor(rand() * 4);
    for (let c = 0; c < connCount; c++) {
      const tid = nonPersonIds[Math.floor(rand() * nonPersonIds.length)]!;
      if (tid !== topic.id) {
        edges.push({ source: topic.id, target: tid, weight: Math.floor(1 + rand() * 4) });
      }
    }
  });

  return { nodes, edges };
}

const large = generateLargeGraph();

export const LargeGraph: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={large.nodes}
      edges={large.edges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── Mobile ───

export const Mobile: Story = {
  args: {
    nodes: smallNodes,
    edges: smallEdges,
    width: 390,
    height: 500,
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

// ─── Focused node ───

export const FocusedNode: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={smallNodes}
      edges={smallEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};
