// Typed IPC command wrappers for all Tauri invoke() calls.
// Only this file should import from @tauri-apps/api/core.

import { invoke } from '@tauri-apps/api/core';
import type {
  HardwareDisplayInfo,
  ProviderPreset,
  KnowledgeMoment,
  AddCredentialParams,
  TestCredentialParams,
  TestCredentialResult,
  AccountInfo,
  AccountStatus,
  DocumentContext,
  ChatAttachmentInfo,
  IndexedEmail,
  ProactiveInsight,
  CalendarEvent,
  ActionsSummary,
  SendEmailParams,
  LogEntry,
  PendingAction,
  DigestSummary,
  WeeklyDigest,
  LicenseStatus,
  ActivationResult,
  NetworkPeriod,
  NetworkStatistics,
  ActiveConnection,
  AllowlistEntry,
  UnauthorizedAttempt,
  TimelinePoint,
  ConnectionRecord,
  PrivacyReport,
  TrustStatus,
  ConnectorAction,
  SidecarRequest,
  ContactSummary,
  ContactDetail,
  ContactStats,
  BirthdayInfo,
  ImportStatementResult,
  FinancialPeriod,
  FinancialDashboardData,
  HealthDashboardData,
  HealthEntry,
  CloudConnectResult,
  CloudSyncResult,
  CloudFolder,
  SearchSettings,
  SaveSearchSettingsParams,
  ConversationSummary,
  ConversationTurn,
  SwitchConversationResult,
  ConversationDeleteResult,
  ConversationClearResult,
  ConversationSearchResult,
  ConversationSettings,
  SendMessageResult,
  AlterEgoSettingsData,
  AlterEgoReceiptData,
  AlterEgoTrustData,
  SoundSettings,
  TriggerSyncResult,
  KnowledgeChunkListResult,
  KnowledgeCurationResult,
  KnowledgeCategorySuggestion,
  KnowledgeCategoryInfo,
  ChainVerificationResult,
  SignedDailyReceipt,
  ChainStatus,
  HardwareKeyInfo,
  HardwareKeyBackend,
  HardwareSignResult,
  HardwareVerifyResult,
  SovereigntyReportData,
  SovereigntyReportVerifyResult,
  PrivacyStatusData,
  ReservationImportResult,
  VaultSourceSummary,
  VaultAssertionSummary,
  VaultSurfaceStatus,
  VaultSurfaceExport,
  VaultDeleteSourceResult,
  WorkActionView,
  WorkApproveActionResult,
  ActionReceipt,
  DelegatedPlanView,
  DelegatedPlanStatus,
  CreateDelegatedPlanInput,
  UpdateDelegatedPlanInput,
} from './types.js';

// ─── Hardware / Onboarding ──────────────────────────────────────────────────

export function detectHardware(): Promise<HardwareDisplayInfo> {
  return invoke<HardwareDisplayInfo>('detect_hardware');
}

export function getProviderPresets(): Promise<Record<string, ProviderPreset>> {
  return invoke<Record<string, ProviderPreset>>('get_provider_presets');
}

export function startModelDownloads(tier: string): Promise<void> {
  return invoke<void>('start_model_downloads', { tier });
}

export function generateKnowledgeMoment(): Promise<KnowledgeMoment> {
  return invoke<KnowledgeMoment>('generate_knowledge_moment');
}

export function setUserName(name: string): Promise<void> {
  return invoke<void>('set_user_name', { name });
}

export function setAiName(name: string): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'set_ai_name', params: { name } },
  });
}

export function setAutonomyTier(domain: string, tier: string): Promise<void> {
  return invoke<void>('set_autonomy_tier', { domain, tier });
}

export function setOnboardingComplete(): Promise<void> {
  return invoke<void>('set_onboarding_complete');
}

export function getOnboardingComplete(): Promise<boolean> {
  return invoke<{ complete: boolean }>('get_onboarding_complete').then(r => r.complete);
}

export function getLanguagePreference(): Promise<string | null> {
  return invoke<string | null>('get_language_preference');
}

export function setLanguagePreference(code: string): Promise<void> {
  return invoke<void>('set_language_preference', { code });
}

// ─── Credentials / Accounts ─────────────────────────────────────────────────

export function addCredential(params: AddCredentialParams): Promise<void> {
  return invoke<void>('add_credential', { ...params });
}

export function testCredential(params: TestCredentialParams): Promise<TestCredentialResult> {
  return invoke<TestCredentialResult>('test_credential', { ...params });
}

export function listCredentials(): Promise<AccountInfo[]> {
  return invoke<AccountInfo[]>('list_credentials');
}

export function removeCredential(id: string): Promise<void> {
  return invoke<void>('remove_credential', { id });
}

export function getAccountsStatus(): Promise<AccountStatus[]> {
  return invoke<AccountStatus[]>('get_accounts_status');
}

// ─── Chat / LLM ────────────────────────────────────────────────────────────

export function sendMessage(
  message: string,
  conversationId?: string,
  attachments?: Array<{ id: string; fileName: string; filePath: string; mimeType: string }>,
): Promise<SendMessageResult> {
  return invoke<SendMessageResult>('send_message', { message, conversationId, attachments });
}

export function cancelMessage(): Promise<{ cancelled: boolean }> {
  return sidecarCall<{ cancelled: boolean }>('cancel_message');
}

export function documentPickFile(): Promise<string | null> {
  return invoke<string | null>('document_pick_file');
}

export function documentSetContext(filePath: string): Promise<DocumentContext> {
  return invoke<DocumentContext>('document_set_context', { filePath });
}

export function documentClearContext(): Promise<void> {
  return invoke<void>('document_clear_context');
}

export function documentAddFile(filePath: string): Promise<ChatAttachmentInfo> {
  return invoke<ChatAttachmentInfo>('document_add_file', { filePath });
}

export function documentRemoveFile(documentId: string): Promise<void> {
  return invoke<void>('document_remove_file', { documentId });
}

export function documentPickFiles(): Promise<string[]> {
  return invoke<string[]>('document_pick_files');
}

export function addAttachmentToKnowledge(documentId: string): Promise<void> {
  return invoke<void>('add_attachment_to_knowledge', { documentId });
}

export function selectModel(modelId: string): Promise<void> {
  return invoke<void>('select_model', { modelId });
}

// ─── Email / Calendar / Inbox ───────────────────────────────────────────────

export function getInboxItems(limit: number, offset: number, accountId?: string): Promise<IndexedEmail[]> {
  return invoke<IndexedEmail[]>('get_inbox_items', { limit, offset, account_id: accountId ?? null });
}

export function getProactiveInsights(): Promise<ProactiveInsight[]> {
  return invoke<ProactiveInsight[]>('get_proactive_insights');
}

export function getTodayEvents(): Promise<CalendarEvent[]> {
  return invoke<CalendarEvent[]>('get_today_events');
}

export function getActionsSummary(): Promise<ActionsSummary> {
  return invoke<ActionsSummary>('get_actions_summary');
}

export function archiveEmails(messageIds: string[]): Promise<string> {
  return invoke<string>('archive_emails', { messageIds });
}

export function undoAction(actionId: string): Promise<void> {
  return invoke<void>('undo_action', { actionId });
}

export function sendEmailAction(params: SendEmailParams): Promise<void> {
  return invoke<void>('send_email_action', { ...params });
}

export function draftEmailAction(params: SendEmailParams): Promise<void> {
  return invoke<void>('draft_email_action', { ...params });
}

export function dismissInsight(insightId: string): Promise<void> {
  return invoke<void>('dismiss_insight', { insightId });
}

// ─── Action Log / Approvals ─────────────────────────────────────────────────

export function getActionLog(limit: number, offset: number): Promise<LogEntry[]> {
  return invoke<LogEntry[]>('get_action_log', { limit, offset });
}

export function getPendingActions(): Promise<PendingAction[]> {
  return invoke<PendingAction[]>('get_pending_actions');
}

export function getApprovalCount(actionType: string, payload: Record<string, unknown>): Promise<number> {
  return invoke<number>('get_approval_count', { actionType, payload });
}

export function getApprovalThreshold(actionType: string, payload: Record<string, unknown>): Promise<number> {
  return invoke<number>('get_approval_threshold', { actionType, payload });
}

export function approveAction(actionId: string): Promise<{
  requestId: string;
  status: 'success' | 'error' | 'requires_approval' | 'rate_limited';
  data?: unknown;
  error?: { code: string; message: string };
  auditRef: string;
}> {
  return invoke('approve_action', { actionId });
}

export function rejectAction(actionId: string): Promise<void> {
  return invoke<void>('reject_action', { actionId });
}

export function respondToEscalation(promptId: string, accepted: boolean): Promise<void> {
  return invoke<void>('respond_to_escalation', { promptId, accepted });
}

// ─── Digest ─────────────────────────────────────────────────────────────────

export function getLatestDigest(): Promise<WeeklyDigest> {
  return invoke<WeeklyDigest>('get_latest_digest');
}

export function listDigests(): Promise<DigestSummary[]> {
  return invoke<DigestSummary[]>('list_digests');
}

export function generateDigest(weekStart: string, weekEnd: string): Promise<WeeklyDigest> {
  return invoke<WeeklyDigest>('generate_digest', { weekStart, weekEnd });
}

// ─── License ────────────────────────────────────────────────────────────────

export function getLicenseStatus(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>('get_license_status');
}

export function activateLicenseKey(key: string): Promise<ActivationResult> {
  return invoke<ActivationResult>('activate_license_key', { key });
}

export function importFoundingReservation(token: string): Promise<ReservationImportResult> {
  return invoke<ReservationImportResult>('import_founding_reservation', { token });
}

export function disconnectLicense(): Promise<{ success: boolean }> {
  return invoke<{ success: boolean }>('disconnect_license');
}

export function requestLicensePortalSession(licenseKey: string): Promise<string | null> {
  return invoke<{ url: string | null }>('request_license_portal_session', { licenseKey })
    .then((result) => result.url);
}

// ─── Privacy Status ─────────────────────────────────────────────────────────

export function getPrivacyStatus(): Promise<PrivacyStatusData> {
  return invoke<{
    all_local: boolean;
    connection_count: number;
    last_audit_entry: string | null;
    anomaly_detected: boolean;
    actions_logged: number;
    time_saved_seconds: number;
  }>('get_privacy_status').then(raw => ({
    allLocal: raw.all_local,
    connectionCount: raw.connection_count,
    lastAuditEntry: raw.last_audit_entry,
    anomalyDetected: raw.anomaly_detected,
    actionsLogged: raw.actions_logged,
    timeSavedSeconds: raw.time_saved_seconds,
  }));
}

// ─── Network Monitor ────────────────────────────────────────────────────────

export function getNetworkStatistics(period: NetworkPeriod): Promise<NetworkStatistics> {
  return invoke<NetworkStatistics>('get_network_statistics', { period });
}

export function getActiveConnections(): Promise<ActiveConnection[]> {
  return invoke<ActiveConnection[]>('get_active_connections');
}

export function getNetworkAllowlist(): Promise<AllowlistEntry[]> {
  return invoke<AllowlistEntry[]>('get_network_allowlist');
}

export function getUnauthorizedAttempts(period: string): Promise<UnauthorizedAttempt[]> {
  return invoke<UnauthorizedAttempt[]>('get_unauthorized_attempts', { period });
}

export function getConnectionTimeline(period: string, granularity: 'hour' | 'day'): Promise<TimelinePoint[]> {
  return invoke<TimelinePoint[]>('get_connection_timeline', { period, granularity });
}

export function getConnectionHistory(limit: number): Promise<ConnectionRecord[]> {
  return invoke<ConnectionRecord[]>('get_connection_history', { limit });
}

export function generatePrivacyReport(startDate: string, endDate: string): Promise<PrivacyReport> {
  return invoke<PrivacyReport>('generate_privacy_report', { startDate, endDate, format: 'json' });
}

export function getNetworkTrustStatus(): Promise<TrustStatus> {
  return invoke<TrustStatus>('get_network_trust_status');
}

// ─── Connectors (via ipc_send) ──────────────────────────────────────────────

export function ipcSend(connectorAction: ConnectorAction): Promise<unknown> {
  return invoke<unknown>('ipc_send', {
    action: connectorAction.action,
    params: connectorAction.payload,
  });
}

/** Returns list of connected connectors with sync timestamps */
export function getConnectedServices(): Promise<Array<{ connectorId: string; lastSyncedAt: string | null }>> {
  return invoke<Array<{ connectorId: string; lastSyncedAt: string | null }>>('sidecar_request', {
    request: { method: 'get_connected_services', params: {} },
  });
}

// ─── Multi-Account Connector Management (via sidecar_request) ───────────────

export interface OAuthAccount {
  accountId: string;
  provider: string;
  userEmail: string;
  displayName: string | null;
  isPrimary: boolean;
  scopes: string;
  expiresAt: number;
  createdAt: string;
}

/** List all OAuth accounts for a specific connector */
export function listConnectorAccounts(connectorId: string): Promise<OAuthAccount[]> {
  return invoke<OAuthAccount[]>('sidecar_request', {
    request: { method: 'connector_list_accounts', params: { connectorId } },
  });
}

/** List all OAuth accounts across all providers */
export function listAllAccounts(): Promise<OAuthAccount[]> {
  return invoke<OAuthAccount[]>('sidecar_request', {
    request: { method: 'connector_list_all_accounts', params: {} },
  });
}

/** Set a specific account as the primary for its provider */
export function setConnectorPrimaryAccount(accountId: string): Promise<{ success: boolean }> {
  return invoke<{ success: boolean }>('sidecar_request', {
    request: { method: 'connector_set_primary_account', params: { accountId } },
  });
}

/** Remove a specific OAuth account */
export function removeConnectorAccount(accountId: string): Promise<{ success: boolean }> {
  return invoke<{ success: boolean }>('sidecar_request', {
    request: { method: 'connector_remove_account', params: { accountId } },
  });
}

// ─── Contacts (via sidecar_request) ─────────────────────────────────────────

function sidecarRequest<T>(request: SidecarRequest): Promise<T> {
  return invoke<T>('sidecar_request', { request });
}

/** Public wrapper for sidecar JSON-RPC requests from screens */
export function sidecarCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('sidecar_request', { request: { method, params } });
}

export function listContacts(limit: number, sortBy: 'display_name' | 'last_contact_date' | 'interaction_count'): Promise<{ contacts: ContactSummary[] }> {
  return sidecarRequest<{ contacts: ContactSummary[] }>({ method: 'contacts:list', params: { limit, sortBy } });
}

export function createContact(params: {
  displayName: string;
  email?: string;
  phone?: string;
  organization?: string;
  relationshipType?: string;
}): Promise<{ success: boolean; id?: string }> {
  return sidecarCall<{ success: boolean; id?: string }>('contacts:create', params);
}

export function updateContact(id: string, updates: {
  displayName?: string;
  givenName?: string;
  familyName?: string;
  emails?: string[];
  phones?: string[];
  organization?: string;
  jobTitle?: string;
  birthday?: string;
  relationshipType?: string;
  tags?: string[];
}): Promise<{ success: boolean }> {
  return sidecarCall<{ success: boolean }>('contacts:update', { id, updates });
}

export function deleteContact(id: string): Promise<{ success: boolean }> {
  return sidecarCall<{ success: boolean }>('contacts:delete', { id });
}

export function importContacts(filePath: string): Promise<{ success: boolean; imported: number; error?: string }> {
  return sidecarCall<{ success: boolean; imported: number; error?: string }>('contacts:import', { filePath });
}

export function getContactEmailHistory(contactEmail: string): Promise<Array<{
  message_id: string;
  subject: string;
  from: string;
  from_name: string;
  snippet: string;
  received_at: string;
  priority: string;
}>> {
  return sidecarCall('contacts:getEmailHistory', { contactEmail });
}

export function getContactCalendarHistory(contactEmail: string): Promise<Array<{
  uid: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees: string;
}>> {
  return sidecarCall('contacts:getCalendarHistory', { contactEmail });
}

export function getRelationshipGraph(): Promise<unknown> {
  return sidecarCall('contacts:getRelationshipGraph', {});
}

export function getFrequencyAlerts(): Promise<{ alerts: Array<{
  contactId: string;
  displayName: string;
  lastContactDate: string;
  previousFrequency: string;
  currentFrequency: string;
  trend: string;
}> }> {
  return sidecarCall('contacts:getFrequencyAlerts', {});
}

export function getContactStats(): Promise<ContactStats> {
  return sidecarRequest<ContactStats>({ method: 'contacts:getStats', params: {} });
}

export function getUpcomingBirthdays(): Promise<{ birthdays: BirthdayInfo[] }> {
  return sidecarRequest<{ birthdays: BirthdayInfo[] }>({ method: 'contacts:getUpcomingBirthdays', params: {} });
}

export function getContact(id: string): Promise<ContactDetail> {
  return sidecarRequest<ContactDetail>({ method: 'contacts:get', params: { id } });
}

export function searchContacts(query: string, limit: number): Promise<{ contacts: ContactSummary[] }> {
  return sidecarRequest<{ contacts: ContactSummary[] }>({ method: 'contacts:search', params: { query, limit } });
}

// ─── Finance / Subscriptions ────────────────────────────────────────────────

export function importStatement(filePath: string): Promise<ImportStatementResult> {
  return invoke<ImportStatementResult>('import_statement', { filePath });
}

export function updateSubscriptionStatus(chargeId: string, status: string): Promise<void> {
  return invoke<void>('update_subscription_status', { chargeId, status });
}

export function getFinancialDashboard(period: FinancialPeriod, customStart?: string, customEnd?: string): Promise<FinancialDashboardData> {
  return invoke<FinancialDashboardData>('get_financial_dashboard', { period, customStart, customEnd });
}

export function dismissAnomaly(anomalyId: string): Promise<void> {
  return invoke<void>('dismiss_anomaly', { anomalyId });
}

// ─── Health ────────────────────────────────────────────────────────────────

export function getHealthDashboard(trendDays: number): Promise<HealthDashboardData> {
  return invoke<HealthDashboardData>('get_health_dashboard', { trendDays });
}

export function saveHealthEntry(entry: Partial<HealthEntry> & { date: string }): Promise<HealthEntry> {
  return invoke<HealthEntry>('save_health_entry', { entry });
}

// ─── Cloud Storage ──────────────────────────────────────────────────────────

export function cloudStorageConnect(provider: string): Promise<CloudConnectResult> {
  return invoke<CloudConnectResult>('cloud_storage_connect', { provider });
}

export function cloudStorageDisconnect(provider: string): Promise<void> {
  return invoke<void>('cloud_storage_disconnect', { provider });
}

export function cloudStorageSyncNow(): Promise<CloudSyncResult> {
  return invoke<CloudSyncResult>('cloud_storage_sync_now');
}

export function cloudStorageSetInterval(minutes: number): Promise<void> {
  return invoke<void>('cloud_storage_set_interval', { minutes });
}

export function cloudStorageSetMaxFileSize(mb: number): Promise<void> {
  return invoke<void>('cloud_storage_set_max_file_size', { mb });
}

export function cloudStorageBrowseFolders(provider: string, parentFolderId: string): Promise<CloudFolder[]> {
  return invoke<CloudFolder[]>('cloud_storage_browse_folders', { provider, parentFolderId });
}

// ─── Search Settings ────────────────────────────────────────────────────────

export function getSearchSettings(): Promise<SearchSettings> {
  return invoke<SearchSettings>('get_search_settings');
}

export function saveSearchSettings(params: SaveSearchSettingsParams): Promise<void> {
  return invoke<void>('save_search_settings', { ...params });
}

export function testBraveApiKey(apiKey: string): Promise<TestCredentialResult> {
  return invoke<TestCredentialResult>('test_brave_api_key', { apiKey });
}

// ─── Conversation Management ──────────────────────────────────────────────

export function listConversations(opts?: {
  limit?: number;
  offset?: number;
  pinnedOnly?: boolean;
  search?: string;
}): Promise<ConversationSummary[]> {
  return invoke<ConversationSummary[]>('list_conversations', {
    limit: opts?.limit,
    offset: opts?.offset,
    pinnedOnly: opts?.pinnedOnly,
    search: opts?.search,
  });
}

export function getConversation(id: string): Promise<ConversationSummary & { turns: ConversationTurn[] }> {
  return invoke<ConversationSummary & { turns: ConversationTurn[] }>('get_conversation', { id });
}

export function createConversation(firstMessage?: string): Promise<ConversationSummary> {
  return invoke<ConversationSummary>('create_conversation', { firstMessage });
}

export function deleteConversation(id: string): Promise<ConversationDeleteResult> {
  return invoke<ConversationDeleteResult>('delete_conversation', { id });
}

export function renameConversation(id: string, title: string): Promise<ConversationDeleteResult> {
  return invoke<ConversationDeleteResult>('rename_conversation', { id, title });
}

export function pinConversation(id: string): Promise<ConversationDeleteResult> {
  return invoke<ConversationDeleteResult>('pin_conversation', { id });
}

export function unpinConversation(id: string): Promise<ConversationDeleteResult> {
  return invoke<ConversationDeleteResult>('unpin_conversation', { id });
}

export function switchConversation(id: string, limit?: number): Promise<SwitchConversationResult> {
  return invoke<SwitchConversationResult>('switch_conversation', { id, limit });
}

export function searchConversations(query: string, limit?: number): Promise<ConversationSearchResult[]> {
  return invoke<ConversationSearchResult[]>('search_conversations', { query, limit });
}

export function clearAllConversations(preservePinned?: boolean): Promise<ConversationClearResult> {
  return invoke<ConversationClearResult>('clear_all_conversations', { preservePinned });
}

export function setConversationAutoExpiry(days: number | null): Promise<void> {
  return invoke<void>('set_conversation_auto_expiry', { days });
}

// ─── Intent Layer ──────────────────────────────────────────────────────────

export function getIntent(): Promise<import('./types.js').IntentProfile | null> {
  return invoke<import('./types.js').IntentProfile | null>('get_intent');
}

export function setPrimaryGoal(text: string): Promise<void> {
  return invoke<void>('set_primary_goal', { text });
}

export function addHardLimit(rawText: string, source: 'onboarding' | 'settings' | 'chat'): Promise<import('./types.js').HardLimitData> {
  return invoke<import('./types.js').HardLimitData>('add_hard_limit', { rawText, source });
}

export function removeHardLimit(id: string): Promise<void> {
  return invoke<void>('remove_hard_limit', { id });
}

export function toggleHardLimit(id: string, active: boolean): Promise<void> {
  return invoke<void>('toggle_hard_limit', { id, active });
}

export function addPersonalValue(rawText: string, source: 'onboarding' | 'settings' | 'chat'): Promise<import('./types.js').PersonalValueData> {
  return invoke<import('./types.js').PersonalValueData>('add_personal_value', { rawText, source });
}

export function removePersonalValue(id: string): Promise<void> {
  return invoke<void>('remove_personal_value', { id });
}

export function getIntentObservations(channel?: 'morning_brief' | 'chat'): Promise<import('./types.js').IntentObservationData[]> {
  return invoke<import('./types.js').IntentObservationData[]>('get_intent_observations', { channel });
}

export function dismissObservation(id: string, userResponse?: string): Promise<void> {
  return invoke<void>('dismiss_observation', { id, userResponse });
}

export function checkActionIntent(action: string, context: Record<string, unknown>): Promise<import('./types.js').IntentCheckResultData> {
  return invoke<import('./types.js').IntentCheckResultData>('check_action_intent', { action, context });
}

export function setIntentOnboarding(responses: {
  primaryGoal?: string;
  hardLimit?: string;
  personalValue?: string;
}): Promise<void> {
  return invoke<void>('set_intent_onboarding', {
    primaryGoal: responses.primaryGoal,
    hardLimit: responses.hardLimit,
    personalValue: responses.personalValue,
  });
}

// ─── Files / Indexing ───────────────────────────────────────────────────────

export function startIndexing(directories: string[]): Promise<void> {
  return invoke<void>('start_indexing', { directories });
}

export function getKnowledgeStats(): Promise<{ documentCount: number; chunkCount: number; indexSizeBytes: number; lastIndexedAt: string | null }> {
  return invoke<{ documentCount: number; chunkCount: number; indexSizeBytes: number; lastIndexedAt?: string | null }>('sidecar_request', {
    request: { method: 'get_knowledge_stats', params: {} },
  }).then(r => ({ ...r, lastIndexedAt: r.lastIndexedAt ?? null }));
}

// ─── Alter Ego Guardrails ──────────────────────────────────────────────────

export function getAlterEgoSettings(): Promise<AlterEgoSettingsData> {
  return invoke<AlterEgoSettingsData>('alter_ego_get_settings');
}

export function updateAlterEgoSettings(settings: Partial<AlterEgoSettingsData>): Promise<AlterEgoSettingsData> {
  return invoke<AlterEgoSettingsData>('alter_ego_update_settings', { settings });
}

export function getAlterEgoReceipts(weekGroup?: string): Promise<AlterEgoReceiptData[]> {
  return invoke<AlterEgoReceiptData[]>('alter_ego_get_receipts', { weekGroup: weekGroup ?? null });
}

export function approveAlterEgoBatch(ids: string[]): Promise<{ approved: number }> {
  return invoke<{ approved: number }>('alter_ego_approve_batch', { ids });
}

export function rejectAlterEgoBatch(ids: string[]): Promise<{ rejected: number }> {
  return invoke<{ rejected: number }>('alter_ego_reject_batch', { ids });
}

export function sendAlterEgoDraft(actionId: string, email: string, action: string): Promise<{ sent: boolean; trust: AlterEgoTrustData }> {
  return invoke<{ sent: boolean; trust: AlterEgoTrustData }>('alter_ego_send_draft', { actionId, email, action });
}

export function undoAlterEgoReceipt(receiptId: string): Promise<{ undone: boolean }> {
  return invoke<{ undone: boolean }>('alter_ego_undo_receipt', { receiptId });
}

// ─── Sound Settings ─────────────────────────────────────────────────────────

export function getSoundSettings(): Promise<SoundSettings> {
  return invoke<SoundSettings>('get_sound_settings');
}

export function saveSoundSettings(settings: SoundSettings): Promise<void> {
  return invoke<void>('save_sound_settings', { settings });
}

// ─── Notification Settings ──────────────────────────────────────────────────

export interface NotificationSettings {
  morningBriefEnabled: boolean;
  morningBriefTime: string;
  includeWeather: boolean;
  includeCalendar: boolean;
  remindersEnabled: boolean;
  defaultSnoozeDuration: '5m' | '15m' | '1h' | '1d';
  notifyOnAction: boolean;
  notifyOnApproval: boolean;
  actionDigest: 'immediate' | 'hourly' | 'daily';
  badgeCount: boolean;
  soundEffects: boolean;
}

export function getNotificationSettings(): Promise<NotificationSettings> {
  return invoke<NotificationSettings>('get_notification_settings');
}

export function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  return invoke<void>('save_notification_settings', { settings });
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export function triggerSync(): Promise<TriggerSyncResult> {
  return sidecarRequest<TriggerSyncResult>({ method: 'sync:trigger', params: {} });
}

// ─── Knowledge Curation ─────────────────────────────────────────────────────

export function listKnowledgeByCategory(
  category: string,
  options?: { limit?: number; offset?: number; searchQuery?: string },
): Promise<KnowledgeChunkListResult> {
  return invoke<KnowledgeChunkListResult>('list_knowledge_by_category', {
    category,
    limit: options?.limit ?? 50,
    offset: options?.offset ?? 0,
    searchQuery: options?.searchQuery,
  });
}

export function removeKnowledgeItem(chunkId: string): Promise<KnowledgeCurationResult> {
  return invoke<KnowledgeCurationResult>('remove_knowledge_item', { chunkId });
}

export function deleteKnowledgeItem(chunkId: string): Promise<KnowledgeCurationResult> {
  return invoke<KnowledgeCurationResult>('delete_knowledge_item', { chunkId });
}

export function recategorizeKnowledgeItem(
  chunkId: string,
  newCategory: string,
): Promise<KnowledgeCurationResult> {
  return invoke<KnowledgeCurationResult>('recategorize_knowledge_item', { chunkId, newCategory });
}

export function reindexKnowledgeItem(chunkId: string): Promise<KnowledgeCurationResult> {
  return invoke<KnowledgeCurationResult>('reindex_knowledge_item', { chunkId });
}

export function suggestKnowledgeCategories(chunkId: string): Promise<KnowledgeCategorySuggestion[]> {
  return invoke<KnowledgeCategorySuggestion[]>('suggest_knowledge_categories', { chunkId });
}

export function listKnowledgeCategories(): Promise<KnowledgeCategoryInfo[]> {
  return invoke<KnowledgeCategoryInfo[]>('list_knowledge_categories');
}

// ─── Merkle Chain / Audit Integrity ─────────────────────────────────────────

export function verifyAuditChain(
  startDate?: string,
  endDate?: string,
): Promise<ChainVerificationResult> {
  return invoke<ChainVerificationResult>('audit_verify_chain', { startDate, endDate });
}

export function generateAuditReceipt(date: string): Promise<SignedDailyReceipt> {
  return invoke<SignedDailyReceipt>('audit_generate_receipt', { date });
}

export function getAuditChainStatus(): Promise<ChainStatus> {
  return invoke<ChainStatus>('audit_get_chain_status');
}

// ─── Hardware-Bound Keys ─────────────────────────────────────────────────

export function getHardwareKeyInfo(keyId?: string): Promise<HardwareKeyInfo> {
  return invoke<HardwareKeyInfo>('hw_key_get_info', { keyId: keyId ?? null });
}

export function hardwareKeySign(payload: string, keyId?: string): Promise<HardwareSignResult> {
  return invoke<HardwareSignResult>('hw_key_sign', { payload, keyId: keyId ?? null });
}

export function hardwareKeyVerify(payload: string, signatureHex: string, keyId?: string): Promise<HardwareVerifyResult> {
  return invoke<HardwareVerifyResult>('hw_key_verify', { payload, signatureHex, keyId: keyId ?? null });
}

export function getHardwareKeyBackend(): Promise<{ backend: HardwareKeyBackend }> {
  return invoke<{ backend: HardwareKeyBackend }>('hw_key_get_backend');
}

// ─── Sovereignty Report ─────────────────────────────────────────────────────

export function generateSovereigntyReport(periodStart: string, periodEnd: string): Promise<SovereigntyReportData> {
  return invoke<SovereigntyReportData>('report_generate_sovereignty', { periodStart, periodEnd });
}

export function verifySovereigntyReport(reportJson: string): Promise<SovereigntyReportVerifyResult> {
  return invoke<SovereigntyReportVerifyResult>('report_verify_sovereignty', { reportJson });
}

export function renderSovereigntyReportPDF(reportJson: string): Promise<{ pdfBase64: string }> {
  return invoke<{ pdfBase64: string }>('report_render_pdf', { reportJson });
}

// ─── Morning Brief ──────────────────────────────────────────────────────────

export function getMorningBrief(): Promise<import('./types.js').MorningBriefResult> {
  return invoke<import('./types.js').MorningBriefResult>('brief_get_morning');
}

export function dismissMorningBrief(id: string): Promise<void> {
  return invoke<void>('brief_dismiss', { id });
}

export function getTodaySnapshot(): Promise<import('./types.js').TodaySnapshotResult> {
  return sidecarCall<import('./types.js').TodaySnapshotResult>('today:get_snapshot');
}

export function getProofCenterSnapshot(): Promise<import('./types.js').ProofCenterSnapshotResult> {
  return sidecarCall<import('./types.js').ProofCenterSnapshotResult>('proof:get_center_snapshot');
}

export function getWeather(): Promise<import('./types.js').WeatherResult> {
  return invoke<import('./types.js').WeatherResult>('weather_get_current');
}

export function getCommutes(): Promise<import('./types.js').CommuteResult> {
  return invoke<import('./types.js').CommuteResult>('commute_get_today');
}

export function getKnowledgeMoment(): Promise<import('./types.js').KnowledgeMomentResult> {
  return invoke<import('./types.js').KnowledgeMomentResult>('knowledge_get_moment');
}

export function getAlterEgoActivationPrompt(): Promise<import('./types.js').AlterEgoActivationResult | null> {
  return invoke<import('./types.js').AlterEgoActivationResult | null>('alter_ego_get_activation_prompt');
}

export function getDailyDigest(): Promise<import('./types.js').DailyDigestResult | null> {
  return invoke<import('./types.js').DailyDigestResult | null>('digest_get_daily');
}

export function dismissDailyDigest(id: string): Promise<void> {
  return invoke<void>('digest_dismiss_daily', { id });
}

// ─── Knowledge Graph ────────────────────────────────────────────────────────

export function getKnowledgeGraphData(): Promise<import('./types.js').VisualizationGraph> {
  return invoke<import('./types.js').VisualizationGraph>('knowledge_get_graph');
}

export function getKnowledgeNodeContext(nodeId: string): Promise<import('./types.js').NodeContext> {
  return invoke<import('./types.js').NodeContext>('knowledge_get_node_context', { nodeId });
}

export function exportKnowledgeGraph(): Promise<void> {
  return invoke<void>('knowledge_export_graph');
}

// ─── Escalation ─────────────────────────────────────────────────────────────

export function getEscalationPrompts(): Promise<import('./types.js').EscalationPromptData[]> {
  return invoke<import('./types.js').EscalationPromptData[]>('escalation_get_prompts');
}

// ─── Clipboard Insights ─────────────────────────────────────────────────────

export function getClipboardInsights(): Promise<import('./types.js').ClipboardInsightData[]> {
  return invoke<import('./types.js').ClipboardInsightData[]>('clipboard_get_insights');
}

export function executeClipboardAction(actionId: string): Promise<void> {
  return invoke<void>('clipboard_execute_action', { actionId });
}

export function dismissClipboardInsight(actionId: string): Promise<void> {
  return invoke<void>('clipboard_dismiss_insight', { actionId });
}

// ─── Reminders ──────────────────────────────────────────────────────────────

export function getReminders(): Promise<import('./types.js').ReminderData[]> {
  return invoke<import('./types.js').ReminderData[]>('reminder_list');
}

export function snoozeReminder(id: string, duration: string): Promise<void> {
  return invoke<void>('reminder_snooze', { id, duration });
}

export function dismissReminder(id: string): Promise<void> {
  return invoke<void>('reminder_dismiss', { id });
}

// ─── Quick Capture ──────────────────────────────────────────────────────────

export function quickCapture(text: string): Promise<import('./types.js').CaptureResult> {
  return invoke<import('./types.js').CaptureResult>('quick_capture', { text });
}

// ─── Style Profile ──────────────────────────────────────────────────────────

export function getStyleProfile(): Promise<import('./types.js').StyleProfileResult | null> {
  return invoke<import('./types.js').StyleProfileResult | null>('style_get_profile');
}

export function reanalyzeStyle(): Promise<void> {
  return invoke<void>('style_reanalyze');
}

export function resetStyleProfile(): Promise<void> {
  return invoke<void>('style_reset');
}

// ─── Dark Pattern Detection ─────────────────────────────────────────────────

export function getDarkPatternFlags(): Promise<import('./types.js').DarkPatternResult[]> {
  return invoke<import('./types.js').DarkPatternResult[]>('dark_pattern_get_flags');
}

export function dismissDarkPatternFlag(contentId: string): Promise<void> {
  return invoke<void>('dark_pattern_dismiss', { contentId });
}

// ─── Voice Models ───────────────────────────────────────────────────────────

export function getVoiceModelStatus(): Promise<import('./types.js').VoiceModelStatus> {
  return invoke<import('./types.js').VoiceModelStatus>('voice_get_model_status');
}

export function downloadVoiceModel(model: 'whisper' | 'piper'): Promise<void> {
  return invoke<void>('voice_download_model', { model });
}

// ─── Import Digital Life ────────────────────────────────────────────────────

export function getImportHistory(): Promise<import('./types.js').ImportHistoryData[]> {
  return invoke<import('./types.js').ImportHistoryData[]>('import_get_history');
}

export function startImport(sourceId: string): Promise<void> {
  return invoke<void>('import_start', { sourceId });
}

// ─── Model Downloads (Settings) ─────────────────────────────────────────────

export function getModelDownloadStatus(): Promise<import('./types.js').ModelDownloadState[]> {
  return invoke<import('./types.js').ModelDownloadState[]>('model_get_download_status');
}

export function retryModelDownload(modelName: string): Promise<void> {
  return invoke<void>('model_retry_download', { modelName });
}

// ─── Alter Ego Week ─────────────────────────────────────────────────────────

export function getAlterEgoWeekProgress(): Promise<import('./types.js').AlterEgoWeekProgressData | null> {
  return invoke<import('./types.js').AlterEgoWeekProgressData | null>('alter_ego_get_week_progress');
}

export function completeAlterEgoDay(day: number): Promise<void> {
  return invoke<void>('alter_ego_complete_day', { day });
}

export function skipAlterEgoDay(): Promise<void> {
  return invoke<void>('alter_ego_skip_day');
}

// ─── Location Settings ─────────────────────────────────────────────────────

export interface LocationSettings {
  enabled: boolean;
  defaultCity: string;
  weatherEnabled: boolean;
  commuteEnabled: boolean;
  remindersEnabled: boolean;
  retentionDays: number;
}

export function getLocationSettings(): Promise<LocationSettings> {
  return invoke<LocationSettings>('get_location_settings');
}

export function saveLocationSettings(settings: LocationSettings): Promise<void> {
  return invoke<void>('save_location_settings', { settings });
}

export function clearLocationHistory(): Promise<{ cleared: boolean }> {
  return invoke<{ cleared: boolean }>('clear_location_history');
}

// ─── Upgrade Email Capture ──────────────────────────────────────────────────

export function submitUpgradeEmail(email: string): Promise<void> {
  return invoke<void>('upgrade_submit_email', { email });
}

// ─── BitNet Model Management ────────────────────────────────────────────────

export interface BitNetModelIPC {
  id: string;
  displayName: string;
  family: string;
  parameterCount: string;
  fileSizeBytes: number;
  ramRequiredMb: number;
  license: string;
  nativeOneBit: boolean;
  contextLength: number;
  isDownloaded: boolean;
  isRecommended: boolean;
}

export interface BitNetModelsResponse {
  models: BitNetModelIPC[];
  recommendedModelId: string;
  activeModelId: string | null;
}

export function getBitNetModels(tier?: string): Promise<BitNetModelsResponse> {
  return invoke<BitNetModelsResponse>('bitnet_get_available_models', { tier: tier ?? '' });
}

export function downloadBitNetModel(modelId: string): Promise<{ status: string; modelId: string }> {
  return invoke<{ status: string; modelId: string }>('bitnet_download_model', { modelId });
}

export function activateBitNetModel(modelId: string): Promise<{ status: string; modelId: string }> {
  return invoke<{ status: string; modelId: string }>('bitnet_set_active_model', { modelId });
}

export function getBitNetStatus(): Promise<{
  downloadedModels: Array<{ modelId: string; sizeBytes: number; displayName: string }>;
  totalDownloadedBytes: number;
  catalogSize: number;
}> {
  return invoke('bitnet_get_status');
}

// ─── Standard Model Management ──────────────────────────────────────────────

export interface StandardModelsResponse {
  models: BitNetModelIPC[];
  activeModelId: string | null;
}

export function getStandardModels(tier?: string): Promise<StandardModelsResponse> {
  return invoke<StandardModelsResponse>('standard_get_models', tier ? { tier } : undefined);
}

export function downloadStandardModel(modelId: string): Promise<{ status: string; modelId: string }> {
  return invoke<{ status: string; modelId: string }>('standard_download_model', { modelId });
}

export function activateStandardModel(modelId: string): Promise<{ status: string; modelId: string }> {
  return invoke<{ status: string; modelId: string }>('standard_set_active', { modelId });
}

// ─── Living Will ───────────────────────────────────────────────────────────

export interface LivingWillExportRecord {
  id: string;
  timestamp: string;
  path: string;
  sizeBytes: number;
  encrypted: boolean;
}

export interface LivingWillSettings {
  autoExportEnabled: boolean;
  cadence: 'weekly' | 'monthly' | 'quarterly';
}

export function livingWillGetHistory(): Promise<LivingWillExportRecord[]> {
  return sidecarCall<Array<Record<string, unknown>>>('living_will_get_history').then(raw =>
    (raw ?? []).map(r => ({
      id: (r.id as string) ?? '',
      timestamp: (r.exportedAt as string) ?? (r.exported_at as string) ?? '',
      path: (r.archivePath as string) ?? (r.archive_path as string) ?? '',
      sizeBytes: (r.sizeBytes as number) ?? 0,
      encrypted: true,
    })),
  );
}

export function livingWillGetSettings(): Promise<LivingWillSettings> {
  return sidecarCall<LivingWillSettings>('living_will_get_settings');
}

export function livingWillUpdateSettings(cadence: string): Promise<void> {
  return sidecarCall<void>('living_will_update_settings', { cadence });
}

export interface LivingWillExportResult {
  success: boolean;
  archivePath?: string;
  error?: string;
  sectionCounts?: Record<string, number>;
}

export function livingWillExport(params: {
  passphrase: string;
  outputPath: string;
  sections: string[];
}): Promise<LivingWillExportResult> {
  return sidecarCall<LivingWillExportResult>('living_will_export', params as unknown as Record<string, unknown>);
}

export function livingWillImport(params: {
  archivePath: string;
  passphrase: string;
}): Promise<{ imported: boolean }> {
  return sidecarCall<{ imported: boolean }>('living_will_import', params as unknown as Record<string, unknown>);
}

// ─── Witness / Attestation ─────────────────────────────────────────────────

/**
 * Raw backend JSON-LD attestation shape returned by the sidecar.
 * Maps to core WitnessAttestation type from packages/core/witness/types.ts.
 */
export interface RawWitnessAttestation {
  '@context'?: string;
  '@type'?: string;
  id: string;
  action?: string;
  autonomyTier?: string;
  device?: { id?: string; platform?: string };
  createdAt?: string;
  auditEntryId?: string;
  proof?: { type?: string; created?: string; verificationMethod?: string; proofPurpose?: string; proofValue?: string };
  vti?: Record<string, unknown> | null;
}

/**
 * Frontend display shape for witness attestations.
 */
export interface WitnessAttestation {
  id: string;
  actionType: string;
  description: string;
  timestamp: string;
  hash: string;
  verified: boolean;
}

/**
 * Map backend JSON-LD attestation to frontend display format.
 */
function mapRawAttestation(raw: RawWitnessAttestation): WitnessAttestation {
  return {
    id: raw.id ?? 'unknown',
    actionType: raw['@type'] ?? 'SemblanceWitnessAttestation',
    description: raw.action ?? 'Attestation',
    timestamp: raw.createdAt ?? new Date().toISOString(),
    hash: raw.proof?.proofValue ?? raw.id ?? '',
    verified: !!raw.proof?.proofValue,
  };
}

export async function witnessGetAttestations(): Promise<WitnessAttestation[]> {
  const raw = await sidecarCall<RawWitnessAttestation[]>('witness_get_attestations');
  return raw.map(mapRawAttestation);
}

export async function witnessGenerateAttestation(params: {
  auditEntryId: string;
  actionSummary: string;
}): Promise<WitnessAttestation> {
  const result = await sidecarCall<{ success: boolean; attestation?: RawWitnessAttestation; error?: string }>(
    'witness_generate_attestation',
    params as unknown as Record<string, unknown>,
  );
  if (!result.success || !result.attestation) {
    throw new Error(result.error ?? 'Failed to generate attestation');
  }
  return mapRawAttestation(result.attestation);
}

export function witnessExportAttestation(attestationId: string): Promise<{ json: string; attestation: RawWitnessAttestation }> {
  return sidecarCall<{ json: string; attestation: RawWitnessAttestation }>('witness_export_attestation', { attestationId });
}

export function witnessVerifyAttestation(attestationId: string): Promise<{ id: string; valid: boolean; hasSignature?: boolean; algorithm?: string; signedAt?: string; reason?: string }> {
  return sidecarCall<{ id: string; valid: boolean; hasSignature?: boolean; algorithm?: string; signedAt?: string; reason?: string }>('witness_verify_attestation', { attestationId });
}

// ─── Inheritance Protocol ──────────────────────────────────────────────────

export interface InheritanceConfig {
  enabled: boolean;
  timeLockHours?: number;
  requireStepConfirmation?: boolean;
  requireAllPartiesForDeletion?: boolean;
  lastReviewedAt?: string | null;
}

export interface InheritanceTrustedParty {
  id: string;
  name: string;
  email: string;
  relationship: string;
  role: string;
  status: string;
}

export function inheritanceGetConfig(): Promise<InheritanceConfig> {
  return sidecarCall<InheritanceConfig>('inheritance_get_config');
}

export function inheritanceUpdateConfig(params: Partial<InheritanceConfig>): Promise<InheritanceConfig> {
  return sidecarCall<InheritanceConfig>('inheritance_update_config', params as unknown as Record<string, unknown>);
}

export function inheritanceGetTrustedParties(): Promise<InheritanceTrustedParty[]> {
  return sidecarCall<InheritanceTrustedParty[]>('inheritance_get_trusted_parties');
}

export function inheritanceAddTrustedParty(params: {
  name: string;
  email: string;
  relationship: string;
  passphraseHash?: string;
}): Promise<InheritanceTrustedParty> {
  return sidecarCall<InheritanceTrustedParty>('inheritance_add_trusted_party', params as unknown as Record<string, unknown>);
}

export function inheritanceRemoveTrustedParty(id: string): Promise<{ success: boolean }> {
  return sidecarCall<{ success: boolean }>('inheritance_remove_trusted_party', { id });
}

export function inheritanceRunTest(): Promise<{
  success: boolean;
  message: string;
  mode?: string;
  configValid?: boolean;
  trustedPartyCount?: number;
  actionCount?: number;
}> {
  return sidecarCall<{
    success: boolean;
    message: string;
    mode?: string;
    configValid?: boolean;
    trustedPartyCount?: number;
    actionCount?: number;
  }>('inheritance_run_test');
}

// ─── Backup & Restore ──────────────────────────────────────────────────────

export interface BackupConfig {
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  destinations: BackupDestinationEntry[];
}

export interface BackupDestinationEntry {
  id: string;
  name: string;
  type: 'local' | 'usb' | 'network';
  path: string;
  lastBackupAt: string | null;
  sizeBytes: number;
}

export interface BackupHistoryRecord {
  id: string;
  destinationId: string;
  destinationName: string;
  timestamp: string;
  sizeBytes: number;
  status: 'success' | 'failed' | 'partial';
  durationSeconds: number;
}

export function backupGetConfig(): Promise<BackupConfig> {
  return sidecarCall<BackupConfig>('backup_get_config');
}

export function backupGetHistory(): Promise<BackupHistoryRecord[]> {
  return sidecarCall<BackupHistoryRecord[]>('backup_get_history');
}

export function backupUpdateConfig(params: Partial<BackupConfig>): Promise<void> {
  return sidecarCall<void>('backup_update_config', params as unknown as Record<string, unknown>);
}

export function backupCreate(passphrase: string): Promise<BackupHistoryRecord> {
  return sidecarCall<BackupHistoryRecord>('backup_create', { passphrase });
}

export function backupRestore(params: { filePath: string; passphrase: string }): Promise<{ restored: boolean }> {
  return sidecarCall<{ restored: boolean }>('backup_restore', params as unknown as Record<string, unknown>);
}

export function backupAddDestination(params: { name: string; path: string; type: 'local' | 'usb' | 'network' }): Promise<BackupDestinationEntry> {
  return sidecarCall<BackupDestinationEntry>('backup_add_destination', params as unknown as Record<string, unknown>);
}

export function backupRemoveDestination(id: string): Promise<void> {
  return sidecarCall<void>('backup_remove_destination', { id });
}

// ─── Semblance Network (Peer Sharing) ───────────────────────────────────────

export interface NetworkPeer {
  id: string;
  name: string;
  type: string;
  pairedAt: string;
  lastSeen?: string;
}

export interface PeerSharingConfig {
  calendarAvailability: boolean;
  communicationStyle: boolean;
  projectContext: boolean;
  topicExpertise: boolean;
}

export function networkPeersList(): Promise<NetworkPeer[]> {
  return invoke<NetworkPeer[]>('sidecar_request', {
    request: { method: 'network_peers_list', params: {} },
  });
}

export function networkPeerConnect(code: string): Promise<unknown> {
  return invoke<unknown>('sidecar_request', {
    request: { method: 'network_peer_connect', params: { code } },
  });
}

export function networkPeerDisconnect(peerId: string): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'network_peer_disconnect', params: { peerId } },
  });
}

export function networkPeerSharingConfig(peerId: string, config?: PeerSharingConfig): Promise<PeerSharingConfig> {
  return invoke<PeerSharingConfig>('sidecar_request', {
    request: { method: 'network_peer_sharing_config', params: { peerId, config } },
  });
}

export function networkGenerateConnectCode(): Promise<{ code: string }> {
  return invoke<{ code: string }>('sidecar_request', {
    request: { method: 'network_generate_connect_code', params: {} },
  });
}

// ─── Generic Preferences (SQLite-backed, replaces localStorage) ─────────────

export async function prefGet(key: string): Promise<string | null> {
  const res = await invoke<{ value: string | null }>('sidecar_request', {
    request: { method: 'pref_get', params: { key } },
  });
  return res.value;
}

export function prefSet(key: string, value: string): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'pref_set', params: { key, value } },
  });
}

export function prefDelete(key: string): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'pref_delete', params: { key } },
  });
}

export function prefClearSession(): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'pref_clear_session', params: {} },
  });
}

export function prefResetAll(): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'pref_reset_all', params: {} },
  });
}

// ─── Settings Badge IPC Wrappers (via ipc_send) ─────────────────────────────

function ipcSendGeneric<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('ipc_send', { method, params });
}

export function getChannelList(): Promise<Array<{ connected?: boolean }>> {
  return ipcSendGeneric<Array<{ connected?: boolean }>>('channel_list');
}

export function getSessionList(): Promise<unknown[]> {
  return ipcSendGeneric<unknown[]>('session_list');
}

export function getTunnelPairedDevices(): Promise<unknown[]> {
  return ipcSendGeneric<unknown[]>('tunnel_list_paired_devices');
}

export function getHighConfidencePreferences(): Promise<unknown[]> {
  return ipcSendGeneric<unknown[]>('preference_get_high_confidence');
}

export function getSkillList(): Promise<Array<{ enabled?: boolean }>> {
  return ipcSendGeneric<Array<{ enabled?: boolean }>>('skill_list');
}

export function getBinaryAllowlistList(): Promise<unknown[]> {
  return ipcSendGeneric<unknown[]>('binary_allowlist_list');
}

export function getBackupStatus(): Promise<{ lastBackupAt?: string } | null> {
  return sidecarCall<{ lastBackupAt?: string } | null>('backup_get_status');
}

/** Clear knowledge data via sidecar */
export function clearKnowledgeData(): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'clear_knowledge_data', params: {} },
  });
}

/** Clear all data via sidecar */
export function clearAllData(): Promise<void> {
  return invoke<void>('sidecar_request', {
    request: { method: 'clear_all_data', params: {} },
  });
}

// ─── Vault Surface ──────────────────────────────────────────────────────────

export function listVaultSources(): Promise<VaultSourceSummary[]> {
  return sidecarCall<VaultSourceSummary[]>('vault:list_sources');
}

export function listVaultAssertions(): Promise<VaultAssertionSummary[]> {
  return sidecarCall<VaultAssertionSummary[]>('vault:list_assertions');
}

export function getVaultStatus(): Promise<VaultSurfaceStatus> {
  return sidecarCall<VaultSurfaceStatus>('vault:get_status');
}

export function exportVaultSnapshot(): Promise<VaultSurfaceExport> {
  return sidecarCall<VaultSurfaceExport>('vault:export');
}

export function deleteVaultSource(sourceId: string): Promise<VaultDeleteSourceResult> {
  return sidecarCall<VaultDeleteSourceResult>('vault:delete_source', { sourceId });
}

// ─── Work / Proof ─────────────────────────────────────────────────────────

export function listWorkActions(limit = 100, offset = 0): Promise<WorkActionView[]> {
  return sidecarCall<WorkActionView[]>('work:list_actions', { limit, offset });
}

export function getWorkAction(actionId: string): Promise<WorkActionView> {
  return sidecarCall<WorkActionView>('work:get_action', { actionId });
}

export function approveWorkAction(actionId: string): Promise<WorkApproveActionResult> {
  return sidecarCall<WorkApproveActionResult>('work:approve_action', { actionId });
}

export function getActionReceipt(actionId: string): Promise<ActionReceipt> {
  return sidecarCall<ActionReceipt>('proof:get_receipt', { actionId });
}

export function listDelegatedPlans(
  statuses?: DelegatedPlanStatus[],
  limit = 50,
  offset = 0,
): Promise<DelegatedPlanView[]> {
  return sidecarCall<DelegatedPlanView[]>('plans:list', { statuses, limit, offset });
}

export function getDelegatedPlan(planId: string): Promise<DelegatedPlanView> {
  return sidecarCall<DelegatedPlanView>('plans:get', { planId });
}

export function createDelegatedPlan(input: CreateDelegatedPlanInput): Promise<DelegatedPlanView> {
  return sidecarCall<DelegatedPlanView>('plans:create', input);
}

export function updateDelegatedPlan(input: UpdateDelegatedPlanInput): Promise<DelegatedPlanView> {
  return sidecarCall<DelegatedPlanView>('plans:update', input);
}

// ─── Cloud Bridge ──────────────────────────────────────────────────────────

export interface CloudBridgeProviderIPC {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'rate_limited';
  models: Array<{ id: string; displayName: string; contextWindow: number }>;
  usageThisMonth: { requests: number; tokensIn: number; tokensOut: number; estimatedCost: number | null };
  lastValidatedAt: string | null;
  errorMessage: string | null;
}

export interface CloudBridgePolicyIPC {
  mode: 'off' | 'manual' | 'smart' | 'always';
  domainRules: Record<string, { routing: 'local' | 'cloud' | 'never_cloud'; preferredProvider?: string; preferredModel?: string }>;
  excludedCategories: string[];
  spendingCap: { enabled: boolean; monthlyLimit: number; currentSpend: number };
  previewBeforeSend: boolean;
}

export function cloudBridgeGetProviders(): Promise<CloudBridgeProviderIPC[]> {
  return sidecarCall<CloudBridgeProviderIPC[]>('cloud_bridge_get_providers');
}

export function cloudBridgeAddProvider(params: {
  providerId: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<{ success: boolean; provider?: CloudBridgeProviderIPC; error?: string }> {
  return sidecarCall('cloud_bridge_add_provider', params as unknown as Record<string, unknown>);
}

export function cloudBridgeRemoveProvider(providerId: string): Promise<{ success: boolean }> {
  return sidecarCall<{ success: boolean }>('cloud_bridge_remove_provider', { providerId });
}

export function cloudBridgeValidateKey(params: {
  providerId: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<{ valid: boolean; models?: Array<{ id: string; displayName: string }>; error?: string }> {
  return sidecarCall('cloud_bridge_validate_key', params as unknown as Record<string, unknown>);
}

export function cloudBridgeGetPolicy(): Promise<CloudBridgePolicyIPC> {
  return sidecarCall<CloudBridgePolicyIPC>('cloud_bridge_get_policy');
}

export function cloudBridgeSetPolicy(policy: CloudBridgePolicyIPC): Promise<{ success: boolean }> {
  return sidecarCall<{ success: boolean }>('cloud_bridge_set_policy', policy as unknown as Record<string, unknown>);
}

export function cloudBridgeGetUsage(): Promise<{
  providers: Array<{ id: string; name: string; requests: number; tokensIn: number; tokensOut: number; estimatedCost: number | null }>;
  totalRequests: number;
  totalCost: number | null;
}> {
  return sidecarCall('cloud_bridge_get_usage');
}

// ─── Execution destination policy (Capabilities) ─────────────────────────────

export type CapabilityDestinationPreference = 'local' | 'self_hosted' | 'byo' | 'ask';
export type CapabilityModelClass = 'fast' | 'balanced' | 'reasoning';

export interface CapabilityDestinationConfigIPC {
  destinationPreference: CapabilityDestinationPreference;
  disclosureCeiling: number;
  modelClass: CapabilityModelClass;
  budgetCents: number;
  latencyMaxMs: number;
}

export interface ExecutionDestinationPolicyIPC {
  schemaVersion: 1;
  localOnlyKillSwitch: boolean;
  capabilities: Record<string, CapabilityDestinationConfigIPC>;
  updatedAt: string;
}

export interface ExecutionRunReceiptIPC {
  id: string;
  requestId: string;
  capabilityId: string;
  domain: string;
  taskType: string;
  status: 'success' | 'ask' | 'reject';
  destination: string | null;
  reason: string;
  timestamp: string;
  model: string | null;
  provider: string | null;
  disclosureReceipt: {
    schemaVersion: 1;
    label: 'byo' | 'self_hosted';
    requestId: string;
    destination: 'byo' | 'self_hosted';
    provider: string;
    model: string;
    promptContentHash: string;
    responseContentHash: string;
    timestamp: string;
    tokensUsed: { prompt: number; completion: number; total: number };
  } | null;
}

export function executionGetDestinationPolicy(): Promise<ExecutionDestinationPolicyIPC> {
  return sidecarCall<ExecutionDestinationPolicyIPC>('execution:get_destination_policy');
}

export function executionSetDestinationPolicy(
  policy: ExecutionDestinationPolicyIPC,
): Promise<{ success: boolean; policy: ExecutionDestinationPolicyIPC }> {
  return sidecarCall<{ success: boolean; policy: ExecutionDestinationPolicyIPC }>(
    'execution:set_destination_policy',
    policy as unknown as Record<string, unknown>,
  );
}

export function executionListReceipts(limit = 20): Promise<{ receipts: ExecutionRunReceiptIPC[] }> {
  return sidecarCall<{ receipts: ExecutionRunReceiptIPC[] }>('execution:list_receipts', { limit });
}

export interface CloudBudgetDocumentIPC {
  schemaVersion: 1;
  perTaskEstimateCents: number;
  dailyHardLimitCents: number;
  monthlyHardLimitCents: number;
  allowedDestinations: readonly string[];
  allowedModelClasses: readonly string[];
  cloudDisabled: boolean;
  alertThresholdPercent: number;
  dailySpentCents: number;
  monthlySpentCents: number;
  spendDayKey: string;
  spendMonthKey: string;
  updatedAt: string;
}

export interface CloudBudgetSummaryIPC {
  dailySpentCents: number;
  monthlySpentCents: number;
  dailyHardLimitCents: number;
  monthlyHardLimitCents: number;
  perTaskEstimateCents: number;
  cloudDisabled: boolean;
  alertThresholdPercent: number;
  alerts: readonly string[];
}

export function cloudBudgetGet(): Promise<{ budget: CloudBudgetDocumentIPC; summary: CloudBudgetSummaryIPC }> {
  return sidecarCall<{ budget: CloudBudgetDocumentIPC; summary: CloudBudgetSummaryIPC }>('cloud_budget:get');
}

export function cloudBudgetSet(
  budget: Partial<CloudBudgetDocumentIPC>,
): Promise<{ success: boolean; budget: CloudBudgetDocumentIPC; summary: CloudBudgetSummaryIPC }> {
  return sidecarCall<{ success: boolean; budget: CloudBudgetDocumentIPC; summary: CloudBudgetSummaryIPC }>(
    'cloud_budget:set',
    budget as unknown as Record<string, unknown>,
  );
}

export function cloudBudgetSetDisabled(
  disabled: boolean,
): Promise<{ success: boolean; budget: CloudBudgetDocumentIPC; summary: CloudBudgetSummaryIPC }> {
  return sidecarCall<{ success: boolean; budget: CloudBudgetDocumentIPC; summary: CloudBudgetSummaryIPC }>(
    'cloud_budget:set_disabled',
    { disabled },
  );
}

// ─── Extension permission center (Slice 12) ───────────────────────────────────

export interface ExtensionPermissionBundleIPC {
  dataCapabilities: string[];
  actionCapabilities: string[];
  networkDestinations: string[];
  tools: string[];
  insightTypes: string[];
  uiSlots: string[];
  schedules: string[];
  entitlement: string | null;
}

export interface InstalledExtensionIPC {
  manifestId: string;
  publisher: string;
  version: string;
  manifestPath: string;
  artifactPath: string;
  installDir: string;
  installedAt: string;
  revoked: boolean;
  enabled: boolean;
  ownership: 'marketplace' | 'user-local';
  requestedPermissions: ExtensionPermissionBundleIPC;
  grantedPermissions: ExtensionPermissionBundleIPC;
  migrationUninstall: 'delete' | 'retain_user_data' | 'ask';
}

export interface AvailableExtensionIPC {
  manifestId: string;
  publisher: string;
  version: string;
  manifestPath: string;
  artifactPath: string;
  requestedPermissions: ExtensionPermissionBundleIPC;
}

export function extensionListInstalled(): Promise<{
  installed: InstalledExtensionIPC[];
  available: AvailableExtensionIPC[];
}> {
  return sidecarCall<{ installed: InstalledExtensionIPC[]; available: AvailableExtensionIPC[] }>(
    'extension:list_installed',
  );
}

export function extensionInspect(manifestId: string): Promise<{ extension: InstalledExtensionIPC | AvailableExtensionIPC }> {
  return sidecarCall<{ extension: InstalledExtensionIPC | AvailableExtensionIPC }>('extension:inspect', { manifestId });
}

export function extensionInstall(params: {
  manifestPath: string;
  artifactPath?: string;
  grantedPermissions: ExtensionPermissionBundleIPC;
  ownership?: 'marketplace' | 'user-local';
}): Promise<{
  success: boolean;
  extension: InstalledExtensionIPC;
  runtimeLoaded: boolean;
  runtimeError: string | null;
}> {
  return sidecarCall('extension:install', params as unknown as Record<string, unknown>);
}

export function extensionSetPermissions(
  manifestId: string,
  grantedPermissions: ExtensionPermissionBundleIPC,
): Promise<{ success: boolean; extension: InstalledExtensionIPC }> {
  return sidecarCall('extension:set_permissions', { manifestId, grantedPermissions });
}

export function extensionRevoke(manifestId: string): Promise<{ success: boolean; extension: InstalledExtensionIPC }> {
  return sidecarCall('extension:revoke', { manifestId });
}

export function extensionUninstall(
  manifestId: string,
  retainUserData = false,
): Promise<{ success: boolean }> {
  return sidecarCall('extension:uninstall', { manifestId, retainUserData });
}
