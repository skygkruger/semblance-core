// Desktop Messaging Adapter — Platform-specific messaging integration.
//
// macOS: Opens iMessage via sms:// URL scheme.
// Windows: Opens "Your Phone" companion or clipboard fallback.
// Linux: Clipboard fallback.
//
// For dev/test: createConfigurableMessagingAdapter() provides controllable behavior.
//
// CRITICAL: No network imports. Desktop messaging always presents to user.

import type {
  MessagingAdapter,
  MessagingCapabilities,
  MessageRequest,
  MessageResult,
  MessageEntry,
} from './messaging-types.js';

/**
 * Create a configurable messaging adapter for development and testing.
 * Records sent messages for test assertions.
 */
export function createConfigurableMessagingAdapter(options?: {
  platform?: 'ios' | 'android' | 'desktop';
  permissionGranted?: boolean;
  failOnSend?: boolean;
}): MessagingAdapter & { sentMessages: MessageRequest[] } {
  const platform = options?.platform ?? 'desktop';
  const permissionGranted = options?.permissionGranted ?? true;
  const failOnSend = options?.failOnSend ?? false;
  const sentMessages: MessageRequest[] = [];

  const capabilities: MessagingCapabilities = {
    canSendAutonomously: platform === 'android' && permissionGranted,
    canReadHistory: platform === 'android' && permissionGranted,
    requiresUserConfirmation: platform !== 'android' || !permissionGranted,
  };

  return {
    sentMessages,

    async isAvailable() {
      return permissionGranted;
    },

    getCapabilities() {
      return capabilities;
    },

    async sendMessage(request: MessageRequest): Promise<MessageResult> {
      if (!permissionGranted) {
        return { status: 'permission_denied', error: 'Messaging permission not granted' };
      }

      // Validate phone number (basic check)
      if (!request.phone || request.phone.replace(/[\s\-\(\)\.]/g, '').length < 7) {
        return { status: 'failed', error: 'Invalid phone number' };
      }

      if (failOnSend) {
        return { status: 'failed', error: 'Send failed (test mode)' };
      }

      sentMessages.push(request);

      if (platform === 'android' && request.autonomous) {
        return { status: 'sent', messageId: `dev-${Date.now()}` };
      }

      return { status: 'presented' };
    },

    async readMessages(contactPhone: string, limit?: number): Promise<MessageEntry[] | null> {
      if (platform !== 'android' || !permissionGranted) return null;
      // Configurable adapter returns empty history
      void contactPhone;
      void limit;
      return [];
    },
  };
}

/**
 * Dependencies injected by the desktop app at construction time.
 * Keeps packages/core/ free of platform-specific imports (@tauri-apps/*).
 */
export interface DesktopMessagingDeps {
  /** Open a URL scheme via the OS (e.g. sms://, ms-chat://). */
  openUrl?: (url: string) => Promise<void>;
  /** Write text to the system clipboard. */
  writeClipboard?: (text: string) => Promise<void>;
}

/**
 * Create the desktop messaging adapter.
 * macOS: Opens iMessage via sms:// URL scheme.
 * Windows: Opens "Your Phone" companion via ms-chat:// URL scheme.
 * Linux: Clipboard fallback.
 *
 * The caller provides `deps.openUrl` (from @tauri-apps/plugin-shell → shell.open)
 * and `deps.writeClipboard` (from @tauri-apps/plugin-clipboard-manager → writeText)
 * so that this module has zero platform-specific imports.
 */
export function createDesktopMessagingAdapter(
  platform: string,
  deps?: DesktopMessagingDeps,
): MessagingAdapter {
  return {
    async isAvailable() {
      // Desktop always has some form of messaging presentation
      return true;
    },

    getCapabilities(): MessagingCapabilities {
      return {
        canSendAutonomously: false,
        canReadHistory: false,
        requiresUserConfirmation: true,
      };
    },

    async sendMessage(request: MessageRequest): Promise<MessageResult> {
      // Validate phone number
      if (!request.phone || request.phone.replace(/[\s\-\(\)\.]/g, '').length < 7) {
        return { status: 'failed', error: 'Invalid phone number' };
      }

      const cleanPhone = request.phone.replace(/[\s\-\(\)\.]/g, '');

      if (platform === 'darwin') {
        // macOS: Open iMessage via sms:// URL scheme
        const smsUrl = `sms:${cleanPhone}&body=${encodeURIComponent(request.body)}`;
        if (deps?.openUrl) {
          try { await deps.openUrl(smsUrl); } catch { /* open failed */ }
        }
        return { status: 'presented' };
      }

      if (platform === 'win32') {
        // Windows: Open "Your Phone" companion app via ms-chat:// URL scheme
        const chatUrl = `ms-chat:?ContactNumber=${cleanPhone}&Message=${encodeURIComponent(request.body)}`;
        if (deps?.openUrl) {
          try { await deps.openUrl(chatUrl); } catch { /* open failed */ }
        } else if (deps?.writeClipboard) {
          try { await deps.writeClipboard(request.body); } catch { /* clipboard failed */ }
        }
        return { status: 'presented' };
      }

      // Linux and others: clipboard fallback
      if (deps?.writeClipboard) {
        try { await deps.writeClipboard(`To: ${request.phone}\n${request.body}`); } catch { /* clipboard failed */ }
      }
      return { status: 'presented' };
    },
  };
}
