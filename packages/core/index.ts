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
import { loadExtensions } from './extensions/loader.js';
import { PremiumGate } from './premium/premium-gate.js';
import { StyleProfileStore } from './style/style-profile.js';
import { RecurringDetector } from './finance/recurring-detector.js';
import { MerchantNormalizer } from './finance/merchant-normalizer.js';
import type { ExtensionInitContext } from './extensions/types.js';

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
  ReasoningContext,
  ReasoningChunkRef,
} from './agent/types.js';

export type { Orchestrator, OrchestratorResponse } from './agent/orchestrator.js';
export type { IPCClient, IPCClientConfig, IPCClientTransportConfig } from './agent/ipc-client.js';
export { CoreIPCClient } from './agent/ipc-client.js';
export { createOrchestrator } from './agent/index.js';
export { ConversationManager } from './agent/conversation-manager.js';
export type {
  ConversationSummary as ConvSummary,
  ConversationTurnRow,
  ListConversationsOptions,
  ConversationWithTurns,
} from './agent/conversation-manager.js';

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

// Re-export Merkle chain integrity
export {
  MerkleChain,
  buildMerkleRoot,
  canonicalJSON,
} from './audit/merkle-chain.js';
export type {
  DailyMerkleRoot,
  ChainVerificationResult,
  SignedDailyReceipt,
} from './audit/merkle-chain.js';

// Re-export sovereignty report
export {
  generateSovereigntyReport,
  verifySovereigntyReport,
  buildSignablePayload,
  renderSovereigntyReportPDF,
} from './reporting/sovereignty-report.js';
export type {
  SovereigntyReport,
  SovereigntyReportDeps,
} from './reporting/sovereignty-report.js';

// Credential keychain interface
export type { KeychainStore } from './credentials/keychain.js';
export {
  keychainServiceName,
  keychainOAuthServiceName,
  MIGRATED_SENTINEL,
} from './credentials/keychain.js';

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
  /** External LLM provider. If supplied, used instead of creating OllamaProvider. */
  llmProvider?: LLMProvider;
  /**
   * External IPC transport. If supplied, used instead of creating a socket-based transport.
   * Used by mobile to inject MobileGatewayTransport (in-process web search/fetch).
   */
  ipcTransport?: import('./ipc/transport.js').IPCTransport;
}

// Default socket path varies by platform
function defaultSocketPath(): string {
  const p = getPlatform();
  if (p.hardware.platform() === 'win32') {
    // Per-user, per-process pipe name — must match Gateway's getDefaultSocketPath()
    // Use username from homedir path to avoid node:os dependency.
    // PID suffix prevents collisions with stale pipes from crashed sidecars.
    // Gateway and Core run in the same Node process, so process.pid always matches.
    const home = p.hardware.homedir();
    const username = home.split(/[/\\]/).pop() ?? 'default';
    return `\\\\.\\pipe\\semblance-gateway-${username}-${process.pid}`;
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

  // Use external LLM provider if supplied, otherwise create localhost-only Ollama
  const llm = config?.llmProvider ?? createLLMProvider({ baseUrl: ollamaBaseUrl });

  // Deferred — initialized in initialize()
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
      console.error('[SemblanceCore] Opening core.db...');
      const coreDb = p.sqlite.openDatabase(p.path.join(dataDir, 'core.db'));
      coreDb.pragma('journal_mode = WAL');
      models = new ModelManager(llm, coreDb);
      console.error('[SemblanceCore] ModelManager ready, checking LLM availability...');

      // Step 1: Verify LLM is available
      const llmCheckStart = Date.now();
      const llmAvailable = await llm.isAvailable();
      console.error(`[SemblanceCore] LLM availability check took ${Date.now() - llmCheckStart}ms, available: ${llmAvailable}`);
      if (!llmAvailable) {
        console.error('[SemblanceCore] Ollama is not running. LLM features will be unavailable until Ollama starts.');
      }

      // Step 2: Select the best chat model
      let chatModel = config?.chatModel;
      if (!chatModel && llmAvailable) {
        chatModel = await models.getActiveChatModel() ?? undefined;
        if (chatModel) {
          console.error(`[SemblanceCore] Selected chat model: ${chatModel}`);
        }
      }
      chatModel = chatModel ?? 'llama3.1:8b';

      console.error(`[SemblanceCore] Chat model selected: ${chatModel}`);
      // Step 3: Initialize the knowledge graph (LanceDB + SQLite)
      // Wrapped with timeout — LanceDB native bindings can hang if misconfigured.
      // Knowledge graph failure is non-fatal: chat and model downloads still work.
      const knowledgeDir = p.path.join(dataDir, 'knowledge');
      try {
        const kgPromise = createKnowledgeGraph({
          dataDir: knowledgeDir,
          llmProvider: llm,
          embeddingModel,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Knowledge graph init timed out after 10s')), 10_000)
        );
        knowledge = await Promise.race([kgPromise, timeoutPromise]);
        console.error('[SemblanceCore] Knowledge graph initialized');
      } catch (err) {
        console.error(
          '[SemblanceCore] Knowledge graph initialization failed:',
          err instanceof Error ? err.message : String(err),
          '— Semantic search and indexing will be unavailable.'
        );
      }

      // Step 4: Create and connect the IPC client
      console.error('[SemblanceCore] Connecting IPC client...');
      if (config?.ipcTransport) {
        // Mobile: use provided transport (e.g. MobileGatewayTransport)
        // Generate a random signing key for in-process use (never sent over network)
        const keyBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) keyBytes[i] = Math.floor(Math.random() * 256);
        ipc = new CoreIPCClient({
          transport: config.ipcTransport,
          signingKey: Buffer.from(keyBytes),
        });
      } else {
        // Desktop: connect to Gateway via Unix socket / named pipe
        ipc = new CoreIPCClient({
          socketPath,
          signingKeyPath,
        });
      }

      try {
        const ipcConnectStart = Date.now();
        await ipc.connect();
        console.error(`[SemblanceCore] Connected to Gateway via IPC (${Date.now() - ipcConnectStart}ms)`);
      } catch (err) {
        console.error(
          '[SemblanceCore] Could not connect to Gateway:',
          err instanceof Error ? err.message : String(err),
          '— Agent actions requiring Gateway will fail until Gateway is started.'
        );
      }
      console.error('[SemblanceCore] IPC step complete, creating orchestrator...');

      // Step 5: Create the orchestrator (requires knowledge graph)
      console.error('[SemblanceCore] Creating orchestrator...');
      if (knowledge) {
        agent = createOrchestrator({
          llmProvider: llm,
          knowledgeGraph: knowledge,
          ipcClient: ipc,
          autonomyConfig: config?.autonomyConfig,
          dataDir,
          model: chatModel,
        });
        console.error('[SemblanceCore] Orchestrator initialized');

        // Step 6: Load and initialize extensions (e.g. @semblance/dr)
        console.error('[SemblanceCore] Loading extensions...');
        const extStart = Date.now();
        const extensions = await loadExtensions();
        console.error(`[SemblanceCore] Extensions loaded in ${Date.now() - extStart}ms`);
        if (extensions.length > 0) {
          const premiumGate = new PremiumGate(coreDb);
          const styleProfileStore = new StyleProfileStore(coreDb);
          const merchantNormalizer = new MerchantNormalizer({ llm, model: chatModel });
          const recurringDetector = new RecurringDetector({ db: coreDb, normalizer: merchantNormalizer });
          const extCtx: ExtensionInitContext = {
            db: coreDb,
            llm,
            model: chatModel,
            ipcClient: ipc,
            autonomyManager: agent.autonomy,
            premiumGate,
            styleProfileStore,
            semanticSearch: knowledge.semanticSearch,
            recurringDetector,
            knowledgeGraph: knowledge,
            dataDir,
          };
          for (const ext of extensions) {
            if (ext.initialize) {
              await ext.initialize(extCtx);
            }
            if (ext.tools && ext.tools.length > 0) {
              agent.registerTools(ext.tools);
            }
          }
          console.error(`[SemblanceCore] Loaded ${extensions.length} extension(s)`);
        }
      } else {
        console.error('[SemblanceCore] Skipping orchestrator and extensions — knowledge graph unavailable');
      }

      initialized = true;
      console.error('[SemblanceCore] All subsystems initialized');
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
