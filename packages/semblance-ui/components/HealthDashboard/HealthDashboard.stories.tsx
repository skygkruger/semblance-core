import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { HealthDashboard } from './HealthDashboard';
import type { HealthEntry, HealthTrendPoint, HealthInsight } from './HealthDashboard.types';

const meta: Meta<typeof HealthDashboard> = {
  title: 'Health/HealthDashboard',
  component: HealthDashboard,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720, padding: 24, background: '#0B0E11' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof HealthDashboard>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateOffset(daysAgo: number): string {
  const d = new Date('2026-03-04');
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function generate30DayTrends(): HealthTrendPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const daysAgo = 29 - i;
    const phase = i * 0.4;
    return {
      date: dateOffset(daysAgo),
      mood: clamp(Math.round(3 + Math.sin(phase) * 1.5 + (Math.random() - 0.5) * 0.6), 1, 5),
      energy: clamp(Math.round(3 + Math.cos(phase * 0.8) * 1.2 + (Math.random() - 0.5) * 0.8), 1, 5),
      waterGlasses: clamp(Math.round(5 + Math.sin(phase * 1.2) * 2 + (Math.random() - 0.5)), 2, 10),
      sleepHours: Math.round((6.5 + Math.sin(phase * 0.6) * 1.2 + (Math.random() - 0.5) * 0.4) * 10) / 10,
      steps: Math.round(7500 + Math.sin(phase * 0.9) * 3000 + (Math.random() - 0.5) * 1500),
      heartRateAvg: Math.round(68 + Math.sin(phase * 0.7) * 8 + (Math.random() - 0.5) * 4),
    };
  });
}

function generate90DayTrends(): HealthTrendPoint[] {
  return Array.from({ length: 90 }, (_, i) => {
    const daysAgo = 89 - i;
    const phase = i * 0.3;
    // Introduce some null gaps to simulate missed days
    const skipEntry = i % 11 === 7;
    return {
      date: dateOffset(daysAgo),
      mood: skipEntry ? null : clamp(Math.round(3 + Math.sin(phase) * 1.4 + (Math.random() - 0.5) * 0.7), 1, 5),
      energy: skipEntry ? null : clamp(Math.round(3 + Math.cos(phase * 0.9) * 1.1 + (Math.random() - 0.5) * 0.9), 1, 5),
      waterGlasses: skipEntry ? null : clamp(Math.round(5 + Math.sin(phase * 1.1) * 2.5 + (Math.random() - 0.5) * 1.2), 1, 12),
      sleepHours: skipEntry ? null : Math.round((6.8 + Math.sin(phase * 0.5) * 1.4 + (Math.random() - 0.5) * 0.5) * 10) / 10,
      steps: skipEntry ? null : Math.round(8000 + Math.sin(phase * 0.8) * 4000 + (Math.random() - 0.5) * 2000),
      heartRateAvg: Math.round(67 + Math.sin(phase * 0.6) * 9 + (Math.random() - 0.5) * 3),
    };
  });
}

const THREE_INSIGHTS: HealthInsight[] = [
  {
    id: 'ins-1',
    type: 'correlation',
    title: 'Low water intake precedes low energy',
    description:
      'On days when you drink fewer than 4 glasses of water, your energy the following morning is rated 1-2 points lower on average. This pattern holds across 18 of the last 30 days.',
    confidence: 0.84,
    dataSources: ['water', 'energy'],
    detectedAt: dateOffset(2),
  },
  {
    id: 'ins-2',
    type: 'trend',
    title: 'Mood improving this week',
    description:
      'Your mood ratings have trended upward over the past 7 days, averaging 4.1 versus 3.2 the week before. Sleep hours also increased by 0.8h on average.',
    confidence: 0.77,
    dataSources: ['mood', 'sleep'],
    detectedAt: dateOffset(1),
  },
  {
    id: 'ins-3',
    type: 'streak',
    title: '8-day hydration streak',
    description:
      'You have logged at least 6 glasses of water for 8 consecutive days. This is your longest hydration streak in the tracked period.',
    confidence: 1.0,
    dataSources: ['water'],
    detectedAt: dateOffset(0),
  },
];

const FIVE_INSIGHTS: HealthInsight[] = [
  ...THREE_INSIGHTS,
  {
    id: 'ins-4',
    type: 'correlation',
    title: 'High step count linked to next-day mood',
    description:
      'Days with more than 10,000 steps are followed by mood ratings of 4 or 5 the next morning in 79% of cases over the 90-day window. The effect is strongest Monday through Thursday.',
    confidence: 0.79,
    dataSources: ['steps', 'mood'],
    detectedAt: dateOffset(5),
  },
  {
    id: 'ins-5',
    type: 'trend',
    title: 'Resting heart rate declining',
    description:
      'Your average resting heart rate has dropped from 74 bpm to 68 bpm over the past 6 weeks, consistent with improving cardiovascular fitness.',
    confidence: 0.61,
    dataSources: ['heartRate'],
    detectedAt: dateOffset(8),
  },
];

const SYMPTOMS_HISTORY = ['headache', 'fatigue', 'nausea', 'brain fog', 'back pain', 'sore throat'];
const MEDICATIONS_HISTORY = ['Vitamin D', 'Melatonin', 'Magnesium', 'Omega-3', 'Zinc'];

const TODAY_ENTRY_BLANK: HealthEntry = {
  id: 'entry-today',
  date: dateOffset(0),
  timestamp: new Date('2026-03-04T08:15:00').toISOString(),
  mood: null,
  energy: null,
  waterGlasses: null,
  symptoms: [],
  medications: [],
  notes: null,
};

const TODAY_ENTRY_CHECKED_IN: HealthEntry = {
  id: 'entry-today-checkedin',
  date: dateOffset(0),
  timestamp: new Date('2026-03-04T08:22:00').toISOString(),
  mood: 4,
  energy: 3,
  waterGlasses: 6,
  symptoms: ['headache'],
  medications: ['Vitamin D'],
  notes: null,
};

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Default: Story = {
  render: function DefaultStory() {
    const [insights, setInsights] = useState<HealthInsight[]>(THREE_INSIGHTS);
    return (
      <HealthDashboard
        todayEntry={null}
        trends={generate30DayTrends()}
        insights={insights}
        symptomsHistory={SYMPTOMS_HISTORY}
        medicationsHistory={MEDICATIONS_HISTORY}
        hasHealthKit
        onSaveEntry={(entry) => {
          console.log('[HealthDashboard] onSaveEntry', entry);
        }}
        onDismissInsight={(id) => {
          setInsights((prev) => prev.filter((ins) => ins.id !== id));
        }}
      />
    );
  },
};

export const CheckedInToday: Story = {
  render: function CheckedInStory() {
    const [insights, setInsights] = useState<HealthInsight[]>(THREE_INSIGHTS);
    return (
      <HealthDashboard
        todayEntry={TODAY_ENTRY_CHECKED_IN}
        trends={generate30DayTrends()}
        insights={insights}
        symptomsHistory={SYMPTOMS_HISTORY}
        medicationsHistory={MEDICATIONS_HISTORY}
        hasHealthKit
        onSaveEntry={(entry) => {
          console.log('[HealthDashboard] onSaveEntry update', entry);
        }}
        onDismissInsight={(id) => {
          setInsights((prev) => prev.filter((ins) => ins.id !== id));
        }}
      />
    );
  },
};

export const NoHealthKit: Story = {
  render: function NoHealthKitStory() {
    const [insights, setInsights] = useState<HealthInsight[]>([THREE_INSIGHTS[0], THREE_INSIGHTS[2]]);
    const manualOnlyTrends: HealthTrendPoint[] = generate30DayTrends().map((t) => ({
      ...t,
      sleepHours: null,
      steps: null,
      heartRateAvg: null,
    }));
    return (
      <HealthDashboard
        todayEntry={null}
        trends={manualOnlyTrends}
        insights={insights}
        symptomsHistory={SYMPTOMS_HISTORY}
        medicationsHistory={MEDICATIONS_HISTORY}
        hasHealthKit={false}
        onSaveEntry={(entry) => {
          console.log('[HealthDashboard] onSaveEntry', entry);
        }}
        onDismissInsight={(id) => {
          setInsights((prev) => prev.filter((ins) => ins.id !== id));
        }}
      />
    );
  },
};

export const NewUser: Story = {
  render: function NewUserStory() {
    return (
      <HealthDashboard
        todayEntry={null}
        trends={[]}
        insights={[]}
        symptomsHistory={[]}
        medicationsHistory={[]}
        hasHealthKit={false}
        onSaveEntry={(entry) => {
          console.log('[HealthDashboard] onSaveEntry (new user)', entry);
        }}
      />
    );
  },
};

export const PatternRich: Story = {
  render: function PatternRichStory() {
    const [insights, setInsights] = useState<HealthInsight[]>(FIVE_INSIGHTS);
    return (
      <HealthDashboard
        todayEntry={TODAY_ENTRY_BLANK}
        trends={generate90DayTrends()}
        insights={insights}
        symptomsHistory={SYMPTOMS_HISTORY}
        medicationsHistory={MEDICATIONS_HISTORY}
        hasHealthKit
        onSaveEntry={(entry) => {
          console.log('[HealthDashboard] onSaveEntry (pattern-rich)', entry);
        }}
        onDismissInsight={(id) => {
          setInsights((prev) => prev.filter((ins) => ins.id !== id));
        }}
      />
    );
  },
};

export const FreeTierGated: Story = {
  render: function FreeTierGatedStory() {
    return (
      <div
        style={{
          padding: 32,
          background: '#111418',
          border: '1px solid #1E2530',
          borderRadius: 4,
          textAlign: 'center' as const,
        }}
      >
        <p
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 15,
            color: '#8593A4',
            margin: '0 0 16px',
          }}
        >
          Activate your Digital Representative to unlock health tracking
        </p>
        <button
          type="button"
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 13,
            color: '#6ECFA3',
            background: 'transparent',
            border: '1px solid #6ECFA3',
            borderRadius: 3,
            padding: '8px 20px',
            cursor: 'pointer',
          }}
          onClick={() => console.log('[HealthDashboard] upgrade CTA clicked')}
        >
          Learn more
        </button>
      </div>
    );
  },
};

export const HealthKitDisconnected: Story = {
  render: function HealthKitDisconnectedStory() {
    const manualTrends: HealthTrendPoint[] = generate30DayTrends().map((t) => ({
      ...t,
      sleepHours: null,
      steps: null,
      heartRateAvg: null,
    }));
    const manualInsights: HealthInsight[] = [
      {
        id: 'ins-manual-1',
        type: 'streak',
        title: '5-day check-in streak',
        description:
          'You have completed a daily check-in for 5 consecutive days. Consistent logging helps Semblance surface more accurate patterns over time.',
        confidence: 1.0,
        dataSources: ['mood', 'energy', 'water'],
        detectedAt: dateOffset(0),
      },
      {
        id: 'ins-manual-2',
        type: 'correlation',
        title: 'Headaches cluster on low-water days',
        description:
          'Headaches appear in your symptom log on 7 of the 9 days where water intake was below 4 glasses. Consider monitoring this pattern more closely.',
        confidence: 0.72,
        dataSources: ['water', 'symptoms'],
        detectedAt: dateOffset(3),
      },
    ];
    const [insights, setInsights] = useState<HealthInsight[]>(manualInsights);
    return (
      <HealthDashboard
        todayEntry={TODAY_ENTRY_CHECKED_IN}
        trends={manualTrends}
        insights={insights}
        symptomsHistory={SYMPTOMS_HISTORY}
        medicationsHistory={MEDICATIONS_HISTORY}
        hasHealthKit={false}
        onSaveEntry={(entry) => {
          console.log('[HealthDashboard] onSaveEntry (hk disconnected)', entry);
        }}
        onDismissInsight={(id) => {
          setInsights((prev) => prev.filter((ins) => ins.id !== id));
        }}
      />
    );
  },
};
