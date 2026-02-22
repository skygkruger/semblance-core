// CommuteCard — Displays commute departure times with travel info and weather at destination.

import { Card } from '@semblance/ui';

export interface CommuteCardProps {
  commutes: Array<{
    eventTitle: string;
    destination: string;
    departureTime: string;
    travelMinutes: number;
    weather: {
      temperature: number;
      conditionDescription: string;
    } | null;
  }>;
}

export function CommuteCard({ commutes }: CommuteCardProps) {
  if (commutes.length === 0) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
        Commute
      </h3>

      <div className="space-y-3">
        {commutes.map((commute, i) => (
          <div key={i} className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
                {commute.eventTitle}
              </span>
              <span className="text-xs text-semblance-text-tertiary">
                ~{commute.travelMinutes} min
              </span>
            </div>
            <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {commute.destination}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs font-medium text-semblance-accent">
                Leave by {new Date(commute.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {commute.weather && (
                <span className="text-xs text-semblance-text-tertiary">
                  {commute.weather.temperature}&deg;C {commute.weather.conditionDescription}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
