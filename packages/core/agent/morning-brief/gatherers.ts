import type { IntentDriftAnalyzerConfig } from '../intent-drift-analyzer.js';
import { IntentDriftAnalyzer } from '../intent-drift-analyzer.js';
import type { BriefItem, BriefSection, MorningBriefDeps } from './types.js';
import { SECTION_PRIORITIES } from './schema.js';

export class MorningBriefGatherer {
  constructor(private readonly deps: MorningBriefDeps) {}

  gatherAlterEgoSummary(date: Date): BriefSection {
    const items: BriefItem[] = [];

    if (date.getUTCDay() !== 1 || !this.deps.alterEgoStore) {
      return { type: 'alter_ego_summary', title: 'Alter Ego Summary', items, priority: SECTION_PRIORITIES.alter_ego_summary };
    }

    try {
      const lastWeekDate = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastWeekGroup = this.deps.alterEgoStore.getWeekGroup(lastWeekDate);
      const receipts = this.deps.alterEgoStore.getReceipts(lastWeekGroup);

      if (receipts.length === 0) {
        return { type: 'alter_ego_summary', title: 'Alter Ego Summary', items, priority: SECTION_PRIORITIES.alter_ego_summary };
      }

      const undoneCount = receipts.filter(r => r.status === 'undone').length;
      const summaryParts = [`Last week, your Alter Ego handled ${receipts.length} thing${receipts.length !== 1 ? 's' : ''} on your behalf.`];
      if (undoneCount > 0) {
        summaryParts.push(`${undoneCount} ${undoneCount === 1 ? 'was' : 'were'} undone.`);
      }

      items.push({
        id: `alter-ego-summary-${lastWeekGroup}`,
        text: summaryParts.join(' '),
        actionable: false,
        source: 'alter_ego',
      });

      const topReceipts = receipts.filter(r => r.status === 'executed').slice(0, 3);
      for (const receipt of topReceipts) {
        items.push({
          id: `alter-ego-item-${receipt.id}`,
          text: receipt.summary,
          actionable: false,
          source: 'alter_ego',
        });
      }

      items.push({
        id: `alter-ego-comfort-${lastWeekGroup}`,
        text: 'Still comfortable with this level of autonomy? You can adjust it anytime in Settings.',
        actionable: true,
        suggestedAction: 'Review autonomy settings',
        source: 'alter_ego',
      });
    } catch {
      // Alter ego store may not have data
    }

    return {
      type: 'alter_ego_summary',
      title: 'Alter Ego Summary',
      items,
      priority: SECTION_PRIORITIES.alter_ego_summary,
    };
  }

  async gatherMeetings(date: Date): Promise<BriefSection> {
    const items: BriefItem[] = [];

    try {
      const events = this.deps.calendarIndexer.getUpcomingEvents({ daysAhead: 1, limit: 10 });

      for (const event of events) {
        if (event.isAllDay) continue;

        const startTime = new Date(event.startTime);
        const timeStr = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        let context: string | undefined;
        if (this.deps.relationshipAnalyzer) {
          const attendees = JSON.parse(event.attendees || '[]') as string[];
          if (attendees.length > 0) {
            context = `${attendees.length} attendee${attendees.length !== 1 ? 's' : ''}`;
          }
        }

        items.push({
          id: event.uid,
          text: `${timeStr} — ${event.title}`,
          context,
          actionable: false,
          source: 'calendar',
        });
      }
    } catch {
      // Calendar indexer may not have data
    }

    return {
      type: 'meetings',
      title: 'Meetings',
      items,
      priority: SECTION_PRIORITIES.meetings,
    };
  }

  gatherFollowUps(): BriefSection {
    const items: BriefItem[] = [];

    if (this.deps.proactiveEngine) {
      try {
        const insights = this.deps.proactiveEngine.getActiveInsights();
        const followUps = insights.filter(i => i.type === 'follow_up');

        for (const fu of followUps) {
          items.push({
            id: fu.id,
            text: fu.title,
            context: fu.summary,
            actionable: !!fu.suggestedAction,
            suggestedAction: fu.suggestedAction?.description,
            source: 'proactive_engine',
          });
        }
      } catch {
        // Proactive engine may not have data
      }
    }

    return {
      type: 'follow_ups',
      title: 'Follow-ups',
      items,
      priority: SECTION_PRIORITIES.follow_ups,
    };
  }

  gatherReminders(date: Date): BriefSection {
    const items: BriefItem[] = [];

    if (this.deps.reminderStore) {
      try {
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const dueReminders = this.deps.reminderStore.findDue(endOfDay.toISOString());

        for (const rem of dueReminders) {
          items.push({
            id: rem.id,
            text: rem.text,
            context: `Due: ${new Date(rem.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
            actionable: true,
            source: 'reminders',
          });
        }
      } catch {
        // Reminder store may not have data
      }
    }

    return {
      type: 'reminders',
      title: 'Reminders',
      items,
      priority: SECTION_PRIORITIES.reminders,
    };
  }

  async gatherWeather(): Promise<BriefSection> {
    const items: BriefItem[] = [];

    if (this.deps.weatherService) {
      try {
        const current = await this.deps.weatherService.getCurrentWeather();
        if (current) {
          items.push({
            id: `weather-current-${Date.now()}`,
            text: `${current.temperature}° ${current.conditionDescription ?? current.condition}`,
            context: current.humidity != null ? `Humidity: ${current.humidity}%` : undefined,
            actionable: false,
            source: 'weather',
          });
        }

        const forecast = await this.deps.weatherService.getForecastData(12);
        if (forecast && forecast.length > 0) {
          const hasRain = forecast.some(h => h.precipitationChance > 50);
          const highTemp = Math.max(...forecast.map(h => h.temperature));
          const lowTemp = Math.min(...forecast.map(h => h.temperature));

          if (hasRain) {
            items.push({
              id: `weather-rain-${Date.now()}`,
              text: 'Rain expected today',
              actionable: false,
              source: 'weather',
            });
          }

          if (highTemp - lowTemp > 15) {
            items.push({
              id: `weather-range-${Date.now()}`,
              text: `Temperature range: ${lowTemp}°–${highTemp}°`,
              actionable: false,
              source: 'weather',
            });
          }
        }
      } catch {
        // Weather may not be available
      }
    }

    return {
      type: 'weather',
      title: 'Weather',
      items,
      priority: SECTION_PRIORITIES.weather,
    };
  }

  gatherFinancial(): BriefSection {
    const items: BriefItem[] = [];

    if (this.deps.recurringDetector) {
      try {
        const charges = this.deps.recurringDetector.getStoredCharges();
        const forgotten = charges.filter(c => c.status === 'forgotten');

        for (const charge of forgotten) {
          items.push({
            id: charge.id,
            text: `Forgotten subscription: ${charge.merchantName} ($${charge.amount}/mo)`,
            context: `Est. annual cost: $${charge.estimatedAnnualCost}`,
            actionable: true,
            suggestedAction: 'Review subscription',
            source: 'finance',
          });
        }
      } catch {
        // Finance may not be available
      }
    }

    return {
      type: 'financial',
      title: 'Financial',
      items,
      priority: SECTION_PRIORITIES.financial,
    };
  }

  gatherInsights(): BriefSection {
    const items: BriefItem[] = [];

    if (this.deps.proactiveEngine) {
      try {
        const insights = this.deps.proactiveEngine.getActiveInsights();
        const nonFollowUpInsights = insights.filter(i => i.type !== 'follow_up');

        for (const insight of nonFollowUpInsights) {
          items.push({
            id: insight.id,
            text: insight.title,
            context: insight.summary,
            actionable: !!insight.suggestedAction,
            suggestedAction: insight.suggestedAction?.description,
            source: 'proactive_engine',
          });
        }
      } catch {
        // Proactive engine may not have data
      }
    }

    return {
      type: 'insights',
      title: 'Insights',
      items,
      priority: SECTION_PRIORITIES.insights,
    };
  }

  async gatherIntentAlignment(): Promise<BriefSection> {
    const items: BriefItem[] = [];

    if (!this.deps.intentManager) {
      return { type: 'intent_alignment', title: 'Alignment', items, priority: SECTION_PRIORITIES.intent_alignment };
    }

    try {
      const pending = this.deps.intentManager.getPendingObservations('morning_brief');

      if (this.deps.llm && this.deps.model && pending.length === 0) {
        const analyzer = new IntentDriftAnalyzer({
          db: this.deps.db,
          intentManager: this.deps.intentManager,
          llm: this.deps.llm,
          model: this.deps.model,
        } satisfies IntentDriftAnalyzerConfig);
        const freshObs = await analyzer.analyzeBehaviorPatterns();
        for (const obs of freshObs) {
          this.deps.intentManager.recordObservation(obs);
        }
        const updated = this.deps.intentManager.getPendingObservations('morning_brief');
        pending.push(...updated);
      }

      const driftObs = pending.find(o => o.type === 'drift');
      const obs = driftObs ?? pending[0];

      if (obs) {
        items.push({
          id: obs.id,
          text: obs.description,
          context: obs.type === 'drift'
            ? 'Gentle observation — your recent patterns may not match your stated values.'
            : obs.type === 'conflict'
              ? 'Potential conflict between your stated values and recent activity.'
              : 'Your recent activity aligns with your stated goals.',
          actionable: obs.type === 'drift' || obs.type === 'conflict',
          suggestedAction: obs.type !== 'alignment' ? 'Review your intent settings' : undefined,
          source: 'intent_drift',
        });

        this.deps.intentManager.markSurfacedMorningBrief(obs.id);
      }
    } catch {
      // Intent system may not be initialized
    }

    return {
      type: 'intent_alignment',
      title: 'Alignment',
      items,
      priority: SECTION_PRIORITIES.intent_alignment,
    };
  }
}
