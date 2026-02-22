// Desktop Clipboard Adapter — Platform-specific clipboard integration.
//
// Uses polling (every 2s) to detect clipboard changes by comparing content hash.
// In production, wraps the Tauri clipboard plugin.
//
// For dev/test: createMockClipboardAdapter() provides a controllable mock
// with simulateCopy() for triggering change callbacks in tests.
//
// CRITICAL: No network imports. All clipboard data stays local.

import type { ClipboardAdapter, ClipboardContent } from './clipboard-types.js';

/**
 * Create a mock clipboard adapter for development and testing.
 * Includes simulateCopy() to trigger change callbacks for testing.
 */
export function createMockClipboardAdapter(options?: {
  initialText?: string;
  permissionGranted?: boolean;
}): ClipboardAdapter & { simulateCopy(text: string): void } {
  let currentText = options?.initialText ?? null;
  let permissionGranted = options?.permissionGranted ?? true;
  const listeners: Array<(content: ClipboardContent) => void> = [];

  function makeContent(text: string | null): ClipboardContent {
    return {
      text,
      hasText: text !== null && text.length > 0,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    simulateCopy(text: string) {
      currentText = text;
      const content = makeContent(text);
      for (const listener of listeners) {
        listener(content);
      }
    },

    async hasPermission() {
      return permissionGranted;
    },

    async requestPermission() {
      permissionGranted = true;
      return true;
    },

    async readClipboard(): Promise<ClipboardContent> {
      if (!permissionGranted) {
        return { text: null, hasText: false, timestamp: new Date().toISOString() };
      }
      return makeContent(currentText);
    },

    async writeClipboard(text: string) {
      currentText = text;
    },

    onClipboardChanged(callback: (content: ClipboardContent) => void): () => void {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}

/**
 * Create the desktop clipboard adapter.
 *
 * The real implementation will use @tauri-apps/plugin-clipboard-manager with
 * 2s hash-based polling for change detection. That wiring happens in the
 * desktop app init layer (same pattern as desktop-contacts.ts).
 *
 * Until then, delegates to the mock adapter.
 */
export function createDesktopClipboardAdapter(): ClipboardAdapter {
  // TODO(Sprint 4): Wire up @tauri-apps/plugin-clipboard-manager in desktop app init
  return createMockClipboardAdapter();
}
