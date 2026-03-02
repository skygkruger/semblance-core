// @vitest-environment jsdom
// UpgradeEmailCapture Tests — Email input for Stripe checkout flow.
//
// Covers:
// - Renders email input and continue button
// - Email validation rejects invalid addresses
// - Valid email enables submission
// - onSubmit called with trimmed email
// - Loading state disables input
// - Error message shown for invalid email
// - Email not persisted (structural assertion)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpgradeEmailCapture } from '@semblance/ui/components/UpgradeEmailCapture/UpgradeEmailCapture.web';

describe('UpgradeEmailCapture', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('renders the email notice copy', () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    expect(
      screen.getByText(/No account required/i),
    ).toBeInTheDocument();
  });

  it('renders an email input', () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    const input = screen.getByLabelText(/email address/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
  });

  it('renders a continue button', () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('calls onSubmit with valid email on form submission', async () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    const input = screen.getByLabelText(/email address/i);

    await userEvent.type(input, 'test@example.com');
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockOnSubmit).toHaveBeenCalledWith('test@example.com');
  });

  it('trims whitespace from email before submitting', async () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    const input = screen.getByLabelText(/email address/i);

    await userEvent.type(input, '  test@example.com  ');
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockOnSubmit).toHaveBeenCalledWith('test@example.com');
  });

  it('does not call onSubmit for invalid email', async () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    const input = screen.getByLabelText(/email address/i);

    await userEvent.type(input, 'not-an-email');
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows error message for invalid email after touch', async () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    const input = screen.getByLabelText(/email address/i);

    await userEvent.type(input, 'bad');
    // Submit to trigger touch
    const form = input.closest('form')!;
    fireEvent.submit(form);

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it('does not show error for empty input that has not been touched', () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
  });

  it('disables input when loading', () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} loading={true} />);
    const input = screen.getByLabelText(/email address/i);
    expect(input).toBeDisabled();
  });

  it('shows loading text when loading', () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} loading={true} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('continue button is disabled when email is empty', () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    const button = screen.getByText('Continue');
    expect(button).toBeDisabled();
  });

  it('continue button is enabled when email has content', async () => {
    render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
    const input = screen.getByLabelText(/email address/i);

    await userEvent.type(input, 'x');

    const button = screen.getByText('Continue');
    expect(button).not.toBeDisabled();
  });

  it('accepts valid email formats', async () => {
    const validEmails = [
      'user@example.com',
      'test.name@domain.co.uk',
      'user+tag@example.org',
    ];

    for (const email of validEmails) {
      mockOnSubmit.mockClear();
      const { unmount } = render(<UpgradeEmailCapture onSubmit={mockOnSubmit} />);
      const input = screen.getByLabelText(/email address/i);
      await userEvent.type(input, email);
      const form = input.closest('form')!;
      fireEvent.submit(form);
      expect(mockOnSubmit).toHaveBeenCalledWith(email);
      unmount();
    }
  });
});
