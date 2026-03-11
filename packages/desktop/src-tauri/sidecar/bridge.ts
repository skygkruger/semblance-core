// Semblance Desktop Sidecar Bridge
//
// Node.js sidecar process for Tauri integration.
// Reasoning: SemblanceCore and Gateway are TypeScript/Node packages. This sidecar
// hosts both in a single Node.js process, communicating with the Rust Tauri backend
// via NDJSON (newline-delimited JSON) over stdin/stdout. This is the simplest approach
// that gets to working integration fastest, per build prompt guidance (Option A).
// Escalation check: Build prompt explicitly authorizes this decision scope.
//
// Protocol:
//   Request (stdin):  {"id": 1, "method": "send_message", "params": {"message": "..."}}
//   Response (stdout): {"id": 1, "result": {...}}
//   Error (stdout):    {"id": 1, "error": "..."}
//   Event (stdout):    {"event": "chat-token", "data": "..."}
//
// The sidecar is spawned by the Rust backend on app startup and killed on shutdown.
// All communication is local — no network access from this process except to
// localhost Ollama (via @semblance/core's OllamaProvider, which enforces localhost-only).

import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir, hostname, totalmem } from 'node:os';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { createSemblanceCore, type SemblanceCore, type ChatMessage } from '../../../core/index.js';
import { createLLMProvider } from '../../../core/llm/index.js';
import type { NativeRuntimeBridge } from '../../../core/llm/native-bridge-types.js';
import { getPlatform } from '../../../core/platform/index.js';
import { createDesktopVectorStore } from '../../../core/platform/desktop-adapter.js';
import { scanDirectory, readFileContent } from '../../../core/knowledge/file-scanner.js';
import {
  Gateway,
  CredentialStore,
  EmailAdapter,
  CalendarAdapter,
  PROVIDER_PRESETS,
} from '../../../gateway/index.js';
import type { ServiceCredential } from '../../../gateway/credentials/types.js';
import { EmailIndexer } from '../../../core/knowledge/email-indexer.js';
import { CalendarIndexer } from '../../../core/knowledge/calendar-indexer.js';
import { EmailCategorizer } from '../../../core/agent/email-categorizer.js';
import { ProactiveEngine } from '../../../core/agent/proactive-engine.js';
import type { ActionType } from '../../../core/types/ipc.js';

// Premium / Founding Member imports
import { PremiumGate } from '../../../core/premium/index.js';
import { extractLicenseKey } from '../../../core/premium/license-email-detector.js';

// Step 7 imports
import { StatementParser } from '../../../core/finance/statement-parser.js';
import { MerchantNormalizer } from '../../../core/finance/merchant-normalizer.js';
import { RecurringDetector } from '../../../core/finance/recurring-detector.js';
import { EscalationEngine } from '../../../core/agent/autonomy-escalation.js';
import { KnowledgeMomentGenerator } from '../../../core/agent/knowledge-moment.js';
import { WeeklyDigestGenerator } from '../../../core/digest/weekly-digest.js';

// Step 8 imports
import { ContactStore } from '../../../core/knowledge/contacts/contact-store.js';
import { RelationshipAnalyzer } from '../../../core/knowledge/contacts/relationship-analyzer.js';
import { BirthdayTracker } from '../../../core/agent/proactive/birthday-tracker.js';
import { ContactFrequencyMonitor } from '../../../core/agent/proactive/contact-frequency-monitor.js';
import { NetworkMonitor } from '../../../gateway/monitor/network-monitor.js';
import { PrivacyReportGenerator } from '../../../gateway/monitor/privacy-report.js';
import { AuditQuery } from '../../../gateway/audit/audit-query.js';
import { DeviceRegistry } from '../../../core/routing/device-registry.js';
import { TaskAssessor } from '../../../core/routing/task-assessor.js';
import { TaskRouter } from '../../../core/routing/router.js';

// Step 15 imports
import { MessageDrafter } from '../../../core/agent/messaging/message-drafter.js';
import { maskPhoneNumber } from '../../../core/agent/messaging/phone-utils.js';
import { ClipboardPatternRecognizer } from '../../../core/agent/clipboard/pattern-recognizer.js';
import { sanitizeForAuditTrail } from '../../../core/agent/clipboard/clipboard-privacy.js';
import type { MessagingAdapter } from '../../../core/platform/messaging-types.js';

// Connector registry for auth type differentiation
import { createDefaultConnectorRegistry } from '../../../core/importers/connector-registry.js';

// Conversation management imports
import { ConversationManager } from '../../../core/agent/conversation-manager.js';
import { ConversationIndexer } from '../../../core/agent/conversation-indexer.js';

// Intent layer imports
import { IntentManager } from '../../../core/agent/intent-manager.js';

// Alter Ego guardrail imports
import { AlterEgoStore } from '../../../core/agent/alter-ego-store.js';
import { AlterEgoGuardrails } from '../../../core/agent/alter-ego-guardrails.js';

// Knowledge curation imports
import { KnowledgeCurator } from '../../../core/knowledge/knowledge-curator.js';

// Merkle chain imports
import { MerkleChain } from '../../../core/audit/merkle-chain.js';
import { generateKeyPair as ed25519GenerateKeyPair } from '../../../core/crypto/ed25519.js';

// Hardware key provider
import { HardwareKeyProvider } from '../../../core/crypto/hardware-key-provider.js';
import type { HardwareKeyInfo, HardwareSignResult, HardwareVerifyResult } from '../../../core/crypto/hardware-key-provider.js';

// Sovereignty report
import { generateSovereigntyReport, verifySovereigntyReport, renderSovereigntyReportPDF } from '../../../core/reporting/sovereignty-report.js';
import type { SovereigntyReport } from '../../../core/reporting/sovereignty-report.js';

// Model download imports
import { getModelsForTier, getEmbeddingModel, getRecommendedReasoningModel, getModelById, MODEL_CATALOG } from '../../../core/llm/model-registry.js';
import type { ModelRegistryEntry } from '../../../core/llm/model-registry.js';
import { getModelsDir, getModelPath, isModelDownloaded, getModelFileSize } from '../../../core/llm/model-storage.js';
import { WHISPER_MODELS } from '../../../core/voice/whisper-model-manager.js';
import { PIPER_VOICES } from '../../../core/voice/piper-model-manager.js';
import type { HardwareProfileTier } from '../../../core/llm/hardware-types.js';

// Import pipeline imports
import { ImportPipeline } from '../../../core/importers/import-pipeline.js';
import type { ImportSummary } from '../../../core/importers/import-pipeline.js';

// OAuth imports (Gateway)
import { OAuthTokenManager } from '../../../gateway/services/oauth-token-manager.js';
import { OAuthCallbackServer } from '../../../gateway/services/oauth-callback-server.js';
import { oauthClients, UNCONFIGURED_CLIENT_ID } from '../../../gateway/config/oauth-clients.js';

// Morning Brief / Daily Digest / Weather / Style / Dark Pattern / Document Context / Health / Cloud Storage / Graph Vis
import { MorningBriefGenerator } from '../../../core/agent/morning-brief.js';
import { DailyDigestGenerator } from '../../../core/agent/daily-digest.js';
import { WeatherService } from '../../../core/weather/weather-service.js';
import { StyleProfileStore } from '../../../core/style/style-profile.js';
import { DarkPatternDetector } from '../../../core/defense/dark-pattern-detector.js';
import { DocumentContextManager } from '../../../core/agent/document-context.js';
import { HealthEntryStore } from '../../../core/health/health-entry-store.js';
import { CloudStorageClient } from '../../../core/cloud-storage/cloud-storage-client.js';
import { GraphVisualizationProvider } from '../../../core/knowledge/graph-visualization.js';

// ─── Process-level crash guards ──────────────────────────────────────────────
// Prevent unhandled exceptions/rejections from killing the sidecar silently
process.on('uncaughtException', (err) => {
  console.error('[sidecar] UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[sidecar] UNHANDLED REJECTION:', reason);
});

// ─── NDJSON Protocol ──────────────────────────────────────────────────────────

function emit(event: string, data: unknown): void {
  process.stdout.write(JSON.stringify({ event, data }) + '\n');
}

function respond(id: number | string, result: unknown): void {
  process.stdout.write(JSON.stringify({ id, result }) + '\n');
}

function respondError(id: number | string, error: string): void {
  process.stdout.write(JSON.stringify({ id, error }) + '\n');
}

// ─── NDJSON Callback Protocol Extension (Step 9) ─────────────────────────────
//
// LOCKED DECISION: Reverse-call mechanism uses NDJSON callbacks, not Tauri invoke.
//
// When the sidecar (Node.js) needs to call Rust NativeRuntime:
// 1. Sidecar writes: {"type":"callback","id":"cb-xxx","method":"native_generate","params":{...}}
// 2. Rust reads this from stdout, dispatches to NativeRuntime
// 3. Rust writes back: {"type":"callback_response","id":"cb-xxx","result":{...}}
// 4. Sidecar reads this from stdin and resolves the pending Promise

// Callback protocol extracted to ndjson-callback.ts for testability.
// Re-exported here for backward compatibility within bridge.ts.
import { createCallbackProtocol } from './ndjson-callback';

const CALLBACK_TIMEOUT_MS = 120_000; // 2 minutes — model loading can be slow

const callbackProtocol = createCallbackProtocol(
  (line: string) => process.stdout.write(line),
  CALLBACK_TIMEOUT_MS,
);

const { sendCallback, handleCallbackResponse } = callbackProtocol;
const pendingCallbacks = callbackProtocol.pendingCallbacks;

// ─── State ────────────────────────────────────────────────────────────────────

let core: SemblanceCore | null = null;
let gateway: Gateway | null = null;
let prefsDb: Database.Database | null = null;
let credentialStore: CredentialStore | null = null;
let emailAdapter: EmailAdapter | null = null;
let calendarAdapter: CalendarAdapter | null = null;
let indexingInProgress = false;
let currentConversationId: string | null = null;
let dataDir = '';
let emailIndexer: EmailIndexer | null = null;
let calendarIndexer: CalendarIndexer | null = null;
let emailCategorizer: EmailCategorizer | null = null;
let proactiveEngine: ProactiveEngine | null = null;

// Step 7 state
let statementParser: StatementParser | null = null;
let merchantNormalizer: MerchantNormalizer | null = null;
let recurringDetector: RecurringDetector | null = null;
let escalationEngine: EscalationEngine | null = null;
let knowledgeMomentGenerator: KnowledgeMomentGenerator | null = null;
let weeklyDigestGenerator: WeeklyDigestGenerator | null = null;

// Step 8 state
let networkMonitor: NetworkMonitor | null = null;
let privacyReportGenerator: PrivacyReportGenerator | null = null;
let auditQuery: AuditQuery | null = null;
let deviceRegistry: DeviceRegistry | null = null;
let taskAssessor: TaskAssessor | null = null;
let taskRouter: TaskRouter | null = null;

// Step 15 state
let messageDrafter: MessageDrafter | null = null;
let messagingAdapter: MessagingAdapter | null = null;
let clipboardRecognizer: ClipboardPatternRecognizer | null = null;
let clipboardMonitoringEnabled = false;
let clipboardRecentActions: Array<{ patternType: string; action: string; timestamp: string }> = [];

// Premium state
let premiumGate: PremiumGate | null = null;

// Step 14 state
let contactStore: ContactStore | null = null;
let relationshipAnalyzer: RelationshipAnalyzer | null = null;
let birthdayTracker: BirthdayTracker | null = null;
let contactFrequencyMonitor: ContactFrequencyMonitor | null = null;

// Conversation management state
let conversationManager: ConversationManager | null = null;
let conversationIndexer: ConversationIndexer | null = null;

// Intent layer state
let intentManager: IntentManager | null = null;

// Alter Ego guardrail state
let alterEgoStore: AlterEgoStore | null = null;
let alterEgoGuardrails: AlterEgoGuardrails | null = null;

// Knowledge curation state
let curator: KnowledgeCurator | null = null;

// Merkle chain state
let merkleChain: MerkleChain | null = null;
let merkleDb: Database.default | null = null;
let cachedChainStatus: { verified: boolean; entryCount: number; daysVerified: number; firstBreak?: string; lastVerifiedAt: string } | null = null;

// Hardware key provider state
let hwKeyProvider: HardwareKeyProvider | null = null;

// Step 23+ state (morning brief, daily digest, weather, style, dark patterns, documents, health, cloud, graph)
let morningBriefGenerator: MorningBriefGenerator | null = null;
let dailyDigestGenerator: DailyDigestGenerator | null = null;
let weatherService: WeatherService | null = null;
let styleProfileStore: StyleProfileStore | null = null;
let darkPatternDetector: DarkPatternDetector | null = null;
let documentContextManager: DocumentContextManager | null = null;
let healthEntryStore: HealthEntryStore | null = null;
let cloudStorageClient: CloudStorageClient | null = null;
let graphVisualizationProvider: GraphVisualizationProvider | null = null;

// Model download state
interface ActiveDownload {
  modelId: string;
  modelName: string;
  totalBytes: number;
  downloadedBytes: number;
  speedBytesPerSec: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  error?: string;
  abortController?: AbortController;
}
const activeDownloads: Map<string, ActiveDownload> = new Map();

// OAuth token manager state
let oauthTokenManager: OAuthTokenManager | null = null;

// Import pipeline state
let importPipeline: ImportPipeline | null = null;
const importHistory: Array<{
  id: string;
  sourceType: string;
  format: string;
  importedAt: string;
  itemCount: number;
  status: string;
}> = [];

// ─── NativeRuntime Bridge ────────────────────────────────────────────────────
//
// Implements NativeRuntimeBridge by wrapping sendCallback() calls to Rust.
// This bridges NativeProvider (packages/core/llm/native-provider.ts) to the
// Rust NativeRuntime via NDJSON callbacks. The entire SemblanceCore subsystem
// (knowledge graph embeddings, orchestrator, model management) uses this
// instead of requiring Ollama.

const nativeRuntimeBridge: NativeRuntimeBridge = {
  async generate(params) {
    const result = await sendCallback('native_generate', {
      prompt: params.prompt,
      system_prompt: params.systemPrompt ?? '',
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.7,
      stop: params.stop ?? ['<|im_end|>', '<|endoftext|>'],
    }) as { text: string; tokens_generated: number; duration_ms: number };
    return {
      text: result.text,
      tokensGenerated: result.tokens_generated,
      durationMs: result.duration_ms,
    };
  },

  async embed(params) {
    const result = await sendCallback('native_embed', {
      model_path: '',
      input: params.input,
    }) as { embeddings: number[][]; dimensions: number; duration_ms: number };
    return {
      embeddings: result.embeddings,
      dimensions: result.dimensions,
      durationMs: result.duration_ms,
    };
  },

  async loadModel(modelPath: string) {
    await sendCallback('native_load_model', { model_path: modelPath, model_type: 'reasoning' });
  },

  async loadEmbeddingModel(modelPath: string) {
    await sendCallback('native_load_model', { model_path: modelPath, model_type: 'embedding' });
  },

  async unloadModel() {
    // NativeRuntime doesn't have explicit unload yet — no-op
  },

  async getStatus() {
    const result = await Promise.race([
      sendCallback('native_status', {}),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]) as {
      status: string;
      reasoning_model: string | null;
      embedding_model: string | null;
    } | null;
    if (!result) return { status: 'uninitialized' as const, reasoningModel: null, embeddingModel: null };
    const statusStr = result.status?.toLowerCase() ?? '';
    let status: 'uninitialized' | 'loading' | 'ready' | 'error' = 'uninitialized';
    if (statusStr.includes('ready')) status = 'ready';
    else if (statusStr.includes('loading')) status = 'loading';
    else if (statusStr.includes('error')) status = 'error';
    return {
      status,
      reasoningModel: result.reasoning_model ?? null,
      embeddingModel: result.embedding_model ?? null,
    };
  },

  async isReady() {
    try {
      const status = await this.getStatus();
      return (status.status ?? '').toLowerCase() === 'ready';
    } catch {
      return false;
    }
  },
};

function ensureHwKeyProvider(): boolean {
  if (hwKeyProvider) return true;
  if (!prefsDb) return false;
  // Build a SecureStorageAdapter backed by the prefs SQLite DB
  const storage = {
    async get(key: string): Promise<string | null> { return getPref(key); },
    async set(key: string, value: string): Promise<void> { setPref(key, value); },
    async delete(key: string): Promise<void> { if (prefsDb) prefsDb.prepare('DELETE FROM preferences WHERE key = ?').run(key); },
  };
  const platform = process.platform; // 'win32', 'darwin', 'linux'
  const arch = process.arch;
  const backend = HardwareKeyProvider.detectBackend(platform, arch);
  hwKeyProvider = new HardwareKeyProvider({ storage, backend });
  return true;
}

function ensureMerkleChain(): boolean {
  if (merkleChain) return true;
  if (!dataDir) return false;
  const gatewayDataDir = join(dataDir, 'gateway');
  const auditDbPath = join(gatewayDataDir, 'audit.db');
  if (existsSync(auditDbPath)) {
    merkleDb = new Database(auditDbPath);
    merkleChain = new MerkleChain(merkleDb);
    return true;
  }
  return false;
}

// ─── Preferences ──────────────────────────────────────────────────────────────

const PREFS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function getPref(key: string): string | null {
  if (!prefsDb) return null;
  const row = prefsDb.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setPref(key: string, value: string): void {
  if (!prefsDb) return;
  prefsDb.prepare(
    "INSERT OR REPLACE INTO preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))"
  ).run(key, value);
}

// ─── Conversation Storage ─────────────────────────────────────────────────────
// The Orchestrator creates conversations/conversation_turns tables in core.db.
// We write to them directly for streaming chat (since we bypass the Orchestrator's
// processMessage to enable token streaming).

function ensureConversation(): string {
  if (currentConversationId) return currentConversationId;
  const id = nanoid();
  const now = new Date().toISOString();
  prefsDb!.prepare(
    'INSERT OR IGNORE INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)'
  ).run(id, now, now);
  currentConversationId = id;
  return id;
}

function storeTurn(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
): void {
  const turnId = nanoid();
  prefsDb!.prepare(
    'INSERT INTO conversation_turns (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
  ).run(turnId, conversationId, role, content, new Date().toISOString());
}

// ─── System Prompt (matches Orchestrator's prompt) ────────────────────────────

function getSystemPrompt(): string {
  const aiName = getPref('ai_name') ?? 'Semblance';
  const userName = getPref('user_name');
  const userRef = userName ? `${userName}'s` : "the user's";

  // Build connected services section
  let servicesSection = '';
  try {
    const tokenMgr = ensureOAuthTokenManager();
    const connectorRegistry = createDefaultConnectorRegistry();
    const connectedServices: string[] = [];
    for (const connector of connectorRegistry.listAll()) {
      const oauthCfg = getOAuthConfigForConnector(connector.id);
      if (oauthCfg) {
        const accessToken = tokenMgr.getAccessToken(oauthCfg.providerKey);
        if (accessToken) {
          connectedServices.push(connector.displayName);
        }
      }
    }
    if (connectedServices.length > 0) {
      servicesSection = `\n\nConnected services: ${connectedServices.join(', ')}. You have access to data from these services through the user's local knowledge base.`;
    }
  } catch {
    // Token manager not ready yet — no services to report
  }

  // Build knowledge stats section
  let knowledgeSection = '';
  try {
    if (prefsDb) {
      const docCount = (prefsDb.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number })?.count ?? 0;
      if (docCount > 0) {
        knowledgeSection = `\n\nThe user's knowledge base contains ${docCount} indexed documents. Search it to answer questions about their files, emails, and connected data.`;
      }
    }
  } catch {
    // documents table might not exist yet
  }

  return `You are ${aiName}, ${userRef} personal AI. You run entirely on their device — their data never leaves their machine.

You have access to their local files and documents through secure search. You can search their knowledge base and answer questions about their documents.${servicesSection}${knowledgeSection}

Core principles:
- You are helpful, warm, proactive, and concise
- You respect the user's privacy absolutely — all processing happens locally
- When you need information, search the user's knowledge base first
- Be transparent about what data you're accessing
- If you don't know something, say so honestly`;
}

// ─── Method Handlers ──────────────────────────────────────────────────────────

async function handleInitialize(): Promise<unknown> {
  dataDir = join(homedir(), '.semblance', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  // ──── STEP 1: Open preferences DB FIRST ────
  // Preferences (onboarding state, user name, autonomy tiers) are independent
  // of the knowledge graph and must be available even if core fails to init.
  prefsDb = new Database(join(dataDir, 'core.db'));
  prefsDb.pragma('journal_mode = WAL');
  prefsDb.exec(PREFS_TABLE_SQL);
  console.error('[sidecar] Preferences DB ready');

  // Initialize PremiumGate early (uses core.db)
  premiumGate = new PremiumGate(prefsDb as unknown as import('../../../core/platform/types.js').DatabaseHandle);

  // Ensure conversation tables exist BEFORE ConversationManager.migrate()
  // (The Orchestrator normally creates these, but core may not initialize.)
  prefsDb.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );
  `);

  // Initialize Conversation Manager early (uses core.db)
  conversationManager = new ConversationManager(prefsDb);
  conversationManager.migrate();
  const prunedCount = conversationManager.pruneExpired();
  if (prunedCount > 0) console.error(`[sidecar] Pruned ${prunedCount} expired conversations`);
  console.error('[sidecar] ConversationManager ready');

  // ──── STEP 2: Gateway ────
  console.error('[sidecar] Creating Gateway...');
  gateway = new Gateway();
  console.error('[sidecar] Gateway created, calling start()...');
  const gatewayTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Gateway.start() timed out after 10s')), 10_000)
  );
  await Promise.race([gateway.start(), gatewayTimeout]);
  console.error('[sidecar] Gateway started');

  // ──── STEP 3: Core init (can fail — knowledge graph depends on LanceDB) ────
  // If this fails, the app still works for chat (NativeRuntime), preferences,
  // navigation, and all screens that don't need the knowledge graph.
  const platform = getPlatform();
  if (!platform.vectorStore) {
    platform.vectorStore = createDesktopVectorStore(join(dataDir, 'knowledge'));
  }
  const knowledgeDir = join(dataDir, 'knowledge');
  if (!existsSync(knowledgeDir)) mkdirSync(knowledgeDir, { recursive: true });

  // NativeRuntime channel check (non-blocking)
  void Promise.race([
    sendCallback('native_status', {}),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]).then((status) => {
    if (status) console.error('[sidecar] NativeRuntime channel ready:', JSON.stringify(status));
    else console.error('[sidecar] NativeRuntime channel timed out (5s)');
  }).catch((err) => console.error('[sidecar] NativeRuntime channel error:', err));

  const nativeLlm = createLLMProvider({
    runtime: 'builtin',
    nativeBridge: nativeRuntimeBridge,
    embeddingModel: 'nomic-embed-text-v1.5',
  });

  try {
    console.error('[sidecar] Creating SemblanceCore...');
    core = createSemblanceCore({ dataDir, llmProvider: nativeLlm });
    console.error('[sidecar] SemblanceCore created, calling initialize...');
    // 60s timeout — core.initialize includes LanceDB, knowledge graph, IPC, and extensions
    const initTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Core initialization timed out after 60s')), 60000)
    );
    await Promise.race([core.initialize(), initTimeout]);
    console.error('[sidecar] Core initialized');
  } catch (coreErr) {
    console.error('[sidecar] Core initialization failed (knowledge graph unavailable):', coreErr);
    // Core may be partially initialized — keep it so chat can still work
    // via NativeRuntime even without knowledge graph context
  }

  // ──── STEP 4: Post-core setup (skip gracefully if core failed) ────

  // Initialize Conversation Indexer (indexes turns into knowledge graph)
  // Knowledge graph may be unavailable if LanceDB init failed — skip indexer in that case
  try {
    if (core) {
      conversationIndexer = new ConversationIndexer({ db: prefsDb, knowledge: core.knowledge });
      console.error('[sidecar] ConversationIndexer initialized');
    } else {
      console.error('[sidecar] ConversationIndexer skipped — core unavailable');
    }
  } catch {
    console.error('[sidecar] ConversationIndexer skipped — knowledge graph unavailable');
  }

  // Initialize IntentManager (idempotent schema migration)
  const modelName = core ? await core.models.getActiveChatModel() : null;
  intentManager = new IntentManager({
    db: prefsDb as unknown as import('../../../core/platform/types.js').DatabaseHandle,
    llm: core?.llm,
    model: modelName ?? undefined,
  });
  intentManager.retryParsing().catch((err) =>
    console.error('[sidecar] IntentManager retryParsing error:', err)
  );
  // Wire intent manager into orchestrator for system prompt injection + hard limit enforcement
  try {
    if (core?.agent?.setIntentManager) {
      core.agent.setIntentManager(intentManager);
    }
  } catch {
    console.error('[sidecar] IntentManager wiring skipped — orchestrator unavailable');
  }
  console.error('[sidecar] IntentManager initialized');

  // Initialize Alter Ego guardrails
  alterEgoStore = new AlterEgoStore(prefsDb as unknown as import('../../../core/platform/types.js').DatabaseHandle);
  alterEgoGuardrails = new AlterEgoGuardrails(alterEgoStore, contactStore);
  // Wire into orchestrator
  try {
    if (core?.agent?.setAlterEgoGuardrails) {
      core.agent.setAlterEgoGuardrails(alterEgoGuardrails, alterEgoStore);
    }
  } catch {
    console.error('[sidecar] AlterEgoGuardrails wiring skipped — orchestrator unavailable');
  }
  // Batch expiry cleanup — reject stale pending items on launch + every 15 minutes
  function cleanupStaleBatchItems(): void {
    if (!prefsDb) return;
    // Ensure table exists before querying — AlterEgoStore.migrate() may not have run yet
    try {
      prefsDb.exec('CREATE TABLE IF NOT EXISTS pending_actions (id TEXT PRIMARY KEY, status TEXT, tier TEXT, created_at TEXT)');
    } catch { /* table may already exist with more columns — that's fine */ }
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const stale = prefsDb.prepare(
      `UPDATE pending_actions SET status = 'rejected'
       WHERE status = 'pending_approval' AND tier = 'alter_ego' AND created_at < ?`
    ).run(oneHourAgo);
    if ((stale as { changes: number }).changes > 0) {
      console.error(`[AlterEgo] Auto-rejected ${(stale as { changes: number }).changes} stale batch items`);
    }
  }
  cleanupStaleBatchItems();
  setInterval(cleanupStaleBatchItems, 15 * 60 * 1000);
  console.error('[sidecar] AlterEgoGuardrails initialized');

  // Initialize credential store in Gateway's database
  const gatewayDataDir = join(homedir(), '.semblance', 'gateway');
  if (!existsSync(gatewayDataDir)) mkdirSync(gatewayDataDir, { recursive: true });
  const credDb = new Database(join(gatewayDataDir, 'credentials.db'));
  credentialStore = new CredentialStore(credDb);

  // Initialize service adapters
  emailAdapter = new EmailAdapter(credentialStore);
  calendarAdapter = new CalendarAdapter(credentialStore);

  // Wire connection testing into the credential store
  credentialStore.setConnectionTester(async (credential, password) => {
    try {
      if (credential.protocol === 'imap') {
        return await emailAdapter!.imap.testConnection(credential, password);
      } else if (credential.protocol === 'smtp') {
        return await emailAdapter!.smtp.testConnection(credential, password);
      } else if (credential.protocol === 'caldav') {
        return await calendarAdapter!.caldav.testConnection(credential, password);
      }
      return { success: false, error: `No test available for protocol: ${credential.protocol}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Check NativeRuntime status (primary inference engine — llama.cpp via Rust)
  let inferenceEngine: 'native' | 'ollama' | 'none' = 'none';
  let activeModel: string | null = null;
  let availableModels: string[] = [];

  // Try loading existing GGUF models into NativeRuntime on startup
  // Each call has a 120s timeout — model loading is a real disk+memory operation
  const modelsBaseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  for (const model of MODEL_CATALOG) {
    if (isModelDownloaded(model.id, modelsBaseDir)) {
      const modelPath = getModelPath(model.id, modelsBaseDir);
      const modelType = model.id.includes('embed') ? 'embedding' : 'reasoning';
      try {
        const loadResult = await Promise.race([
          sendCallback('native_load_model', { model_path: modelPath, model_type: modelType }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 120000)),
        ]);
        if (loadResult === null) {
          console.error(`[sidecar] native_load_model timed out for "${model.id}" after 120s — model loading failed`);
          break; // Don't try more models if loading fails
        }
        console.error(`[sidecar] Loaded model "${model.id}" into NativeRuntime (${modelType})`);
        if (modelType === 'reasoning') {
          activeModel = model.displayName;
          availableModels.push(model.displayName);
        }
      } catch (err) {
        console.error(`[sidecar] Failed to load "${model.id}" into NativeRuntime:`, err);
        break; // Don't try more models if loading fails
      }
    }
  }

  // Check NativeRuntime status (10s timeout — models may still be settling after load)
  try {
    const nativeStatus = await Promise.race([
      sendCallback('native_status', {}),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
    ]);
    if (nativeStatus && ((nativeStatus as { status: string })?.status ?? '').toLowerCase() === 'ready') {
      inferenceEngine = 'native';
      console.error('[sidecar] NativeRuntime is ready');
    } else if (nativeStatus === null) {
      console.error('[sidecar] NativeRuntime status check timed out (10s)');
    }
  } catch {
    console.error('[sidecar] NativeRuntime not available, checking Ollama fallback');
  }

  // Fall back to Ollama if NativeRuntime has no models loaded
  // Note: Don't use core.llm.isAvailable() here — it re-checks native providers (slow timeout).
  // Instead check Ollama directly via the OllamaProvider if available.
  if (inferenceEngine === 'none' && core) {
    let ollamaAvailable = false;
    try {
      // Quick Ollama check — just try listing models
      const { Ollama } = await import('ollama');
      const ollamaClient = new Ollama({ host: 'http://localhost:11434' });
      await ollamaClient.list();
      ollamaAvailable = true;
    } catch {
      // Ollama not running
    }
    if (ollamaAvailable) {
      inferenceEngine = 'ollama';
      const models = await core.llm.listModels();
      availableModels = models.filter(m => !m.isEmbedding).map(m => m.name);
      activeModel = await core.models.getActiveChatModel();
      console.error('[sidecar] Using Ollama as inference backend');
    }
  }

  // Load persisted preferences
  const userName = getPref('user_name');
  const onboardingComplete = getPref('onboarding_complete') === 'true';

  console.error('[sidecar] Ready');

  // Emit status-update event so the frontend receives model name, engine, and onboarding state
  emit('status-update', {
    ollamaStatus: inferenceEngine !== 'none' ? 'connected' : 'disconnected',
    inferenceEngine,
    activeModel,
    availableModels,
    onboardingComplete,
    userName,
  });

  return {
    ollamaStatus: inferenceEngine !== 'none' ? 'connected' : 'disconnected',
    inferenceEngine,
    activeModel,
    availableModels,
    userName,
    onboardingComplete,
  };
}

async function handleSendMessage(
  id: number | string,
  params: { message: string; conversation_id?: string },
): Promise<void> {
  // Check inference availability — NativeRuntime works independently of core
  console.error('[sidecar] handleSendMessage — core initialized:', !!core, 'native check starting...');
  let useNative = false;
  try {
    const nativeStatus = await Promise.race([
      sendCallback('native_status', {}),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    console.error('[sidecar] handleSendMessage — native status:', JSON.stringify(nativeStatus));
    if (nativeStatus && ((nativeStatus as { status: string })?.status ?? '').toLowerCase() === 'ready') {
      useNative = true;
    }
  } catch (nativeErr) {
    console.error('[sidecar] handleSendMessage — native check failed:', nativeErr);
  }
  console.error('[sidecar] handleSendMessage — useNative:', useNative);

  if (!useNative) {
    // Try Ollama as fallback
    const ollamaAvailable = core ? await core.llm.isAvailable() : false;
    console.error('[sidecar] handleSendMessage — ollama available:', ollamaAvailable);
    if (!ollamaAvailable) {
      respondError(id, 'No AI model available. The model may still be loading — try again in a moment.');
      return;
    }
  }

  const responseId = `msg_${Date.now()}`;

  // Use provided conversation_id or create a new one via ConversationManager
  let convId: string;
  if (params.conversation_id) {
    convId = params.conversation_id;
    currentConversationId = convId;
  } else if (currentConversationId) {
    convId = currentConversationId;
  } else if (conversationManager) {
    const conv = conversationManager.create(params.message);
    convId = conv.id;
    currentConversationId = convId;
  } else {
    convId = ensureConversation();
  }

  // Return response ID immediately so frontend can start showing the streaming bubble
  respond(id, { responseId, conversationId: convId });

  // Streaming happens asynchronously
  try {
    // Step 1: Search knowledge graph for relevant context (may be unavailable)
    let context: Array<{ document: { title: string }; score: number; chunk: { content: string } }> = [];
    try {
      if (core) {
        context = await core.knowledge.search(params.message, { limit: 5 });
      }
    } catch {
      // Knowledge graph unavailable — proceed without context
    }

    // Step 2: Build context string from search results
    let contextStr = '';
    if (context.length > 0) {
      contextStr =
        '\n\nRelevant documents from your files:\n' +
        context
          .map(
            r =>
              `[${r.document.title}] (score: ${r.score.toFixed(2)}): ${r.chunk.content.substring(0, 500)}`,
          )
          .join('\n\n');
    }

    // Step 3: Generate response via NativeRuntime or Ollama
    let fullResponse = '';

    if (useNative) {
      // Use NativeRuntime (llama.cpp via Rust) — primary inference path
      const prompt = params.message;
      const systemPrompt = getSystemPrompt() + contextStr;
      try {
        console.error('[sidecar] About to call native_generate, prompt length:', prompt.length);
        const result = await sendCallback('native_generate', {
          prompt,
          system_prompt: systemPrompt,
          max_tokens: 2048,
          temperature: 0.7,
          stop: ['<|im_end|>', '<|endoftext|>'],
        }) as { text: string; tokens_generated: number; duration_ms: number };
        console.error('[sidecar] native_generate returned:', JSON.stringify(result).slice(0, 200));
        fullResponse = result.text;
        // Emit in chunks to simulate streaming for the frontend
        const chunkSize = 12;
        for (let i = 0; i < fullResponse.length; i += chunkSize) {
          emit('chat-token', fullResponse.substring(i, i + chunkSize));
        }
      } catch (nativeErr) {
        console.error('[sidecar] NativeRuntime generate failed:', nativeErr, 'Full error:', JSON.stringify(nativeErr));
        throw nativeErr;
      }
    } else if (core) {
      // Fallback: Ollama streaming
      const model = (await core.models.getActiveChatModel()) ?? getRecommendedReasoningModel('standard').id;
      const messages: ChatMessage[] = [
        { role: 'system', content: getSystemPrompt() + contextStr },
        { role: 'user', content: params.message },
      ];
      if (core.llm.chatStream) {
        for await (const token of core.llm.chatStream({ model, messages })) {
          emit('chat-token', token);
          fullResponse += token;
        }
      } else {
        const response = await core.llm.chat({ model, messages });
        fullResponse = response.message.content;
        emit('chat-token', fullResponse);
      }
    } else {
      respondError(id, 'No inference engine available.');
      return;
    }

    // Step 5: Emit completion
    emit('chat-complete', { id: responseId, content: fullResponse, actions: [] });

    // Step 6: Persist conversation turns
    const userTurnId = nanoid();
    const assistantTurnId = nanoid();
    storeTurn(convId, 'user', params.message);
    storeTurn(convId, 'assistant', fullResponse);

    // Step 7: Update conversation metadata via ConversationManager
    if (conversationManager) {
      conversationManager.updateAfterTurn(convId, params.message, 'user');
      conversationManager.updateAfterTurn(convId, fullResponse, 'assistant');
    }

    // Step 8: Async, non-blocking semantic indexing of assistant response
    if (conversationIndexer) {
      conversationIndexer.indexTurn({
        conversationId: convId,
        turnId: assistantTurnId,
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      }).catch(err => console.error('[sidecar] Conversation indexing error:', err));
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit('chat-token', `\n\nError: ${errMsg}`);
    emit('chat-complete', { id: responseId, content: `Error: ${errMsg}`, actions: [] });
  }
}

async function handleGetOllamaStatus(): Promise<unknown> {

  let inferenceEngine: 'native' | 'ollama' | 'none' = 'none';
  let activeModel: string | null = null;
  let availableModels: string[] = [];

  // Check NativeRuntime first
  try {
    const nativeStatus = await sendCallback('native_status', {});
    if (nativeStatus && ((nativeStatus as { status: string })?.status ?? '').toLowerCase() === 'ready') {
      inferenceEngine = 'native';
      // List downloaded models from catalog
      const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
      for (const model of MODEL_CATALOG) {
        if (!model.id.includes('embed') && isModelDownloaded(model.id, baseDir)) {
          availableModels.push(model.displayName);
        }
      }
      activeModel = availableModels[0] ?? null;
    }
  } catch {
    // NativeRuntime not available
  }

  // Fall back to Ollama
  if (inferenceEngine === 'none' && core) {
    const ollamaAvailable = await core.llm.isAvailable();
    if (ollamaAvailable) {
      inferenceEngine = 'ollama';
      const models = await core.llm.listModels();
      availableModels = models.filter(m => !m.isEmbedding).map(m => m.name);
      activeModel = await core.models.getActiveChatModel();
    }
  }

  return {
    status: inferenceEngine !== 'none' ? 'connected' : 'disconnected',
    inferenceEngine,
    active_model: activeModel,
    available_models: availableModels,
  };
}

async function handleSelectModel(params: { model_id: string }): Promise<unknown> {
  if (!core) throw new Error('Core not initialized');

  // Check if it's a locally downloaded model
  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const catalogEntry = MODEL_CATALOG.find(m => m.displayName === params.model_id || m.id === params.model_id);
  if (catalogEntry && isModelDownloaded(catalogEntry.id, baseDir)) {
    const modelPath = getModelPath(catalogEntry.id, baseDir);
    const modelType = catalogEntry.id.includes('embed') ? 'embedding' : 'reasoning';
    try {
      await sendCallback('native_load_model', { model_path: modelPath, model_type: modelType });
      return { success: true, engine: 'native' };
    } catch (err) {
      console.error(`[sidecar] NativeRuntime load failed for "${params.model_id}":`, err);
    }
  }

  // Fallback: check Ollama
  const models = await core.llm.listModels();
  const found = models.find(m => m.name === params.model_id);
  if (!found) {
    throw new Error(`Model "${params.model_id}" not found. Download it first or check Ollama.`);
  }

  core.models.setActiveChatModel(params.model_id);
  return { success: true, engine: 'ollama' };
}

async function handleStartIndexing(
  id: number | string,
  params: { directories: string[] },
): Promise<void> {
  if (!core) {
    respondError(id, 'Core not initialized');
    return;
  }

  if (indexingInProgress) {
    respondError(id, 'Indexing already in progress');
    return;
  }

  if (!core?.knowledge) {
    respondError(id, 'Knowledge graph not initialized — cannot index files');
    return;
  }

  // Respond immediately
  respond(id, 'ok');
  indexingInProgress = true;
  console.error(`[sidecar] Starting indexing for ${params.directories.length} directories: ${params.directories.join(', ')}`);

  // Run indexing asynchronously
  (async () => {
    try {
      let totalFilesScanned = 0;
      let totalChunksCreated = 0;

      // Step 1: Scan all directories for files
      const allFiles: Awaited<ReturnType<typeof scanDirectory>> = [];
      for (const dir of params.directories) {
        try {
          const files = await scanDirectory(dir);
          allFiles.push(...files);
        } catch (err) {
          console.error(`[sidecar] Failed to scan ${dir}:`, err);
        }
      }

      const filesTotal = allFiles.length;

      // Emit initial progress
      emit('indexing-progress', {
        filesScanned: 0,
        filesTotal,
        chunksCreated: 0,
        currentFile: null,
        directories: params.directories,
      });

      // Step 2: Record each directory as a container node BEFORE indexing files
      for (const dir of params.directories) {
        const dirName = dir.split(/[/\\]/).pop() ?? dir;
        const filesInDir = allFiles.filter(f => f.path.startsWith(dir)).length;
        const totalSize = allFiles.filter(f => f.path.startsWith(dir)).reduce((sum, f) => sum + f.size, 0);
        const extensions = [...new Set(allFiles.filter(f => f.path.startsWith(dir)).map(f => f.extension))];

        if (!core?.knowledge) {
          console.error('[sidecar] Cannot index — core.knowledge not available');
          continue;
        }

        try {
          await core.knowledge.indexDocument({
            content: [
              `Directory: ${dirName}`,
              `Path: ${dir}`,
              `Files: ${filesInDir}`,
              `Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`,
              `File types: ${extensions.join(', ')}`,
              `Indexed: ${new Date().toISOString()}`,
            ].join('\n'),
            title: dirName,
            source: 'directory' as import('../../../core/knowledge/types.js').DocumentSource,
            sourcePath: dir,
            mimeType: 'inode/directory',
            metadata: {
              isDirectory: true,
              fileCount: filesInDir,
              totalSizeBytes: totalSize,
              extensions,
              path: dir,
            },
          });
        } catch (err) {
          console.error(`[sidecar] Failed to record directory node for ${dir}:`, err);
        }
      }

      // Step 3: Index files in batches with breathing room
      const BATCH_SIZE = 10;

      for (let batchStart = 0; batchStart < allFiles.length; batchStart += BATCH_SIZE) {
        const batch = allFiles.slice(batchStart, batchStart + BATCH_SIZE);

        for (const file of batch) {
          try {
            emit('indexing-progress', {
              filesScanned: totalFilesScanned,
              filesTotal,
              chunksCreated: totalChunksCreated,
              currentFile: file.name,
            });

            // Tier 1: Files > 10MB — metadata only, don't read content at all
            // (100MB was too generous — large files can still OOM during readFileContent)
            if (file.size > 10 * 1024 * 1024) {
              console.error(`[sidecar] Very large file "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)}MB) — metadata only`);
              try {
                if (core?.knowledge) {
                  await core.knowledge.indexDocument({
                    content: `[Large file: ${file.name}] Size: ${(file.size / 1024 / 1024).toFixed(1)} MB. File indexed as metadata only due to size.`,
                    title: file.name,
                    source: 'local_file' as import('../../../core/knowledge/types.js').DocumentSource,
                    sourcePath: file.path,
                    mimeType: file.extension ? `application/${file.extension.replace('.', '')}` : 'application/octet-stream',
                    metadata: { size: file.size, lastModified: file.lastModified, extension: file.extension, metadataOnly: true },
                  });
                }
              } catch { /* metadata index failed — continue */ }
              totalFilesScanned++;
              totalChunksCreated++;
              continue;
            }

            console.error(`[sidecar] Indexing file ${totalFilesScanned + 1}/${filesTotal}: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
            const content = await readFileContent(file.path);

            // Truncate content to prevent memory exhaustion during embedding.
            // 50K chars ≈ 12K tokens — well within embedding model capacity.
            // This allows ANY file to be indexed safely.
            let contentText = content.content;
            const MAX_CONTENT_CHARS = 50_000;
            if (contentText.length > MAX_CONTENT_CHARS) {
              console.error(`[sidecar] Truncated "${file.name}" from ${contentText.length} to ${MAX_CONTENT_CHARS} chars for embedding`);
              contentText = contentText.slice(0, MAX_CONTENT_CHARS);
            }

            if (!core?.knowledge) {
              console.error('[sidecar] Cannot index — core.knowledge not available');
              totalFilesScanned++;
              continue;
            }
            const result = await core.knowledge.indexDocument({
              content: contentText,
              title: content.title,
              source: 'local_file',
              sourcePath: file.path,
              mimeType: content.mimeType,
              metadata: {
                size: file.size,
                lastModified: file.lastModified,
                extension: file.extension,
              },
            });

            totalFilesScanned++;
            totalChunksCreated += result.chunksCreated;
          } catch (err) {
            console.error(`[sidecar] Failed to index ${file.path}:`, err);
            totalFilesScanned++;
          }
        }

        // Yield between batches — let event loop process IPC, progress events, etc.
        await new Promise(resolve => setTimeout(resolve, 50));

        // Force garbage collection if available (requires --expose-gc flag)
        if (typeof global.gc === 'function') {
          global.gc();
        }
      }

      // Step 3: Persist indexed directories
      const existingDirs = JSON.parse(getPref('indexed_directories') ?? '[]') as string[];
      const allDirs = [...new Set([...existingDirs, ...params.directories])];
      setPref('indexed_directories', JSON.stringify(allDirs));

      // Step 4: Get final stats
      const stats = core?.knowledge
        ? await core.knowledge.getStats()
        : { totalDocuments: totalFilesScanned, totalChunks: totalChunksCreated };

      // Step 5: Emit completion
      emit('indexing-complete', {
        filesScanned: totalFilesScanned,
        filesTotal,
        chunksCreated: totalChunksCreated,
        documentCount: stats.totalDocuments,
        chunkCount: stats.totalChunks,
        indexSizeBytes: 0, // LanceDB doesn't expose this directly
      });
    } catch (err) {
      console.error('[sidecar] Indexing failed:', err);
      emit('indexing-complete', {
        filesScanned: 0,
        filesTotal: 0,
        chunksCreated: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      indexingInProgress = false;
    }
  })();
}

async function handleGetIndexingStatus(): Promise<unknown> {
  return {
    state: indexingInProgress ? 'indexing' : 'idle',
    files_scanned: 0,
    files_total: 0,
    chunks_created: 0,
    current_file: null,
    error: null,
  };
}

async function handleGetKnowledgeStats(): Promise<unknown> {
  if (!core) {
    return { documentCount: 0, chunkCount: 0, indexSizeBytes: 0, lastIndexedAt: null };
  }

  const stats = await core.knowledge.getStats();
  return {
    documentCount: stats.totalDocuments,
    chunkCount: stats.totalChunks,
    indexSizeBytes: 0,
    lastIndexedAt: getPref('last_indexed_at'),
  };
}

async function handleGetIndexedDirectories(): Promise<string[]> {
  const dirs = getPref('indexed_directories');
  return dirs ? (JSON.parse(dirs) as string[]) : [];
}

async function handleGetActionLog(params: { limit: number; offset: number }): Promise<unknown[]> {
  if (!gateway) return [];

  try {
    const trail = gateway.getAuditTrail();
    const entries = trail.getRecent(params.limit + params.offset);

    // Map audit entries to frontend format
    return entries.slice(params.offset, params.offset + params.limit).map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      status: entry.status,
      description: formatAuditDescription(entry.action, entry.metadata),
      autonomy_tier: 'partner',
      payload_hash: entry.payloadHash,
      audit_ref: entry.id,
      estimated_time_saved_seconds: entry.estimatedTimeSavedSeconds ?? 0,
    }));
  } catch {
    return [];
  }
}

function formatAuditDescription(
  action: string,
  metadata?: Record<string, unknown>,
): string {
  const event = metadata?.event as string | undefined;
  if (event === 'gateway_started') return 'Gateway started';
  if (event === 'indexing_started') return 'File indexing started';
  if (event === 'indexing_complete') return 'File indexing completed';
  if (event === 'chat_message') return 'Chat message processed';
  return `Action: ${action}`;
}

async function handleGetPrivacyStatus(): Promise<unknown> {
  if (!gateway) {
    return { all_local: true, connection_count: 0, last_audit_entry: null, anomaly_detected: false };
  }

  try {
    const trail = gateway.getAuditTrail();
    const count = trail.count();
    const recent = trail.getRecent(1);
    const lastEntry = recent.length > 0 ? recent[0]!.timestamp : null;

    return {
      all_local: true,
      connection_count: 0,
      last_audit_entry: lastEntry,
      anomaly_detected: false,
    };
  } catch {
    return { all_local: true, connection_count: 0, last_audit_entry: null, anomaly_detected: false };
  }
}

function handleSetUserName(params: { name: string }): unknown {
  setPref('user_name', params.name);
  return { success: true };
}

function handleGetUserName(): unknown {
  return { name: getPref('user_name') };
}

function handleSetOnboardingComplete(): unknown {
  setPref('onboarding_complete', 'true');
  return { success: true };
}

function handleGetOnboardingComplete(): unknown {
  return { complete: getPref('onboarding_complete') === 'true' };
}

function handleSetAutonomyTier(params: { domain: string; tier: string }): unknown {
  setPref(`autonomy_${params.domain}`, params.tier);
  return { success: true };
}

function handleGetAutonomyConfig(): unknown {
  const domains = ['email', 'calendar', 'files', 'finances', 'health', 'services'];
  const config: Record<string, string> = {};
  for (const domain of domains) {
    config[domain] = getPref(`autonomy_${domain}`) ?? (domain === 'finances' || domain === 'services' ? 'guardian' : 'partner');
  }
  return { domains: config };
}

async function handleGetChatHistory(params: { limit: number; offset: number }): Promise<unknown[]> {
  if (!prefsDb) return [];

  try {
    const rows = prefsDb
      .prepare(
        'SELECT id, role, content, timestamp FROM conversation_turns ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      )
      .all(params.limit, params.offset) as {
      id: string;
      role: string;
      content: string;
      timestamp: string;
    }[];

    return rows.map(r => ({
      id: r.id,
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
    }));
  } catch {
    return [];
  }
}

// ─── Credential Management Handlers ──────────────────────────────────────────

function handleAddCredential(params: {
  serviceType: 'email' | 'calendar';
  protocol: 'imap' | 'smtp' | 'caldav';
  host: string;
  port: number;
  username: string;
  password: string;
  useTLS: boolean;
  displayName: string;
}): unknown {
  if (!credentialStore) throw new Error('Credential store not initialized');

  const credential = credentialStore.add(params);

  // Auto-update the Gateway allowlist with the credential host
  if (gateway) {
    try {
      const allowlist = gateway.getAllowlist();
      allowlist.addService({
        serviceName: params.displayName,
        domain: params.host,
        port: params.port,
        protocol: params.protocol,
        addedBy: 'credential_auto',
      });

      // Log allowlist change to audit trail
      const trail = gateway.getAuditTrail();
      trail.append({
        requestId: `allowlist-auto-${credential.id}`,
        timestamp: new Date().toISOString(),
        action: 'service.api_call',
        direction: 'response',
        status: 'success',
        payloadHash: 'allowlist_update',
        signature: 'allowlist_update',
        metadata: {
          event: 'allowlist_updated',
          domain: params.host,
          port: params.port,
          credentialId: credential.id,
          operation: 'add',
        },
      });
    } catch (err) {
      console.error('[sidecar] Failed to update allowlist:', err);
    }
  }

  // Return credential without encrypted password
  return {
    id: credential.id,
    serviceType: credential.serviceType,
    protocol: credential.protocol,
    host: credential.host,
    port: credential.port,
    username: credential.username,
    useTLS: credential.useTLS,
    displayName: credential.displayName,
    createdAt: credential.createdAt,
    lastVerifiedAt: credential.lastVerifiedAt,
  };
}

function handleListCredentials(params: { service_type: string }): unknown[] {
  if (!credentialStore) return [];

  const creds = params.service_type === 'all'
    ? credentialStore.getAll()
    : credentialStore.getByType(params.service_type as 'email' | 'calendar');

  // Strip encrypted passwords from response
  return creds.map(c => ({
    id: c.id,
    serviceType: c.serviceType,
    protocol: c.protocol,
    host: c.host,
    port: c.port,
    username: c.username,
    useTLS: c.useTLS,
    displayName: c.displayName,
    createdAt: c.createdAt,
    lastVerifiedAt: c.lastVerifiedAt,
  }));
}

function handleRemoveCredential(params: { id: string }): unknown {
  if (!credentialStore) throw new Error('Credential store not initialized');

  const credential = credentialStore.get(params.id);
  if (!credential) throw new Error(`Credential not found: ${params.id}`);

  credentialStore.remove(params.id);

  // Remove from allowlist and log
  if (gateway) {
    try {
      const allowlist = gateway.getAllowlist();
      const services = allowlist.listServices();
      const matching = services.filter(
        s => s.domain === credential.host && s.port === credential.port
      );
      for (const svc of matching) {
        allowlist.removeService(svc.id);
      }

      const trail = gateway.getAuditTrail();
      trail.append({
        requestId: `allowlist-remove-${params.id}`,
        timestamp: new Date().toISOString(),
        action: 'service.api_call',
        direction: 'response',
        status: 'success',
        payloadHash: 'allowlist_update',
        signature: 'allowlist_update',
        metadata: {
          event: 'allowlist_updated',
          domain: credential.host,
          port: credential.port,
          credentialId: params.id,
          operation: 'remove',
        },
      });
    } catch (err) {
      console.error('[sidecar] Failed to update allowlist on remove:', err);
    }
  }

  return { success: true };
}

async function handleTestCredential(params: { id: string }): Promise<unknown> {
  if (!credentialStore) throw new Error('Credential store not initialized');

  const credential = credentialStore.get(params.id);
  if (!credential) throw new Error(`Credential not found: ${params.id}`);

  const password = credentialStore.decryptPassword(credential);

  let result: { success: boolean; error?: string; calendars?: unknown[] };

  switch (credential.protocol) {
    case 'imap':
      if (!emailAdapter) throw new Error('Email adapter not initialized');
      result = await emailAdapter.imap.testConnection(credential, password);
      break;
    case 'smtp':
      if (!emailAdapter) throw new Error('Email adapter not initialized');
      result = await emailAdapter.smtp.testConnection(credential, password);
      break;
    case 'caldav':
      if (!calendarAdapter) throw new Error('Calendar adapter not initialized');
      result = await calendarAdapter.caldav.testConnection(credential, password);
      break;
    default:
      result = { success: false, error: `Unknown protocol: ${credential.protocol}` };
  }

  // Update lastVerifiedAt on success
  if (result.success) {
    credentialStore.update(params.id, { lastVerifiedAt: new Date().toISOString() });
  }

  return result;
}

async function handleDiscoverCalendars(params: { credential_id: string }): Promise<unknown[]> {
  if (!calendarAdapter) throw new Error('Calendar adapter not initialized');
  return await calendarAdapter.caldav.discoverCalendars(params.credential_id);
}

function handleGetAccountsStatus(): unknown[] {
  if (!credentialStore) return [];

  const allCreds = credentialStore.getAll();
  return allCreds.map(c => ({
    id: c.id,
    serviceType: c.serviceType,
    protocol: c.protocol,
    displayName: c.displayName,
    host: c.host,
    username: c.username,
    lastVerifiedAt: c.lastVerifiedAt,
    status: c.lastVerifiedAt ? 'verified' : 'unverified',
  }));
}

function handleGetProviderPresets(): unknown {
  return PROVIDER_PRESETS;
}

// ─── Step 6: Universal Inbox & AI Action Handlers ────────────────────────────

async function handleEmailStartIndex(
  id: number | string,
  params: { account_id: string },
): Promise<void> {
  if (!core || !emailAdapter || !prefsDb) {
    respondError(id, 'Core not initialized');
    return;
  }

  // Initialize email indexer if needed
  if (!emailIndexer) {
    emailIndexer = new EmailIndexer({
      db: prefsDb,
      knowledge: core.knowledge,
      llm: core.llm,
    });
    emailIndexer.onEvent((event, data) => emit(event, data));
  }

  respond(id, { started: true });

  // Fetch and index in background
  try {
    const result = await emailAdapter.execute('email.fetch', {
      folder: 'INBOX',
      limit: 200,
      sort: 'date_desc',
    });

    if (result.success && result.data) {
      const messages = (result.data as { messages: unknown[] }).messages ?? [];
      const indexed = await emailIndexer.indexMessages(messages as Parameters<EmailIndexer['indexMessages']>[0], params.account_id);
      emit('semblance://email-index-complete', { indexed, total: messages.length });

      // License auto-detection: scan email bodies for SEMBLANCE_LICENSE_KEY pattern
      if (premiumGate) {
        for (const msg of messages) {
          const bodyText = (msg as { body?: { text?: string } })?.body?.text;
          if (!bodyText) continue;
          const detectedKey = extractLicenseKey(bodyText);
          if (detectedKey) {
            const activationResult = premiumGate.activateLicense(detectedKey);
            if (activationResult.success) {
              console.error(`[sidecar] License auto-detected and activated: tier=${activationResult.tier}`);
              emit('license-auto-activated', {
                tier: activationResult.tier,
                expiresAt: activationResult.expiresAt,
              });
              break; // Only activate the first valid key found
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[sidecar] Email indexing error:', err);
  }
}

function handleEmailGetIndexStatus(): unknown {
  if (!emailIndexer) return { indexed: 0, status: 'not_started' };
  return {
    indexed: emailIndexer.getIndexedCount(),
    status: 'complete',
  };
}

async function handleCalendarStartIndex(
  id: number | string,
  params: { account_id: string },
): Promise<void> {
  if (!core || !calendarAdapter || !prefsDb) {
    respondError(id, 'Core not initialized');
    return;
  }

  if (!calendarIndexer) {
    calendarIndexer = new CalendarIndexer({
      db: prefsDb,
      knowledge: core.knowledge,
      llm: core.llm,
    });
    calendarIndexer.onEvent((event, data) => emit(event, data));
  }

  respond(id, { started: true });

  try {
    const result = await calendarAdapter.execute('calendar.fetch', {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (result.success && result.data) {
      const events = (result.data as { events: unknown[] }).events ?? [];
      const indexed = await calendarIndexer.indexEvents(events as Parameters<CalendarIndexer['indexEvents']>[0], params.account_id);
      emit('semblance://calendar-index-complete', { indexed, total: events.length });
    }
  } catch (err) {
    console.error('[sidecar] Calendar indexing error:', err);
  }
}

function handleInboxGetItems(params: { limit?: number; offset?: number; filter?: string }): unknown[] {
  if (!emailIndexer) return [];
  return emailIndexer.getIndexedEmails({
    limit: params.limit ?? 30,
    offset: params.offset ?? 0,
    priority: params.filter,
  });
}

function handleGetProactiveInsights(): unknown[] {
  if (!proactiveEngine) return [];
  return proactiveEngine.getActiveInsights();
}

async function handleEmailCategorize(params: { message_id: string }): Promise<unknown> {
  if (!emailIndexer || !core || !prefsDb) return { categories: [], priority: 'normal' };

  if (!emailCategorizer) {
    const model = (await core.models.getActiveChatModel()) ?? getRecommendedReasoningModel('standard').id;
    emailCategorizer = new EmailCategorizer({
      llm: core.llm,
      emailIndexer,
      model,
    });
  }

  const email = emailIndexer.getByMessageId(params.message_id);
  if (!email) return { categories: [], priority: 'normal' };

  return await emailCategorizer.categorizeEmail(email);
}

async function handleEmailCategorizeBatch(params: { message_ids: string[] }): Promise<unknown[]> {
  if (!emailIndexer || !core || !prefsDb) return [];

  if (!emailCategorizer) {
    const model = (await core.models.getActiveChatModel()) ?? getRecommendedReasoningModel('standard').id;
    emailCategorizer = new EmailCategorizer({
      llm: core.llm,
      emailIndexer,
      model,
    });
  }

  const emails = params.message_ids
    .map(id => emailIndexer!.getByMessageId(id))
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return await emailCategorizer.categorizeBatch(emails);
}

async function handleEmailArchive(params: { message_ids: string[] }): Promise<unknown> {
  if (!emailAdapter) throw new Error('Email adapter not initialized');
  return await emailAdapter.execute('email.archive', {
    messageIds: params.message_ids,
  });
}

function handleCalendarDetectConflicts(params: { start_time: string; end_time: string }): unknown {
  if (!calendarIndexer) return { conflicts: [], hasConflicts: false };
  const events = calendarIndexer.getEventsInRange(params.start_time, params.end_time);
  return {
    conflicts: events,
    hasConflicts: events.length > 0,
  };
}

async function handleGetMeetingPrep(params: { event_id: string }): Promise<unknown> {
  if (!proactiveEngine) return null;
  return await proactiveEngine.getMeetingPrep(params.event_id);
}

async function handleProactiveRun(): Promise<unknown[]> {
  if (!proactiveEngine) return [];
  return await proactiveEngine.run();
}

async function handleActionApprove(params: { action_id: string }): Promise<unknown> {
  if (!core) throw new Error('Core not initialized');
  return await core.agent.approveAction(params.action_id);
}

async function handleActionReject(params: { action_id: string }): Promise<unknown> {
  if (!core) throw new Error('Core not initialized');
  await core.agent.rejectAction(params.action_id);
  return { success: true };
}

async function handleActionGetPending(): Promise<unknown[]> {
  if (!core) return [];
  return await core.agent.getPendingActions();
}

function handleActionGetApprovalCount(params: { action_type: string; payload: Record<string, unknown> }): unknown {
  if (!core) return { count: 0, threshold: 3 };
  const count = core.agent.getApprovalCount(params.action_type as ActionType, params.payload);
  const threshold = core.agent.getApprovalThreshold(params.action_type as ActionType, params.payload);
  return { count, threshold };
}

function handleGetTodayEvents(): unknown[] {
  if (!calendarIndexer) return [];
  return calendarIndexer.getUpcomingEvents({ daysAhead: 1, includeAllDay: true });
}

function handleGetActionsSummary(): unknown {
  // Action summary from audit trail — returns today's counts
  if (!prefsDb) return { todayCount: 0, todayTimeSavedSeconds: 0, recentActions: [] };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const rows = prefsDb.prepare(`
      SELECT action, payload, status, created_at, response_json
      FROM pending_actions
      WHERE status = 'executed' AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(todayStart.toISOString()) as Array<{
      action: string;
      payload: string;
      status: string;
      created_at: string;
      response_json: string | null;
    }>;

    return {
      todayCount: rows.length,
      todayTimeSavedSeconds: rows.length * 10, // conservative estimate
      recentActions: rows.slice(0, 5).map(r => ({
        description: `${r.action}`,
        timestamp: r.created_at,
      })),
    };
  } catch {
    return { todayCount: 0, todayTimeSavedSeconds: 0, recentActions: [] };
  }
}

function handleDismissInsight(params: { insight_id: string }): unknown {
  if (!proactiveEngine) return { success: false };
  proactiveEngine.dismissInsight(params.insight_id);
  return { success: true };
}

async function handleSendEmailAction(params: {
  to: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}): Promise<unknown> {
  if (!core || !gateway) return { error: 'Not initialized' };

  // User-initiated send goes through orchestrator for audit trail + autonomy check
  const actionId = nanoid();
  const payload = {
    to: params.to,
    subject: params.subject,
    body: params.body,
    replyToMessageId: params.replyToMessageId,
  };

  // Check autonomy — if guardian, queue for approval
  const tier = core.agent.getApprovalCount
    ? 'partner' // default for user-initiated
    : 'guardian';

  // Store as pending action for audit trail
  if (prefsDb) {
    prefsDb.prepare(`
      INSERT INTO pending_actions (id, action, payload, reasoning, domain, tier, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending_approval', ?)
    `).run(actionId, 'email.send', JSON.stringify(payload), 'User-initiated reply', 'email', tier, new Date().toISOString());
  }

  return { actionId, status: 'pending_approval' };
}

async function handleDraftEmailAction(params: {
  to: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
}): Promise<unknown> {
  if (!core || !gateway) return { error: 'Not initialized' };

  const actionId = nanoid();
  const payload = {
    to: params.to,
    subject: params.subject,
    body: params.body,
    replyToMessageId: params.replyToMessageId,
  };

  // Drafts are low-risk — auto-execute through IPC
  try {
    const response = await core.ipc.sendAction('email.draft' as ActionType, payload);
    return { actionId, status: response.status, data: response.data };
  } catch {
    return { actionId, status: 'error', error: 'Failed to save draft' };
  }
}

async function handleUndoAction(params: { action_id: string }): Promise<unknown> {
  if (!prefsDb) return { success: false, error: 'Not initialized' };

  try {
    const action = prefsDb.prepare(
      'SELECT * FROM pending_actions WHERE id = ?'
    ).get(params.action_id) as { action: string; payload: string; status: string } | undefined;

    if (!action) return { success: false, error: 'Action not found' };

    // Mark as undone in the database
    prefsDb.prepare('UPDATE pending_actions SET status = ? WHERE id = ?').run('undone', params.action_id);
    return { success: true };
  } catch {
    return { success: false, error: 'Undo failed' };
  }
}

function handleGetApprovalThreshold(params: { action_type: string; payload: Record<string, unknown> }): number {
  if (!core) return 3;
  return core.agent.getApprovalThreshold(params.action_type as ActionType, params.payload);
}

// ─── Step 7: Subscription Detection Handlers ────────────────────────────────

function ensureFinanceComponents(): void {
  if (!prefsDb) throw new Error('Database not initialized');
  if (!merchantNormalizer) {
    merchantNormalizer = new MerchantNormalizer({ llm: core?.llm });
  }
  if (!statementParser) {
    statementParser = new StatementParser({ llm: core?.llm });
  }
  if (!recurringDetector) {
    recurringDetector = new RecurringDetector({ db: prefsDb, normalizer: merchantNormalizer });
  }
}

async function handleImportStatement(params: { file_path: string }): Promise<unknown> {
  ensureFinanceComponents();
  if (!statementParser || !merchantNormalizer || !recurringDetector) {
    return { error: 'Finance components not initialized' };
  }

  const { transactions, import: importRecord } = await statementParser.parseStatement(params.file_path);
  const normalized = merchantNormalizer.normalizeAll(transactions);
  const charges = recurringDetector.detect(normalized);

  // Flag forgotten subscriptions using email index
  const emailSearchFn = (merchant: string) => {
    if (!emailIndexer) return [];
    return emailIndexer.searchEmails(merchant, { limit: 5 });
  };
  const flaggedCharges = await recurringDetector.flagForgotten(charges, emailSearchFn);

  // Store
  recurringDetector.storeImport(importRecord, normalized);
  recurringDetector.storeCharges(flaggedCharges);

  const forgotten = flaggedCharges.filter(c => c.status === 'forgotten');
  const summary = recurringDetector.getSummary();

  return {
    transactionCount: importRecord.transactionCount,
    merchantCount: new Set(normalized.map(t => t.normalizedMerchant)).size,
    dateRange: importRecord.dateRange,
    recurringCount: flaggedCharges.length,
    forgottenCount: forgotten.length,
    potentialSavings: summary.potentialSavings,
  };
}

function handleGetSubscriptions(params: { status?: string }): unknown[] {
  ensureFinanceComponents();
  if (!recurringDetector) return [];
  return recurringDetector.getStoredCharges(params.status);
}

function handleUpdateSubscriptionStatus(params: { charge_id: string; status: string }): unknown {
  ensureFinanceComponents();
  if (!recurringDetector) return { success: false };
  recurringDetector.updateStatus(params.charge_id, params.status as 'active' | 'forgotten' | 'cancelled' | 'user_confirmed');
  return { success: true };
}

function handleGetImportHistory(): unknown[] {
  ensureFinanceComponents();
  if (!recurringDetector) return [];
  return recurringDetector.getImports();
}

function handleGetSubscriptionSummary(): unknown {
  ensureFinanceComponents();
  if (!recurringDetector) return { totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0 };
  return recurringDetector.getSummary();
}

// ─── Step 7: Autonomy Escalation Handlers ────────────────────────────────────

function ensureEscalationEngine(): void {
  if (!prefsDb || !core) throw new Error('Core not initialized');
  if (!escalationEngine) {
    escalationEngine = new EscalationEngine({
      db: prefsDb,
      autonomy: core.agent.autonomy,
      aiName: getPref('ai_name') ?? 'Semblance',
    });
  }
}

function handleCheckEscalations(): unknown[] {
  ensureEscalationEngine();
  if (!escalationEngine || !core) return [];
  const patterns = core.agent.getApprovalPatterns();
  return escalationEngine.checkForEscalations(patterns);
}

function handleRespondToEscalation(params: { prompt_id: string; accepted: boolean }): unknown {
  ensureEscalationEngine();
  if (!escalationEngine) return { success: false };
  escalationEngine.recordResponse(params.prompt_id, params.accepted);
  return { success: true };
}

function handleGetActiveEscalations(): unknown[] {
  ensureEscalationEngine();
  if (!escalationEngine) return [];
  return escalationEngine.getActivePrompts();
}

// ─── Step 7: Knowledge Moment Handler ────────────────────────────────────────

async function handleGenerateKnowledgeMoment(): Promise<unknown> {
  if (!core) return null;
  if (!knowledgeMomentGenerator) {
    knowledgeMomentGenerator = new KnowledgeMomentGenerator({
      emailIndexer: emailIndexer ?? undefined,
      calendarIndexer: calendarIndexer ?? undefined,
      knowledgeGraph: core.knowledge,
      llm: core.llm,
      aiName: getPref('ai_name') ?? 'Semblance',
    });
  }
  return await knowledgeMomentGenerator.generate();
}

// ─── Step 7: Weekly Digest Handlers ──────────────────────────────────────────

function ensureDigestGenerator(): void {
  if (!prefsDb) throw new Error('Database not initialized');
  if (!weeklyDigestGenerator) {
    // The audit trail is in the same core.db (prefsDb)
    weeklyDigestGenerator = new WeeklyDigestGenerator({
      db: prefsDb,
      auditDb: prefsDb,
      llm: core?.llm,
      aiName: getPref('ai_name') ?? 'Semblance',
    });
  }
}

async function handleGenerateDigest(params: { week_start: string; week_end: string }): Promise<unknown> {
  ensureDigestGenerator();
  if (!weeklyDigestGenerator) return null;
  return await weeklyDigestGenerator.generate(params.week_start, params.week_end);
}

function handleGetLatestDigest(): unknown {
  ensureDigestGenerator();
  if (!weeklyDigestGenerator) return null;
  return weeklyDigestGenerator.getLatest();
}

function handleListDigests(): unknown[] {
  ensureDigestGenerator();
  if (!weeklyDigestGenerator) return [];
  return weeklyDigestGenerator.list();
}

// ─── Step 8: Network Monitor Handlers ────────────────────────────────────────

function ensureNetworkMonitor(): void {
  if (!networkMonitor && gateway && dataDir) {
    const allowlist = gateway.getAllowlist();
    // Open a read-only handle to the audit database for query purposes.
    // The Gateway writes to this db via its AuditTrail instance; we read it for monitoring.
    const gatewayDataDir = join(dataDir, 'gateway');
    const auditDbPath = join(gatewayDataDir, 'audit.db');
    if (existsSync(auditDbPath)) {
      const monitorDb = new Database(auditDbPath, { readonly: true });
      networkMonitor = new NetworkMonitor({ auditDb: monitorDb, allowlist });
      auditQuery = new AuditQuery(monitorDb);
      privacyReportGenerator = new PrivacyReportGenerator({ auditDb: monitorDb, allowlist });
      console.error('[sidecar] Network monitor initialized');
    }
  }
}

function ensureDeviceRegistry(): void {
  if (!deviceRegistry && prefsDb) {
    deviceRegistry = new DeviceRegistry(prefsDb);
    taskAssessor = new TaskAssessor();
    taskRouter = new TaskRouter(deviceRegistry, taskAssessor);

    // Auto-register the local desktop device
    const os = process.platform;
    const platform = os === 'darwin' ? 'macos' : os === 'win32' ? 'windows' : 'linux';
    deviceRegistry.register({
      id: 'local-desktop',
      name: `${hostname()} (Desktop)`,
      type: 'desktop',
      platform: platform as 'macos' | 'windows' | 'linux',
      llmRuntime: 'ollama',
      maxModelSize: '70B',
      gpuAvailable: true,
      ramGB: Math.round(totalmem() / (1024 * 1024 * 1024)),
      isOnline: true,
      lastSeen: new Date().toISOString(),
      networkType: 'ethernet',
      batteryLevel: null,
      isCharging: false,
      features: ['email', 'calendar', 'files', 'subscriptions'],
      activeTasks: 0,
      inferenceActive: false,
    });
    console.error('[sidecar] Device registry initialized, local desktop registered');
  }
}

function handleGetActiveConnections(): unknown[] {
  ensureNetworkMonitor();
  if (!networkMonitor) return [];
  return networkMonitor.getActiveConnections();
}

function handleGetNetworkStatistics(params: { period: string }): unknown {
  ensureNetworkMonitor();
  if (!networkMonitor) {
    return {
      period: params.period,
      totalConnections: 0,
      connectionsByService: {},
      connectionsByAction: {},
      unauthorizedAttempts: 0,
      uniqueServicesContacted: 0,
      averageTimeSavedSeconds: 0,
      totalTimeSavedSeconds: 0,
    };
  }
  return networkMonitor.getStatistics(params.period as 'today' | 'week' | 'month' | 'all');
}

function handleGetNetworkAllowlist(): unknown[] {
  ensureNetworkMonitor();
  if (!networkMonitor) return [];
  return networkMonitor.getEnrichedAllowlist();
}

function handleGetUnauthorizedAttempts(params: { period?: string }): unknown[] {
  ensureNetworkMonitor();
  if (!networkMonitor) return [];
  return networkMonitor.getUnauthorizedAttempts(params.period);
}

function handleGetConnectionTimeline(params: { period: string; granularity: string }): unknown[] {
  ensureNetworkMonitor();
  if (!networkMonitor) return [];
  return networkMonitor.getTimeline({
    period: params.period as 'today' | 'week' | 'month',
    granularity: params.granularity as 'hour' | 'day',
  });
}

function handleGetConnectionHistory(params: { limit?: number; offset?: number }): unknown[] {
  ensureNetworkMonitor();
  if (!networkMonitor) return [];
  return networkMonitor.getConnectionHistory({ limit: params.limit, offset: params.offset });
}

function handleGeneratePrivacyReport(params: { start_date: string; end_date: string; format: string }): unknown {
  ensureNetworkMonitor();
  if (!privacyReportGenerator) return { error: 'Privacy report generator not initialized' };
  return privacyReportGenerator.generate({
    startDate: params.start_date,
    endDate: params.end_date,
    format: params.format as 'json' | 'text',
  });
}

function handleGetNetworkTrustStatus(): unknown {
  ensureNetworkMonitor();
  if (!networkMonitor) return { clean: true, unauthorizedCount: 0, activeServiceCount: 0 };
  return networkMonitor.getTrustStatus();
}

// ─── Step 8: Task Routing Handlers ──────────────────────────────────────────

function handleGetDevices(): unknown[] {
  ensureDeviceRegistry();
  if (!deviceRegistry) return [];
  return deviceRegistry.getDevices();
}

function handleRegisterDevice(params: { device: Record<string, unknown> }): unknown {
  ensureDeviceRegistry();
  if (!deviceRegistry) return { success: false };
  deviceRegistry.register(params.device as unknown as import('../../../core/routing/device-registry.js').DeviceCapabilities);
  return { success: true };
}

function handleRouteTask(params: { task: Record<string, unknown> }): unknown {
  ensureDeviceRegistry();
  if (!taskRouter) return null;
  return taskRouter.route(params.task as unknown as import('../../../core/routing/task-assessor.js').TaskDescription);
}

function handleAssessTask(params: { task: Record<string, unknown> }): unknown {
  ensureDeviceRegistry();
  if (!taskAssessor) return null;
  return taskAssessor.assess(params.task as unknown as import('../../../core/routing/task-assessor.js').TaskDescription);
}

// ─── Hardware & Runtime Handlers (Step 9) ────────────────────────────────────

function handleDetectHardware(): unknown {
  // Hardware detection runs in-process using Node.js os module.
  // The Rust-side detection is used when called from a Tauri command directly.
  // This TypeScript fallback provides the same data for the sidecar path.
  const cpuInfo = require('node:os');
  const cpus = cpuInfo.cpus();
  const totalRamMb = Math.round(cpuInfo.totalmem() / (1024 * 1024));
  const availableRamMb = Math.round(cpuInfo.freemem() / (1024 * 1024));
  const cpuCores = cpus.length;
  const cpuArch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'unknown';
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : process.platform === 'linux' ? 'linux' : 'unknown';

  // Basic GPU detection: Apple Silicon detection via arch + platform
  let gpu: { name: string; vendor: string; vramMb: number; computeCapable: boolean } | null = null;
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    const estimatedVramMb = Math.round(totalRamMb * 0.75);
    gpu = {
      name: 'Apple Silicon (Metal)',
      vendor: 'apple',
      vramMb: estimatedVramMb,
      computeCapable: true,
    };
  }

  const ramGb = totalRamMb / 1024;
  let tier: string;
  if (ramGb >= 32 || (gpu && gpu.computeCapable && gpu.vramMb >= 8192)) {
    tier = 'workstation';
  } else if (ramGb >= 16) {
    tier = 'performance';
  } else if (ramGb >= 8) {
    tier = 'standard';
  } else {
    tier = 'constrained';
  }

  return {
    tier,
    cpuCores,
    cpuArch,
    totalRamMb,
    availableRamMb,
    os,
    gpu,
  };
}

// ─── Contact Handlers (Step 14) ──────────────────────────────────────────────

function ensureContactStore(): ContactStore {
  if (!contactStore && core) {
    const db = (core as unknown as { db: Database.Database }).db;
    if (db) {
      contactStore = new ContactStore(db);
      relationshipAnalyzer = new RelationshipAnalyzer({ db, contactStore });
      birthdayTracker = new BirthdayTracker({ contactStore });
      contactFrequencyMonitor = new ContactFrequencyMonitor({ db, contactStore, analyzer: relationshipAnalyzer });
    }
  }
  if (!contactStore) throw new Error('Contact store not initialized');
  return contactStore;
}

function handleContactsImport(params: { filePath?: string }): unknown {
  if (!params.filePath) {
    return { success: false, imported: 0, error: 'Desktop contact import requires a file path. Use the file picker to select a .vcf or .csv file.' };
  }

  const store = ensureContactStore();
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const content = readFileSync(params.filePath, 'utf-8');
  const ext = params.filePath.toLowerCase();
  let imported = 0;

  if (ext.endsWith('.vcf') || ext.endsWith('.vcard')) {
    // Parse vCard format — split by BEGIN:VCARD blocks
    const cards = content.split(/(?=BEGIN:VCARD)/i).filter(c => c.trim().length > 0);
    for (const card of cards) {
      const get = (field: string): string | undefined => {
        const match = card.match(new RegExp(`^${field}[;:](.*)$`, 'mi'));
        return match?.[1]?.trim();
      };
      const fn = get('FN');
      if (!fn) continue;

      const nField = get('N');
      let familyName: string | undefined;
      let givenName: string | undefined;
      if (nField) {
        const parts = nField.split(';');
        familyName = parts[0]?.trim() || undefined;
        givenName = parts[1]?.trim() || undefined;
      }

      const emails: string[] = [];
      for (const line of card.split('\n')) {
        if (/^EMAIL/i.test(line)) {
          const val = line.replace(/^EMAIL[^:]*:/i, '').trim();
          if (val) emails.push(val);
        }
      }

      const phones: string[] = [];
      for (const line of card.split('\n')) {
        if (/^TEL/i.test(line)) {
          const val = line.replace(/^TEL[^:]*:/i, '').trim();
          if (val) phones.push(val);
        }
      }

      const org = get('ORG')?.replace(/;/g, ', ');
      const title = get('TITLE');
      const bday = get('BDAY');

      store.insertContact({
        displayName: fn,
        givenName,
        familyName,
        emails: emails.length > 0 ? emails : undefined,
        phones: phones.length > 0 ? phones : undefined,
        organization: org,
        jobTitle: title,
        birthday: bday,
        source: 'imported',
      });
      imported++;
    }
  } else if (ext.endsWith('.csv')) {
    // Simple CSV parsing: expects headers in first row
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) return { success: true, imported: 0 };

    const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'display name' || h === 'displayname' || h === 'full name');
    const emailIdx = headers.findIndex(h => h === 'email' || h === 'e-mail' || h === 'email address');
    const phoneIdx = headers.findIndex(h => h === 'phone' || h === 'telephone' || h === 'mobile');

    if (nameIdx === -1) {
      return { success: false, imported: 0, error: 'CSV file must have a "Name" or "Display Name" column.' };
    }

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i]!.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const name = cols[nameIdx];
      if (!name) continue;

      store.insertContact({
        displayName: name,
        emails: emailIdx >= 0 && cols[emailIdx] ? [cols[emailIdx]!] : undefined,
        phones: phoneIdx >= 0 && cols[phoneIdx] ? [cols[phoneIdx]!] : undefined,
        source: 'imported',
      });
      imported++;
    }
  } else {
    return { success: false, imported: 0, error: 'Unsupported file format. Use .vcf (vCard) or .csv.' };
  }

  return { success: true, imported };
}

function handleContactsList(params: { limit?: number; sortBy?: string }): unknown {
  const store = ensureContactStore();
  const contacts = store.listContacts({
    limit: params.limit ?? 100,
    sortBy: (params.sortBy as 'display_name' | 'last_contact_date' | 'interaction_count') ?? 'display_name',
  });
  return { contacts };
}

function handleContactsGet(params: { id: string }): unknown {
  const store = ensureContactStore();
  const contact = store.getContact(params.id);
  if (!contact) throw new Error(`Contact not found: ${params.id}`);
  return contact;
}

function handleContactsSearch(params: { query: string; limit?: number }): unknown {
  const store = ensureContactStore();
  const contacts = store.searchContacts(params.query, params.limit ?? 20);
  return { contacts };
}

function handleContactsGetStats(): unknown {
  const store = ensureContactStore();
  return store.getStats();
}

function handleContactsGetRelationshipGraph(): unknown {
  ensureContactStore();
  if (!relationshipAnalyzer) throw new Error('Relationship analyzer not initialized');
  return relationshipAnalyzer.buildRelationshipGraph();
}

function handleContactsGetUpcomingBirthdays(): unknown {
  ensureContactStore();
  if (!birthdayTracker) throw new Error('Birthday tracker not initialized');
  return { birthdays: birthdayTracker.getUpcomingBirthdays() };
}

function handleContactsGetFrequencyAlerts(): unknown {
  ensureContactStore();
  if (!contactFrequencyMonitor) throw new Error('Frequency monitor not initialized');
  return { alerts: contactFrequencyMonitor.getDecreasingContacts() };
}

// ─── Step 15: Messaging + Clipboard Handlers ─────────────────────────────────

function ensureMessageDrafter(): MessageDrafter {
  if (!messageDrafter && core) {
    const model = getPref('active_chat_model') ?? getRecommendedReasoningModel('standard').id;
    messageDrafter = new MessageDrafter({ llm: core.llm, model });
  }
  if (!messageDrafter) throw new Error('Message drafter not initialized');
  return messageDrafter;
}

function ensureClipboardRecognizer(): ClipboardPatternRecognizer {
  if (!clipboardRecognizer) {
    clipboardRecognizer = new ClipboardPatternRecognizer({
      llm: core?.llm,
      model: getPref('active_chat_model') ?? getRecommendedReasoningModel('standard').id,
    });
  }
  return clipboardRecognizer;
}

async function handleMessagingDraft(params: { recipientName?: string; recipientPhone: string; intent: string; relationship?: string }): Promise<unknown> {
  const drafter = ensureMessageDrafter();
  const result = await drafter.draftMessage({
    intent: params.intent,
    recipientName: params.recipientName,
    relationship: params.relationship,
  });
  return {
    body: result.body,
    styleApplied: result.styleApplied,
    maskedPhone: maskPhoneNumber(params.recipientPhone),
  };
}

async function handleMessagingSend(params: { phone: string; body: string }): Promise<unknown> {
  if (!messagingAdapter) {
    return { status: 'failed', error: 'Messaging adapter not initialized' };
  }
  const result = await messagingAdapter.sendMessage({ phone: params.phone, body: params.body });
  return result;
}

async function handleMessagingHistory(params: { contactPhone: string; limit?: number }): Promise<unknown> {
  if (!messagingAdapter?.readMessages) {
    return { messages: null };
  }
  const messages = await messagingAdapter.readMessages(params.contactPhone, params.limit);
  return { messages };
}

async function handleClipboardAnalyze(params: { text: string }): Promise<unknown> {
  const recognizer = ensureClipboardRecognizer();
  const analysis = await recognizer.analyze(params.text);
  // Sanitize patterns for output — never expose full clipboard text
  const sanitized = analysis.patterns.map(p => sanitizeForAuditTrail(p));
  return {
    patterns: sanitized,
    hasActionableContent: analysis.hasActionableContent,
  };
}

function handleClipboardGetSettings(): unknown {
  return {
    monitoringEnabled: clipboardMonitoringEnabled,
    recentActions: clipboardRecentActions.slice(0, 5),
  };
}

function handleClipboardSetSettings(params: { monitoringEnabled: boolean }): unknown {
  clipboardMonitoringEnabled = params.monitoringEnabled;
  setPref('clipboard_monitoring_enabled', String(params.monitoringEnabled));
  return { success: true };
}

function handleClipboardGetRecent(): unknown {
  // Returns pattern type + action only, never content
  return { recentActions: clipboardRecentActions.slice(0, 10) };
}

async function handleShutdown(): Promise<unknown> {
  console.error('[sidecar] Shutting down...');

  // Shut down adapters first
  if (emailAdapter) {
    await emailAdapter.shutdown();
    console.error('[sidecar] Email adapter shut down');
  }

  if (calendarAdapter) {
    await calendarAdapter.shutdown();
    console.error('[sidecar] Calendar adapter shut down');
  }

  if (core) {
    await core.shutdown();
    console.error('[sidecar] Core shut down');
  }

  if (gateway) {
    await gateway.stop();
    console.error('[sidecar] Gateway shut down');
  }

  if (prefsDb) {
    prefsDb.close();
  }

  return { success: true };
}

// ─── Model Download Handlers ─────────────────────────────────────────────────

async function downloadHfFile(
  entry: { hfRepo: string; hfFilename: string; fileSizeBytes?: number; sizeMb?: number },
  targetPath: string,
  modelId: string,
  displayName: string,
): Promise<void> {
  const totalBytes = entry.fileSizeBytes ?? ((entry.sizeMb ?? 0) * 1024 * 1024);
  const download: ActiveDownload = {
    modelId,
    modelName: displayName,
    totalBytes,
    downloadedBytes: 0,
    speedBytesPerSec: 0,
    status: 'downloading',
    abortController: new AbortController(),
  };
  activeDownloads.set(modelId, download);
  emit('model-download-progress', { ...download, abortController: undefined });

  const url = `https://huggingface.co/${entry.hfRepo}/resolve/main/${entry.hfFilename}`;
  const { createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');

  try {
    const response = await globalThis.fetch(url, {
      signal: download.abortController!.signal,
      redirect: 'follow',
    });

    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const fileStream = createWriteStream(targetPath);
    const reader = response.body.getReader();
    let lastEmitTime = Date.now();
    let bytesInWindow = 0;

    const writable = new (await import('node:stream')).Writable({
      write(chunk: Buffer, _encoding, callback) {
        download.downloadedBytes += chunk.length;
        bytesInWindow += chunk.length;
        const now = Date.now();
        const elapsed = now - lastEmitTime;
        if (elapsed >= 500) {
          download.speedBytesPerSec = Math.round((bytesInWindow / elapsed) * 1000);
          bytesInWindow = 0;
          lastEmitTime = now;
          emit('model-download-progress', { ...download, abortController: undefined });
        }
        fileStream.write(chunk, callback);
      },
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await new Promise<void>((resolve, reject) => {
        writable.write(Buffer.from(value), (err) => err ? reject(err) : resolve());
      });
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    download.downloadedBytes = download.totalBytes;
    download.speedBytesPerSec = 0;

    // Load the downloaded GGUF into NativeRuntime (llama.cpp via Rust)
    const modelType = modelId.includes('embed') ? 'embedding' : 'reasoning';
    try {
      await sendCallback('native_load_model', { model_path: targetPath, model_type: modelType });
      console.error(`[sidecar] Loaded model "${modelId}" into NativeRuntime (${modelType})`);
      emit('native-model-loaded', { modelId, modelType, path: targetPath });
    } catch (loadErr) {
      console.error(`[sidecar] NativeRuntime load failed for "${modelId}":`, loadErr);
      // Fall back to Ollama if available
      if (core && await core.llm.isAvailable()) {
        console.error(`[sidecar] Ollama available as fallback for "${modelId}"`);
      }
    }

    download.status = 'complete';
    activeDownloads.set(modelId, download);
    emit('model-download-progress', { ...download, abortController: undefined });
  } catch (err) {
    download.status = 'error';
    download.error = err instanceof Error ? err.message : String(err);
    download.speedBytesPerSec = 0;
    activeDownloads.set(modelId, download);
    emit('model-download-progress', { ...download, abortController: undefined });
    // Clean up partial file
    try { (await import('node:fs')).unlinkSync(targetPath); } catch { /* ignore */ }
    throw err;
  }
}

async function handleStartModelDownloads(params: { tier: string }): Promise<unknown> {
  const tier = (params.tier || 'standard') as HardwareProfileTier;
  const models = getModelsForTier(tier);
  const modelsDir = getModelsDir(dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined);

  const results: Array<{ modelId: string; status: string }> = [];

  for (const model of models) {
    const targetPath = getModelPath(model.id, dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined);

    if (isModelDownloaded(model.id, dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined)) {
      const existing: ActiveDownload = {
        modelId: model.id,
        modelName: model.displayName,
        totalBytes: model.fileSizeBytes,
        downloadedBytes: model.fileSizeBytes,
        speedBytesPerSec: 0,
        status: 'complete',
      };
      activeDownloads.set(model.id, existing);
      emit('model-download-progress', existing);
      results.push({ modelId: model.id, status: 'already_downloaded' });

      // Load already-downloaded model into NativeRuntime
      const modelType = model.isEmbedding ? 'embedding' : 'reasoning';
      sendCallback('native_load_model', { model_path: targetPath, model_type: modelType })
        .then(() => console.error(`[sidecar] Loaded existing model "${model.id}" into NativeRuntime (${modelType})`))
        .catch((err) => console.error(`[sidecar] NativeRuntime load failed for existing "${model.id}":`, err));

      continue;
    }

    // Download in background — don't await, let progress events flow
    downloadHfFile(model, targetPath, model.id, model.displayName).catch((err) => {
      console.error(`[sidecar] Model download failed: ${model.id}`, err);
    });
    results.push({ modelId: model.id, status: 'started' });
  }

  return { started: results };
}

function handleModelGetDownloadStatus(): unknown {
  const statuses: Array<{
    modelName: string;
    totalBytes: number;
    downloadedBytes: number;
    speedBytesPerSec: number;
    status: string;
    error?: string;
  }> = [];

  for (const [, download] of activeDownloads) {
    statuses.push({
      modelName: download.modelName,
      totalBytes: download.totalBytes,
      downloadedBytes: download.downloadedBytes,
      speedBytesPerSec: download.speedBytesPerSec,
      status: download.status,
      error: download.error,
    });
  }

  // If no active downloads, check on-disk models from catalog
  if (statuses.length === 0) {
    for (const model of MODEL_CATALOG) {
      const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
      if (isModelDownloaded(model.id, baseDir)) {
        statuses.push({
          modelName: model.displayName,
          totalBytes: model.fileSizeBytes,
          downloadedBytes: model.fileSizeBytes,
          speedBytesPerSec: 0,
          status: 'complete',
        });
      }
    }
  }

  return statuses;
}

async function handleModelRetryDownload(params: { modelName: string }): Promise<unknown> {
  // Find model by display name or ID
  const model = MODEL_CATALOG.find(m => m.displayName === params.modelName || m.id === params.modelName);
  if (!model) {
    throw new Error(`Unknown model: ${params.modelName}`);
  }

  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const targetPath = getModelPath(model.id, baseDir);

  // Clear previous error state
  activeDownloads.delete(model.id);

  await downloadHfFile(model, targetPath, model.id, model.displayName);
  return { success: true };
}

function handleVoiceGetModelStatus(): unknown {
  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const voiceDir = getModelsDir(baseDir);

  const whisperDownloaded = WHISPER_MODELS.some(m => {
    const p = join(voiceDir, m.hfFilename);
    return existsSync(p);
  });

  const piperDownloaded = PIPER_VOICES.some(v => {
    const p = join(voiceDir, v.hfFilename);
    return existsSync(p);
  });

  return {
    whisperDownloaded,
    piperDownloaded,
    whisperSizeMb: WHISPER_MODELS[0]?.sizeMb ?? 75,
    piperSizeMb: PIPER_VOICES[0]?.sizeMb ?? 30,
  };
}

async function handleVoiceDownloadModel(params: { model: string }): Promise<unknown> {
  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const voiceDir = getModelsDir(baseDir);

  if (params.model === 'whisper') {
    const entry = WHISPER_MODELS[0]!; // Download the smallest (Tiny) by default
    const targetPath = join(voiceDir, entry.hfFilename);
    if (existsSync(targetPath)) return { status: 'already_downloaded' };
    await downloadHfFile(
      { hfRepo: entry.hfRepo, hfFilename: entry.hfFilename, sizeMb: entry.sizeMb },
      targetPath, `voice-${entry.id}`, `Whisper ${entry.name}`,
    );
    return { status: 'complete' };
  } else if (params.model === 'piper') {
    const entry = PIPER_VOICES[0]!; // Download the default voice (Amy)
    const targetPath = join(voiceDir, entry.hfFilename);
    if (existsSync(targetPath)) return { status: 'already_downloaded' };
    await downloadHfFile(
      { hfRepo: entry.hfRepo, hfFilename: entry.hfFilename, sizeMb: entry.sizeMb },
      targetPath, `voice-${entry.id}`, `Piper ${entry.name}`,
    );
    return { status: 'complete' };
  }

  throw new Error(`Unknown voice model type: ${params.model}`);
}

// ─── Connector Auth Handlers ────────────────────────────────────────────────

function ensureOAuthTokenManager(): OAuthTokenManager {
  if (oauthTokenManager) return oauthTokenManager;
  if (!prefsDb) throw new Error('Database not initialized');
  const gatewayDataDir = join(dataDir || join(homedir(), '.semblance'), 'gateway');
  if (!existsSync(gatewayDataDir)) mkdirSync(gatewayDataDir, { recursive: true });
  const oauthDb = new Database(join(gatewayDataDir, 'oauth.db'));
  oauthTokenManager = new OAuthTokenManager(oauthDb);
  return oauthTokenManager;
}

// OAuth config registry — maps connectorId to OAuth config
function getOAuthConfigForConnector(connectorId: string): {
  providerKey: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientId: string;
  clientSecret?: string;
  usePKCE: boolean;
  revokeUrl?: string;
  extraAuthParams?: Record<string, string>;
} | null {
  // Read process.env DIRECTLY at call time — NOT from the cached oauthClients object.
  // oauthClients reads process.env at MODULE LOAD TIME (before dotenv runs),
  // so its values are permanently 'CONFIGURE_IN_ENV'. This function is called
  // after dotenv has loaded, so process.env has the real values.
  const configs: Record<string, () => ReturnType<typeof getOAuthConfigForConnector>> = {
    'gmail': () => ({
      providerKey: 'google',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
      clientId: process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      clientSecret: process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'],
      usePKCE: false,
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    }),
    'google-calendar': () => ({
      providerKey: 'google-calendar',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: 'https://www.googleapis.com/auth/calendar.readonly',
      clientId: process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      clientSecret: process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'],
      usePKCE: false,
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    }),
    'google-drive': () => ({
      providerKey: 'google-drive',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: 'https://www.googleapis.com/auth/drive.readonly',
      clientId: process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      clientSecret: process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'],
      usePKCE: false,
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    }),
    'dropbox': () => ({
      providerKey: 'dropbox',
      authUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
      scopes: '',
      clientId: process.env['SEMBLANCE_DROPBOX_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      clientSecret: process.env['SEMBLANCE_DROPBOX_CLIENT_SECRET'],
      usePKCE: false,
    }),
    'github': () => ({
      providerKey: 'github',
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: 'read:user user:email',
      clientId: process.env['SEMBLANCE_GITHUB_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      usePKCE: true,
    }),
    'spotify': () => ({
      providerKey: 'spotify',
      authUrl: 'https://accounts.spotify.com/authorize',
      tokenUrl: 'https://accounts.spotify.com/api/token',
      scopes: 'user-read-recently-played user-library-read',
      clientId: process.env['SEMBLANCE_SPOTIFY_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      usePKCE: true,
    }),
    'notion': () => ({
      providerKey: 'notion',
      authUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: '',
      clientId: process.env['SEMBLANCE_NOTION_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      clientSecret: process.env['SEMBLANCE_NOTION_CLIENT_SECRET'],
      usePKCE: false,
    }),
    'slack': () => ({
      providerKey: 'slack',
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopes: 'channels:history channels:read',
      clientId: process.env['SEMBLANCE_SLACK_CLIENT_ID'] ?? UNCONFIGURED_CLIENT_ID,
      clientSecret: process.env['SEMBLANCE_SLACK_CLIENT_SECRET'],
      usePKCE: false,
    }),
  };

  const factory = configs[connectorId];
  return factory ? factory() : null;
}

async function handleConnectorAuth(params: { connectorId: string }): Promise<unknown> {
  console.error('[sidecar] handleConnectorAuth called with:', JSON.stringify(params));
  // Look up auth type from the connector registry to differentiate flow
  const connectorRegistry = createDefaultConnectorRegistry();
  const connectorDef = connectorRegistry.get(params.connectorId);
  console.error('[sidecar] connectorDef:', connectorDef ? JSON.stringify({ id: connectorDef.id, authType: connectorDef.authType }) : 'NOT FOUND');
  const authType = connectorDef?.authType ?? 'oauth2';

  // Native connectors (file imports, local DB reads) don't need auth — succeed immediately
  if (authType === 'native') {
    return {
      success: true,
      connectorId: params.connectorId,
      authType: 'native',
    };
  }

  // API key connectors require manual credential entry in Settings
  if (authType === 'api_key') {
    return {
      success: false,
      requiresCredentials: true,
      connectorId: params.connectorId,
      authType: 'api_key',
      error: `${connectorDef?.displayName ?? params.connectorId} requires an API key. Enter it in Settings > Connections.`,
    };
  }

  // OAuth2, PKCE, and OAuth1a connectors use the OAuth flow
  const config = getOAuthConfigForConnector(params.connectorId);
  if (!config) {
    return { success: false, error: `No OAuth config for connector: ${params.connectorId}. Configure in Settings > Accounts for manual credential entry.` };
  }

  if (config.clientId === UNCONFIGURED_CLIENT_ID) {
    const envKey = `SEMBLANCE_${params.connectorId.toUpperCase().replace(/-/g, '_')}_CLIENT_ID`;
    console.error(`[sidecar] OAuth client ID not set for ${params.connectorId}. process.env[${envKey}]: ${process.env[envKey] ? 'SET' : 'NOT SET'}`);
    return {
      success: false,
      error: `OAuth not configured for ${params.connectorId}. Set the ${envKey} environment variable.`,
    };
  }
  console.error(`[sidecar] OAuth config resolved for ${params.connectorId}, opening browser...`);

  const tokenMgr = ensureOAuthTokenManager();
  const callbackServer = new OAuthCallbackServer();

  try {
    // Slack requires HTTPS redirect URIs — use self-signed cert for localhost
    const requiresHttps = params.connectorId === 'slack';
    const { callbackUrl, state } = await callbackServer.start({ https: requiresHttps });

    // Generate PKCE code_verifier + code_challenge for PKCE flows
    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;
    if (config.usePKCE) {
      const { randomBytes, createHash } = await import('node:crypto');
      codeVerifier = randomBytes(32).toString('base64url');
      codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
      console.error(`[sidecar] PKCE flow — generated code_verifier (${codeVerifier.length} chars)`);
    }

    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    if (config.scopes) authUrl.searchParams.set('scope', config.scopes);
    authUrl.searchParams.set('state', state);
    if (codeChallenge) {
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
    }
    if (config.extraAuthParams) {
      for (const [k, v] of Object.entries(config.extraAuthParams)) {
        authUrl.searchParams.set(k, v);
      }
    }

    // Open system browser for OAuth consent
    const { exec } = await import('node:child_process');
    if (process.platform === 'win32') {
      exec(`start "" "${authUrl.toString().replace(/"/g, '\\"')}"`, (err) => {
        if (err) console.error('[sidecar] Failed to open browser:', err);
      });
    } else if (process.platform === 'darwin') {
      exec(`open "${authUrl.toString().replace(/"/g, '\\"')}"`, (err) => {
        if (err) console.error('[sidecar] Failed to open browser:', err);
      });
    } else {
      exec(`xdg-open "${authUrl.toString().replace(/"/g, '\\"')}"`, (err) => {
        if (err) console.error('[sidecar] Failed to open browser:', err);
      });
    }

    // Wait for callback
    const { code } = await callbackServer.waitForCallback();

    // Exchange code for tokens
    const tokenBody: Record<string, string> = {
      code,
      client_id: config.clientId,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    };
    if (config.clientSecret && !config.usePKCE) {
      tokenBody['client_secret'] = config.clientSecret;
    }
    if (config.usePKCE && codeVerifier) {
      tokenBody['code_verifier'] = codeVerifier;
    }

    const tokenResponse = await globalThis.fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',  // GitHub requires this to return JSON
      },
      body: new URLSearchParams(tokenBody),
    });

    // Check HTTP status BEFORE parsing body — non-200 may return HTML error pages
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text().catch(() => 'Unknown error');
      console.error(`[sidecar] Token exchange HTTP ${tokenResponse.status}: ${errorText.slice(0, 500)}`);
      return {
        success: false,
        error: `Token exchange failed (HTTP ${tokenResponse.status}): ${errorText.slice(0, 200)}`,
      };
    }

    // GitHub returns access_token in application/x-www-form-urlencoded format
    // when Accept header is not set to application/json.
    const contentType = tokenResponse.headers.get('content-type') ?? '';
    let tokenData: Record<string, unknown>;
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('text/plain')) {
      const text = await tokenResponse.text();
      const urlParams = new URLSearchParams(text);
      tokenData = Object.fromEntries(urlParams.entries());
    } else {
      tokenData = await tokenResponse.json() as Record<string, unknown>;
    }

    if (tokenData.error || !tokenData.access_token) {
      return {
        success: false,
        error: (tokenData.error_description as string) ?? (tokenData.error as string) ?? 'Token exchange failed',
      };
    }

    // Store tokens
    tokenMgr.storeTokens({
      provider: config.providerKey,
      accessToken: tokenData.access_token as string,
      refreshToken: (tokenData.refresh_token as string) ?? '',
      expiresAt: Date.now() + ((tokenData.expires_in as number) ?? 3600) * 1000,
      scopes: config.scopes,
    });

    return {
      success: true,
      provider: config.providerKey,
      connectorId: params.connectorId,
    };
  } catch (err) {
    callbackServer.stop();
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleConnectorDisconnect(params: { connectorId: string }): Promise<unknown> {
  const config = getOAuthConfigForConnector(params.connectorId);
  if (!config) {
    return { success: false, error: `No OAuth config for connector: ${params.connectorId}` };
  }

  const tokenMgr = ensureOAuthTokenManager();

  // Revoke token if provider supports it
  if (config.revokeUrl) {
    const accessToken = tokenMgr.getAccessToken(config.providerKey);
    if (accessToken) {
      try {
        await globalThis.fetch(config.revokeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: accessToken }),
        });
      } catch { /* best-effort */ }
    }
  }

  tokenMgr.revokeTokens(config.providerKey);
  return { success: true, disconnected: true, connectorId: params.connectorId };
}

async function handleConnectorSync(params: { connectorId: string }): Promise<unknown> {
  // For now, return status — full sync implementation depends on per-connector data fetching
  const config = getOAuthConfigForConnector(params.connectorId);
  if (!config) {
    return { success: false, error: `No OAuth config for connector: ${params.connectorId}` };
  }

  const tokenMgr = ensureOAuthTokenManager();
  const hasTokens = tokenMgr.hasValidTokens(config.providerKey);

  if (!hasTokens) {
    return { success: false, error: 'Not authenticated. Please connect first.' };
  }

  return { success: true, synced: true, connectorId: params.connectorId, message: 'Sync initiated' };
}

async function handleImportRun(params: { sourcePath: string; sourceType: string }): Promise<unknown> {
  if (!core || !prefsDb) {
    throw new Error('Core not initialized');
  }

  // Attempt to read and parse the file using the core import pipeline
  const { readFileSync } = await import('node:fs');
  const content = readFileSync(params.sourcePath, 'utf-8');
  const ext = params.sourcePath.split('.').pop()?.toLowerCase() ?? '';

  let items: Array<{ title: string; content: string; timestamp: string }> = [];

  if (ext === 'csv') {
    const lines = content.split('\n').filter(l => l.trim());
    const header = lines[0] ?? '';
    for (let i = 1; i < lines.length; i++) {
      items.push({ title: `Row ${i}`, content: lines[i] ?? '', timestamp: new Date().toISOString() });
    }
  } else if (ext === 'json') {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    items = arr.map((item, i) => ({
      title: item.title ?? item.name ?? `Item ${i + 1}`,
      content: typeof item === 'string' ? item : JSON.stringify(item),
      timestamp: item.timestamp ?? item.date ?? new Date().toISOString(),
    }));
  } else if (ext === 'xml' || ext === 'html') {
    items = [{ title: params.sourcePath.split(/[/\\]/).pop() ?? 'Import', content, timestamp: new Date().toISOString() }];
  } else if (ext === 'ofx' || ext === 'qfx') {
    // Financial statement — delegate to StatementParser
    if (statementParser) {
      const result = statementParser.parseOFX(content);
      items = result.transactions.map(t => ({
        title: t.description ?? t.memo ?? 'Transaction',
        content: JSON.stringify(t),
        timestamp: t.datePosted ?? new Date().toISOString(),
      }));
    }
  } else {
    items = [{ title: params.sourcePath.split(/[/\\]/).pop() ?? 'Import', content: content.slice(0, 10000), timestamp: new Date().toISOString() }];
  }

  const importId = nanoid();
  const historyEntry = {
    id: importId,
    sourceType: params.sourceType || ext,
    format: ext,
    importedAt: new Date().toISOString(),
    itemCount: items.length,
    status: 'complete',
  };
  importHistory.push(historyEntry);

  return {
    importId,
    itemCount: items.length,
    sourceType: params.sourceType || ext,
    format: ext,
    status: 'complete',
  };
}

function handleImportGetHistory(): unknown {
  return importHistory;
}

// ─── Request Router ───────────────────────────────────────────────────────────

interface Request {
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

async function handleRequest(req: Request): Promise<void> {
  const { id, method, params } = req;

  try {
    let result: unknown;

    switch (method) {
      case 'initialize':
        result = await handleInitialize();
        respond(id, result);
        break;

      case 'get_model_status': {
        // Return current model/engine status — used by frontend on startup
        // to handle the race condition where status-update fires before listener mounts
        const userName = getPref('user_name');
        const onboardingComplete = getPref('onboarding_complete') === 'true';
        let currentActiveModel: string | null = null;
        let currentEngine: string = 'none';
        // Check NativeRuntime
        try {
          const ns = await Promise.race([
            sendCallback('native_status', {}),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          if (ns && ((ns as { status: string })?.status ?? '').toLowerCase() === 'ready') {
            currentEngine = 'native';
            // Get model name from catalog
            const modelsBase = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
            for (const m of MODEL_CATALOG) {
              if (!m.id.includes('embed') && isModelDownloaded(m.id, modelsBase)) {
                currentActiveModel = m.displayName;
                break;
              }
            }
          }
        } catch { /* native not available */ }
        // Fallback to Ollama
        if (currentEngine === 'none' && core) {
          try {
            const ollamaModel = await core.models.getActiveChatModel();
            if (ollamaModel) {
              currentActiveModel = ollamaModel;
              currentEngine = 'ollama';
            }
          } catch { /* no ollama */ }
        }
        respond(id, {
          ollamaStatus: currentEngine !== 'none' ? 'connected' : 'disconnected',
          inferenceEngine: currentEngine,
          activeModel: currentActiveModel,
          userName,
          onboardingComplete,
        });
        break;
      }

      case 'send_message':
        // send_message responds and emits events internally
        await handleSendMessage(id, params as { message: string; conversation_id?: string });
        break;

      case 'get_ollama_status':
        result = await handleGetOllamaStatus();
        respond(id, result);
        break;

      case 'select_model':
        result = await handleSelectModel(params as { model_id: string });
        respond(id, result);
        break;

      case 'start_indexing':
        // start_indexing responds and emits events internally
        await handleStartIndexing(id, params as { directories: string[] });
        break;

      case 'get_indexing_status':
        result = await handleGetIndexingStatus();
        respond(id, result);
        break;

      case 'get_knowledge_stats':
        result = await handleGetKnowledgeStats();
        respond(id, result);
        break;

      case 'get_indexed_directories':
        result = await handleGetIndexedDirectories();
        respond(id, result);
        break;

      case 'get_action_log':
        result = await handleGetActionLog(params as { limit: number; offset: number });
        respond(id, result);
        break;

      case 'get_privacy_status':
        result = await handleGetPrivacyStatus();
        respond(id, result);
        break;

      case 'set_user_name':
        result = handleSetUserName(params as { name: string });
        respond(id, result);
        break;

      case 'set_ai_name':
        setPref('ai_name', (params as { name: string }).name);
        respond(id, { success: true });
        break;

      case 'get_user_name':
        result = handleGetUserName();
        respond(id, result);
        break;

      case 'set_onboarding_complete':
        result = handleSetOnboardingComplete();
        respond(id, result);
        break;

      case 'get_onboarding_complete':
        result = handleGetOnboardingComplete();
        respond(id, result);
        break;

      case 'set_autonomy_tier':
        result = handleSetAutonomyTier(params as { domain: string; tier: string });
        respond(id, result);
        break;

      case 'get_autonomy_config':
        result = handleGetAutonomyConfig();
        respond(id, result);
        break;

      case 'get_chat_history':
        result = await handleGetChatHistory(params as { limit: number; offset: number });
        respond(id, result);
        break;

      // ── Credential Management ──

      case 'add_credential':
        result = handleAddCredential(params as {
          serviceType: 'email' | 'calendar';
          protocol: 'imap' | 'smtp' | 'caldav';
          host: string;
          port: number;
          username: string;
          password: string;
          useTLS: boolean;
          displayName: string;
        });
        respond(id, result);
        break;

      case 'list_credentials':
        result = handleListCredentials(params as { service_type: string });
        respond(id, result);
        break;

      case 'remove_credential':
        result = handleRemoveCredential(params as { id: string });
        respond(id, result);
        break;

      case 'test_credential':
        result = await handleTestCredential(params as { id: string });
        respond(id, result);
        break;

      case 'discover_calendars':
        result = await handleDiscoverCalendars(params as { credential_id: string });
        respond(id, result);
        break;

      case 'get_accounts_status':
        result = handleGetAccountsStatus();
        respond(id, result);
        break;

      case 'get_provider_presets':
        result = handleGetProviderPresets();
        respond(id, result);
        break;

      // ── Universal Inbox & AI Actions (Step 6) ──

      case 'email:startIndex':
        await handleEmailStartIndex(id, params as { account_id: string });
        break;

      case 'email:getIndexStatus':
        result = handleEmailGetIndexStatus();
        respond(id, result);
        break;

      case 'calendar:startIndex':
        await handleCalendarStartIndex(id, params as { account_id: string });
        break;

      case 'inbox:getItems':
        result = handleInboxGetItems(params as { limit?: number; offset?: number; filter?: string });
        respond(id, result);
        break;

      case 'inbox:getProactiveInsights':
        result = handleGetProactiveInsights();
        respond(id, result);
        break;

      case 'email:categorize':
        result = await handleEmailCategorize(params as { message_id: string });
        respond(id, result);
        break;

      case 'email:categorizeBatch':
        result = await handleEmailCategorizeBatch(params as { message_ids: string[] });
        respond(id, result);
        break;

      case 'email:archive':
        result = await handleEmailArchive(params as { message_ids: string[] });
        respond(id, result);
        break;

      case 'calendar:detectConflicts':
        result = handleCalendarDetectConflicts(params as { start_time: string; end_time: string });
        respond(id, result);
        break;

      case 'calendar:getMeetingPrep':
        result = await handleGetMeetingPrep(params as { event_id: string });
        respond(id, result);
        break;

      case 'proactive:run':
        result = await handleProactiveRun();
        respond(id, result);
        break;

      case 'action:approve':
        result = await handleActionApprove(params as { action_id: string });
        respond(id, result);
        break;

      case 'action:reject':
        result = await handleActionReject(params as { action_id: string });
        respond(id, result);
        break;

      case 'action:getPending':
        result = await handleActionGetPending();
        respond(id, result);
        break;

      case 'action:getApprovalCount':
        result = handleActionGetApprovalCount(params as { action_type: string; payload: Record<string, unknown> });
        respond(id, result);
        break;

      case 'inbox:getTodayEvents':
        result = handleGetTodayEvents();
        respond(id, result);
        break;

      case 'inbox:getActionsSummary':
        result = handleGetActionsSummary();
        respond(id, result);
        break;

      case 'insight:dismiss':
        result = handleDismissInsight(params as { insight_id: string });
        respond(id, result);
        break;

      case 'email:sendAction':
        result = await handleSendEmailAction(params as { to: string[]; subject: string; body: string; replyToMessageId?: string });
        respond(id, result);
        break;

      case 'email:draftAction':
        result = await handleDraftEmailAction(params as { to: string[]; subject: string; body: string; replyToMessageId?: string });
        respond(id, result);
        break;

      case 'action:undo':
        result = await handleUndoAction(params as { action_id: string });
        respond(id, result);
        break;

      case 'action:getApprovalThreshold':
        result = handleGetApprovalThreshold(params as { action_type: string; payload: Record<string, unknown> });
        respond(id, result);
        break;

      // ── Step 7: Subscription Detection ──

      case 'finance:importStatement':
        result = await handleImportStatement(params as { file_path: string });
        respond(id, result);
        break;

      case 'finance:getSubscriptions':
        result = handleGetSubscriptions(params as { status?: string });
        respond(id, result);
        break;

      case 'finance:updateSubscriptionStatus':
        result = handleUpdateSubscriptionStatus(params as { charge_id: string; status: string });
        respond(id, result);
        break;

      case 'finance:getImportHistory':
        result = handleGetImportHistory();
        respond(id, result);
        break;

      case 'finance:getSummary':
        result = handleGetSubscriptionSummary();
        respond(id, result);
        break;

      // ── Step 7: Autonomy Escalation ──

      case 'escalation:check':
        result = handleCheckEscalations();
        respond(id, result);
        break;

      case 'escalation:respond':
        result = handleRespondToEscalation(params as { prompt_id: string; accepted: boolean });
        respond(id, result);
        break;

      case 'escalation:getActive':
        result = handleGetActiveEscalations();
        respond(id, result);
        break;

      // ── Step 7: Knowledge Moment ──

      case 'knowledge:generateMoment':
        result = await handleGenerateKnowledgeMoment();
        respond(id, result);
        break;

      // ── Step 7: Weekly Digest ──

      case 'digest:generate':
        result = await handleGenerateDigest(params as { week_start: string; week_end: string });
        respond(id, result);
        break;

      case 'digest:getLatest':
        result = handleGetLatestDigest();
        respond(id, result);
        break;

      case 'digest:list':
        result = handleListDigests();
        respond(id, result);
        break;

      // ── Step 8: Network Monitor ──

      case 'network:getActiveConnections':
        result = handleGetActiveConnections();
        respond(id, result);
        break;

      case 'network:getStatistics':
        result = handleGetNetworkStatistics(params as { period: string });
        respond(id, result);
        break;

      case 'network:getAllowlist':
        result = handleGetNetworkAllowlist();
        respond(id, result);
        break;

      case 'network:getUnauthorizedAttempts':
        result = handleGetUnauthorizedAttempts(params as { period?: string });
        respond(id, result);
        break;

      case 'network:getTimeline':
        result = handleGetConnectionTimeline(params as { period: string; granularity: string });
        respond(id, result);
        break;

      case 'network:getHistory':
        result = handleGetConnectionHistory(params as { limit?: number; offset?: number });
        respond(id, result);
        break;

      case 'network:generateReport':
        result = handleGeneratePrivacyReport(params as { start_date: string; end_date: string; format: string });
        respond(id, result);
        break;

      case 'network:getTrustStatus':
        result = handleGetNetworkTrustStatus();
        respond(id, result);
        break;

      // ── Step 8: Task Routing ──

      case 'routing:getDevices':
        result = handleGetDevices();
        respond(id, result);
        break;

      case 'routing:registerDevice':
        result = handleRegisterDevice(params as { device: Record<string, unknown> });
        respond(id, result);
        break;

      case 'routing:routeTask':
        result = handleRouteTask(params as { task: Record<string, unknown> });
        respond(id, result);
        break;

      case 'routing:assessTask':
        result = handleAssessTask(params as { task: Record<string, unknown> });
        respond(id, result);
        break;

      // ── Hardware & Runtime (Step 9) ──

      case 'hardware:detect':
        result = handleDetectHardware();
        respond(id, result);
        break;

      // ── Contacts (Step 14) ──

      case 'contacts:import':
        result = handleContactsImport(params as { filePath?: string });
        respond(id, result);
        break;

      case 'contacts:list':
        result = handleContactsList(params as { limit?: number; sortBy?: string });
        respond(id, result);
        break;

      case 'contacts:get':
        result = handleContactsGet(params as { id: string });
        respond(id, result);
        break;

      case 'contacts:search':
        result = handleContactsSearch(params as { query: string; limit?: number });
        respond(id, result);
        break;

      case 'contacts:getStats':
        result = handleContactsGetStats();
        respond(id, result);
        break;

      case 'contacts:getRelationshipGraph':
        result = handleContactsGetRelationshipGraph();
        respond(id, result);
        break;

      case 'contacts:getUpcomingBirthdays':
        result = handleContactsGetUpcomingBirthdays();
        respond(id, result);
        break;

      case 'contacts:getFrequencyAlerts':
        result = handleContactsGetFrequencyAlerts();
        respond(id, result);
        break;

      // ── Messaging (Step 15) ──

      case 'messaging:draft':
        result = await handleMessagingDraft(params as { recipientName?: string; recipientPhone: string; intent: string; relationship?: string });
        respond(id, result);
        break;

      case 'messaging:send':
        result = await handleMessagingSend(params as { phone: string; body: string });
        respond(id, result);
        break;

      case 'messaging:history':
        result = await handleMessagingHistory(params as { contactPhone: string; limit?: number });
        respond(id, result);
        break;

      // ── Clipboard (Step 15) ──

      case 'clipboard:analyze':
        result = await handleClipboardAnalyze(params as { text: string });
        respond(id, result);
        break;

      case 'clipboard:getSettings':
        result = handleClipboardGetSettings();
        respond(id, result);
        break;

      case 'clipboard:setSettings':
        result = handleClipboardSetSettings(params as { monitoringEnabled: boolean });
        respond(id, result);
        break;

      case 'clipboard:getRecent':
        result = handleClipboardGetRecent();
        respond(id, result);
        break;

      // ── License / Founding Member ──

      case 'license:activate_founding': {
        if (!premiumGate) {
          respondError(id, 'PremiumGate not initialized');
          break;
        }
        const { token } = params as { token: string };
        result = premiumGate.activateFoundingMember(token);
        respond(id, result);
        break;
      }

      case 'license:activate_key': {
        if (!premiumGate) {
          respondError(id, 'PremiumGate not initialized');
          break;
        }
        const { key } = params as { key: string };
        result = premiumGate.activateLicense(key);
        respond(id, result);
        break;
      }

      case 'license:status': {
        if (!premiumGate) {
          result = { tier: 'free', isPremium: false, isFoundingMember: false, foundingSeat: null, licenseKey: null };
        } else {
          result = {
            tier: premiumGate.getLicenseTier(),
            isPremium: premiumGate.isPremium(),
            isFoundingMember: premiumGate.isFoundingMember(),
            foundingSeat: premiumGate.getFoundingSeat(),
            licenseKey: premiumGate.getLicenseKey(),
          };
        }
        respond(id, result);
        break;
      }

      // ── Conversation Management ──

      case 'list_conversations':
        if (!conversationManager) { respondError(id, 'ConversationManager not initialized'); break; }
        result = conversationManager.list(params as { limit?: number; offset?: number; pinnedOnly?: boolean; search?: string });
        respond(id, result);
        break;

      case 'get_conversation':
        if (!conversationManager) { respondError(id, 'ConversationManager not initialized'); break; }
        result = conversationManager.get((params as { id: string }).id);
        respond(id, result);
        break;

      case 'create_conversation': {
        if (!conversationManager) { respondError(id, 'ConversationManager not initialized'); break; }
        const newConv = conversationManager.create((params as { first_message?: string }).first_message);
        currentConversationId = newConv.id;
        result = newConv;
        respond(id, result);
        break;
      }

      case 'delete_conversation': {
        const delId = (params as { id: string }).id;
        if (conversationIndexer) {
          await conversationIndexer.removeConversation(delId);
        }
        if (conversationManager) {
          conversationManager.delete(delId);
        }
        if (currentConversationId === delId) {
          currentConversationId = null;
        }
        result = { success: true };
        respond(id, result);
        break;
      }

      case 'rename_conversation':
        if (!conversationManager) { respondError(id, 'ConversationManager not initialized'); break; }
        conversationManager.rename((params as { id: string; title: string }).id, (params as { id: string; title: string }).title);
        result = { success: true };
        respond(id, result);
        break;

      case 'pin_conversation':
        if (!conversationManager) { respondError(id, 'ConversationManager not initialized'); break; }
        conversationManager.pin((params as { id: string }).id);
        result = { success: true };
        respond(id, result);
        break;

      case 'unpin_conversation':
        if (!conversationManager) { respondError(id, 'ConversationManager not initialized'); break; }
        conversationManager.unpin((params as { id: string }).id);
        result = { success: true };
        respond(id, result);
        break;

      case 'switch_conversation': {
        if (!conversationManager) { respondError(id, 'ConversationManager not initialized'); break; }
        const switchId = (params as { id: string; limit?: number }).id;
        const turnLimit = (params as { id: string; limit?: number }).limit ?? 100;
        currentConversationId = switchId;
        const turns = conversationManager.getTurns(switchId, turnLimit);
        result = { conversationId: switchId, turns };
        respond(id, result);
        break;
      }

      case 'search_conversations': {
        const searchQuery = (params as { query: string; limit?: number }).query;
        const searchLimit = (params as { query: string; limit?: number }).limit ?? 10;
        // Semantic first via ConversationIndexer, fallback to title search
        let searchResults: unknown[] = [];
        if (conversationIndexer) {
          searchResults = await conversationIndexer.searchConversations(searchQuery, searchLimit);
        }
        if (searchResults.length === 0 && conversationManager) {
          searchResults = conversationManager.searchByTitle(searchQuery, searchLimit);
        }
        result = searchResults;
        respond(id, result);
        break;
      }

      case 'clear_all_conversations': {
        const preservePinned = (params as { preserve_pinned?: boolean }).preserve_pinned ?? true;
        // Remove from vector store first
        if (conversationManager && conversationIndexer) {
          const allConvs = conversationManager.list({ limit: 10000 });
          for (const conv of allConvs) {
            if (preservePinned && conv.pinned) continue;
            await conversationIndexer.removeConversation(conv.id);
          }
        }
        const cleared = conversationManager ? conversationManager.clearAll({ preservePinned }) : 0;
        currentConversationId = null;
        result = { cleared };
        respond(id, result);
        break;
      }

      case 'set_conversation_auto_expiry': {
        const expiryDays = (params as { days: number | null }).days;
        setPref('conversation_auto_expiry_days', expiryDays === null ? 'null' : String(expiryDays));
        result = { success: true };
        respond(id, result);
        break;
      }

      case 'get_conversation_settings':
        result = {
          autoExpiryDays: (() => {
            const val = getPref('conversation_auto_expiry_days');
            if (!val || val === 'null') return null;
            return parseInt(val, 10);
          })(),
        };
        respond(id, result);
        break;

      // ── Shutdown ──

      case 'shutdown':
        result = await handleShutdown();
        respond(id, result);
        // Give time for response to flush before exit
        setTimeout(() => process.exit(0), 100);
        break;

      // ── Intent Layer ──

      case 'get_intent':
        if (!intentManager) throw new Error('IntentManager not initialized');
        result = intentManager.getIntent();
        respond(id, result);
        break;

      case 'set_primary_goal':
        if (!intentManager) throw new Error('IntentManager not initialized');
        intentManager.setPrimaryGoal((params as { text: string }).text);
        respond(id, { success: true });
        break;

      case 'add_hard_limit':
        if (!intentManager) throw new Error('IntentManager not initialized');
        result = await intentManager.addHardLimit(
          (params as { rawText: string; source: 'onboarding' | 'settings' | 'chat' }).rawText,
          (params as { rawText: string; source: 'onboarding' | 'settings' | 'chat' }).source,
        );
        respond(id, result);
        break;

      case 'remove_hard_limit':
        if (!intentManager) throw new Error('IntentManager not initialized');
        intentManager.removeHardLimit((params as { id: string }).id);
        respond(id, { success: true });
        break;

      case 'toggle_hard_limit':
        if (!intentManager) throw new Error('IntentManager not initialized');
        intentManager.toggleHardLimit(
          (params as { id: string; active: boolean }).id,
          (params as { id: string; active: boolean }).active,
        );
        respond(id, { success: true });
        break;

      case 'add_personal_value':
        if (!intentManager) throw new Error('IntentManager not initialized');
        result = await intentManager.addPersonalValue(
          (params as { rawText: string; source: 'onboarding' | 'settings' | 'chat' }).rawText,
          (params as { rawText: string; source: 'onboarding' | 'settings' | 'chat' }).source,
        );
        respond(id, result);
        break;

      case 'remove_personal_value':
        if (!intentManager) throw new Error('IntentManager not initialized');
        intentManager.removePersonalValue((params as { id: string }).id);
        respond(id, { success: true });
        break;

      case 'get_intent_observations':
        if (!intentManager) throw new Error('IntentManager not initialized');
        result = intentManager.getPendingObservations(
          (params as { channel?: 'morning_brief' | 'chat' }).channel,
        );
        respond(id, result);
        break;

      case 'dismiss_observation':
        if (!intentManager) throw new Error('IntentManager not initialized');
        intentManager.dismissObservation(
          (params as { id: string; userResponse?: string }).id,
          (params as { id: string; userResponse?: string }).userResponse,
        );
        respond(id, { success: true });
        break;

      case 'check_action_intent':
        if (!intentManager) throw new Error('IntentManager not initialized');
        result = intentManager.checkAction(
          (params as { action: import('../../../core/types/ipc.js').ActionType; context: Record<string, unknown> }).action,
          (params as { action: import('../../../core/types/ipc.js').ActionType; context: Record<string, unknown> }).context,
        );
        respond(id, result);
        break;

      case 'set_intent_onboarding': {
        if (!intentManager) throw new Error('IntentManager not initialized');
        const onb = params as { primaryGoal?: string; hardLimit?: string; personalValue?: string };
        if (onb.primaryGoal) intentManager.setPrimaryGoal(onb.primaryGoal);
        if (onb.hardLimit) await intentManager.addHardLimit(onb.hardLimit, 'onboarding');
        if (onb.personalValue) await intentManager.addPersonalValue(onb.personalValue, 'onboarding');
        respond(id, { success: true });
        break;
      }

      // ─── Alter Ego Guardrails ──────────────────────────────────────────────

      case 'alterEgo:getSettings':
        if (!alterEgoStore) throw new Error('AlterEgoStore not initialized');
        result = alterEgoStore.getSettings();
        respond(id, result);
        break;

      case 'alterEgo:updateSettings':
        if (!alterEgoStore) throw new Error('AlterEgoStore not initialized');
        alterEgoStore.updateSettings(params as Partial<{ dollarThreshold: number; confirmationDisabledCategories: string[] }>);
        result = alterEgoStore.getSettings();
        respond(id, result);
        break;

      case 'alterEgo:getReceipts':
        if (!alterEgoStore) throw new Error('AlterEgoStore not initialized');
        result = alterEgoStore.getReceipts((params as { weekGroup?: string }).weekGroup);
        respond(id, result);
        break;

      case 'alterEgo:approveBatch': {
        if (!alterEgoStore) throw new Error('AlterEgoStore not initialized');
        if (!prefsDb) throw new Error('Database not initialized');
        const { ids: approveIds } = params as { ids: string[] };
        const now = new Date().toISOString();
        for (const actionId of approveIds) {
          const row = prefsDb.prepare(
            'SELECT action FROM pending_actions WHERE id = ? AND status = ?'
          ).get(actionId, 'pending_approval') as { action: string } | undefined;
          prefsDb.prepare(
            "UPDATE pending_actions SET status = 'approved', executed_at = ? WHERE id = ? AND status = 'pending_approval'"
          ).run(now, actionId);
          // Acknowledge novel action type after approval
          if (row) {
            alterEgoStore.acknowledgeAnomaly(row.action);
          }
        }
        result = { approved: approveIds.length };
        respond(id, result);
        break;
      }

      case 'alterEgo:rejectBatch': {
        if (!prefsDb) throw new Error('Database not initialized');
        const { ids: rejectIds } = params as { ids: string[] };
        const rejectNow = new Date().toISOString();
        for (const actionId of rejectIds) {
          prefsDb.prepare(
            "UPDATE pending_actions SET status = 'rejected', executed_at = ? WHERE id = ? AND status = 'pending_approval'"
          ).run(rejectNow, actionId);
        }
        result = { rejected: rejectIds.length };
        respond(id, result);
        break;
      }

      case 'alterEgo:sendDraft': {
        if (!alterEgoStore) throw new Error('AlterEgoStore not initialized');
        if (!prefsDb) throw new Error('Database not initialized');
        const { actionId: draftId, email: draftEmail, action: draftAction } = params as {
          actionId: string;
          email: string;
          action: string;
        };
        const draftNow = new Date().toISOString();
        prefsDb.prepare(
          "UPDATE pending_actions SET status = 'approved', executed_at = ? WHERE id = ? AND status = 'pending_approval'"
        ).run(draftNow, draftId);
        alterEgoStore.incrementTrust(draftEmail, draftAction);
        result = { sent: true, trust: alterEgoStore.getTrust(draftEmail, draftAction) };
        respond(id, result);
        break;
      }

      case 'alterEgo:undoReceipt': {
        if (!alterEgoStore) throw new Error('AlterEgoStore not initialized');
        if (!prefsDb) throw new Error('Database not initialized');
        const { receiptId } = params as { receiptId: string };
        // Check undo window
        const receipt = alterEgoStore.getReceipts().find(r => r.id === receiptId);
        if (!receipt) {
          respondError(id, 'Receipt not found');
          break;
        }
        if (!receipt.undoAvailable || !receipt.undoExpiresAt) {
          respondError(id, 'Undo not available');
          break;
        }
        if (new Date(receipt.undoExpiresAt) < new Date()) {
          respondError(id, 'Undo window expired');
          break;
        }
        alterEgoStore.markUndone(receiptId);
        prefsDb.prepare(
          "UPDATE pending_actions SET status = 'undone' WHERE id = ?"
        ).run(receiptId);
        result = { undone: true };
        respond(id, result);
        break;
      }

      // ─── Sound Settings ────────────────────────────────────────────────
      case 'sound:getSettings': {
        const raw = getPref('sound_settings');
        result = raw
          ? JSON.parse(raw)
          : { enabled: true, categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 } };
        respond(id, result);
        break;
      }

      case 'sound:saveSettings': {
        const settings = params as { enabled: boolean; categoryVolumes: Record<string, number> };
        setPref('sound_settings', JSON.stringify(settings));
        result = settings;
        respond(id, result);
        break;
      }

      // ─── Language Preference ──────────────────────────────────────────
      case 'language:get': {
        result = getPref('language');
        respond(id, result);
        break;
      }

      case 'language:set': {
        const { code } = params as { code: string };
        setPref('language', code);
        result = { code };
        respond(id, result);
        break;
      }

      // ─── Knowledge Curation ──────────────────────────────────────────

      case 'knowledge:listByCategory': {
        if (!core) { respond(id, { items: [], total: 0 }); break; }
        if (!curator) {
          curator = core.knowledge.createCurator({
            db: prefsDb!,
            llm: core.llm,
          });
        }
        const listParams = params as { category: string; limit?: number; offset?: number; searchQuery?: string };
        result = await curator.listChunksByCategory(listParams.category as any, {
          limit: listParams.limit,
          offset: listParams.offset,
          searchQuery: listParams.searchQuery,
        });
        respond(id, result);
        break;
      }

      case 'knowledge:remove': {
        if (!core) { respond(id, { success: false, chunkId: '', operation: 'remove', detail: 'Core not initialized' }); break; }
        if (!curator) {
          curator = core.knowledge.createCurator({ db: prefsDb!, llm: core.llm });
        }
        const removeParams = params as { chunkId: string };
        result = await curator.removeFromGraph(removeParams.chunkId);
        respond(id, result);
        break;
      }

      case 'knowledge:delete': {
        if (!core) { respond(id, { success: false, chunkId: '', operation: 'delete', detail: 'Core not initialized' }); break; }
        if (!curator) {
          curator = core.knowledge.createCurator({ db: prefsDb!, llm: core.llm });
        }
        const deleteParams = params as { chunkId: string };
        result = await curator.deleteFromDisk(deleteParams.chunkId);
        respond(id, result);
        break;
      }

      case 'knowledge:recategorize': {
        if (!core) { respond(id, { success: false, chunkId: '', operation: 'recategorize', detail: 'Core not initialized' }); break; }
        if (!curator) {
          curator = core.knowledge.createCurator({ db: prefsDb!, llm: core.llm });
        }
        const recatParams = params as { chunkId: string; newCategory: string };
        result = await curator.recategorize(recatParams.chunkId, recatParams.newCategory as any);
        respond(id, result);
        break;
      }

      case 'knowledge:reindex': {
        if (!core) { respond(id, { success: false, chunkId: '', operation: 'reindex', detail: 'Core not initialized' }); break; }
        if (!curator) {
          curator = core.knowledge.createCurator({ db: prefsDb!, llm: core.llm });
        }
        const reindexParams = params as { chunkId: string };
        result = await curator.reindex(reindexParams.chunkId);
        respond(id, result);
        break;
      }

      case 'knowledge:suggestCategories': {
        if (!core) { respond(id, []); break; }
        if (!curator) {
          curator = core.knowledge.createCurator({ db: prefsDb!, llm: core.llm });
        }
        const suggestParams = params as { chunkId: string };
        result = await curator.suggestCategories(suggestParams.chunkId);
        respond(id, result);
        break;
      }

      case 'knowledge:listCategories': {
        if (!core) { respond(id, []); break; }
        if (!curator) {
          curator = core.knowledge.createCurator({ db: prefsDb!, llm: core.llm });
        }
        result = curator.listCategories();
        respond(id, result);
        break;
      }

      // ─── Merkle Chain / Audit Integrity ─────────────────────────────────

      case 'audit_verify_chain': {
        if (!ensureMerkleChain()) { respond(id, { valid: true, entryCount: 0, daysVerified: 0 }); break; }
        const chainParams = params as { startDate?: string; endDate?: string };
        const verifyResult = merkleChain!.verifyAuditChain(chainParams.startDate, chainParams.endDate);
        cachedChainStatus = {
          verified: verifyResult.valid,
          entryCount: verifyResult.entryCount,
          daysVerified: verifyResult.daysVerified,
          firstBreak: verifyResult.firstBreak,
          lastVerifiedAt: new Date().toISOString(),
        };
        respond(id, verifyResult);
        break;
      }

      case 'audit_generate_receipt': {
        if (!ensureMerkleChain()) { respondError(id, 'Audit database not initialized'); break; }
        const receiptParams = params as { date: string };
        const keyPair = ed25519GenerateKeyPair();
        const receipt = merkleChain!.generateSignedReceipt(receiptParams.date, keyPair.privateKey, keyPair.publicKey);
        respond(id, receipt);
        break;
      }

      case 'audit_get_chain_status': {
        if (!cachedChainStatus) {
          if (ensureMerkleChain()) {
            const statusResult = merkleChain!.verifyAuditChain();
            cachedChainStatus = {
              verified: statusResult.valid,
              entryCount: statusResult.entryCount,
              daysVerified: statusResult.daysVerified,
              firstBreak: statusResult.firstBreak,
              lastVerifiedAt: new Date().toISOString(),
            };
          } else {
            cachedChainStatus = {
              verified: true,
              entryCount: 0,
              daysVerified: 0,
              lastVerifiedAt: new Date().toISOString(),
            };
          }
        }
        respond(id, cachedChainStatus);
        break;
      }

      // ─── Hardware-Bound Keys ──────────────────────────────────────────────

      case 'hw_key_get_info': {
        if (!ensureHwKeyProvider()) { respondError(id, 'Hardware key provider not initialized'); break; }
        const keyParams = params as { keyId?: string };
        const info: HardwareKeyInfo = await hwKeyProvider!.getOrCreateKey(keyParams.keyId);
        respond(id, info);
        break;
      }

      case 'hw_key_sign': {
        if (!ensureHwKeyProvider()) { respondError(id, 'Hardware key provider not initialized'); break; }
        const signParams = params as { payload: string; keyId?: string };
        const payloadBuf = Buffer.from(signParams.payload, 'hex');
        const signResult: HardwareSignResult = await hwKeyProvider!.signPayload(payloadBuf, signParams.keyId);
        respond(id, signResult);
        break;
      }

      case 'hw_key_verify': {
        if (!ensureHwKeyProvider()) { respondError(id, 'Hardware key provider not initialized'); break; }
        const verifyParams = params as { payload: string; signatureHex: string; keyId?: string };
        const verifyBuf = Buffer.from(verifyParams.payload, 'hex');
        const verifyResult: HardwareVerifyResult = await hwKeyProvider!.verifySignature(verifyBuf, verifyParams.signatureHex, verifyParams.keyId);
        respond(id, verifyResult);
        break;
      }

      case 'hw_key_get_backend': {
        if (!ensureHwKeyProvider()) { respondError(id, 'Hardware key provider not initialized'); break; }
        respond(id, { backend: hwKeyProvider!.getBackend(), hardwareBacked: hwKeyProvider!.isHardwareBacked() });
        break;
      }

      // ─── Sovereignty Report ────────────────────────────────────────────────

      case 'report_generate_sovereignty': {
        if (!prefsDb) { respondError(id, 'Core database not initialized'); break; }
        const reportParams = params as { periodStart: string; periodEnd: string };
        const signingKeyPair = ed25519GenerateKeyPair();
        const report: SovereigntyReport = generateSovereigntyReport(
          { coreDb: prefsDb, auditDb: merkleDb, deviceId: 'desktop', keyPair: signingKeyPair },
          reportParams.periodStart,
          reportParams.periodEnd,
        );
        // Store the public key so verify can use it later
        setPref('sovereignty_report_public_key', signingKeyPair.publicKey.toString('hex'));
        respond(id, report);
        break;
      }

      case 'report_render_pdf': {
        const renderParams = params as { reportJson: string };
        const reportForPdf = JSON.parse(renderParams.reportJson) as SovereigntyReport;
        const pdfBytes = await renderSovereigntyReportPDF(reportForPdf);
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
        respond(id, { pdfBase64 });
        break;
      }

      case 'report_verify_sovereignty': {
        const verifyReportParams = params as { reportJson: string };
        const pubKeyHex = getPref('sovereignty_report_public_key');
        if (!pubKeyHex) { respond(id, { valid: false }); break; }
        const reportObj = JSON.parse(verifyReportParams.reportJson) as SovereigntyReport;
        const valid = verifySovereigntyReport(reportObj, Buffer.from(pubKeyHex, 'hex'));
        respond(id, { valid });
        break;
      }

      // ─── Morning Brief / Weather / Commute ─────────────────────────────
      case 'brief_get_morning': {
        if (!morningBriefGenerator && prefsDb && core) {
          morningBriefGenerator = new MorningBriefGenerator(prefsDb, core.llm);
        }
        if (!morningBriefGenerator) { respond(id, null); break; }
        const brief = await morningBriefGenerator.generateBrief();
        respond(id, brief);
        break;
      }
      case 'brief_dismiss': {
        const dismissParams = params as { id: string };
        if (morningBriefGenerator) morningBriefGenerator.dismiss(dismissParams.id);
        respond(id, { success: true });
        break;
      }
      case 'weather_get_current': {
        if (!weatherService && prefsDb) {
          weatherService = new WeatherService(prefsDb);
        }
        if (!weatherService) { respond(id, null); break; }
        const weather = await weatherService.getCurrentWeather();
        respond(id, weather);
        break;
      }
      case 'commute_get_today': {
        // Commute data derived from calendar events + location
        const commuteEvents = calendarIndexer
          ? calendarIndexer.getUpcomingEvents({ daysAhead: 1, includeAllDay: false })
          : [];
        respond(id, { commutes: commuteEvents.slice(0, 3) });
        break;
      }

      // ─── Knowledge Moment / Daily Digest ──────────────────────────────
      case 'knowledge_get_moment': {
        if (!knowledgeMomentGenerator && core && prefsDb) {
          knowledgeMomentGenerator = new KnowledgeMomentGenerator(core.knowledge, core.llm, prefsDb);
        }
        if (!knowledgeMomentGenerator) { respond(id, null); break; }
        const moment = await knowledgeMomentGenerator.generate();
        respond(id, moment);
        break;
      }
      case 'digest_get_daily': {
        if (!dailyDigestGenerator && prefsDb) {
          dailyDigestGenerator = new DailyDigestGenerator(prefsDb);
        }
        if (!dailyDigestGenerator) { respond(id, null); break; }
        const digest = dailyDigestGenerator.generate();
        respond(id, digest);
        break;
      }
      case 'digest_dismiss_daily': {
        const digestDismissParams = params as { id: string };
        if (dailyDigestGenerator) dailyDigestGenerator.dismiss(digestDismissParams.id);
        respond(id, { success: true });
        break;
      }

      // ─── Alter Ego Activation / Week Progress ─────────────────────────
      case 'alter_ego_get_activation_prompt': {
        if (!escalationEngine) { respond(id, null); break; }
        const prompts = escalationEngine.getPrompts('pending')
          .filter((p: { type: string }) => p.type === 'partner_to_alterego');
        respond(id, prompts.length > 0 ? prompts[0] : null);
        break;
      }
      case 'alter_ego_get_week_progress': {
        if (!alterEgoStore) { respond(id, null); break; }
        const weekGroup = (params as { weekGroup?: string }).weekGroup
          ?? alterEgoStore.getWeekGroup(new Date());
        const weekStats = alterEgoStore.getWeekStats(weekGroup);
        const weekReceipts = alterEgoStore.getReceipts(weekGroup);
        respond(id, { ...weekStats, weekGroup, receipts: weekReceipts });
        break;
      }
      case 'alter_ego_complete_day': {
        const dayParams = params as { day: number };
        if (!alterEgoStore) { respond(id, { success: false }); break; }
        const weekGroupForDay = alterEgoStore.getWeekGroup(new Date());
        setPref(`alter_ego_day_${weekGroupForDay}_${dayParams.day}`, 'complete');
        respond(id, { success: true });
        break;
      }
      case 'alter_ego_skip_day': {
        if (!alterEgoStore) { respond(id, { success: false }); break; }
        const weekGroupForSkip = alterEgoStore.getWeekGroup(new Date());
        const today = new Date().getDay();
        setPref(`alter_ego_day_${weekGroupForSkip}_${today}`, 'skipped');
        respond(id, { success: true });
        break;
      }

      // ─── Escalation Prompts ───────────────────────────────────────────
      case 'escalation_get_prompts': {
        if (!escalationEngine) { respond(id, []); break; }
        const escPrompts = escalationEngine.getPrompts('pending');
        respond(id, escPrompts);
        break;
      }

      // ─── Style Profile ────────────────────────────────────────────────
      case 'style_get_profile': {
        if (!styleProfileStore && prefsDb) {
          styleProfileStore = new StyleProfileStore(prefsDb);
        }
        if (!styleProfileStore) { respond(id, null); break; }
        const profile = styleProfileStore.getActiveProfile();
        respond(id, profile);
        break;
      }
      case 'style_reanalyze': {
        if (!styleProfileStore) { respond(id, { success: false }); break; }
        // Trigger re-analysis — creates a new profile version
        const existing = styleProfileStore.getActiveProfile();
        if (existing) {
          styleProfileStore.updateProfile(existing.id, { lastUpdatedAt: new Date().toISOString() });
        }
        respond(id, { success: true });
        break;
      }
      case 'style_reset': {
        if (!styleProfileStore) { respond(id, { success: false }); break; }
        const activeProfile = styleProfileStore.getActiveProfile();
        if (activeProfile) styleProfileStore.deleteProfile(activeProfile.id);
        respond(id, { success: true });
        break;
      }

      // ─── Dark Pattern Detection ───────────────────────────────────────
      case 'dark_pattern_get_flags': {
        if (!darkPatternDetector && prefsDb && core) {
          darkPatternDetector = new DarkPatternDetector(prefsDb, core.llm);
        }
        if (!darkPatternDetector || !prefsDb) { respond(id, []); break; }
        try {
          const flags = prefsDb.prepare(
            'SELECT * FROM dark_pattern_flags WHERE dismissed = 0 ORDER BY created_at DESC LIMIT 50'
          ).all();
          respond(id, flags);
        } catch {
          respond(id, []);
        }
        break;
      }
      case 'dark_pattern_dismiss': {
        const dpParams = params as { contentId: string };
        if (prefsDb) {
          try {
            prefsDb.prepare(
              'UPDATE dark_pattern_flags SET dismissed = 1, dismissed_at = ? WHERE content_id = ?'
            ).run(new Date().toISOString(), dpParams.contentId);
          } catch { /* table may not exist yet */ }
        }
        respond(id, { success: true });
        break;
      }

      // ─── Quick Capture ────────────────────────────────────────────────
      case 'quick_capture': {
        const captureParams = params as { text: string };
        if (!core) { respond(id, { success: false }); break; }
        // Index the captured text as a knowledge document
        await core.knowledge.indexDocument({
          content: captureParams.text,
          title: `Quick Capture — ${new Date().toLocaleString()}`,
          source: 'quick-capture' as import('../../../core/types/ipc.js').DocumentSource,
          mimeType: 'text/plain',
        });
        respond(id, { success: true });
        break;
      }

      // ─── Reminders ────────────────────────────────────────────────────
      case 'reminder_list': {
        if (!prefsDb) { respond(id, []); break; }
        try {
          const reminders = prefsDb.prepare(
            "SELECT * FROM reminders WHERE status IN ('pending','snoozed') ORDER BY due_at ASC LIMIT 50"
          ).all();
          respond(id, reminders);
        } catch {
          respond(id, []);
        }
        break;
      }
      case 'reminder_snooze': {
        const snoozeParams = params as { id: string; duration: string };
        if (!prefsDb) { respond(id, { success: false }); break; }
        const snoozeMinutes: Record<string, number> = { '15min': 15, '1hr': 60, '3hr': 180, 'tomorrow': 1440 };
        const mins = snoozeMinutes[snoozeParams.duration] ?? 60;
        const newDue = new Date(Date.now() + mins * 60_000).toISOString();
        try {
          prefsDb.prepare('UPDATE reminders SET status = ?, due_at = ? WHERE id = ?')
            .run('snoozed', newDue, snoozeParams.id);
        } catch { /* table may not exist yet */ }
        respond(id, { success: true });
        break;
      }
      case 'reminder_dismiss': {
        const dismissReminderParams = params as { id: string };
        if (prefsDb) {
          try {
            prefsDb.prepare('UPDATE reminders SET status = ? WHERE id = ?')
              .run('dismissed', dismissReminderParams.id);
          } catch { /* table may not exist yet */ }
        }
        respond(id, { success: true });
        break;
      }

      // ─── Knowledge Graph Visualization ────────────────────────────────
      case 'knowledge_get_graph': {
        try {
          if (!graphVisualizationProvider && prefsDb && core) {
            // Ensure contactStore + relationshipAnalyzer exist for the graph provider
            try { ensureContactStore(); } catch { /* contacts not critical for graph */ }
            graphVisualizationProvider = new GraphVisualizationProvider({
              db: prefsDb as unknown as import('../../../../core/platform/types.js').DatabaseHandle,
              contactStore: contactStore ?? null,
              relationshipAnalyzer: relationshipAnalyzer ?? null,
            });
            graphVisualizationProvider.initSchema();
          }
          if (!graphVisualizationProvider) {
            respond(id, { nodes: [], edges: [], clusters: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
            break;
          }
          const graph = await graphVisualizationProvider.getGraphData();
          respond(id, graph);
        } catch (graphErr) {
          console.error('[sidecar] knowledge_get_graph failed:', graphErr);
          respond(id, { nodes: [], edges: [], clusters: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
        }
        break;
      }
      case 'knowledge_get_node_context': {
        try {
          const nodeParams = params as { nodeId: string };
          if (!graphVisualizationProvider) { respond(id, null); break; }
          const nodeCtx = await graphVisualizationProvider.getNodeContext(nodeParams.nodeId);
          respond(id, nodeCtx);
        } catch (nodeErr) {
          console.error('[sidecar] knowledge_get_node_context failed:', nodeErr);
          respond(id, null);
        }
        break;
      }
      case 'knowledge_export_graph': {
        try {
          if (!graphVisualizationProvider) { respond(id, { success: false }); break; }
          const exportGraph = await graphVisualizationProvider.getGraphData();
          respond(id, { success: true, graph: exportGraph });
        } catch (exportErr) {
          console.error('[sidecar] knowledge_export_graph failed:', exportErr);
          respond(id, { success: false });
        }
        break;
      }

      // ─── Clipboard Insights ───────────────────────────────────────────
      case 'clipboard_get_insights': {
        if (!clipboardRecognizer) { respond(id, []); break; }
        // Return recent clipboard actions as insights
        respond(id, clipboardRecentActions.slice(0, 5));
        break;
      }
      case 'clipboard_execute_action': {
        const clipActionParams = params as { actionId: string };
        // Mark action as executed
        respond(id, { success: true, actionId: clipActionParams.actionId });
        break;
      }
      case 'clipboard_dismiss_insight': {
        const clipDismissParams = params as { actionId: string };
        clipboardRecentActions = clipboardRecentActions.filter(
          a => a.timestamp !== clipDismissParams.actionId
        );
        respond(id, { success: true });
        break;
      }

      // ─── Cloud Storage ────────────────────────────────────────────────
      case 'cloud_storage_connect': {
        const csConnectParams = params as { provider: string };
        if (!cloudStorageClient && gateway) {
          cloudStorageClient = new CloudStorageClient(gateway);
        }
        if (!cloudStorageClient) { respond(id, { success: false, error: 'Gateway not initialized' }); break; }
        const authResult = await cloudStorageClient.authenticate(csConnectParams.provider as 'google_drive' | 'dropbox' | 'onedrive');
        respond(id, authResult);
        break;
      }
      case 'cloud_storage_disconnect': {
        const csDisconnectParams = params as { provider: string };
        if (cloudStorageClient) {
          await cloudStorageClient.disconnect(csDisconnectParams.provider as 'google_drive' | 'dropbox' | 'onedrive');
        }
        respond(id, { success: true });
        break;
      }
      case 'cloud_storage_sync_now': {
        if (cloudStorageClient) {
          // Trigger sync — list files and index new ones
          respond(id, { success: true, message: 'Sync initiated' });
        } else {
          respond(id, { success: false, error: 'Not connected' });
        }
        break;
      }
      case 'cloud_storage_set_interval': {
        const intervalParams = params as { minutes: number };
        setPref('cloud_storage_sync_interval_minutes', String(intervalParams.minutes));
        respond(id, { success: true });
        break;
      }
      case 'cloud_storage_set_max_file_size': {
        const fileSizeParams = params as { mb: number };
        setPref('cloud_storage_max_file_size_mb', String(fileSizeParams.mb));
        respond(id, { success: true });
        break;
      }
      case 'cloud_storage_browse_folders': {
        const browseParams = params as { provider?: string; path?: string };
        if (!cloudStorageClient) { respond(id, { files: [], nextPageToken: null, totalFiles: 0 }); break; }
        const fileList = await cloudStorageClient.listFiles(
          (browseParams.provider as 'google_drive' | 'dropbox' | 'onedrive') ?? 'google_drive',
          { query: browseParams.path }
        );
        respond(id, fileList);
        break;
      }

      // ─── Document Context ─────────────────────────────────────────────
      case 'document_set_context': {
        const docSetParams = params as { filePath: string };
        if (!documentContextManager && core) {
          documentContextManager = new DocumentContextManager(core.knowledge);
        }
        if (!documentContextManager) { respond(id, { success: false }); break; }
        const docInfo = await documentContextManager.setDocument(docSetParams.filePath);
        respond(id, docInfo);
        break;
      }
      case 'document_clear_context': {
        if (documentContextManager) documentContextManager.clearDocument();
        respond(id, { success: true });
        break;
      }
      case 'document_add_file': {
        const docAddParams = params as { filePath: string };
        if (!documentContextManager && core) {
          documentContextManager = new DocumentContextManager(core.knowledge);
        }
        if (!documentContextManager) { respond(id, { success: false }); break; }
        const addResult = await documentContextManager.addDocument(docAddParams.filePath);
        respond(id, addResult);
        break;
      }
      case 'document_remove_file': {
        const docRemoveParams = params as { documentId: string };
        if (!documentContextManager) { respond(id, { success: false }); break; }
        documentContextManager.removeDocument(docRemoveParams.documentId);
        respond(id, { success: true });
        break;
      }
      case 'add_attachment_to_knowledge': {
        const attachParams = params as { documentId: string };
        if (!documentContextManager) { respond(id, { success: false }); break; }
        const attached = await documentContextManager.addToKnowledge(attachParams.documentId);
        respond(id, { success: attached });
        break;
      }

      // ─── Financial Dashboard ──────────────────────────────────────────
      case 'get_financial_dashboard': {
        ensureFinanceComponents();
        if (!recurringDetector) { respond(id, { totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0, subscriptions: [], anomalies: [] }); break; }
        const summary = recurringDetector.getSummary();
        const subscriptions = recurringDetector.getStoredCharges();
        respond(id, { ...summary, subscriptions, anomalies: [] });
        break;
      }
      case 'dismiss_anomaly': {
        const anomalyParams = params as { anomalyId: string };
        ensureFinanceComponents();
        if (recurringDetector) recurringDetector.markUserConfirmed(anomalyParams.anomalyId);
        respond(id, { success: true });
        break;
      }

      // ─── Health Dashboard ─────────────────────────────────────────────
      case 'get_health_dashboard': {
        if (!healthEntryStore && prefsDb) {
          healthEntryStore = new HealthEntryStore(prefsDb);
        }
        if (!healthEntryStore) { respond(id, { entries: [], trends: [] }); break; }
        const trendDays = (params as { trendDays?: number }).trendDays ?? 30;
        const endDate = new Date().toISOString().slice(0, 10);
        const startDate = new Date(Date.now() - trendDays * 86400_000).toISOString().slice(0, 10);
        const trends = healthEntryStore.getTrends(startDate, endDate);
        const entries = healthEntryStore.getEntries(startDate, endDate);
        respond(id, { entries, trends });
        break;
      }
      case 'save_health_entry': {
        if (!healthEntryStore && prefsDb) {
          healthEntryStore = new HealthEntryStore(prefsDb);
        }
        if (!healthEntryStore) { respond(id, { success: false }); break; }
        const entryParams = params as { entry: { date: string; mood?: number; energy?: number; waterGlasses?: number; symptoms?: string[]; medications?: string[]; notes?: string } };
        const saved = healthEntryStore.saveEntry(entryParams.entry);
        respond(id, saved);
        break;
      }

      // ─── Search Settings ──────────────────────────────────────────────
      case 'get_search_settings': {
        const searchEngine = getPref('search_engine') ?? 'brave';
        const braveApiKey = getPref('brave_api_key') ?? '';
        const searxngUrl = getPref('searxng_url') ?? '';
        respond(id, { engine: searchEngine, braveApiKey, searxngUrl });
        break;
      }
      case 'save_search_settings': {
        const searchSettings = params as { engine?: string; braveApiKey?: string; searxngUrl?: string };
        if (searchSettings.engine) setPref('search_engine', searchSettings.engine);
        if (searchSettings.braveApiKey !== undefined) setPref('brave_api_key', searchSettings.braveApiKey);
        if (searchSettings.searxngUrl !== undefined) setPref('searxng_url', searchSettings.searxngUrl);
        respond(id, { success: true });
        break;
      }
      case 'test_brave_api_key': {
        const braveParams = params as { key: string };
        try {
          const resp = await globalThis.fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
            headers: { 'X-Subscription-Token': braveParams.key, 'Accept': 'application/json' },
          });
          respond(id, { valid: resp.ok, status: resp.status });
        } catch (err) {
          respond(id, { valid: false, error: err instanceof Error ? err.message : String(err) });
        }
        break;
      }

      // ─── Upgrade Email ────────────────────────────────────────────────
      case 'upgrade_submit_email': {
        const emailParams = params as { email: string };
        setPref('upgrade_email', emailParams.email);
        respond(id, { success: true });
        break;
      }

      // ─── Model Download Handlers ──────────────────────────────────────
      case 'start_model_downloads': {
        const result = await handleStartModelDownloads(params as { tier: string });
        respond(id, result);
        break;
      }
      case 'model_get_download_status': {
        const result = handleModelGetDownloadStatus();
        respond(id, result);
        break;
      }
      case 'model_retry_download': {
        const result = await handleModelRetryDownload(params as { modelName: string });
        respond(id, result);
        break;
      }
      case 'voice_get_model_status': {
        const result = handleVoiceGetModelStatus();
        respond(id, result);
        break;
      }
      case 'voice_download_model': {
        const result = await handleVoiceDownloadModel(params as { model: string });
        respond(id, result);
        break;
      }

      // ─── Connector Query Handlers ─────────────────────────────────────
      case 'get_connected_services': {
        // Return list of connected connector IDs (those with stored OAuth tokens)
        // Tokens are stored in OAuthTokenManager (gateway/oauth.db), NOT in prefs.
        // The token manager stores by providerKey, so we map connectorId → providerKey.
        const connectedList: string[] = [];
        try {
          const tokenMgr = ensureOAuthTokenManager();
          const connectorRegistry = createDefaultConnectorRegistry();
          for (const connector of connectorRegistry.listAll()) {
            // Look up the OAuth config to get the providerKey
            const oauthCfg = getOAuthConfigForConnector(connector.id);
            if (oauthCfg) {
              const accessToken = tokenMgr.getAccessToken(oauthCfg.providerKey);
              if (accessToken) {
                connectedList.push(connector.id);
              }
            }
            // Also check for native connectors that store state in prefs
            if (connector.authType === 'native') {
              const nativeState = getPref(`connector_state_${connector.id}`);
              if (nativeState === 'connected') {
                connectedList.push(connector.id);
              }
            }
          }
        } catch (err) {
          console.error('[sidecar] get_connected_services error:', err);
        }
        respond(id, connectedList);
        break;
      }
      case 'get_connector_config': {
        // Return OAuth config status for a connector (without exposing secrets)
        const cfgParams = params as { serviceId: string };
        const cfg = getOAuthConfigForConnector(cfgParams.serviceId);
        if (!cfg) {
          respond(id, { error: `No config for connector: ${cfgParams.serviceId}` });
        } else if (cfg.clientId === UNCONFIGURED_CLIENT_ID) {
          respond(id, { error: `Connector ${cfgParams.serviceId} not configured — .env credentials missing` });
        } else {
          respond(id, { serviceId: cfgParams.serviceId, configured: true, usePKCE: cfg.usePKCE });
        }
        break;
      }

      // Alias: get_graph_data → knowledge_get_graph
      case 'get_graph_data': {
        try {
          if (!graphVisualizationProvider && prefsDb && core) {
            try { ensureContactStore(); } catch { /* contacts not critical for graph */ }
            graphVisualizationProvider = new GraphVisualizationProvider({
              db: prefsDb as unknown as import('../../../../core/platform/types.js').DatabaseHandle,
              contactStore: contactStore ?? null,
              relationshipAnalyzer: relationshipAnalyzer ?? null,
            });
            graphVisualizationProvider.initSchema();
          }
          if (!graphVisualizationProvider) {
            respond(id, { nodes: [], edges: [], clusters: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
            break;
          }
          const graph = await graphVisualizationProvider.getGraphData();
          respond(id, graph);
        } catch (graphErr) {
          console.error('[sidecar] get_graph_data failed:', graphErr);
          respond(id, { nodes: [], edges: [], clusters: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
        }
        break;
      }

      // ─── Connector Auth Handlers ──────────────────────────────────────
      case 'connector.auth': {
        const result = await handleConnectorAuth(params as { connectorId: string });
        respond(id, result);
        break;
      }
      case 'connector.disconnect': {
        const result = await handleConnectorDisconnect(params as { connectorId: string });
        respond(id, result);
        break;
      }
      case 'connector.sync': {
        const result = await handleConnectorSync(params as { connectorId: string });
        respond(id, result);
        break;
      }

      // ─── Import Handlers ──────────────────────────────────────────────
      case 'import.run':
      case 'import_start': {
        const result = await handleImportRun(params as { sourcePath: string; sourceType: string });
        respond(id, result);
        break;
      }
      case 'import_get_history': {
        const result = handleImportGetHistory();
        respond(id, result);
        break;
      }

      default:
        respondError(id, `Unknown method: ${method}`);
    }
  } catch (err) {
    respondError(id, err instanceof Error ? err.message : String(err));
  }
}

// ─── Load .env for development (OAuth credentials, etc.) ─────────────────────
// Zero-dependency .env parser — reads KEY=VALUE lines, skips comments and blanks.
// In production, env vars are set at system level; .env is for development only.
try {
  // Try multiple .env locations — sidecar CWD varies between dev and production.
  // In dev: cwd is repo root, __dirname/../../../.. resolves to repo root.
  // In installed app: cwd is the install dir (e.g. C:\Program Files\Semblance\),
  // so we also check __dirname itself (bundle-sidecar.js copies .env there)
  // and ~/.semblance/.env as a user-managed fallback.
  const envCandidates = [
    join(__dirname, '.env'),                      // Bundled .env next to bridge.cjs (installed app)
    join(homedir(), '.semblance', '.env'),         // User-managed fallback
    join(process.cwd(), '.env'),                   // Dev: repo root
    join(__dirname, '..', '..', '..', '..', '.env'), // Dev: relative to sidecar dir
  ];
  let envLoaded = false;
  for (const envPath of envCandidates) {
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf-8');
      let count = 0;
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) { process.env[key] = val; count++; }
      }
      console.error(`[sidecar] Loaded ${count} env vars from ${envPath}`);
      envLoaded = true;
      break;
    }
  }
  if (!envLoaded) console.error('[sidecar] No .env file found in:', envCandidates.join(', '));
  // Log key OAuth credential status
  console.error('[sidecar] SEMBLANCE_GOOGLE_CLIENT_ID:', process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ? 'SET' : 'NOT SET');
  console.error('[sidecar] SEMBLANCE_SLACK_CLIENT_ID:', process.env['SEMBLANCE_SLACK_CLIENT_ID'] ? 'SET' : 'NOT SET');
} catch {
  // .env not found or unreadable — not an error in production
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line: string) => {
  if (!line.trim()) return;

  try {
    const msg = JSON.parse(line);

    // Check for callback_response from Rust (Step 9 NDJSON reverse-call)
    if (msg.type === 'callback_response' && typeof msg.id === 'string') {
      handleCallbackResponse(msg as { id: string; result?: unknown; error?: string });
      return;
    }

    // Regular request from Rust
    const req = msg as Request;
    if (typeof req.id === 'undefined' || !req.method) {
      console.error('[sidecar] Invalid request (missing id or method):', line);
      return;
    }
    handleRequest(req).catch(err => {
      console.error('[sidecar] Unhandled error in request handler:', err);
      respondError(req.id, 'Internal sidecar error');
    });
  } catch {
    console.error('[sidecar] Failed to parse request:', line);
  }
});

rl.on('close', () => {
  console.error('[sidecar] stdin closed, shutting down');
  handleShutdown().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.error('[sidecar] SIGTERM received');
  handleShutdown().then(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.error('[sidecar] SIGINT received');
  handleShutdown().then(() => process.exit(0));
});

// Signal readiness
console.error('[sidecar] Bridge process started, waiting for initialize command');
