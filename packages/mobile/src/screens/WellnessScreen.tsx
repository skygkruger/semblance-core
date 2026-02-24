/**
 * Step 22 — Mobile Wellness Screen.
 * Quick entry (mood, energy, water), HealthKit import button (iOS only).
 * Medical disclaimer. Free tier: "Digital Representative" prompt.
 */

import React, { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WellnessScreenProps {
  isPremium: boolean;
  healthKitAvailable: boolean;
  todayEntries?: Array<{ id: string; metricType: string; value: number; label?: string }>;
  onLogMood?: (value: number) => void;
  onLogEnergy?: (value: number) => void;
  onLogWater?: () => void;
  onImportHealthKit?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WellnessScreen({
  isPremium,
  healthKitAvailable,
  todayEntries = [],
  onLogMood,
  onLogEnergy,
  onLogWater,
  onImportHealthKit,
}: WellnessScreenProps) {
  const [mood, setMood] = useState<number>(3);
  const [energy, setEnergy] = useState<number>(3);

  if (!isPremium) {
    return (
      <div className="wellness-gate-mobile">
        <h2>Digital Representative</h2>
        <p>Activate your Digital Representative to track health patterns and get wellness insights.</p>
      </div>
    );
  }

  return (
    <div className="wellness-screen">
      <h1>Wellness</h1>

      {/* Quick Entry Section */}
      <div className="quick-entry-section">
        <h2>How are you feeling?</h2>

        {/* Mood picker */}
        <div className="mood-picker" role="group" aria-label="Mood">
          {[1, 2, 3, 4, 5].map(val => (
            <button
              key={val}
              className={`mood-btn ${mood === val ? 'active' : ''}`}
              onClick={() => { setMood(val); onLogMood?.(val); }}
              aria-label={`Mood ${val}`}
            >
              {val}
            </button>
          ))}
        </div>

        {/* Energy slider */}
        <div className="energy-slider" role="group" aria-label="Energy">
          <label>Energy: {energy}/5</label>
          <input
            type="range"
            min={1}
            max={5}
            value={energy}
            onChange={e => { const v = parseInt(e.target.value, 10); setEnergy(v); onLogEnergy?.(v); }}
          />
        </div>

        {/* Water counter */}
        <div className="water-counter">
          <button className="water-btn" onClick={onLogWater}>
            + Water
          </button>
        </div>
      </div>

      {/* HealthKit import (iOS only) */}
      {healthKitAvailable && (
        <div className="healthkit-section">
          <button className="healthkit-import-btn" onClick={onImportHealthKit}>
            Import from HealthKit
          </button>
        </div>
      )}

      {/* Today's entries */}
      <div className="today-section">
        <h2>Today</h2>
        {todayEntries.length === 0 ? (
          <p>No entries yet. Start logging!</p>
        ) : (
          <ul className="entry-list">
            {todayEntries.map(entry => (
              <li key={entry.id}>
                {entry.metricType}: {entry.value} {entry.label && `(${entry.label})`}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Medical disclaimer */}
      <footer className="medical-disclaimer">
        Semblance observes patterns in your data. This is not medical advice. Consult a healthcare professional for medical concerns.
      </footer>
    </div>
  );
}
