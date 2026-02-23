// Time-Saved Estimation Defaults
//
// Configurable defaults for estimating time saved by each action type.
// These are initial estimates that can be tuned later via a config table.
// Values are in seconds.
//
// Time-saved estimation guidance (from build prompt):
// - Email archive/categorize: 15 seconds per email
// - Email draft: 120 seconds per draft
// - Email send (routine): 60 seconds
// - Calendar conflict resolution: 180 seconds
// - Meeting prep document surfacing: 300 seconds
// - Subscription flag: 600 seconds (research + decision time)

import type { ActionType } from '@semblance/core';

/**
 * Default time-saved estimates per action type, in seconds.
 * These are configurable defaults, not hardcoded per-callsite.
 * Override by passing estimatedTimeSavedSeconds directly to audit trail append.
 */
export const TIME_SAVED_DEFAULTS: Record<ActionType, number> = {
  'email.fetch': 0,              // Fetching is infrastructure, no direct time saved
  'email.send': 60,              // Routine email send
  'email.draft': 120,            // Draft composition
  'email.archive': 10,           // Archive per batch
  'email.move': 10,              // Move per batch
  'email.markRead': 5,           // Mark read per batch
  'calendar.fetch': 0,           // Fetching is infrastructure
  'calendar.create': 180,        // Calendar event creation + conflict check
  'calendar.update': 180,        // Calendar event modification + conflict check
  'calendar.delete': 60,         // Calendar event deletion
  'finance.fetch_transactions': 0, // Fetching is infrastructure
  'health.fetch': 0,             // Fetching is infrastructure
  'web.search': 30,              // Faster than switching to browser, searching, reading results
  'web.fetch': 120,              // Avoids reading and manually summarizing article
  'reminder.create': 60,         // Avoids opening another app or setting a manual alarm
  'reminder.update': 15,         // Quick snooze/dismiss vs manual re-scheduling
  'reminder.list': 0,            // Read-only, no time saved
  'reminder.delete': 10,         // Quick cleanup
  'service.api_call': 0,         // Generic — no default estimate
  'model.download': 0,           // Infrastructure — model management
  'model.download_cancel': 0,    // Infrastructure — model management
  'model.verify': 0,             // Infrastructure — model management
  'contacts.import': 0,          // Infrastructure — contact sync
  'contacts.list': 0,            // Read-only
  'contacts.get': 0,             // Read-only
  'contacts.search': 0,          // Read-only
  'messaging.draft': 60,         // Composing a text message
  'messaging.send': 60,          // Sending a text message
  'messaging.read': 0,           // Reading messages is informational
  'clipboard.analyze': 0,        // Analysis is informational
  'clipboard.act': 30,           // Taking action on clipboard content
  'clipboard.web_action': 120,   // Web action (tracking, summarizing, etc.)
  'location.reminder_fire': 120, // Location-triggered reminder (saves remembering manually)
  'location.commute_alert': 300, // Commute departure alert (saves checking map + calendar)
  'location.weather_query': 30,  // Weather lookup (saves opening weather app)
  'voice.transcribe': 30,        // Voice transcription (saves typing on mobile)
  'voice.speak': 15,             // TTS response (hands-free information)
  'voice.conversation': 60,      // Full voice conversation (hands-free interaction)
  'cloud.auth': 5,               // OAuth setup
  'cloud.auth_status': 5,        // Auth status check
  'cloud.disconnect': 5,         // Disconnect/revoke
  'cloud.list_files': 15,        // List files (faster than browsing manually)
  'cloud.file_metadata': 5,      // File metadata lookup
  'cloud.download_file': 60,     // Download + index (saves manual download + read)
  'cloud.check_changed': 5,      // Change detection
};

/**
 * Granular time-saved estimates for specific sub-operations.
 * Used by action handlers when they know the specific operation type.
 */
export const TIME_SAVED_GRANULAR = {
  emailArchive: 15,              // Archive/categorize per email
  emailDraft: 120,               // Draft composition
  emailSendRoutine: 60,          // Routine email send
  calendarConflictResolution: 180, // Conflict resolution
  meetingPrepSurfacing: 300,     // Document surfacing for meeting prep
  subscriptionFlag: 600,         // Research + decision time for subscription flagging
} as const;

/**
 * Look up the default time-saved estimate for an action type.
 */
export function getDefaultTimeSaved(action: ActionType): number {
  return TIME_SAVED_DEFAULTS[action] ?? 0;
}
