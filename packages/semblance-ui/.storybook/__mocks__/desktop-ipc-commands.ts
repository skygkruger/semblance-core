// Storybook mock for packages/desktop/src/ipc/commands.ts
// All functions are no-op async stubs that return safe defaults.

const noop = async () => {};
const noopReturn = async <T>(val: T) => val;

// Hardware / Onboarding
export const detectHardware = async () => ({ tier: 'standard', totalRamMb: 16384, cpuCores: 8, gpuName: 'Mock GPU', gpuVramMb: 4096, os: 'macOS', arch: 'arm64', voiceCapable: true });
export const getKnowledgeMoment = async () => null;
export const completeOnboarding = noop;

// Credentials / Accounts
export const addCredential = noop;
export const testCredential = async () => ({ success: true });
export const listAccounts = async () => [];
export const getAccountStatus = async () => ({ connected: false });
export const syncAccount = noop;
export const removeAccount = noop;
export const getProviderPresets = async () => ({});

// Email
export const getEmails = async () => [];
export const sendEmail = noop;
export const archiveEmails = noop;
export const getEmailThread = async () => [];

// Calendar
export const getCalendarEvents = async () => [];
export const createCalendarEvent = noop;
export const deleteCalendarEvent = noop;

// Chat / LLM
export const sendMessage = async () => ({ content: '' });
export const listConversations = async () => [];
export const getConversation = async () => ({ turns: [] });
export const switchConversation = async () => ({ success: true });
export const newConversation = async () => ({ id: 'mock' });
export const clearConversation = noop;

// Agent / Actions
export const getPendingActions = async () => [];
export const approveAction = noop;
export const rejectAction = noop;
export const getApprovalCount = async () => 0;
export const getApprovalThreshold = async () => 3;

// Autonomy / Escalation
export const respondToEscalation = noop;
export const getEscalationPrompts = async () => [];

// Subscriptions / Finance
export const updateSubscriptionStatus = noop;
export const importStatement = async () => ({ transactionCount: 42, merchantCount: 15, recurringCount: 4, forgottenCount: 1, potentialSavings: 120, dateRange: { start: '2025-01-01', end: '2025-12-31' } });

// Knowledge Graph
export const getVisualizationGraph = async () => ({ nodes: [], edges: [], clusters: [], stats: { totalNodes: 0, totalEdges: 0 } });
export const getNodeContext = async () => null;

// Web Search / Fetch
export const webSearch = async () => [];
export const webFetch = async () => ({ title: '', content: '', bytesFetched: 0, contentType: '' });

// Reminders / Capture
export const createReminder = noop;
export const quickCapture = async () => ({ hasReminder: false, reminderDueAt: null, linkedContextCount: 0 });
export const getReminders = async () => [];

// Voice
export const startVoiceRecording = noop;
export const stopVoiceRecording = noop;

// Documents
export const getDocumentContext = async () => [];
export const attachFiles = async () => [];

// Contacts
export const getContacts = async () => [];
export const getContactDetail = async () => null;

// Network Monitor
export const getNetworkTrustStatus = async () => ({ clean: true, unauthorizedCount: 0, activeServiceCount: 2 });
export const getNetworkPeriods = async () => [];
export const getActiveConnections = async () => [];

// Cloud Storage
export const cloudStorageConnect = async () => ({ success: true, userEmail: 'mock@example.com' });
export const cloudStorageDisconnect = noop;
export const cloudStorageSyncNow = async () => ({ filesSynced: 42, storageUsedBytes: 1024 * 1024 * 50 });
export const cloudStorageSetInterval = noop;
export const cloudStorageSetMaxFileSize = noop;
export const cloudStorageBrowseFolders = async () => [];

// Settings
export const saveSettings = noop;
export const loadSettings = async () => ({});
export const saveSoundSettings = noop;
export const loadSoundSettings = async () => ({ enabled: true, categoryVolumes: { actions: 1, system: 1, voice: 1 } });

// Premium
export const getLicenseStatus = async () => ({ isPremium: false });
export const activateLicense = async () => ({ success: true });

// Privacy
export const getPrivacyReport = async () => ({});

// Connectors
export const getConnectorActions = async () => [];

// Digest
export const getDailyDigest = async () => null;
export const getWeeklyDigest = async () => null;

// Proactive
export const getProactiveInsights = async () => [];

// Alter Ego
export const getAlterEgoWeekProgress = async () => ({ isActive: false, currentDay: 0, completedDays: [], totalDays: 7 });

// Search settings
export const getSearchSettings = async () => ({});
export const saveSearchSettings = noop;
