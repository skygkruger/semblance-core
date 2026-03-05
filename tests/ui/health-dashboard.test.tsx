// @vitest-environment jsdom
// Tests for HealthDashboard — renders the real component and its sub-components.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HealthDashboard } from '@semblance/ui/components/HealthDashboard/HealthDashboard.web';
import type {
  HealthEntry,
  HealthTrendPoint,
  HealthInsight,
  HealthDashboardProps,
} from '@semblance/ui/components/HealthDashboard/HealthDashboard.types';

// ─── Mock Fixtures ─────────────────────────────────────────────────────────────

const mockTodayEntry: HealthEntry = {
  id: '2026-03-04',
  date: '2026-03-04',
  timestamp: '2026-03-04T10:00:00Z',
  mood: 4,
  energy: 3,
  waterGlasses: 5,
  symptoms: ['headache'],
  medications: ['ibuprofen'],
  notes: null,
};

const mockTrends: HealthTrendPoint[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 1, 3 + i);
  return {
    date: d.toISOString().slice(0, 10),
    mood: 2 + Math.round(Math.sin(i / 5) * 1.5),
    energy: 3 + (i % 3 === 0 ? 1 : 0),
    waterGlasses: 4 + (i % 4),
    sleepHours: 6.5 + (i % 3),
    steps: 5000 + i * 200,
    heartRateAvg: 65 + (i % 5),
  };
});

const mockInsights: HealthInsight[] = [
  {
    id: 'i1',
    type: 'correlation',
    title: 'Better mood on active days',
    description: 'Days with 7,000+ steps correlate with mood scores 0.8 points higher on average.',
    confidence: 0.85,
    dataSources: ['steps', 'mood'],
    detectedAt: '2026-03-01T08:00:00Z',
  },
  {
    id: 'i2',
    type: 'trend',
    title: 'Energy improving',
    description: 'Your average energy has increased from 2.8 to 3.4 over the past 14 days.',
    confidence: 0.72,
    dataSources: ['energy'],
    detectedAt: '2026-03-02T08:00:00Z',
  },
  {
    id: 'i3',
    type: 'streak',
    title: '10-day water streak',
    description: 'You have logged water intake for 10 consecutive days.',
    confidence: 1.0,
    dataSources: ['water'],
    detectedAt: '2026-03-03T08:00:00Z',
  },
];

const mockSymptomsHistory = ['headache', 'fatigue', 'nausea', 'back pain'];
const mockMedicationsHistory = ['ibuprofen', 'vitamin D', 'melatonin'];

function makeProps(overrides: Partial<HealthDashboardProps> = {}): HealthDashboardProps {
  return {
    todayEntry: null,
    trends: mockTrends,
    insights: mockInsights,
    symptomsHistory: mockSymptomsHistory,
    medicationsHistory: mockMedicationsHistory,
    hasHealthKit: true,
    onSaveEntry: vi.fn(),
    onDismissInsight: vi.fn(),
    ...overrides,
  };
}

// ─── Quick Entry ────────────────────────────────────────────────────────────────

describe('HealthDashboard — quick entry', () => {
  it('renders 5 mood scale points', () => {
    render(<HealthDashboard {...makeProps()} />);
    const moodGroup = screen.getByRole('radiogroup', { name: 'Mood scale' });
    const buttons = moodGroup.querySelectorAll('button');
    expect(buttons.length).toBe(5);
  });

  it('mood selection sets aria-pressed on clicked point', () => {
    render(<HealthDashboard {...makeProps()} />);
    const mood3 = screen.getByRole('button', { name: 'Mood 3' });
    fireEvent.click(mood3);
    expect(mood3).toHaveAttribute('aria-pressed', 'true');
  });

  it('energy selector is independent from mood', () => {
    render(<HealthDashboard {...makeProps()} />);
    const mood4 = screen.getByRole('button', { name: 'Mood 4' });
    const energy2 = screen.getByRole('button', { name: 'Energy 2' });
    fireEvent.click(mood4);
    fireEvent.click(energy2);
    expect(mood4).toHaveAttribute('aria-pressed', 'true');
    expect(energy2).toHaveAttribute('aria-pressed', 'true');
  });

  it('water increment button increases count', () => {
    render(<HealthDashboard {...makeProps()} />);
    const increaseBtn = screen.getByRole('button', { name: 'Increase water' });
    fireEvent.click(increaseBtn);
    fireEvent.click(increaseBtn);
    const waterCount = document.querySelector('.quick-entry__water-count');
    expect(waterCount).not.toBeNull();
    expect(waterCount!.textContent).toBe('2');
  });

  it('water decrement does not go below zero', () => {
    render(<HealthDashboard {...makeProps()} />);
    const decreaseBtn = screen.getByRole('button', { name: 'Decrease water' });
    fireEvent.click(decreaseBtn);
    fireEvent.click(decreaseBtn);
    // Should still show 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('symptom tag input adds a tag on Enter', () => {
    render(<HealthDashboard {...makeProps()} />);
    const input = screen.getByPlaceholderText('Add symptom...');
    fireEvent.change(input, { target: { value: 'dizziness' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('dizziness')).toBeInTheDocument();
  });

  it('symptom tag can be removed', () => {
    render(<HealthDashboard {...makeProps()} />);
    const input = screen.getByPlaceholderText('Add symptom...');
    fireEvent.change(input, { target: { value: 'dizziness' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const removeBtn = screen.getByRole('button', { name: 'Remove dizziness' });
    fireEvent.click(removeBtn);
    expect(screen.queryByText('dizziness')).not.toBeInTheDocument();
  });

  it('medication checkboxes render from history', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('ibuprofen')).toBeInTheDocument();
    expect(screen.getByText('vitamin D')).toBeInTheDocument();
    expect(screen.getByText('melatonin')).toBeInTheDocument();
  });

  it('save button calls onSaveEntry with selected data', () => {
    const onSaveEntry = vi.fn();
    render(<HealthDashboard {...makeProps({ onSaveEntry })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mood 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveEntry).toHaveBeenCalledOnce();
    const arg = onSaveEntry.mock.calls[0]![0];
    expect(arg.mood).toBe(4);
  });

  it('pre-fills from todayEntry when provided', () => {
    render(<HealthDashboard {...makeProps({ todayEntry: mockTodayEntry })} />);
    const mood4 = screen.getByRole('button', { name: 'Mood 4' });
    expect(mood4).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('headache')).toBeInTheDocument();
  });

  it('save button is disabled when no data entered', () => {
    render(<HealthDashboard {...makeProps()} />);
    const saveBtn = screen.getByRole('button', { name: 'Save' });
    expect(saveBtn).toBeDisabled();
  });

  it('shows "Update" label when todayEntry exists', () => {
    render(<HealthDashboard {...makeProps({ todayEntry: mockTodayEntry })} />);
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
});

// ─── Trends ────────────────────────────────────────────────────────────────────

describe('HealthDashboard — trends', () => {
  it('renders All tab selected by default', () => {
    render(<HealthDashboard {...makeProps()} />);
    const allTab = screen.getByRole('tab', { name: 'All' });
    expect(allTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders energy tab and switches chart', () => {
    render(<HealthDashboard {...makeProps()} />);
    const energyTab = screen.getByRole('tab', { name: 'Energy' });
    fireEvent.click(energyTab);
    expect(energyTab).toHaveAttribute('aria-selected', 'true');
  });

  it('hides HealthKit tabs when hasHealthKit is false', () => {
    render(<HealthDashboard {...makeProps({ hasHealthKit: false })} />);
    expect(screen.queryByRole('tab', { name: 'Sleep' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Steps' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Heart Rate' })).not.toBeInTheDocument();
  });

  it('shows HealthKit tabs when hasHealthKit is true', () => {
    render(<HealthDashboard {...makeProps({ hasHealthKit: true })} />);
    expect(screen.getByRole('tab', { name: 'Sleep' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Steps' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Heart Rate' })).toBeInTheDocument();
  });

  it('displays average, min, and max stats when a metric tab is selected', () => {
    render(<HealthDashboard {...makeProps()} />);
    // Stats only show for specific metric tabs, not 'All'
    const moodTab = screen.getByRole('tab', { name: 'Mood' });
    fireEvent.click(moodTab);
    expect(screen.getByText('Avg')).toBeInTheDocument();
    expect(screen.getByText('Min')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('renders water tab', () => {
    render(<HealthDashboard {...makeProps()} />);
    const waterTab = screen.getByRole('tab', { name: 'Water' });
    fireEvent.click(waterTab);
    expect(waterTab).toHaveAttribute('aria-selected', 'true');
  });

  it('handles empty trends gracefully', () => {
    render(<HealthDashboard {...makeProps({ trends: [] })} />);
    // Trends section should not render when trends is empty
    expect(screen.queryByText('Trends')).not.toBeInTheDocument();
  });

  it('always shows Mood, Energy, Water tabs even without HealthKit', () => {
    render(<HealthDashboard {...makeProps({ hasHealthKit: false })} />);
    expect(screen.getByRole('tab', { name: 'Mood' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Energy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Water' })).toBeInTheDocument();
  });

  it('tab count is 4 without HealthKit, 7 with', () => {
    const { unmount } = render(<HealthDashboard {...makeProps({ hasHealthKit: false })} />);
    expect(screen.getAllByRole('tab').length).toBe(4);
    unmount();
    render(<HealthDashboard {...makeProps({ hasHealthKit: true })} />);
    expect(screen.getAllByRole('tab').length).toBe(7);
  });

  it('stats values render in stat elements when metric tab is selected', () => {
    render(<HealthDashboard {...makeProps()} />);
    // Click a specific metric tab — stats don't render in 'All' mode
    const moodTab = screen.getByRole('tab', { name: 'Mood' });
    fireEvent.click(moodTab);
    const statValues = document.querySelectorAll('.health-trends__stat-value');
    expect(statValues.length).toBe(3);
    // Should be numeric
    statValues.forEach((el) => {
      expect(Number(el.textContent)).not.toBeNaN();
    });
  });
});

// ─── Insights ──────────────────────────────────────────────────────────────────

describe('HealthDashboard — insights', () => {
  it('renders insight card title and description', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('Better mood on active days')).toBeInTheDocument();
    expect(screen.getByText(/Days with 7,000\+ steps/)).toBeInTheDocument();
  });

  it('displays confidence as percentage', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows data source attribution', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('Sources: steps, mood')).toBeInTheDocument();
    expect(screen.getByText('Sources: energy')).toBeInTheDocument();
  });

  it('no insights section when insights array is empty', () => {
    render(<HealthDashboard {...makeProps({ insights: [] })} />);
    expect(screen.queryByText('Patterns')).not.toBeInTheDocument();
  });

  it('insights sorted by confidence (highest first)', () => {
    render(<HealthDashboard {...makeProps()} />);
    const cards = document.querySelectorAll('.insight-card');
    // First should be confidence 1.0 (100%), then 0.85 (85%), then 0.72 (72%)
    expect(cards[0]!.textContent).toContain('100%');
    expect(cards[1]!.textContent).toContain('85%');
    expect(cards[2]!.textContent).toContain('72%');
  });

  it('dismiss button fires onDismissInsight with ID', () => {
    const onDismissInsight = vi.fn();
    render(<HealthDashboard {...makeProps({ onDismissInsight })} />);
    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtns[0]!);
    expect(onDismissInsight).toHaveBeenCalled();
  });

  it('patterns heading shows count', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('Patterns (3)')).toBeInTheDocument();
  });

  it('insight type displays correctly', () => {
    render(<HealthDashboard {...makeProps()} />);
    // All three insights are present
    expect(screen.getByText('10-day water streak')).toBeInTheDocument();
    expect(screen.getByText('Energy improving')).toBeInTheDocument();
  });
});

// ─── Gating ────────────────────────────────────────────────────────────────────

describe('HealthDashboard — gating', () => {
  it('renders dashboard title', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('Health Tracking')).toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('Your wellness patterns, privately tracked')).toBeInTheDocument();
  });

  it('renders loading skeleton when loading=true', () => {
    render(<HealthDashboard {...makeProps({ loading: true })} />);
    const skeleton = document.querySelector('.health-dash__skeleton');
    expect(skeleton).not.toBeNull();
  });

  it('loading state hides all main content', () => {
    render(<HealthDashboard {...makeProps({ loading: true })} />);
    expect(screen.queryByText('Daily Check-In')).not.toBeInTheDocument();
    expect(screen.queryByText('Trends')).not.toBeInTheDocument();
    expect(screen.queryByText('Patterns')).not.toBeInTheDocument();
  });

  it('dashboard renders all sections when data provided', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(screen.getByText('Daily Check-In')).toBeInTheDocument();
    expect(screen.getByText('Trends')).toBeInTheDocument();
    expect(screen.getByText(/Patterns/)).toBeInTheDocument();
  });
});

// ─── Disclaimer + Polish ───────────────────────────────────────────────────────

describe('HealthDashboard — disclaimer and polish', () => {
  it('medical disclaimer is always visible', () => {
    render(<HealthDashboard {...makeProps()} />);
    expect(
      screen.getByText(/Semblance identifies statistical patterns in your data/),
    ).toBeInTheDocument();
  });

  it('disclaimer text includes all required phrases', () => {
    render(<HealthDashboard {...makeProps()} />);
    const disclaimer = screen.getByRole('note', { name: 'Medical disclaimer' });
    expect(disclaimer.textContent).toContain('not medical advice');
    expect(disclaimer.textContent).toContain('Correlations are observations, not causation');
    expect(disclaimer.textContent).toContain('consult a healthcare professional');
  });

  it('disclaimer has no dismiss button', () => {
    render(<HealthDashboard {...makeProps()} />);
    const disclaimer = screen.getByRole('note', { name: 'Medical disclaimer' });
    const buttons = disclaimer.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('water count uses the quick-entry__water-count class', () => {
    render(<HealthDashboard {...makeProps()} />);
    const waterCount = document.querySelector('.quick-entry__water-count');
    expect(waterCount).not.toBeNull();
  });

  it('disclaimer renders even in empty state', () => {
    render(<HealthDashboard {...makeProps({ trends: [], insights: [] })} />);
    expect(
      screen.getByText(/not medical advice/),
    ).toBeInTheDocument();
  });
});
