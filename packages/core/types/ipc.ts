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
  'web.deep_search',
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
  'cloud.auth',
  'cloud.auth_status',
  'cloud.disconnect',
  'cloud.list_files',
  'cloud.file_metadata',
  'cloud.download_file',
  'cloud.check_changed',
  'finance.plaid_link',
  'finance.plaid_exchange',
  'finance.plaid_sync',
  'finance.plaid_balances',
  'finance.plaid_status',
  'finance.plaid_disconnect',
  'connector.auth',
  'connector.auth_status',
  'connector.disconnect',
  'connector.sync',
  'connector.list_items',
  'import.run',
  'import.status',
  'service.api_call',
  'model.download',
  'model.download_cancel',
  'model.verify',
  'network.startDiscovery',
  'network.stopDiscovery',
  'network.sendOffer',
  'network.sendAcceptance',
  'network.sendRevocation',
  'network.syncContext',
  'file.write',
  'subscription.insight',
  'dark_pattern.detected',
  'insight.proactive',
  'insight.meeting_prep',
  'insight.follow_up',
  'insight.deadline',
  'insight.conflict',
  'escalation.prompt',
  'health.entry',
  // System / Hardware Bridge (Sprint F)
  'system.execute',
  'system.hardware_stat',
  'system.app_launch',
  'system.app_list',
  'system.file_watch',
  'system.file_watch_stop',
  'system.clipboard_read',
  'system.clipboard_write',
  'system.notification',
  'system.accessibility_read',
  'system.keypress',
  'system.shortcut_run',
  'system.process_kill',
  'system.process_signal',
  'system.process_list',
  // Browser CDP (Sprint G.5)
  'browser.navigate',
  'browser.snapshot',
  'browser.click',
  'browser.type',
  'browser.extract',
  'browser.fill',
  'browser.screenshot',
  'browser.connect',
  'browser.disconnect',
  // Federated search (Sprint G.5)
  'search.federated',
]);
export type ActionType = z.infer<typeof ActionType>;

// --- Action-specific payload schemas ---

// Coerce single string to array — small models (7B) often pass "to": "email" instead of ["email"]
const emailStringOrArray = z.union([
  z.string().email().transform(s => [s]),
  z.array(z.string().email()),
]);

export const EmailSendPayload = z.object({
  to: emailStringOrArray,
  cc: z.union([z.string().email().transform(s => [s]), z.array(z.string().email())]).optional(),
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
  unreadOnly: z.boolean().optional(),
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

// --- Plaid payload schemas (Step 19) ---

export const PlaidLinkPayload = z.object({
  clientUserId: z.string(),
  products: z.array(z.string()).optional().default(['transactions']),
});
export type PlaidLinkPayload = z.infer<typeof PlaidLinkPayload>;

export const PlaidExchangePayload = z.object({
  publicToken: z.string(),
});
export type PlaidExchangePayload = z.infer<typeof PlaidExchangePayload>;

export const PlaidSyncPayload = z.object({
  accessToken: z.string().optional(),
  cursor: z.string().optional(),
  count: z.number().int().positive().optional().default(100),
});
export type PlaidSyncPayload = z.infer<typeof PlaidSyncPayload>;

export const PlaidBalancesPayload = z.object({
  accessToken: z.string().optional(),
  accountIds: z.array(z.string()).optional(),
});
export type PlaidBalancesPayload = z.infer<typeof PlaidBalancesPayload>;

export const PlaidStatusPayload = z.object({
  accessToken: z.string().optional(),
});
export type PlaidStatusPayload = z.infer<typeof PlaidStatusPayload>;

export const PlaidDisconnectPayload = z.object({
  accessToken: z.string().optional(),
});
export type PlaidDisconnectPayload = z.infer<typeof PlaidDisconnectPayload>;

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
  provider: z.enum(['brave', 'searxng', 'duckduckgo']),
});
export type WebSearchResponse = z.infer<typeof WebSearchResponse>;

export const WebDeepSearchPayload = z.object({
  query: z.string().min(1),
  resultCount: z.number().int().min(1).max(5).optional().default(3),
});
export type WebDeepSearchPayload = z.infer<typeof WebDeepSearchPayload>;

export const WebDeepSearchResponse = z.object({
  query: z.string(),
  provider: z.enum(['brave', 'searxng', 'duckduckgo']),
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
    fullContent: z.string().nullable(),
  })),
});
export type WebDeepSearchResponse = z.infer<typeof WebDeepSearchResponse>;

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

// --- Cloud Storage payload schemas (Step 18) ---

export const CloudAuthPayload = z.object({
  provider: z.enum(['google_drive', 'dropbox', 'onedrive']),
});
export type CloudAuthPayload = z.infer<typeof CloudAuthPayload>;

export const CloudAuthStatusPayload = z.object({
  provider: z.enum(['google_drive', 'dropbox', 'onedrive']),
});
export type CloudAuthStatusPayload = z.infer<typeof CloudAuthStatusPayload>;

export const CloudDisconnectPayload = z.object({
  provider: z.enum(['google_drive', 'dropbox', 'onedrive']),
});
export type CloudDisconnectPayload = z.infer<typeof CloudDisconnectPayload>;

export const CloudListFilesPayload = z.object({
  provider: z.enum(['google_drive', 'dropbox', 'onedrive']),
  folderId: z.string().optional(),
  pageToken: z.string().optional(),
  pageSize: z.number().int().positive().optional(),
  mimeTypeFilter: z.string().optional(),
});
export type CloudListFilesPayload = z.infer<typeof CloudListFilesPayload>;

export const CloudFileMetadataPayload = z.object({
  provider: z.enum(['google_drive', 'dropbox', 'onedrive']),
  fileId: z.string(),
});
export type CloudFileMetadataPayload = z.infer<typeof CloudFileMetadataPayload>;

export const CloudDownloadFilePayload = z.object({
  provider: z.enum(['google_drive', 'dropbox', 'onedrive']),
  fileId: z.string(),
  localPath: z.string(),
});
export type CloudDownloadFilePayload = z.infer<typeof CloudDownloadFilePayload>;

export const CloudCheckChangedPayload = z.object({
  provider: z.enum(['google_drive', 'dropbox', 'onedrive']),
  fileId: z.string(),
  sinceTimestamp: z.string(),
});
export type CloudCheckChangedPayload = z.infer<typeof CloudCheckChangedPayload>;

// --- Connector payload schemas (Connector Surface) ---

export const ConnectorAuthPayload = z.object({
  connectorId: z.string(),
  /** API key for key-based connectors (Readwise, Toggl, etc.) */
  apiKey: z.string().optional(),
});
export type ConnectorAuthPayload = z.infer<typeof ConnectorAuthPayload>;

export const ConnectorAuthStatusPayload = z.object({
  connectorId: z.string(),
});
export type ConnectorAuthStatusPayload = z.infer<typeof ConnectorAuthStatusPayload>;

export const ConnectorDisconnectPayload = z.object({
  connectorId: z.string(),
});
export type ConnectorDisconnectPayload = z.infer<typeof ConnectorDisconnectPayload>;

export const ConnectorSyncPayload = z.object({
  connectorId: z.string(),
  since: z.string().datetime().optional(),
  limit: z.number().int().positive().optional(),
});
export type ConnectorSyncPayload = z.infer<typeof ConnectorSyncPayload>;

export const ConnectorListItemsPayload = z.object({
  connectorId: z.string(),
  pageToken: z.string().optional(),
  pageSize: z.number().int().positive().optional(),
});
export type ConnectorListItemsPayload = z.infer<typeof ConnectorListItemsPayload>;

export const ImportRunPayload = z.object({
  sourcePath: z.string(),
  sourceType: z.string(),
});
export type ImportRunPayload = z.infer<typeof ImportRunPayload>;

export const ImportStatusPayload = z.object({
  importId: z.string().optional(),
});
export type ImportStatusPayload = z.infer<typeof ImportStatusPayload>;

// --- File payload schemas ---

export const FileWritePayload = z.object({
  filename: z.string().min(1),
  content: z.string(),
  directory: z.string().optional().default('downloads'),
  overwrite: z.boolean().optional().default(false),
});
export type FileWritePayload = z.infer<typeof FileWritePayload>;

// --- Network payload schemas (Step 28) ---

export const NetworkStartDiscoveryPayload = z.object({
  serviceType: z.string(),
  protocolVersion: z.number().int().positive(),
  localDeviceId: z.string(),
});
export type NetworkStartDiscoveryPayload = z.infer<typeof NetworkStartDiscoveryPayload>;

export const NetworkStopDiscoveryPayload = z.object({
  serviceType: z.string(),
});
export type NetworkStopDiscoveryPayload = z.infer<typeof NetworkStopDiscoveryPayload>;

export const NetworkSendPayload = z.object({
  peerId: z.string(),
  ipAddress: z.string(),
  port: z.number().int().positive(),
  data: z.string(),
});
export type NetworkSendPayload = z.infer<typeof NetworkSendPayload>;

// Map ActionType to its strict payload schema.
// .strict() rejects unknown fields — defense against payload injection.
export const ActionPayloadMap: Record<ActionType, z.ZodTypeAny> = {
  'email.send': EmailSendPayload.strict(),
  'email.draft': EmailSendPayload.strict(),
  'email.fetch': EmailFetchPayload.strict(),
  'email.archive': EmailArchivePayload.strict(),
  'email.move': EmailMovePayload.strict(),
  'email.markRead': EmailMarkReadPayload.strict(),
  'calendar.fetch': CalendarFetchPayload.strict(),
  'calendar.create': CalendarCreatePayload.strict(),
  'calendar.update': CalendarUpdatePayload.strict(),
  'calendar.delete': CalendarDeletePayload.strict(),
  'finance.fetch_transactions': FinanceFetchPayload.strict(),
  'finance.plaid_link': PlaidLinkPayload.strict(),
  'finance.plaid_exchange': PlaidExchangePayload.strict(),
  'finance.plaid_sync': PlaidSyncPayload.strict(),
  'finance.plaid_balances': PlaidBalancesPayload.strict(),
  'finance.plaid_status': PlaidStatusPayload.strict(),
  'finance.plaid_disconnect': PlaidDisconnectPayload.strict(),
  'health.fetch': HealthFetchPayload.strict(),
  'web.search': WebSearchPayload.strict(),
  'web.deep_search': WebDeepSearchPayload.strict(),
  'web.fetch': WebFetchPayload.strict(),
  'reminder.create': ReminderCreatePayload.strict(),
  'reminder.update': ReminderUpdatePayload.strict(),
  'reminder.list': ReminderListPayload.strict(),
  'reminder.delete': ReminderDeletePayload.strict(),
  'contacts.import': ContactsImportPayload.strict(),
  'contacts.list': ContactsListPayload.strict(),
  'contacts.get': ContactsGetPayload.strict(),
  'contacts.search': ContactsSearchPayload.strict(),
  'messaging.draft': MessagingDraftPayload.strict(),
  'messaging.send': MessagingSendPayload.strict(),
  'messaging.read': MessagingReadPayload.strict(),
  'clipboard.analyze': ClipboardAnalyzePayload.strict(),
  'clipboard.act': ClipboardActPayload.strict(),
  'clipboard.web_action': ClipboardWebActionPayload.strict(),
  'location.reminder_fire': LocationReminderFirePayload.strict(),
  'location.commute_alert': LocationCommuteAlertPayload.strict(),
  'location.weather_query': LocationWeatherQueryPayload.strict(),
  'voice.transcribe': VoiceTranscribePayload.strict(),
  'voice.speak': VoiceSpeakPayload.strict(),
  'voice.conversation': VoiceConversationPayload.strict(),
  'cloud.auth': CloudAuthPayload.strict(),
  'cloud.auth_status': CloudAuthStatusPayload.strict(),
  'cloud.disconnect': CloudDisconnectPayload.strict(),
  'cloud.list_files': CloudListFilesPayload.strict(),
  'cloud.file_metadata': CloudFileMetadataPayload.strict(),
  'cloud.download_file': CloudDownloadFilePayload.strict(),
  'cloud.check_changed': CloudCheckChangedPayload.strict(),
  'connector.auth': ConnectorAuthPayload.strict(),
  'connector.auth_status': ConnectorAuthStatusPayload.strict(),
  'connector.disconnect': ConnectorDisconnectPayload.strict(),
  'connector.sync': ConnectorSyncPayload.strict(),
  'connector.list_items': ConnectorListItemsPayload.strict(),
  'import.run': ImportRunPayload.strict(),
  'import.status': ImportStatusPayload.strict(),
  'service.api_call': ServiceApiCallPayload.strict(),
  'model.download': ModelDownloadPayload.strict(),
  'model.download_cancel': ModelDownloadCancelPayload.strict(),
  'model.verify': ModelVerifyPayload.strict(),
  'network.startDiscovery': NetworkStartDiscoveryPayload.strict(),
  'network.stopDiscovery': NetworkStopDiscoveryPayload.strict(),
  'network.sendOffer': NetworkSendPayload.strict(),
  'network.sendAcceptance': NetworkSendPayload.strict(),
  'network.sendRevocation': NetworkSendPayload.strict(),
  'network.syncContext': NetworkSendPayload.strict(),
  'file.write': FileWritePayload.strict(),
  // Inline action types — these are UI-surfaced events, payload is passthrough
  'subscription.insight': z.object({ charges: z.array(z.any()), summary: z.any() }).passthrough(),
  'dark_pattern.detected': z.object({ confidence: z.number(), patterns: z.array(z.any()), reframe: z.string() }).passthrough(),
  'insight.proactive': z.object({ title: z.string(), summary: z.string() }).passthrough(),
  'insight.meeting_prep': z.object({ title: z.string(), summary: z.string() }).passthrough(),
  'insight.follow_up': z.object({ title: z.string(), summary: z.string() }).passthrough(),
  'insight.deadline': z.object({ title: z.string(), summary: z.string() }).passthrough(),
  'insight.conflict': z.object({ title: z.string(), summary: z.string() }).passthrough(),
  'escalation.prompt': z.object({ domain: z.string(), message: z.string() }).passthrough(),
  'health.entry': z.object({ metric: z.string(), value: z.number() }).passthrough(),
  // System / Hardware Bridge (Sprint F)
  'system.execute': z.object({ binary: z.string(), args: z.array(z.string()), stdin: z.string().optional(), timeout: z.number().optional() }).passthrough(),
  'system.hardware_stat': z.object({}).passthrough(),
  'system.app_launch': z.object({ appPath: z.string(), args: z.array(z.string()).optional() }).passthrough(),
  'system.app_list': z.object({}).passthrough(),
  'system.file_watch': z.object({ directory: z.string() }).passthrough(),
  'system.file_watch_stop': z.object({ watchId: z.string() }).passthrough(),
  'system.clipboard_read': z.object({}).passthrough(),
  'system.clipboard_write': z.object({ text: z.string() }).passthrough(),
  'system.notification': z.object({ title: z.string(), body: z.string() }).passthrough(),
  'system.accessibility_read': z.object({ appName: z.string() }).passthrough(),
  'system.keypress': z.object({ keys: z.string(), modifiers: z.array(z.string()).optional() }).passthrough(),
  'system.shortcut_run': z.object({ name: z.string() }).passthrough(),
  'system.process_kill': z.object({ pid: z.number() }).passthrough(),
  'system.process_signal': z.object({ pid: z.number(), signal: z.string() }).passthrough(),
  'system.process_list': z.object({}).passthrough(),
  // Browser CDP (Sprint G.5)
  'browser.navigate': z.object({ url: z.string() }).passthrough(),
  'browser.snapshot': z.object({}).passthrough(),
  'browser.click': z.object({ selector: z.string() }).passthrough(),
  'browser.type': z.object({ selector: z.string(), text: z.string() }).passthrough(),
  'browser.extract': z.object({ extractType: z.string(), selector: z.string().optional() }).passthrough(),
  'browser.fill': z.object({ selector: z.string(), value: z.string() }).passthrough(),
  'browser.screenshot': z.object({}).passthrough(),
  'browser.connect': z.object({ debuggingPort: z.number().optional() }).passthrough(),
  'browser.disconnect': z.object({}).passthrough(),
  // Federated search (Sprint G.5)
  'search.federated': z.object({ query: z.string(), categories: z.array(z.string()).optional() }).passthrough(),
};

// --- Core protocol schemas ---

// Action Request — what Core sends to Gateway
// SECURITY: .strict() rejects extra fields that could be read by downstream code
export const ActionRequest = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  action: ActionType,
  payload: z.record(z.unknown()),
  source: z.literal('core'),
  signature: z.string(),
}).strict();
export type ActionRequest = z.infer<typeof ActionRequest>;

// Action Response — what Gateway returns to Core
// SECURITY: .strict() for defense-in-depth on outbound messages
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
  executedOn: z.enum(['local', 'remote']).optional(),
  remoteDeviceId: z.string().optional(),
  remoteDeviceName: z.string().optional(),
}).strict();
export type ActionResponse = z.infer<typeof ActionResponse>;
