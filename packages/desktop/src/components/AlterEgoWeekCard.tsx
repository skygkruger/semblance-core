// AlterEgoWeekCard — Progress dots, daily card, skip link.

import { useState } from 'react';

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

  if (!progress.isActive || !currentDayConfig) {
    return null;
  }

  return (
    <div className="rounded-none border border-[#6e6a86] bg-[#1a1a2e] p-4 font-mono">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#d4a76a]">
          ALTER EGO WEEK
        </h3>
        <span className="text-xs text-[#6e6a86]">
          Day {progress.currentDay} of {progress.totalDays}
        </span>
      </div>

      {/* Progress dots */}
      <div className="mb-4 flex gap-2">
        {Array.from({ length: progress.totalDays }, (_, i) => {
          const day = i + 1;
          const completed = progress.completedDays.includes(day);
          const current = day === progress.currentDay;

          return (
            <div
              key={day}
              className={`h-2 w-2 rounded-none border ${
                completed
                  ? 'border-[#7ec9a0] bg-[#7ec9a0]'
                  : current
                    ? 'border-[#d4a76a] bg-[#d4a76a]'
                    : 'border-[#6e6a86] bg-transparent'
              }`}
              title={`Day ${day}`}
            />
          );
        })}
      </div>

      {/* Daily card */}
      <div className="mb-3 border border-[#6e6a86] p-3">
        <h4 className="mb-1 text-sm font-bold text-[#e8e3e3]">
          {currentDayConfig.theme}
        </h4>
        <p className="text-xs text-[#6e6a86]">
          [{currentDayConfig.domain}] {currentDayConfig.description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onComplete(progress.currentDay)}
          className="border border-[#7ec9a0] bg-transparent px-3 py-1 text-xs text-[#7ec9a0] hover:bg-[#7ec9a0] hover:text-[#1a1a2e]"
        >
          [&gt;] Complete Day {progress.currentDay}
        </button>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-[#6e6a86] underline hover:text-[#e8e3e3]"
          >
            Skip Week
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="text-xs text-[#f27a93] underline"
            >
              Confirm Skip
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs text-[#6e6a86] underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
