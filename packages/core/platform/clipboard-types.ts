// Clipboard Types — Platform-agnostic clipboard adapter interfaces.
//
// Provides clipboard monitoring and interaction across platforms:
// Desktop: Polls clipboard every 2s, uses Tauri clipboard plugin.
// iOS: Triggered on app foreground or explicit user action (no continuous polling).
// Android: Poll on app foreground.
//
// CRITICAL: No network imports. All clipboard data stays local.

/**
 * Content read from the clipboard.
 */
export interface ClipboardContent {
  /** The text content, or null if clipboard is empty or not text */
  text: string | null;
  /** Whether the clipboard contains text */
  hasText: boolean;
  /** ISO timestamp when the content was read */
  timestamp: string;
  /** Optional source identifier (e.g., app name) */
  source?: string;
}

/**
 * Platform-agnostic clipboard adapter.
 * Desktop: Tauri clipboard plugin with polling.
 * Mobile: Platform-specific clipboard APIs.
 */
export interface ClipboardAdapter {
  /** Check if clipboard permission has been granted */
  hasPermission(): Promise<boolean>;

  /** Request clipboard permission (some platforms require explicit permission) */
  requestPermission(): Promise<boolean>;

  /** Read the current clipboard content */
  readClipboard(): Promise<ClipboardContent>;

  /** Write text to the clipboard */
  writeClipboard(text: string): Promise<void>;

  /**
   * Register a listener for clipboard content changes.
   * Returns an unsubscribe function.
   */
  onClipboardChanged(callback: (content: ClipboardContent) => void): () => void;
}
