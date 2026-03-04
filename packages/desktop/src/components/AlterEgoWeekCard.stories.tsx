import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { AlterEgoWeekCard } from './AlterEgoWeekCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof AlterEgoWeekCard> = {
  title: 'Desktop/Autonomy/AlterEgoWeekCard',
  component: AlterEgoWeekCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof AlterEgoWeekCard>;

export const Day1: Story = {
  args: {
    progress: {
      isActive: true,
      currentDay: 1,
      completedDays: [],
      totalDays: 7,
    },
    currentDayConfig: {
      day: 1,
      theme: 'The Introduction',
      domain: 'Email',
      type: 'observation',
      description: 'Semblance observes how you handle email today. No actions taken — just learning your patterns.',
    },
    onComplete: () => {},
    onSkip: () => {},
  },
};

export const Day4MidWeek: Story = {
  args: {
    progress: {
      isActive: true,
      currentDay: 4,
      completedDays: [1, 2, 3],
      totalDays: 7,
    },
    currentDayConfig: {
      day: 4,
      theme: 'The Handoff',
      domain: 'Calendar',
      type: 'assisted',
      description: 'Semblance handles routine scheduling conflicts. You review and approve each resolution.',
    },
    onComplete: () => {},
    onSkip: () => {},
  },
};

export const Day7Final: Story = {
  args: {
    progress: {
      isActive: true,
      currentDay: 7,
      completedDays: [1, 2, 3, 4, 5, 6],
      totalDays: 7,
    },
    currentDayConfig: {
      day: 7,
      theme: 'The Decision',
      domain: 'All',
      type: 'review',
      description: 'Review the full week. Decide which domains to grant Alter Ego access to.',
    },
    onComplete: () => {},
    onSkip: () => {},
  },
};
