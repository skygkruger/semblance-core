// @semblance/core — The AI Core entry point.
// Wires together LLM, Knowledge Graph, Agent Orchestrator, and IPC Client.
// ZERO network access. The only external communication is via typed IPC to the Gateway.

import type { LLMProvider } from './llm/types.js';
import type { KnowledgeGraph } from './knowledge/index.js';
import type { Orchestrator } from './agent/orchestrator.js';
import type { IPCClient } from './agent/ipc-client.js';
import type { AutonomyConfig } from './agent/types.js';

import { getPlatform } from './platform/index.js';
import { createLLMProvider } from './llm/index.js';
import { ModelManager } from './llm/model-manager.js';
import { createKnowledgeGraph } from './knowledge/index.js';
import { CoreIPCClient } from './agent/ipc-client.js';
import { createOrchestrator } from './agent/index.js';

// Re-export shared types
export * from './types/index.js';

// Re-export LLM layer
export type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatMessage,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
  ToolDefinition,
  ToolCall,
} from './llm/types.js';

export { createLLMProvider, OllamaProvider, ModelManager } from './llm/index.js';

// Re-export knowledge graph layer
export type {
  Document,
  DocumentSource,
  DocumentChunk,
  SearchResult,
  Entity,
  EntityType,
  EntityMention,
} from './knowledge/types.js';

export { createKnowledgeGraph } from './knowledge/index.js';
export type { KnowledgeGraph } from './knowledge/index.js';

// Re-export agent layer
export type {
  AutonomyTier,
  AutonomyConfig,
  AutonomyDomain,
  AgentAction,
  ConversationTurn,
} from './agent/types.js';

export type { Orchestrator, OrchestratorResponse } from './agent/orchestrator.js';
export type { IPCClient, IPCClientConfig, IPCClientTransportConfig } from './agent/ipc-client.js';
export { CoreIPCClient } from './agent/ipc-client.js';
export { createOrchestrator } from './agent/index.js';

// Re-export IPC transport abstraction
export type { IPCTransport, IPCHandler } from './ipc/transport.js';
export { SocketTransport, type SocketTransportConfig } from './ipc/socket-transport.js';
export { InProcessTransport } from './ipc/in-process-transport.js';

// Re-export platform abstraction
export {
  getPlatform,
  setPlatform,
  hasPlatform,
  resetPlatform,
  initDesktopPlatform,
  isMobilePlatform,
  isDesktopPlatform,
  createMobileAdapter,
  mobilePath,
} from './platform/index.js';
export { createDesktopAdapter } from './platform/desktop-adapter.js';
export type {
  PlatformAdapter,
  FileSystemAdapter,
  PathAdapter,
  CryptoAdapter,
  SQLiteAdapter,
  DatabaseHandle,
  PreparedStatement,
  HardwareAdapter,
  NotificationAdapter,
  MobileAdapterConfig,
} from './platform/index.js';

// Re-export extension system
export type {
  SemblanceExtension,
  ExtensionTool,
  ExtensionInsightTracker,
  ExtensionGatewayAdapter,
  ExtensionServiceAdapter,
  ExtensionInitContext,
  GatewayExtensionContext,
  ToolHandler,
  ToolHandlerResult,
  UISlotComponent,
} from './extensions/index.js';

export {
  loadExtensions,
  getLoadedExtensions,
  registerExtension,
  clearExtensions,
  registerSlot,
  getSlot,
  hasSlot,
  getSlotNames,
  clearSlots,
} from './extensions/index.js';

// Re-export mobile model management
export {
  MobileModelManager,
  MOBILE_MODEL_REGISTRY,
  selectReasoningModel,
  selectEmbeddingModel,
  getRequiredModels,
  getTotalDownloadSize,
  formatBytes,
} from './llm/mobile-model-manager.js';
export type {
  MobileModelEntry,
  MobileModelDownload,
} from './llm/mobile-model-manager.js';

// --- SemblanceCore Interface ---

export interface SemblanceCore {
  /** The LLM provider */
  llm: LLMProvider;

  /** The knowledge graph */
  knowledge: KnowledgeGraph;

  /** The agent orchestrator */
  agent: Orchestrator;

  /** The IPC client for Gateway communication */
  ipc: IPCClient;

  /** The model manager for model lifecycle */
  models: ModelManager;

  /** Initialize all subsystems */
  initialize(): Promise<void>;

  /** Shut down gracefully */
  shutdown(): Promise<void>;
}

export interface SemblanceCoreConfig {
  /** Data directory for all local storage. Defaults to ~/.semblance/data/ */
  dataDir?: string;
  /** Ollama base URL. Defaults to http://localhost:11434. MUST be localhost. */
  ollamaBaseUrl?: string;
  /** Path to the shared signing key file. Defaults to ~/.semblance/signing.key */
  signingKeyPath?: string;
  /** Path to the IPC socket. Defaults to platform-appropriate path. */
  socketPath?: string;
  /** Autonomy configuration for the agent. */
  autonomyConfig?: AutonomyConfig;
  /** Preferred embedding model. Defaults to nomic-embed-text. */
  embeddingModel?: string;
  /** Preferred chat model. If not set, the best available model is selected. */
  chatModel?: string;
}

// Default socket path varies by platform
function defaultSocketPath(): string {
  const p = getPlatform();
  if (p.hardware.platform() === 'win32') {
    return '\\\\.\\pipe\\semblance-gateway';
  }
  return p.path.join(p.hardware.homedir(), '.semblance', 'gateway.sock');
}

/**
 * Create a SemblanceCore instance.
 * Call initialize() after creation to connect all subsystems.
 */
export function createSemblanceCore(config?: SemblanceCoreConfig): SemblanceCore {
  const p = getPlatform();
  const dataDir = config?.dataDir ?? p.path.join(p.hardware.homedir(), '.semblance', 'data');
  const ollamaBaseUrl = config?.ollamaBaseUrl ?? 'http://localhost:11434';
  const signingKeyPath = config?.signingKeyPath ?? p.path.join(p.hardware.homedir(), '.semblance', 'signing.key');
  const socketPath = config?.socketPath ?? defaultSocketPath();
  const embeddingModel = config?.embeddingModel ?? 'nomic-embed-text';

  // Create the LLM provider (localhost-only Ollama)
  const llm = createLLMProvider({ baseUrl: ollamaBaseUrl });

  // Placeholders — initialized in initialize()
  let models: ModelManager | null = null;
  let knowledge: KnowledgeGraph | null = null;
  let agent: Orchestrator | null = null;
  let ipc: CoreIPCClient | null = null;
  let initialized = false;

  const core: SemblanceCore = {
    get llm() {
      return llm;
    },

    get knowledge() {
      if (!knowledge) throw new Error('[SemblanceCore] Not initialized. Call initialize() first.');
      return knowledge;
    },

    get agent() {
      if (!agent) throw new Error('[SemblanceCore] Not initialized. Call initialize() first.');
      return agent;
    },

    get ipc() {
      if (!ipc) throw new Error('[SemblanceCore] Not initialized. Call initialize() first.');
      return ipc;
    },

    get models() {
      if (!models) throw new Error('[SemblanceCore] Not initialized. Call initialize() first.');
      return models;
    },

    async initialize(): Promise<void> {
      if (initialized) return;

      // Ensure data directory exists
      if (!p.fs.existsSync(dataDir)) {
        p.fs.mkdirSync(dataDir, { recursive: true });
      }

      // Initialize model manager (needs SQLite for preferences)
      const coreDb = p.sqlite.openDatabase(p.path.join(dataDir, 'core.db'));
      coreDb.pragma('journal_mode = WAL');
      models = new ModelManager(llm, coreDb);

      // Step 1: Verify LLM is available
      const llmAvailable = await llm.isAvailable();
      if (!llmAvailable) {
        console.warn('[SemblanceCore] Ollama is not running. LLM features will be unavailable until Ollama starts.');
      }

      // Step 2: Select the best chat model
      let chatModel = config?.chatModel;
      if (!chatModel && llmAvailable) {
        chatModel = await models.getActiveChatModel() ?? undefined;
        if (chatModel) {
          console.log(`[SemblanceCore] Selected chat model: ${chatModel}`);
        }
      }
      chatModel = chatModel ?? 'llama3.2:8b';

      // Step 3: Initialize the knowledge graph (LanceDB + SQLite)
      const knowledgeDir = p.path.join(dataDir, 'knowledge');
      knowledge = await createKnowledgeGraph({
        dataDir: knowledgeDir,
        llmProvider: llm,
        embeddingModel,
      });
      console.log('[SemblanceCore] Knowledge graph initialized');

      // Step 4: Create and connect the IPC client
      ipc = new CoreIPCClient({
        socketPath,
        signingKeyPath,
      });

      try {
        await ipc.connect();
        console.log('[SemblanceCore] Connected to Gateway via IPC');
      } catch (err) {
        console.warn(
          '[SemblanceCore] Could not connect to Gateway:',
          err instanceof Error ? err.message : String(err),
          '— Agent actions requiring Gateway will fail until Gateway is started.'
        );
      }

      // Step 5: Create the orchestrator
      agent = createOrchestrator({
        llmProvider: llm,
        knowledgeGraph: knowledge,
        ipcClient: ipc,
        autonomyConfig: config?.autonomyConfig,
        dataDir,
        model: chatModel,
      });
      console.log('[SemblanceCore] Orchestrator initialized');

      initialized = true;
      console.log('[SemblanceCore] All subsystems initialized');
    },

    async shutdown(): Promise<void> {
      if (!initialized) return;

      // Disconnect IPC
      if (ipc) {
        await ipc.disconnect();
        console.log('[SemblanceCore] Disconnected from Gateway');
      }

      initialized = false;
      console.log('[SemblanceCore] Shut down');
    },
  };

  return core;
}
