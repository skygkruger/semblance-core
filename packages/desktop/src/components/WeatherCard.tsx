// WeatherCard — Displays current weather conditions and forecast for upcoming events.
// Uses the Trellis design system for visual consistency.

import { Card } from '@semblance/ui';

export interface WeatherCardProps {
  currentConditions: {
    temperature: number;
    feelsLike: number;
    conditionDescription: string;
    humidity: number;
    windSpeedKmh: number;
    precipitationChance: number;
  } | null;
  eventForecasts: Array<{
    eventTitle: string;
    eventTime: string;
    temperature: number;
    conditionDescription: string;
    precipitationChance: number;
  }>;
}

export function WeatherCard({ currentConditions, eventForecasts }: WeatherCardProps) {
  if (!currentConditions && eventForecasts.length === 0) {
    return null;
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
        Weather
      </h3>

      {/* Current conditions */}
      {currentConditions && (
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
              {currentConditions.temperature}&deg;C
            </span>
            <span className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {currentConditions.conditionDescription}
            </span>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-semblance-text-tertiary">
            <span>Feels like {currentConditions.feelsLike}&deg;C</span>
            <span>Humidity {currentConditions.humidity}%</span>
            <span>Wind {currentConditions.windSpeedKmh} km/h</span>
          </div>
        </div>
      )}

      {/* Event forecasts */}
      {eventForecasts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2">
            Upcoming events
          </p>
          <div className="space-y-2">
            {eventForecasts.map((forecast, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex-1 min-w-0">
                  <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark truncate block">
                    {forecast.eventTitle}
                  </span>
                  <span className="text-semblance-text-tertiary">
                    {new Date(forecast.eventTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-semblance-text-primary dark:text-semblance-text-primary-dark">
                    {forecast.temperature}&deg;C {forecast.conditionDescription}
                  </span>
                  {forecast.precipitationChance > 30 && (
                    <span className="text-semblance-warning ml-2">
                      {forecast.precipitationChance}% rain
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
