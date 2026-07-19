// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LicenseProvider, LicenseCapabilityGate } from '../../packages/desktop/src/contexts/LicenseContext';

vi.mock('../../packages/desktop/src/ipc/commands', () => ({
  getLicenseStatus: vi.fn().mockResolvedValue({
    tier: 'free',
    isFoundingMember: false,
    foundingSeat: null,
    licenseKey: null,
  }),
  activateLicenseKey: vi.fn(),
  importFoundingReservation: vi.fn(),
  requestLicensePortalSession: vi.fn(),
}));

vi.mock('../../release/release-manifest.json', () => ({
  default: {
    commerce: { newSalesEnabled: true },
  },
}));

function renderGate(feature: 'witness-attestation') {
  return render(
    <MemoryRouter>
      <LicenseProvider>
        <LicenseCapabilityGate feature={feature}>
          <div data-testid="premium-content">Premium body</div>
        </LicenseCapabilityGate>
      </LicenseProvider>
    </MemoryRouter>,
  );
}

describe('LicenseCapabilityGate', () => {
  it('shows CapabilityPreview for unpaid users at intent boundary', () => {
    renderGate('witness-attestation');
    expect(screen.getByTestId('capability-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('premium-content')).not.toBeInTheDocument();
  });
});
