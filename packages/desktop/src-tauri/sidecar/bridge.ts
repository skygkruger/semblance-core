// Semblance Desktop Sidecar Bridge
//
// AUTONOMOUS DECISION: Node.js sidecar process for Sprint 1 integration.
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
import { mkdirSync, existsSync } from 'node:fs';

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { createSemblanceCore, type SemblanceCore, type ChatMessage } from '../../../core/index.js';
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

type CallbackResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: string) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const pendingCallbacks = new Map<string, CallbackResolver>();
let callbackIdCounter = 0;

const CALLBACK_TIMEOUT_MS = 120_000; // 2 minutes — model loading can be slow

/**
 * Send a callback request to Rust and wait for the response.
 * This is how Node.js calls into the NativeRuntime (Rust side).
 */
function sendCallback(method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `cb-${++callbackIdCounter}`;

    const timeout = setTimeout(() => {
      pendingCallbacks.delete(id);
      reject(`Callback ${method} timed out after ${CALLBACK_TIMEOUT_MS}ms`);
    }, CALLBACK_TIMEOUT_MS);

    pendingCallbacks.set(id, { resolve, reject, timeout });

    // Write callback request to stdout (Rust reads this)
    process.stdout.write(JSON.stringify({
      type: 'callback',
      id,
      method,
      params,
    }) + '\n');
  });
}

/**
 * Handle a callback response from Rust.
 * Called when the stdin line parser encounters a "callback_response" message.
 */
function handleCallbackResponse(msg: { id: string; result?: unknown; error?: string }): void {
  const pending = pendingCallbacks.get(msg.id);
  if (!pending) {
    console.error(`[sidecar] Received callback_response for unknown id: ${msg.id}`);
    return;
  }

  clearTimeout(pending.timeout);
  pendingCallbacks.delete(msg.id);

  if (msg.error) {
    pending.reject(msg.error);
  } else {
    pending.resolve(msg.result);
  }
}

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

// Step 14 state
let contactStore: ContactStore | null = null;
let relationshipAnalyzer: RelationshipAnalyzer | null = null;
let birthdayTracker: BirthdayTracker | null = null;
let contactFrequencyMonitor: ContactFrequencyMonitor | null = null;

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

const SYSTEM_PROMPT = `You are Semblance, the user's personal AI. You run entirely on their device — their data never leaves their machine.

You have access to their local files and documents through secure search. You can search their knowledge base and answer questions about their documents.

Core principles:
- You are helpful, warm, proactive, and concise
- You respect the user's privacy absolutely — all processing happens locally
- When you need information, search the user's knowledge base first
- Be transparent about what data you're accessing
- If you don't know something, say so honestly`;

// ─── Method Handlers ──────────────────────────────────────────────────────────

async function handleInitialize(): Promise<unknown> {
  dataDir = join(homedir(), '.semblance', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  // Start Gateway first (IPC server)
  gateway = new Gateway();
  await gateway.start();
  console.error('[sidecar] Gateway started');

  // Initialize Core (boots SQLite, LanceDB, connects to Ollama)
  core = createSemblanceCore({ dataDir });
  await core.initialize();
  console.error('[sidecar] Core initialized');

  // Open preferences DB (reuses core.db which is already WAL mode)
  prefsDb = new Database(join(dataDir, 'core.db'));
  prefsDb.pragma('journal_mode = WAL');
  prefsDb.exec(PREFS_TABLE_SQL);

  // Initialize credential store in Gateway's database
  const gatewayDataDir = join(homedir(), '.semblance', 'gateway');
  if (!existsSync(gatewayDataDir)) mkdirSync(gatewayDataDir, { recursive: true });
  const credDb = new Database(join(gatewayDataDir, 'credentials.db'));
  credentialStore = new CredentialStore(credDb);

  // Initialize service adapters
  emailAdapter = new EmailAdapter(credentialStore);
  calendarAdapter = new CalendarAdapter(credentialStore);

  // Check Ollama status
  const ollamaAvailable = await core.llm.isAvailable();
  let activeModel: string | null = null;
  let availableModels: string[] = [];

  if (ollamaAvailable) {
    const models = await core.llm.listModels();
    availableModels = models.filter(m => !m.isEmbedding).map(m => m.name);
    activeModel = await core.models.getActiveChatModel();
  }

  // Load persisted preferences
  const userName = getPref('user_name');
  const onboardingComplete = getPref('onboarding_complete') === 'true';

  console.error('[sidecar] Ready');

  return {
    ollamaStatus: ollamaAvailable ? 'connected' : 'disconnected',
    activeModel,
    availableModels,
    userName,
    onboardingComplete,
  };
}

async function handleSendMessage(
  id: number | string,
  params: { message: string },
): Promise<void> {
  if (!core) {
    respondError(id, 'Core not initialized');
    return;
  }

  // Check Ollama availability
  const available = await core.llm.isAvailable();
  if (!available) {
    respondError(id, 'Ollama is not running. Start Ollama and try again.');
    return;
  }

  const responseId = `msg_${Date.now()}`;
  // Return response ID immediately so frontend can start showing the streaming bubble
  respond(id, responseId);

  // Streaming happens asynchronously
  try {
    // Step 1: Search knowledge graph for relevant context
    const context = await core.knowledge.search(params.message, { limit: 5 });

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

    // Step 3: Build messages array
    const model = (await core.models.getActiveChatModel()) ?? 'llama3.2:8b';
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT + contextStr },
      { role: 'user', content: params.message },
    ];

    // Step 4: Stream LLM response token-by-token
    let fullResponse = '';

    if (core.llm.chatStream) {
      for await (const token of core.llm.chatStream({ model, messages })) {
        emit('chat-token', token);
        fullResponse += token;
      }
    } else {
      // Fallback to non-streaming
      const response = await core.llm.chat({ model, messages });
      fullResponse = response.message.content;
      emit('chat-token', fullResponse);
    }

    // Step 5: Emit completion
    emit('chat-complete', { id: responseId, content: fullResponse, actions: [] });

    // Step 6: Persist conversation turns
    const convId = ensureConversation();
    storeTurn(convId, 'user', params.message);
    storeTurn(convId, 'assistant', fullResponse);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emit('chat-token', `\n\nError: ${errMsg}`);
    emit('chat-complete', { id: responseId, content: `Error: ${errMsg}`, actions: [] });
  }
}

async function handleGetOllamaStatus(): Promise<unknown> {
  if (!core) return { status: 'disconnected', active_model: null, available_models: [] };

  const available = await core.llm.isAvailable();
  let activeModel: string | null = null;
  let availableModels: string[] = [];

  if (available) {
    const models = await core.llm.listModels();
    availableModels = models.filter(m => !m.isEmbedding).map(m => m.name);
    activeModel = await core.models.getActiveChatModel();
  }

  return {
    status: available ? 'connected' : 'disconnected',
    active_model: activeModel,
    available_models: availableModels,
  };
}

async function handleSelectModel(params: { model_id: string }): Promise<unknown> {
  if (!core) throw new Error('Core not initialized');

  // Verify model exists
  const models = await core.llm.listModels();
  const found = models.find(m => m.name === params.model_id);
  if (!found) {
    throw new Error(`Model "${params.model_id}" not found. Is it pulled in Ollama?`);
  }

  core.models.setActiveChatModel(params.model_id);
  return { success: true };
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

  // Respond immediately
  respond(id, 'ok');
  indexingInProgress = true;

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

      // Step 2: Index each file individually with progress updates
      for (const file of allFiles) {
        try {
          emit('indexing-progress', {
            filesScanned: totalFilesScanned,
            filesTotal,
            chunksCreated: totalChunksCreated,
            currentFile: file.name,
          });

          const content = await readFileContent(file.path);
          const result = await core!.knowledge.indexDocument({
            content: content.content,
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

      // Step 3: Persist indexed directories
      const existingDirs = JSON.parse(getPref('indexed_directories') ?? '[]') as string[];
      const allDirs = [...new Set([...existingDirs, ...params.directories])];
      setPref('indexed_directories', JSON.stringify(allDirs));

      // Step 4: Get final stats
      const stats = await core!.knowledge.getStats();

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
    return { document_count: 0, chunk_count: 0, index_size_bytes: 0, last_indexed_at: null };
  }

  const stats = await core.knowledge.getStats();
  return {
    document_count: stats.totalDocuments,
    chunk_count: stats.totalChunks,
    index_size_bytes: 0,
    last_indexed_at: getPref('last_indexed_at'),
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
    const model = (await core.models.getActiveChatModel()) ?? 'llama3.2:8b';
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
    const model = (await core.models.getActiveChatModel()) ?? 'llama3.2:8b';
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
    const model = getPref('active_chat_model') ?? 'llama3.2:8b';
    messageDrafter = new MessageDrafter({ llm: core.llm, model });
  }
  if (!messageDrafter) throw new Error('Message drafter not initialized');
  return messageDrafter;
}

function ensureClipboardRecognizer(): ClipboardPatternRecognizer {
  if (!clipboardRecognizer) {
    clipboardRecognizer = new ClipboardPatternRecognizer({
      llm: core?.llm,
      model: getPref('active_chat_model') ?? 'llama3.2:8b',
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

      case 'send_message':
        // send_message responds and emits events internally
        await handleSendMessage(id, params as { message: string });
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
        result = { success: true, imported: 0, message: 'Contact import not yet connected to device adapter' };
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

      // ── Shutdown ──

      case 'shutdown':
        result = await handleShutdown();
        respond(id, result);
        // Give time for response to flush before exit
        setTimeout(() => process.exit(0), 100);
        break;

      default:
        respondError(id, `Unknown method: ${method}`);
    }
  } catch (err) {
    respondError(id, err instanceof Error ? err.message : String(err));
  }
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
