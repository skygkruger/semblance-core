// IPC Protocol Types — Shared contract between AI Core and Gateway
// CRITICAL: No networking imports. Pure type definitions + Zod schemas only.

import { z } from 'zod';

// Action types — discriminated union of all supported actions
export const ActionType = z.enum([
  'email.fetch',
  'email.send',
  'email.draft',
  'calendar.fetch',
  'calendar.create',
  'calendar.update',
  'finance.fetch_transactions',
  'health.fetch',
  'service.api_call',
]);
export type ActionType = z.infer<typeof ActionType>;

// --- Action-specific payload schemas ---

export const EmailSendPayload = z.object({
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
  subject: z.string(),
  body: z.string(),
  replyToMessageId: z.string().optional(),
});
export type EmailSendPayload = z.infer<typeof EmailSendPayload>;

export const EmailFetchPayload = z.object({
  folder: z.string().default('INBOX'),
  limit: z.number().int().positive().default(50),
  since: z.string().optional(),
  search: z.string().optional(),
  messageIds: z.array(z.string()).optional(),
});
export type EmailFetchPayload = z.infer<typeof EmailFetchPayload>;

export const CalendarFetchPayload = z.object({
  calendarId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
});
export type CalendarFetchPayload = z.infer<typeof CalendarFetchPayload>;

export const CalendarCreatePayload = z.object({
  calendarId: z.string().optional(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.object({
    name: z.string(),
    email: z.string(),
  })).optional(),
});
export type CalendarCreatePayload = z.infer<typeof CalendarCreatePayload>;

export const CalendarUpdatePayload = z.object({
  eventId: z.string(),
  updates: CalendarCreatePayload.partial(),
});
export type CalendarUpdatePayload = z.infer<typeof CalendarUpdatePayload>;

export const ServiceApiCallPayload = z.object({
  service: z.string(),
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});
export type ServiceApiCallPayload = z.infer<typeof ServiceApiCallPayload>;

export const FinanceFetchPayload = z.object({
  accountId: z.string().optional(),
  limit: z.number().optional(),
});
export type FinanceFetchPayload = z.infer<typeof FinanceFetchPayload>;

export const HealthFetchPayload = z.object({
  dataType: z.string(),
  startDate: z.string().datetime().optional(),
});
export type HealthFetchPayload = z.infer<typeof HealthFetchPayload>;

// Map ActionType to its payload schema
export const ActionPayloadMap: Record<ActionType, z.ZodTypeAny> = {
  'email.send': EmailSendPayload,
  'email.draft': EmailSendPayload,
  'email.fetch': EmailFetchPayload,
  'calendar.fetch': CalendarFetchPayload,
  'calendar.create': CalendarCreatePayload,
  'calendar.update': CalendarUpdatePayload,
  'finance.fetch_transactions': FinanceFetchPayload,
  'health.fetch': HealthFetchPayload,
  'service.api_call': ServiceApiCallPayload,
};

// --- Core protocol schemas ---

// Action Request — what Core sends to Gateway
export const ActionRequest = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  action: ActionType,
  payload: z.record(z.unknown()),
  source: z.literal('core'),
  signature: z.string(),
});
export type ActionRequest = z.infer<typeof ActionRequest>;

// Action Response — what Gateway returns to Core
export const ActionResponse = z.object({
  requestId: z.string(),
  timestamp: z.string().datetime(),
  status: z.enum(['success', 'error', 'requires_approval', 'rate_limited']),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
  auditRef: z.string(),
});
export type ActionResponse = z.infer<typeof ActionResponse>;
