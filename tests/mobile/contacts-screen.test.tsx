// @vitest-environment jsdom
// Tests for mobile ContactsScreen — renders with mocked react-native, tests logic helpers.

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ContactsScreen, getInitials } from '@semblance/mobile/screens/ContactsScreen';

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
