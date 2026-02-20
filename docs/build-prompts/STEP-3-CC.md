# STEP 3: The AI Core — Reasoning, Memory, and Agency

## Context

Steps 1–2 built the skeleton (project structure, design system, privacy audit) and the hard boundary (Gateway with IPC protocol, validation pipeline, action signing, audit trail — 88 tests proving it works). Now we build the brain.

This step constructs the AI Core: the LLM integration layer, the knowledge graph, and the agent orchestration framework that connects reasoning to action via the Gateway's IPC channel. Everything in this step lives in `packages/core/`. Everything in this step has ZERO internet access.

Read CLAUDE.md first. Read it again. Then read DESIGN_SYSTEM.md. Then come back here.

## Critical Architectural Decision: Ollama and Localhost

The `ollama` npm package (pre-approved in CLAUDE.md) communicates with the local Ollama server via HTTP to `http://localhost:11434`. This is technically a network call. Here is how we handle it:

**The Ollama client is the SOLE exception to Rule 1's network ban in the AI Core, under these exact constraints:**

1. The `ollama` package is allowed in `packages/core/llm/` ONLY
2. It may ONLY connect to `localhost` / `127.0.0.1` — never to any remote host
3. The LLM adapter must enforce this: if the Ollama base URL is not localhost, refuse to initialize
4. The privacy audit must be updated to allow `ollama` as a known-safe import in `packages/core/llm/` specifically, while continuing to block all other networking imports in `packages/core/`
5. A comment in the LLM adapter and in the privacy audit explains WHY this exception exists

**Why not route LLM calls through the Gateway?** The Gateway's design rule is: "It does not reason about user data." LLM inference IS reasoning about user data — prompts contain the user's questions, their documents, their context. Routing this through the Gateway would violate the Gateway's boundary rule and create an unnecessary bottleneck. The Ollama server is a local process on the same machine, architecturally equivalent to a local database. The privacy guarantee holds: no data leaves the device.

**Update the privacy audit script** (`scripts/privacy-audit/`) to:
- Allow `ollama` as an import ONLY in files under `packages/core/llm/`
- Block `ollama` in all other `packages/core/` directories
- Continue blocking all other networking imports (`fetch`, `axios`, `http`, etc.) everywhere in `packages/core/`
- Add a clear comment explaining the Ollama localhost exception

## What To Build

### 1. LLM Integration Layer (`packages/core/llm/`)

The reasoning engine. Wraps Ollama (default) with an abstraction that supports future backends (llama.cpp, MLX).

**`packages/core/llm/types.ts`** — LLM interface types:

```typescript
export interface LLMProvider {
  /** Check if the provider is available and responsive */
  isAvailable(): Promise<boolean>;

  /** Generate a text completion */
  generate(request: GenerateRequest): Promise<GenerateResponse>;

  /** Generate a chat completion (multi-turn) */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Generate embeddings for text (used by knowledge graph) */
  embed(request: EmbedRequest): Promise<EmbedResponse>;

  /** List available models */
  listModels(): Promise<ModelInfo[]>;

  /** Get info about a specific model */
  getModel(name: string): Promise<ModelInfo | null>;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;      // 0.0–2.0, default 0.7
  maxTokens?: number;        // default 2048
  stop?: string[];
  format?: 'json';           // Force JSON output
}

export interface GenerateResponse {
  text: string;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  durationMs: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  format?: 'json';
  tools?: ToolDefinition[];   // For function-calling
}

export interface ChatResponse {
  message: ChatMessage;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  durationMs: number;
  toolCalls?: ToolCall[];     // If the model invoked tools
}

export interface EmbedRequest {
  model: string;              // e.g., 'nomic-embed-text', 'all-minilm'
  input: string | string[];   // Single text or batch
}

export interface EmbedResponse {
  embeddings: number[][];     // One embedding vector per input
  model: string;
  durationMs: number;
}

export interface ModelInfo {
  name: string;               // e.g., 'llama3.2:8b-instruct-q4_K_M'
  size: number;               // bytes
  parameterCount?: string;    // e.g., '8B'
  quantization?: string;      // e.g., 'Q4_K_M'
  family?: string;            // e.g., 'llama'
  isEmbedding: boolean;       // True for embedding models
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema for parameters
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}
```

**`packages/core/llm/ollama-provider.ts`** — The default LLM provider:

- Import the `ollama` npm package (pre-approved)
- **CRITICAL: On initialization, verify the base URL is localhost.** If `new URL(baseUrl).hostname` is not `localhost`, `127.0.0.1`, or `::1`, throw an error and refuse to initialize. This is a hard safety check.
- Implement all `LLMProvider` methods by wrapping the Ollama JS client
- Handle connection errors gracefully: if Ollama isn't running, return clear error messages (not crashes)
- Support streaming internally but return complete responses (streaming to UI is a later concern)
- Map Ollama's response format to our typed `GenerateResponse` / `ChatResponse` / `EmbedResponse`
- Default model selection: try `llama3.2:8b` first, fall back to whatever's available, inform user if no models installed
- Default embedding model: `nomic-embed-text` or `all-minilm`

**`packages/core/llm/model-manager.ts`** — Model lifecycle management:

- List installed models (via Ollama API)
- Get recommended models for the user's hardware (check available RAM, suggest appropriate quantization)
- Track which model is active for chat vs. embedding
- Store user's model preferences in SQLite (via the structured storage layer — see section 3)
- Provide sensible defaults: if no preference set, pick the best available model

**`packages/core/llm/index.ts`** — Export the provider interface and Ollama implementation. Factory function:

```typescript
export function createLLMProvider(config?: { baseUrl?: string }): LLMProvider {
  return new OllamaProvider(config);
}
```

### 2. Knowledge Graph (`packages/core/knowledge/`)

The memory. All personal data indexed, embedded, and searchable locally.

**`packages/core/knowledge/types.ts`** — Knowledge graph types:

```typescript
export interface Document {
  id: string;                 // nanoid
  source: DocumentSource;
  sourcePath?: string;        // File path, email ID, etc.
  title: string;
  content: string;            // Full text content
  contentHash: string;        // SHA-256 of content (dedup)
  mimeType: string;
  createdAt: string;          // ISO 8601
  updatedAt: string;
  indexedAt: string;          // When we indexed it
  metadata: Record<string, unknown>;
}

export type DocumentSource =
  | 'local_file'
  | 'email'
  | 'calendar'
  | 'contact'
  | 'note'
  | 'financial'
  | 'health'
  | 'browser_history'
  | 'manual';

export interface DocumentChunk {
  id: string;
  documentId: string;         // Parent document
  content: string;            // Chunk text
  chunkIndex: number;         // Position within document
  embedding?: number[];       // Vector embedding (stored in LanceDB)
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  chunk: DocumentChunk;
  document: Document;
  score: number;              // Similarity score (0–1)
  highlights?: string[];      // Matching passages for display
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];          // Alternative names/spellings
  firstSeen: string;          // ISO 8601
  lastSeen: string;
  metadata: Record<string, unknown>;
}

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'project'
  | 'event'
  | 'topic';

export interface EntityMention {
  entityId: string;
  documentId: string;
  chunkId: string;
  context: string;            // Surrounding text
  mentionedAt: string;
}
```

**`packages/core/knowledge/vector-store.ts`** — Vector storage using LanceDB:

- Initialize LanceDB in the user's data directory (e.g., `~/.semblance/data/vectors/`)
- **Table: `document_chunks`** — stores chunk ID, document ID, content, embedding vector, metadata
- **Insert method:** Accept a DocumentChunk with embedding, upsert into LanceDB
- **Search method:** Accept a query embedding vector + limit, return nearest neighbors with scores
- **Delete method:** Remove all chunks for a given document ID (for re-indexing)
- **Count method:** Total chunks indexed

LanceDB is pre-approved and embedded (no server process). It stores data as local Arrow/Parquet files. No network access.

**`packages/core/knowledge/document-store.ts`** — Document metadata storage using SQLite:

- SQLite database at `~/.semblance/data/documents.db`
- **Tables:**
  ```sql
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_path TEXT,
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    metadata TEXT              -- JSON
  );

  CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    aliases TEXT,              -- JSON array
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    metadata TEXT
  );

  CREATE TABLE entity_mentions (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id),
    document_id TEXT NOT NULL REFERENCES documents(id),
    chunk_id TEXT NOT NULL,
    context TEXT,
    mentioned_at TEXT NOT NULL
  );

  CREATE INDEX idx_docs_source ON documents(source);
  CREATE INDEX idx_docs_hash ON documents(content_hash);
  CREATE INDEX idx_entities_type ON entities(type);
  CREATE INDEX idx_entities_name ON entities(name);
  CREATE INDEX idx_mentions_entity ON entity_mentions(entity_id);
  CREATE INDEX idx_mentions_doc ON entity_mentions(document_id);
  ```
- Standard CRUD operations for documents and entities
- Deduplication: before inserting a document, check if content_hash already exists
- WAL mode enabled for concurrent reads during indexing

**`packages/core/knowledge/chunker.ts`** — Document chunking:

- Split documents into chunks suitable for embedding
- **Strategy:** Recursive character text splitting with overlap
- **Default parameters:** chunk size 512 tokens (~2000 chars), overlap 50 tokens (~200 chars)
- Respect paragraph and sentence boundaries where possible
- Return `DocumentChunk[]` with chunk index and content

**`packages/core/knowledge/indexer.ts`** — The indexing pipeline:

- Accepts a document (text content + metadata)
- Chunks the document via chunker
- Generates embeddings for each chunk via the LLM provider's `embed()` method
- Stores document metadata in SQLite (document-store)
- Stores chunks with embeddings in LanceDB (vector-store)
- Handles re-indexing: if a document with the same source_path exists, delete old chunks and re-index
- Returns indexing stats (chunks created, time taken)

**`packages/core/knowledge/search.ts`** — Semantic search:

- Accepts a natural language query string
- Generates query embedding via the LLM provider
- Searches LanceDB for nearest neighbors
- Enriches results with document metadata from SQLite
- Returns `SearchResult[]` sorted by relevance score
- **Hybrid search (stretch goal):** combine vector similarity with keyword matching for better recall. If time permits, implement BM25 keyword scoring alongside vector search and merge results. If not, vector-only is fine for v1.

**`packages/core/knowledge/file-scanner.ts`** — Local file discovery:

- Scan a user-specified directory (or set of directories) for indexable files
- Supported file types for v1: `.txt`, `.md`, `.pdf`, `.docx`, `.csv`, `.json`
- For PDF: extract text using a local PDF parsing library (see dependency note below)
- For DOCX: extract text using a local DOCX parsing library
- Watch mode (stretch goal): use filesystem watchers to detect changes and re-index automatically. If time permits, implement with `chokidar` or Node.js `fs.watch`. If not, manual re-scan is fine for v1.
- Return a list of discovered files with paths, sizes, and last-modified timestamps
- Exclude hidden files, node_modules, and common non-document directories

**PDF/DOCX parsing dependency note:** You'll need libraries for PDF and DOCX text extraction. Options:
- PDF: `pdf-parse` (lightweight, no native deps) or `pdfjs-dist` (Mozilla's PDF.js)
- DOCX: `mammoth` (lightweight DOCX → text/HTML)
Both are document-parsing libraries with NO network capabilities. They are acceptable in `packages/core/` because they process local files only. Justify the dependency choice in your commit message.

**`packages/core/knowledge/index.ts`** — Export a unified KnowledgeGraph interface:

```typescript
export interface KnowledgeGraph {
  /** Index a document into the knowledge graph */
  indexDocument(doc: { content: string; title: string; source: DocumentSource; sourcePath?: string; mimeType: string; metadata?: Record<string, unknown> }): Promise<{ documentId: string; chunksCreated: number; durationMs: number }>;

  /** Search the knowledge graph */
  search(query: string, options?: { limit?: number; source?: DocumentSource }): Promise<SearchResult[]>;

  /** Scan and index files from a directory */
  scanDirectory(dirPath: string): Promise<{ filesFound: number; filesIndexed: number; errors: string[] }>;

  /** Get document by ID */
  getDocument(id: string): Promise<Document | null>;

  /** Get all documents with optional filtering */
  listDocuments(options?: { source?: DocumentSource; limit?: number; offset?: number }): Promise<Document[]>;

  /** Get indexing statistics */
  getStats(): Promise<{ totalDocuments: number; totalChunks: number; sources: Record<string, number> }>;

  /** Delete a document and its chunks */
  deleteDocument(id: string): Promise<void>;
}
```

Factory function to create the knowledge graph, wiring together all sub-components:

```typescript
export function createKnowledgeGraph(config: { dataDir: string; llmProvider: LLMProvider }): KnowledgeGraph
```

### 3. Agent Orchestration (`packages/core/agent/`)

The executor. Connects the LLM's reasoning to real-world actions through the Gateway's IPC channel.

**`packages/core/agent/types.ts`** — Agent types:

```typescript
import { ActionType, ActionRequest, ActionResponse } from '../types/ipc.js';

export type AutonomyTier = 'guardian' | 'partner' | 'alter_ego';

export interface AutonomyConfig {
  defaultTier: AutonomyTier;
  domainOverrides: Partial<Record<AutonomyDomain, AutonomyTier>>;
}

export type AutonomyDomain =
  | 'email'
  | 'calendar'
  | 'finances'
  | 'health'
  | 'files'
  | 'services';

export interface AgentAction {
  id: string;
  action: ActionType;
  payload: Record<string, unknown>;
  reasoning: string;          // Why the agent wants to do this
  domain: AutonomyDomain;
  tier: AutonomyTier;         // What tier applies to this action
  status: 'pending_approval' | 'approved' | 'executed' | 'rejected' | 'failed';
  createdAt: string;
  executedAt?: string;
  response?: ActionResponse;
}

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context?: SearchResult[];   // Knowledge graph context used
  actions?: AgentAction[];    // Actions taken during this turn
}
```

**`packages/core/agent/ipc-client.ts`** — The Core's side of the IPC connection:

- Connects to the Gateway's IPC socket as a client
- Uses the same length-prefixed JSON framing protocol from Step 2
- Imports `signRequest` from `@semblance/core/types/signing` to sign outgoing requests
- Sends `ActionRequest`, receives `ActionResponse`
- Handles connection lifecycle: connect, reconnect on failure, graceful disconnect
- **Does NOT import anything from `packages/gateway/`.** Uses only the shared types from `packages/core/types/`

This is the critical integration point: the Core constructs typed ActionRequests, signs them, and sends them to the Gateway we built in Step 2. The Gateway validates, executes, and responds.

```typescript
export interface IPCClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendAction(action: ActionType, payload: Record<string, unknown>): Promise<ActionResponse>;
}
```

The `sendAction` method:
1. Constructs an `ActionRequest` (generates nanoid, ISO timestamp, sets source to 'core')
2. Signs the request using the shared HMAC key
3. Sends via IPC socket using length-prefixed JSON
4. Waits for the `ActionResponse`
5. Returns the response

**Key management note:** The IPC client needs the HMAC key to sign requests. The key is stored in the Gateway's SQLite database. For the IPC client, the key must be accessible to the Core process too. Two options:
- **Option A:** Store the key in a shared location both processes can read (e.g., a key file in `~/.semblance/`)
- **Option B:** The Gateway sends the key to the Core during an initial handshake over IPC

**Use Option A.** The key file is simpler, avoids protocol complexity, and the key is already local-only. Store it at `~/.semblance/signing.key`, readable only by the current user (file permissions 0600). The Gateway generates this file on first run (it already generates the key — now also write it to disk). The Core reads it on startup.

**`packages/core/agent/autonomy.ts`** — Autonomy tier logic:

- Stores autonomy configuration in SQLite (domain → tier mapping)
- Given an action, determines which domain it falls into and what tier applies
- Returns whether the action requires approval, can execute automatically, or is blocked
- Decision matrix:
  - **Guardian:** ALL actions require explicit user approval
  - **Partner:** Read actions (fetch) are automatic. Write actions (draft, create) are automatic for routine patterns. Execute actions (send, book) require approval unless they match a learned routine
  - **Alter Ego:** All actions automatic except those flagged as high-stakes (large financial transactions, legal documents, irreversible actions)

For v1, implement Guardian and Partner mode fully. Alter Ego can be a stub that behaves like Partner with fewer approval requirements — the full "learns your patterns" behavior is Sprint 4.

**`packages/core/agent/orchestrator.ts`** — The main reasoning loop:

This is the heart of Semblance. It:

1. Receives a user message (or a proactive trigger)
2. Retrieves relevant context from the knowledge graph
3. Constructs a prompt with system instructions, context, conversation history, and the user's message
4. Sends the prompt to the LLM
5. Parses the LLM's response for any tool calls / action requests
6. For each action: checks autonomy tier, queues for approval or executes via IPC client
7. If actions were executed, optionally sends results back to the LLM for a follow-up response
8. Returns the final response to the presentation layer

```typescript
export interface Orchestrator {
  /** Process a user message and return a response */
  processMessage(message: string, conversationId?: string): Promise<OrchestratorResponse>;

  /** Get conversation history */
  getConversation(conversationId: string): Promise<ConversationTurn[]>;

  /** Approve a pending action */
  approveAction(actionId: string): Promise<ActionResponse>;

  /** Reject a pending action */
  rejectAction(actionId: string): Promise<void>;

  /** Get pending actions awaiting approval */
  getPendingActions(): Promise<AgentAction[]>;
}

export interface OrchestratorResponse {
  message: string;                    // The assistant's text response
  conversationId: string;
  actions: AgentAction[];             // Actions taken or pending
  context: SearchResult[];            // Knowledge context used
  tokensUsed: { prompt: number; completion: number };
}
```

The system prompt template for the LLM should:
- Identify Semblance as the user's personal AI
- Explain its capabilities (search files, manage email, etc.)
- Define the available tools/actions and their schemas
- Instruct the model to use tools when appropriate
- Set the tone: helpful, warm, proactive, concise

**Tool calling implementation:** Use the LLM's function-calling capabilities (Ollama supports this for compatible models). Define tools that map to ActionTypes:

```typescript
const tools: ToolDefinition[] = [
  {
    name: 'search_files',
    description: 'Search the user\'s local files and documents for relevant information',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  },
  {
    name: 'send_email',
    description: 'Send an email on behalf of the user',
    parameters: { /* matches EmailSendPayload schema */ }
  },
  {
    name: 'fetch_email',
    description: 'Fetch recent emails from the user\'s inbox',
    parameters: { /* matches EmailFetchPayload schema */ }
  },
  // ... one per ActionType
];
```

When the LLM returns a tool call, the orchestrator:
1. Maps the tool name to an ActionType
2. Checks autonomy (approve automatically or queue for user approval)
3. If approved: sends to Gateway via IPC client, gets response, optionally feeds back to LLM
4. If requires approval: adds to pending queue, informs user

**Conversation storage:** Store conversation history in SQLite. Simple table:
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  title TEXT
);

CREATE TABLE conversation_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  context_json TEXT,           -- JSON array of search results used
  actions_json TEXT,           -- JSON array of actions taken
  tokens_prompt INTEGER,
  tokens_completion INTEGER
);

CREATE INDEX idx_turns_conversation ON conversation_turns(conversation_id);
```

**`packages/core/agent/index.ts`** — Export the orchestrator:

```typescript
export function createOrchestrator(config: {
  llmProvider: LLMProvider;
  knowledgeGraph: KnowledgeGraph;
  ipcClient: IPCClient;
  autonomyConfig?: AutonomyConfig;
  dataDir: string;
}): Orchestrator
```

### 4. Core Entry Point (`packages/core/index.ts`)

Wire everything together into a clean public API:

```typescript
export interface SemblanceCore {
  /** The LLM provider */
  llm: LLMProvider;

  /** The knowledge graph */
  knowledge: KnowledgeGraph;

  /** The agent orchestrator */
  agent: Orchestrator;

  /** The IPC client for Gateway communication */
  ipc: IPCClient;

  /** Initialize all subsystems */
  initialize(): Promise<void>;

  /** Shut down gracefully */
  shutdown(): Promise<void>;
}

export function createSemblanceCore(config: {
  dataDir: string;           // e.g., ~/.semblance/data/
  ollamaBaseUrl?: string;    // default: http://localhost:11434
  signingKeyPath?: string;   // default: ~/.semblance/signing.key
  socketPath?: string;       // default: ~/.semblance/gateway.sock
  autonomyConfig?: AutonomyConfig;
}): SemblanceCore
```

The `initialize()` method:
1. Create the LLM provider (verify Ollama is running, check available models)
2. Create the knowledge graph (initialize LanceDB + SQLite)
3. Create the IPC client (connect to Gateway)
4. Create the orchestrator (wire LLM + knowledge + IPC)
5. Log initialization status (but NOT to the Gateway audit trail — Core manages its own internal state)

### 5. Tests

**LLM integration tests (`tests/core/llm/`):**
- OllamaProvider refuses to initialize with non-localhost URL
- OllamaProvider.isAvailable() returns false when Ollama isn't running (no crash)
- OllamaProvider correctly maps Ollama responses to typed responses
- Model manager lists models, selects defaults
- Note: Tests that require a running Ollama instance should be marked as integration tests and skippable when Ollama is not available. Use an environment variable or probe `localhost:11434` to decide.

**Knowledge graph tests (`tests/core/knowledge/`):**
- Document indexing: index a document, verify chunks created in LanceDB and metadata in SQLite
- Document deduplication: indexing same content twice doesn't create duplicates
- Semantic search: index 3 documents, search for a concept mentioned in one, verify it ranks first
- File scanner: discovers .txt and .md files in a test directory, ignores hidden files
- Chunker: splits long text into appropriately sized chunks with overlap
- Delete: deleting a document removes its chunks from both stores
- Note: Embedding/search tests require a running Ollama with an embedding model. Mark as integration tests.

**Agent tests (`tests/core/agent/`):**
- IPC client constructs valid ActionRequests with correct signing
- IPC client handles connection failure gracefully
- Autonomy: Guardian mode requires approval for all actions
- Autonomy: Partner mode auto-approves read actions, requires approval for execute actions
- Orchestrator: user message → knowledge search → LLM prompt → response (mock LLM)
- Orchestrator: LLM tool call → autonomy check → IPC send (mock IPC client)
- Conversation history: turns are stored and retrievable

**Privacy audit (`npm run privacy-audit`):**
- Still passes after Ollama exception is added
- Verifies `ollama` import only appears in `packages/core/llm/`
- Verifies no other networking imports in `packages/core/`

**Unit tests should mock external dependencies (Ollama, LanceDB, Gateway IPC) so they run fast and without infrastructure. Integration tests that need Ollama running should be clearly separated and skippable.**

### 6. Privacy Audit Update

Update `scripts/privacy-audit/` to handle the Ollama exception:

```
ALLOWED EXCEPTIONS:
- packages/core/llm/**  may import 'ollama' (localhost-only LLM client)

BLOCKED EVERYWHERE in packages/core/:
- fetch, XMLHttpRequest, WebSocket
- http, https, net, dgram, dns, tls
- axios, got, node-fetch, undici, superagent
- socket.io, ws
- reqwest, hyper, tokio::net, std::net

BLOCKED in packages/core/ EXCEPT packages/core/llm/:
- ollama
```

The audit must still exit 0 for the build to pass. Add tests that verify:
- An `ollama` import in `packages/core/llm/` passes the audit
- An `ollama` import in `packages/core/knowledge/` fails the audit
- A `fetch` import anywhere in `packages/core/` fails the audit

## What NOT To Build

- No email/calendar/finance service adapters (those are Sprint 2 features, Gateway-side)
- No UI (that's the desktop/mobile packages, Step 4+)
- No onboarding flow
- No proactive engine (Sprint 2 background process)
- No real Alter Ego learning/adaptation (Sprint 4)
- No file watching / automatic re-indexing (stretch goal, skip if time-constrained)
- No hybrid search (stretch goal, skip if time-constrained)

## Exit Criteria

Step 3 is complete when ALL of the following are true:

1. ✅ `packages/core/llm/`: OllamaProvider implements LLMProvider interface, refuses non-localhost URLs
2. ✅ `packages/core/llm/`: Model manager lists models and selects defaults
3. ✅ `packages/core/knowledge/`: Documents can be indexed (chunked → embedded → stored in LanceDB + SQLite)
4. ✅ `packages/core/knowledge/`: Semantic search returns relevant results from indexed documents
5. ✅ `packages/core/knowledge/`: File scanner discovers and indexes local files (.txt, .md, .pdf, .docx)
6. ✅ `packages/core/knowledge/`: Document deduplication works (same content_hash → no duplicate)
7. ✅ `packages/core/agent/`: IPC client connects to Gateway socket, sends signed ActionRequests, receives ActionResponses
8. ✅ `packages/core/agent/`: Autonomy tiers work: Guardian requires all approvals, Partner auto-approves reads
9. ✅ `packages/core/agent/`: Orchestrator processes a user message → searches knowledge → calls LLM → returns response
10. ✅ `packages/core/agent/`: Orchestrator handles LLM tool calls → checks autonomy → routes to IPC client
11. ✅ `packages/core/index.ts`: SemblanceCore initializes all subsystems via single `initialize()` call
12. ✅ Privacy audit passes with Ollama exception properly scoped to `packages/core/llm/` only
13. ✅ All unit tests pass (mocked dependencies, no Ollama required)
14. ✅ TypeScript compiles with zero errors across all packages
15. ✅ No imports from `packages/gateway/` appear anywhere in `packages/core/` (except shared types from `packages/core/types/`)

## Commit Strategy

1. `feat: add LLM provider interface and Ollama implementation`
2. `feat: add model manager with hardware-aware defaults`
3. `feat: add knowledge graph types and document store (SQLite)`
4. `feat: add vector store (LanceDB) and document chunker`
5. `feat: add indexer and semantic search`
6. `feat: add file scanner for local document discovery`
7. `feat: add agent types, autonomy framework, and IPC client`
8. `feat: add orchestrator with tool-calling and conversation management`
9. `feat: add SemblanceCore entry point wiring all subsystems`
10. `security: update privacy audit for Ollama localhost exception`
11. `test: add Core test suites (LLM, knowledge, agent, privacy)`

## After Completion

Report back with:
- Confirmation of each exit criteria (pass/fail)
- Test count and pass/fail summary (separate unit vs. integration counts)
- Any decisions you made that weren't explicitly specified (so Orbital Directors can verify)
- Any issues encountered and how you resolved them
- Confirmation that the privacy audit passes
- Which stretch goals (hybrid search, file watching) you implemented, if any

Do NOT proceed to Step 4. Wait for Orbital Director review.
