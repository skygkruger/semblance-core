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

    // BEM migration: toggle button text changed from "Why flagged?" to "Details"
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('"Why flagged?" section lists detected patterns with evidence', () => {
    const flag = makeFlag();
    render(<DarkPatternBadge flag={flag} />);

    // BEM migration: formatCategory capitalizes category names (Urgency: not urgency:)
    // Patterns should not be visible initially
    expect(screen.queryByText('Urgency:')).not.toBeInTheDocument();

    // Click "Details" to expand (BEM migration: was "Why flagged?")
    fireEvent.click(screen.getByText('Details'));

    // Patterns now visible — formatCategory capitalizes first letter of each word
    expect(screen.getByText('Urgency:')).toBeInTheDocument();
    // BEM migration: component uses &ldquo;/&rdquo; (curly quotes) instead of straight quotes
    expect(screen.getByText(/LAST CHANCE/)).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();

    expect(screen.getByText('Scarcity:')).toBeInTheDocument();
    expect(screen.getByText(/only 3 left/)).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();

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
