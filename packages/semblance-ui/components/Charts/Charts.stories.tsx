import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { HorizontalBarChart } from './HorizontalBarChart';
import { TrendLineChart } from './TrendLineChart';
import { BarChart } from './BarChart';
import { PeriodSelector } from './PeriodSelector';
import type { PeriodOption } from './Charts.types';

// ─── HorizontalBarChart ──────────────────────────────────────────────────────

const hBarMeta: Meta<typeof HorizontalBarChart> = {
  title: 'Charts/HorizontalBarChart',
  component: HorizontalBarChart,
  decorators: [(Story) => <div style={{ maxWidth: 400, padding: 24, background: '#0B0E11' }}><Story /></div>],
};

export default hBarMeta;

export const Default: StoryObj<typeof HorizontalBarChart> = {
  args: {
    data: [
      { label: 'Food & Dining', value: 842.50, percentage: 35, color: '#6ECFA3' },
      { label: 'Shopping', value: 623.00, percentage: 26, color: '#B09A8A' },
      { label: 'Transportation', value: 412.30, percentage: 17, color: '#B07A8A' },
      { label: 'Entertainment', value: 289.99, percentage: 12, color: '#8593A4' },
      { label: 'Subscriptions', value: 145.00, percentage: 6, color: '#A8B4C0' },
      { label: 'Other', value: 96.10, percentage: 4, color: '#5E6B7C' },
    ],
  },
};

export const SingleItem: StoryObj<typeof HorizontalBarChart> = {
  args: {
    data: [{ label: 'Groceries', value: 200, percentage: 100, color: '#6ECFA3' }],
  },
};

export const Empty: StoryObj<typeof HorizontalBarChart> = {
  args: { data: [] },
};

// ─── TrendLineChart ──────────────────────────────────────────────────────────

const trendMeta: Meta<typeof TrendLineChart> = {
  title: 'Charts/TrendLineChart',
  component: TrendLineChart,
};

export const TrendDefault: StoryObj<typeof TrendLineChart> = {
  name: 'Default Trend',
  decorators: [(Story) => <div style={{ maxWidth: 500, padding: 24, background: '#0B0E11' }}><Story /></div>],
  args: {
    data: Array.from({ length: 14 }, (_, i) => ({
      date: `2026-02-${String(i + 1).padStart(2, '0')}`,
      value: 3 + Math.sin(i * 0.5) * 1.5 + Math.random() * 0.5,
    })),
    showArea: true,
  },
};

export const MoodTrend: StoryObj<typeof TrendLineChart> = {
  name: 'Mood (1-5)',
  decorators: [(Story) => <div style={{ maxWidth: 500, padding: 24, background: '#0B0E11' }}><Story /></div>],
  args: {
    data: [
      { date: '2026-02-01', value: 3 },
      { date: '2026-02-02', value: 4 },
      { date: '2026-02-03', value: 4 },
      { date: '2026-02-04', value: 2 },
      { date: '2026-02-05', value: 3 },
      { date: '2026-02-06', value: 5 },
      { date: '2026-02-07', value: 4 },
    ],
    yDomain: [1, 5],
    color: '#B09A8A',
  },
};

export const SparseTrend: StoryObj<typeof TrendLineChart> = {
  name: 'With Nulls',
  decorators: [(Story) => <div style={{ maxWidth: 500, padding: 24, background: '#0B0E11' }}><Story /></div>],
  args: {
    data: [
      { date: '2026-02-01', value: 3 },
      { date: '2026-02-02', value: null },
      { date: '2026-02-03', value: 4 },
      { date: '2026-02-04', value: null },
      { date: '2026-02-05', value: 2 },
    ],
  },
};

// ─── BarChart ─────────────────────────────────────────────────────────────────

const barMeta: Meta<typeof BarChart> = {
  title: 'Charts/BarChart',
  component: BarChart,
};

export const BarDefault: StoryObj<typeof BarChart> = {
  name: 'Steps',
  decorators: [(Story) => <div style={{ maxWidth: 400, padding: 24, background: '#0B0E11' }}><Story /></div>],
  args: {
    data: [
      { label: 'Mon', value: 8432 },
      { label: 'Tue', value: 12001 },
      { label: 'Wed', value: 6543 },
      { label: 'Thu', value: 9876 },
      { label: 'Fri', value: 11234 },
      { label: 'Sat', value: 15678 },
      { label: 'Sun', value: 7890 },
    ],
  },
};

export const BarSleep: StoryObj<typeof BarChart> = {
  name: 'Sleep Hours',
  decorators: [(Story) => <div style={{ maxWidth: 400, padding: 24, background: '#0B0E11' }}><Story /></div>],
  args: {
    data: [
      { label: 'Mon', value: 7.2 },
      { label: 'Tue', value: 6.5 },
      { label: 'Wed', value: 8.0 },
      { label: 'Thu', value: null },
      { label: 'Fri', value: 7.8 },
      { label: 'Sat', value: 9.1 },
      { label: 'Sun', value: 8.3 },
    ],
    color: '#B09A8A',
  },
};

// ─── PeriodSelector ──────────────────────────────────────────────────────────

const periodMeta: Meta<typeof PeriodSelector> = {
  title: 'Charts/PeriodSelector',
  component: PeriodSelector,
};

export const PeriodDefault: StoryObj<typeof PeriodSelector> = {
  name: 'Period Selector',
  decorators: [(Story) => <div style={{ padding: 24, background: '#0B0E11' }}><Story /></div>],
  render: function PeriodStory() {
    const [selected, setSelected] = useState<PeriodOption>('30d');
    return <PeriodSelector selected={selected} onSelect={setSelected} />;
  },
};
