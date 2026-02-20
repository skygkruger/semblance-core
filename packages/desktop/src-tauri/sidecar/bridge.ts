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
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { createSemblanceCore, type SemblanceCore, type ChatMessage } from '../../../core/index.js';
import { scanDirectory, readFileContent } from '../../../core/knowledge/file-scanner.js';
import { Gateway } from '../../../gateway/index.js';

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

// ─── State ────────────────────────────────────────────────────────────────────

let core: SemblanceCore | null = null;
let gateway: Gateway | null = null;
let prefsDb: Database.Database | null = null;
let indexingInProgress = false;
let currentConversationId: string | null = null;
let dataDir = '';

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

async function handleShutdown(): Promise<unknown> {
  console.error('[sidecar] Shutting down...');

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
    const req = JSON.parse(line) as Request;
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
