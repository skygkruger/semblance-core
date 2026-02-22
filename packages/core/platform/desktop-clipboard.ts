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
 * Polls every 2s comparing content hash. Uses Tauri clipboard plugin.
 */
export function createDesktopClipboardAdapter(): ClipboardAdapter {
  let lastContentHash = '';
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  const listeners: Array<(content: ClipboardContent) => void> = [];

  function hashContent(text: string | null): string {
    if (!text) return '';
    // Simple hash for change detection — not cryptographic
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return String(hash);
  }

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      // In production, this reads from Tauri clipboard plugin
      // For now, this is a stub — actual Tauri integration will be wired later
    }, 2000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  return {
    async hasPermission() {
      return true; // Desktop generally has clipboard access
    },

    async requestPermission() {
      return true;
    },

    async readClipboard(): Promise<ClipboardContent> {
      // Tauri clipboard plugin integration point
      return { text: null, hasText: false, timestamp: new Date().toISOString() };
    },

    async writeClipboard(_text: string) {
      // Tauri clipboard plugin integration point
    },

    onClipboardChanged(callback: (content: ClipboardContent) => void): () => void {
      listeners.push(callback);
      if (listeners.length === 1) startPolling();

      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
        if (listeners.length === 0) stopPolling();
      };
    },
  };
}
