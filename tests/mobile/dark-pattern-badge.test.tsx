// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DarkPatternBadge,
  type DarkPatternFlag,
} from '@semblance/mobile/components/DarkPatternBadge';

function makeFlag(): DarkPatternFlag {
  return {
    contentId: 'notif-001',
    confidence: 0.92,
    patterns: [
      { category: 'urgency', evidence: 'ACT NOW', confidence: 0.9 },
    ],
    reframe: 'An offer is available.',
  };
}

describe('DarkPatternBadge (mobile)', () => {
  it('mobile badge renders with correct flag data', () => {
    const flag = makeFlag();
    const { container } = render(<DarkPatternBadge flag={flag} />);

    // Component renders content
    expect(container.innerHTML.length).toBeGreaterThan(0);

    // Shield icon present (accessibilityLabel maps to DOM attribute in mock)
    expect(screen.getByText('[!]')).toBeInTheDocument();

    // Reframe text present
    expect(screen.getByText('An offer is available.')).toBeInTheDocument();

    // Toggle button present
    expect(screen.getByText('Why flagged?')).toBeInTheDocument();
  });
});
