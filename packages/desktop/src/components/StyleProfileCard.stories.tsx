import type { Meta, StoryObj } from '@storybook/react';
import { StyleProfileCard } from './StyleProfileCard';

const meta: Meta<typeof StyleProfileCard> = {
  title: 'Desktop/Style/StyleProfileCard',
  component: StyleProfileCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof StyleProfileCard>;

export const ActiveProfile: Story = {
  args: {
    profile: {
      id: 'sp-1',
      isActive: true,
      emailsAnalyzed: 142,
      greetingPatterns: [
        { text: 'Hi', frequency: 0.45 },
        { text: 'Hey', frequency: 0.32 },
        { text: 'Good morning', frequency: 0.18 },
      ],
      signoffPatterns: [
        { text: 'Best,', frequency: 0.52 },
        { text: 'Thanks,', frequency: 0.30 },
        { text: 'Cheers,', frequency: 0.12 },
      ],
      formalityScore: 55,
      directnessScore: 72,
      warmthScore: 68,
      usesContractions: true,
      contractionRate: 0.58,
      usesEmoji: false,
      emojiFrequency: 0.1,
      usesExclamation: true,
      exclamationRate: 0.15,
    },
    onReanalyze: () => {},
    onReset: () => {},
  },
};

export const LearningProfile: Story = {
  args: {
    profile: {
      id: 'sp-2',
      isActive: false,
      emailsAnalyzed: 11,
      greetingPatterns: [{ text: 'Hi', frequency: 0.7 }],
      signoffPatterns: [{ text: 'Best,', frequency: 0.6 }],
      formalityScore: 50,
      directnessScore: 50,
      warmthScore: 50,
      usesContractions: true,
      contractionRate: 0.4,
      usesEmoji: false,
      emojiFrequency: 0,
      usesExclamation: false,
      exclamationRate: 0,
    },
    onReanalyze: () => {},
  },
};

export const NoProfile: Story = {
  args: {
    profile: null,
  },
};
