// CommuteCard — Displays commute departure times with travel info and weather at destination.

import { Card } from '@semblance/ui';
import './CommuteCard.css';

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
      <h3 className="commute-card__title">Commute</h3>

      <div className="commute-card__list">
        {commutes.map((commute, i) => (
          <div key={i} className="commute-card__item">
            <div className="commute-card__item-header">
              <span className="commute-card__event-name">{commute.eventTitle}</span>
              <span className="commute-card__duration">~{commute.travelMinutes} min</span>
            </div>
            <p className="commute-card__destination">{commute.destination}</p>
            <div className="commute-card__footer">
              <span className="commute-card__departure">
                Leave by {new Date(commute.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {commute.weather && (
                <span className="commute-card__weather">
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
