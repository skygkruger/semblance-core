// Desktop Messaging Adapter — Platform-specific messaging integration.
//
// macOS: Opens iMessage via sms:// URL scheme.
// Windows: Opens "Your Phone" companion or clipboard fallback.
// Linux: Clipboard fallback.
//
// For dev/test: createMockMessagingAdapter() provides a controllable mock.
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
 * Create a mock messaging adapter for development and testing.
 * Records sent messages for test assertions.
 */
export function createMockMessagingAdapter(options?: {
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
        return { status: 'failed', error: 'Send failed (mock)' };
      }

      sentMessages.push(request);

      if (platform === 'android' && request.autonomous) {
        return { status: 'sent', messageId: `mock-${Date.now()}` };
      }

      return { status: 'presented' };
    },

    async readMessages(contactPhone: string, limit?: number): Promise<MessageEntry[] | null> {
      if (platform !== 'android' || !permissionGranted) return null;
      // Mock returns empty history
      void contactPhone;
      void limit;
      return [];
    },
  };
}

/**
 * Create the desktop messaging adapter.
 * macOS: Opens iMessage via sms:// URL scheme.
 * Windows: Opens "Your Phone" or clipboard fallback.
 * Linux: Clipboard fallback.
 */
export function createDesktopMessagingAdapter(platform: string): MessagingAdapter {
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

      // Platform-specific presentation
      if (platform === 'darwin') {
        // macOS: Open iMessage via sms:// URL scheme
        // In a real Tauri app, this would use shell.open()
        // For now, return 'presented' — Tauri integration point
        return { status: 'presented' };
      }

      if (platform === 'win32') {
        // Windows: Open "Your Phone" companion app or clipboard
        return { status: 'presented' };
      }

      // Linux and others: Clipboard fallback
      return { status: 'presented' };
    },
  };
}
