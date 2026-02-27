import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeGraph } from './KnowledgeGraph';

// Deterministic pseudo-random for story data
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateGraph(nodeCount: number, w: number, h: number) {
  const rand = seededRandom(42);
  const types = ['people', 'topics', 'documents', 'events'] as const;
  const names = ['Sky', 'Sarah', 'Alex', 'React', 'TypeScript', 'Privacy', 'Health', 'Finance', 'Taxes', 'Calendar', 'Email', 'Meeting', 'Report', 'Design', 'AI', 'LLM', 'Running', 'Sleep', 'Budget', 'Travel'];

  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: names[i % names.length] ?? `Node ${i}`,
    type: types[i % types.length]!,
    x: 40 + rand() * (w - 80),
    y: 40 + rand() * (h - 80),
  }));

  const edges = Array.from({ length: Math.floor(nodeCount * 1.3) }, () => ({
    source: `n${Math.floor(rand() * nodeCount)}`,
    target: `n${Math.floor(rand() * nodeCount)}`,
  })).filter(e => e.source !== e.target);

  return { nodes, edges };
}

const small = generateGraph(20, 600, 400);
const large = generateGraph(200, 900, 600);

const meta: Meta<typeof KnowledgeGraph> = {
  title: 'Components/KnowledgeGraph',
  component: KnowledgeGraph,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof KnowledgeGraph>;

export const SmallGraph: Story = {
  args: { nodes: small.nodes, edges: small.edges, width: 600, height: 400 },
};

export const LargeGraph: Story = {
  args: { nodes: large.nodes, edges: large.edges, width: 900, height: 600 },
};

export const Mobile: Story = {
  args: { nodes: small.nodes, edges: small.edges, width: 390, height: 500 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
