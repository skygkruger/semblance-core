import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';

// ─── State Shape (per build prompt D2) ─────────────────────────────────────

export interface AppState {
  userName: string | null;
  onboardingComplete: boolean;
  onboardingStep: number;
  ollamaStatus: 'connected' | 'disconnected' | 'checking';
  activeModel: string | null;
  availableModels: string[];
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
}

export interface DocumentContext {
  documentId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
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
  | { type: 'SET_ONBOARDING_COMPLETE' }
  | { type: 'SET_ONBOARDING_STEP'; step: number }
  | { type: 'SET_OLLAMA_STATUS'; status: AppState['ollamaStatus'] }
  | { type: 'SET_ACTIVE_MODEL'; model: string }
  | { type: 'SET_AVAILABLE_MODELS'; models: string[] }
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
  | { type: 'SET_CONTACTS_LIST'; list: AppState['contacts']['list'] }
  | { type: 'SET_CONTACTS_SELECTED'; id: string | null }
  | { type: 'SET_CONTACTS_LOADING'; loading: boolean }
  | { type: 'SET_CLIPBOARD_MONITORING'; enabled: boolean }
  | { type: 'SET_CLIPBOARD_RECENT_ACTIONS'; actions: AppState['clipboardSettings']['recentActions'] }
  | { type: 'SET_LOCATION_SETTINGS'; settings: AppState['locationSettings'] }
  | { type: 'CLEAR_LOCATION_HISTORY' }
  | { type: 'SET_VOICE_SETTINGS'; settings: AppState['voiceSettings'] }
  | { type: 'SET_CLOUD_STORAGE_SETTINGS'; settings: AppState['cloudStorageSettings'] }
  | { type: 'SET_FINANCE_SETTINGS'; settings: AppState['financeSettings'] };

// ─── Initial State ─────────────────────────────────────────────────────────

export const initialState: AppState = {
  userName: null,
  onboardingComplete: false,
  onboardingStep: 0,
  ollamaStatus: 'checking',
  activeModel: null,
  availableModels: [],
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
};

// ─── Reducer ───────────────────────────────────────────────────────────────

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER_NAME':
      return { ...state, userName: action.name };
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
