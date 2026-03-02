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
  CloudConnectResult,
  CloudSyncResult,
  CloudFolder,
  SearchSettings,
  SaveSearchSettingsParams,
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

export function setAutonomyTier(domain: string, tier: string): Promise<void> {
  return invoke<void>('set_autonomy_tier', { domain, tier });
}

export function setOnboardingComplete(): Promise<void> {
  return invoke<void>('set_onboarding_complete');
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

export function sendMessage(message: string): Promise<void> {
  return invoke<void>('send_message', { message });
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

export function ipcSend(params: ConnectorAction): Promise<void> {
  return invoke<void>('ipc_send', { ...params });
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

// ─── Files / Indexing ───────────────────────────────────────────────────────

export function startIndexing(directories: string[]): Promise<void> {
  return invoke<void>('start_indexing', { directories });
}
