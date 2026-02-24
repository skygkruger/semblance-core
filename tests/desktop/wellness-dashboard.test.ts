// @vitest-environment jsdom
/**
 * Step 22 — WellnessDashboard tests.
 * Tests three-tab rendering, free tier prompt, medical disclaimer.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { WellnessDashboard } from '../../packages/desktop/src/components/WellnessDashboard';

describe('WellnessDashboard (Step 22)', () => {
  it('renders wellness dashboard with three tabs', () => {
    render(React.createElement(WellnessDashboard, { isPremium: true }));

    expect(screen.getByText('Trends')).toBeDefined();
    expect(screen.getByText('Correlations')).toBeDefined();
    expect(screen.getByText('Today')).toBeDefined();
  });

  it('shows "Digital Representative" prompt for free tier', () => {
    render(React.createElement(WellnessDashboard, { isPremium: false }));

    expect(screen.getByText('Digital Representative')).toBeDefined();
    expect(screen.queryByText('Trends')).toBeNull();
  });

  it('medical disclaimer text present', () => {
    render(React.createElement(WellnessDashboard, { isPremium: true }));

    const disclaimers = screen.getAllByText(/not medical advice/i);
    expect(disclaimers.length).toBeGreaterThan(0);
  });
});
