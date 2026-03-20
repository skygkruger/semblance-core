// @vitest-environment jsdom
// Tests for mobile ContactsScreen — renders with mocked react-native, tests logic helpers.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ContactsScreen, getInitials } from '@semblance/mobile/screens/ContactsScreen';

// Mock useSemblance — SemblanceProvider requires native mobile runtime
// which is not available in jsdom. Provide minimal mock values.
// Mock useSemblance — SemblanceProvider requires native mobile runtime
// which is not available in jsdom. Provide minimal mock values.
// ContactsScreen imports from '../runtime/SemblanceProvider.js' which
// resolves through @semblance/mobile alias + preferTsOverJs plugin.
vi.mock('@semblance/mobile/runtime/SemblanceProvider', () => ({
  useSemblance: () => ({
    ready: true,
    searchKnowledge: vi.fn(async () => []),
    sendMessage: vi.fn(async () => ({ role: 'assistant', content: '' })),
  }),
  SemblanceProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockNavigation = {
  navigate: () => {},
  goBack: () => {},
  setOptions: () => {},
} as any;

describe('ContactsScreen (mobile)', () => {
  it('getInitials extracts initials from two-word name', () => {
    expect(getInitials('Alice Smith')).toBe('AS');
  });

  it('getInitials handles single name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('getInitials handles three-word name (takes first two)', () => {
    expect(getInitials('Alice Bob Carter')).toBe('AB');
  });

  it('renders search placeholder', () => {
    render(<ContactsScreen navigation={mockNavigation} />);
    expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument();
  });

  it('renders the component without crashing', () => {
    const { container } = render(<ContactsScreen navigation={mockNavigation} />);
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});
