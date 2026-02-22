// Virtual Meeting Detector — Identifies virtual/online meetings.
//
// Detects Zoom, Teams, Google Meet, Webex, and keyword-based virtual meetings.
// Used by CommuteAnalyzer to skip virtual meetings (no travel needed).
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { IndexedCalendarEvent } from '../knowledge/calendar-indexer.js';

/**
 * URL patterns and keywords that indicate a virtual meeting.
 */
const VIRTUAL_URL_PATTERNS = [
  /zoom\.us/i,
  /teams\.microsoft\.com/i,
  /meet\.google\.com/i,
  /webex\.com/i,
];

const VIRTUAL_KEYWORDS = [
  /\bvirtual\b/i,
  /\bonline\b/i,
  /\bremote\b/i,
  /\bvideo\s*call\b/i,
  /\bteleconference\b/i,
];

/**
 * Determine if a calendar event is a virtual meeting.
 * Checks the event location and description for virtual meeting indicators.
 */
export function isVirtualMeeting(event: IndexedCalendarEvent): boolean {
  const textToCheck = `${event.location} ${event.description}`;

  // Check for virtual meeting URL patterns
  for (const pattern of VIRTUAL_URL_PATTERNS) {
    if (pattern.test(textToCheck)) return true;
  }

  // Check for virtual keywords
  for (const pattern of VIRTUAL_KEYWORDS) {
    if (pattern.test(textToCheck)) return true;
  }

  return false;
}
