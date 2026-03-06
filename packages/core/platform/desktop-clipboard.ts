// Desktop Clipboard Adapter — Platform-specific clipboard integration.
//
// Uses polling (every 2s) to detect clipboard changes by comparing content hash.
// In production, wraps the Tauri clipboard plugin.
//
// For dev/test: createConfigurableClipboardAdapter() provides controllable behavior
// with simulateCopy() for triggering change callbacks in tests.
//
// CRITICAL: No network imports. All clipboard data stays local.

import type { ClipboardAdapter, ClipboardContent } from './clipboard-types.js';

/**
 * Create a configurable clipboard adapter for development and testing.
 * Includes simulateCopy() to trigger change callbacks for testing.
 */
export function createConfigurableClipboardAdapter(options?: {
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
 * Uses @tauri-apps/plugin-clipboard-manager with 2s hash-based polling for change
 * detection. Falls back to no-op if the Tauri plugin is unavailable (dev mode).
 */
export function createDesktopClipboardAdapter(): ClipboardAdapter {
  let lastHash = '';
  const listeners: Array<(content: ClipboardContent) => void> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function getTauriClipboard(): Promise<{ readText(): Promise<string | null>; writeText(text: string): Promise<void> } | null> {
    try {
      // Dynamic import — only available in Tauri desktop environment.
      // @ts-ignore — module only exists at runtime in Tauri context
      return await import('@tauri-apps/plugin-clipboard-manager') as { readText(): Promise<string | null>; writeText(text: string): Promise<void> };
    } catch {
      return null;
    }
  }

  function simpleHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return String(h);
  }

  async function pollClipboard() {
    const clip = await getTauriClipboard();
    if (!clip) return;
    try {
      const text = await clip.readText();
      const hash = simpleHash(text ?? '');
      if (hash !== lastHash && text) {
        lastHash = hash;
        const content: ClipboardContent = { text, hasText: true, timestamp: new Date().toISOString() };
        for (const listener of listeners) listener(content);
      }
    } catch {
      // Clipboard read failed — ignore
    }
  }

  return {
    async hasPermission() { return true; },
    async requestPermission() { return true; },

    async readClipboard(): Promise<ClipboardContent> {
      const clip = await getTauriClipboard();
      if (!clip) return { text: null, hasText: false, timestamp: new Date().toISOString() };
      try {
        const text = await clip.readText();
        return { text: text ?? null, hasText: !!text, timestamp: new Date().toISOString() };
      } catch {
        return { text: null, hasText: false, timestamp: new Date().toISOString() };
      }
    },

    async writeClipboard(text: string) {
      const clip = await getTauriClipboard();
      if (clip) await clip.writeText(text);
    },

    onClipboardChanged(callback: (content: ClipboardContent) => void): () => void {
      listeners.push(callback);
      if (!pollTimer) pollTimer = setInterval(pollClipboard, 2000);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
        if (listeners.length === 0 && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };
    },
  };
}
