// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ImportDigitalLifeScreen,
  DEFAULT_IMPORT_SOURCES,
} from '@semblance/mobile/screens/ImportDigitalLifeScreen';

describe('ImportDigitalLifeScreen (mobile)', () => {
  it('screen renders import source cards with correct structure', () => {
    const { container } = render(<ImportDigitalLifeScreen isPremium={true} />);

    // Verify the component renders content
    expect(container.innerHTML.length).toBeGreaterThan(0);

    // Verify all default sources are rendered
    for (const source of DEFAULT_IMPORT_SOURCES) {
      expect(screen.getByText(source.name)).toBeInTheDocument();
    }
  });
});
