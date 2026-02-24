// @vitest-environment jsdom
/**
 * Step 22 — Mobile WellnessScreen tests.
 * Tests quick entry UI and HealthKit import button visibility.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { WellnessScreen } from '../../packages/mobile/src/screens/WellnessScreen';

describe('WellnessScreen Mobile (Step 22)', () => {
  it('renders mobile wellness screen with quick entry UI', () => {
    render(React.createElement(WellnessScreen, { isPremium: true, healthKitAvailable: false }));

    expect(screen.getByText('How are you feeling?')).toBeDefined();
    expect(screen.getByText('+ Water')).toBeDefined();
  });

  it('HealthKit import button respects isAvailable() (hidden when false)', () => {
    const { rerender } = render(
      React.createElement(WellnessScreen, { isPremium: true, healthKitAvailable: false })
    );
    expect(screen.queryByText('Import from HealthKit')).toBeNull();

    rerender(
      React.createElement(WellnessScreen, { isPremium: true, healthKitAvailable: true })
    );
    expect(screen.getByText('Import from HealthKit')).toBeDefined();
  });
});
