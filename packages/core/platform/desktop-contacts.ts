// Desktop Contacts Adapter — Platform-specific contacts integration.
//
// macOS: Uses Tauri plugin for CNContactStore (native Contacts.framework).
// Windows/Linux: Returns empty gracefully — no native contacts API available.
//
// For dev/test: createConfigurableContactsAdapter() provides controllable behavior.

import type { ContactsAdapter, DeviceContact } from './types.js';

/**
 * Create a configurable contacts adapter for development and testing.
 * Accepts optional seed contacts and simulates permission flows.
 */
export function createConfigurableContactsAdapter(options?: {
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
    return createConfigurableContactsAdapter({ contacts: [], permission: 'denied' });
  }

  // macOS: No Tauri contacts plugin available yet — returns empty set with denied permission.
  // When a contacts plugin ships, wire it here (same lazy-import pattern as desktop-clipboard.ts).
  return createConfigurableContactsAdapter({ contacts: [], permission: 'denied' });
}
