import { PeriodSelector } from '../Charts/PeriodSelector.web';
import { QuickEntryCard } from './QuickEntryCard.web';
import { HealthTrendsSection } from './HealthTrendsSection.web';
import { InsightCard } from './InsightCard.web';
import { MedicalDisclaimer } from './MedicalDisclaimer.web';
import type { HealthDashboardProps } from './HealthDashboard.types';
import type { PeriodOption } from '../Charts/Charts.types';
import './HealthDashboard.css';

export function HealthDashboard({
  todayEntry,
  trends,
  insights,
  symptomsHistory,
  medicationsHistory,
  hasHealthKit,
  onSaveEntry,
  onDismissInsight,
  loading,
}: HealthDashboardProps) {
  if (loading) {
    return (
      <div className="health-dash">
        <div className="health-dash__header">
          <h2 className="health-dash__title">Health Tracking</h2>
        </div>
        <div className="health-dash__skeleton">
          <div className="health-dash__skeleton-bar health-dash__skeleton-bar--wide" />
          <div className="health-dash__skeleton-bar health-dash__skeleton-bar--tall" />
          <div className="health-dash__skeleton-bar health-dash__skeleton-bar--medium" />
        </div>
      </div>
    );
  }

  const sortedInsights = [...insights].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="health-dash">
      <div className="health-dash__header">
        <div>
          <h2 className="health-dash__title">Health Tracking</h2>
          <p className="health-dash__subtitle">Your wellness patterns, privately tracked</p>
        </div>
      </div>

      <QuickEntryCard
        todayEntry={todayEntry}
        symptomsHistory={symptomsHistory}
        medicationsHistory={medicationsHistory}
        onSave={onSaveEntry}
      />

      {trends.length > 0 && (
        <div className="health-dash__section">
          <h3 className="health-dash__section-title">Trends</h3>
          <HealthTrendsSection trends={trends} hasHealthKit={hasHealthKit} />
        </div>
      )}

      {sortedInsights.length > 0 && (
        <div className="health-dash__section">
          <h3 className="health-dash__section-title">
            Patterns ({sortedInsights.length})
          </h3>
          {sortedInsights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onDismiss={onDismissInsight}
            />
          ))}
        </div>
      )}

      <MedicalDisclaimer />
    </div>
  );
}
