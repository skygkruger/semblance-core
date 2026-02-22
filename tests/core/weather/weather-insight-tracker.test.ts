// Weather Insight Tracker Tests — Proactive weather insights.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, vi } from 'vitest';
import { WeatherInsightTracker } from '../../../packages/core/weather/weather-insight-tracker';
import type { WeatherService } from '../../../packages/core/weather/weather-service';
import type { CalendarIndexer, IndexedCalendarEvent } from '../../../packages/core/knowledge/calendar-indexer';

function createMockWeatherService(overrides: Partial<WeatherService> = {}): WeatherService {
  return {
    getCurrentWeather: vi.fn().mockResolvedValue({
      temperature: 18,
      feelsLike: 16,
      humidity: 65,
      windSpeedKmh: 12,
      conditionDescription: 'Partly Cloudy',
      conditionType: 'cloudy' as const,
      precipitationChance: 10,
      precipitationMm: 0,
    }),
    getForecastData: vi.fn().mockResolvedValue([]),
    getWeatherAt: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as WeatherService;
}

function createMockCalendarIndexer(events: Partial<IndexedCalendarEvent>[] = []): CalendarIndexer {
  return {
    getUpcomingEvents: vi.fn().mockReturnValue(
      events.map((e, i) => ({
        id: `event-${i}`,
        uid: `uid-${i}`,
        calendarId: 'cal-1',
        title: e.title ?? `Event ${i}`,
        description: '',
        startTime: e.startTime ?? new Date(Date.now() + 3600000).toISOString(),
        endTime: e.endTime ?? new Date(Date.now() + 7200000).toISOString(),
        isAllDay: e.isAllDay ?? false,
        location: e.location ?? '',
        attendees: '[]',
        organizer: 'test@test.com',
        status: 'confirmed',
        recurrenceRule: null,
        accountId: 'acc-1',
        indexedAt: new Date().toISOString(),
        ...e,
      })),
    ),
  } as unknown as CalendarIndexer;
}

describe('WeatherInsightTracker', () => {
  it('rain during event generates weather-alert insight', async () => {
    const eventTime = new Date(Date.now() + 3600000).toISOString();
    const weatherService = createMockWeatherService({
      getWeatherAt: vi.fn().mockResolvedValue({
        timestamp: eventTime,
        temperature: 14,
        conditionDescription: 'Light Rain',
        conditionType: 'rain' as const,
        precipitationChance: 80,
        precipitationMm: 2.5,
      }),
    });

    const calendarIndexer = createMockCalendarIndexer([
      { title: 'Team Lunch', startTime: eventTime, isAllDay: false },
    ]);

    const tracker = new WeatherInsightTracker(weatherService, calendarIndexer);
    const insights = await tracker.generateInsights();

    const alerts = insights.filter(i => i.type === 'weather-alert');
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.title).toContain('Team Lunch');
    expect(alerts[0]!.priority).toBe('normal');
    expect(alerts[0]!.summary).toContain('80%');
  });

  it('generates daily weather-summary insight', async () => {
    const weatherService = createMockWeatherService();
    const calendarIndexer = createMockCalendarIndexer();

    const tracker = new WeatherInsightTracker(weatherService, calendarIndexer);
    const insights = await tracker.generateInsights();

    const summaries = insights.filter(i => i.type === 'weather-summary');
    expect(summaries.length).toBe(1);
    expect(summaries[0]!.priority).toBe('low');
    expect(summaries[0]!.title).toContain('Partly Cloudy');
    expect(summaries[0]!.title).toContain('18');
    expect(summaries[0]!.summary).toContain('Feels like');
  });

  it('no coordinates appear in any insight entries', async () => {
    const eventTime = new Date(Date.now() + 3600000).toISOString();
    const weatherService = createMockWeatherService({
      getWeatherAt: vi.fn().mockResolvedValue({
        timestamp: eventTime,
        temperature: 14,
        conditionDescription: 'Rain',
        conditionType: 'rain' as const,
        precipitationChance: 90,
        precipitationMm: 5,
      }),
    });

    const calendarIndexer = createMockCalendarIndexer([
      { title: 'Outdoor Meeting', startTime: eventTime, isAllDay: false },
    ]);

    const tracker = new WeatherInsightTracker(weatherService, calendarIndexer);
    const insights = await tracker.generateInsights();

    // No insight should contain raw coordinate patterns
    for (const insight of insights) {
      const allText = `${insight.title} ${insight.summary}`;
      expect(allText).not.toMatch(/\d+\.\d{3,}\s*,\s*-?\d+\.\d{3,}/);
    }
  });
});
