// Weather Insight Tracker — Generates proactive weather insights.
//
// Checks for precipitation during upcoming events → 'weather-alert'.
// Generates daily 'weather-summary' insight.
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { WeatherService } from './weather-service.js';
import type { CalendarIndexer, IndexedCalendarEvent } from '../knowledge/calendar-indexer.js';
import { nanoid } from 'nanoid';

export class WeatherInsightTracker {
  private weatherService: WeatherService;
  private calendarIndexer: CalendarIndexer;
  private lastSummaryDate: string | null = null;

  constructor(weatherService: WeatherService, calendarIndexer: CalendarIndexer) {
    this.weatherService = weatherService;
    this.calendarIndexer = calendarIndexer;
  }

  /**
   * Generate weather-related insights.
   */
  async generateInsights(): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    // Check for rain during upcoming events
    const alerts = await this.checkPrecipitationDuringEvents();
    insights.push(...alerts);

    // Daily weather summary
    const summary = await this.generateDailySummary();
    if (summary) {
      insights.push(summary);
    }

    return insights;
  }

  private async checkPrecipitationDuringEvents(): Promise<ProactiveInsight[]> {
    const events = this.calendarIndexer.getUpcomingEvents({ daysAhead: 1, limit: 10 });
    const insights: ProactiveInsight[] = [];

    for (const event of events) {
      if (event.isAllDay) continue;

      try {
        const weather = await this.weatherService.getWeatherAt(event.startTime);
        if (!weather) continue;

        if (weather.precipitationChance > 50 || weather.precipitationMm > 0) {
          insights.push({
            id: nanoid(),
            type: 'weather-alert',
            priority: 'normal',
            title: `Rain expected during "${event.title}"`,
            summary: `${weather.precipitationChance}% chance of ${weather.conditionDescription.toLowerCase()} at ${new Date(event.startTime).toLocaleTimeString()}`,
            sourceIds: [event.uid],
            suggestedAction: null,
            createdAt: new Date().toISOString(),
            expiresAt: event.endTime,
            estimatedTimeSavedSeconds: 30,
          });
        }
      } catch {
        // Skip if weather data unavailable for this event
      }
    }

    return insights;
  }

  private async generateDailySummary(): Promise<ProactiveInsight | null> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastSummaryDate === today) return null;

    try {
      const conditions = await this.weatherService.getCurrentWeather();
      if (!conditions) return null;

      this.lastSummaryDate = today;

      return {
        id: nanoid(),
        type: 'weather-summary',
        priority: 'low',
        title: `Today: ${conditions.conditionDescription}, ${conditions.temperature}°C`,
        summary: `Feels like ${conditions.feelsLike}°C, humidity ${conditions.humidity}%, wind ${conditions.windSpeedKmh} km/h`,
        sourceIds: [],
        suggestedAction: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
        estimatedTimeSavedSeconds: 30,
      };
    } catch {
      return null;
    }
  }
}
