// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DarkPatternBadge,
  type DarkPatternFlag,
} from '@semblance/desktop/components/DarkPatternBadge';

function makeFlag(overrides: Partial<DarkPatternFlag> = {}): DarkPatternFlag {
  return {
    contentId: 'email-001',
    confidence: 0.88,
    patterns: [
      { category: 'urgency', evidence: 'LAST CHANCE', confidence: 0.9 },
      { category: 'scarcity', evidence: 'only 3 left', confidence: 0.85 },
    ],
    reframe: 'A product is available for purchase.',
    ...overrides,
  };
}

describe('DarkPatternBadge (desktop)', () => {
  it('renders shield icon and reframe text for flagged content', () => {
    const flag = makeFlag();
    render(<DarkPatternBadge flag={flag} />);

    // Shield icon
    expect(screen.getByLabelText('shield icon')).toBeInTheDocument();
    expect(screen.getByLabelText('shield icon').textContent).toContain('[!]');

    // Reframe text
    expect(screen.getByText('A product is available for purchase.')).toBeInTheDocument();

    // "Why flagged?" toggle
    expect(screen.getByText('Why flagged?')).toBeInTheDocument();
  });

  it('"Why flagged?" section lists detected patterns with evidence', () => {
    const flag = makeFlag();
    render(<DarkPatternBadge flag={flag} />);

    // Patterns should not be visible initially
    expect(screen.queryByText('urgency:')).not.toBeInTheDocument();

    // Click "Why flagged?" to expand
    fireEvent.click(screen.getByText('Why flagged?'));

    // Patterns now visible
    expect(screen.getByText('urgency:')).toBeInTheDocument();
    expect(screen.getByText('"LAST CHANCE"')).toBeInTheDocument();
    expect(screen.getByText('(90%)')).toBeInTheDocument();

    expect(screen.getByText('scarcity:')).toBeInTheDocument();
    expect(screen.getByText('"only 3 left"')).toBeInTheDocument();
    expect(screen.getByText('(85%)')).toBeInTheDocument();

    // Toggle text should now say "Hide"
    expect(screen.getByText('Hide')).toBeInTheDocument();
  });

  it('dismiss callback fires with correct content ID', () => {
    const flag = makeFlag({ contentId: 'email-xyz' });
    const onDismiss = vi.fn();
    render(<DarkPatternBadge flag={flag} onDismiss={onDismiss} />);

    // Find and click the dismiss button
    const dismissBtn = screen.getByLabelText('dismiss flag');
    fireEvent.click(dismissBtn);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('email-xyz');
  });
});
