// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ImportDigitalLifeView,
  DEFAULT_IMPORT_SOURCES,
} from '@semblance/desktop/components/ImportDigitalLifeView';

describe('ImportDigitalLifeView', () => {
  it('renders all import source cards with correct labels', () => {
    render(<ImportDigitalLifeView isPremium={true} />);

    expect(screen.getByText('Browser History')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Photos Metadata')).toBeInTheDocument();
    expect(screen.getByText('Messaging')).toBeInTheDocument();
  });

  it('photos card contains "never stored" consent text', () => {
    render(<ImportDigitalLifeView isPremium={true} />);

    const photosConsent = DEFAULT_IMPORT_SOURCES.find(s => s.id === 'photos_metadata')!.consentText;
    expect(photosConsent).toContain('never stored');
    expect(screen.getByText(photosConsent)).toBeInTheDocument();
  });

  it('non-premium cards show "Available with Digital Representative" message', () => {
    render(<ImportDigitalLifeView isPremium={false} />);

    const gateTexts = screen.getAllByText('Available with Digital Representative');
    // One per source card
    expect(gateTexts.length).toBe(DEFAULT_IMPORT_SOURCES.length);
  });

  it('progress state shows phase label and item count', () => {
    render(
      <ImportDigitalLifeView
        isPremium={true}
        progress={{
          phase: 'Indexing browser history',
          itemsProcessed: 42,
          totalItems: 100,
          isActive: true,
        }}
      />,
    );

    expect(screen.getByText('Indexing browser history')).toBeInTheDocument();
    expect(screen.getByText('42 / 100 items')).toBeInTheDocument();
  });
});
