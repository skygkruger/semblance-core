import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

// ─── State Shape (per build prompt D2) ─────────────────────────────────────

export interface AppState {
  userName: string | null;
  semblanceName: string;
  onboardingComplete: boolean;
  onboardingStep: number;
  ollamaStatus: 'connected' | 'disconnected' | 'checking';
  activeModel: string | null;
  availableModels: string[];
  inferenceEngine: 'native' | 'ollama' | 'none';
  indexingStatus: {
    state: 'idle' | 'scanning' | 'indexing' | 'complete' | 'error';
    filesScanned: number;
    filesTotal: number;
    chunksCreated: number;
    currentFile: string | null;
    error: string | null;
  };
  knowledgeStats: {
    documentCount: number;
    chunkCount: number;
    indexSizeBytes: number;
    lastIndexedAt: string | null;
  };
  autonomyConfig: Record<string, 'guardian' | 'partner' | 'alter_ego'>;
  theme: 'light' | 'dark' | 'system';
  privacyStatus: {
    allLocal: boolean;
    connectionCount: number;
    lastAuditEntry: string | null;
    anomalyDetected: boolean;
  };
  activeScreen: string;
  chatMessages: ChatMessage[];
  isResponding: boolean;
  indexedDirectories: string[];
  documentContext: DocumentContext | null;
  chatAttachments: ChatAttachmentState[];
  contacts: {
    list: Array<{ id: string; displayName: string; relationshipType: string }>;
    selectedId: string | null;
    loading: boolean;
  };
  clipboardSettings: {
    monitoringEnabled: boolean;
    recentActions: Array<{ patternType: string; action: string; timestamp: string }>;
  };
  locationSettings: {
    enabled: boolean;
    remindersEnabled: boolean;
    commuteEnabled: boolean;
    weatherEnabled: boolean;
    defaultCity: string;
    retentionDays: number;
  };
  voiceSettings: {
    enabled: boolean;
    whisperModel: string | null;
    piperVoice: string | null;
    speed: number;
    silenceSensitivity: 'low' | 'medium' | 'high';
  };
  cloudStorageSettings: {
    connected: boolean;
    provider: string | null;
    userEmail: string | null;
    selectedFolders: Array<{ folderId: string; folderName: string }>;
    syncIntervalMinutes: number;
    maxFileSizeMB: number;
    storageBudgetGB: number;
    lastSyncedAt: string | null;
    storageUsedBytes: number;
    filesSynced: number;
  };
  // Extension slot: Digital Representative
  // These defaults represent "DR not installed." When @semblance/dr is active,
  // it manages this state via extension adapter registration.
  financeSettings: {
    plaidConnected: boolean;
    autoSyncEnabled: boolean;
    anomalySensitivity: 'low' | 'medium' | 'high';
    lastImportAt: string | null;
    connectedAccounts: Array<{ id: string; name: string; institution: string; type: string }>;
  };
  morningBriefSettings: {
    enabled: boolean;
    time: string;
    lastDeliveredAt: string | null;
  };
  alterEgoWeek: {
    isActive: boolean;
    currentDay: number;
    completedDays: number[];
    skipped: boolean;
  };
  license: {
    tier: 'free' | 'founding' | 'digital-representative' | 'lifetime';
    isFoundingMember: boolean;
    foundingSeat: number | null;
    licenseKey: string | null;
  };
  connectorStates: Record<string, {
    connectorId: string;
    status: 'connected' | 'disconnected' | 'error' | 'pending';
    userEmail?: string;
    lastSyncedAt?: string;
    errorMessage?: string;
    itemCount?: number;
  }>;
  importHistory: Array<{
    id: string;
    filename: string;
    sourceType: string;
    format: string;
    imported: number;
    importedAt: string;
  }>;
  importWatchPath: string;
  activeConversationId: string | null;
  conversations: ConversationSummaryState[];
  historyPanelOpen: boolean;
  conversationSettings: { autoExpiryDays: number | null };
  intentProfile: {
    primaryGoal: string | null;
    hardLimits: Array<{ id: string; rawText: string; active: boolean; source: string; createdAt: string }>;
    personalValues: Array<{ id: string; rawText: string; theme: string; active: boolean; source: string; createdAt: string }>;
    lastUpdated: string | null;
  };
  alterEgoSettings: {
    dollarThreshold: number;
    confirmationDisabledCategories: string[];
  };
  soundSettings: {
    enabled: boolean;
    categoryVolumes: Record<'actions' | 'system' | 'voice', number>;
  };
  language: string;
}

export interface ConversationSummaryState {
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

export interface DocumentContext {
  documentId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}

export type AttachmentStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface ChatAttachmentState {
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ─── Actions ───────────────────────────────────────────────────────────────

export type AppAction =
  | { type: 'SET_USER_NAME'; name: string }
  | { type: 'SET_SEMBLANCE_NAME'; name: string }
  | { type: 'SET_ONBOARDING_COMPLETE' }
  | { type: 'SET_ONBOARDING_STEP'; step: number }
  | { type: 'SET_OLLAMA_STATUS'; status: AppState['ollamaStatus'] }
  | { type: 'SET_ACTIVE_MODEL'; model: string }
  | { type: 'SET_AVAILABLE_MODELS'; models: string[] }
  | { type: 'SET_INFERENCE_ENGINE'; engine: AppState['inferenceEngine'] }
  | { type: 'SET_INDEXING_STATUS'; status: AppState['indexingStatus'] }
  | { type: 'SET_KNOWLEDGE_STATS'; stats: AppState['knowledgeStats'] }
  | { type: 'SET_AUTONOMY_TIER'; domain: string; tier: 'guardian' | 'partner' | 'alter_ego' }
  | { type: 'SET_AUTONOMY_CONFIG'; config: AppState['autonomyConfig'] }
  | { type: 'SET_THEME'; theme: AppState['theme'] }
  | { type: 'SET_PRIVACY_STATUS'; status: AppState['privacyStatus'] }
  | { type: 'SET_ACTIVE_SCREEN'; screen: string }
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'APPEND_TO_LAST_MESSAGE'; content: string }
  | { type: 'SET_IS_RESPONDING'; value: boolean }
  | { type: 'ADD_DIRECTORY'; path: string }
  | { type: 'REMOVE_DIRECTORY'; path: string }
  | { type: 'SET_DIRECTORIES'; dirs: string[] }
  | { type: 'SET_DOCUMENT_CONTEXT'; context: DocumentContext }
  | { type: 'CLEAR_DOCUMENT_CONTEXT' }
  | { type: 'ADD_ATTACHMENT'; attachment: ChatAttachmentState }
  | { type: 'UPDATE_ATTACHMENT'; id: string; updates: Partial<ChatAttachmentState> }
  | { type: 'REMOVE_ATTACHMENT'; id: string }
  | { type: 'CLEAR_ATTACHMENTS' }
  | { type: 'SET_CONTACTS_LIST'; list: AppState['contacts']['list'] }
  | { type: 'SET_CONTACTS_SELECTED'; id: string | null }
  | { type: 'SET_CONTACTS_LOADING'; loading: boolean }
  | { type: 'SET_CLIPBOARD_MONITORING'; enabled: boolean }
  | { type: 'SET_CLIPBOARD_RECENT_ACTIONS'; actions: AppState['clipboardSettings']['recentActions'] }
  | { type: 'SET_LOCATION_SETTINGS'; settings: AppState['locationSettings'] }
  | { type: 'CLEAR_LOCATION_HISTORY' }
  | { type: 'SET_VOICE_SETTINGS'; settings: AppState['voiceSettings'] }
  | { type: 'SET_CLOUD_STORAGE_SETTINGS'; settings: AppState['cloudStorageSettings'] }
  | { type: 'SET_FINANCE_SETTINGS'; settings: AppState['financeSettings'] }
  | { type: 'SET_MORNING_BRIEF_SETTINGS'; settings: AppState['morningBriefSettings'] }
  | { type: 'SET_ALTER_EGO_WEEK_PROGRESS'; progress: AppState['alterEgoWeek'] }
  | { type: 'SET_LICENSE'; license: AppState['license'] }
  | { type: 'SET_CONNECTOR_STATE'; connectorId: string; state: AppState['connectorStates'][string] }
  | { type: 'SET_CONNECTOR_STATES'; states: AppState['connectorStates'] }
  | { type: 'ADD_IMPORT_HISTORY'; entry: AppState['importHistory'][number] }
  | { type: 'SET_IMPORT_WATCH_PATH'; path: string }
  | { type: 'SET_ACTIVE_CONVERSATION'; id: string | null }
  | { type: 'SET_CONVERSATIONS'; conversations: ConversationSummaryState[] }
  | { type: 'TOGGLE_HISTORY_PANEL' }
  | { type: 'SET_HISTORY_PANEL'; open: boolean }
  | { type: 'REPLACE_CHAT_MESSAGES'; messages: ChatMessage[] }
  | { type: 'SET_CONVERSATION_SETTINGS'; settings: AppState['conversationSettings'] }
  | { type: 'SET_INTENT_PROFILE'; profile: AppState['intentProfile'] }
  | { type: 'SET_PRIMARY_GOAL'; goal: string }
  | { type: 'ADD_HARD_LIMIT'; limit: AppState['intentProfile']['hardLimits'][number] }
  | { type: 'TOGGLE_HARD_LIMIT'; id: string; active: boolean }
  | { type: 'REMOVE_HARD_LIMIT'; id: string }
  | { type: 'ADD_PERSONAL_VALUE'; value: AppState['intentProfile']['personalValues'][number] }
  | { type: 'REMOVE_PERSONAL_VALUE'; id: string }
  | { type: 'SET_ALTER_EGO_SETTINGS'; settings: AppState['alterEgoSettings'] }
  | { type: 'SET_SOUND_SETTINGS'; settings: AppState['soundSettings'] }
  | { type: 'SET_LANGUAGE'; code: string };

// ─── Initial State ─────────────────────────────────────────────────────────

export const initialState: AppState = {
  userName: null,
  semblanceName: 'Semblance',
  onboardingComplete: false,
  onboardingStep: 0,
  ollamaStatus: 'checking',
  activeModel: null,
  availableModels: [],
  inferenceEngine: 'none',
  indexingStatus: {
    state: 'idle',
    filesScanned: 0,
    filesTotal: 0,
    chunksCreated: 0,
    currentFile: null,
    error: null,
  },
  knowledgeStats: {
    documentCount: 0,
    chunkCount: 0,
    indexSizeBytes: 0,
    lastIndexedAt: null,
  },
  autonomyConfig: {
    email: 'partner',
    calendar: 'partner',
    files: 'partner',
    finances: 'guardian',
    health: 'partner',
    services: 'guardian',
  },
  theme: 'system',
  privacyStatus: {
    allLocal: true,
    connectionCount: 0,
    lastAuditEntry: null,
    anomalyDetected: false,
  },
  activeScreen: 'chat',
  chatMessages: [],
  isResponding: false,
  indexedDirectories: [],
  documentContext: null,
  chatAttachments: [],
  contacts: {
    list: [],
    selectedId: null,
    loading: false,
  },
  clipboardSettings: {
    monitoringEnabled: false,
    recentActions: [],
  },
  locationSettings: {
    enabled: false,
    remindersEnabled: false,
    commuteEnabled: false,
    weatherEnabled: false,
    defaultCity: '',
    retentionDays: 7,
  },
  voiceSettings: {
    enabled: false,
    whisperModel: null,
    piperVoice: null,
    speed: 1.0,
    silenceSensitivity: 'medium',
  },
  cloudStorageSettings: {
    connected: false,
    provider: null,
    userEmail: null,
    selectedFolders: [],
    syncIntervalMinutes: 30,
    maxFileSizeMB: 50,
    storageBudgetGB: 5,
    lastSyncedAt: null,
    storageUsedBytes: 0,
    filesSynced: 0,
  },
  financeSettings: {
    plaidConnected: false,
    autoSyncEnabled: false,
    anomalySensitivity: 'medium',
    lastImportAt: null,
    connectedAccounts: [],
  },
  morningBriefSettings: {
    enabled: true,
    time: '07:00',
    lastDeliveredAt: null,
  },
  alterEgoWeek: {
    isActive: false,
    currentDay: 0,
    completedDays: [],
    skipped: false,
  },
  license: {
    tier: 'free',
    isFoundingMember: false,
    foundingSeat: null,
    licenseKey: null,
  },
  connectorStates: {},
  importHistory: [],
  importWatchPath: '',
  activeConversationId: null,
  conversations: [],
  historyPanelOpen: false,
  conversationSettings: { autoExpiryDays: null },
  intentProfile: {
    primaryGoal: null,
    hardLimits: [],
    personalValues: [],
    lastUpdated: null,
  },
  alterEgoSettings: {
    dollarThreshold: 50,
    confirmationDisabledCategories: [],
  },
  soundSettings: {
    enabled: true,
    categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 },
  },
  language: 'en',
};

// ─── Reducer ───────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER_NAME':
      return { ...state, userName: action.name };
    case 'SET_SEMBLANCE_NAME':
      return { ...state, semblanceName: action.name || 'Semblance' };
    case 'SET_ONBOARDING_COMPLETE':
      return { ...state, onboardingComplete: true };
    case 'SET_ONBOARDING_STEP':
      return { ...state, onboardingStep: action.step };
    case 'SET_OLLAMA_STATUS':
      return { ...state, ollamaStatus: action.status };
    case 'SET_ACTIVE_MODEL':
      return { ...state, activeModel: action.model };
    case 'SET_AVAILABLE_MODELS':
      return { ...state, availableModels: action.models };
    case 'SET_INFERENCE_ENGINE':
      return { ...state, inferenceEngine: action.engine };
    case 'SET_INDEXING_STATUS':
      return { ...state, indexingStatus: action.status };
    case 'SET_KNOWLEDGE_STATS':
      return { ...state, knowledgeStats: action.stats };
    case 'SET_AUTONOMY_TIER':
      return {
        ...state,
        autonomyConfig: { ...state.autonomyConfig, [action.domain]: action.tier },
      };
    case 'SET_AUTONOMY_CONFIG':
      return { ...state, autonomyConfig: action.config };
    case 'SET_THEME':
      return { ...state, theme: action.theme };
    case 'SET_PRIVACY_STATUS':
      return { ...state, privacyStatus: action.status };
    case 'SET_ACTIVE_SCREEN':
      return { ...state, activeScreen: action.screen };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case 'APPEND_TO_LAST_MESSAGE': {
      const messages = [...state.chatMessages];
      const last = messages[messages.length - 1];
      if (last && last.role === 'assistant') {
        messages[messages.length - 1] = { ...last, content: last.content + action.content };
      }
      return { ...state, chatMessages: messages };
    }
    case 'SET_IS_RESPONDING':
      return { ...state, isResponding: action.value };
    case 'ADD_DIRECTORY':
      return { ...state, indexedDirectories: [...state.indexedDirectories, action.path] };
    case 'REMOVE_DIRECTORY':
      return { ...state, indexedDirectories: state.indexedDirectories.filter((d) => d !== action.path) };
    case 'SET_DIRECTORIES':
      return { ...state, indexedDirectories: action.dirs };
    case 'SET_DOCUMENT_CONTEXT':
      return { ...state, documentContext: action.context };
    case 'CLEAR_DOCUMENT_CONTEXT':
      return { ...state, documentContext: null };
    case 'ADD_ATTACHMENT':
      return { ...state, chatAttachments: [...state.chatAttachments, action.attachment] };
    case 'UPDATE_ATTACHMENT':
      return {
        ...state,
        chatAttachments: state.chatAttachments.map(a =>
          a.id === action.id ? { ...a, ...action.updates } : a,
        ),
      };
    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        chatAttachments: state.chatAttachments.filter(a => a.id !== action.id),
      };
    case 'CLEAR_ATTACHMENTS':
      return { ...state, chatAttachments: [] };
    case 'SET_CONTACTS_LIST':
      return { ...state, contacts: { ...state.contacts, list: action.list } };
    case 'SET_CONTACTS_SELECTED':
      return { ...state, contacts: { ...state.contacts, selectedId: action.id } };
    case 'SET_CONTACTS_LOADING':
      return { ...state, contacts: { ...state.contacts, loading: action.loading } };
    case 'SET_CLIPBOARD_MONITORING':
      return { ...state, clipboardSettings: { ...state.clipboardSettings, monitoringEnabled: action.enabled } };
    case 'SET_CLIPBOARD_RECENT_ACTIONS':
      return { ...state, clipboardSettings: { ...state.clipboardSettings, recentActions: action.actions } };
    case 'SET_LOCATION_SETTINGS':
      return { ...state, locationSettings: action.settings };
    case 'CLEAR_LOCATION_HISTORY':
      return state; // Side effect handled by component — state stays the same
    case 'SET_VOICE_SETTINGS':
      return { ...state, voiceSettings: action.settings };
    case 'SET_CLOUD_STORAGE_SETTINGS':
      return { ...state, cloudStorageSettings: action.settings };
    case 'SET_FINANCE_SETTINGS':
      return { ...state, financeSettings: action.settings };
    case 'SET_MORNING_BRIEF_SETTINGS':
      return { ...state, morningBriefSettings: action.settings };
    case 'SET_ALTER_EGO_WEEK_PROGRESS':
      return { ...state, alterEgoWeek: action.progress };
    case 'SET_LICENSE':
      return { ...state, license: action.license };
    case 'SET_CONNECTOR_STATE':
      return {
        ...state,
        connectorStates: {
          ...state.connectorStates,
          [action.connectorId]: action.state,
        },
      };
    case 'SET_CONNECTOR_STATES':
      return { ...state, connectorStates: action.states };
    case 'ADD_IMPORT_HISTORY':
      return { ...state, importHistory: [action.entry, ...state.importHistory] };
    case 'SET_IMPORT_WATCH_PATH':
      return { ...state, importWatchPath: action.path };
    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversationId: action.id };
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations };
    case 'TOGGLE_HISTORY_PANEL':
      return { ...state, historyPanelOpen: !state.historyPanelOpen };
    case 'SET_HISTORY_PANEL':
      return { ...state, historyPanelOpen: action.open };
    case 'REPLACE_CHAT_MESSAGES':
      return { ...state, chatMessages: action.messages };
    case 'SET_CONVERSATION_SETTINGS':
      return { ...state, conversationSettings: action.settings };
    case 'SET_INTENT_PROFILE':
      return { ...state, intentProfile: action.profile };
    case 'SET_PRIMARY_GOAL':
      return { ...state, intentProfile: { ...state.intentProfile, primaryGoal: action.goal, lastUpdated: new Date().toISOString() } };
    case 'ADD_HARD_LIMIT':
      return { ...state, intentProfile: { ...state.intentProfile, hardLimits: [...state.intentProfile.hardLimits, action.limit], lastUpdated: new Date().toISOString() } };
    case 'TOGGLE_HARD_LIMIT':
      return { ...state, intentProfile: { ...state.intentProfile, hardLimits: state.intentProfile.hardLimits.map(l => l.id === action.id ? { ...l, active: action.active } : l), lastUpdated: new Date().toISOString() } };
    case 'REMOVE_HARD_LIMIT':
      return { ...state, intentProfile: { ...state.intentProfile, hardLimits: state.intentProfile.hardLimits.filter(l => l.id !== action.id), lastUpdated: new Date().toISOString() } };
    case 'ADD_PERSONAL_VALUE':
      return { ...state, intentProfile: { ...state.intentProfile, personalValues: [...state.intentProfile.personalValues, action.value], lastUpdated: new Date().toISOString() } };
    case 'REMOVE_PERSONAL_VALUE':
      return { ...state, intentProfile: { ...state.intentProfile, personalValues: state.intentProfile.personalValues.filter(v => v.id !== action.id), lastUpdated: new Date().toISOString() } };
    case 'SET_ALTER_EGO_SETTINGS':
      return { ...state, alterEgoSettings: action.settings };
    case 'SET_SOUND_SETTINGS':
      return { ...state, soundSettings: action.settings };
    case 'SET_LANGUAGE':
      return { ...state, language: action.code };
    default:
      return state;
  }
}

// ─── Context ───────────────────────────────────────────────────────────────

export const AppStateContext = createContext<AppState>(initialState);
export const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  return useContext(AppStateContext);
}

export function useAppDispatch(): Dispatch<AppAction> {
  return useContext(AppDispatchContext);
}
