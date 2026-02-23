// @vitest-environment jsdom
// Tests for VoiceButton — renders real component with props.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceButton } from '@semblance/desktop/components/VoiceButton';

describe('VoiceButton', () => {
  it('renders with correct aria-label for idle state', () => {
    render(<VoiceButton state="idle" onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /start voice input/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<VoiceButton state="idle" onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
