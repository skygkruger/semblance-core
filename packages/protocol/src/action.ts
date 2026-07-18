import { z } from 'zod';
import { IsoDateTime, ProtocolVersion } from './common.js';

/** Mirrors packages/core/types/ipc.ts ActionType — standalone to avoid circular deps. */
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
  'browser.navigate',
  'browser.snapshot',
  'browser.click',
  'browser.type',
  'browser.extract',
  'browser.fill',
  'browser.screenshot',
  'browser.connect',
  'browser.disconnect',
  'search.federated',
  'fs.read',
  'fs.write',
  'fs.edit',
  'fs.list',
  'fs.mkdir',
  'fs.move',
  'fs.copy',
  'fs.search',
  'fs.glob',
  'fs.info',
  'terminal.execute',
]);
export type ActionType = z.infer<typeof ActionType>;

export const ActionResponseStatus = z.enum([
  'success',
  'error',
  'requires_approval',
  'rate_limited',
]);
export type ActionResponseStatus = z.infer<typeof ActionResponseStatus>;

export const ActionErrorV1 = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .strict();
export type ActionErrorV1 = z.infer<typeof ActionErrorV1>;

/** Base IPC action request body — mirrors packages/core/types/ipc.ts ActionRequest. */
export const ActionRequest = z
  .object({
    id: z.string(),
    timestamp: IsoDateTime,
    action: ActionType,
    payload: z.record(z.unknown()),
    source: z.literal('core'),
    signature: z.string(),
  })
  .strict();
export type ActionRequest = z.infer<typeof ActionRequest>;

/** Versioned wrapper for sovereign process spine transport. */
export const ActionRequestV1 = ActionRequest.extend({
  protocolVersion: ProtocolVersion,
}).strict();
export type ActionRequestV1 = z.infer<typeof ActionRequestV1>;

/** Base IPC action response body — mirrors packages/core/types/ipc.ts ActionResponse. */
export const ActionResponse = z
  .object({
    requestId: z.string(),
    timestamp: IsoDateTime,
    status: ActionResponseStatus,
    data: z.unknown().optional(),
    error: ActionErrorV1.optional(),
    auditRef: z.string(),
    executedOn: z.enum(['local', 'remote']).optional(),
    remoteDeviceId: z.string().optional(),
    remoteDeviceName: z.string().optional(),
  })
  .strict();
export type ActionResponse = z.infer<typeof ActionResponse>;

/** Versioned wrapper for sovereign process spine transport. */
export const ActionResponseV1 = ActionResponse.extend({
  protocolVersion: ProtocolVersion,
}).strict();
export type ActionResponseV1 = z.infer<typeof ActionResponseV1>;

export const ACTION_REQUEST_V1_SCHEMA_ID = 'action-request-v1';
export const ACTION_RESPONSE_V1_SCHEMA_ID = 'action-response-v1';
