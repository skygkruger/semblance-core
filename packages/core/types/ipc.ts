// IPC Protocol Types — Shared contract between AI Core and Gateway
// CRITICAL: No networking imports. Pure type definitions + Zod schemas only.

import { z } from 'zod';

// Action types — discriminated union of all supported actions
export const ActionType = z.enum([
  'email.fetch',
  'email.send',
  'email.draft',
  'email.archive',
  'email.move',
  'email.markRead',
  'calendar.fetch',
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'finance.fetch_transactions',
  'health.fetch',
  'service.api_call',
  'model.download',
  'model.download_cancel',
  'model.verify',
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

export const CalendarDeletePayload = z.object({
  eventId: z.string(),
  calendarId: z.string().optional(),
});
export type CalendarDeletePayload = z.infer<typeof CalendarDeletePayload>;

export const EmailArchivePayload = z.object({
  accountId: z.string().optional(),
  messageIds: z.array(z.string()),
  targetFolder: z.string().default('[Gmail]/All Mail'),
});
export type EmailArchivePayload = z.infer<typeof EmailArchivePayload>;

export const EmailMovePayload = z.object({
  accountId: z.string().optional(),
  messageIds: z.array(z.string()),
  fromFolder: z.string(),
  toFolder: z.string(),
});
export type EmailMovePayload = z.infer<typeof EmailMovePayload>;

export const EmailMarkReadPayload = z.object({
  accountId: z.string().optional(),
  messageIds: z.array(z.string()),
  read: z.boolean(),
});
export type EmailMarkReadPayload = z.infer<typeof EmailMarkReadPayload>;

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

export const ModelDownloadPayload = z.object({
  modelId: z.string(),
  hfRepo: z.string(),
  hfFilename: z.string(),
  expectedSizeBytes: z.number().int().positive(),
  expectedSha256: z.string(),
  targetPath: z.string(),
});
export type ModelDownloadPayload = z.infer<typeof ModelDownloadPayload>;

export const ModelDownloadCancelPayload = z.object({
  modelId: z.string(),
  downloadId: z.string(),
});
export type ModelDownloadCancelPayload = z.infer<typeof ModelDownloadCancelPayload>;

export const ModelVerifyPayload = z.object({
  modelId: z.string(),
  filePath: z.string(),
  expectedSha256: z.string(),
});
export type ModelVerifyPayload = z.infer<typeof ModelVerifyPayload>;

// Map ActionType to its payload schema
export const ActionPayloadMap: Record<ActionType, z.ZodTypeAny> = {
  'email.send': EmailSendPayload,
  'email.draft': EmailSendPayload,
  'email.fetch': EmailFetchPayload,
  'email.archive': EmailArchivePayload,
  'email.move': EmailMovePayload,
  'email.markRead': EmailMarkReadPayload,
  'calendar.fetch': CalendarFetchPayload,
  'calendar.create': CalendarCreatePayload,
  'calendar.update': CalendarUpdatePayload,
  'calendar.delete': CalendarDeletePayload,
  'finance.fetch_transactions': FinanceFetchPayload,
  'health.fetch': HealthFetchPayload,
  'service.api_call': ServiceApiCallPayload,
  'model.download': ModelDownloadPayload,
  'model.download_cancel': ModelDownloadCancelPayload,
  'model.verify': ModelVerifyPayload,
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
