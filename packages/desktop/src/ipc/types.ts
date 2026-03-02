// Typed IPC interfaces for all Tauri invoke() commands and listen() events.
// Organized by domain. This is the single source of truth for desktop IPC types.

// ─── Hardware / Onboarding ──────────────────────────────────────────────────

export interface HardwareDisplayInfo {
  tier: string;
  totalRamMb: number;
  cpuCores: number;
  gpuName: string | null;
  gpuVramMb: number | null;
  os: string;
  arch: string;
}

export interface ProviderPreset {
  name: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  caldavUrl: string;
  notes: string;
}

export interface KnowledgeMoment {
  title: string;
  summary: string;
  connections: Array<{ from: string; to: string; relationship: string }>;
}

// ─── Credentials / Accounts ─────────────────────────────────────────────────

export interface AddCredentialParams {
  serviceType: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
  displayName: string;
}

export interface TestCredentialParams {
  serviceType: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
}

export interface TestCredentialResult {
  success: boolean;
  error?: string;
}

export interface AccountInfo {
  id: string;
  serviceType: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  displayName: string;
  useTls: boolean;
  createdAt: string;
}

export interface AccountStatus {
  serviceType: string;
  displayName: string;
  username: string;
  protocols: string[];
  connected: boolean;
}

// ─── Chat / LLM ────────────────────────────────────────────────────────────

export interface DocumentContext {
  documentId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}

// ─── Email / Calendar / Inbox ───────────────────────────────────────────────

export interface IndexedEmail {
  id: string;
  messageId: string;
  subject: string;
  from: string;
  to: string[];
  date: string;
  snippet: string;
  isRead: boolean;
  labels: string[];
  hasAttachments: boolean;
}

export interface ProactiveInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  actionable: boolean;
  suggestedAction?: string;
  relatedEntityId?: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  description?: string;
  isAllDay: boolean;
}

export interface ActionsSummary {
  todayCount: number;
  todayTimeSavedSeconds: number;
  recentActions: Array<{
    id: string;
    action: string;
    description: string;
    timestamp: string;
    timeSavedSeconds: number;
  }>;
}

export interface SendEmailParams {
  to: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}

// ─── Action Log / Approvals ─────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  status: string;
  description: string;
  autonomy_tier: string;
  payload_hash: string;
  audit_ref: string;
}

export interface PendingAction {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  reasoning: string;
  domain: string;
  tier: string;
  status: string;
  createdAt: string;
}

// ─── Digest ─────────────────────────────────────────────────────────────────

export interface DigestSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalActions: number;
  timeSavedFormatted: string;
  generatedAt: string;
}

export interface WeeklyDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalActions: number;
  totalTimeSavedSeconds: number;
  timeSavedFormatted: string;
  generatedAt: string;
  sections: Array<{
    title: string;
    items: Array<{
      description: string;
      count: number;
      timeSavedSeconds: number;
    }>;
  }>;
}

// ─── License ────────────────────────────────────────────────────────────────

export interface LicenseStatus {
  tier: 'free' | 'founding' | 'digital-representative' | 'lifetime';
  isPremium: boolean;
  isFoundingMember: boolean;
  foundingSeat: number | null;
  licenseKey: string | null;
}

export interface ActivationResult {
  success: boolean;
  tier?: string;
  expiresAt?: string;
  error?: string;
}

// ─── Network Monitor ────────────────────────────────────────────────────────

export type NetworkPeriod = 'today' | 'week' | 'month';

export interface NetworkStatistics {
  totalConnections: number;
  authorizedCount: number;
  blockedCount: number;
  bytesTransferred: number;
  topServices: Array<{ name: string; count: number }>;
}

export interface ActiveConnection {
  id: string;
  service: string;
  host: string;
  port: number;
  protocol: string;
  startedAt: string;
  bytesIn: number;
  bytesOut: number;
}

export interface AllowlistEntry {
  id: string;
  host: string;
  service: string;
  addedAt: string;
  lastUsedAt: string;
}

export interface UnauthorizedAttempt {
  id: string;
  host: string;
  port: number;
  protocol: string;
  timestamp: string;
  reason: string;
}

export interface TimelinePoint {
  timestamp: string;
  count: number;
  authorized: number;
  blocked: number;
}

export interface ConnectionRecord {
  id: string;
  service: string;
  host: string;
  timestamp: string;
  status: string;
  duration: number;
}

export interface PrivacyReport {
  startDate: string;
  endDate: string;
  format: string;
  data: unknown;
}

export interface TrustStatus {
  clean: boolean;
  unauthorizedCount: number;
  activeServiceCount: number;
}

// ─── Connectors (via ipc_send) ──────────────────────────────────────────────

export type ConnectorAction =
  | { action: 'connector.auth'; payload: { connectorId: string } }
  | { action: 'connector.disconnect'; payload: { connectorId: string } }
  | { action: 'connector.sync'; payload: { connectorId: string } }
  | { action: 'import.run'; payload: { sourcePath: string; sourceType: string } };

// ─── Contacts (via sidecar_request) ─────────────────────────────────────────

export type ContactSortField = 'name' | 'lastInteraction' | 'strength';

export interface ContactSummary {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  relationshipType: string;
  strength: number;
  lastInteractionAt: string;
}

export interface ContactDetail extends ContactSummary {
  notes?: string;
  birthday?: string;
  organization?: string;
  interactions: Array<{
    id: string;
    type: string;
    date: string;
    summary: string;
  }>;
}

export interface ContactStats {
  totalContacts: number;
  activeContacts: number;
  topRelationshipTypes: Array<{ type: string; count: number }>;
}

export interface BirthdayInfo {
  contactId: string;
  displayName: string;
  birthday: string;
  daysUntil: number;
}

export type SidecarRequest =
  | { method: 'contacts:list'; params: { limit: number; sortBy: ContactSortField } }
  | { method: 'contacts:getStats'; params: Record<string, never> }
  | { method: 'contacts:getUpcomingBirthdays'; params: Record<string, never> }
  | { method: 'contacts:get'; params: { id: string } }
  | { method: 'contacts:search'; params: { query: string; limit: number } };

// ─── Finance / Subscriptions ────────────────────────────────────────────────

export interface ImportStatementResult {
  transactionCount: number;
  merchantCount: number;
  dateRange: { start: string; end: string };
  recurringCount: number;
  forgottenCount: number;
  potentialSavings: number;
}

// ─── Cloud Storage ──────────────────────────────────────────────────────────

export interface CloudConnectResult {
  success: boolean;
  userEmail?: string;
  error?: string;
}

export interface CloudSyncResult {
  filesSynced: number;
  storageUsedBytes: number;
}

export interface CloudFolder {
  id: string;
  name: string;
  parentId: string | null;
}

// ─── Search Settings ────────────────────────────────────────────────────────

export interface SearchSettings {
  provider: string;
  braveApiKeySet: boolean;
  searxngUrl: string | null;
  rateLimit: number;
}

export interface SaveSearchSettingsParams {
  provider: string;
  braveApiKey: string | null;
  searxngUrl: string | null;
  rateLimit: number;
}

// ─── Event Payloads ─────────────────────────────────────────────────────────

export interface ChatTokenPayload {
  token: string;
}

export interface ChatCompletePayload {
  id: string;
  content: string;
}

export interface FoundingActivatePayload {
  token: string;
}

export interface LicenseActivatePayload {
  key: string;
}

export interface LicenseAutoActivatedPayload {
  tier: string;
  expiresAt?: string;
}
