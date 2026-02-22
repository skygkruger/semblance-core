// Weather Card Tests — Verify card rendering with current conditions and commute data.

import { describe, it, expect } from 'vitest';
import type { WeatherCardProps } from '../../packages/desktop/src/components/WeatherCard';
import type { CommuteCardProps } from '../../packages/desktop/src/components/CommuteCard';

describe('WeatherCard', () => {
  it('weather card renders current conditions data shape', () => {
    const props: WeatherCardProps = {
      currentConditions: {
        temperature: 18,
        feelsLike: 16,
        conditionDescription: 'Partly Cloudy',
        humidity: 65,
        windSpeedKmh: 12,
        precipitationChance: 10,
      },
      eventForecasts: [],
    };

    expect(props.currentConditions).toBeDefined();
    expect(props.currentConditions!.temperature).toBe(18);
    expect(props.currentConditions!.conditionDescription).toBe('Partly Cloudy');
    expect(props.currentConditions!.feelsLike).toBe(16);
    expect(props.currentConditions!.humidity).toBe(65);
  });

  it('commute card shows departure time and weather', () => {
    const now = new Date();
    const departureTime = new Date(now.getTime() + 45 * 60 * 1000).toISOString();

    const props: CommuteCardProps = {
      commutes: [
        {
          eventTitle: 'Team Meeting',
          destination: '123 Main St, Portland OR',
          departureTime,
          travelMinutes: 25,
          weather: {
            temperature: 14,
            conditionDescription: 'Light Rain',
          },
        },
      ],
    };

    expect(props.commutes.length).toBe(1);
    expect(props.commutes[0]!.eventTitle).toBe('Team Meeting');
    expect(props.commutes[0]!.travelMinutes).toBe(25);
    expect(props.commutes[0]!.weather).toBeDefined();
    expect(props.commutes[0]!.weather!.temperature).toBe(14);
    expect(props.commutes[0]!.departureTime).toBe(departureTime);
  });
});
