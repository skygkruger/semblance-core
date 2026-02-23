// @vitest-environment jsdom
// Tests for VoiceOnboardingCard — renders real component with props.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceOnboardingCard } from '@semblance/desktop/components/VoiceOnboardingCard';

describe('VoiceOnboardingCard', () => {
  it('shows heading and download buttons when models not downloaded', () => {
    render(
      <VoiceOnboardingCard
        whisperDownloaded={false}
        piperDownloaded={false}
        whisperSizeMb={150}
        piperSizeMb={80}
        onDownloadWhisper={() => {}}
        onDownloadPiper={() => {}}
        downloading={false}
      />,
    );
    expect(screen.getByText('Voice Models Needed')).toBeInTheDocument();
  });

  it('returns null when both models are already downloaded', () => {
    const { container } = render(
      <VoiceOnboardingCard
        whisperDownloaded={true}
        piperDownloaded={true}
        whisperSizeMb={150}
        piperSizeMb={80}
        onDownloadWhisper={() => {}}
        onDownloadPiper={() => {}}
        downloading={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});
