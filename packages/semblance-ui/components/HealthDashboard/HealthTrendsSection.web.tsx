import { useState, useMemo } from 'react';
import { TrendLineChart } from '../Charts/TrendLineChart.web';
import { BarChart } from '../Charts/BarChart.web';
import type { HealthTrendPoint } from './HealthDashboard.types';
import './HealthTrendsSection.css';

interface HealthTrendsSectionProps {
  trends: HealthTrendPoint[];
  hasHealthKit: boolean;
}

type MetricTab = 'mood' | 'energy' | 'water' | 'sleep' | 'steps' | 'heartRate';

interface TabDef {
  id: MetricTab;
  label: string;
  requiresHealthKit: boolean;
}

const ALL_TABS: TabDef[] = [
  { id: 'mood', label: 'Mood', requiresHealthKit: false },
  { id: 'energy', label: 'Energy', requiresHealthKit: false },
  { id: 'water', label: 'Water', requiresHealthKit: false },
  { id: 'sleep', label: 'Sleep', requiresHealthKit: true },
  { id: 'steps', label: 'Steps', requiresHealthKit: true },
  { id: 'heartRate', label: 'Heart Rate', requiresHealthKit: true },
];

function extractValues(trends: HealthTrendPoint[], key: MetricTab): number[] {
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
  const [activeTab, setActiveTab] = useState<MetricTab>('mood');

  const visibleTabs = ALL_TABS.filter((t) => !t.requiresHealthKit || hasHealthKit);

  const chartData = useMemo(() => {
    return trends.map((t) => {
      let value: number | null = null;
      switch (activeTab) {
        case 'mood': value = t.mood; break;
        case 'energy': value = t.energy; break;
        case 'water': value = t.waterGlasses; break;
        case 'sleep': value = t.sleepHours; break;
        case 'steps': value = t.steps; break;
        case 'heartRate': value = t.heartRateAvg; break;
      }
      return { date: t.date, value, label: t.date.slice(-2) };
    });
  }, [trends, activeTab]);

  const values = extractValues(trends, activeTab);
  const stats = computeStats(values);

  const isBarMetric = activeTab === 'steps' || activeTab === 'water';
  const yDomain: [number, number] | undefined =
    activeTab === 'mood' || activeTab === 'energy' ? [1, 5] : undefined;

  const metricColor: Record<MetricTab, string> = {
    mood: '#C9A85C',
    energy: '#6ECFA3',
    water: '#8593A4',
    sleep: '#C9A85C',
    steps: '#6ECFA3',
    heartRate: '#C97B6E',
  };

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
        {isBarMetric ? (
          <BarChart
            data={chartData.map((d) => ({ label: d.label, value: d.value }))}
            color={metricColor[activeTab]}
          />
        ) : (
          <TrendLineChart
            data={chartData}
            color={metricColor[activeTab]}
            showArea
            yDomain={yDomain}
          />
        )}
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
