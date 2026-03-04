// AlterEgoWeekCard — Progress dots, daily card, skip link.

import { useState } from 'react';
import { Card, Button } from '@semblance/ui';
import './AlterEgoWeekCard.css';

export interface AlterEgoWeekDay {
  day: number;
  theme: string;
  domain: string;
  type: string;
  description: string;
}

export interface AlterEgoWeekProgress {
  isActive: boolean;
  currentDay: number;
  completedDays: number[];
  totalDays: number;
}

interface AlterEgoWeekCardProps {
  progress: AlterEgoWeekProgress;
  currentDayConfig: AlterEgoWeekDay | null;
  onComplete: (day: number) => void;
  onSkip: () => void;
}

export function AlterEgoWeekCard({
  progress,
  currentDayConfig,
  onComplete,
  onSkip,
}: AlterEgoWeekCardProps) {
  const [confirming, setConfirming] = useState(false);

  if (!progress.isActive || !currentDayConfig) return null;

  return (
    <Card className="alter-ego-week">
      <div className="alter-ego-week__header">
        <h3 className="alter-ego-week__title">ALTER EGO WEEK</h3>
        <span className="alter-ego-week__day-count">
          Day {progress.currentDay} of {progress.totalDays}
        </span>
      </div>

      <div className="alter-ego-week__dots">
        {Array.from({ length: progress.totalDays }, (_, i) => {
          const day = i + 1;
          const completed = progress.completedDays.includes(day);
          const current = day === progress.currentDay;

          return (
            <div
              key={day}
              className={`alter-ego-week__dot${
                completed ? ' alter-ego-week__dot--completed' : current ? ' alter-ego-week__dot--current' : ''
              }`}
              title={`Day ${day}`}
            />
          );
        })}
      </div>

      <div className="alter-ego-week__daily-card">
        <h4 className="alter-ego-week__theme">{currentDayConfig.theme}</h4>
        <p className="alter-ego-week__desc">
          [{currentDayConfig.domain}] {currentDayConfig.description}
        </p>
      </div>

      <div className="alter-ego-week__actions">
        <Button
          variant="approve"
          size="sm"
          onClick={() => onComplete(progress.currentDay)}
        >
          Complete Day {progress.currentDay}
        </Button>

        {!confirming ? (
          <Button variant="dismiss" size="sm" onClick={() => setConfirming(true)}>
            Skip Week
          </Button>
        ) : (
          <div className="alter-ego-week__skip-confirm">
            <Button variant="destructive" size="sm" onClick={onSkip}>
              Confirm Skip
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
