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
  'web.search',
  'web.fetch',
  'reminder.create',
  'reminder.update',
  'reminder.list',
  'reminder.delete',
  'contacts.import',
  'contacts.list',
  'contacts.get',
  'contacts.search',
  'messaging.draft',
  'messaging.send',
  'messaging.read',
  'clipboard.analyze',
  'clipboard.act',
  'clipboard.web_action',
  'location.reminder_fire',
  'location.commute_alert',
  'location.weather_query',
  'voice.transcribe',
  'voice.speak',
  'voice.conversation',
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

// --- Web Intelligence payload schemas (Step 10) ---

export const WebSearchPayload = z.object({
  query: z.string().min(1),
  count: z.number().int().min(1).max(20).optional().default(5),
  freshness: z.enum(['day', 'week', 'month']).optional(),
});
export type WebSearchPayload = z.infer<typeof WebSearchPayload>;

export const WebSearchResponse = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    age: z.string().optional(),
  })),
  query: z.string(),
  provider: z.enum(['brave', 'searxng']),
});
export type WebSearchResponse = z.infer<typeof WebSearchResponse>;

export const WebFetchPayload = z.object({
  url: z.string().url(),
  maxContentLength: z.number().int().positive().optional().default(50000),
});
export type WebFetchPayload = z.infer<typeof WebFetchPayload>;

export const WebFetchResponse = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string(),
  bytesFetched: z.number(),
  contentType: z.string(),
});
export type WebFetchResponse = z.infer<typeof WebFetchResponse>;

// --- Reminder payload schemas (Step 10) ---

export const ReminderCreatePayload = z.object({
  text: z.string().min(1),
  dueAt: z.string().datetime(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).optional().default('none'),
  source: z.enum(['chat', 'quick-capture', 'proactive', 'birthday_tracker']).optional().default('chat'),
});
export type ReminderCreatePayload = z.infer<typeof ReminderCreatePayload>;

export const ReminderUpdatePayload = z.object({
  id: z.string(),
  text: z.string().min(1).optional(),
  dueAt: z.string().datetime().optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).optional(),
  status: z.enum(['pending', 'fired', 'dismissed', 'snoozed']).optional(),
  snoozedUntil: z.string().datetime().optional(),
});
export type ReminderUpdatePayload = z.infer<typeof ReminderUpdatePayload>;

export const ReminderListPayload = z.object({
  status: z.enum(['pending', 'fired', 'dismissed', 'snoozed', 'all']).optional().default('all'),
  limit: z.number().int().positive().optional().default(50),
});
export type ReminderListPayload = z.infer<typeof ReminderListPayload>;

export const ReminderDeletePayload = z.object({
  id: z.string(),
});
export type ReminderDeletePayload = z.infer<typeof ReminderDeletePayload>;

// --- Contact payload schemas (Step 14) ---

export const ContactsImportPayload = z.object({
  source: z.enum(['device']).optional().default('device'),
});
export type ContactsImportPayload = z.infer<typeof ContactsImportPayload>;

export const ContactsListPayload = z.object({
  limit: z.number().int().positive().optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
  sortBy: z.enum(['display_name', 'last_contact_date', 'interaction_count']).optional().default('display_name'),
});
export type ContactsListPayload = z.infer<typeof ContactsListPayload>;

export const ContactsGetPayload = z.object({
  id: z.string(),
});
export type ContactsGetPayload = z.infer<typeof ContactsGetPayload>;

export const ContactsSearchPayload = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional().default(20),
});
export type ContactsSearchPayload = z.infer<typeof ContactsSearchPayload>;

// --- Messaging payload schemas (Step 15) ---

export const MessagingDraftPayload = z.object({
  recipientName: z.string().optional(),
  recipientPhone: z.string(),
  intent: z.string(),
  relationship: z.string().optional(),
});
export type MessagingDraftPayload = z.infer<typeof MessagingDraftPayload>;

export const MessagingSendPayload = z.object({
  phone: z.string(),
  body: z.string(),
  autonomous: z.boolean().optional(),
});
export type MessagingSendPayload = z.infer<typeof MessagingSendPayload>;

export const MessagingReadPayload = z.object({
  contactPhone: z.string(),
  limit: z.number().int().positive().optional(),
});
export type MessagingReadPayload = z.infer<typeof MessagingReadPayload>;

// --- Clipboard payload schemas (Step 15) ---

export const ClipboardAnalyzePayload = z.object({
  text: z.string(),
});
export type ClipboardAnalyzePayload = z.infer<typeof ClipboardAnalyzePayload>;

export const ClipboardActPayload = z.object({
  patternType: z.string(),
  extractedValue: z.string(),
  actionType: z.string(),
});
export type ClipboardActPayload = z.infer<typeof ClipboardActPayload>;

export const ClipboardWebActionPayload = z.object({
  actionType: z.string(),
  url: z.string().optional(),
  query: z.string().optional(),
});
export type ClipboardWebActionPayload = z.infer<typeof ClipboardWebActionPayload>;

// --- Location payload schemas (Step 16) ---

export const LocationReminderFirePayload = z.object({
  reminderId: z.string(),
  label: z.string().optional(),
});
export type LocationReminderFirePayload = z.infer<typeof LocationReminderFirePayload>;

export const LocationCommuteAlertPayload = z.object({
  eventId: z.string(),
  destination: z.string(),
  departureTime: z.string(),
  travelTimeMinutes: z.number(),
});
export type LocationCommuteAlertPayload = z.infer<typeof LocationCommuteAlertPayload>;

export const LocationWeatherQueryPayload = z.object({
  locationLabel: z.string().optional(),
  hours: z.number().int().min(1).max(48).optional().default(24),
});
export type LocationWeatherQueryPayload = z.infer<typeof LocationWeatherQueryPayload>;

// --- Voice payload schemas (Step 17) ---

export const VoiceTranscribePayload = z.object({
  durationMs: z.number().int().positive(),
  language: z.string().optional().default('en'),
});
export type VoiceTranscribePayload = z.infer<typeof VoiceTranscribePayload>;

export const VoiceSpeakPayload = z.object({
  textLength: z.number().int().positive(),
  voiceId: z.string().optional(),
});
export type VoiceSpeakPayload = z.infer<typeof VoiceSpeakPayload>;

export const VoiceConversationPayload = z.object({
  sessionDurationMs: z.number().int().positive(),
});
export type VoiceConversationPayload = z.infer<typeof VoiceConversationPayload>;

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
  'web.search': WebSearchPayload,
  'web.fetch': WebFetchPayload,
  'reminder.create': ReminderCreatePayload,
  'reminder.update': ReminderUpdatePayload,
  'reminder.list': ReminderListPayload,
  'reminder.delete': ReminderDeletePayload,
  'contacts.import': ContactsImportPayload,
  'contacts.list': ContactsListPayload,
  'contacts.get': ContactsGetPayload,
  'contacts.search': ContactsSearchPayload,
  'messaging.draft': MessagingDraftPayload,
  'messaging.send': MessagingSendPayload,
  'messaging.read': MessagingReadPayload,
  'clipboard.analyze': ClipboardAnalyzePayload,
  'clipboard.act': ClipboardActPayload,
  'clipboard.web_action': ClipboardWebActionPayload,
  'location.reminder_fire': LocationReminderFirePayload,
  'location.commute_alert': LocationCommuteAlertPayload,
  'location.weather_query': LocationWeatherQueryPayload,
  'voice.transcribe': VoiceTranscribePayload,
  'voice.speak': VoiceSpeakPayload,
  'voice.conversation': VoiceConversationPayload,
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
