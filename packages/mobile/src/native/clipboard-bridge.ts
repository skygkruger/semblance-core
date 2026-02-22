// Mobile Clipboard Bridge — React Native adapter for clipboard access.
//
// iOS: Triggered on app foreground or explicit user action (no continuous polling).
// Android: Poll on app foreground.
//
// CRITICAL: No network imports. All clipboard data stays local.

import type { ClipboardAdapter, ClipboardContent } from '@semblance/core/platform/clipboard-types';

/**
 * Create the React Native clipboard adapter.
 * iOS: reads on foreground. Android: polls on foreground.
 */
export function createMobileClipboardAdapter(): ClipboardAdapter {
  let RNClipboard: { getString(): Promise<string>; setString(content: string): void } | null = null;

  function getClipboard() {
    if (!RNClipboard) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      RNClipboard = require('@react-native-clipboard/clipboard').default;
    }
    return RNClipboard!;
  }

  const listeners: Array<(content: ClipboardContent) => void> = [];

  return {
    async hasPermission() {
      return true; // React Native clipboard doesn't require explicit permission
    },

    async requestPermission() {
      return true;
    },

    async readClipboard(): Promise<ClipboardContent> {
      try {
        const text = await getClipboard().getString();
        return {
          text: text || null,
          hasText: !!text,
          timestamp: new Date().toISOString(),
        };
      } catch {
        return { text: null, hasText: false, timestamp: new Date().toISOString() };
      }
    },

    async writeClipboard(text: string) {
      getClipboard().setString(text);
    },

    onClipboardChanged(callback: (content: ClipboardContent) => void): () => void {
      listeners.push(callback);
      // Actual implementation would hook into AppState changes for foreground detection
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}
