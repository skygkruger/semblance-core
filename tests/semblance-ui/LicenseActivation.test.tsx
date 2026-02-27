// @vitest-environment jsdom
/**
 * LicenseActivation component tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LicenseActivation } from '@semblance/ui';

describe('LicenseActivation', () => {
  it('submits key to onActivate', async () => {
    const onActivate = vi.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LicenseActivation onActivate={onActivate} />);

    const input = screen.getByPlaceholderText('sem_...');
    await user.type(input, 'sem_test.key.value');
    await user.click(screen.getByText('Activate'));

    expect(onActivate).toHaveBeenCalledWith('sem_test.key.value');
  });

  it('shows success on valid key', async () => {
    const onActivate = vi.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(<LicenseActivation onActivate={onActivate} />);

    const input = screen.getByPlaceholderText('sem_...');
    await user.type(input, 'sem_valid.key.here');
    await user.click(screen.getByText('Activate'));

    await waitFor(() => {
      expect(screen.getByText('License activated successfully')).toBeInTheDocument();
    });
  });

  it('shows error on invalid key', async () => {
    const onActivate = vi.fn().mockResolvedValue({ success: false, error: 'Bad key' });
    const user = userEvent.setup();

    render(<LicenseActivation onActivate={onActivate} />);

    const input = screen.getByPlaceholderText('sem_...');
    await user.type(input, 'sem_bad.key.here');
    await user.click(screen.getByText('Activate'));

    await waitFor(() => {
      expect(screen.getByText('Bad key')).toBeInTheDocument();
    });
  });

  it('disables button during validation', async () => {
    // Never-resolving promise to simulate loading
    const onActivate = vi.fn().mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();

    render(<LicenseActivation onActivate={onActivate} />);

    const input = screen.getByPlaceholderText('sem_...');
    await user.type(input, 'sem_loading.key.here');
    await user.click(screen.getByText('Activate'));

    await waitFor(() => {
      expect(screen.getByText('Activating...')).toBeInTheDocument();
    });
  });

  it('shows active state when alreadyActive is true', () => {
    const onActivate = vi.fn().mockResolvedValue({ success: true });

    render(<LicenseActivation onActivate={onActivate} alreadyActive />);

    expect(screen.getByText('License active')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('sem_...')).not.toBeInTheDocument();
  });
});
