/**
 * Step 22 — Wellness Dashboard.
 * Three tabs: Trends, Correlations, Today.
 * Medical disclaimer footer.
 * Free tier: "Activate your Digital Representative" prompt.
 */

import React, { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrendPoint {
  date: string;
  value: number;
}

interface CorrelationCard {
  metricA: string;
  metricB: string;
  correlation: number;
  significance: 'strong' | 'moderate' | 'weak';
  description: string;
}

interface TodayEntry {
  id: string;
  metricType: string;
  value: number;
  label?: string;
  recordedAt: string;
}

interface WellnessDashboardProps {
  isPremium: boolean;
  trends?: TrendPoint[];
  correlations?: CorrelationCard[];
  todayEntries?: TodayEntry[];
  onLogEntry?: (type: string, value: number, label?: string) => void;
}

type TabId = 'trends' | 'correlations' | 'today';

// ─── Component ────────────────────────────────────────────────────────────────

export function WellnessDashboard({
  isPremium,
  trends = [],
  correlations = [],
  todayEntries = [],
  onLogEntry,
}: WellnessDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('today');

  if (!isPremium) {
    return (
      <div className="wellness-gate">
        <h2>Digital Representative</h2>
        <p>Activate your Digital Representative to track health patterns, see correlations, and get wellness insights.</p>
      </div>
    );
  }

  return (
    <div className="wellness-dashboard">
      <div className="wellness-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'trends'}
          onClick={() => setActiveTab('trends')}
        >
          Trends
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'correlations'}
          onClick={() => setActiveTab('correlations')}
        >
          Correlations
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'today'}
          onClick={() => setActiveTab('today')}
        >
          Today
        </button>
      </div>

      <div className="wellness-content">
        {activeTab === 'trends' && (
          <div className="trends-panel">
            {trends.length === 0 ? (
              <p className="empty-state">Log health data for at least 7 days to see trends.</p>
            ) : (
              <div className="trend-chart">
                <svg viewBox="0 0 300 100" className="trend-svg">
                  {trends.map((point, i) => {
                    const x = (i / Math.max(trends.length - 1, 1)) * 280 + 10;
                    const maxVal = Math.max(...trends.map(t => t.value), 1);
                    const y = 90 - (point.value / maxVal) * 80;
                    return (
                      <circle key={point.date} cx={x} cy={y} r={2} className="trend-point" />
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        )}

        {activeTab === 'correlations' && (
          <div className="correlations-panel">
            {correlations.length === 0 ? (
              <p className="empty-state">Not enough data to compute correlations. Keep logging!</p>
            ) : (
              correlations.map((corr, i) => (
                <div key={i} className={`correlation-card significance-${corr.significance}`}>
                  <h3>{corr.metricA} &times; {corr.metricB}</h3>
                  <p className="correlation-value">r = {corr.correlation.toFixed(2)}</p>
                  <p className="correlation-desc">{corr.description}</p>
                  <p className="medical-disclaimer">
                    Semblance observes patterns in your data. This is not medical advice. Consult a healthcare professional for medical concerns.
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'today' && (
          <div className="today-panel">
            <div className="quick-entry">
              <button onClick={() => onLogEntry?.('mood', 3)}>Log Mood</button>
              <button onClick={() => onLogEntry?.('energy', 3)}>Log Energy</button>
              <button onClick={() => onLogEntry?.('water', 1)}>Log Water</button>
            </div>
            {todayEntries.length === 0 ? (
              <p className="empty-state">No entries today. Start logging!</p>
            ) : (
              <ul className="today-entries">
                {todayEntries.map(entry => (
                  <li key={entry.id}>
                    <span className="entry-type">{entry.metricType}</span>
                    <span className="entry-value">{entry.value}</span>
                    {entry.label && <span className="entry-label">{entry.label}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <footer className="medical-disclaimer">
        Semblance observes patterns in your data. This is not medical advice. Consult a healthcare professional for medical concerns.
      </footer>
    </div>
  );
}
