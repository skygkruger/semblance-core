// Typed IPC interfaces for all Tauri invoke() commands and listen() events.
// Organized by domain. This is the single source of truth for desktop IPC types.

// ─── Hardware / Onboarding ──────────────────────────────────────────────────

export interface HardwareGpuInfo {
  name: string;
  vendor: string;
  vramMb: number;
  computeCapable: boolean;
}

export interface HardwareDisplayInfo {
  tier: string;
  totalRamMb: number;
  cpuCores: number;
  cpuArch: string;
  availableRamMb: number;
  os: string;
  gpu: HardwareGpuInfo | null;
  voiceCapable: boolean;
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
  lastSyncedAt?: string | null;
  indexedCount?: number;
}

// ─── Chat / LLM ────────────────────────────────────────────────────────────

export interface DocumentContext {
  documentId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}

export type AttachmentStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface ChatAttachmentInfo {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  error?: string;
  documentId?: string;
  addedToKnowledge: boolean;
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
  estimatedTimeSaved: number;
  reasoningContext?: ReasoningContext;
}

export interface ReasoningChunkRef {
  chunkId: string;
  documentId: string;
  title: string;
  source: string;
  score: number;
}

export interface ReasoningContext {
  query: string;
  chunks: ReasoningChunkRef[];
  retrievedAt: string;
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
  reasoningContext?: ReasoningContext;
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

export interface ReservationImportResult {
  valid: boolean;
  kind: 'reservation_only';
  seat: number | null;
  imported?: boolean;
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

export type ContactSortField = 'display_name' | 'last_contact_date' | 'interaction_count';

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
  | { method: 'contacts:search'; params: { query: string; limit: number } }
  | { method: 'contacts:create'; params: { displayName: string; email?: string; phone?: string; organization?: string; relationshipType?: string } }
  | { method: 'contacts:update'; params: { id: string; updates: Record<string, unknown> } }
  | { method: 'contacts:delete'; params: { id: string } }
  | { method: 'contacts:getEmailHistory'; params: { contactEmail: string } }
  | { method: 'contacts:getCalendarHistory'; params: { contactEmail: string } }
  | { method: 'contacts:getRelationshipGraph'; params: Record<string, never> }
  | { method: 'contacts:getFrequencyAlerts'; params: Record<string, never> }
  | { method: 'sync:trigger'; params: Record<string, never> };

// ─── Finance / Subscriptions ────────────────────────────────────────────────

export interface ImportStatementResult {
  transactionCount: number;
  merchantCount: number;
  dateRange: { start: string; end: string };
  recurringCount: number;
  forgottenCount: number;
  potentialSavings: number;
}

export type FinancialPeriod = '7d' | '30d' | '90d' | 'custom';

export interface FinancialOverview {
  totalSpending: number;
  previousPeriodSpending: number | null;
  transactionCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  percentage: number;
  transactionCount: number;
  trend: 'up' | 'down' | 'stable';
}

export interface SpendingAnomaly {
  id: string;
  type: 'unusual_amount' | 'new_merchant' | 'frequency_change' | 'duplicate';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  amount: number;
  merchantName: string;
  detectedAt: string;
}

export interface RecurringCharge {
  id: string;
  merchantName: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  confidence: number;
  lastChargeDate: string;
  chargeCount: number;
  estimatedAnnualCost: number;
  status: 'active' | 'forgotten' | 'cancelled' | 'user_confirmed';
}

export interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  forgottenCount: number;
  potentialSavings: number;
}

export interface FinancialDashboardData {
  overview: FinancialOverview;
  categories: CategoryBreakdown[];
  anomalies: SpendingAnomaly[];
  subscriptions: { charges: RecurringCharge[]; summary: SubscriptionSummary };
}

// ─── Health ────────────────────────────────────────────────────────────────

export interface HealthEntry {
  id: string;
  date: string;
  timestamp: string;
  mood: number | null;
  energy: number | null;
  waterGlasses: number | null;
  symptoms: string[];
  medications: string[];
  notes: string | null;
}

export interface HealthTrendPoint {
  date: string;
  mood: number | null;
  energy: number | null;
  waterGlasses: number | null;
  sleepHours: number | null;
  steps: number | null;
  heartRateAvg: number | null;
}

export interface HealthInsight {
  id: string;
  type: 'correlation' | 'trend' | 'streak';
  title: string;
  description: string;
  confidence: number;
  dataSources: string[];
  detectedAt: string;
}

export interface HealthDashboardData {
  todayEntry: HealthEntry | null;
  trends: HealthTrendPoint[];
  insights: HealthInsight[];
  symptomsHistory: string[];
  medicationsHistory: string[];
  hasHealthKit: boolean;
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

// ─── Conversation Management ────────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  title: string | null;
  autoTitle: string | null;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  pinnedAt: string | null;
  turnCount: number;
  lastMessagePreview: string | null;
  expiresAt: string | null;
}

export interface ConversationTurn {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SwitchConversationResult {
  conversationId: string;
  turns: ConversationTurn[];
}

export interface ConversationDeleteResult {
  success: boolean;
}

export interface ConversationClearResult {
  cleared: number;
}

export interface ConversationSearchResult {
  conversationId: string;
  conversationTitle: string;
  turnId: string;
  role: 'user' | 'assistant';
  excerpt: string;
  score: number;
  timestamp: string;
}

export interface ConversationSettings {
  autoExpiryDays: number | null;
}

export interface SendMessageResult {
  responseId: string;
  conversationId: string;
}

// ─── Intent Layer ──────────────────────────────────────────────────────────

export interface IntentProfile {
  primaryGoal: string | null;
  primaryGoalSetAt: string | null;
  hardLimits: HardLimitData[];
  personalValues: PersonalValueData[];
  updatedAt: string;
}

export interface HardLimitData {
  id: string;
  rawText: string;
  parsedRule: {
    action: 'never' | 'always_ask' | 'always';
    scope: string;
    target?: string;
    category?: 'person' | 'topic' | 'action' | 'data';
    confidence: number;
  };
  active: boolean;
  source: 'onboarding' | 'settings' | 'chat';
  createdAt: string;
  updatedAt: string;
}

export interface PersonalValueData {
  id: string;
  rawText: string;
  theme: string;
  source: 'onboarding' | 'settings' | 'chat';
  createdAt: string;
  active: boolean;
}

export interface IntentObservationData {
  id: string;
  observedAt: string;
  type: 'drift' | 'alignment' | 'conflict';
  description: string;
  evidence: string[];
  surfacedMorningBrief: boolean;
  surfacedInChat: boolean;
  dismissed: boolean;
  dismissedAt?: string;
  userResponse?: string;
}

export interface IntentCheckResultData {
  allowed: boolean;
  matchedLimits: HardLimitData[];
  alignmentScore: number;
  reasoning: string;
}

// ─── Sound Settings ─────────────────────────────────────────────────────────

export interface SoundSettings {
  enabled: boolean;
  categoryVolumes: Record<'actions' | 'system' | 'voice', number>;
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

// ─── Alter Ego Guardrails ──────────────────────────────────────────────────

export interface AlterEgoSettingsData {
  dollarThreshold: number;
  confirmationDisabledCategories: string[];
}

export interface AlterEgoReceiptData {
  id: string;
  actionType: string;
  summary: string;
  reasoning: string;
  status: 'executed' | 'undone';
  undoAvailable: boolean;
  undoExpiresAt: string | null;
  weekGroup: string;
  createdAt: string;
  executedAt: string;
}

export interface AlterEgoBatchItemData {
  id: string;
  action: string;
  payload: string;
  reasoning: string;
  domain: string;
  tier: string;
  status: string;
  createdAt: string;
}

export interface AlterEgoTrustData {
  contactEmail: string;
  scope: string;
  successfulSends: number;
  lastSendAt: string | null;
  trusted: boolean;
}

// ─── Knowledge Curation ─────────────────────────────────────────────────────

export interface KnowledgeChunkItem {
  chunkId: string;
  title: string;
  preview: string;
  fullContent: string;
  source: string;
  category: string;
  filePath?: string;
  indexedAt: string;
  fileSize?: number;
  mimeType?: string;
}

export interface KnowledgeCurationResult {
  success: boolean;
  chunkId: string;
  operation: 'remove' | 'delete' | 'recategorize' | 'reindex';
  detail?: string;
}

export interface KnowledgeCategorySuggestion {
  category: string;
  reason: string;
  confidence: number;
  isExisting: boolean;
}

export interface KnowledgeCategoryInfo {
  category: string;
  displayName: string;
  count: number;
  color: string;
}

export interface KnowledgeChunkListResult {
  items: KnowledgeChunkItem[];
  total: number;
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export interface TriggerSyncResult {
  status: 'success' | 'no_peer_found' | 'error';
  devicesFound: number;
  itemsSynced: number;
  error?: string;
}

// ─── Merkle Chain / Audit Integrity ─────────────────────────────────────────

export interface ChainVerificationResult {
  valid: boolean;
  firstBreak?: string;
  entryCount: number;
  daysVerified: number;
}

export interface SignedDailyReceipt {
  date: string;
  merkleRoot: string;
  chainedHash: string;
  entryCount: number;
  signature: string;
  publicKeyFingerprint: string;
  timestamp: string;
}

export interface ChainStatus {
  verified: boolean;
  entryCount: number;
  daysVerified: number;
  firstBreak?: string;
  lastVerifiedAt: string;
}

// ─── Hardware-Bound Keys ───────────────────────────────────────────────────

export type HardwareKeyBackend =
  | 'secure-enclave'
  | 'tpm'
  | 'android-keystore'
  | 'libsecret'
  | 'software'
  | 'memory-only';

export interface HardwareKeyInfo {
  keyId: string;
  backend: HardwareKeyBackend;
  publicKeyHex: string;
  createdAt: string;
  hardwareBacked: boolean;
}

export interface HardwareSignResult {
  signatureHex: string;
  keyId: string;
  backend: HardwareKeyBackend;
}

export interface HardwareVerifyResult {
  valid: boolean;
  keyId: string;
}

// ─── Sovereignty Report ───────────────────────────────────────────────────

export interface SovereigntyReportData {
  version: '1.0';
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  deviceId: string;
  knowledgeSummary: Record<string, number>;
  autonomousActions: {
    byDomain: Record<string, number>;
    byTier: Record<string, number>;
    totalTimeSavedSeconds: number;
  };
  hardLimitsEnforced: number;
  networkActivity: {
    connectionsByService: Record<string, number>;
    aiCoreConnections: 0;
    veridianConnections: 0;
    analyticsConnections: 0;
  };
  adversarialDefense: {
    darkPatternsDetected: number;
    manipulativeEmailsNeutralized: number;
    optOutActionsTaken: number;
  };
  auditChainStatus: {
    verified: boolean;
    totalEntries: number;
    daysCovered: number;
    breaks: string[];
  };
  signature: {
    algorithm: 'Ed25519';
    signatureHex: string;
    publicKeyFingerprint: string;
    verificationInstructions: string;
  };
  comparisonStatement: string;
}

export interface SovereigntyReportVerifyResult {
  valid: boolean;
}

export interface PrivacyStatusData {
  allLocal: boolean;
  connectionCount: number;
  lastAuditEntry: string | null;
  anomalyDetected: boolean;
  actionsLogged: number;
  timeSavedSeconds: number;
}

// ─── Today Snapshot Types ───────────────────────────────────────────────────

export interface TodaySnapshotResult {
  assembledAt: string;
  date: string;
  changes: Array<{
    id: string;
    title: string;
    source: string;
    sourcePath: string | null;
    updatedAt: string;
    changeType: 'indexed' | 'updated';
  }>;
  risks: Array<{
    id: string;
    kind: string;
    title: string;
    description: string;
    domain: string;
    severity: 'high' | 'medium' | 'low';
    source: string;
    createdAt: string;
  }>;
  completedActions: Array<{
    id: string;
    actionType: string;
    description: string;
    completedAt: string;
    estimatedTimeSavedSeconds: number;
    auditRef: string | null;
    source: string;
  }>;
  pendingDecisions: Array<{
    id: string;
    kind: string;
    title: string;
    description: string;
    domain: string;
    createdAt: string;
    source: string;
  }>;
  outcomes: Array<{
    id: string;
    title: string;
    measuredAt: string;
    timeSavedSeconds: number;
    source: string;
    auditRef: string | null;
  }>;
  provenance: {
    documentCountBySource: Record<string, number>;
    totalDocuments: number;
    lastIndexedAt: string | null;
    auditChainValid: boolean | null;
    connectedSources: string[];
  };
  inbox: {
    triage: Array<{
      id: string;
      title: string;
      summary: string;
      priority: 'high' | 'medium' | 'low';
      source: string;
      createdAt: string;
    }>;
    pendingReplies: Array<{
      id: string;
      subject: string;
      from: string;
      snippet: string;
      receivedAt: string;
      priority: 'high' | 'normal' | 'low';
    }>;
    representativeActions: Array<{
      id: string;
      subject: string;
      status: string;
      updatedAt: string;
      source: string;
    }>;
  };
  isEmpty: boolean;
}

// ─── Morning Brief Types ────────────────────────────────────────────────────

export interface MorningBriefItem {
  id: string;
  text: string;
  context?: string;
  actionable: boolean;
  suggestedAction?: string;
}

export interface MorningBriefSection {
  type: string;
  title: string;
  items: MorningBriefItem[];
}

export interface MorningBriefResult {
  id: string;
  summary: string;
  sections: MorningBriefSection[];
  readTimeMinutes: number;
  estimatedReadTimeSeconds: number;
  generatedAt: string;
}

export interface WeatherConditions {
  temperature: number;
  feelsLike: number;
  conditionDescription: string;
  humidity: number;
  windSpeedKmh: number;
  precipitationChance: number;
}

export interface EventForecast {
  eventTitle: string;
  eventTime: string;
  temperature: number;
  conditionDescription: string;
  precipitationChance: number;
}

export interface WeatherResult {
  currentConditions: WeatherConditions | null;
  eventForecasts: EventForecast[];
}

export interface CommuteEntry {
  eventTitle: string;
  destination: string;
  departureTime: string;
  travelMinutes: number;
  weather: { temperature: number; conditionDescription: string } | null;
}

export interface CommuteResult {
  commutes: CommuteEntry[];
}

export interface KnowledgeMomentResult {
  tier: 1 | 2 | 3 | 4 | 5;
  upcomingMeeting: {
    title: string;
    startTime: string;
    attendees: string[];
  } | null;
  emailContext: {
    attendeeName: string;
    recentEmailCount: number;
    lastEmailSubject: string;
    lastEmailDate: string;
    hasUnansweredEmail: boolean;
    unansweredSubject: string | null;
  } | null;
  relatedDocuments: Array<{
    fileName: string;
    filePath: string;
    relevanceReason: string;
  }>;
  message: string;
  suggestedAction: {
    type: 'draft_reply' | 'create_reminder' | 'prepare_meeting';
    description: string;
  } | null;
}

export interface AlterEgoDifference {
  domain: string;
  currentTier: string;
  description: string;
  examples: string[];
}

export interface AlterEgoActivationResult {
  totalActions: number;
  successRate: number;
  domainsCovered: string[];
  estimatedTimeSavedSeconds: number;
  differences: AlterEgoDifference[];
  safeguards: string[];
}

export interface DailyDigestResult {
  id: string;
  summary: string;
  totalActions: number;
  timeSavedFormatted: string;
  emailsHandled: number;
  meetingsPrepped: number;
  remindersCreated: number;
  webSearches: number;
  dismissed: boolean;
}

// ─── Knowledge Graph Types ──────────────────────────────────────────────────

export interface VisualizationNode {
  id: string;
  label: string;
  type: string;
  size: number;
  createdAt: string;
  domain: string;
  metadata?: Record<string, unknown>;
}

export interface VisualizationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
  label?: string;
}

export interface VisualizationGraph {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
}

export interface NodeContext {
  node: VisualizationNode;
  recentActivity: Array<{ action: string; timestamp: string; detail: string }>;
  connections: Array<{ id: string; label: string; relationship: string }>;
  recentMentions: Array<{ source: string; text: string; date: string }>;
}

// ─── Escalation Types ───────────────────────────────────────────────────────

export interface EscalationPreviewAction {
  description: string;
  currentBehavior: string;
  newBehavior: string;
  estimatedTimeSaved: string;
}

export interface EscalationPromptData {
  id: string;
  type: 'guardian_to_partner' | 'partner_to_alterego';
  domain: string;
  actionType: string;
  consecutiveApprovals: number;
  message: string;
  previewActions: EscalationPreviewAction[];
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
}

// ─── Clipboard Insight Types ────────────────────────────────────────────────

export interface ClipboardInsightData {
  patternDescription: string;
  actionLabel: string;
  actionId: string;
}

// ─── Reminder Types ─────────────────────────────────────────────────────────

export interface ReminderData {
  id: string;
  text: string;
  dueAt: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  source: string;
}

// ─── Style Types ────────────────────────────────────────────────────────────

export interface StylePattern {
  text: string;
  frequency: number;
}

export interface StyleProfileResult {
  id: string;
  score: number | null;
  isActive: boolean;
  emailsAnalyzed: number;
  greetingPatterns: StylePattern[];
  signoffPatterns: StylePattern[];
  formalityScore: number;
  directnessScore: number;
  warmthScore: number;
  usesContractions: boolean;
  contractionRate: number;
  usesEmoji: boolean;
  emojiFrequency: number;
  usesExclamation: boolean;
  exclamationRate: number;
}

// ─── Dark Pattern Types ─────────────────────────────────────────────────────

export interface DarkPatternResult {
  contentId: string;
  confidence: number;
  patterns: Array<{ category: string; evidence: string; confidence: number }>;
  reframe: string;
}

// ─── Quick Capture Types ────────────────────────────────────────────────────

export interface CaptureResult {
  hasReminder: boolean;
  reminderDueAt: string | null;
  linkedContextCount: number;
}

// ─── Voice Model Types ──────────────────────────────────────────────────────

export interface VoiceModelStatus {
  whisperDownloaded: boolean;
  piperDownloaded: boolean;
  whisperSizeMb: number;
  piperSizeMb: number;
}

// ─── Import Digital Life Types ──────────────────────────────────────────────

export interface ImportProgressData {
  sourceId: string;
  phase: 'scanning' | 'importing' | 'indexing' | 'complete' | 'error';
  itemsProcessed: number;
  totalItems: number;
  errorMessage?: string;
}

export interface ImportHistoryData {
  id: string;
  sourceType: string;
  format: string;
  importedAt: string;
  itemCount: number;
  status: string;
}

// ─── Model Download Types ───────────────────────────────────────────────────

// ─── Alter Ego Week Types ───────────────────────────────────────────────────

export interface AlterEgoWeekDayData {
  day: number;
  theme: string;
  domain: string;
  type: string;
  description: string;
}

export interface AlterEgoWeekProgressData {
  isActive: boolean;
  currentDay: number;
  completedDays: number[];
  totalDays: number;
  currentDayConfig: AlterEgoWeekDayData | null;
}

// ─── Model Download Types ───────────────────────────────────────────────────

export interface ModelDownloadState {
  modelName: string;
  totalBytes: number;
  downloadedBytes: number;
  speedBytesPerSec: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  error?: string;
}

// ─── Vault Surface ──────────────────────────────────────────────────────────

export interface VaultSourceSummary {
  sourceId: string;
  sourceType: string;
  documentId: string;
  title: string;
  mimeType: string | null;
  ingestedAt: string;
  pathHash: string | null;
  deleted: boolean;
  retentionUntil: string | null;
}

export interface VaultAssertionSummary {
  assertionId: string;
  status: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  derivationMethod: string;
  sourceIds: string[];
  retentionUntil: string | null;
  createdAt: string;
  corrected: boolean;
}

export interface VaultSurfaceStatus {
  sourceCount: number;
  assertionCount: number;
  eventCount: number;
  hasVaultEvents: boolean;
}

export interface VaultSurfaceExport {
  exportedAt: string;
  sources: VaultSourceSummary[];
  assertions: VaultAssertionSummary[];
}

export interface VaultDeleteSourceResult {
  success: boolean;
  deletion?: {
    tombstoneEventId: string;
    deletionReceiptHash: string;
    documentCount: number;
  };
}

export type WorkActionState =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'unknown';

export interface WorkActionReversible {
  readonly reversible: true;
  readonly undoToken: string;
  readonly undoExpiresAt: string;
  readonly undoHint?: string;
}

export interface WorkActionView {
  readonly actionId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly state: WorkActionState;
  readonly capability: string;
  readonly autonomyRationale: string;
  readonly auditCorrelationId: string;
  readonly payloadHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly auditPendingId?: string;
  readonly failureReason?: string;
  readonly reversible?: WorkActionReversible;
}

export interface WorkApproveActionResult {
  readonly success: boolean;
  readonly action?: WorkActionView;
  readonly error?: { code: string; message: string };
}

export interface ActionReceiptPayload {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly state: WorkActionState;
  readonly auditCorrelationId: string;
  readonly auditPendingId?: string;
  readonly payloadHash: string;
  readonly auditChainHeadHash: string | null;
  readonly completedAt: string;
}

export interface ActionReceipt {
  readonly schemaVersion: 1;
  readonly payload: ActionReceiptPayload;
  readonly signature: {
    readonly algorithm: 'hmac-sha256' | 'ed25519';
    readonly value: string;
  };
}

export type DelegatedPlanStatus =
  | 'draft'
  | 'active'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DelegatedPlanStepStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface DelegatedPlanStepFailure {
  readonly code?: string;
  readonly message: string;
}

export interface DelegatedPlanStepOutcome {
  readonly measuredAt: string;
  readonly summary: string;
  readonly timeSavedSeconds?: number;
  readonly actionState?: string;
  readonly actionId?: string;
}

export interface DelegatedPlanStepView {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly responsibleCapability: string;
  readonly status: DelegatedPlanStepStatus;
  readonly actionRequestId?: string;
  readonly failure?: DelegatedPlanStepFailure;
  readonly outcome?: DelegatedPlanStepOutcome;
}

export interface DelegatedPlanProgress {
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly blockedSteps: number;
  readonly readySteps: number;
  readonly inProgressSteps: number;
  readonly percentComplete: number;
}

export interface DelegatedPlanView {
  readonly id: string;
  readonly title: string;
  readonly status: DelegatedPlanStatus;
  readonly steps: readonly DelegatedPlanStepView[];
  readonly progress: DelegatedPlanProgress;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateDelegatedPlanInput {
  readonly title: string;
  readonly steps: Array<{
    readonly title: string;
    readonly dependsOn?: readonly string[];
    readonly responsibleCapability: string;
  }>;
  readonly status?: DelegatedPlanStatus;
}

export interface UpdateDelegatedPlanInput {
  readonly planId: string;
  readonly title?: string;
  readonly status?: DelegatedPlanStatus;
  readonly steps?: readonly DelegatedPlanStepView[];
}
