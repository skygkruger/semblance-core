// Calendar Types — Shared definitions for CalDAV adapter.

import { z } from 'zod';

export const CalendarAttendee = z.object({
  name: z.string(),
  email: z.string(),
  status: z.enum(['accepted', 'declined', 'tentative', 'needs-action']),
});
export type CalendarAttendee = z.infer<typeof CalendarAttendee>;

export const CalendarOrganizer = z.object({
  name: z.string(),
  email: z.string(),
});
export type CalendarOrganizer = z.infer<typeof CalendarOrganizer>;

export const CalendarReminder = z.object({
  minutesBefore: z.number(),
});
export type CalendarReminder = z.infer<typeof CalendarReminder>;

export const CalendarEvent = z.object({
  id: z.string(),
  calendarId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().optional(),
  attendees: z.array(CalendarAttendee),
  organizer: CalendarOrganizer,
  recurrence: z.string().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  reminders: z.array(CalendarReminder),
  lastModified: z.string(),
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

export const CalendarInfo = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  color: z.string().optional(),
  readOnly: z.boolean(),
});
export type CalendarInfo = z.infer<typeof CalendarInfo>;

export const CalendarFetchParams = z.object({
  startDate: z.string(),
  endDate: z.string(),
  calendarId: z.string().optional(),
});
export type CalendarFetchParams = z.infer<typeof CalendarFetchParams>;

export const CalendarCreateParams = z.object({
  title: z.string(),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().optional(),
  attendees: z.array(z.object({ name: z.string(), email: z.string() })).optional(),
  calendarId: z.string().optional(),
});
export type CalendarCreateParams = z.infer<typeof CalendarCreateParams>;

export const CalendarUpdateParams = z.object({
  eventId: z.string(),
  updates: CalendarCreateParams.partial(),
});
export type CalendarUpdateParams = z.infer<typeof CalendarUpdateParams>;
