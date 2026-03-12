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

export function getInboxItems(limit: number, offset: number): Promise<IndexedEmail[]> {
  return invoke<IndexedEmail[]>('get_inbox_items', { limit, offset });
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

export function approveAction(actionId: string): Promise<void> {
  return invoke<void>('approve_action', { actionId });
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

export function activateFoundingToken(token: string): Promise<ActivationResult> {
  return invoke<ActivationResult>('activate_founding_token', { token });
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

/** Returns list of connector IDs that have stored OAuth tokens */
export function getConnectedServices(): Promise<string[]> {
  return invoke<string[]>('sidecar_request', {
    request: { method: 'get_connected_services', params: {} },
  });
}

// ─── Contacts (via sidecar_request) ─────────────────────────────────────────

function sidecarRequest<T>(request: SidecarRequest): Promise<T> {
  return invoke<T>('sidecar_request', { request });
}

export function listContacts(limit: number, sortBy: 'name' | 'lastInteraction' | 'strength'): Promise<{ contacts: ContactSummary[] }> {
  return sidecarRequest<{ contacts: ContactSummary[] }>({ method: 'contacts:list', params: { limit, sortBy } });
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
