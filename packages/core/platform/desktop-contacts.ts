// Desktop Contacts Adapter — Platform-specific contacts integration.
//
// macOS: Uses Tauri plugin for CNContactStore (native Contacts.framework).
// Windows/Linux: Returns empty gracefully — no native contacts API available.
//
// For dev/test: createMockContactsAdapter() provides a controllable mock.

import type { ContactsAdapter, DeviceContact } from './types.js';

/**
 * Create a mock contacts adapter for development and testing.
 * Accepts optional seed contacts and simulates permission flows.
 */
export function createMockContactsAdapter(options?: {
  contacts?: DeviceContact[];
  permission?: 'authorized' | 'denied' | 'undetermined';
}): ContactsAdapter {
  let permission = options?.permission ?? 'authorized';
  const contacts = options?.contacts ?? [];
  const listeners: Array<() => void> = [];

  return {
    async checkPermission() {
      return permission;
    },

    async requestPermission() {
      if (permission === 'undetermined') {
        permission = 'authorized';
      }
      return permission as 'authorized' | 'denied';
    },

    async getAllContacts() {
      if (permission !== 'authorized') return [];
      return contacts;
    },

    onContactsChanged(listener: () => void) {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

/**
 * Create the desktop contacts adapter.
 * On macOS, wraps CNContactStore via Tauri plugin.
 * On Windows/Linux, returns empty results gracefully.
 */
export function createDesktopContactsAdapter(platform: string): ContactsAdapter {
  // Windows and Linux: no native contacts API
  if (platform !== 'darwin') {
    return createMockContactsAdapter({ contacts: [], permission: 'denied' });
  }

  // macOS: Tauri plugin integration point
  // TODO(Sprint 4): Wire up @tauri-apps/plugin-contacts when available
  // For now, returns empty — the Tauri plugin will be wired in the desktop app init
  return createMockContactsAdapter({ contacts: [], permission: 'undetermined' });
}
