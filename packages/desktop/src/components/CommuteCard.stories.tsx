import type { Meta, StoryObj } from '@storybook/react';
import { CommuteCard } from './CommuteCard';

const meta: Meta<typeof CommuteCard> = {
  title: 'Desktop/Weather/CommuteCard',
  component: CommuteCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof CommuteCard>;

export const SingleCommute: Story = {
  args: {
    commutes: [
      {
        eventTitle: 'Product Review',
        destination: '1455 Market St, San Francisco',
        departureTime: '2026-03-03T09:15:00',
        travelMinutes: 28,
        weather: { temperature: 16, conditionDescription: 'Overcast' },
      },
    ],
  },
};

export const MultipleCommutes: Story = {
  args: {
    commutes: [
      {
        eventTitle: 'Morning standup',
        destination: 'Office — 3rd Floor',
        departureTime: '2026-03-03T08:30:00',
        travelMinutes: 12,
        weather: { temperature: 14, conditionDescription: 'Light rain' },
      },
      {
        eventTitle: 'Client lunch',
        destination: 'Zuni Cafe, 1658 Market St',
        departureTime: '2026-03-03T11:45:00',
        travelMinutes: 18,
        weather: { temperature: 19, conditionDescription: 'Partly cloudy' },
      },
      {
        eventTitle: 'Dentist appointment',
        destination: '450 Sutter St, Suite 340',
        departureTime: '2026-03-03T15:30:00',
        travelMinutes: 22,
        weather: null,
      },
    ],
  },
};
