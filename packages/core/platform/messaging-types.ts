// Messaging Types — Platform-agnostic messaging adapter interfaces.
//
// Provides SMS/text messaging capability across platforms:
// Desktop: Opens native messaging apps via URL scheme / clipboard fallback.
// iOS: Opens Messages app via Linking.openURL('sms:...')
// Android: Native SMS sending via content provider (with permission).
//
// CRITICAL: No network imports. All messaging is local device interaction.

/**
 * A request to send a text message.
 */
export interface MessageRequest {
  /** Recipient phone number (E.164 or local format) */
  phone: string;
  /** Message body text */
  body: string;
  /** Whether to send autonomously (only supported on Android) */
  autonomous?: boolean;
}

/**
 * Result of a message send attempt.
 */
export interface MessageResult {
  /** Status of the send attempt */
  status: 'sent' | 'presented' | 'failed' | 'permission_denied';
  /** Error message if status is 'failed' or 'permission_denied' */
  error?: string;
  /** Platform-specific message ID if available */
  messageId?: string;
}

/**
 * A single message entry from device message history.
 */
export interface MessageEntry {
  id: string;
  phone: string;
  body: string;
  timestamp: string;
  direction: 'incoming' | 'outgoing';
  read: boolean;
}

/**
 * Platform-specific messaging capabilities.
 */
export interface MessagingCapabilities {
  /** Whether the platform can send messages without user interaction */
  canSendAutonomously: boolean;
  /** Whether the platform can read message history */
  canReadHistory: boolean;
  /** Whether the platform requires the user to confirm each send */
  requiresUserConfirmation: boolean;
}

/**
 * Platform-agnostic messaging adapter.
 * Desktop: Opens native messaging app or clipboard fallback.
 * iOS: Opens Messages app via URL scheme.
 * Android: Native SMS with content provider.
 */
export interface MessagingAdapter {
  /** Check if messaging is available on this platform */
  isAvailable(): Promise<boolean>;

  /** Get platform-specific messaging capabilities */
  getCapabilities(): MessagingCapabilities;

  /** Send a text message */
  sendMessage(request: MessageRequest): Promise<MessageResult>;

  /** Read message history for a contact (optional — not all platforms support this) */
  readMessages?(contactPhone: string, limit?: number): Promise<MessageEntry[] | null>;
}
