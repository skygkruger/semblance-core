// WeatherCard — Displays current weather conditions and forecast for upcoming events.

import { Card } from '@semblance/ui';
import './WeatherCard.css';

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
      <h3 className="weather-card__title">Weather</h3>

      {currentConditions && (
        <div className="weather-card__current">
          <div className="weather-card__temp-row">
            <span className="weather-card__temp">
              {currentConditions.temperature}&deg;C
            </span>
            <span className="weather-card__condition">
              {currentConditions.conditionDescription}
            </span>
          </div>
          <div className="weather-card__details">
            <span className="weather-card__detail">Feels like {currentConditions.feelsLike}&deg;C</span>
            <span className="weather-card__detail">Humidity {currentConditions.humidity}%</span>
            <span className="weather-card__detail">Wind {currentConditions.windSpeedKmh} km/h</span>
          </div>
        </div>
      )}

      {eventForecasts.length > 0 && (
        <div>
          <p className="weather-card__section-label">Upcoming events</p>
          <div className="weather-card__forecasts">
            {eventForecasts.map((forecast, i) => (
              <div key={i} className="weather-card__forecast-row">
                <span className="weather-card__event-name">{forecast.eventTitle}</span>
                <span className="weather-card__event-time">
                  {new Date(forecast.eventTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="weather-card__forecast-temp">
                  {forecast.temperature}&deg;C {forecast.conditionDescription}
                </span>
                <span className="weather-card__rain">
                  {forecast.precipitationChance > 30 ? `${forecast.precipitationChance}% rain` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
