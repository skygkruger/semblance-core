// @vitest-environment jsdom
// TermsAcceptanceStep Tests — Final onboarding step (web).
//
// Covers:
// - Renders title and terms sections
// - Accept button disabled until checkbox checked
// - Checking checkbox enables button
// - Clicking accept calls onAccept callback
// - Terms version displayed
// - All 4 terms sections present

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TermsAcceptanceStep } from '@semblance/ui/pages/Onboarding/TermsAcceptanceStep.web';

describe('TermsAcceptanceStep', () => {
  const mockOnAccept = vi.fn();

  beforeEach(() => {
    mockOnAccept.mockClear();
  });

  it('renders the title', () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    expect(screen.getByText('One last thing')).toBeInTheDocument();
  });

  it('renders all 4 terms sections', () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    expect(screen.getByText('Local-Only Processing')).toBeInTheDocument();
    expect(screen.getByText('Zero Telemetry')).toBeInTheDocument();
    expect(screen.getByText('License Terms')).toBeInTheDocument();
    expect(screen.getByText('Your Data, Your Rules')).toBeInTheDocument();
  });

  it('renders the checkbox label', () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    expect(screen.getByText('I understand and accept these terms')).toBeInTheDocument();
  });

  it('accept button is disabled by default', () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    const button = screen.getByText('Get started');
    expect(button).toBeDisabled();
  });

  it('accept button is enabled after checking checkbox', async () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    const checkbox = screen.getByRole('checkbox');

    await userEvent.click(checkbox);

    const button = screen.getByText('Get started');
    expect(button).not.toBeDisabled();
  });

  it('calls onAccept when accept button clicked after checking checkbox', async () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    const button = screen.getByText('Get started');
    await userEvent.click(button);

    expect(mockOnAccept).toHaveBeenCalledTimes(1);
  });

  it('does not call onAccept when button clicked without checking', async () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    const button = screen.getByText('Get started');

    // Button is disabled, click should not fire
    fireEvent.click(button);
    expect(mockOnAccept).not.toHaveBeenCalled();
  });

  it('displays terms version', () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} termsVersion="2.0" />);
    expect(screen.getByText(/2\.0/)).toBeInTheDocument();
  });

  it('displays default terms version 1.0', () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    expect(screen.getByText(/1\.0/)).toBeInTheDocument();
  });

  it('privacy description mentions local storage', () => {
    render(<TermsAcceptanceStep onAccept={mockOnAccept} />);
    expect(screen.getByText(/stores everything on your device/i)).toBeInTheDocument();
  });
});
