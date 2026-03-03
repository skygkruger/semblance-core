import type { Meta, StoryObj } from '@storybook/react';
import { WeatherCard } from './WeatherCard';

const meta: Meta<typeof WeatherCard> = {
  title: 'Desktop/Weather/WeatherCard',
  component: WeatherCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof WeatherCard>;

export const WithCurrentAndForecasts: Story = {
  args: {
    currentConditions: {
      temperature: 18,
      feelsLike: 16,
      conditionDescription: 'Partly cloudy',
      humidity: 62,
      windSpeedKmh: 14,
      precipitationChance: 20,
    },
    eventForecasts: [
      { eventTitle: 'Morning standup', eventTime: '2026-03-03T09:00:00', temperature: 15, conditionDescription: 'Overcast', precipitationChance: 10 },
      { eventTitle: 'Lunch with Dana', eventTime: '2026-03-03T12:30:00', temperature: 19, conditionDescription: 'Sunny', precipitationChance: 5 },
      { eventTitle: 'Outdoor team event', eventTime: '2026-03-03T16:00:00', temperature: 17, conditionDescription: 'Light rain', precipitationChance: 65 },
    ],
  },
};

export const CurrentOnly: Story = {
  args: {
    currentConditions: {
      temperature: 24,
      feelsLike: 26,
      conditionDescription: 'Clear skies',
      humidity: 45,
      windSpeedKmh: 8,
      precipitationChance: 0,
    },
    eventForecasts: [],
  },
};

export const ForecastsOnly: Story = {
  args: {
    currentConditions: null,
    eventForecasts: [
      { eventTitle: 'Client presentation', eventTime: '2026-03-03T14:00:00', temperature: 22, conditionDescription: 'Sunny', precipitationChance: 0 },
    ],
  },
};
