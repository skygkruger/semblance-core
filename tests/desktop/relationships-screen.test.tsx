// @vitest-environment jsdom
// Tests for RelationshipsScreen — renders real component with mock data.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RelationshipsScreen } from '@semblance/desktop/screens/RelationshipsScreen';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

const mockContacts = [
  { id: 'c1', displayName: 'Alice Smith', organization: 'Acme Corp', relationshipType: 'colleague', lastContactDate: new Date().toISOString(), interactionCount: 12, birthday: '1990-03-15', emails: ['alice@acme.com'] },
  { id: 'c2', displayName: 'Bob Jones', organization: 'Wayne Inc', relationshipType: 'client', lastContactDate: null, interactionCount: 3, birthday: '1985-07-22', emails: ['bob@wayne.com'] },
];

const mockStats = {
  totalContacts: 2,
  byRelationshipType: { colleague: 1, client: 1 },
  withBirthday: 2,
  withOrganization: 2,
};

function mockRelationshipsInvoke() {
  invoke.mockImplementation(async (_cmd: string, ...rest: unknown[]) => {
    const args = rest[0] as Record<string, unknown> | undefined;
    const req = args?.request as { method: string } | undefined;
    if (req?.method === 'contacts:list') return { contacts: mockContacts };
    if (req?.method === 'contacts:getStats') return mockStats;
    if (req?.method === 'contacts:getUpcomingBirthdays') return { birthdays: [] };
    if (req?.method === 'contacts:search') return { contacts: mockContacts };
    if (req?.method === 'contacts:get') return { ...mockContacts[0], givenName: 'Alice', familyName: 'Smith', phones: [], jobTitle: 'Engineer', communicationFrequency: null, tags: [] };
    return null;
  });
}

describe('RelationshipsScreen', () => {
  beforeEach(() => {
    clearInvokeMocks();
    mockRelationshipsInvoke();
  });

  it('renders contact names after loading', async () => {
    render(<RelationshipsScreen />);
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('shows organization names', async () => {
    render(<RelationshipsScreen />);
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
  });

  it('shows relationship badges', async () => {
    render(<RelationshipsScreen />);
    expect(await screen.findByText('colleague')).toBeInTheDocument();
    expect(screen.getByText('client')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    render(<RelationshipsScreen />);
    await screen.findByText('Alice Smith');
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders sort and filter controls', async () => {
    render(<RelationshipsScreen />);
    await screen.findByText('Alice Smith');
    // Sort and filter dropdowns should be present
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });
});
