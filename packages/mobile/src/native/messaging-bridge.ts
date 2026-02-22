// Mobile Messaging Bridge — React Native adapter for SMS/text messaging.
//
// iOS: Opens Messages app via Linking.openURL('sms:...')
//   - Always returns 'presented' — iOS does not allow autonomous sending.
//   - Cannot read message history.
//
// Android: Uses native SMS module (lazy-imported).
//   - Can send autonomously with SEND_SMS permission.
//   - Can read message history via content provider with READ_SMS permission.
//
// CRITICAL: No network imports. All messaging is local device interaction.

import type {
  MessagingAdapter,
  MessagingCapabilities,
  MessageRequest,
  MessageResult,
  MessageEntry,
} from '@semblance/core/platform/messaging-types';

/**
 * Shape of the native SMS module on Android.
 * Defined here to avoid importing the library at type level.
 */
interface NativeSmsModule {
  sendSms(phone: string, body: string): Promise<{ success: boolean; messageId?: string }>;
  readMessages(phone: string, limit: number): Promise<Array<{
    id: string;
    address: string;
    body: string;
    date: number;
    type: number; // 1 = inbox, 2 = sent
    read: number;
  }>>;
  checkPermission(): Promise<'authorized' | 'denied' | 'undetermined'>;
  requestPermission(): Promise<'authorized' | 'denied'>;
}

/**
 * Create the React Native messaging adapter.
 * iOS: URL scheme presentation. Android: native SMS module.
 */
export function createMobileMessagingAdapter(platform: 'ios' | 'android'): MessagingAdapter {
  let nativeSms: NativeSmsModule | null = null;
  let Linking: typeof import('react-native').Linking | null = null;

  function getLinking() {
    if (!Linking) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Linking = require('react-native').Linking;
    }
    return Linking!;
  }

  function getNativeSms(): NativeSmsModule | null {
    if (platform !== 'android') return null;
    if (!nativeSms) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        nativeSms = require('react-native-sms-module').default;
      } catch {
        return null;
      }
    }
    return nativeSms;
  }

  if (platform === 'ios') {
    return {
      async isAvailable() {
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
        if (!request.phone || request.phone.replace(/[\s\-\(\)\.]/g, '').length < 7) {
          return { status: 'failed', error: 'Invalid phone number' };
        }

        try {
          const encodedBody = encodeURIComponent(request.body);
          await getLinking().openURL(`sms:${request.phone}&body=${encodedBody}`);
          return { status: 'presented' };
        } catch {
          return { status: 'failed', error: 'Failed to open Messages app' };
        }
      },
    };
  }

  // Android adapter
  return {
    async isAvailable() {
      const sms = getNativeSms();
      if (!sms) return false;
      const permission = await sms.checkPermission();
      return permission === 'authorized';
    },

    getCapabilities(): MessagingCapabilities {
      const sms = getNativeSms();
      if (!sms) {
        return {
          canSendAutonomously: false,
          canReadHistory: false,
          requiresUserConfirmation: true,
        };
      }
      return {
        canSendAutonomously: true,
        canReadHistory: true,
        requiresUserConfirmation: false,
      };
    },

    async sendMessage(request: MessageRequest): Promise<MessageResult> {
      if (!request.phone || request.phone.replace(/[\s\-\(\)\.]/g, '').length < 7) {
        return { status: 'failed', error: 'Invalid phone number' };
      }

      const sms = getNativeSms();
      if (!sms) {
        // Fallback to Linking
        try {
          const encodedBody = encodeURIComponent(request.body);
          await getLinking().openURL(`sms:${request.phone}?body=${encodedBody}`);
          return { status: 'presented' };
        } catch {
          return { status: 'failed', error: 'Failed to open messaging app' };
        }
      }

      if (request.autonomous) {
        try {
          const result = await sms.sendSms(request.phone, request.body);
          if (result.success) {
            return { status: 'sent', messageId: result.messageId };
          }
          return { status: 'failed', error: 'SMS send failed' };
        } catch {
          return { status: 'failed', error: 'SMS send failed' };
        }
      }

      // Non-autonomous: open SMS app
      try {
        const encodedBody = encodeURIComponent(request.body);
        await getLinking().openURL(`sms:${request.phone}?body=${encodedBody}`);
        return { status: 'presented' };
      } catch {
        return { status: 'failed', error: 'Failed to open messaging app' };
      }
    },

    async readMessages(contactPhone: string, limit?: number): Promise<MessageEntry[] | null> {
      const sms = getNativeSms();
      if (!sms) return null;

      try {
        const messages = await sms.readMessages(contactPhone, limit ?? 50);
        return messages.map(m => ({
          id: m.id,
          phone: m.address,
          body: m.body,
          timestamp: new Date(m.date).toISOString(),
          direction: m.type === 1 ? 'incoming' as const : 'outgoing' as const,
          read: m.read === 1,
        }));
      } catch {
        return null;
      }
    },
  };
}
