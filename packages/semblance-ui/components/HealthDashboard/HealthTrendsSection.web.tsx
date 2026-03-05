import { useState, useMemo } from 'react';
import { HealthSpectrograph } from './HealthSpectrograph.web';
import type { HealthTrendPoint } from './HealthDashboard.types';
import type { MetricKey, ActiveMetric, SpectroPoint } from './spectrograph-renderer';
import './HealthTrendsSection.css';

interface HealthTrendsSectionProps {
  trends: HealthTrendPoint[];
  hasHealthKit: boolean;
}

interface TabDef {
  id: ActiveMetric;
  label: string;
  requiresHealthKit: boolean;
}

const ALL_TABS: TabDef[] = [
  { id: 'all', label: 'All', requiresHealthKit: false },
  { id: 'mood', label: 'Mood', requiresHealthKit: false },
  { id: 'energy', label: 'Energy', requiresHealthKit: false },
  { id: 'water', label: 'Water', requiresHealthKit: false },
  { id: 'sleep', label: 'Sleep', requiresHealthKit: true },
  { id: 'steps', label: 'Steps', requiresHealthKit: true },
  { id: 'heartRate', label: 'Heart Rate', requiresHealthKit: true },
];

function extractValues(trends: HealthTrendPoint[], key: MetricKey): number[] {
  return trends
    .map((t) => {
      switch (key) {
        case 'mood': return t.mood;
        case 'energy': return t.energy;
        case 'water': return t.waterGlasses;
        case 'sleep': return t.sleepHours;
        case 'steps': return t.steps;
        case 'heartRate': return t.heartRateAvg;
      }
    })
    .filter((v): v is number => v !== null);
}

function computeStats(values: number[]): { avg: string; min: string; max: string } | null {
  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    avg: avg.toFixed(1),
    min: Math.min(...values).toFixed(1),
    max: Math.max(...values).toFixed(1),
  };
}

export function HealthTrendsSection({ trends, hasHealthKit }: HealthTrendsSectionProps) {
  const [activeTab, setActiveTab] = useState<ActiveMetric>('all');

  const visibleTabs = ALL_TABS.filter((t) => !t.requiresHealthKit || hasHealthKit);
  const visibleMetrics: MetricKey[] = useMemo(
    () => visibleTabs.filter((t) => t.id !== 'all').map((t) => t.id as MetricKey),
    [visibleTabs],
  );

  const spectroData: SpectroPoint[] = useMemo(() => {
    return trends.map((t) => ({
      date: t.date,
      mood: t.mood,
      energy: t.energy,
      waterGlasses: t.waterGlasses,
      sleepHours: t.sleepHours,
      steps: t.steps,
      heartRateAvg: t.heartRateAvg,
    }));
  }, [trends]);

  const isMetricTab = activeTab !== 'all';
  const values = isMetricTab ? extractValues(trends, activeTab) : [];
  const stats = isMetricTab ? computeStats(values) : null;

  return (
    <div className="health-trends">
      <div className="health-trends__tabs" role="tablist">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`health-trends__tab ${activeTab === tab.id ? 'health-trends__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="health-trends__chart">
        <HealthSpectrograph
          data={spectroData}
          activeMetric={activeTab}
          visibleMetrics={visibleMetrics}
        />
      </div>

      {stats && (
        <div className="health-trends__stats">
          <div className="health-trends__stat">
            <span className="health-trends__stat-label">Avg</span>
            <span className="health-trends__stat-value">{stats.avg}</span>
          </div>
          <div className="health-trends__stat">
            <span className="health-trends__stat-label">Min</span>
            <span className="health-trends__stat-value">{stats.min}</span>
          </div>
          <div className="health-trends__stat">
            <span className="health-trends__stat-label">Max</span>
            <span className="health-trends__stat-value">{stats.max}</span>
          </div>
        </div>
      )}
    </div>
  );
}
