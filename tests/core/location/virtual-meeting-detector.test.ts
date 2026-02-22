// Virtual Meeting Detector Tests — Virtual vs. physical meeting detection.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect } from 'vitest';
import { isVirtualMeeting } from '../../../packages/core/location/virtual-meeting-detector';
import type { IndexedCalendarEvent } from '../../../packages/core/knowledge/calendar-indexer';

function makeEvent(overrides: Partial<IndexedCalendarEvent> = {}): IndexedCalendarEvent {
  return {
    id: 'test-id',
    uid: 'test-uid',
    calendarId: 'cal-1',
    title: 'Meeting',
    description: '',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 3600000).toISOString(),
    isAllDay: false,
    location: '',
    attendees: '[]',
    organizer: 'test@example.com',
    status: 'confirmed',
    recurrenceRule: null,
    accountId: 'acc-1',
    indexedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('isVirtualMeeting', () => {
  it('Zoom URL returns true', () => {
    const event = makeEvent({ location: 'https://zoom.us/j/123456789' });
    expect(isVirtualMeeting(event)).toBe(true);
  });

  it('Google Meet URL returns true', () => {
    const event = makeEvent({ location: 'https://meet.google.com/abc-defg-hij' });
    expect(isVirtualMeeting(event)).toBe(true);
  });

  it('"123 Main St, Portland" returns false', () => {
    const event = makeEvent({ location: '123 Main St, Portland, OR' });
    expect(isVirtualMeeting(event)).toBe(false);
  });

  it('"Conference Room B" returns false', () => {
    const event = makeEvent({ location: 'Conference Room B' });
    expect(isVirtualMeeting(event)).toBe(false);
  });
});
