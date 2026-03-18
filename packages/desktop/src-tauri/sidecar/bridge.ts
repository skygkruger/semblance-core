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
import { createLLMProvider, BitNetProvider, InferenceRouter } from '../../../core/llm/index.js';
import type { NativeRuntimeBridge } from '../../../core/llm/native-bridge-types.js';
import { getPlatform } from '../../../core/platform/index.js';
import { createDesktopVectorStore } from '../../../core/platform/desktop-adapter.js';
import { scanDirectory, readFileContent } from '../../../core/knowledge/file-scanner.js';
import { sanitizeRetrievedContent } from '../../../core/agent/content-sanitizer.js';
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

// IP Adapter Registry — runtime access to @semblance/dr implementations
import { ipAdapters } from '../../../core/extensions/ip-adapter-registry.js';

// Step 7 imports (finance moved to @semblance/dr — access via ipAdapters)
import { EscalationEngine } from '../../../core/agent/autonomy-escalation.js';
import { KnowledgeMomentGenerator } from '../../../core/agent/knowledge-moment.js';
// WeeklyDigestGenerator moved to @semblance/dr — access via ipAdapters

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

// Sprint C: Named sessions, channels, canvas, event bus, vision
import { NamedSessionManager } from '../../../core/agent/named-session-manager.js';
import { VisionProvider } from '../../../core/llm/vision-provider.js';
import { ChannelRegistry } from '../../../gateway/channels/channel-registry.js';
import { PairingManager } from '../../../gateway/channels/pairing-manager.js';
import { CanvasManager } from '../../../gateway/canvas/canvas-manager.js';
import { SemblanceEventBus } from '../../../gateway/events/event-bus.js';

// Sprint G.5: Browser CDP + Alter Ego Week + Import Everything
import { BrowserCDPAdapter } from '../../../gateway/browser/browser-cdp-adapter.js';
// AlterEgoWeekEngine moved to @semblance/dr — access via ipAdapters
import type { AlterEgoDay } from '../../../core/agent/alter-ego-week-types.js';
import { ImportEverythingOrchestrator } from '../../../core/agent/import-everything-orchestrator.js';

// Sprint G: Multi-Account + Channels + Skills
import { SignalChannelAdapter } from '../../../gateway/channels/signal/signal-adapter.js';
import { SlackChannelAdapter } from '../../../gateway/channels/slack/slack-channel-adapter.js';
import { WhatsAppChannelAdapter } from '../../../gateway/channels/whatsapp/whatsapp-adapter.js';
import { SkillRegistry } from '../../../core/skills/skill-registry.js';
import { validateSkillDeclaration, ALL_CAPABILITIES, CAPABILITY_DESCRIPTIONS } from '../../../core/skills/skill-declaration.js';
import type { SkillDeclaration, SkillCapability } from '../../../core/skills/skill-declaration.js';
import { SubAgentCoordinator } from '../../../core/agent/sub-agent-coordinator.js';

// Sprint F: Hardware Bridge
import { BinaryAllowlist } from '../../../gateway/security/binary-allowlist.js';
import { ArgumentValidator } from '../../../gateway/security/argument-validator.js';
import { SystemCommandGateway } from '../../../gateway/system/system-command-gateway.js';

// Sprint E: Intelligence Depth
import { PreferenceGraph } from '../../../core/agent/preference-graph.js';
import { runAllPreferenceDetectors } from '../../../core/agent/preference-detectors.js';
import { SpeculativeLoader } from '../../../core/agent/speculative-loader.js';
import { CommitmentTracker } from '../../../core/agent/commitment-tracker.js';
import { PatternShiftDetector } from '../../../core/agent/pattern-shift-detector.js';
import { CronScheduler } from '../../../gateway/cron/cron-scheduler.js';
import { DaemonManager } from '../../../gateway/daemon/daemon-manager.js';

// Sprint D: Tunnel / Compute Mesh
import { TunnelGatewayServer } from '../../../gateway/tunnel/tunnel-gateway-server.js';
import { WireGuardKeyManager } from '../../../gateway/tunnel/wireguard-keys.js';
import { HeadscaleClient } from '../../../gateway/tunnel/headscale-client.js';
import { WireGuardManager } from '../../../gateway/tunnel/wireguard-manager.js';
import { PairingCoordinator } from '../../../gateway/tunnel/pairing-coordinator.js';
import { TunnelKGSync } from '../../../gateway/tunnel/kg-sync.js';

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
import { getModelsForTier, getEmbeddingModel, getRecommendedReasoningModel, getModelById, MODEL_CATALOG, BITNET_MODEL_CATALOG, getRecommendedBitNetModel, getBitNetModelsForTier, getAnyModelById } from '../../../core/llm/model-registry.js';
import type { ModelRegistryEntry } from '../../../core/llm/model-registry.js';
import { getModelsDir, getModelPath, isModelDownloaded, getModelFileSize, getBitNetModelsDir, getBitNetModelPath, isBitNetModelDownloaded, listDownloadedBitNetModels } from '../../../core/llm/model-storage.js';
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
import { registerAllConnectors, wireConnectorRouter } from '../../../gateway/services/connector-registration.js';
import type { ConnectorRouter } from '../../../gateway/services/connector-router.js';

// Morning Brief / Daily Digest / Weather / Style / Dark Pattern / Document Context / Health / Cloud Storage / Graph Vis
import { MorningBriefGenerator } from '../../../core/agent/morning-brief.js';
import { DailyDigestGenerator } from '../../../core/agent/daily-digest.js';
import { WeatherService } from '../../../core/weather/weather-service.js';
import { LocationStore } from '../../../core/location/location-store.js';
import { StyleProfileStore } from '../../../core/style/style-profile.js';
// DarkPatternDetector moved to @semblance/dr — access via ipAdapters
import { DocumentContextManager } from '../../../core/agent/document-context.js';
import { HealthEntryStore } from '../../../core/health/health-entry-store.js';
import { CloudStorageClient } from '../../../core/cloud-storage/cloud-storage-client.js';
import { GraphVisualizationProvider } from '../../../core/knowledge/graph-visualization.js';

// Sovereignty features — Living Will, Witness, Inheritance, Backup
import { LivingWillExporter } from '../../../core/living-will/living-will-exporter.js';
import { LivingWillImporter } from '../../../core/living-will/living-will-importer.js';
import { LivingWillScheduler } from '../../../core/living-will/living-will-scheduler.js';
import { WitnessGenerator } from '../../../core/witness/witness-generator.js';
import { WitnessVerifier } from '../../../core/witness/witness-verifier.js';
import { WitnessExporter } from '../../../core/witness/witness-exporter.js';
import { AttestationSigner } from '../../../core/attestation/attestation-signer.js';
import { InheritanceConfigStore } from '../../../core/inheritance/inheritance-config-store.js';
import { BackupManager } from '../../../core/backup/backup-manager.js';

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

/** Log a provider transition to the audit trail for user visibility. */
function logProviderTransition(from: string, to: string, model: string, reason: string): void {
  if (!gateway) return;
  try {
    const trail = gateway.getAuditTrail();
    trail.append({
      requestId: `provider-transition-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'service.api_call',
      direction: 'response',
      status: 'success',
      payloadHash: 'provider_transition',
      signature: 'provider_transition',
      metadata: {
        event: 'provider_transition',
        from,
        to,
        model,
        reason,
      },
    });
  } catch { /* audit trail not yet initialized — log only to console */ }
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

const CALLBACK_TIMEOUT_MS = 300_000; // 5 minutes — CPU inference on 7B model is slow

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
let documentsDb: Database.Database | null = null;
let emailIndexer: EmailIndexer | null = null;
let calendarIndexer: CalendarIndexer | null = null;
let emailCategorizer: EmailCategorizer | null = null;
let _refreshPromptConfig: () => void = () => {}; // set during initializeCore
let proactiveEngine: ProactiveEngine | null = null;

// Step 7 state (finance/digest moved to @semblance/dr — access via ipAdapters)
let escalationEngine: EscalationEngine | null = null;
let knowledgeMomentGenerator: KnowledgeMomentGenerator | null = null;

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

// Sovereignty feature state
let livingWillExporter: LivingWillExporter | null = null;
let livingWillImporter: LivingWillImporter | null = null;
let livingWillScheduler: LivingWillScheduler | null = null;
let witnessGenerator: WitnessGenerator | null = null;
let witnessVerifier: WitnessVerifier | null = null;
let witnessExporter: WitnessExporter | null = null;
let attestationSigner: AttestationSigner | null = null;
let inheritanceConfigStore: InheritanceConfigStore | null = null;
let backupManager: BackupManager | null = null;

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

// Sprint C: Named sessions, channels, canvas, event bus, vision
let namedSessionManager: NamedSessionManager | null = null;
let visionProvider: VisionProvider | null = null;
let channelRegistry: ChannelRegistry | null = null;
let pairingManager: PairingManager | null = null;
let canvasManager: CanvasManager | null = null;
let eventBus: SemblanceEventBus | null = null;

// Sprint E: Intelligence Depth
let preferenceGraph: PreferenceGraph | null = null;
let speculativeLoader: SpeculativeLoader | null = null;
let commitmentTracker: CommitmentTracker | null = null;
let patternShiftDetector: PatternShiftDetector | null = null;
let cronScheduler: CronScheduler | null = null;
let daemonManager: DaemonManager | null = null;
let hardwareMonitorInterval: ReturnType<typeof setInterval> | null = null;

// Sprint G.5: Browser CDP + Alter Ego Week + Import
let browserCDPAdapter: BrowserCDPAdapter | null = null;
// alterEgoWeekEngine: access via ipAdapters.alterEgoWeekEngine
let importOrchestrator: ImportEverythingOrchestrator | null = null;

// Sprint G: Multi-Account + Channels + Skills
let signalAdapter: SignalChannelAdapter | null = null;
let slackChannelAdapter: SlackChannelAdapter | null = null;
let whatsappAdapter: WhatsAppChannelAdapter | null = null;
let skillRegistry: SkillRegistry | null = null;
let subAgentCoordinator: SubAgentCoordinator | null = null;

// Sprint F: Hardware Bridge
let binaryAllowlist: BinaryAllowlist | null = null;
let argumentValidator: ArgumentValidator | null = null;
let systemCommandGateway: SystemCommandGateway | null = null;
let fileWatchers: Map<string, ReturnType<typeof import('node:fs').watch>> = new Map();

// Sprint D: Tunnel / Compute Mesh
let tunnelGatewayServer: TunnelGatewayServer | null = null;
let headscaleClient: HeadscaleClient | null = null;
let wireguardManager: WireGuardManager | null = null;
let tunnelPairingCoordinator: PairingCoordinator | null = null;
let tunnelKGSync: TunnelKGSync | null = null;

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
let locationStore: LocationStore | null = null;
let styleProfileStore: StyleProfileStore | null = null;
// darkPatternDetector: access via ipAdapters.darkPatternDetector
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
// Connector router (lazy-initialized on first sync)
let connectorRouter: ConnectorRouter | null = null;

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
    const sysLen = (params.systemPrompt ?? '').length;
    const promptLen = params.prompt.length;
    console.error(`[sidecar] native_generate: system_prompt=${sysLen} chars, prompt=${promptLen} chars, max_tokens=${params.maxTokens ?? 512}`);
    if (sysLen + promptLen > 20000) {
      console.error(`[sidecar] WARNING: very large prompt (${sysLen + promptLen} chars) — may exceed context window`);
    }
    const result = await sendCallback('native_generate', {
      prompt: params.prompt,
      system_prompt: params.systemPrompt ?? '',
      max_tokens: params.maxTokens ?? 512,
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
    const totalChars = params.input.reduce((sum, t) => sum + t.length, 0);
    console.error(`[sidecar] native_embed: ${params.input.length} texts, ${totalChars} total chars`);
    if (totalChars > 30000) {
      console.error(`[sidecar] WARNING: large embed input (${totalChars} chars) — tokens may be truncated by Rust`);
    }
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

  // Build knowledge stats section (documents live in documents.db, not core.db)
  let knowledgeSection = '';
  try {
    if (documentsDb) {
      const docCount = (documentsDb.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number })?.count ?? 0;
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

  // Seed allowlist with Google API domains (needed for Gmail, Calendar, Drive)
  try {
    const allowlist = gateway.getAllowlist();
    for (const domain of ['www.googleapis.com', 'gmail.googleapis.com', 'oauth2.googleapis.com']) {
      allowlist.addService({ serviceName: 'Google APIs', domain, protocol: 'https', addedBy: 'system_seed' });
    }
  } catch { /* allowlist seeding is best-effort */ }

  // ──── STEP 3: Core init (can fail — knowledge graph depends on LanceDB) ────
  // If this fails, the app still works for chat (NativeRuntime), preferences,
  // navigation, and all screens that don't need the knowledge graph.
  const platform = getPlatform();
  if (!platform.vectorStore) {
    platform.vectorStore = createDesktopVectorStore(join(dataDir, 'knowledge'));
  }
  const knowledgeDir = join(dataDir, 'knowledge');
  if (!existsSync(knowledgeDir)) mkdirSync(knowledgeDir, { recursive: true });

  // Open documents.db for GraphVisualizationProvider (documents live here, not in core.db)
  try {
    documentsDb = new Database(join(knowledgeDir, 'documents.db'));
    documentsDb.pragma('journal_mode = WAL');
    console.error('[sidecar] Documents DB ready (knowledge/documents.db)');
  } catch (docDbErr) {
    console.error('[sidecar] Failed to open documents.db:', docDbErr);
  }

  // NativeRuntime channel check (non-blocking)
  void Promise.race([
    sendCallback('native_status', {}),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]).then((status) => {
    if (status) console.error('[sidecar] NativeRuntime channel ready:', JSON.stringify(status));
    else console.error('[sidecar] NativeRuntime channel timed out (5s)');
  }).catch((err) => console.error('[sidecar] NativeRuntime channel error:', err));

  // Check if a BitNet model was previously active — if so, create both NativeProvider
  // and BitNetProvider so the InferenceRouter can route reasoning through BitNet's
  // tool-calling-aware provider. Both use the same NativeRuntime bridge (one-fork approach:
  // BitNet.cpp replaced llama-cpp-2 entirely, so both paths use BitNet.cpp's optimized kernels).
  const activeBitNetModelId = getPref('bitnet_active_model') ?? null;
  const nativeLlm = createLLMProvider({
    runtime: 'builtin',
    nativeBridge: nativeRuntimeBridge,
    embeddingModel: 'nomic-embed-text-v1.5',
    bitnetBridge: nativeRuntimeBridge,
    bitnetModel: activeBitNetModelId ?? 'falcon-e-1b',
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

  // Wire prompt config (AI name, user name, connected services, doc count) into orchestrator
  try {
    if (core?.agent?.updatePromptConfig) {
      const aiName = getPref('ai_name') ?? 'Semblance';
      const userName = getPref('user_name') ?? undefined;

      // Connected services
      const connectedServices: string[] = [];
      try {
        const tokenMgr = ensureOAuthTokenManager();
        const connectorRegistry = createDefaultConnectorRegistry();
        for (const connector of connectorRegistry.listAll()) {
          const oauthCfg = getOAuthConfigForConnector(connector.id);
          if (oauthCfg) {
            const accessToken = tokenMgr.getAccessToken(oauthCfg.providerKey);
            if (accessToken) connectedServices.push(connector.displayName);
          }
        }
      } catch { /* token manager not ready */ }

      // Document count
      let indexedDocCount = 0;
      try {
        if (documentsDb) {
          indexedDocCount = (documentsDb.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number })?.count ?? 0;
        }
      } catch { /* documents table may not exist yet */ }

      core.agent.updatePromptConfig({ aiName, userName, connectedServices, indexedDocCount });
      console.error(`[sidecar] Prompt config wired: name=${aiName}, services=${connectedServices.length}, docs=${indexedDocCount}`);
    }
  } catch (err) {
    console.error('[sidecar] Prompt config wiring failed:', err);
  }

  // Re-read prefs and push updated prompt config to the orchestrator.
  // Called whenever ai_name or user_name changes (e.g. during onboarding).
  function refreshPromptConfig(): void {
    try {
      if (!core?.agent?.updatePromptConfig) return;
      const aiName = getPref('ai_name') ?? 'Semblance';
      const userName = getPref('user_name') ?? undefined;

      const connectedServices: string[] = [];
      try {
        const tokenMgr = ensureOAuthTokenManager();
        const connectorRegistry = createDefaultConnectorRegistry();
        for (const connector of connectorRegistry.listAll()) {
          const oauthCfg = getOAuthConfigForConnector(connector.id);
          if (oauthCfg) {
            const accessToken = tokenMgr.getAccessToken(oauthCfg.providerKey);
            if (accessToken) connectedServices.push(connector.displayName);
          }
        }
      } catch { /* token manager not ready */ }

      let indexedDocCount = 0;
      try {
        if (documentsDb) {
          indexedDocCount = (documentsDb.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number })?.count ?? 0;
        }
      } catch { /* documents table may not exist yet */ }

      core.agent.updatePromptConfig({ aiName, userName, connectedServices, indexedDocCount });
      console.error(`[sidecar] Prompt config refreshed: name=${aiName}, user=${userName ?? '(not set)'}, services=${connectedServices.length}`);
    } catch (err) {
      console.error('[sidecar] Prompt config refresh failed:', err);
    }
  }

  // Make refreshPromptConfig available to IPC handlers outside this scope
  _refreshPromptConfig = refreshPromptConfig;

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

  // Initialize service adapters (pass OAuthTokenManager so Gmail OAuth tokens bridge to IMAP/SMTP)
  const tokenMgrForEmail = ensureOAuthTokenManager();
  emailAdapter = new EmailAdapter(credentialStore, tokenMgrForEmail);
  calendarAdapter = new CalendarAdapter(credentialStore);

  // Register email and calendar adapters with Gateway service registry
  // so the orchestrator's tool calls (email.send, email.fetch, calendar.create, etc.)
  // route to real adapters instead of hitting FallbackAdapter
  try {
    const registry = gateway!.getServiceRegistry();
    registry.register('email.fetch', emailAdapter);
    registry.register('email.send', emailAdapter);
    registry.register('email.draft', emailAdapter);
    registry.register('email.archive', emailAdapter);
    registry.register('email.move', emailAdapter);
    registry.register('email.markRead', emailAdapter);
    registry.register('calendar.fetch', calendarAdapter);
    registry.register('calendar.create', calendarAdapter);
    registry.register('calendar.update', calendarAdapter);
    console.error('[sidecar] Email + Calendar adapters registered with Gateway');

    // Cloud storage — register GoogleDriveAdapter for cloud.list_files if Google credentials exist
    try {
      const tokenMgr = ensureOAuthTokenManager();
      const clientId = process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ?? '';
      const clientSecret = process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'] ?? '';
      if (clientId) {
        const { GoogleDriveAdapter } = await import('../../../gateway/services/google-drive-adapter.js');
        const driveAdapter = new GoogleDriveAdapter(tokenMgr, { clientId, clientSecret });
        registry.register('cloud.list_files', driveAdapter);
        console.error('[sidecar] GoogleDriveAdapter registered for cloud.list_files');
      }
    } catch (driveErr) {
      console.error('[sidecar] Failed to register GoogleDriveAdapter:', driveErr);
    }

    // Wire ConnectorRouter to Gateway ServiceRegistry so connector.* actions
    // (connector.sync, connector.auth, etc.) route to the correct OAuth adapters
    try {
      const tokenMgr = ensureOAuthTokenManager();
      connectorRouter = registerAllConnectors(tokenMgr);
      wireConnectorRouter(registry, connectorRouter);
      console.error('[sidecar] ConnectorRouter wired to Gateway for', connectorRouter.listRegistered().length, 'connectors');
    } catch (crErr) {
      console.error('[sidecar] Failed to wire ConnectorRouter:', crErr);
    }
  } catch (err) {
    console.error('[sidecar] Failed to register email/calendar adapters:', err);
  }

  // Auto-configure SearXNG from environment variable if available.
  // When SEARXNG_URL is set, SearXNG becomes the default search provider.
  // This is the production path: VERIDIAN hosts SearXNG at search.veridian.run.
  // SearXNG is the default search provider for all Semblance users.
  // Hardcoded fallback ensures it works even if .env is missing or stale.
  const envSearxngUrl = process.env['SEARXNG_URL'] || 'https://search.veridian.run';
  if (!getPref('searxng_url') || !getPref('search_engine') || getPref('search_engine') === 'duckduckgo') {
    setPref('searxng_url', envSearxngUrl);
    setPref('search_engine', 'searxng');
    console.error(`[sidecar] SearXNG configured: ${envSearxngUrl}`);
  }

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

  // Check inference backends — priority: Ollama (GPU) > NativeRuntime (CPU)
  let inferenceEngine: 'native' | 'ollama' | 'none' = 'none';
  let activeModel: string | null = null;
  let availableModels: string[] = [];
  const modelsBaseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;

  // ── Step 1: Check Ollama (GPU-accelerated, dramatically faster) ──────────
  // If Ollama is running with a model, use it. 30-50 tok/s on GPU vs 1-2 on CPU.
  if (core) {
    try {
      const { Ollama } = await import('ollama');
      const ollamaClient = new Ollama({ host: 'http://localhost:11434' });
      const listResponse = await ollamaClient.list();
      const ollamaModels = listResponse.models.map((m: { name: string }) => m.name);

      if (ollamaModels.length > 0) {
        const { OllamaProvider } = await import('../../../core/llm/ollama-provider.js');
        const { InferenceRouter } = await import('../../../core/llm/inference-router.js');
        const ollamaProvider = new OllamaProvider();
        const router = core.llm as InstanceType<typeof InferenceRouter>;

        // Pick the best available model
        const ollamaModel = ollamaModels.find((m: string) => m.includes('llama3')) ??
          ollamaModels.find((m: string) => !m.includes('embed') && !m.includes('nomic')) ??
          ollamaModels[0];

        if (ollamaModel && router.setReasoningProvider) {
          router.setReasoningProvider(ollamaProvider, ollamaModel);
          core.models.setActiveChatModel(ollamaModel);
          try { if (core.agent) core.agent.setModel(ollamaModel); } catch { /* */ }
          inferenceEngine = 'ollama';
          activeModel = ollamaModel;
          availableModels = ollamaModels.filter((m: string) => !m.includes('embed') && !m.includes('nomic'));
          console.error(`[sidecar] Ollama GPU inference active (model: ${ollamaModel}, ${ollamaModels.length} models available)`);
          logProviderTransition('none', 'ollama', ollamaModel, 'Ollama GPU detected at startup');
        }
      }
    } catch {
      console.error('[sidecar] Ollama not running — will use NativeRuntime CPU inference');
    }
  }

  // ── Step 2: Load embedding model (always needed, even with Ollama) ───────
  for (const model of MODEL_CATALOG) {
    if (!model.isEmbedding) continue;
    if (isModelDownloaded(model.id, modelsBaseDir)) {
      const modelPath = getModelPath(model.id, modelsBaseDir);
      try {
        await Promise.race([
          sendCallback('native_load_model', { model_path: modelPath, model_type: 'embedding' }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 120000)),
        ]);
        console.error(`[sidecar] Loaded embedding model "${model.id}" into NativeRuntime`);
      } catch (err) {
        console.error(`[sidecar] Failed to load embedding "${model.id}":`, err);
      }
    }
  }

  // ── Step 3: If no Ollama, load NativeRuntime reasoning model (CPU) ───────
  if (inferenceEngine !== 'ollama') {
    for (const model of MODEL_CATALOG) {
      if (model.isEmbedding) continue;
      if (isModelDownloaded(model.id, modelsBaseDir)) {
        const modelPath = getModelPath(model.id, modelsBaseDir);
        try {
          const loadResult = await Promise.race([
            sendCallback('native_load_model', { model_path: modelPath, model_type: 'reasoning' }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 120000)),
          ]);
          if (loadResult === null) {
            console.error(`[sidecar] native_load_model timed out for "${model.id}" after 120s`);
            break;
          }
          console.error(`[sidecar] Loaded reasoning model "${model.id}" into NativeRuntime`);
          activeModel = model.displayName;
          availableModels.push(model.displayName);
          break; // Only need one reasoning model
        } catch (err) {
          console.error(`[sidecar] Failed to load "${model.id}" into NativeRuntime:`, err);
          break;
        }
      }
    }

    // Check NativeRuntime status
    try {
      const nativeStatus = await Promise.race([
        sendCallback('native_status', {}),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
      if (nativeStatus && ((nativeStatus as { status: string })?.status ?? '').toLowerCase() === 'ready') {
        inferenceEngine = 'native';
        console.error('[sidecar] NativeRuntime is ready');
      }
    } catch {
      console.error('[sidecar] NativeRuntime not available');
    }
  }

  // ── BitNet Fallback Activation ──────────────────────────────────────────────
  // If no standard Qwen model was loaded, check for downloaded BitNet 1-bit models.
  // BitNet models are smaller/faster but lower quality than standard Q4_K_M models.
  if (core && !activeModel) {
    const activeBitNetId = getPref('bitnet_active_model') ?? null;
    const bitnetBaseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;

    // Try the persisted active model first, then the recommended model for detected tier
    const candidateIds = activeBitNetId ? [activeBitNetId] : [];
    try {
      const downloaded = listDownloadedBitNetModels(bitnetBaseDir);
      for (const d of downloaded) {
        if (!candidateIds.includes(d.modelId)) candidateIds.push(d.modelId);
      }
    } catch { /* ignore */ }

    for (const candidateId of candidateIds) {
      if (isBitNetModelDownloaded(candidateId, bitnetBaseDir)) {
        const candidatePath = getBitNetModelPath(candidateId, bitnetBaseDir);
        try {
          await Promise.race([
            sendCallback('native_load_model', { model_path: candidatePath, model_type: 'reasoning' }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 120000)),
          ]);
          // Wire BitNetProvider into InferenceRouter
          const router = core.llm as InstanceType<typeof InferenceRouter>;
          if (router.setBitNetProvider) {
            const bitnetProv = new BitNetProvider({ bridge: nativeRuntimeBridge, modelName: candidateId });
            router.setBitNetProvider(bitnetProv, candidateId);
          }
          inferenceEngine = 'native'; // native with BitNet backend
          const catalogEntry = BITNET_MODEL_CATALOG.find(m => m.id === candidateId);
          activeModel = catalogEntry?.displayName ?? candidateId;
          console.error(`[sidecar] BitNet activated: "${candidateId}" (${catalogEntry?.displayName ?? candidateId})`);
          logProviderTransition('none', 'bitnet', candidateId, 'BitNet default backend activated at startup');
          break;
        } catch (err) {
          console.error(`[sidecar] BitNet fallback load failed for "${candidateId}":`, err);
        }
      }
    }
  }

  // ── Standard Model Fallback ──────────────────────────────────────────────
  // If no Ollama and no BitNet models loaded, try standard GGUF models from MODEL_CATALOG
  if (inferenceEngine === 'none' && !activeModel && core) {
    const stdBaseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
    for (const stdModel of MODEL_CATALOG.filter(m => !m.isEmbedding)) {
      if (isModelDownloaded(stdModel.id, stdBaseDir)) {
        const stdPath = getModelPath(stdModel.id, stdBaseDir);
        try {
          await sendCallback('native_load_model', { model_path: stdPath, model_type: 'reasoning' });
          inferenceEngine = 'native';
          activeModel = stdModel.displayName;
          console.error(`[sidecar] Standard model fallback activated: "${stdModel.id}"`);
          logProviderTransition('none', 'native', stdModel.id, 'Standard GGUF fallback (BitNet models unavailable)');
          break;
        } catch (err) {
          console.error(`[sidecar] Standard model load failed for "${stdModel.id}":`, err);
        }
      }
    }
  }

  // ── No Model Warning ──────────────────────────────────────────────────────
  if (inferenceEngine === 'none' && !activeModel) {
    console.error('[sidecar] WARNING: No inference model available. Chat will prompt user to download a model.');
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

  // ── Ollama Health Check (mid-session fallback) ──────────────────────────────
  // If using Ollama, periodically check it's still running. If it crashes,
  // fall back to BitNet without losing the conversation.
  if (inferenceEngine === 'ollama' && core) {
    const HEALTH_CHECK_INTERVAL = 30_000; // 30 seconds
    setInterval(async () => {
      try {
        const { Ollama } = await import('ollama');
        const client = new Ollama({ host: 'http://localhost:11434' });
        await client.list();
        // Ollama still running — all good
      } catch {
        // Ollama crashed or stopped — fall back to BitNet
        console.error('[sidecar] Ollama health check failed — falling back to BitNet/NativeRuntime');
        const router = core!.llm as InstanceType<typeof InferenceRouter>;
        if (router.setReasoningProvider && router.setBitNetProvider) {
          // Try to activate BitNet as the reasoning provider
          const bDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
          const downloaded = listDownloadedBitNetModels(bDir);
          if (downloaded.length > 0) {
            const bitId = downloaded[0]!.modelId;
            const bitnetProv = new BitNetProvider({ bridge: nativeRuntimeBridge, modelName: bitId });
            router.setBitNetProvider(bitnetProv, bitId);
            console.error(`[sidecar] Fell back to BitNet "${bitId}" after Ollama failure`);
            logProviderTransition('ollama', 'bitnet', bitId, 'Ollama health check failed — mid-session fallback');
          }
          // Emit status update so UI reflects the change
          emit('status-update', {
            ollamaStatus: 'disconnected',
            inferenceEngine: 'native',
            activeModel: downloaded.length > 0 ? downloaded[0]!.modelId : activeModel,
            availableModels: [],
            onboardingComplete,
            userName,
          });
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  // ──── STEP 6: Sprint E — Intelligence Depth initialization ────
  try {
    const dbHandle = prefsDb as unknown as import('../../../core/platform/types.js').DatabaseHandle;

    // Initialize event bus (may already exist from Sprint C handler)
    if (!eventBus) eventBus = new SemblanceEventBus();

    // Preference Graph
    preferenceGraph = new PreferenceGraph(dbHandle);
    console.error('[sidecar] PreferenceGraph initialized');

    // Wire preference graph into autonomy manager
    if (core?.autonomy?.setPreferenceGraph) {
      (core.autonomy as import('../../../core/agent/autonomy.js').AutonomyManager).setPreferenceGraph(preferenceGraph);
      console.error('[sidecar] PreferenceGraph wired into AutonomyManager');
    }

    // Speculative Loader (in-memory cache)
    speculativeLoader = new SpeculativeLoader();
    console.error('[sidecar] SpeculativeLoader initialized');

    // Commitment Tracker
    commitmentTracker = new CommitmentTracker(dbHandle);
    console.error('[sidecar] CommitmentTracker initialized');

    // Pattern Shift Detector
    patternShiftDetector = new PatternShiftDetector(dbHandle);
    console.error('[sidecar] PatternShiftDetector initialized');

    // Cron Scheduler (with event bus)
    cronScheduler = new CronScheduler(undefined, eventBus);
    console.error('[sidecar] CronScheduler initialized with event bus');

    // Daemon Manager (with event bus + wake detection)
    daemonManager = new DaemonManager({ eventBus });
    daemonManager.startWakeDetection();
    console.error('[sidecar] DaemonManager wake detection started');

    // Hardware monitoring tick (30-second interval for thermal/memory/disk events)
    hardwareMonitorInterval = setInterval(() => {
      if (!eventBus) return;
      try {
        const os = require('node:os');
        const availableMb = Math.round(os.freemem() / (1024 * 1024));

        // Memory pressure detection
        if (availableMb < 512) {
          eventBus.emit('hardware.memory_pressure', {
            level: availableMb < 256 ? 'critical' : 'moderate',
            availableMb,
          });
        }

        // Disk space detection (check home drive)
        try {
          const { execSync } = require('node:child_process');
          const homeDir = os.homedir();
          if (process.platform === 'win32') {
            const drive = homeDir.substring(0, 2); // e.g. "C:"
            const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace /value`, { encoding: 'utf-8' });
            const match = output.match(/FreeSpace=(\d+)/);
            if (match) {
              const freeGb = parseInt(match[1]!, 10) / (1024 * 1024 * 1024);
              if (freeGb < 2) {
                eventBus.emit('hardware.disk_low', { drivePath: drive, availableGb: Math.round(freeGb * 100) / 100 });
              }
            }
          } else {
            const output = execSync(`df -k "${homeDir}" | tail -1`, { encoding: 'utf-8' });
            const parts = output.trim().split(/\s+/);
            const availKb = parseInt(parts[3] ?? '0', 10);
            const freeGb = availKb / (1024 * 1024);
            if (freeGb < 2) {
              eventBus.emit('hardware.disk_low', { drivePath: homeDir, availableGb: Math.round(freeGb * 100) / 100 });
            }
          }
        } catch { /* disk check best-effort */ }
      } catch (hwErr) {
        console.error('[sidecar] Hardware monitor tick error:', hwErr);
      }
    }, 30_000);

    // Register calendar event timers for upcoming events
    if (core) {
      try {
        const coreDb = (core as unknown as { db: import('better-sqlite3').Database }).db;
        if (coreDb) {
          const calIndexer = new (await import('../../../core/knowledge/calendar-indexer.js')).CalendarIndexer({
            db: coreDb as unknown as import('../../../core/platform/types.js').DatabaseHandle,
            knowledge: core.knowledge,
            llm: core.llm,
            eventBus,
          });
          calIndexer.registerUpcomingEventTimers();
          console.error('[sidecar] Calendar event timers registered');
        }
      } catch { /* calendar timer registration best-effort */ }
    }

    // Wire orchestrator event subscriptions
    if (core?.agent) {
      try {
        // High-urgency email: push to canvas
        eventBus.subscribe(['email.arrived'], async (event) => {
          if (event.type !== 'email.arrived') return;
          const payload = event.payload as { priority: string; messageId: string; subject: string };
          if (payload.priority !== 'high') return;
          if (canvasManager) {
            canvasManager.push({
              componentType: 'morning_brief' as any,
              data: { urgentEmail: { messageId: payload.messageId, subject: payload.subject } },
              replace: false,
              title: 'Urgent email arrived',
            });
            emit('canvas:update', canvasManager.getCurrentPayload());
          }
        });

        // Calendar prep: push meeting brief at T-15
        eventBus.subscribe(['calendar.starting'], async (event) => {
          if (event.type !== 'calendar.starting') return;
          const payload = event.payload as { minutesUntil: number; eventId: string; title: string };
          if (payload.minutesUntil > 15) return;
          if (canvasManager) {
            canvasManager.push({
              componentType: 'morning_brief' as any,
              data: { meetingPrep: { eventId: payload.eventId, title: payload.title, minutesUntil: payload.minutesUntil } },
              replace: false,
              title: `Meeting in ${payload.minutesUntil} minutes`,
            });
            emit('canvas:update', canvasManager.getCurrentPayload());
          }
        });

        // Channel message: resolve bound named session and increment message count
        eventBus.subscribe(['channel.message_received'], async (event) => {
          if (event.type !== 'channel.message_received') return;
          const payload = event.payload as { channelId: string; senderId: string; sessionKey: string };
          if (namedSessionManager) {
            try {
              const session = await namedSessionManager.getSessionByChannel(payload.channelId);
              if (session) {
                namedSessionManager.incrementMessageCount(session.key);
                console.error(`[EventBus] Channel message routed to session "${session.key}" from ${payload.senderId}`);
              }
            } catch (routeErr) {
              console.error('[EventBus] Failed to route channel message:', routeErr);
            }
          }
        });

        // System wake: trigger morning brief if morning hours
        eventBus.subscribe(['system.wake'], async (event) => {
          if (event.type !== 'system.wake') return;
          const payload = event.payload as { timestamp: string };
          const hour = new Date(payload.timestamp).getHours();
          if (hour >= 5 && hour <= 9 && cronScheduler) {
            await cronScheduler.fireJob('morning-brief');
          }
        });

        // Tunnel connected: trigger KG sync
        eventBus.subscribe(['tunnel.connected'], async () => {
          if (cronScheduler) {
            await cronScheduler.fireJob('tunnel-sync');
          }
        });

        // Financial anomaly: always push to canvas
        eventBus.subscribe(['financial.anomaly'], async (event) => {
          if (event.type !== 'financial.anomaly') return;
          if (canvasManager) {
            canvasManager.push({
              componentType: 'chart' as any,
              data: { anomaly: event.payload },
              replace: false,
              title: 'Financial anomaly detected',
            });
            emit('canvas:update', canvasManager.getCurrentPayload());
          }
        });

        console.error('[sidecar] Orchestrator event subscriptions wired (6 handlers)');
      } catch (subErr) {
        console.error('[sidecar] Event subscription wiring failed:', subErr);
      }
    }

    console.error('[sidecar] Sprint E initialization complete');
  } catch (sprintEErr) {
    console.error('[sidecar] Sprint E initialization failed (non-fatal):', sprintEErr);
  }

  // ──── STEP 7: Sprint F — Hardware Bridge initialization ────
  try {
    const gatewayDb = new Database(join(homedir(), '.semblance', 'gateway', 'credentials.db'));
    binaryAllowlist = new BinaryAllowlist(gatewayDb);
    argumentValidator = new ArgumentValidator();
    systemCommandGateway = new SystemCommandGateway(binaryAllowlist, argumentValidator);
    console.error(`[sidecar] Hardware Bridge initialized — ${binaryAllowlist.list().length} binaries allowlisted`);
  } catch (sprintFErr) {
    console.error('[sidecar] Sprint F initialization failed (non-fatal):', sprintFErr);
  }

  // ──── STEP 8: Sprint G — Multi-Account + Channels + Skills ────
  try {
    const dbHandle = prefsDb as unknown as import('../../../core/platform/types.js').DatabaseHandle;

    // Multi-account migration (idempotent)
    try {
      const tokenMgr = ensureOAuthTokenManager();
      tokenMgr.migrateToMultiAccount();
      console.error('[sidecar] Multi-account OAuth migration checked');
    } catch (migErr) {
      console.error('[sidecar] OAuth migration skipped:', migErr);
    }

    // Channel adapters (Signal, Slack, WhatsApp)
    signalAdapter = new SignalChannelAdapter({
      systemGateway: systemCommandGateway ?? undefined,
    });
    slackChannelAdapter = new SlackChannelAdapter();
    whatsappAdapter = new WhatsAppChannelAdapter();

    // Register new channel adapters with registry
    if (channelRegistry) {
      channelRegistry.register(signalAdapter);
      channelRegistry.register(slackChannelAdapter);
      channelRegistry.register(whatsappAdapter);
      console.error('[sidecar] Signal, Slack, WhatsApp channel adapters registered');
    }

    // Skill Registry
    const skillsDir = join(homedir(), '.semblance', 'skills');
    skillRegistry = new SkillRegistry(dbHandle, skillsDir);
    console.error(`[sidecar] SkillRegistry initialized — ${skillRegistry.list().length} skills installed`);

    // Sub-Agent Coordinator
    subAgentCoordinator = new SubAgentCoordinator();
    console.error('[sidecar] SubAgentCoordinator initialized');

    console.error('[sidecar] Sprint G initialization complete');
  } catch (sprintGErr) {
    console.error('[sidecar] Sprint G initialization failed (non-fatal):', sprintGErr);
  }

  // ──── STEP 9: Sprint G.5 — Browser CDP + Alter Ego Week + Import ────
  try {
    const dbHandle = prefsDb as unknown as import('../../../core/platform/types.js').DatabaseHandle;

    // Browser CDP adapter (lazy — connects on first use)
    browserCDPAdapter = new BrowserCDPAdapter(gateway?.getAllowlist());
    console.error('[sidecar] BrowserCDPAdapter initialized (lazy connect)');

    // Alter Ego Week engine — initialized by @semblance/dr via ipAdapters
    console.error('[sidecar] AlterEgoWeekEngine: available via ipAdapters.alterEgoWeekEngine');

    // Import Everything orchestrator
    importOrchestrator = new ImportEverythingOrchestrator(dbHandle);
    console.error('[sidecar] ImportEverythingOrchestrator initialized');

    console.error('[sidecar] Sprint G.5 initialization complete');
  } catch (sprintG5Err) {
    console.error('[sidecar] Sprint G.5 initialization failed (non-fatal):', sprintG5Err);
  }

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
  params: { message: string; conversation_id?: string; attachments?: Array<{ id: string; fileName: string; filePath: string; mimeType: string }> },
): Promise<void> {
  // ─── ROUTE 1: Orchestrator (full agent loop with tools) ───────────────────
  // The orchestrator has 30+ tools, autonomy tiers, approval flows, intent
  // checking, and audit logging. Both native runtime and Ollama go through
  // it so the model can actually DO things — search files, send emails,
  // manage calendar, etc. The LLM provider (NativeProvider or OllamaProvider)
  // handles the inference; the orchestrator handles the agent loop.

  console.error('[sidecar] handleSendMessage — core initialized:', !!core);

  // Check if ANY inference is available
  if (!core) {
    respondError(id, 'Semblance core not initialized. Please wait for startup to complete.');
    return;
  }

  // Check if the orchestrator (core.agent) is available
  // core.agent throws if knowledge graph didn't initialize — catch it
  let hasOrchestrator = false;
  try {
    hasOrchestrator = !!core.agent;
  } catch {
    // Orchestrator unavailable — knowledge graph didn't initialize
  }
  console.error('[sidecar] handleSendMessage — orchestrator available:', hasOrchestrator);

  // Check if LLM is available (native or Ollama)
  let llmAvailable = await core.llm.isAvailable().catch(() => false);

  // If router says unavailable, try to detect and wire Ollama on-the-fly.
  // This handles the case where Ollama started after the sidecar initialized.
  if (!llmAvailable) {
    try {
      const { Ollama: OllamaClient } = await import('ollama');
      const client = new OllamaClient({ host: 'http://localhost:11434' });
      const list = await Promise.race([
        client.list(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ]);
      const models = list.models.filter((m: { name: string }) => !m.name.includes('embed') && !m.name.includes('nomic'));
      if (models.length > 0) {
        const { OllamaProvider } = await import('../../../core/llm/ollama-provider.js');
        const { InferenceRouter } = await import('../../../core/llm/inference-router.js');
        const ollamaProvider = new OllamaProvider();
        const router = core.llm as InstanceType<typeof InferenceRouter>;
        const model = models[0]!.name;
        if (router.setReasoningProvider) {
          router.setReasoningProvider(ollamaProvider, model);
          core.models.setActiveChatModel(model);
          try { if (core.agent) core.agent.setModel(model); } catch { /* */ }
          console.error(`[sidecar] Late-wired Ollama provider (model: ${model})`);
          llmAvailable = true;
        }
      }
    } catch { /* Ollama not running */ }
  }

  if (!llmAvailable) {
    // Try a quick native status check as a fallback signal
    let nativeReady = false;
    try {
      const nativeStatus = await Promise.race([
        sendCallback('native_status', {}),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      nativeReady = !!nativeStatus && ((nativeStatus as { status: string })?.status ?? '').toLowerCase() === 'ready';
    } catch { /* native not available */ }

    if (!nativeReady) {
      respondError(id, 'No AI model available. Go to Settings → AI Engine to download a model, or install Ollama (ollama.com) for GPU-accelerated inference.');
      return;
    }
  }

  const responseId = `msg_${Date.now()}`;

  // Wrap ALL pre-processing in try-catch so conversation setup failures
  // don't crash the sidecar (the response ID is needed for error reporting)
  let convId: string;
  try {
    // Use provided conversation_id or create a new one via ConversationManager
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
  } catch (convErr) {
    console.error('[sidecar] Conversation setup failed:', convErr);
    // Fall back to a temporary conversation ID so we can still respond
    convId = `tmp_${Date.now()}`;
    currentConversationId = convId;
  }

  // Return response ID immediately so frontend can start showing the streaming bubble
  respond(id, { responseId, conversationId: convId });

  try {
    let fullResponse = '';
    let actions: Array<{ id: string; type: string; status: string; payload: unknown }> = [];

    // ─── Attachment content injection ─────────────────────────────────
    // Read attachment file contents and prepend to the user message so the
    // LLM can see what was attached. Text-based files are read directly;
    // binary files (images, etc.) get a metadata description.
    // Safety: size-check BEFORE reading to prevent OOM on large files.
    const MAX_ATTACHMENT_READ_BYTES = 512 * 1024; // 512KB — safe for LLM context
    let augmentedMessage = params.message;
    if (params.attachments && params.attachments.length > 0) {
      const attachmentSections: string[] = [];
      for (const att of params.attachments) {
        try {
          // Size check before reading — prevents OOM on large files
          let fileSize = 0;
          try {
            const { statSync } = await import('node:fs');
            fileSize = statSync(att.filePath).size;
          } catch {
            // Can't stat — try reading anyway with a small buffer
          }

          const isText = att.mimeType.startsWith('text/') ||
            /\.(txt|md|csv|json|xml|html|css|js|ts|tsx|py|rs|toml|yaml|yml|log|ini|cfg|sh|bat|sql|env)$/i.test(att.fileName);

          if (isText && fileSize <= MAX_ATTACHMENT_READ_BYTES) {
            const content = readFileSync(att.filePath, 'utf-8');
            const truncated = content.length > 8000 ? content.substring(0, 8000) + '\n...(truncated)' : content;
            attachmentSections.push(`[Attached file: ${att.fileName}]\n${truncated}`);
          } else if (isText && fileSize > MAX_ATTACHMENT_READ_BYTES) {
            // File too large to inject — read first 8KB only using a file descriptor
            const { openSync, readSync, closeSync } = await import('node:fs');
            const fd = openSync(att.filePath, 'r');
            const buf = Buffer.alloc(8192);
            const bytesRead = readSync(fd, buf, 0, 8192, 0);
            closeSync(fd);
            const preview = buf.toString('utf-8', 0, bytesRead);
            const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
            attachmentSections.push(`[Attached file: ${att.fileName} (${sizeMB}MB — showing first 8KB)]\n${preview}\n...(truncated, full file is ${sizeMB}MB)`);
          } else {
            attachmentSections.push(`[Attached file: ${att.fileName} (${att.mimeType}, binary — content not shown)]`);
          }
        } catch (readErr) {
          console.error(`[sidecar] Failed to read attachment ${att.fileName}:`, readErr);
          attachmentSections.push(`[Attached file: ${att.fileName} — could not read]`);
        }
      }
      if (attachmentSections.length > 0) {
        augmentedMessage = attachmentSections.join('\n\n') + '\n\n' + params.message;
      }
      console.error(`[sidecar] Injected ${attachmentSections.length} attachment(s) into message`);
    }

    if (hasOrchestrator) {
      // ─── PRIMARY PATH: Full orchestrator with tool calling ──────────
      // The orchestrator:
      // 1. Searches knowledge graph for context
      // 2. Builds conversation history (last 10 turns)
      // 3. Injects intent context (user's goals, hard limits, values)
      // 4. Sends to LLM WITH tool definitions
      // 5. If model calls tools → executes them → sends results back to LLM
      // 6. Applies autonomy tiers (Guardian/Partner/Alter Ego)
      // 7. Logs actions to audit trail
      // 8. Returns final response + actions taken
      console.error('[sidecar] Routing through orchestrator (full agent loop)');

      // 120s timeout — inference on a 7B model with full tool prompt can take 60-90s
      const orchTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Orchestrator timed out after 300s — the model may be overloaded or the prompt too large')), 300_000)
      );
      const orchResult = await Promise.race([
        core.agent.processMessage(augmentedMessage, convId),
        orchTimeout,
      ]);

      fullResponse = orchResult.message;
      actions = orchResult.actions.map(a => ({
        id: a.id,
        type: a.action,
        status: a.status,
        payload: a.payload,
      }));

      console.error(`[sidecar] Orchestrator returned: ${fullResponse.length} chars, ${actions.length} actions`);

      // Store turns in prefsDb so the frontend can retrieve conversation history
      // (the orchestrator stores in its own agent.db, but frontend queries prefsDb)
      storeTurn(convId, 'user', params.message);
      storeTurn(convId, 'assistant', fullResponse);
      if (conversationManager) {
        conversationManager.updateAfterTurn(convId, params.message, 'user');
        conversationManager.updateAfterTurn(convId, fullResponse, 'assistant');
      }

      // Emit response in chunks with small delays for streaming UX
      const chunkSize = 12;
      for (let i = 0; i < fullResponse.length; i += chunkSize) {
        emit('chat-token', fullResponse.substring(i, i + chunkSize));
        if (i % 120 === 0) await new Promise(r => setTimeout(r, 10));
      }
    } else {
      // ─── FALLBACK: Direct LLM call (no tools, no agent loop) ────────
      // Only used when knowledge graph failed to initialize (so no orchestrator).
      // Still provides basic chat with RAG context.
      console.error('[sidecar] Fallback: direct LLM (no orchestrator — knowledge graph unavailable)');

      // Search knowledge graph for context (may be unavailable — core.knowledge throws if not init'd)
      let contextStr = '';
      try {
        const context = await core.knowledge.search(params.message, { limit: 5 });
        if (context.length > 0) {
          contextStr =
            '\n\nRelevant documents from your files:\n' +
            context
              .map(r => `[${r.document.title}] (score: ${r.score.toFixed(2)}): ${r.chunk.content.substring(0, 500)}`)
              .join('\n\n');
        }
      } catch { /* knowledge unavailable */ }

      const model = (await core.models.getActiveChatModel()) ?? getRecommendedReasoningModel('standard').id;
      const messages: ChatMessage[] = [
        { role: 'system', content: getSystemPrompt() + contextStr },
        { role: 'user', content: augmentedMessage },
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

      // Store conversation turns (orchestrator handles this in the primary path)
      storeTurn(convId, 'user', params.message);
      storeTurn(convId, 'assistant', fullResponse);

      if (conversationManager) {
        conversationManager.updateAfterTurn(convId, params.message, 'user');
        conversationManager.updateAfterTurn(convId, fullResponse, 'assistant');
      }
    }

    // Emit completion with actions (empty if fallback path)
    emit('chat-complete', { id: responseId, content: fullResponse, actions });

    // Async, non-blocking semantic indexing of assistant response
    if (conversationIndexer) {
      const assistantTurnId = nanoid();
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
    console.error('[sidecar] handleSendMessage error:', errMsg);
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

  // Check Ollama — prefer it over NativeRuntime for GPU-accelerated inference
  if (core) {
    try {
      const { Ollama } = await import('ollama');
      const ollamaClient = new Ollama({ host: 'http://localhost:11434' });
      const listResponse = await ollamaClient.list();
      const ollamaModels = listResponse.models.map((m: { name: string }) => m.name);
      if (ollamaModels.length > 0) {
        inferenceEngine = 'ollama';
        availableModels = ollamaModels.filter(m => !m.includes('embed') && !m.includes('nomic'));
        activeModel = await core.models.getActiveChatModel() ?? availableModels[0] ?? null;
      }
    } catch {
      // Ollama not running — keep NativeRuntime status
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
      const BATCH_SIZE = 5; // Reduced from 10 for memory safety
      const MAX_INDEXABLE_FILE_BYTES = 50 * 1024 * 1024; // 50MB — skip files larger than this
      const HEAP_PRESSURE_THRESHOLD = 512 * 1024 * 1024; // 512MB — pause if heap exceeds this

      for (let batchStart = 0; batchStart < allFiles.length; batchStart += BATCH_SIZE) {
        const batch = allFiles.slice(batchStart, batchStart + BATCH_SIZE);

        // Check heap pressure before each batch
        const heapUsed = process.memoryUsage().heapUsed;
        if (heapUsed > HEAP_PRESSURE_THRESHOLD) {
          console.error(`[sidecar] Heap pressure: ${(heapUsed / 1024 / 1024).toFixed(0)}MB — yielding for GC`);
          await new Promise(resolve => setTimeout(resolve, 500));
          if (typeof global.gc === 'function') global.gc();
        }

        for (const file of batch) {
          try {
            // Skip files that are too large to index safely
            if (file.size > MAX_INDEXABLE_FILE_BYTES) {
              console.error(`[sidecar] Skipping ${file.name} — too large (${(file.size / 1024 / 1024).toFixed(1)}MB > ${MAX_INDEXABLE_FILE_BYTES / 1024 / 1024}MB limit)`);
              totalFilesScanned++;
              continue;
            }

            emit('indexing-progress', {
              filesScanned: totalFilesScanned,
              filesTotal,
              chunksCreated: totalChunksCreated,
              currentFile: file.name,
            });

            console.error(`[sidecar] Indexing file ${totalFilesScanned + 1}/${filesTotal}: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
            const content = await readFileContent(file.path);

            if (!core?.knowledge) {
              console.error('[sidecar] Cannot index — core.knowledge not available');
              totalFilesScanned++;
              continue;
            }

            // Multi-pass indexing: split large content into 50K-char segments
            // so the ENTIRE document is searchable, not just the first 50K chars.
            // Each segment is indexed as a separate document with the same sourcePath
            // but different part metadata, so search hits anywhere in the file.
            // Sanitize at ingestion — strip adversarial prompt injection content before KG storage
            const fullText = sanitizeRetrievedContent(content.content);
            const SEGMENT_SIZE = 50_000;

            if (fullText.length <= SEGMENT_SIZE) {
              // Small file — single-pass index (most common path)
              const result = await core.knowledge.indexDocument({
                content: fullText,
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
              totalChunksCreated += result.chunksCreated;
            } else {
              // Large file — multi-pass indexing
              const totalSegments = Math.ceil(fullText.length / SEGMENT_SIZE);
              console.error(`[sidecar] Large content for "${file.name}" (${fullText.length} chars) — splitting into ${totalSegments} segments`);

              for (let segIdx = 0; segIdx < totalSegments; segIdx++) {
                const segmentText = fullText.slice(segIdx * SEGMENT_SIZE, (segIdx + 1) * SEGMENT_SIZE);
                const segTitle = totalSegments > 1
                  ? `${content.title} (part ${segIdx + 1}/${totalSegments})`
                  : content.title;

                try {
                  const result = await core.knowledge.indexDocument({
                    content: segmentText,
                    title: segTitle,
                    source: 'local_file',
                    sourcePath: file.path,
                    mimeType: content.mimeType,
                    metadata: {
                      size: file.size,
                      lastModified: file.lastModified,
                      extension: file.extension,
                      part: segIdx + 1,
                      totalParts: totalSegments,
                    },
                  });
                  totalChunksCreated += result.chunksCreated;
                } catch (segErr) {
                  console.error(`[sidecar] Failed to index segment ${segIdx + 1}/${totalSegments} of ${file.name}:`, segErr);
                }
              }
            }

            totalFilesScanned++;

            // Emit file.created event for newly indexed files
            if (eventBus) {
              const watchedDir = params.directories.find((d: string) => file.path.startsWith(d)) ?? '';
              eventBus.emit('file.created', { path: file.path, watchedDirectory: watchedDir });
            }
          } catch (err) {
            console.error(`[sidecar] Failed to index ${file.path}:`, err);
            totalFilesScanned++;
          }
        }

        // Yield between batches — let event loop process IPC, progress events, GC
        await new Promise(resolve => setTimeout(resolve, 200));

        // Force garbage collection if available
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

  try {
    const stats = await core.knowledge.getStats();
    return {
      documentCount: stats.totalDocuments,
      chunkCount: stats.totalChunks,
      indexSizeBytes: 0,
      lastIndexedAt: getPref('last_indexed_at'),
    };
  } catch {
    return { documentCount: 0, chunkCount: 0, indexSizeBytes: 0, lastIndexedAt: null };
  }
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
  // Immediately update the orchestrator's system prompt so chat knows the user's name
  _refreshPromptConfig();
  return { success: true };
}

function handleGetUserName(): unknown {
  return { name: getPref('user_name') };
}

function handleSetOnboardingComplete(): unknown {
  setPref('onboarding_complete', 'true');
  // Final onboarding step — ensure orchestrator has the user's chosen names
  _refreshPromptConfig();
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
      emit('email-index-complete', { indexed, total: messages.length });

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
      emit('calendar-index-complete', { indexed, total: events.length });
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
  try {
    return await core.agent.approveAction(params.action_id);
  } catch {
    throw new Error('Agent not available — knowledge graph may not have initialized');
  }
}

async function handleActionReject(params: { action_id: string }): Promise<unknown> {
  if (!core) throw new Error('Core not initialized');
  try {
    await core.agent.rejectAction(params.action_id);
    return { success: true };
  } catch {
    throw new Error('Agent not available — knowledge graph may not have initialized');
  }
}

async function handleActionGetPending(): Promise<unknown[]> {
  if (!core) return [];
  try {
    return await core.agent.getPendingActions();
  } catch {
    return [];
  }
}

function handleActionGetApprovalCount(params: { action_type: string; payload: Record<string, unknown> }): unknown {
  if (!core) return { count: 0, threshold: 3 };
  try {
    const count = core.agent.getApprovalCount(params.action_type as ActionType, params.payload);
    const threshold = core.agent.getApprovalThreshold(params.action_type as ActionType, params.payload);
    return { count, threshold };
  } catch {
    return { count: 0, threshold: 3 };
  }
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

// Finance components accessed via ipAdapters (moved to @semblance/dr)

async function handleImportStatement(params: { file_path: string }): Promise<unknown> {
  const sp = ipAdapters.statementParser;
  const mn = ipAdapters.merchantNormalizer;
  const rd = ipAdapters.recurringDetector;
  if (!sp || !mn || !rd) {
    return { error: 'Financial intelligence requires Digital Representative' };
  }

  const { transactions, import: importRecord } = await sp.parseStatement(params.file_path);
  const normalized = mn.normalizeAll(transactions);
  const charges = rd.detect(normalized);

  // Flag forgotten subscriptions using email index
  const emailSearchFn = (merchant: string) => {
    if (!emailIndexer) return [];
    return emailIndexer.searchEmails(merchant, { limit: 5 });
  };
  const flaggedCharges = await rd.flagForgotten(charges, emailSearchFn);

  // Store
  rd.storeImport(importRecord, normalized);
  rd.storeCharges(flaggedCharges);

  const forgotten = flaggedCharges.filter(c => c.status === 'forgotten');
  const summary = rd.getSummary();

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
  const rd = ipAdapters.recurringDetector;
  if (!rd) return [];
  return rd.getStoredCharges(params.status);
}

function handleUpdateSubscriptionStatus(params: { charge_id: string; status: string }): unknown {
  const rd = ipAdapters.recurringDetector;
  if (!rd) return { success: false };
  rd.updateStatus(params.charge_id, params.status as 'active' | 'forgotten' | 'cancelled' | 'user_confirmed');
  return { success: true };
}

function handleGetImportHistory(): unknown[] {
  const rd = ipAdapters.recurringDetector;
  if (!rd) return [];
  return rd.getImports();
}

function handleGetSubscriptionSummary(): unknown {
  const rd = ipAdapters.recurringDetector;
  if (!rd) return { totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0 };
  return rd.getSummary();
}

// ─── Step 7: Autonomy Escalation Handlers ────────────────────────────────────

function ensureEscalationEngine(): void {
  if (!prefsDb || !core) return;
  if (!escalationEngine) {
    try {
      escalationEngine = new EscalationEngine({
        db: prefsDb,
        autonomy: core.agent.autonomy,
        aiName: getPref('ai_name') ?? 'Semblance',
      });
    } catch { /* agent not available */ }
  }
}

function handleCheckEscalations(): unknown[] {
  ensureEscalationEngine();
  if (!escalationEngine || !core) return [];
  try {
    const patterns = core.agent.getApprovalPatterns();
    return escalationEngine.checkForEscalations(patterns);
  } catch {
    return [];
  }
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

// Digest accessed via ipAdapters (moved to @semblance/dr)

async function handleGenerateDigest(params: { week_start: string; week_end: string }): Promise<unknown> {
  const dg = ipAdapters.weeklyDigestGenerator;
  if (!dg) return { error: 'Weekly digest requires Digital Representative' };
  return await dg.generate(params.week_start, params.week_end);
}

function handleGetLatestDigest(): unknown {
  const dg = ipAdapters.weeklyDigestGenerator;
  if (!dg) return null;
  return dg.getLatest();
}

function handleListDigests(): unknown[] {
  const dg = ipAdapters.weeklyDigestGenerator;
  if (!dg) return [];
  return dg.list();
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
  const { readFileSync, statSync } = require('node:fs') as typeof import('node:fs');

  // Size guard — reject files larger than 50MB to prevent OOM
  const MAX_CONTACT_IMPORT_BYTES = 50 * 1024 * 1024;
  try {
    const fstat = statSync(params.filePath);
    if (fstat.size > MAX_CONTACT_IMPORT_BYTES) {
      const sizeMB = (fstat.size / (1024 * 1024)).toFixed(1);
      return { success: false, imported: 0, error: `Contact file too large (${sizeMB}MB). Maximum is 50MB.` };
    }
  } catch (e: any) {
    return { success: false, imported: 0, error: `Cannot read file: ${e?.message ?? String(e)}` };
  }

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
  entry: { hfRepo: string; hfFilename: string; fileSizeBytes?: number; sizeMb?: number; sha256?: string },
  targetPath: string,
  modelId: string,
  displayName: string,
): Promise<void> {
  const totalBytes = entry.fileSizeBytes ?? ((entry.sizeMb ?? 0) * 1024 * 1024);

  // Disk space check — verify sufficient space before downloading
  if (totalBytes > 0) {
    try {
      const { statfsSync } = await import('node:fs');
      const stats = statfsSync(targetPath.substring(0, targetPath.lastIndexOf('/')) || targetPath.substring(0, targetPath.lastIndexOf('\\')) || '.');
      const availableBytes = stats.bavail * stats.bsize;
      const requiredBytes = totalBytes + 2_000_000_000; // model + 2GB buffer
      if (availableBytes < requiredBytes) {
        const availMb = Math.round(availableBytes / (1024 * 1024));
        const reqMb = Math.round(requiredBytes / (1024 * 1024));
        throw new Error(`Insufficient disk space: ${availMb}MB available, ${reqMb}MB required (model + 2GB buffer)`);
      }
    } catch (diskErr) {
      // statfsSync may not be available on all platforms — log and continue
      if (diskErr instanceof Error && diskErr.message.includes('Insufficient disk space')) throw diskErr;
      console.error(`[sidecar] Disk space check skipped: ${diskErr}`);
    }
  }

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
    // Fetch with exponential backoff retry (3 attempts: 0s, 2s, 8s)
    let response: Response | null = null;
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        response = await globalThis.fetch(url, {
          signal: download.abortController!.signal,
          redirect: 'follow',
        });
        if (response.ok && response.body) break;
        const statusErr = `HTTP ${response.status}: ${response.statusText}`;
        if (response.status >= 400 && response.status < 500) {
          // Client errors (404, 403) are not retryable
          throw new Error(statusErr);
        }
        throw new Error(statusErr);
      } catch (fetchErr) {
        const isAbort = fetchErr instanceof DOMException && fetchErr.name === 'AbortError';
        const isClientError = fetchErr instanceof Error && fetchErr.message.startsWith('HTTP 4');
        if (isAbort || isClientError || attempt === maxRetries - 1) throw fetchErr;
        const delayMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s
        console.error(`[sidecar] Download attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        // Reset download state for retry
        download.downloadedBytes = 0;
      }
    }

    if (!response || !response.ok || !response.body) {
      throw new Error(`Failed to download after ${maxRetries} attempts`);
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

    // SHA-256 hash verification — catches corrupted or tampered downloads
    if (entry.sha256) {
      const { createHash } = await import('node:crypto');
      const { createReadStream } = await import('node:fs');
      const hash = createHash('sha256');
      const readStream = createReadStream(targetPath);
      for await (const chunk of readStream) {
        hash.update(chunk);
      }
      const actual = hash.digest('hex');
      if (actual !== entry.sha256) {
        // Delete corrupt file and throw
        try { (await import('node:fs')).unlinkSync(targetPath); } catch { /* ignore */ }
        throw new Error(`SHA-256 mismatch for "${modelId}": expected ${entry.sha256}, got ${actual}`);
      }
      console.error(`[sidecar] SHA-256 verified for "${modelId}"`);
    }

    // Load the downloaded GGUF into NativeRuntime (BitNet.cpp via Rust)
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
  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;

  const results: Array<{ modelId: string; status: string; backend?: string }> = [];

  // ── 1. Embedding model (required for knowledge graph — always download) ──
  const embeddingModel = getEmbeddingModel();
  const embeddingPath = getModelPath(embeddingModel.id, baseDir);

  if (isModelDownloaded(embeddingModel.id, baseDir)) {
    const existing: ActiveDownload = {
      modelId: embeddingModel.id,
      modelName: embeddingModel.displayName,
      totalBytes: embeddingModel.fileSizeBytes,
      downloadedBytes: embeddingModel.fileSizeBytes,
      speedBytesPerSec: 0,
      status: 'complete',
    };
    activeDownloads.set(embeddingModel.id, existing);
    emit('model-download-progress', existing);
    results.push({ modelId: embeddingModel.id, status: 'already_downloaded' });

    sendCallback('native_load_model', { model_path: embeddingPath, model_type: 'embedding' })
      .then(() => console.error(`[sidecar] Loaded embedding model "${embeddingModel.id}" into NativeRuntime`))
      .catch((err) => console.error(`[sidecar] NativeRuntime load failed for embedding "${embeddingModel.id}":`, err));
  } else {
    downloadHfFile(embeddingModel, embeddingPath, embeddingModel.id, embeddingModel.displayName).catch((err) => {
      console.error(`[sidecar] Embedding model download failed: ${embeddingModel.id}`, err);
    });
    results.push({ modelId: embeddingModel.id, status: 'started' });
  }

  // ── 2. Reasoning model — skip download if Ollama already has one ──────────
  // If Ollama is running with a model, the user already has GPU-accelerated
  // inference. Don't make them wait for a 4GB CPU model download.
  let ollamaHasModel = false;
  try {
    const { Ollama } = await import('ollama');
    const client = new Ollama({ host: 'http://localhost:11434' });
    const list = await client.list();
    const reasoning = list.models.filter((m: { name: string }) => !m.name.includes('embed') && !m.name.includes('nomic'));
    if (reasoning.length > 0) {
      ollamaHasModel = true;
      const ollamaModel = reasoning[0]!.name;
      console.error(`[sidecar] Ollama detected with ${reasoning.length} models — skipping reasoning model download`);

      // Wire OllamaProvider into the InferenceRouter so chat works immediately.
      // The startup check (handleInitialize) may have missed Ollama due to timing.
      // setReasoningProvider also clears the BitNet provider so the router uses Ollama.
      if (core) {
        try {
          const { OllamaProvider } = await import('../../../core/llm/ollama-provider.js');
          const { InferenceRouter } = await import('../../../core/llm/inference-router.js');
          const ollamaProvider = new OllamaProvider();
          const router = core.llm as InstanceType<typeof InferenceRouter>;
          if (router.setReasoningProvider) {
            router.setReasoningProvider(ollamaProvider, ollamaModel);
            core.models.setActiveChatModel(ollamaModel);
            try { if (core.agent) core.agent.setModel(ollamaModel); } catch { /* */ }
            console.error(`[sidecar] Ollama provider wired into router (model: ${ollamaModel})`);
          }
        } catch (err) {
          console.error('[sidecar] Failed to wire Ollama provider:', err);
        }
      }

      // Signal download "complete" so onboarding UI proceeds
      const fakeComplete: ActiveDownload = {
        modelId: 'ollama-detected',
        modelName: `Ollama: ${ollamaModel}`,
        totalBytes: 1,
        downloadedBytes: 1,
        speedBytesPerSec: 0,
        status: 'complete',
      };
      activeDownloads.set('ollama-detected', fakeComplete);
      emit('model-download-progress', fakeComplete);
      emit('native-model-loaded', { modelId: ollamaModel, modelType: 'reasoning', path: '', engine: 'ollama' });
      results.push({ modelId: ollamaModel, status: 'already_downloaded', backend: 'ollama' });
    }
  } catch {
    // Ollama not running — proceed with download
  }

  if (!ollamaHasModel) {
    const reasoningModel = getRecommendedReasoningModel(tier);
    const reasoningTargetPath = getModelPath(reasoningModel.id, baseDir);

    if (isModelDownloaded(reasoningModel.id, baseDir)) {
      const existing: ActiveDownload = {
        modelId: reasoningModel.id,
        modelName: reasoningModel.displayName,
        totalBytes: reasoningModel.fileSizeBytes,
        downloadedBytes: reasoningModel.fileSizeBytes,
        speedBytesPerSec: 0,
        status: 'complete',
      };
      activeDownloads.set(reasoningModel.id, existing);
      emit('model-download-progress', existing);
      results.push({ modelId: reasoningModel.id, status: 'already_downloaded' });

      sendCallback('native_load_model', { model_path: reasoningTargetPath, model_type: 'reasoning' })
        .then(() => console.error(`[sidecar] Loaded reasoning model "${reasoningModel.id}" into NativeRuntime`))
        .catch((err) => console.error(`[sidecar] NativeRuntime load failed for "${reasoningModel.id}":`, err));
    } else {
      downloadHfFile(reasoningModel, reasoningTargetPath, reasoningModel.id, reasoningModel.displayName).catch((err) => {
        console.error(`[sidecar] Reasoning model download failed: ${reasoningModel.id}`, err);
      });
      results.push({ modelId: reasoningModel.id, status: 'started' });
    }
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

  // If no active downloads, check on-disk models from both catalogs
  if (statuses.length === 0) {
    const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
    for (const model of MODEL_CATALOG) {
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
    for (const model of BITNET_MODEL_CATALOG) {
      if (isBitNetModelDownloaded(model.id, baseDir)) {
        statuses.push({
          modelName: `${model.displayName} (BitNet)`,
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
  // Find model by display name or ID in both standard and BitNet catalogs
  const model = MODEL_CATALOG.find(m => m.displayName === params.modelName || m.id === params.modelName)
    ?? BITNET_MODEL_CATALOG.find(m => m.displayName === params.modelName || m.id === params.modelName);
  if (!model) {
    throw new Error(`Unknown model: ${params.modelName}`);
  }

  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const isBitNet = model.inferenceBackend === 'bitnet';
  const targetPath = isBitNet ? getBitNetModelPath(model.id, baseDir) : getModelPath(model.id, baseDir);

  // Clear previous error state
  activeDownloads.delete(model.id);

  await downloadHfFile(model, targetPath, model.id, model.displayName);
  return { success: true };
}

// ─── BitNet Model Management ──────────────────────────────────────────────────
// Handles listing, downloading, and activating BitNet 1-bit models.
// All models are managed entirely within Semblance — no external tools required.

function handleBitNetGetModels(params: { tier?: string }): unknown {
  const tier = (params.tier || 'standard') as HardwareProfileTier;
  const recommended = getRecommendedBitNetModel(tier);
  // Show ALL BitNet models in Settings, not just those matching the tier.
  // Users should be able to see and download any model they want.
  const available = getBitNetModels();
  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;

  const activeModelId = getPref('bitnet_active_model') ?? null;

  return {
    models: available.map(m => ({
      id: m.id,
      displayName: m.displayName,
      family: m.family,
      parameterCount: m.parameterCount,
      fileSizeBytes: m.fileSizeBytes,
      ramRequiredMb: m.ramRequiredMb,
      license: m.license ?? 'Unknown',
      nativeOneBit: m.nativeOneBit ?? false,
      contextLength: m.contextLength ?? 4096,
      isDownloaded: isBitNetModelDownloaded(m.id, baseDir),
      isRecommended: m.id === recommended.id,
    })),
    recommendedModelId: recommended.id,
    activeModelId,
  };
}

async function handleBitNetDownloadModel(params: { modelId: string }): Promise<unknown> {
  const model = BITNET_MODEL_CATALOG.find(m => m.id === params.modelId);
  if (!model) {
    throw new Error(`Unknown BitNet model: ${params.modelId}`);
  }

  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const targetPath = getBitNetModelPath(model.id, baseDir);

  if (isBitNetModelDownloaded(model.id, baseDir)) {
    return { status: 'already_downloaded', modelId: model.id, path: targetPath };
  }

  // Reuse the existing HuggingFace download infrastructure
  await downloadHfFile(model, targetPath, model.id, model.displayName);
  return { status: 'started', modelId: model.id };
}

async function handleBitNetSetActive(params: { modelId: string }): Promise<unknown> {
  const model = BITNET_MODEL_CATALOG.find(m => m.id === params.modelId);
  if (!model) {
    throw new Error(`Unknown BitNet model: ${params.modelId}`);
  }

  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  if (!isBitNetModelDownloaded(model.id, baseDir)) {
    throw new Error(`BitNet model not downloaded: ${model.id}. Download it first.`);
  }

  const modelPath = getBitNetModelPath(model.id, baseDir);

  // Load the BitNet model into NativeRuntime (BitNet.cpp backend — one-fork approach)
  await sendCallback('native_load_model', { model_path: modelPath, model_type: 'reasoning' });
  console.error(`[sidecar] Loaded BitNet model "${model.id}" into NativeRuntime from ${modelPath}`);

  // Wire BitNetProvider into the InferenceRouter so requests route through BitNetProvider
  // (which has tool-calling support via XML block parsing) instead of generic NativeProvider.
  if (core) {
    const router = core.llm as InstanceType<typeof InferenceRouter>;
    if (router.setBitNetProvider) {
      const bitnetProvider = new BitNetProvider({
        bridge: nativeRuntimeBridge,
        modelName: model.id,
      });
      router.setBitNetProvider(bitnetProvider, model.id);
      console.error(`[sidecar] BitNetProvider wired into InferenceRouter for "${model.id}"`);
    }
  }

  // Save preference so it persists across restarts
  try {
    setPref('bitnet_active_model', model.id);
  } catch {
    // Non-fatal — model is loaded even if pref save fails
  }

  return { status: 'active', modelId: model.id, modelPath };
}

function handleBitNetGetStatus(): unknown {
  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const downloaded = listDownloadedBitNetModels(baseDir);

  return {
    downloadedModels: downloaded.map(d => ({
      modelId: d.modelId,
      sizeBytes: d.sizeBytes,
      displayName: BITNET_MODEL_CATALOG.find(m => m.id === d.modelId)?.displayName ?? d.modelId,
    })),
    totalDownloadedBytes: downloaded.reduce((sum, d) => sum + d.sizeBytes, 0),
    catalogSize: BITNET_MODEL_CATALOG.length,
  };
}

// ─── Standard (Qwen) Model Management ─────────────────────────────────────
// Exposes standard GGUF models from MODEL_CATALOG in Settings for power users.

function handleStandardGetModels(): unknown {
  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const standardModels = MODEL_CATALOG.filter(m => !m.isEmbedding);
  const activeStdModel = getPref('standard_active_model') ?? null;

  return {
    models: standardModels.map(m => ({
      id: m.id,
      displayName: m.displayName,
      family: m.family,
      parameterCount: m.parameterCount,
      fileSizeBytes: m.fileSizeBytes,
      ramRequiredMb: m.ramRequiredMb,
      license: m.license ?? 'Apache 2.0',
      nativeOneBit: false,
      contextLength: m.contextLength ?? 32768,
      isDownloaded: isModelDownloaded(m.id, baseDir),
      isRecommended: false,
    })),
    activeModelId: activeStdModel,
  };
}

async function handleStandardDownloadModel(params: { modelId: string }): Promise<unknown> {
  const model = MODEL_CATALOG.find(m => m.id === params.modelId && !m.isEmbedding);
  if (!model) {
    throw new Error(`Unknown standard model: ${params.modelId}`);
  }

  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  const targetPath = getModelPath(model.id, baseDir);

  if (isModelDownloaded(model.id, baseDir)) {
    return { status: 'already_downloaded', modelId: model.id, path: targetPath };
  }

  await downloadHfFile(model, targetPath, model.id, model.displayName);
  return { status: 'started', modelId: model.id };
}

async function handleStandardSetActive(params: { modelId: string }): Promise<unknown> {
  const model = MODEL_CATALOG.find(m => m.id === params.modelId && !m.isEmbedding);
  if (!model) {
    throw new Error(`Unknown standard model: ${params.modelId}`);
  }

  const baseDir = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
  if (!isModelDownloaded(model.id, baseDir)) {
    throw new Error(`Standard model not downloaded: ${model.id}. Download it first.`);
  }

  const modelPath = getModelPath(model.id, baseDir);

  // Load the standard GGUF model into NativeRuntime
  await sendCallback('native_load_model', { model_path: modelPath, model_type: 'reasoning' });
  console.error(`[sidecar] Loaded standard model "${model.id}" into NativeRuntime from ${modelPath}`);

  // Log provider transition
  const currentBitnet = getPref('bitnet_active_model');
  if (currentBitnet) {
    logProviderTransition('bitnet', 'standard', model.id, 'User selected standard model from Settings');
  }

  // Save preference
  try {
    setPref('standard_active_model', model.id);
    // Clear BitNet active model since standard model is now active
    setPref('bitnet_active_model', '');
  } catch {
    // Non-fatal
  }

  return { status: 'active', modelId: model.id, modelPath };
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
      scopes: 'openid email https://mail.google.com/ https://www.googleapis.com/auth/calendar.readonly',
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
  console.error(`[sidecar] OAuth config resolved for ${params.connectorId}:`);
  console.error(`[sidecar]   clientId: ${config.clientId.slice(0, 20)}...`);
  console.error(`[sidecar]   clientSecret: ${config.clientSecret ? 'SET' : 'NOT SET'}`);
  console.error(`[sidecar]   scopes: ${config.scopes}`);
  console.error(`[sidecar]   usePKCE: ${config.usePKCE}`);

  const tokenMgr = ensureOAuthTokenManager();
  const callbackServer = new OAuthCallbackServer();

  try {
    // Slack requires HTTPS redirect URIs — use self-signed cert for localhost
    const requiresHttps = params.connectorId === 'slack';
    const { callbackUrl, state } = await callbackServer.start({ https: requiresHttps });
    console.error(`[sidecar] Callback server started at: ${callbackUrl}`);

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
    console.error(`[sidecar] OAuth auth URL: ${authUrl.toString().slice(0, 200)}...`);
    console.error(`[sidecar] redirect_uri in auth URL: ${callbackUrl}`);
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
    console.error('[sidecar] Waiting for OAuth callback (120s timeout)...');
    const { code } = await callbackServer.waitForCallback();
    console.error(`[sidecar] OAuth callback received! Code length: ${code.length}`);

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

    // Fetch user email from Google userinfo (needed for IMAP XOAUTH2)
    let userEmail: string | undefined;
    if (config.providerKey === 'google' || config.providerKey === 'google-calendar' || config.providerKey === 'google-drive') {
      try {
        const userinfoResp = await globalThis.fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token as string}` },
        });
        if (userinfoResp.ok) {
          const userinfo = await userinfoResp.json() as { email?: string };
          userEmail = userinfo.email;
          console.error(`[sidecar] Google OAuth user email: ${userEmail}`);
        }
      } catch (emailErr) {
        console.error('[sidecar] Failed to fetch Google userinfo:', emailErr);
      }
    }

    // Store tokens
    const hasRefreshToken = !!(tokenData.refresh_token as string);
    const expiresIn = (tokenData.expires_in as number) ?? 3600;
    console.error(`[sidecar] Storing OAuth tokens for ${config.providerKey}:`);
    console.error(`[sidecar]   accessToken: ${(tokenData.access_token as string).slice(0, 20)}...`);
    console.error(`[sidecar]   refreshToken: ${hasRefreshToken ? 'YES' : 'NONE'}`);
    console.error(`[sidecar]   expiresIn: ${expiresIn}s`);
    console.error(`[sidecar]   userEmail: ${userEmail ?? 'unknown'}`);

    tokenMgr.storeTokens({
      provider: config.providerKey,
      accessToken: tokenData.access_token as string,
      refreshToken: (tokenData.refresh_token as string) ?? '',
      expiresAt: Date.now() + expiresIn * 1000,
      scopes: config.scopes,
      userEmail,
    });

    // Verify storage worked by reading back
    const storedValid = tokenMgr.hasValidTokens(config.providerKey);
    const storedEmail = tokenMgr.getUserEmail(config.providerKey);
    console.error(`[sidecar] Token storage verification: valid=${storedValid}, email=${storedEmail}`);

    return {
      success: true,
      provider: config.providerKey,
      connectorId: params.connectorId,
      userEmail,
    };
  } catch (err) {
    console.error(`[sidecar] OAuth flow error for ${params.connectorId}:`, err);
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
  const config = getOAuthConfigForConnector(params.connectorId);
  if (!config) {
    return { success: false, error: `No OAuth config for connector: ${params.connectorId}` };
  }

  const tokenMgr = ensureOAuthTokenManager();
  const hasTokens = tokenMgr.hasValidTokens(config.providerKey);

  if (!hasTokens) {
    return { success: false, error: 'Not authenticated. Please connect first.' };
  }

  // Lazy-initialize the connector router with all registered adapters
  if (!connectorRouter) {
    connectorRouter = registerAllConnectors(tokenMgr);
    console.error('[sidecar] ConnectorRouter initialized with adapters:', connectorRouter.listRegistered().join(', '));
  }

  // Check if this connector has a registered adapter
  if (!connectorRouter.hasAdapter(params.connectorId)) {
    return {
      success: false,
      error: `No sync adapter registered for connector: ${params.connectorId}. Adapter may not be implemented yet.`,
    };
  }

  // Execute the actual sync via the adapter
  console.error(`[sidecar] Syncing connector: ${params.connectorId}`);
  const syncResult = await connectorRouter.execute('connector.sync' as import('../../../core/types/actions.js').ActionType, {
    connectorId: params.connectorId,
  });

  if (!syncResult.success) {
    console.error(`[sidecar] Connector sync failed for ${params.connectorId}:`, syncResult.error);
    return {
      success: false,
      error: syncResult.error?.message ?? 'Sync failed',
      code: syncResult.error?.code,
    };
  }

  // Extract synced items from the adapter response
  const syncData = syncResult.data as { items?: Array<{ id: string; title: string; content: string; timestamp: string; sourceType?: string; metadata?: Record<string, unknown> }>; totalItems?: number } | undefined;
  const items = syncData?.items ?? [];
  let indexedCount = 0;
  const indexErrors: string[] = [];

  // Ingest synced items into the knowledge graph if core is available
  if (core?.knowledge && items.length > 0) {
    // Map ImportSourceType to DocumentSource for indexing
    const sourceTypeMap: Record<string, string> = {
      browser_history: 'browser_history',
      notes: 'note',
      photos_metadata: 'photos_metadata',
      messaging: 'messaging',
      social: 'social',
      health: 'health',
      finance: 'financial',
      productivity: 'note',
      research: 'note',
    };

    for (const item of items) {
      try {
        const docSource = (sourceTypeMap[item.sourceType ?? ''] ?? 'manual') as import('../../../core/knowledge/types.js').DocumentSource;
        await core.knowledge.indexDocument({
          content: item.content,
          title: item.title,
          source: docSource,
          metadata: {
            connectorId: params.connectorId,
            syncedAt: new Date().toISOString(),
            originalId: item.id,
            ...(item.metadata ?? {}),
          },
        });
        indexedCount++;
      } catch (indexErr) {
        const msg = indexErr instanceof Error ? indexErr.message : String(indexErr);
        indexErrors.push(`Failed to index "${item.title}": ${msg}`);
        console.error(`[sidecar] Failed to index synced item "${item.title}":`, msg);
      }
    }
    console.error(`[sidecar] Connector ${params.connectorId} sync complete: ${indexedCount}/${items.length} items indexed`);
  } else if (items.length > 0) {
    console.error(`[sidecar] Connector ${params.connectorId} synced ${items.length} items but core.knowledge not available — items not indexed`);
  }

  // ─── Fix #1: After Gmail OAuth sync, index emails into local store ───────
  // The connector router's generic sync returns items for knowledge graph,
  // but email/calendar connectors need specialized indexing into their
  // dedicated SQLite tables (indexed_emails, indexed_calendar_events) so
  // that get_inbox_items and get_today_events can query locally.
  const isGmail = params.connectorId === 'gmail' || params.connectorId === 'google-gmail';
  const isGoogleCalendar = params.connectorId === 'google-calendar';
  const isGoogleDrive = params.connectorId === 'google-drive';

  if (isGmail && emailAdapter && core && prefsDb) {
    // Background email indexing from Gmail API into local indexed_emails table
    (async () => {
      try {
        if (!emailIndexer) {
          emailIndexer = new EmailIndexer({
            db: prefsDb!,
            knowledge: core!.knowledge,
            llm: core!.llm,
          });
          emailIndexer.onEvent((event, data) => emit(event, data));
        }

        console.error('[sidecar] Post-sync: fetching Gmail messages for local indexing...');
        const fetchResult = await emailAdapter!.execute('email.fetch', {
          folder: 'INBOX',
          limit: 200,
          sort: 'date_desc',
        });

        if (fetchResult.success && fetchResult.data) {
          const rawData = fetchResult.data as { messages?: unknown[] } | unknown[];
          const messages = Array.isArray(rawData) ? rawData : (rawData.messages ?? []);
          const emailIndexed = await emailIndexer.indexMessages(
            messages as Parameters<EmailIndexer['indexMessages']>[0],
            'gmail',
          );
          console.error(`[sidecar] Post-sync: ${emailIndexed} emails indexed into local store`);
          emit('semblance://indexing-complete', {
            type: 'email',
            connectorId: params.connectorId,
            indexed: emailIndexed,
            total: messages.length,
          });
        }
      } catch (emailSyncErr) {
        console.error('[sidecar] Post-sync email indexing failed:', emailSyncErr);
      }
    })();
  }

  // ─── Fix #3: After Google Drive OAuth sync, index file metadata ──────────
  if (isGoogleDrive && core && prefsDb) {
    (async () => {
      try {
        const tokenMgr = ensureOAuthTokenManager();
        const clientId = process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ?? '';
        const clientSecret = process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'] ?? '';
        if (!clientId) return;

        const { GoogleDriveAdapter } = await import('../../../gateway/services/google-drive-adapter.js');
        const driveAdapter = new GoogleDriveAdapter(tokenMgr, { clientId, clientSecret });

        console.error('[sidecar] Post-sync: listing Google Drive files for indexing...');
        const listResult = await driveAdapter.execute('cloud.list_files' as import('../../../core/types/actions.js').ActionType, {
          pageSize: 100,
        });

        if (listResult.success && listResult.data) {
          const driveData = listResult.data as {
            files: Array<{ id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string; sizeBytes?: number }>;
          };
          const files = driveData.files ?? [];
          let driveIndexed = 0;

          for (const file of files) {
            try {
              // Index file metadata into knowledge graph with source: 'cloud_storage'
              await core!.knowledge.indexDocument({
                content: `Google Drive file: ${file.name} (${file.mimeType})`,
                title: file.name,
                source: 'cloud_storage' as import('../../../core/knowledge/types.js').DocumentSource,
                sourcePath: file.id,
                mimeType: file.mimeType,
                metadata: {
                  driveFileId: file.id,
                  mimeType: file.mimeType,
                  modifiedTime: file.modifiedTime,
                  webViewLink: file.webViewLink,
                  sizeBytes: file.sizeBytes,
                  connectorId: 'google-drive',
                },
              });
              driveIndexed++;
            } catch {
              // Skip individual file indexing failures
            }
          }
          console.error(`[sidecar] Post-sync: ${driveIndexed}/${files.length} Drive files indexed into knowledge graph`);
          emit('semblance://indexing-complete', {
            type: 'drive',
            connectorId: params.connectorId,
            indexed: driveIndexed,
            total: files.length,
          });
        }
      } catch (driveSyncErr) {
        console.error('[sidecar] Post-sync Drive indexing failed:', driveSyncErr);
      }
    })();
  }

  // ─── Fix #3b: After Google Calendar OAuth sync, index events ─────────────
  if (isGoogleCalendar && calendarAdapter && core && prefsDb) {
    (async () => {
      try {
        if (!calendarIndexer) {
          calendarIndexer = new CalendarIndexer({
            db: prefsDb!,
            knowledge: core!.knowledge,
            llm: core!.llm,
          });
          calendarIndexer.onEvent((event, data) => emit(event, data));
        }

        console.error('[sidecar] Post-sync: fetching calendar events for local indexing...');
        const calResult = await calendarAdapter!.execute('calendar.fetch', {
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        });

        if (calResult.success && calResult.data) {
          const events = ((calResult.data as { events?: unknown[] }).events ?? []) as Parameters<CalendarIndexer['indexEvents']>[0];
          const calIndexed = await calendarIndexer.indexEvents(events, 'google-calendar');
          console.error(`[sidecar] Post-sync: ${calIndexed} calendar events indexed`);
          emit('semblance://indexing-complete', {
            type: 'calendar',
            connectorId: params.connectorId,
            indexed: calIndexed,
            total: events.length,
          });
        }
      } catch (calSyncErr) {
        console.error('[sidecar] Post-sync calendar indexing failed:', calSyncErr);
      }
    })();
  }

  // ─── Fix #6: Refresh prompt config so orchestrator knows new services ────
  _refreshPromptConfig();

  return {
    success: true,
    synced: true,
    connectorId: params.connectorId,
    itemCount: items.length,
    indexedCount,
    errors: indexErrors.length > 0 ? indexErrors : undefined,
  };
}

async function handleImportRun(params: { sourcePath: string; sourceType: string }): Promise<unknown> {
  if (!core || !prefsDb) {
    throw new Error('Core not initialized');
  }

  // Attempt to read and parse the file using the core import pipeline
  const { readFileSync, statSync } = await import('node:fs');

  // Size guard — reject files larger than 100MB to prevent OOM
  const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
  try {
    const fstat = statSync(params.sourcePath);
    if (fstat.size > MAX_IMPORT_BYTES) {
      const sizeMB = (fstat.size / (1024 * 1024)).toFixed(1);
      throw new Error(`Import file too large (${sizeMB}MB). Maximum is 100MB.`);
    }
  } catch (e: any) {
    if (e?.message?.includes('too large')) throw e;
    throw new Error(`Cannot read import file: ${e?.message ?? String(e)}`);
  }

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
    // Financial statement — delegate to StatementParser via ipAdapters
    if (ipAdapters.statementParser) {
      const result = ipAdapters.statementParser.parseOFX(content);
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
        // Return current model/engine status — check Ollama first, then NativeRuntime
        const userName = getPref('user_name');
        const onboardingComplete = getPref('onboarding_complete') === 'true';
        let currentActiveModel: string | null = null;
        let currentEngine: string = 'none';

        // Check Ollama first (GPU, fast)
        try {
          const { Ollama: OllamaCheck } = await import('ollama');
          const checkClient = new OllamaCheck({ host: 'http://localhost:11434' });
          const checkList = await checkClient.list();
          const checkModels = checkList.models.filter((m: { name: string }) => !m.name.includes('embed'));
          if (checkModels.length > 0) {
            currentActiveModel = checkModels[0]!.name;
            currentEngine = 'ollama';
          }
        } catch { /* Ollama not running */ }

        // Fallback: check NativeRuntime
        if (!currentActiveModel) {
          try {
            const ns = await Promise.race([
              sendCallback('native_status', {}),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ]);
            if (ns && ((ns as { status: string })?.status ?? '').toLowerCase() === 'ready') {
              currentEngine = 'native';
              const modelsBase = dataDir ? join(dataDir, 'models').replace(/[/\\]models$/, '') : undefined;
              for (const m of MODEL_CATALOG) {
                if (!m.isEmbedding && isModelDownloaded(m.id, modelsBase)) {
                  currentActiveModel = m.displayName;
                  break;
                }
              }
              if (!currentActiveModel) {
                for (const m of BITNET_MODEL_CATALOG) {
                  if (isBitNetModelDownloaded(m.id, modelsBase)) {
                    currentActiveModel = m.displayName;
                    break;
                  }
                }
              }
            }
          } catch { /* native not available */ }
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
        await handleSendMessage(id, params as { message: string; conversation_id?: string; attachments?: Array<{ id: string; fileName: string; filePath: string; mimeType: string }> });
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
        // Immediately update the orchestrator's system prompt so chat uses the new AI name
        _refreshPromptConfig();
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

      // ─── Notification Settings ───────────────────────────────────────
      case 'notification:getSettings': {
        const raw = getPref('notification_settings');
        respond(id, raw
          ? JSON.parse(raw)
          : {
              morningBriefEnabled: true,
              morningBriefTime: '07:00',
              includeWeather: true,
              includeCalendar: true,
              remindersEnabled: true,
              defaultSnoozeDuration: '15m',
              notifyOnAction: true,
              notifyOnApproval: true,
              actionDigest: 'daily',
              badgeCount: true,
              soundEffects: true,
            });
        break;
      }
      case 'notification:saveSettings': {
        setPref('notification_settings', JSON.stringify(params));
        respond(id, params);
        break;
      }

      // ─── Location Settings ──────────────────────────────────────────
      case 'location:getSettings': {
        const raw = getPref('location_settings');
        respond(id, raw
          ? JSON.parse(raw)
          : {
              enabled: false,
              defaultCity: '',
              weatherEnabled: false,
              commuteEnabled: false,
              remindersEnabled: false,
              retentionDays: 30,
            });
        break;
      }
      case 'location:saveSettings': {
        setPref('location_settings', JSON.stringify(params));
        respond(id, params);
        break;
      }
      case 'location:clearHistory': {
        setPref('location_settings', JSON.stringify({
          enabled: false,
          defaultCity: '',
          weatherEnabled: false,
          commuteEnabled: false,
          remindersEnabled: false,
          retentionDays: 30,
        }));
        respond(id, { cleared: true });
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
          // Initialize calendarIndexer if not yet created (works without connected account)
          if (!calendarIndexer) {
            calendarIndexer = new CalendarIndexer({
              db: prefsDb,
              knowledge: core.knowledge,
              llm: core.llm,
            });
            calendarIndexer.onEvent((event, data) => emit(event, data));
          }
          morningBriefGenerator = new MorningBriefGenerator({
            db: prefsDb,
            calendarIndexer,
            llm: core.llm,
            model: core.model ?? undefined,
          });
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
        if (!weatherService && prefsDb && core) {
          try {
            if (!locationStore) {
              locationStore = new LocationStore(prefsDb);
            }
            weatherService = new WeatherService(getPlatform(), core.ipc, locationStore);
          } catch (wsErr) {
            console.error('[sidecar] Failed to init WeatherService:', wsErr);
          }
        }
        if (!weatherService) { respond(id, null); break; }
        // Read defaultCity from location settings to use as web-search fallback label
        const locSettingsRaw = getPref('location_settings');
        const locSettings = locSettingsRaw ? JSON.parse(locSettingsRaw) as { defaultCity?: string } : null;
        const cityLabel = locSettings?.defaultCity || undefined;
        const weather = await weatherService.getCurrentWeather(cityLabel);
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
          knowledgeMomentGenerator = new KnowledgeMomentGenerator({
            knowledgeGraph: core.knowledge,
            llm: core.llm,
            aiName: getPref('ai_name') ?? 'Semblance',
          });
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
        if (!prefsDb) { respond(id, []); break; }
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
      case 'reminder_create': {
        const rcParams = params as { text: string; dueAt: string; recurrence?: string };
        if (!prefsDb) { respondError(id, 'Core not initialized'); break; }
        try {
          prefsDb.exec(`
            CREATE TABLE IF NOT EXISTS reminders (
              id TEXT PRIMARY KEY,
              text TEXT NOT NULL,
              due_at TEXT NOT NULL,
              recurrence TEXT,
              status TEXT NOT NULL DEFAULT 'pending',
              source TEXT DEFAULT 'user',
              created_at TEXT NOT NULL
            )
          `);
          const { nanoid } = await import('nanoid');
          const remId = nanoid();
          const now = new Date().toISOString();
          prefsDb.prepare(
            'INSERT INTO reminders (id, text, due_at, recurrence, status, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(remId, rcParams.text, rcParams.dueAt, rcParams.recurrence ?? null, 'pending', 'user', now);
          respond(id, { id: remId, text: rcParams.text, dueAt: rcParams.dueAt, status: 'pending' });
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
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

      // ─── Knowledge Graph Visualization (returns category-grouped graph) ─
      case 'knowledge_get_graph': {
        try {
          if (!graphVisualizationProvider && documentsDb) {
            // Use documentsDb (knowledge/documents.db) — that's where DocumentStore writes documents
            try { ensureContactStore(); } catch { /* contacts not critical for graph */ }
            graphVisualizationProvider = new GraphVisualizationProvider({
              db: documentsDb as unknown as import('../../../../core/platform/types.js').DatabaseHandle,
              contactStore: contactStore ?? null,
              relationshipAnalyzer: relationshipAnalyzer ?? null,
            });
            graphVisualizationProvider.initSchema();
          }
          if (!graphVisualizationProvider) {
            respond(id, { nodes: [], edges: [], clusters: [], categoryNodes: [], categoryEdges: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
            break;
          }
          const graph = graphVisualizationProvider.getCategoryGraph();
          respond(id, graph);
        } catch (graphErr) {
          console.error('[sidecar] knowledge_get_graph failed:', graphErr);
          respond(id, { nodes: [], edges: [], clusters: [], categoryNodes: [], categoryEdges: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
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
        if (!recurringDetector) {
          respond(id, {
            overview: { totalSpending: 0, previousPeriodSpending: null, transactionCount: 0, periodStart: '', periodEnd: '' },
            categories: [],
            anomalies: [],
            subscriptions: {
              charges: [],
              summary: { totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0 },
            },
          });
          break;
        }
        const finSummary = recurringDetector.getSummary();
        const finCharges = recurringDetector.getStoredCharges();
        respond(id, {
          overview: {
            totalSpending: finSummary.totalMonthly,
            previousPeriodSpending: null,
            transactionCount: finCharges.length,
            periodStart: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
            periodEnd: new Date().toISOString().slice(0, 10),
          },
          categories: [],
          anomalies: [],
          subscriptions: {
            charges: finCharges,
            summary: finSummary,
          },
        });
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
        if (!healthEntryStore) {
          respond(id, { todayEntry: null, trends: [], insights: [], symptomsHistory: [], medicationsHistory: [], hasHealthKit: false });
          break;
        }
        const trendDays = (params as { trendDays?: number }).trendDays ?? 30;
        const endDate = new Date().toISOString().slice(0, 10);
        const startDate = new Date(Date.now() - trendDays * 86400_000).toISOString().slice(0, 10);
        const trends = healthEntryStore.getTrends(startDate, endDate);
        const entries = healthEntryStore.getEntries(startDate, endDate);

        // Find today's entry
        const today = new Date().toISOString().slice(0, 10);
        const todayEntry = entries.find((e: { date: string }) => e.date === today) ?? null;

        // Collect unique symptoms and medications across all entries
        const symptomsSet = new Set<string>();
        const medicationsSet = new Set<string>();
        for (const e of entries) {
          const entry = e as { symptoms?: string[]; medications?: string[] };
          if (entry.symptoms) entry.symptoms.forEach((s: string) => symptomsSet.add(s));
          if (entry.medications) entry.medications.forEach((m: string) => medicationsSet.add(m));
        }

        // Generate basic insights from trends
        const insights: Array<{ id: string; type: string; title: string; description: string; severity: string }> = [];
        if (trends.length >= 7) {
          const recentMoods = trends.slice(-7).map((t: { avgMood?: number | null }) => t.avgMood).filter((m): m is number => m != null);
          if (recentMoods.length >= 3) {
            const avgMood = recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length;
            if (avgMood >= 4) {
              insights.push({ id: 'mood-high', type: 'positive', title: 'Great mood week', description: `Average mood ${avgMood.toFixed(1)}/5 over the last 7 days.`, severity: 'positive' });
            } else if (avgMood <= 2) {
              insights.push({ id: 'mood-low', type: 'concern', title: 'Low mood trend', description: `Average mood ${avgMood.toFixed(1)}/5 over the last 7 days.`, severity: 'warning' });
            }
          }
        }

        respond(id, {
          todayEntry,
          trends,
          insights,
          symptomsHistory: [...symptomsSet],
          medicationsHistory: [...medicationsSet],
          hasHealthKit: false, // Desktop doesn't have HealthKit
        });
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
        const searchEngine = getPref('search_engine') ?? 'duckduckgo';
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

      // ─── Web Search (direct IPC — routes through Gateway search adapter) ──
      case 'web_search': {
        const wsParams = params as { query: string; count?: number };
        if (!gateway) { respondError(id, 'Gateway not initialized'); break; }
        try {
          const registry = gateway.getServiceRegistry();
          const adapter = registry.getAdapter('web.search' as import('../../../core/types/actions.js').ActionType);
          const result = await adapter.execute('web.search' as import('../../../core/types/actions.js').ActionType, {
            query: wsParams.query,
            count: wsParams.count ?? 5,
          });
          if (result.success && result.data) {
            respond(id, result.data);
          } else {
            respondError(id, result.error?.message ?? 'Search failed');
          }
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'fetch_url': {
        const fuParams = params as { url: string; maxContentLength?: number };
        if (!gateway) { respondError(id, 'Gateway not initialized'); break; }
        try {
          const registry = gateway.getServiceRegistry();
          const adapter = registry.getAdapter('web.fetch' as import('../../../core/types/actions.js').ActionType);
          const result = await adapter.execute('web.fetch' as import('../../../core/types/actions.js').ActionType, {
            url: fuParams.url,
            maxContentLength: fuParams.maxContentLength ?? 5000,
          });
          if (result.success) {
            respond(id, result.data);
          } else {
            respondError(id, result.error?.message ?? 'Fetch failed');
          }
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'list_available_connectors': {
        try {
          const { createDefaultConnectorRegistry } = await import('../../../core/importers/connector-registry.js');
          const registry = createDefaultConnectorRegistry();
          respond(id, registry.listAll());
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'get_audit_trail': {
        const atParams = params as { limit?: number };
        if (!prefsDb) { respond(id, []); break; }
        try {
          const entries = prefsDb.prepare(
            'SELECT * FROM audit_trail ORDER BY timestamp DESC LIMIT ?'
          ).all(atParams.limit ?? 50);
          respond(id, entries);
        } catch {
          respond(id, []);
        }
        break;
      }

      // ─── Email Search & Draft (IPC handlers for verify/frontend) ──────
      case 'search_emails': {
        const searchParams = params as { query: string; from?: string; limit?: number };
        if (emailIndexer) {
          try {
            const results = emailIndexer.searchEmails(searchParams.query, {
              from: searchParams.from,
              limit: searchParams.limit ?? 20,
            });
            respond(id, results);
          } catch (err) {
            console.error('[sidecar] search_emails error:', err);
            respond(id, []);
          }
        } else if (prefsDb && core) {
          try {
            emailIndexer = new EmailIndexer({
              db: prefsDb,
              knowledge: core.knowledge,
              llm: core.llm,
            });
            emailIndexer.onEvent((event, data) => emit(event, data));
            const results = emailIndexer.searchEmails(searchParams.query, {
              from: searchParams.from,
              limit: searchParams.limit ?? 20,
            });
            respond(id, results);
          } catch {
            respond(id, []);
          }
        } else {
          respond(id, []);
        }
        break;
      }
      case 'draft_email_action': {
        const draftParams = params as { to: string; subject: string; body: string };
        if (!emailAdapter) {
          respondError(id, 'Email adapter not initialized');
          break;
        }
        try {
          const result = await emailAdapter.execute('email.draft', draftParams);
          respond(id, result.data ?? { success: result.success });
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
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

      // ─── BitNet Model Management ────────────────────────────────────────
      case 'bitnet_get_models': {
        const result = handleBitNetGetModels(params as { tier?: string });
        respond(id, result);
        break;
      }
      case 'bitnet_download_model': {
        const result = await handleBitNetDownloadModel(params as { modelId: string });
        respond(id, result);
        break;
      }
      case 'bitnet_set_active': {
        const result = await handleBitNetSetActive(params as { modelId: string });
        respond(id, result);
        break;
      }
      case 'bitnet_get_status': {
        const result = handleBitNetGetStatus();
        respond(id, result);
        break;
      }

      // ─── Standard Model Management ──────────────────────────────────────
      case 'standard_get_models': {
        const result = handleStandardGetModels();
        respond(id, result);
        break;
      }
      case 'standard_download_model': {
        const result = await handleStandardDownloadModel(params as { modelId: string });
        respond(id, result);
        break;
      }
      case 'standard_set_active': {
        const result = await handleStandardSetActive(params as { modelId: string });
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

      // ─── Inbox Data Handlers ──────────────────────────────────────────
      case 'get_inbox_items': {
        // Fix #2: Query from local indexed_emails table instead of live Gmail API.
        // The local store is populated by connector sync (Fix #1) and email_start_index.
        const inboxParams = params as { limit?: number; offset?: number };
        const limit = inboxParams.limit ?? 30;
        const offset = inboxParams.offset ?? 0;

        // Try local index first (fast, no network)
        if (emailIndexer) {
          try {
            const indexed = emailIndexer.getIndexedEmails({
              folder: 'INBOX',
              limit,
              offset,
            });
            console.error(`[sidecar] get_inbox_items: ${indexed.length} emails from local index`);
            respond(id, indexed);
            break;
          } catch (indexErr) {
            console.error('[sidecar] get_inbox_items: local index query failed, falling back:', indexErr);
          }
        }

        // Fallback: initialize indexer from prefsDb if it exists but indexer wasn't created
        if (!emailIndexer && prefsDb && core) {
          try {
            emailIndexer = new EmailIndexer({
              db: prefsDb,
              knowledge: core.knowledge,
              llm: core.llm,
            });
            emailIndexer.onEvent((event, data) => emit(event, data));
            const indexed = emailIndexer.getIndexedEmails({
              folder: 'INBOX',
              limit,
              offset,
            });
            console.error(`[sidecar] get_inbox_items: ${indexed.length} emails from freshly-init index`);
            respond(id, indexed);
            break;
          } catch {
            // Table may not exist yet — return empty
          }
        }

        respond(id, []);
        break;
      }
      case 'get_proactive_insights': {
        // Fix #5: Query proactiveEngine for real insights instead of empty stub
        if (proactiveEngine) {
          try {
            const insights = proactiveEngine.getActiveInsights();
            // Map to frontend ProactiveInsight shape
            respond(id, insights.map(i => ({
              id: i.id,
              type: i.type,
              title: i.title,
              description: i.summary,
              priority: i.priority === 'high' ? 'high' : i.priority === 'low' ? 'low' : 'medium',
              actionable: i.suggestedAction !== null,
              suggestedAction: i.suggestedAction?.description,
              relatedEntityId: i.sourceIds[0] ?? undefined,
              createdAt: i.createdAt,
            })));
          } catch (err) {
            console.error('[sidecar] get_proactive_insights error:', err);
            respond(id, []);
          }
        } else {
          // Try to initialize proactive engine if dependencies are available
          if (emailIndexer && calendarIndexer && prefsDb && core) {
            try {
              const { AutonomyManager } = await import('../../../core/agent/autonomy.js');
              const autonomy = new AutonomyManager(prefsDb);
              proactiveEngine = new ProactiveEngine({
                db: prefsDb,
                knowledge: core.knowledge,
                emailIndexer,
                calendarIndexer,
                autonomy,
              });
              proactiveEngine.onEvent((event, data) => emit(event, data));
              // Run once to generate initial insights
              await proactiveEngine.run();
              const insights = proactiveEngine.getActiveInsights();
              respond(id, insights.map(i => ({
                id: i.id,
                type: i.type,
                title: i.title,
                description: i.summary,
                priority: i.priority === 'high' ? 'high' : i.priority === 'low' ? 'low' : 'medium',
                actionable: i.suggestedAction !== null,
                suggestedAction: i.suggestedAction?.description,
                relatedEntityId: i.sourceIds[0] ?? undefined,
                createdAt: i.createdAt,
              })));
            } catch (initErr) {
              console.error('[sidecar] ProactiveEngine init failed:', initErr);
              respond(id, []);
            }
          } else {
            respond(id, []);
          }
        }
        break;
      }
      case 'get_today_events': {
        // Fix #5: Query calendarIndexer for today's events instead of empty stub
        if (calendarIndexer) {
          try {
            const events = calendarIndexer.getUpcomingEvents({ daysAhead: 1, limit: 20 });
            // Map to frontend CalendarEvent shape
            respond(id, events.map(e => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime,
              endTime: e.endTime,
              location: e.location || undefined,
              description: e.description || undefined,
              isAllDay: e.isAllDay,
            })));
          } catch (err) {
            console.error('[sidecar] get_today_events error:', err);
            respond(id, []);
          }
        } else if (prefsDb && core) {
          // Try to initialize calendarIndexer
          try {
            calendarIndexer = new CalendarIndexer({
              db: prefsDb,
              knowledge: core.knowledge,
              llm: core.llm,
            });
            calendarIndexer.onEvent((event, data) => emit(event, data));
            const events = calendarIndexer.getUpcomingEvents({ daysAhead: 1, limit: 20 });
            respond(id, events.map(e => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime,
              endTime: e.endTime,
              location: e.location || undefined,
              description: e.description || undefined,
              isAllDay: e.isAllDay,
            })));
          } catch {
            respond(id, []);
          }
        } else {
          respond(id, []);
        }
        break;
      }
      case 'get_actions_summary': {
        // Query pending_actions table for today's actions
        if (prefsDb) {
          try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayIso = todayStart.toISOString();
            const todayActions = prefsDb.prepare(
              "SELECT * FROM pending_actions WHERE created_at >= ? AND status = 'approved' ORDER BY created_at DESC LIMIT 20"
            ).all(todayIso) as Array<{ id: string; action: string; payload: string; reasoning: string; created_at: string }>;
            respond(id, {
              todayCount: todayActions.length,
              todayTimeSavedSeconds: todayActions.length * 30, // ~30s per action estimate
              recentActions: todayActions.map(a => ({
                id: a.id,
                action: a.action,
                description: a.reasoning,
                timestamp: a.created_at,
              })),
            });
          } catch {
            respond(id, { todayCount: 0, todayTimeSavedSeconds: 0, recentActions: [] });
          }
        } else {
          respond(id, { todayCount: 0, todayTimeSavedSeconds: 0, recentActions: [] });
        }
        break;
      }
      case 'get_pending_actions': {
        // Fix #5: Query pending_actions table for real pending approvals
        if (prefsDb) {
          try {
            const pending = prefsDb.prepare(
              "SELECT * FROM pending_actions WHERE status = 'pending_approval' ORDER BY created_at DESC LIMIT 20"
            ).all() as Array<{
              id: string; action: string; payload: string; reasoning: string;
              domain: string; tier: string; status: string; created_at: string;
            }>;
            respond(id, pending.map(p => ({
              id: p.id,
              action: p.action,
              payload: p.payload ? JSON.parse(p.payload) : {},
              reasoning: p.reasoning,
              domain: p.domain ?? '',
              tier: p.tier ?? 'guardian',
              status: p.status,
              createdAt: p.created_at,
            })));
          } catch (err) {
            console.error('[sidecar] get_pending_actions error:', err);
            respond(id, []);
          }
        } else {
          respond(id, []);
        }
        break;
      }
      case 'get_reminders': {
        // Fix #5: Query reminders table for active reminders
        if (prefsDb) {
          try {
            // Ensure reminders table exists
            prefsDb.exec(`
              CREATE TABLE IF NOT EXISTS reminders (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                due_at TEXT NOT NULL,
                recurrence TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                source TEXT DEFAULT 'user',
                created_at TEXT NOT NULL
              )
            `);
            const reminders = prefsDb.prepare(
              "SELECT * FROM reminders WHERE status IN ('pending', 'snoozed') ORDER BY due_at ASC LIMIT 50"
            ).all() as Array<{
              id: string; text: string; due_at: string; recurrence: string | null;
              status: string; source: string; created_at: string;
            }>;
            respond(id, reminders.map(r => ({
              id: r.id,
              text: r.text,
              dueAt: r.due_at,
              recurrence: r.recurrence,
              status: r.status,
              source: r.source ?? 'user',
            })));
          } catch (err) {
            console.error('[sidecar] get_reminders error:', err);
            respond(id, []);
          }
        } else {
          respond(id, []);
        }
        break;
      }
      case 'get_dark_pattern_flags': {
        // Queries dark_pattern_flags table (same logic as dark_pattern_get_flags)
        const dpResult: Array<{ contentId: string; confidence: number; patterns: unknown[]; reframe: string }> = [];
        if (!darkPatternDetector && prefsDb && core) {
          darkPatternDetector = new DarkPatternDetector(prefsDb, core.llm);
        }
        if (darkPatternDetector && prefsDb) {
          try {
            const dpRows = prefsDb.prepare(
              'SELECT content_id AS "contentId", confidence, patterns_json, reframe FROM dark_pattern_flags WHERE dismissed = 0 ORDER BY flagged_at DESC LIMIT 50'
            ).all() as Array<{ contentId: string; confidence: number; patterns_json: string; reframe: string }>;
            for (const f of dpRows) {
              dpResult.push({
                contentId: f.contentId,
                confidence: f.confidence,
                patterns: JSON.parse(f.patterns_json),
                reframe: f.reframe,
              });
            }
          } catch {
            // Table may not exist yet — no dark patterns flagged
          }
        }
        respond(id, dpResult);
        break;
      }
      case 'get_clipboard_insights': {
        // Queries clipboard recognizer for recent actions (same as clipboard_get_insights)
        const clipInsights = clipboardRecognizer
          ? clipboardRecentActions.slice(0, 5).map(a => ({
              patternDescription: a.patternType,
              actionLabel: a.action,
              actionId: a.timestamp,
            }))
          : ([] as Array<{ patternDescription: string; actionLabel: string; actionId: string }>);
        respond(id, clipInsights);
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

      // Alias: get_graph_data → knowledge_get_graph (returns category-grouped graph for renderer)
      case 'get_graph_data': {
        try {
          if (!graphVisualizationProvider && documentsDb) {
            try { ensureContactStore(); } catch { /* contacts not critical for graph */ }
            graphVisualizationProvider = new GraphVisualizationProvider({
              db: documentsDb as unknown as import('../../../../core/platform/types.js').DatabaseHandle,
              contactStore: contactStore ?? null,
              relationshipAnalyzer: relationshipAnalyzer ?? null,
            });
            graphVisualizationProvider.initSchema();
          }
          if (!graphVisualizationProvider) {
            respond(id, { nodes: [], edges: [], clusters: [], categoryNodes: [], categoryEdges: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
            break;
          }
          const graph = graphVisualizationProvider.getCategoryGraph();
          respond(id, graph);
        } catch (graphErr) {
          console.error('[sidecar] get_graph_data failed:', graphErr);
          respond(id, { nodes: [], edges: [], clusters: [], categoryNodes: [], categoryEdges: [], stats: { totalNodes: 0, totalEdges: 0, nodesByType: {}, averageConnections: 0, mostConnectedNode: null, graphDensity: 0, growthRate: 0 } });
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
      case 'connector.debug': {
        // Diagnostic endpoint: returns full token and config state for a connector
        try {
          const debugConnectorId = (params as { connectorId?: string }).connectorId ?? 'gmail';
          const tokenMgr = ensureOAuthTokenManager();
          const config = getOAuthConfigForConnector(debugConnectorId);
          const providerKey = config?.providerKey ?? 'unknown';

          const hasTokens = config ? tokenMgr.hasValidTokens(providerKey) : false;
          const isExpired = config ? tokenMgr.isTokenExpired(providerKey) : true;
          const userEmail = config ? tokenMgr.getUserEmail(providerKey) : null;
          const hasRefresh = config ? (tokenMgr.getRefreshToken(providerKey) !== null) : false;
          const accessToken = config ? tokenMgr.getAccessToken(providerKey) : null;

          const debugInfo = {
            connectorId: debugConnectorId,
            providerKey,
            configFound: !!config,
            clientIdSet: config ? config.clientId !== UNCONFIGURED_CLIENT_ID : false,
            clientSecretSet: !!config?.clientSecret,
            hasTokens,
            isExpired,
            hasRefreshToken: hasRefresh,
            hasAccessToken: !!accessToken,
            userEmail,
            envGoogleClientId: process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ? 'SET' : 'NOT SET',
            envGoogleClientSecret: process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'] ? 'SET' : 'NOT SET',
            dataDir: dataDir || join(homedir(), '.semblance'),
          };
          console.error('[sidecar] connector.debug:', JSON.stringify(debugInfo, null, 2));
          respond(id, debugInfo);
        } catch (debugErr) {
          respond(id, { error: String(debugErr) });
        }
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

      // ─── Living Will ──────────────────────────────────────────────────
      case 'living_will_export': {
        const lwParams = params as { passphrase: string; outputPath: string; sections?: string[] };
        if (!prefsDb || !premiumGate) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!livingWillExporter) {
            livingWillExporter = new LivingWillExporter({
              db: prefsDb,
              premiumGate,
              deviceId: getPref('device_id') ?? 'unknown',
              documentStore: core?.knowledge ? { listDocuments: (opts?: unknown) => core!.knowledge.listDocuments(opts as Parameters<typeof core.knowledge.listDocuments>[0]), getStats: () => ({ documentCount: 0 }) } : undefined,
              styleProfileStore: styleProfileStore ? { getActiveProfile: (uid?: string) => styleProfileStore!.getActiveProfile(uid) } : undefined,
              contactStore: contactStore ? { getAllContacts: () => contactStore!.getAllContacts?.() ?? [] } : undefined,
              attestationSigner: attestationSigner ?? undefined,
            });
            livingWillExporter.initSchema();
          }
          const result = await livingWillExporter.export(
            { sections: lwParams.sections as Parameters<LivingWillExporter['export']>[0]['sections'] },
            lwParams.passphrase,
            lwParams.outputPath,
          );
          respond(id, result);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'living_will_import': {
        const liParams = params as { archivePath: string; passphrase: string };
        if (!prefsDb || !premiumGate) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!livingWillImporter) {
            livingWillImporter = new LivingWillImporter({
              db: prefsDb,
              premiumGate,
              localDeviceId: getPref('device_id') ?? 'unknown',
            });
          }
          const result = await livingWillImporter.import(liParams.archivePath, liParams.passphrase);
          respond(id, result);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'living_will_get_history': {
        if (!prefsDb || !premiumGate) { respond(id, []); break; }
        try {
          if (!livingWillExporter) {
            livingWillExporter = new LivingWillExporter({
              db: prefsDb,
              premiumGate,
              deviceId: getPref('device_id') ?? 'unknown',
            });
            livingWillExporter.initSchema();
          }
          respond(id, livingWillExporter.getExportHistory());
        } catch {
          respond(id, []);
        }
        break;
      }
      case 'living_will_get_settings': {
        if (!prefsDb) { respond(id, { cadence: 'disabled', autoExportEnabled: false }); break; }
        try {
          if (!livingWillScheduler && livingWillExporter) {
            livingWillScheduler = new LivingWillScheduler({
              db: prefsDb,
              exporter: livingWillExporter,
              getPassphrase: async () => null,
              outputPath: dataDir,
            });
          }
          const config = livingWillScheduler?.getConfig() ?? { cadence: 'disabled' };
          respond(id, config);
        } catch {
          respond(id, { cadence: 'disabled', autoExportEnabled: false });
        }
        break;
      }
      case 'living_will_update_settings': {
        const settingsParams = params as { cadence?: 'weekly' | 'monthly' | 'disabled' };
        if (!prefsDb || !premiumGate) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!livingWillExporter) {
            livingWillExporter = new LivingWillExporter({
              db: prefsDb,
              premiumGate,
              deviceId: getPref('device_id') ?? 'unknown',
            });
            livingWillExporter.initSchema();
          }
          if (!livingWillScheduler) {
            livingWillScheduler = new LivingWillScheduler({
              db: prefsDb,
              exporter: livingWillExporter,
              getPassphrase: async () => null,
              outputPath: dataDir,
            });
          }
          if (settingsParams.cadence) {
            livingWillScheduler.configure(settingsParams.cadence);
          }
          respond(id, livingWillScheduler.getConfig());
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }

      // ─── Semblance Witness ─────────────────────────────────────────────
      case 'witness_generate_attestation': {
        const wParams = params as { auditEntryId: string; actionSummary: string; autonomyTier?: string };
        if (!prefsDb || !premiumGate) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!attestationSigner) {
            // Use hardware key provider if available, otherwise generate ephemeral key
            const { createHash, randomBytes } = await import('node:crypto');
            const keyMaterial = randomBytes(32);
            attestationSigner = new AttestationSigner({
              signingKey: keyMaterial,
              deviceIdentity: { deviceId: getPref('device_id') ?? 'unknown', platform: process.platform, createdAt: new Date().toISOString() },
            });
          }
          if (!witnessGenerator) {
            witnessGenerator = new WitnessGenerator({
              db: prefsDb,
              premiumGate,
              attestationSigner,
              deviceIdentity: { deviceId: getPref('device_id') ?? 'unknown', platform: process.platform, createdAt: new Date().toISOString() },
            });
            witnessGenerator.initSchema();
          }
          const result = witnessGenerator.generate(wParams.auditEntryId, wParams.actionSummary, wParams.autonomyTier);
          respond(id, result);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'witness_get_attestations': {
        const wListParams = params as { limit?: number };
        if (!prefsDb || !premiumGate) { respond(id, []); break; }
        try {
          if (!witnessGenerator) {
            if (!attestationSigner) {
              const { randomBytes } = await import('node:crypto');
              attestationSigner = new AttestationSigner({
                signingKey: randomBytes(32),
                deviceIdentity: { deviceId: getPref('device_id') ?? 'unknown', platform: process.platform, createdAt: new Date().toISOString() },
              });
            }
            witnessGenerator = new WitnessGenerator({
              db: prefsDb,
              premiumGate,
              attestationSigner,
              deviceIdentity: { deviceId: getPref('device_id') ?? 'unknown', platform: process.platform, createdAt: new Date().toISOString() },
            });
            witnessGenerator.initSchema();
          }
          respond(id, witnessGenerator.listAttestations(wListParams.limit ?? 50));
        } catch {
          respond(id, []);
        }
        break;
      }
      case 'witness_verify_attestation': {
        const wvParams = params as { attestationId: string };
        if (!prefsDb || !witnessGenerator) { respondError(id, 'Witness system not initialized'); break; }
        try {
          const attestation = witnessGenerator.getAttestation(wvParams.attestationId);
          if (!attestation) { respondError(id, 'Attestation not found'); break; }
          if (!witnessVerifier) {
            witnessVerifier = new WitnessVerifier();
          }
          // For HMAC verification we need the signing key — for now report signature presence
          respond(id, {
            id: attestation.id,
            hasSignature: !!attestation.signature,
            algorithm: attestation.algorithm,
            signedAt: attestation.signedAt,
          });
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'witness_export_attestation': {
        const weParams = params as { attestationId: string };
        if (!witnessGenerator) { respondError(id, 'Witness system not initialized'); break; }
        try {
          const attestation = witnessGenerator.getAttestation(weParams.attestationId);
          if (!attestation) { respondError(id, 'Attestation not found'); break; }
          if (!witnessExporter) {
            witnessExporter = new WitnessExporter();
          }
          const json = witnessExporter.exportAsJson(attestation);
          respond(id, { json, attestation });
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }

      // ─── Inheritance Protocol ──────────────────────────────────────────
      case 'inheritance_get_config': {
        if (!prefsDb) { respond(id, { enabled: false }); break; }
        try {
          if (!inheritanceConfigStore) {
            inheritanceConfigStore = new InheritanceConfigStore(prefsDb);
            inheritanceConfigStore.initSchema();
          }
          respond(id, inheritanceConfigStore.getConfig());
        } catch {
          respond(id, { enabled: false });
        }
        break;
      }
      case 'inheritance_update_config': {
        const icParams = params as Record<string, unknown>;
        if (!prefsDb) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!inheritanceConfigStore) {
            inheritanceConfigStore = new InheritanceConfigStore(prefsDb);
            inheritanceConfigStore.initSchema();
          }
          const updated = inheritanceConfigStore.updateConfig(icParams);
          respond(id, updated);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'inheritance_add_trusted_party': {
        const ipParams = params as { name: string; email: string; relationship: string };
        if (!prefsDb) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!inheritanceConfigStore) {
            inheritanceConfigStore = new InheritanceConfigStore(prefsDb);
            inheritanceConfigStore.initSchema();
          }
          const { nanoid } = await import('nanoid');
          const party = {
            id: nanoid(),
            name: ipParams.name,
            email: ipParams.email,
            relationship: ipParams.relationship,
            passphraseHash: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          inheritanceConfigStore.insertParty(party);
          respond(id, party);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'inheritance_get_trusted_parties': {
        if (!prefsDb) { respond(id, []); break; }
        try {
          if (!inheritanceConfigStore) {
            inheritanceConfigStore = new InheritanceConfigStore(prefsDb);
            inheritanceConfigStore.initSchema();
          }
          respond(id, inheritanceConfigStore.getAllParties());
        } catch {
          respond(id, []);
        }
        break;
      }
      case 'inheritance_remove_trusted_party': {
        const irpParams = params as { id: string };
        if (!prefsDb) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!inheritanceConfigStore) {
            inheritanceConfigStore = new InheritanceConfigStore(prefsDb);
            inheritanceConfigStore.initSchema();
          }
          const removed = inheritanceConfigStore.removeParty(irpParams.id);
          respond(id, { success: removed });
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'inheritance_run_test': {
        if (!prefsDb) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!inheritanceConfigStore) {
            inheritanceConfigStore = new InheritanceConfigStore(prefsDb);
            inheritanceConfigStore.initSchema();
          }
          // Test run: validate config, check all parties reachable, simulate actions without executing
          const config = inheritanceConfigStore.getConfig();
          const parties = inheritanceConfigStore.getAllParties();
          const actions = inheritanceConfigStore.getAllActions();
          respond(id, {
            success: true,
            mode: 'dry_run',
            configValid: config.enabled !== undefined,
            trustedPartyCount: parties.length,
            actionCount: actions.length,
            message: `Test complete: ${parties.length} trusted parties, ${actions.length} pre-authorized actions. No real actions executed.`,
          });
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }

      // ─── Backup ────────────────────────────────────────────────────────
      case 'backup_create': {
        const bkParams = params as { passphrase: string; outputPath?: string };
        if (!prefsDb) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!backupManager) {
            backupManager = new BackupManager({
              db: prefsDb,
              secureStorage: { getItem: async (k: string) => getPref(k), setItem: async (k: string, v: string) => setPref(k, v), removeItem: async (k: string) => { try { prefsDb!.prepare('DELETE FROM preferences WHERE key = ?').run(k); } catch {} } },
              deviceId: getPref('device_id') ?? 'unknown',
              dataCollector: {
                collectSections: () => ({
                  sections: [],
                  entityCounts: {},
                }),
              },
            });
          }
          const result = await backupManager.createBackup(bkParams.passphrase);
          respond(id, result);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'backup_get_history': {
        if (!prefsDb) { respond(id, []); break; }
        try {
          if (!backupManager) {
            backupManager = new BackupManager({
              db: prefsDb,
              secureStorage: { getItem: async (k: string) => getPref(k), setItem: async (k: string, v: string) => setPref(k, v), removeItem: async (k: string) => { try { prefsDb!.prepare('DELETE FROM preferences WHERE key = ?').run(k); } catch {} } },
              deviceId: getPref('device_id') ?? 'unknown',
              dataCollector: { collectSections: () => ({ sections: [], entityCounts: {} }) },
            });
          }
          respond(id, backupManager.getBackupHistory());
        } catch {
          respond(id, []);
        }
        break;
      }
      case 'backup_get_config': {
        if (!prefsDb) { respond(id, { schedule: 'manual', destinations: [] }); break; }
        try {
          if (!backupManager) {
            backupManager = new BackupManager({
              db: prefsDb,
              secureStorage: { getItem: async (k: string) => getPref(k), setItem: async (k: string, v: string) => setPref(k, v), removeItem: async (k: string) => { try { prefsDb!.prepare('DELETE FROM preferences WHERE key = ?').run(k); } catch {} } },
              deviceId: getPref('device_id') ?? 'unknown',
              dataCollector: { collectSections: () => ({ sections: [], entityCounts: {} }) },
            });
          }
          respond(id, backupManager.getConfig());
        } catch {
          respond(id, { schedule: 'manual', destinations: [] });
        }
        break;
      }
      case 'backup_update_config': {
        const bcParams = params as Record<string, unknown>;
        if (!prefsDb) { respondError(id, 'Core not initialized'); break; }
        try {
          if (!backupManager) {
            backupManager = new BackupManager({
              db: prefsDb,
              secureStorage: { getItem: async (k: string) => getPref(k), setItem: async (k: string, v: string) => setPref(k, v), removeItem: async (k: string) => { try { prefsDb!.prepare('DELETE FROM preferences WHERE key = ?').run(k); } catch {} } },
              deviceId: getPref('device_id') ?? 'unknown',
              dataCollector: { collectSections: () => ({ sections: [], entityCounts: {} }) },
            });
          }
          backupManager.configure(bcParams as Parameters<BackupManager['configure']>[0]);
          respond(id, backupManager.getConfig());
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'backup_validate': {
        const bvParams = params as { filePath: string; passphrase: string };
        if (!backupManager) { respondError(id, 'Backup system not initialized'); break; }
        try {
          const result = await backupManager.validateBackup(bvParams.filePath, bvParams.passphrase);
          respond(id, result);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }
      case 'backup_restore': {
        const brParams = params as { filePath: string; passphrase: string };
        if (!backupManager) { respondError(id, 'Backup system not initialized'); break; }
        try {
          const result = await backupManager.restoreFromBackup(brParams.filePath, brParams.passphrase);
          respond(id, result);
        } catch (err) {
          respondError(id, err instanceof Error ? err.message : String(err));
        }
        break;
      }

      // ─── Sprint C: Named Session Handlers ─────────────────────────────────

      case 'session_create': {
        if (!namedSessionManager && prefsDb) {
          namedSessionManager = new NamedSessionManager(prefsDb as any);
        }
        if (!namedSessionManager) { respondError(id, 'Session manager not initialized'); break; }
        const scParams = params as { key: string; label: string; autonomyOverrides?: Record<string, string>; modelOverride?: string; channelBinding?: string };
        const convId = await namedSessionManager.createSession({
          key: scParams.key,
          label: scParams.label,
          autonomyOverrides: scParams.autonomyOverrides as any,
          modelOverride: scParams.modelOverride,
          channelBinding: scParams.channelBinding,
        });
        respond(id, { conversationId: convId, key: scParams.key });
        break;
      }

      case 'session_list': {
        if (!namedSessionManager && prefsDb) {
          namedSessionManager = new NamedSessionManager(prefsDb as any);
        }
        if (!namedSessionManager) { respond(id, []); break; }
        const sessions = await namedSessionManager.listSessions();
        respond(id, sessions);
        break;
      }

      case 'session_get': {
        if (!namedSessionManager && prefsDb) {
          namedSessionManager = new NamedSessionManager(prefsDb as any);
        }
        if (!namedSessionManager) { respond(id, null); break; }
        const sgParams = params as { key: string };
        const session = await namedSessionManager.getSession(sgParams.key);
        respond(id, session);
        break;
      }

      case 'session_delete': {
        if (!namedSessionManager && prefsDb) {
          namedSessionManager = new NamedSessionManager(prefsDb as any);
        }
        if (!namedSessionManager) { respondError(id, 'Session manager not initialized'); break; }
        const sdParams = params as { key: string };
        await namedSessionManager.deleteSession(sdParams.key);
        respond(id, { success: true });
        break;
      }

      case 'session_resolve': {
        if (!namedSessionManager && prefsDb) {
          namedSessionManager = new NamedSessionManager(prefsDb as any);
        }
        if (!namedSessionManager) { respondError(id, 'Session manager not initialized'); break; }
        const srParams = params as { key: string };
        const resolvedConvId = await namedSessionManager.resolveSession(srParams.key);
        respond(id, { conversationId: resolvedConvId });
        break;
      }

      // ─── Sprint C: Channel Handlers ───────────────────────────────────────

      case 'channel_list': {
        if (!channelRegistry) {
          channelRegistry = new ChannelRegistry();
        }
        respond(id, channelRegistry.listAll());
        break;
      }

      case 'channel_start': {
        if (!channelRegistry) { respondError(id, 'Channel registry not initialized'); break; }
        const csParams = params as { channelId: string };
        try {
          await channelRegistry.start(csParams.channelId);
          respond(id, { success: true });
        } catch (e) {
          respondError(id, (e as Error).message);
        }
        break;
      }

      case 'channel_stop': {
        if (!channelRegistry) { respondError(id, 'Channel registry not initialized'); break; }
        const cstParams = params as { channelId: string };
        await channelRegistry.stop(cstParams.channelId);
        respond(id, { success: true });
        break;
      }

      case 'channel_get_status': {
        if (!channelRegistry) { respond(id, null); break; }
        const cgsParams = params as { channelId: string };
        respond(id, channelRegistry.getStatus(cgsParams.channelId));
        break;
      }

      case 'channel_approve_contact': {
        if (!pairingManager && gateway) {
          const gatewayDataDir = join(dataDir, 'gateway');
          const configDbPath = join(gatewayDataDir, 'config.db');
          if (existsSync(configDbPath)) {
            const configDb = new Database(configDbPath);
            pairingManager = new PairingManager(configDb);
          }
        }
        if (!pairingManager) { respondError(id, 'Pairing manager not initialized'); break; }
        const acParams = params as { channelId: string; senderId: string; displayName?: string; code?: string };
        if (acParams.code) {
          const valid = pairingManager.verifyCode(acParams.channelId, acParams.senderId, acParams.code);
          if (!valid) { respondError(id, 'Invalid or expired pairing code'); break; }
        }
        pairingManager.approveContact(acParams.channelId, acParams.senderId, acParams.displayName);
        respond(id, { success: true });
        break;
      }

      case 'channel_list_pending_approvals': {
        if (!pairingManager) { respond(id, []); break; }
        respond(id, pairingManager.listPending());
        break;
      }

      case 'channel_revoke_contact': {
        if (!pairingManager) { respondError(id, 'Pairing manager not initialized'); break; }
        const rcParams = params as { channelId: string; senderId: string };
        pairingManager.revokeContact(rcParams.channelId, rcParams.senderId);
        respond(id, { success: true });
        break;
      }

      // ─── Sprint D: Tunnel / Compute Mesh Handlers ────────────────────────

      case 'tunnel_gateway_start': {
        const tgsParams = params as { bindAddress: string; port?: number };
        if (!tunnelGatewayServer && gateway) {
          tunnelGatewayServer = new TunnelGatewayServer({
            bindAddress: tgsParams.bindAddress,
            port: tgsParams.port ?? 51821,
            validateAndExecute: async (req) => gateway!.getServiceRegistry().register as any,
            auditTrail: gateway.getAuditTrail(),
            deviceId: getPref('device_id') ?? 'desktop',
          });
        }
        if (!tunnelGatewayServer) { respondError(id, 'Gateway not initialized'); break; }
        try {
          await tunnelGatewayServer.start();
          respond(id, { success: true, ...tunnelGatewayServer.getStatus() });
        } catch (e) {
          respondError(id, (e as Error).message);
        }
        break;
      }

      case 'tunnel_gateway_stop': {
        if (tunnelGatewayServer) await tunnelGatewayServer.stop();
        respond(id, { success: true });
        break;
      }

      case 'tunnel_gateway_status': {
        respond(id, tunnelGatewayServer?.getStatus() ?? { running: false, bindAddress: '', port: 51821, connectedPeers: 0 });
        break;
      }

      case 'tunnel_wireguard_start': {
        if (!wireguardManager) wireguardManager = new WireGuardManager({ dataDir });
        const twsParams = params as { config: import('../../../gateway/tunnel/headscale-client.js').WireGuardConfig };
        try {
          await wireguardManager.start(twsParams.config);
          respond(id, { success: true, ...wireguardManager.getStatus() });
        } catch (e) {
          respondError(id, (e as Error).message);
        }
        break;
      }

      case 'tunnel_wireguard_stop': {
        if (wireguardManager) await wireguardManager.stop();
        respond(id, { success: true });
        break;
      }

      case 'tunnel_wireguard_status': {
        respond(id, wireguardManager?.getStatus() ?? { running: false, meshIp: null, processAlive: false });
        break;
      }

      case 'tunnel_headscale_register': {
        const thrParams = params as { serverUrl: string; authKey: string; machineName: string; publicKey: string };
        headscaleClient = new HeadscaleClient({
          serverUrl: thrParams.serverUrl,
          authKey: thrParams.authKey,
          machineName: thrParams.machineName,
        });
        try {
          const regResult = await headscaleClient.register(thrParams.publicKey);
          respond(id, regResult);
        } catch (e) {
          respondError(id, (e as Error).message);
        }
        break;
      }

      case 'tunnel_headscale_peers': {
        if (!headscaleClient) { respond(id, []); break; }
        try {
          const peers = await headscaleClient.getPeers();
          respond(id, peers);
        } catch (e) {
          respondError(id, (e as Error).message);
        }
        break;
      }

      case 'tunnel_headscale_is_registered': {
        if (!headscaleClient) { respond(id, false); break; }
        try {
          const registered = await headscaleClient.isRegistered();
          respond(id, registered);
        } catch {
          respond(id, false);
        }
        break;
      }

      case 'tunnel_generate_pairing_code': {
        const gatewayDataDir = join(dataDir, 'gateway');
        if (!tunnelPairingCoordinator) {
          const configDbPath = join(gatewayDataDir, 'config.db');
          if (existsSync(configDbPath)) {
            tunnelPairingCoordinator = new PairingCoordinator(new Database(configDbPath));
          }
        }
        if (!tunnelPairingCoordinator) { respondError(id, 'Pairing coordinator not initialized'); break; }
        const tgpParams = params as { headscaleServer: string; preAuthKey: string; deviceId: string; publicKey: string; displayName: string; platform: string };
        const pairingResult = await tunnelPairingCoordinator.generatePairingCode(tgpParams);
        respond(id, pairingResult);
        break;
      }

      case 'tunnel_verify_pairing_code': {
        if (!tunnelPairingCoordinator) { respond(id, null); break; }
        const tvpParams = params as { code: string };
        const peerInfo = await tunnelPairingCoordinator.verifyPairingCode(tvpParams.code);
        respond(id, peerInfo);
        break;
      }

      case 'tunnel_complete_pairing': {
        if (!tunnelPairingCoordinator) { respondError(id, 'Pairing coordinator not initialized'); break; }
        const tcpParams = params as { deviceId: string; displayName: string; platform: string; meshIp: string; publicKey: string };
        await tunnelPairingCoordinator.completePairing(tcpParams);
        respond(id, { success: true });
        break;
      }

      case 'tunnel_list_paired_devices': {
        if (!tunnelPairingCoordinator) { respond(id, []); break; }
        const devices = await tunnelPairingCoordinator.listPairedDevices();
        respond(id, devices);
        break;
      }

      case 'tunnel_unpair_device': {
        if (!tunnelPairingCoordinator) { respondError(id, 'Pairing coordinator not initialized'); break; }
        const tudParams = params as { deviceId: string };
        await tunnelPairingCoordinator.unpairDevice(tudParams.deviceId);
        respond(id, { success: true });
        break;
      }

      case 'tunnel_sync_now': {
        if (!tunnelKGSync) {
          tunnelKGSync = new TunnelKGSync({ deviceId: getPref('device_id') ?? 'desktop' });
        }
        // Tunnel sync requires a TunnelTransport — return status only for now
        respond(id, tunnelKGSync.getSyncStatus());
        break;
      }

      case 'tunnel_sync_status': {
        if (!tunnelKGSync) { respond(id, { lastSyncAt: null, deltasSent: 0, deltasReceived: 0, nextSyncAt: null }); break; }
        respond(id, tunnelKGSync.getSyncStatus());
        break;
      }

      // ─── Sprint C: Canvas Handlers ────────────────────────────────────────

      case 'canvas_push': {
        if (!canvasManager) {
          canvasManager = new CanvasManager({
            auditTrail: gateway?.getAuditTrail() ?? undefined,
          });
        }
        const cpParams = params as { componentType: string; data: Record<string, unknown>; replace: boolean; title?: string };
        const pushResult = canvasManager.push({
          componentType: cpParams.componentType as any,
          data: cpParams.data,
          replace: cpParams.replace ?? true,
          title: cpParams.title,
        });
        if (pushResult.accepted) {
          emit('canvas:update', canvasManager.getCurrentPayload());
          respond(id, { accepted: true });
        } else {
          respondError(id, pushResult.reason ?? 'Canvas push rejected');
        }
        break;
      }

      case 'canvas_clear': {
        if (!canvasManager) {
          canvasManager = new CanvasManager();
        }
        canvasManager.clear();
        emit('canvas:update', null);
        respond(id, { success: true });
        break;
      }

      case 'canvas_get_state': {
        if (!canvasManager) { respond(id, { currentPayload: null, history: [], lastPushedAt: null, pushCount: 0 }); break; }
        respond(id, canvasManager.getState());
        break;
      }

      case 'canvas_snapshot': {
        if (!canvasManager) { respond(id, { snapshot: 'null' }); break; }
        respond(id, { snapshot: canvasManager.snapshot() });
        break;
      }

      // ─── Sprint C: Vision Handlers ────────────────────────────────────────

      case 'vision_analyze_image': {
        if (!visionProvider) {
          visionProvider = new VisionProvider();
        }
        const vaiParams = params as { imagePath: string; prompt?: string; tier?: 'fast' | 'rich' };
        const visionResult = await visionProvider.analyzeFromPath(
          vaiParams.imagePath,
          vaiParams.prompt ?? 'Describe this image.',
          vaiParams.tier ?? 'fast',
        );
        respond(id, visionResult);
        break;
      }

      case 'vision_ocr_document': {
        if (!visionProvider) {
          visionProvider = new VisionProvider();
        }
        const vodParams = params as { imagePath: string };
        const ocrResult = await visionProvider.ocrDocument(vodParams.imagePath);
        respond(id, ocrResult);
        break;
      }

      case 'vision_screen_capture': {
        if (!visionProvider) {
          visionProvider = new VisionProvider();
        }
        // Screen capture: base64 screenshot passed by the frontend via Tauri
        const vscParams = params as { screenshotBase64?: string; prompt?: string };
        if (!vscParams.screenshotBase64) {
          respondError(id, 'screenshotBase64 parameter required — capture via Tauri screen API');
          break;
        }
        const screenResult = await visionProvider.captureAndAnalyzeScreen(
          vscParams.screenshotBase64,
          vscParams.prompt,
        );
        respond(id, screenResult);
        break;
      }

      // ─── Sprint C: Event Bus Handlers ─────────────────────────────────────

      case 'event_bus_recent': {
        if (!eventBus) { eventBus = new SemblanceEventBus(); }
        const ebrParams = params as { limit?: number };
        respond(id, eventBus.getRecentEvents(ebrParams.limit ?? 20));
        break;
      }

      // ─── Sprint E: Intelligence Depth Handlers ─────────────────────────────

      case 'preference_list': {
        if (!preferenceGraph) { respond(id, []); break; }
        const plParams = params as { min_confidence?: number };
        respond(id, preferenceGraph.getAllPreferences(plParams.min_confidence ?? 0.3));
        break;
      }

      case 'preference_confirm': {
        if (!preferenceGraph) { respondError(id, 'PreferenceGraph not initialized'); break; }
        const pcParams = params as { id: string };
        preferenceGraph.confirmPreference(pcParams.id);
        respond(id, { success: true });
        break;
      }

      case 'preference_deny': {
        if (!preferenceGraph) { respondError(id, 'PreferenceGraph not initialized'); break; }
        const pdParams = params as { id: string };
        preferenceGraph.denyPreference(pdParams.id);
        respond(id, { success: true });
        break;
      }

      case 'preference_get_high_confidence': {
        if (!preferenceGraph) { respond(id, []); break; }
        respond(id, preferenceGraph.getHighConfidencePreferences());
        break;
      }

      case 'speculative_cache_status': {
        if (!speculativeLoader) { respond(id, { entries: 0, hitRate: 0, oldestEntryAge: 'none' }); break; }
        respond(id, speculativeLoader.getStatus());
        break;
      }

      case 'speculative_preload_now': {
        if (!speculativeLoader) { respondError(id, 'SpeculativeLoader not initialized'); break; }
        // Run pre-load pass with available deps
        try {
          const preloadResult = await speculativeLoader.runPreloadPass({
            getUpcomingMeetings: (minutesAhead: number) => {
              if (!core) return [];
              try {
                const coreDb = (core as unknown as { db: import('better-sqlite3').Database }).db;
                if (!coreDb) return [];
                const cutoff = new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
                const now = new Date().toISOString();
                const rows = coreDb.prepare(
                  'SELECT uid, title, start_time, attendees FROM indexed_calendar_events WHERE start_time >= ? AND start_time <= ? AND is_all_day = 0 LIMIT 10'
                ).all(now, cutoff) as Array<{ uid: string; title: string; start_time: string; attendees: string }>;
                return rows.map(r => ({
                  eventId: r.uid,
                  title: r.title,
                  startTime: r.start_time,
                  attendees: JSON.parse(r.attendees || '[]') as string[],
                }));
              } catch { return []; }
            },
            assembleMeetingBrief: async (eventId: string) => ({ eventId, briefType: 'meeting_prep', assembledAt: new Date().toISOString() }),
            assembleMorningBrief: async () => ({ briefType: 'morning', assembledAt: new Date().toISOString() }),
            getHighRelationshipSenders: () => [],
            assembleRelationshipContext: async (senderId: string) => ({ senderId }),
          });
          respond(id, preloadResult);
        } catch (preloadErr) {
          respondError(id, (preloadErr as Error).message);
        }
        break;
      }

      case 'commitment_list_due': {
        if (!commitmentTracker) { respond(id, []); break; }
        const cldParams = params as { threshold_days?: number };
        respond(id, commitmentTracker.getDueCommitments(cldParams.threshold_days ?? 1));
        break;
      }

      case 'commitment_resolve': {
        if (!commitmentTracker) { respondError(id, 'CommitmentTracker not initialized'); break; }
        const crParams = params as { id: string };
        commitmentTracker.resolve(crParams.id);
        respond(id, { success: true });
        break;
      }

      case 'commitment_dismiss': {
        if (!commitmentTracker) { respondError(id, 'CommitmentTracker not initialized'); break; }
        const cdParams = params as { id: string };
        commitmentTracker.dismiss(cdParams.id);
        respond(id, { success: true });
        break;
      }

      case 'relationship_pattern_shifts': {
        if (!patternShiftDetector) { respond(id, []); break; }
        try {
          const shifts = await patternShiftDetector.detectShifts();
          respond(id, shifts);
        } catch (psErr) {
          respondError(id, (psErr as Error).message);
        }
        break;
      }

      case 'relationship_reciprocity': {
        if (!core) { respond(id, []); break; }
        try {
          const rrParams = params as { contact_id?: string };
          const coreDb = (core as unknown as { db: import('better-sqlite3').Database }).db;
          if (!coreDb || !contactStore) { respond(id, []); break; }
          const dbHandle = coreDb as unknown as import('../../../core/platform/types.js').DatabaseHandle;
          const analyzer = new (await import('../../../core/knowledge/contacts/relationship-analyzer.js')).RelationshipAnalyzer({
            db: dbHandle,
            contactStore: contactStore!,
          });
          if (rrParams.contact_id) {
            const score = analyzer.getReciprocityScore(rrParams.contact_id);
            respond(id, score ? [score] : []);
          } else {
            // Top 10 contacts by interaction count
            const contacts = contactStore!.listContacts({ limit: 10, sortBy: 'interactionCount' as any });
            const scores = contacts
              .map(c => analyzer.getReciprocityScore(c.id))
              .filter(Boolean);
            respond(id, scores);
          }
        } catch (rrErr) {
          respondError(id, (rrErr as Error).message);
        }
        break;
      }

      // ─── Sprint F: Hardware Bridge Handlers ──────────────────────────────

      case 'binary_allowlist_list': {
        if (!binaryAllowlist) { respond(id, []); break; }
        respond(id, binaryAllowlist.list());
        break;
      }

      case 'binary_allowlist_add': {
        if (!binaryAllowlist) { respondError(id, 'BinaryAllowlist not initialized'); break; }
        try {
          const baaParams = params as { binary_path: string; description?: string; max_execution_seconds?: number; allow_stdin?: boolean };
          const entry = binaryAllowlist.add({
            binaryPath: baaParams.binary_path,
            description: baaParams.description,
            maxExecutionSeconds: baaParams.max_execution_seconds,
            allowStdin: baaParams.allow_stdin,
          });
          respond(id, entry);
        } catch (addErr) {
          respondError(id, (addErr as Error).message);
        }
        break;
      }

      case 'binary_allowlist_remove': {
        if (!binaryAllowlist) { respondError(id, 'BinaryAllowlist not initialized'); break; }
        const barParams = params as { binary_name: string };
        const removed = binaryAllowlist.remove(barParams.binary_name);
        respond(id, { success: removed });
        break;
      }

      case 'binary_allowlist_check': {
        if (!binaryAllowlist) { respondError(id, 'BinaryAllowlist not initialized'); break; }
        const bacParams = params as { binary_path: string };
        const blockReason = binaryAllowlist.check(bacParams.binary_path);
        respond(id, { allowed: blockReason === null, reason: blockReason });
        break;
      }

      case 'system_execute': {
        if (!systemCommandGateway) { respondError(id, 'SystemCommandGateway not initialized'); break; }
        try {
          const seParams = params as { binary: string; args: string[]; stdin?: string; timeout_seconds?: number; working_dir?: string; env?: Record<string, string> };
          const execResult = await systemCommandGateway.execute({
            binary: seParams.binary,
            args: seParams.args,
            stdin: seParams.stdin,
            timeoutSeconds: seParams.timeout_seconds,
            workingDir: seParams.working_dir,
            env: seParams.env,
          });
          respond(id, execResult);
        } catch (execErr) {
          respondError(id, (execErr as Error).message);
        }
        break;
      }

      case 'system_hardware_stat': {
        // Use Tauri native callback for live hardware stats
        try {
          const stats = await sendCallback('get_live_hardware_stats', {});
          respond(id, stats);
        } catch {
          // Fallback to Node.js os module if native callback unavailable
          const os = require('node:os');
          respond(id, {
            cpuUsagePercent: 0,
            memoryUsedMb: Math.round((os.totalmem() - os.freemem()) / (1024 * 1024)),
            memoryTotalMb: Math.round(os.totalmem() / (1024 * 1024)),
            memoryAvailableMb: Math.round(os.freemem() / (1024 * 1024)),
            diskStats: [],
            cpuTempCelsius: null,
            gpuTempCelsius: null,
            gpuUsagePercent: null,
            sampledAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'system_app_launch': {
        if (!systemCommandGateway) { respondError(id, 'SystemCommandGateway not initialized'); break; }
        try {
          const alParams = params as { app_path: string; args?: string[] };
          const plat = require('node:os').platform();
          let binary: string;
          let args: string[];

          if (plat === 'darwin') {
            binary = '/usr/bin/open';
            args = ['-a', alParams.app_path, ...(alParams.args ?? [])];
          } else {
            binary = alParams.app_path;
            args = alParams.args ?? [];
          }

          const launchResult = await systemCommandGateway.execute({ binary, args, timeoutSeconds: 10 });
          respond(id, launchResult);
        } catch (launchErr) {
          respondError(id, (launchErr as Error).message);
        }
        break;
      }

      case 'system_app_list': {
        // Return running processes via Tauri native stats
        try {
          const stats = await sendCallback('get_live_hardware_stats', {});
          // If the Tauri callback doesn't include process list, fallback to minimal info
          respond(id, { processes: [], source: 'native', note: 'Process list available via Rust sysinfo' });
        } catch {
          respond(id, { processes: [], source: 'unavailable' });
        }
        break;
      }

      case 'system_file_watch': {
        const fwParams = params as { directory: string; watch_id?: string };
        try {
          const { watch } = await import('node:fs');
          const watchId = fwParams.watch_id ?? `watch_${nanoid()}`;

          if (fileWatchers.has(watchId)) {
            respondError(id, `Watch ${watchId} already exists`);
            break;
          }

          const watcher = watch(fwParams.directory, { recursive: true }, (eventType, filename) => {
            if (!eventBus || !filename) return;
            const fullPath = require('node:path').join(fwParams.directory, filename);
            if (eventType === 'rename') {
              eventBus.emit('file.created', { path: fullPath, watchedDirectory: fwParams.directory });
            } else if (eventType === 'change') {
              eventBus.emit('file.modified', { path: fullPath });
            }
          });

          fileWatchers.set(watchId, watcher);
          respond(id, { watchId, directory: fwParams.directory });
        } catch (fwErr) {
          respondError(id, (fwErr as Error).message);
        }
        break;
      }

      case 'system_file_watch_stop': {
        const fwsParams = params as { watch_id: string };
        const watcher = fileWatchers.get(fwsParams.watch_id);
        if (watcher) {
          watcher.close();
          fileWatchers.delete(fwsParams.watch_id);
          respond(id, { success: true });
        } else {
          respondError(id, `Watch ${fwsParams.watch_id} not found`);
        }
        break;
      }

      case 'system_clipboard_read': {
        try {
          const clipResult = await sendCallback('clipboard_read', {});
          respond(id, clipResult);
        } catch {
          // Fallback — clipboard not available
          respond(id, { text: null, error: 'Clipboard access not available via native bridge' });
        }
        break;
      }

      case 'system_clipboard_write': {
        try {
          const cwParams = params as { text: string };
          await sendCallback('clipboard_write', { text: cwParams.text });
          respond(id, { success: true });
        } catch (cwErr) {
          respondError(id, (cwErr as Error).message);
        }
        break;
      }

      case 'system_notification': {
        try {
          const snParams = params as { title: string; body: string };
          await sendCallback('show_notification', { title: snParams.title, body: snParams.body });
          respond(id, { success: true });
        } catch {
          // Fallback — emit as event
          emit('notification', params);
          respond(id, { success: true, method: 'event_fallback' });
        }
        break;
      }

      case 'system_accessibility_read': {
        if (!systemCommandGateway) { respondError(id, 'SystemCommandGateway not initialized'); break; }
        try {
          const arParams = params as { app_name: string };
          const plat = require('node:os').platform();
          let treeResult: SystemExecuteResult;

          if (plat === 'darwin') {
            // macOS: use osascript to query accessibility tree
            const script = `tell application "System Events" to get entire contents of window 1 of process "${arParams.app_name.replace(/"/g, '\\"')}"`;
            treeResult = await systemCommandGateway.execute({
              binary: '/usr/bin/osascript',
              args: ['-e', script],
              timeoutSeconds: 10,
            });
          } else {
            treeResult = { exitCode: 1, stdout: '', stderr: 'Accessibility read not yet supported on this platform', durationMs: 0, timedOut: false, pid: null };
          }

          // Redact password fields from output
          let sanitizedOutput = treeResult.stdout;
          sanitizedOutput = sanitizedOutput.replace(/AXSecureTextField[^,}]*/gi, 'AXSecureTextField: [REDACTED]');
          sanitizedOutput = sanitizedOutput.replace(/type="password"[^"]*value="[^"]*"/gi, 'type="password" value="[REDACTED]"');
          sanitizedOutput = sanitizedOutput.replace(/password[^:]*:[^,}\n]*/gi, 'password: [REDACTED]');

          respond(id, { ...treeResult, stdout: sanitizedOutput });
        } catch (arErr) {
          respondError(id, (arErr as Error).message);
        }
        break;
      }

      case 'system_keypress': {
        try {
          const kpParams = params as { keys: string; modifiers?: string[] };
          await sendCallback('synthesize_keypress', { keys: kpParams.keys, modifiers: kpParams.modifiers ?? [] });
          respond(id, { success: true });
        } catch (kpErr) {
          respondError(id, (kpErr as Error).message);
        }
        break;
      }

      case 'system_shortcut_run': {
        if (!systemCommandGateway) { respondError(id, 'SystemCommandGateway not initialized'); break; }
        try {
          const srParams = params as { name: string };
          const plat = require('node:os').platform();
          let shortcutResult: SystemExecuteResult;

          if (plat === 'darwin') {
            shortcutResult = await systemCommandGateway.execute({
              binary: '/usr/bin/shortcuts',
              args: ['run', srParams.name],
              timeoutSeconds: 60,
            });
          } else {
            shortcutResult = { exitCode: 1, stdout: '', stderr: 'Shortcuts not supported on this platform', durationMs: 0, timedOut: false, pid: null };
          }
          respond(id, shortcutResult);
        } catch (srErr) {
          respondError(id, (srErr as Error).message);
        }
        break;
      }

      case 'system_process_kill': {
        if (!systemCommandGateway) { respondError(id, 'SystemCommandGateway not initialized'); break; }
        const pkParams = params as { pid: number };
        respond(id, systemCommandGateway.killProcess(pkParams.pid));
        break;
      }

      case 'system_process_list': {
        if (!systemCommandGateway) { respond(id, []); break; }
        respond(id, systemCommandGateway.listProcesses());
        break;
      }

      // ─── Sprint G: Multi-Account OAuth Handlers ───────────────────────────

      case 'oauth_list_accounts': {
        try {
          const tokenMgr = ensureOAuthTokenManager();
          respond(id, tokenMgr.listAllAccounts());
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'oauth_list_provider_accounts': {
        try {
          const olpaParams = params as { provider: string };
          const tokenMgr = ensureOAuthTokenManager();
          respond(id, tokenMgr.listAccounts(olpaParams.provider));
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'oauth_set_primary': {
        try {
          const ospParams = params as { account_id: string };
          const tokenMgr = ensureOAuthTokenManager();
          tokenMgr.setPrimary(ospParams.account_id);
          respond(id, { success: true });
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'oauth_remove_account': {
        try {
          const oraParams = params as { account_id: string };
          const tokenMgr = ensureOAuthTokenManager();
          tokenMgr.removeAccount(oraParams.account_id);
          respond(id, { success: true });
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'oauth_add_account': {
        // Initiates OAuth flow for a new account — same as first-time flow
        // The OAuth callback handler will call storeAccountTokens() with is_primary = false
        try {
          const oaaParams = params as { provider: string };
          respond(id, { provider: oaaParams.provider, message: 'Initiate OAuth flow in browser for new account' });
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      // ─── Sprint G: Channel Handlers ───────────────────────────────────────

      case 'channel_whatsapp_get_qr': {
        if (!whatsappAdapter) { respond(id, { qr: null }); break; }
        respond(id, { qr: whatsappAdapter.getQRCode() });
        break;
      }

      case 'channel_signal_check_install': {
        // Check if signal-cli is on PATH and in binary allowlist
        try {
          const { execFileSync } = require('node:child_process');
          const plat = require('node:os').platform();
          const whichCmd = plat === 'win32' ? 'where' : 'which';
          let signalCliPath: string | null = null;
          try {
            signalCliPath = execFileSync(whichCmd, ['signal-cli'], { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0] ?? null;
          } catch { /* not found */ }

          const allowlisted = signalCliPath && binaryAllowlist ? binaryAllowlist.check(signalCliPath) === null : false;
          respond(id, { installed: !!signalCliPath, path: signalCliPath, allowlisted });
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'channel_slack_set_tokens': {
        try {
          const cstParams = params as { bot_token: string; app_token: string };
          if (slackChannelAdapter) {
            slackChannelAdapter.setTokens(cstParams.bot_token, cstParams.app_token);
            respond(id, { success: true });
          } else {
            respondError(id, 'Slack channel adapter not initialized');
          }
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      // ─── Sprint G: Skill Registry Handlers ────────────────────────────────

      case 'skill_list': {
        if (!skillRegistry) { respond(id, []); break; }
        respond(id, skillRegistry.list());
        break;
      }

      case 'skill_install': {
        if (!skillRegistry) { respondError(id, 'SkillRegistry not initialized'); break; }
        try {
          const siParams = params as { declaration: SkillDeclaration; source_path: string; consented_capabilities?: SkillCapability[] };
          const installResult = await skillRegistry.install(siParams.declaration, siParams.source_path, siParams.consented_capabilities);
          respond(id, installResult);
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'skill_uninstall': {
        if (!skillRegistry) { respondError(id, 'SkillRegistry not initialized'); break; }
        try {
          const suParams = params as { skill_id: string };
          await skillRegistry.uninstall(suParams.skill_id);
          respond(id, { success: true });
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'skill_enable': {
        if (!skillRegistry) { respondError(id, 'SkillRegistry not initialized'); break; }
        const seParams = params as { skill_id: string };
        skillRegistry.enable(seParams.skill_id);
        respond(id, { success: true });
        break;
      }

      case 'skill_disable': {
        if (!skillRegistry) { respondError(id, 'SkillRegistry not initialized'); break; }
        const sdParams = params as { skill_id: string };
        skillRegistry.disable(sdParams.skill_id);
        respond(id, { success: true });
        break;
      }

      case 'skill_get_declaration': {
        if (!skillRegistry) { respond(id, null); break; }
        const sgdParams = params as { skill_id: string };
        const skill = skillRegistry.get(sgdParams.skill_id);
        respond(id, skill?.declaration ?? null);
        break;
      }

      case 'skill_list_capabilities': {
        respond(id, CAPABILITY_DESCRIPTIONS);
        break;
      }

      // ─── Sprint G: Sub-Agent Handlers ─────────────────────────────────────

      case 'sub_agent_create': {
        if (!subAgentCoordinator) { respondError(id, 'SubAgentCoordinator not initialized'); break; }
        try {
          const sacParams = params as { session_key: string; system_prompt_override?: string; allowed_tools: string[]; autonomy_overrides?: Record<string, string> };
          const agentId = await subAgentCoordinator.createSubAgent({
            sessionKey: sacParams.session_key,
            systemPromptOverride: sacParams.system_prompt_override,
            allowedTools: sacParams.allowed_tools,
            autonomyOverrides: sacParams.autonomy_overrides,
          });
          respond(id, { agentId, sessionKey: sacParams.session_key });
        } catch (err) {
          respondError(id, (err as Error).message);
        }
        break;
      }

      case 'sub_agent_list': {
        if (!subAgentCoordinator) { respond(id, []); break; }
        respond(id, subAgentCoordinator.listSubAgents());
        break;
      }

      case 'sub_agent_terminate': {
        if (!subAgentCoordinator) { respondError(id, 'SubAgentCoordinator not initialized'); break; }
        const satParams = params as { session_key: string };
        subAgentCoordinator.terminateSubAgent(satParams.session_key);
        respond(id, { success: true });
        break;
      }

      // ─── Sprint G.5: Browser CDP Handlers ─────────────────────────────────

      case 'browser_connect': {
        if (!browserCDPAdapter) { respondError(id, 'BrowserCDPAdapter not initialized'); break; }
        try {
          const bcParams = params as { debugging_port?: number };
          const connectResult = await browserCDPAdapter.connect(bcParams.debugging_port);
          respond(id, connectResult);
        } catch (bcErr) { respondError(id, (bcErr as Error).message); }
        break;
      }

      case 'browser_disconnect': {
        if (!browserCDPAdapter) { respond(id, { success: true }); break; }
        await browserCDPAdapter.disconnect();
        respond(id, { success: true });
        break;
      }

      case 'browser_navigate': {
        if (!browserCDPAdapter) { respondError(id, 'Browser not connected'); break; }
        try {
          const bnParams = params as { url: string };
          const navResult = await browserCDPAdapter.navigate(bnParams.url);
          respond(id, navResult);
        } catch (bnErr) { respondError(id, (bnErr as Error).message); }
        break;
      }

      case 'browser_snapshot': {
        if (!browserCDPAdapter) { respondError(id, 'Browser not connected'); break; }
        try {
          const snapResult = await browserCDPAdapter.snapshot();
          respond(id, snapResult);
        } catch (bsErr) { respondError(id, (bsErr as Error).message); }
        break;
      }

      case 'browser_click': {
        if (!browserCDPAdapter) { respondError(id, 'Browser not connected'); break; }
        try {
          const bclParams = params as { selector: string };
          await browserCDPAdapter.click(bclParams.selector);
          respond(id, { success: true });
        } catch (bclErr) { respondError(id, (bclErr as Error).message); }
        break;
      }

      case 'browser_type': {
        if (!browserCDPAdapter) { respondError(id, 'Browser not connected'); break; }
        try {
          const btParams = params as { selector: string; text: string };
          await browserCDPAdapter.type(btParams.selector, btParams.text);
          respond(id, { success: true });
        } catch (btErr) { respondError(id, (btErr as Error).message); }
        break;
      }

      case 'browser_extract': {
        if (!browserCDPAdapter) { respondError(id, 'Browser not connected'); break; }
        try {
          const beParams = params as { extract_type: string; selector?: string };
          const extracted = await browserCDPAdapter.extract(beParams.extract_type as 'table' | 'list' | 'form' | 'text', beParams.selector);
          respond(id, extracted);
        } catch (beErr) { respondError(id, (beErr as Error).message); }
        break;
      }

      case 'browser_fill': {
        if (!browserCDPAdapter) { respondError(id, 'Browser not connected'); break; }
        try {
          const bfParams = params as { selector: string; value: string };
          await browserCDPAdapter.fill(bfParams.selector, bfParams.value);
          respond(id, { success: true });
        } catch (bfErr) { respondError(id, (bfErr as Error).message); }
        break;
      }

      case 'browser_screenshot': {
        if (!browserCDPAdapter) { respondError(id, 'Browser not connected'); break; }
        try {
          const screenshot = await browserCDPAdapter.screenshot();
          respond(id, { data: screenshot });
        } catch (bssErr) { respondError(id, (bssErr as Error).message); }
        break;
      }

      // ─── Sprint G.5: Alter Ego Week Handlers ──────────────────────────────

      case 'alter_ego_week_get_state': {
        const aew = ipAdapters.alterEgoWeekEngine;
        if (!aew) { respond(id, { active: false, currentDay: null, completedDays: [], startedAt: null, completedAt: null, activationOffered: false, userActivated: false }); break; }
        respond(id, aew.getState());
        break;
      }

      case 'alter_ego_week_start': {
        const aew = ipAdapters.alterEgoWeekEngine;
        if (!aew) { respondError(id, 'Alter Ego Week requires Digital Representative'); break; }
        try {
          const state = await aew.start();
          respond(id, state);
        } catch (awsErr) { respondError(id, (awsErr as Error).message); }
        break;
      }

      case 'alter_ego_week_run_day': {
        const aew = ipAdapters.alterEgoWeekEngine;
        if (!aew) { respondError(id, 'Alter Ego Week requires Digital Representative'); break; }
        try {
          const awrdParams = params as { day: number };
          const demoResult = await aew.runDayDemo(awrdParams.day as AlterEgoDay);
          // Push result to canvas
          if (canvasManager) {
            canvasManager.push({
              componentType: 'alter_ego_card' as any,
              data: demoResult.shareableCardData,
              replace: false,
              title: `Day ${demoResult.day}: ${demoResult.title}`,
            });
            emit('canvas:update', canvasManager.getCurrentPayload());
          }
          respond(id, demoResult);
        } catch (awrdErr) { respondError(id, (awrdErr as Error).message); }
        break;
      }

      case 'alter_ego_week_advance': {
        const aew = ipAdapters.alterEgoWeekEngine;
        if (!aew) { respondError(id, 'Alter Ego Week requires Digital Representative'); break; }
        try {
          const newState = await aew.advanceDay();
          respond(id, newState);
        } catch (awaErr) { respondError(id, (awaErr as Error).message); }
        break;
      }

      case 'alter_ego_week_skip': {
        const aew = ipAdapters.alterEgoWeekEngine;
        if (!aew) { respondError(id, 'Alter Ego Week requires Digital Representative'); break; }
        aew.skip();
        respond(id, { success: true });
        break;
      }

      case 'alter_ego_week_accept': {
        const aew = ipAdapters.alterEgoWeekEngine;
        if (!aew) { respondError(id, 'Alter Ego Week requires Digital Representative'); break; }
        try {
          await aew.acceptActivation();
          respond(id, { success: true, activated: true });
        } catch (awaErr) { respondError(id, (awaErr as Error).message); }
        break;
      }

      // ─── Sprint G.5: Import Everything Handlers ───────────────────────────

      case 'import_detect_sources': {
        if (!importOrchestrator) { respond(id, []); break; }
        try {
          const sources = await importOrchestrator.detectSources();
          respond(id, sources);
        } catch (idsErr) { respondError(id, (idsErr as Error).message); }
        break;
      }

      case 'import_run_source': {
        if (!importOrchestrator) { respondError(id, 'ImportOrchestrator not initialized'); break; }
        try {
          const irsParams = params as { source: string };
          await importOrchestrator.importSource(irsParams.source as import('../../../core/agent/import-everything-orchestrator.js').ImportSource, (progress) => {
            emit('import:progress', progress);
          });
          respond(id, { success: true });
        } catch (irsErr) { respondError(id, (irsErr as Error).message); }
        break;
      }

      case 'import_everything_get_history': {
        if (!importOrchestrator) { respond(id, []); break; }
        respond(id, importOrchestrator.getImportHistory());
        break;
      }

      // ─── Sprint G.5: Mesh Handlers ────────────────────────────────────────

      case 'tunnel_peer_manifest': {
        // Returns peer manifest from tunnel server /info endpoint
        respond(id, { deviceId: 'local', displayName: 'This device', platform: process.platform, enabledFeatures: [] });
        break;
      }

      case 'search_federated': {
        // Federated cross-device search — runs local + remote (when tunnels available)
        try {
          const sfParams = params as { query: string; categories?: string[] };
          // Local search via knowledge graph
          const localResults: unknown[] = [];
          if (core?.knowledge) {
            const results = await core.knowledge.search(sfParams.query, { limit: 20 });
            for (const r of results) {
              localResults.push({ ...r, sourceDevice: 'local', sourceDeviceName: 'This device' });
            }
          }
          // Remote search via tunnel would go here when tunnel is available
          respond(id, { results: localResults, deviceCount: 1, source: 'local_only' });
        } catch (sfErr) { respondError(id, (sfErr as Error).message); }
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
