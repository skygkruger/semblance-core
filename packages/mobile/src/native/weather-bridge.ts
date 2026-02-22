// Mobile Weather Bridge — React Native adapter for weather data.
//
// iOS: WeatherKit via native bridge (no network — Apple's local API).
// Android: Returns null for all methods (weather goes through web search).
//
// CRITICAL: No network imports. iOS WeatherKit is a local platform API.

import type {
  WeatherAdapter,
  WeatherForecast,
  WeatherConditions,
  WeatherConditionType,
  HourlyForecast,
} from '@semblance/core/platform/weather-types';
import type { LocationCoordinate } from '@semblance/core/platform/location-types';

/**
 * Shape of the native WeatherKit module on iOS.
 */
interface NativeWeatherKitModule {
  getCurrentWeather(lat: number, lon: number): Promise<{
    temperature: number;
    feelsLike: number;
    humidity: number;
    condition: string;
    conditionDescription: string;
    windSpeedKmh: number;
    precipitationMm: number;
    uvIndex: number;
    timestamp: string;
  } | null>;
  getHourlyForecast(lat: number, lon: number, hours: number): Promise<Array<{
    timestamp: string;
    temperature: number;
    condition: string;
    conditionDescription: string;
    precipitationChance: number;
    precipitationMm: number;
    windSpeedKmh: number;
  }> | null>;
}

function mapCondition(raw: string): WeatherConditionType {
  const lower = raw.toLowerCase();
  if (lower.includes('clear') || lower.includes('sunny')) return 'clear';
  if (lower.includes('partly')) return 'partly_cloudy';
  if (lower.includes('cloud') || lower.includes('overcast')) return 'cloudy';
  if (lower.includes('thunder') || lower.includes('storm')) return 'thunderstorm';
  if (lower.includes('heavy') && lower.includes('rain')) return 'heavy_rain';
  if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('shower')) return 'rain';
  if (lower.includes('snow') || lower.includes('sleet') || lower.includes('ice')) return 'snow';
  if (lower.includes('fog') || lower.includes('mist') || lower.includes('haze')) return 'fog';
  if (lower.includes('wind') || lower.includes('gust')) return 'wind';
  return 'unknown';
}

/**
 * Create the React Native weather adapter.
 * iOS: WeatherKit (local API). Android: returns null.
 */
export function createMobileWeatherAdapter(platform: 'ios' | 'android'): WeatherAdapter {
  let weatherKit: NativeWeatherKitModule | null = null;

  function getWeatherKit(): NativeWeatherKitModule | null {
    if (platform !== 'ios') return null;
    if (!weatherKit) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        weatherKit = require('react-native-weatherkit-bridge').default;
      } catch {
        return null;
      }
    }
    return weatherKit;
  }

  return {
    async getForecast(coordinate: LocationCoordinate, hours: number): Promise<WeatherForecast | null> {
      const wk = getWeatherKit();
      if (!wk) return null;

      try {
        const [current, hourly] = await Promise.all([
          wk.getCurrentWeather(coordinate.latitude, coordinate.longitude),
          wk.getHourlyForecast(coordinate.latitude, coordinate.longitude, hours),
        ]);

        if (!current) return null;

        const hourlyForecasts: HourlyForecast[] = (hourly ?? []).map(h => ({
          timestamp: h.timestamp,
          temperature: h.temperature,
          condition: mapCondition(h.condition),
          conditionDescription: h.conditionDescription,
          precipitationChance: h.precipitationChance,
          precipitationMm: h.precipitationMm,
          windSpeedKmh: h.windSpeedKmh,
        }));

        return {
          coordinate,
          current: {
            temperature: current.temperature,
            feelsLike: current.feelsLike,
            humidity: current.humidity,
            condition: mapCondition(current.condition),
            conditionDescription: current.conditionDescription,
            windSpeedKmh: current.windSpeedKmh,
            precipitationMm: current.precipitationMm,
            uvIndex: current.uvIndex,
            timestamp: current.timestamp,
          },
          hourly: hourlyForecasts,
          retrievedAt: new Date().toISOString(),
        };
      } catch {
        return null;
      }
    },

    async getCurrentConditions(coordinate: LocationCoordinate): Promise<WeatherConditions | null> {
      const wk = getWeatherKit();
      if (!wk) return null;

      try {
        const current = await wk.getCurrentWeather(coordinate.latitude, coordinate.longitude);
        if (!current) return null;

        return {
          temperature: current.temperature,
          feelsLike: current.feelsLike,
          humidity: current.humidity,
          condition: mapCondition(current.condition),
          conditionDescription: current.conditionDescription,
          windSpeedKmh: current.windSpeedKmh,
          precipitationMm: current.precipitationMm,
          uvIndex: current.uvIndex,
          timestamp: current.timestamp,
        };
      } catch {
        return null;
      }
    },
  };
}
