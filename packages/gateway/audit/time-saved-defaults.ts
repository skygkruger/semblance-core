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
  'service.api_call': 0,         // Generic — no default estimate
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
