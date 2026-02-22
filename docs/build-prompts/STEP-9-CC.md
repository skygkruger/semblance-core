# Sprint 3 — Step 9: Runtime Ownership + Embedding Pipeline

## Implementation Prompt for Claude Code

**Date:** February 21, 2026
**Prerequisite:** Sprint 2 complete (Steps 5–8 ✅ — 1,239 tests passing, privacy audit clean, all 8 Sprint 2 exit criteria met)
**Test Baseline:** 1,239 passing tests, privacy audit exit 0
**Sprint 3 Step Sequence:** Step 9 (this) → Step 10 (Financial Awareness) → Step 11 (Communication Style + Digital Rep) → Step 12 (Form Automation) → Step 13 (Health & Wellness) → Step 14 (Mobile Parity + Task Routing) → Step 15 (Autonomy Refinement + Digest + Validation)

---

## Mission

Make Semblance a consumer product. When this step is complete, a new user downloads Semblance, opens it, and has a working AI within 5 minutes — no terminal, no Ollama install, no model selection, no developer workflow. The native inference runtime is bundled, model downloads are managed, hardware is auto-detected, and the embedding pipeline is wired end-to-end for semantic search across the knowledge graph.

**This is the highest-risk, highest-reward step in the entire project.** Every Sprint 3 feature depends on it. If native inference doesn't work reliably, nothing else in Sprint 3 ships. Build defensively. Test aggressively. Fail fast on the hard problems.

---

## Context — What Exists Today

The current LLM layer (`packages/core/llm/`) was built in Sprint 1 Step 3 and works as follows:

- `ollama-provider.ts` implements the `LLMProvider` interface and connects to a locally-running Ollama instance
- `model-manager.ts` handles model listing and preference storage
- `types.ts` defines the provider interfaces (`LLMProvider`, `LLMResponse`, etc.)
- The Ollama provider has a hard safety check: constructor validates the URL is `localhost` only
- The sidecar bridge (NDJSON over stdin/stdout) connects the Tauri Rust backend to the Node.js AI Core process

The current architecture **requires the user to independently install and run Ollama** before Semblance works. This is a developer workflow, not a consumer product. Step 9 replaces this with a bundled, managed runtime.

### What Exists in the Knowledge Graph

- `packages/core/knowledge/document-store.ts` — SQLite-based metadata
- `packages/core/knowledge/vector-store.ts` — LanceDB-backed vector storage
- Email, calendar, and file indexers generate metadata and store documents
- **Gap:** Semantic search is not wired. The embedding pipeline uses keyword matching via existing infrastructure. Embeddings are not being generated or stored in LanceDB. Semantic search across the knowledge graph does not work.

### What Exists in the Gateway

- Model downloads are network operations — they MUST flow through the Gateway
- The Gateway has an allowlist system, audit trail, and rate limiting already built
- A new `ActionType` will be needed for model download operations

---

## Architecture — What to Build

### A. Native Inference Runtime

**The default path replaces Ollama with a bundled native runtime.**

#### Desktop Runtime: llama.cpp via Rust

Use `llama-cpp-rs` (Rust bindings to llama.cpp) as the primary desktop inference backend. This runs inside the Tauri Rust backend process, not as a separate sidecar.

**Implementation approach:**

1. Add `llama-cpp-rs` as a Rust dependency in `packages/desktop/src-tauri/Cargo.toml`
2. Create a `NativeRuntime` Rust module that:
   - Loads GGUF model files from the app data directory
   - Provides `generate(prompt, params) -> stream<tokens>` and `embed(text) -> Vec<f32>` APIs
   - Manages model loading/unloading (only one model loaded at a time for memory safety; swap on tier change)
   - Exposes GPU detection: CUDA availability, Metal availability, Vulkan availability, CPU-only fallback
3. Bridge the NativeRuntime to the Node.js AI Core via the existing sidecar bridge protocol (new message types for native inference)
4. Create `packages/core/llm/native-provider.ts` implementing the existing `LLMProvider` interface — this calls through the sidecar bridge to the Rust NativeRuntime instead of calling Ollama's HTTP API

**Key constraint:** The NativeRuntime lives in the Tauri Rust backend (`packages/desktop/src-tauri/`). The AI Core (`packages/core/`) communicates with it via the sidecar bridge. The AI Core itself does NOT link against llama.cpp or any native code directly — it sends typed requests through the bridge, maintaining the existing process architecture.

**GPU backend selection (build-time):**
- macOS: Metal (via llama.cpp's Metal backend). Always available on Apple Silicon.
- Linux: CUDA if NVIDIA detected, Vulkan as fallback, CPU as last resort
- Windows: CUDA if NVIDIA detected, Vulkan as fallback, CPU as last resort

For the initial implementation, **target Metal (macOS) and CPU as the two priority backends.** CUDA and Vulkan support can follow in Step 14 or Sprint 4. This keeps scope manageable while covering the majority of early adopters (Mac users + anyone with decent CPU).

#### Apple Silicon Optimization: MLX (Future — Not Step 9)

MLX integration (via Swift bridge or `mlx-rs`) is a Step 14 deliverable for mobile and an optimization opportunity for desktop Apple Silicon. **Step 9 uses llama.cpp with Metal backend on macOS.** llama.cpp + Metal is already fast on Apple Silicon and avoids the complexity of a Swift bridge in Step 9.

**Rationale for deferral:** MLX adds a separate runtime with different model format requirements (MLX format vs GGUF), a Swift build chain dependency, and a new bridge layer. llama.cpp + Metal covers Apple Silicon desktop well. MLX becomes essential for iOS (Step 14) and as a desktop optimization (Sprint 4).

#### Provider Selection Logic

```
Startup:
  1. Check user preferences (SQLite settings table)
  2. If "Use Ollama" is configured → use OllamaProvider (existing)
  3. If "Custom model" is configured → use NativeProvider with custom model path
  4. Default → use NativeProvider with auto-detected hardware profile
```

The existing `OllamaProvider` remains functional and available as an option. No existing code is removed.

---

### B. Hardware Detection

On first launch (and on every app start for validation), detect:

```typescript
interface HardwareProfile {
  os: 'macos' | 'linux' | 'windows';
  arch: 'arm64' | 'x86_64';
  cpuCores: number;
  ramTotalGB: number;
  ramAvailableGB: number;
  gpu: {
    type: 'apple_silicon' | 'nvidia' | 'amd' | 'intel' | 'none';
    name: string;          // e.g., "Apple M2 Pro", "NVIDIA RTX 4090"
    vramGB?: number;       // discrete GPU only
    metalSupport?: boolean;
    cudaSupport?: boolean;
    vulkanSupport?: boolean;
  };
  diskAvailableGB: number;
  profile: HardwareProfileTier;  // Computed from the above
}

type HardwareProfileTier =
  | 'apple_silicon_high'    // M1 Pro/Max/Ultra+, 16GB+
  | 'apple_silicon_base'    // M1/M2, 8GB
  | 'desktop_gpu'           // Discrete NVIDIA/AMD, 16GB+ RAM
  | 'desktop_cpu'           // x86/ARM, 16GB+ RAM, no discrete GPU
  | 'desktop_constrained';  // 8GB RAM, no discrete GPU
```

Hardware detection runs in Rust (`packages/desktop/src-tauri/`). Results are passed to the Node.js process via the sidecar bridge and stored in SQLite for subsequent starts.

**Profile-to-model mapping:**

| Profile | Default Reasoning Model | Default Embedding Model |
|---------|------------------------|------------------------|
| `apple_silicon_high` | 7B Q4_K_M GGUF | nomic-embed-text-v1.5 GGUF |
| `apple_silicon_base` | 3B Q4_K_M GGUF | all-MiniLM-L6-v2 GGUF |
| `desktop_gpu` | 7B Q4_K_M GGUF | nomic-embed-text-v1.5 GGUF |
| `desktop_cpu` | 7B Q4_K_M GGUF | all-MiniLM-L6-v2 GGUF |
| `desktop_constrained` | 3B Q4_K_M GGUF | all-MiniLM-L6-v2 GGUF |

Specific model files (e.g., which 7B and 3B) will be determined during implementation based on what's available in GGUF format on Hugging Face. Good candidates:
- 7B: `Llama-3.2-7B-Instruct` or `Mistral-7B-Instruct-v0.3` (Q4_K_M quantization)
- 3B: `Llama-3.2-3B-Instruct` or `Phi-3-mini-4k-instruct` (Q4_K_M quantization)
- Embedding: `nomic-ai/nomic-embed-text-v1.5-GGUF` or `sentence-transformers/all-MiniLM-L6-v2` (GGUF quantized)

**Autonomous decision authority:** Claude Code may select specific model files based on availability, GGUF format support, and inference quality. Document the selection with rationale. If multiple viable options exist and the tradeoff is non-obvious, escalate.

---

### C. Model Management Pipeline

Model downloads are network operations. They MUST flow through the Gateway.

#### New ActionTypes

Add to the IPC protocol:

```typescript
type ActionType =
  // ... existing types ...
  | 'model.download'        // Download a model file
  | 'model.download_cancel' // Cancel an in-progress download
  | 'model.verify';         // Verify integrity of a downloaded model

interface ModelDownloadPayload {
  modelId: string;           // Registry identifier
  url: string;               // Download URL (huggingface.co)
  expectedSHA256: string;    // Integrity verification
  fileSizeBytes: number;     // For progress tracking
  destinationPath: string;   // Relative to app data directory
}
```

#### Gateway Model Download Handler

Create `packages/gateway/services/model-adapter.ts`:

1. Receives `model.download` action requests
2. Validates the URL is on the model download allowlist (see below)
3. Downloads with:
   - Progress tracking (emit progress events via IPC for UI)
   - Resume-on-interrupt (HTTP Range headers)
   - SHA-256 integrity verification after download completes
   - Disk space check before starting
4. Stores the model file in the app data directory
5. Logs the complete download to the audit trail (URL, file size, SHA-256, duration)
6. Returns success/failure to the AI Core

#### Model Download Allowlist

During onboarding setup, the following domain is added to the Gateway allowlist with the user's consent:

- `huggingface.co` (and `cdn-lfs.huggingface.co` for LFS downloads)

The onboarding screen shows: "Semblance needs to download AI models to run locally. This requires a one-time download from huggingface.co (~2-8 GB depending on your hardware). After download, your AI runs entirely offline."

The user sees the model download in the Network Monitor: "Downloading AI model: Llama-3.2-3B-Instruct-Q4_K_M.gguf (2.1 GB) from huggingface.co"

**Important:** After models are downloaded, the huggingface.co allowlist entry can optionally be removed (user choice in Settings). The AI runs entirely offline after download.

#### Model Registry

Create `packages/core/llm/model-registry.ts`:

```typescript
interface ModelRegistryEntry {
  id: string;                         // e.g., 'llama-3.2-3b-q4km'
  name: string;                       // Human-readable name
  tier: 'fast' | 'primary' | 'quality';
  parameterCount: string;             // e.g., '3B', '7B'
  quantization: string;               // e.g., 'Q4_K_M'
  format: 'gguf';
  fileSizeBytes: number;
  sha256: string;
  downloadUrl: string;
  minRamGB: number;
  recommendedProfiles: HardwareProfileTier[];
  capabilities: ('chat' | 'instruct' | 'embedding')[];
}
```

The registry is a static JSON file bundled with the app, updatable in future releases. It contains the curated list of tested, verified models with their download URLs and checksums.

#### Model Storage

Models are stored in the platform-appropriate app data directory:

- macOS: `~/Library/Application Support/Semblance/models/`
- Linux: `~/.local/share/semblance/models/`
- Windows: `%APPDATA%/Semblance/models/`

---

### D. Tiered Inference Routing

Not every task needs the same model. The router transparently selects the appropriate tier.

#### Tiers

| Tier | Use Cases | Latency Target |
|------|----------|----------------|
| `fast` | Email classification, calendar event extraction, entity recognition, subscription pattern detection, simple Q&A | <1 second |
| `primary` | Email drafting, meeting prep generation, Knowledge Moment, conversational responses, form field mapping | 3-30 seconds |
| `quality` | Deep document analysis, complex multi-step reasoning, communication style matching (future) | 30-120 seconds |

#### Implementation

Create `packages/core/llm/inference-router.ts`:

```typescript
interface InferenceRouter {
  // Callers specify what they need, not which model
  route(request: InferenceRequest): Promise<LLMResponse>;
}

interface InferenceRequest {
  task: TaskType;            // What's being done
  prompt: string;            // The actual prompt
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

type TaskType =
  | 'classify'               // → fast tier
  | 'extract'                // → fast tier
  | 'categorize'             // → fast tier
  | 'embed'                  // → embedding model (separate path)
  | 'generate'               // → primary tier
  | 'compose'                // → primary tier
  | 'reason'                 // → primary tier
  | 'analyze';               // → quality tier (falls back to primary if quality unavailable)
```

The router maps `TaskType` to a tier, then selects the appropriate loaded model. If the requested tier isn't available (e.g., user only has one model), it falls back: `quality → primary → fast`.

**For Step 9, the `fast` and `primary` tiers use the same model.** True multi-model tiering (loading two models simultaneously) is a memory management challenge that can be deferred. The routing infrastructure must exist and work correctly, but both tiers can point to the same model. The `quality` tier is optional and not loaded by default.

The key thing is: **every existing caller in the codebase that calls the LLMProvider must be updated to go through the InferenceRouter instead.** The router then calls the appropriate provider. This is the refactor that enables future tiering without touching callers again.

#### Updating Existing Callers

All existing code that calls `LLMProvider.generate()` or `LLMProvider.chat()` directly must be updated to call `InferenceRouter.route()` with the appropriate `TaskType`. This includes:

- Orchestrator tool execution (email drafting → `compose`, meeting prep → `generate`)
- Email categorization (→ `classify`)
- Calendar event extraction (→ `extract`)
- Proactive context engine (→ `generate`)
- Knowledge Moment generation (→ `generate`)
- Subscription pattern detection (→ `categorize`)
- Chat interface (→ `generate`)
- Any other direct LLMProvider calls

Search the entire codebase for direct `LLMProvider` usage and route through `InferenceRouter`. No caller should directly reference a provider after this step.

---

### E. Embedding Pipeline — End-to-End

This is the single biggest capability multiplier in Step 9. Semantic search transforms Semblance from keyword matching to genuine understanding.

#### Embedding Model

The embedding model runs through the same native runtime as the reasoning model. It's a separate, small model optimized for generating vector representations.

- Default: `all-MiniLM-L6-v2` (22M params, ~90MB GGUF) or `nomic-embed-text-v1.5` (137M params, ~275MB GGUF)
- Downloaded alongside the reasoning model during onboarding
- Loaded into memory separately from the reasoning model (embedding models are small enough to stay resident)

#### Embedding Generation

Create `packages/core/knowledge/embedding-pipeline.ts`:

```typescript
interface EmbeddingPipeline {
  // Generate embedding for a single text
  embed(text: string): Promise<number[]>;

  // Batch embed for efficiency (indexing)
  batchEmbed(texts: string[]): Promise<number[][]>;

  // Get the dimension size of the current embedding model
  dimensions(): number;
}
```

The pipeline calls through the sidecar bridge to the Rust NativeRuntime's `embed()` function.

#### Indexer Updates

Update ALL existing indexers to generate and store embeddings:

1. **File indexer** (`packages/core/knowledge/` — whatever handles document indexing):
   - After extracting text from a document, chunk it (512 token chunks with 50 token overlap)
   - Generate embeddings for each chunk via the EmbeddingPipeline
   - Store embeddings in LanceDB alongside the existing metadata

2. **Email indexer** (created in Step 6):
   - Generate embeddings for email subject + body (combined)
   - Store in LanceDB with email metadata (sender, date, thread ID)

3. **Calendar indexer** (created in Step 6):
   - Generate embeddings for event title + description + attendees
   - Store in LanceDB with calendar metadata

4. **LanceDB schema update:**
   - Ensure the vector store schema includes: `id`, `source_type` (file/email/calendar), `source_id`, `chunk_index`, `text`, `embedding` (vector), `metadata` (JSON)
   - Create appropriate vector indices for fast similarity search

#### Semantic Search

Create or update `packages/core/knowledge/semantic-search.ts`:

```typescript
interface SemanticSearch {
  // Search across all indexed sources
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

interface SearchOptions {
  limit?: number;                     // Default 10
  sourceTypes?: ('file' | 'email' | 'calendar')[];  // Filter by source
  minScore?: number;                  // Minimum similarity threshold
  dateRange?: { after?: Date; before?: Date };
}

interface SearchResult {
  sourceType: 'file' | 'email' | 'calendar';
  sourceId: string;
  chunkText: string;
  score: number;                      // Cosine similarity
  metadata: Record<string, unknown>;  // Source-specific metadata
}
```

The search flow:
1. User query → embed via EmbeddingPipeline
2. Query LanceDB for nearest neighbors
3. Return ranked results with scores and metadata

This semantic search should be wired into the Orchestrator so that when the user asks "Find the contract Sarah sent about Portland," the system uses semantic search (not keyword search) to find it.

#### Retroactive Embedding Generation

For users upgrading from Sprint 2 (or after initial onboarding with existing data):

1. A background job detects documents/emails/calendar events that have metadata but no embeddings
2. It processes them in batches (100 items at a time) with progress tracking
3. Progress is visible in the UI: "Upgrading search: 847/2,341 documents indexed..."
4. The job runs at low priority (yields to user-initiated inference)
5. When complete, semantic search is fully operational across all historical data

---

### F. Onboarding Integration

The current onboarding flow assumes Ollama is already running. Replace this with a zero-config experience.

#### New Onboarding Screens (insert between naming and data connection)

**Screen: "Setting up your AI..."**

This screen appears after the user names their Semblance and before data connection:

1. **Hardware Detection** (1-2 seconds)
   - Animated scanning indicator
   - Result displayed: "Your Mac has an M2 Pro chip with 16GB of RAM. [Name] will use a 7B parameter AI model optimized for your hardware."
   - For constrained hardware: "Your computer has 8GB of RAM. [Name] will use a compact but capable 3B model. You can upgrade to a larger model in Settings if you add more RAM."

2. **Model Download Consent**
   - "To run AI locally, [Name] needs to download a model file (~X.X GB). This is a one-time download from huggingface.co. After this, [Name] runs entirely offline."
   - "Download now" button (primary action)
   - "I already have Ollama set up" link (secondary — goes to Ollama configuration)
   - Network Monitor shows the download transparently

3. **Model Download Progress**
   - Progress bar with percentage and estimated time
   - Download speed indicator
   - "This usually takes 3-10 minutes depending on your connection"
   - Resume-on-interrupt: if the user closes and reopens, download resumes
   - Integrity verification after completion (brief spinner: "Verifying model integrity...")

4. **Ready Transition**
   - "Your AI is ready. [Name] can now think and reason entirely on your device."
   - Smooth transition to data connection screens

**Design system compliance:** These screens use the existing onboarding flow design language (DM Serif Display for headers, crossfade transitions, Warm Amber for the user's name). Follow `DESIGN_SYSTEM.md` for all component styling.

#### Existing Onboarding Updates

- Remove any screens or text that reference Ollama, model names, or terminal commands
- The Knowledge Moment screen should now use semantic search to find related documents (when available)
- The file intelligence demonstration should use semantic search for richer results

---

### G. Settings Integration

Add a new "AI Engine" section to the Settings screen:

**AI Engine Settings:**

1. **Runtime selection:**
   - "Built-in AI (default)" — uses NativeProvider
   - "Connect to Ollama" — uses OllamaProvider, shows URL input (localhost only)
   - "Custom model" — file picker for a local GGUF file

2. **Current model info:**
   - Model name, parameter count, quantization
   - Disk space used
   - Hardware profile detected

3. **Model management:**
   - "Download a different model" — shows available models from registry for the user's hardware
   - "Delete model" — reclaim disk space
   - Current download progress (if downloading)

4. **Advanced (expandable):**
   - Temperature, top-p, context window size
   - Embedding model selection
   - "Reset to recommended defaults"

---

## Commit Strategy

This step is large. Break it into logical commits:

1. **`feat: hardware detection module`** — Rust-side hardware detection, passed to Node.js via bridge. Tests for different hardware profile classifications.

2. **`feat: model registry and storage`** — Model registry JSON, storage path management, model file operations. Tests for registry lookup and path resolution.

3. **`feat: native inference runtime`** — llama-cpp-rs integration in Tauri backend, NativeRuntime Rust module, bridge protocol extensions for inference. Tests for model loading and basic generation.

4. **`feat: native provider + inference router`** — `NativeProvider` implementing `LLMProvider`, `InferenceRouter` with task-to-tier mapping. Tests for routing logic and provider selection.

5. **`refactor: route all callers through InferenceRouter`** — Update every direct `LLMProvider` call to use `InferenceRouter.route()`. No behavioral change — all existing tests must still pass.

6. **`feat: model download via Gateway`** — New `model.download` ActionType, Gateway model adapter, download with progress/resume/verification. Tests for download flow, allowlist validation, audit trail logging.

7. **`feat: embedding pipeline`** — `EmbeddingPipeline` implementation, NativeRuntime embed() support, batch processing. Tests for embedding generation and dimension validation.

8. **`feat: indexer embedding integration`** — Update file/email/calendar indexers to generate and store embeddings. Retroactive embedding job. Tests for embedding storage and retrieval in LanceDB.

9. **`feat: semantic search`** — `SemanticSearch` implementation, LanceDB vector queries, Orchestrator integration. Tests for search accuracy and source filtering.

10. **`feat: onboarding runtime setup`** — New onboarding screens for hardware detection, model download consent, download progress. Design system compliance.

11. **`feat: settings AI engine section`** — Runtime selection, model info, model management, advanced settings.

12. **`test: Step 9 integration tests`** — End-to-end tests covering: fresh install → hardware detection → model download → inference → embedding → semantic search.

13. **`security: privacy audit update`** — Update privacy audit to verify NativeRuntime doesn't introduce network access in Core, model downloads go through Gateway, audit trail captures all model operations.

---

## Exit Criteria

**Every criterion must pass. No partial credit.**

### Runtime

1. **Native inference works on macOS (Apple Silicon).** A GGUF model loads via llama-cpp-rs with Metal backend and generates coherent text. Streaming tokens arrive at the frontend.

2. **Native inference works on CPU fallback.** The same model loads and generates text without GPU acceleration (slower but functional). This covers Linux/Windows without discrete GPU.

3. **Hardware detection returns accurate profile.** On Apple Silicon Mac, profile detects `apple_silicon_high` or `apple_silicon_base` correctly based on RAM and chip variant. On CPU-only machines, detects `desktop_cpu` or `desktop_constrained`. Tests mock different hardware configurations.

4. **Model download flows through Gateway.** The model download request appears in the audit trail with: URL, file size, SHA-256, timestamp, duration. The Network Monitor shows the download in progress and after completion.

5. **Model download resumes on interrupt.** If a download is cancelled or the app is closed mid-download, reopening resumes from where it left off (HTTP Range headers).

6. **Model integrity verification works.** After download, SHA-256 of the file matches the expected hash from the model registry. If verification fails, the file is deleted and download retries.

7. **Ollama still works.** Switching to "Connect to Ollama" in Settings and providing a running Ollama URL allows inference. All existing Ollama tests pass without modification.

### Inference Routing

8. **InferenceRouter routes all tasks.** No code path in the codebase calls `LLMProvider` directly. Every inference call goes through `InferenceRouter.route()` with an appropriate `TaskType`.

9. **Task-to-tier mapping is correct.** Classification tasks (`classify`, `extract`, `categorize`) map to `fast` tier. Generation tasks (`generate`, `compose`, `reason`) map to `primary` tier. Analysis tasks (`analyze`) map to `quality` tier with fallback to `primary`.

10. **All existing Sprint 2 features work with NativeProvider.** Email categorization, calendar extraction, meeting prep, Knowledge Moment, subscription detection, weekly digest — all functional with the native runtime. No regressions.

### Embedding Pipeline

11. **Embedding model loads and generates vectors.** The embedding model produces vectors of the expected dimension (384 for all-MiniLM-L6-v2, 768 for nomic-embed-text). Vectors are non-zero and vary by input text.

12. **File indexer generates embeddings.** When a document is indexed, its chunks have embeddings stored in LanceDB. Verify by querying LanceDB directly after indexing a test document.

13. **Email indexer generates embeddings.** When emails are indexed (from Sprint 2 infrastructure), embeddings are stored in LanceDB alongside email metadata.

14. **Calendar indexer generates embeddings.** Calendar events have embeddings stored in LanceDB.

15. **Semantic search returns relevant results.** Given indexed documents about "Portland contract renewal," a search for "the deal Sarah mentioned about Oregon" returns relevant results with high similarity scores. Test with at least 5 distinct queries against a test corpus.

16. **Semantic search filters by source type.** Searching with `sourceTypes: ['email']` only returns email results, not files or calendar events.

17. **Retroactive embedding generation works.** Given existing indexed data without embeddings, the background job processes all items and generates embeddings. Progress is tracked. After completion, semantic search works across all historical data.

### Onboarding

18. **Zero-config onboarding flow works.** The onboarding screens appear in sequence: Welcome → Naming → "Setting up your AI..." (hardware detection + model download) → Data connection → Knowledge Moment → Autonomy selection → Ready. No screen references Ollama or terminal commands.

19. **Hardware profile is displayed to user.** The onboarding shows what hardware was detected and what model was selected, in plain language (not model identifiers).

20. **Model download progress is visible.** The download screen shows: percentage, estimated time, download speed. The Network Monitor simultaneously shows the download.

### Settings

21. **AI Engine settings section exists.** Users can switch between Built-in AI, Ollama, and Custom model. Current model info is displayed. Model management (download different, delete) works.

### Testing & Privacy

22. **All existing tests pass.** The 1,239 Sprint 2 tests pass without modification (except where callers were updated to use InferenceRouter — those tests should be updated to match).

23. **New tests: 120-150 added.** Covering: hardware detection, model registry, native inference, inference routing, embedding pipeline, semantic search, model download flow, onboarding screens, settings integration.

24. **Privacy audit clean.** The privacy audit exits 0. Specifically:
    - `packages/core/` has no direct llama.cpp imports or native bindings (it goes through the bridge)
    - Model downloads go through Gateway (not direct HTTP from Core)
    - No new network access in the AI Core process
    - Model download domain appears in the audit trail

25. **Total tests: ~1,360-1,390.** Running total from 1,239 baseline + 120-150 new.

---

## What This Step Does NOT Include

Do not build these. They are out of scope.

- **MLX runtime integration** — Step 14 (mobile) will add MLX for iOS and optionally for macOS optimization
- **Multi-model simultaneous loading** — Both `fast` and `primary` tiers point to the same model for now. True multi-model memory management is a Sprint 4 optimization
- **CUDA/Vulkan GPU backends** — Metal (macOS) and CPU are the Step 9 targets. CUDA/Vulkan follow in Step 14 or Sprint 4
- **Mobile inference** — Step 14
- **Android hardware detection** — Step 14
- **Model fine-tuning or training** — Never (local inference only, no training)
- **Cloud inference fallback** — Never (violates architecture)
- **Model update checking** — Future. Models are static after download until user manually updates.
- **Financial categorization using the new runtime** — Step 10
- **Communication style matching** — Step 11
- **Form field mapping** — Step 12
- **Any Sprint 3 feature that uses inference** — This step provides the runtime; subsequent steps use it

---

## Autonomous Decision Authority

Claude Code may make the following decisions independently (document in commit messages):

1. **Specific GGUF model file selection** from Hugging Face, based on quality, size, and GGUF availability. Document which models were chosen and why.

2. **llama-cpp-rs version and configuration** — select the appropriate version and feature flags. If `llama-cpp-rs` proves problematic (unmaintained, doesn't compile), `llama-cpp-sys` or another maintained Rust binding for llama.cpp may be substituted. Document the decision.

3. **Chunking strategy for embeddings** — 512 tokens with 50-token overlap is the starting point. Adjust if testing reveals better results with different parameters. Document the change.

4. **LanceDB schema details** — exact column names, index types, metadata JSON structure. Must support the `SemanticSearch` interface defined above.

5. **Sidecar bridge protocol extensions** — new message types needed for native inference (generate, embed, hardware info). Must follow the existing NDJSON protocol pattern.

6. **Onboarding screen layout details** — exact positioning, animation timing, copy refinements within the design system constraints. The functional flow (hardware detect → consent → download → ready) is fixed; the visual details are flexible.

7. **Error handling and retry logic** — for model downloads, inference failures, embedding generation errors. Must be user-friendly (no stack traces in the UI).

### Escalation Required

Claude Code MUST escalate for:

- Any change to the Gateway security model (allowlist rules, validation pipeline, audit trail schema changes beyond adding new ActionTypes)
- Any proposal to add network capability to `packages/core/`
- Any change to the IPC protocol that breaks backward compatibility
- Adding any dependency not on the pre-approved list that exceeds 500KB or has >20 transitive dependencies
- If llama-cpp-rs or any Rust binding cannot be made to work reliably — this is a project-level risk that Orbital Directors need to assess
- If the model download size exceeds 10GB for any default profile — this affects onboarding UX significantly
- Any decision about what model names or technical details are shown to the user (user-facing copy is a product decision)

---

## Risk Mitigation

This is the highest-risk step in the project. Here's how to manage the risks:

### Risk 1: Rust FFI Compilation

llama.cpp Rust bindings require compiling C++ code. This can fail for platform-specific reasons.

**Mitigation:** Start with commit 3 (native inference runtime) early. If it doesn't compile clean on the target platform within a reasonable timeframe, escalate immediately. Do not spend days debugging C++ compilation — flag it and we'll assess alternatives.

### Risk 2: Memory Management

Loading a 4-7GB model into memory alongside the app, the knowledge graph, and the embedding model is tight on 8GB machines.

**Mitigation:** Only one reasoning model loaded at a time. Embedding model stays resident (it's small, ~90-275MB). On constrained hardware (8GB profile), use the 3B model (~2GB). Monitor memory usage in tests. If the total footprint exceeds 60% of available RAM on the target profile, something is wrong.

### Risk 3: Inference Quality

A quantized local model may produce worse results than Ollama with a manually-selected model.

**Mitigation:** Run the existing test suite (which was built against Ollama) against the native runtime. If classification accuracy drops or generation quality degrades noticeably, document the delta and escalate. The native runtime must be at least as good as Ollama with a default model for the same parameter count.

### Risk 4: Download Reliability

Multi-GB downloads over consumer internet connections fail, stall, and corrupt.

**Mitigation:** Resume-on-interrupt, SHA-256 verification, progress persistence across app restarts. If verification fails, delete and re-download (don't try to salvage a corrupted file). Show clear error messages for network failures with "Try again" action.

---

## Reference Documents

Before starting, read these files from the project root:

- **`CLAUDE.md`** — Architecture rules, boundary rules, code quality standards, escalation criteria
- **`docs/DESIGN_SYSTEM.md`** — Visual design reference for all UI work
- **`packages/core/llm/`** — Existing LLM layer (OllamaProvider, ModelManager, types)
- **`packages/core/knowledge/`** — Existing knowledge graph (document store, vector store)
- **`packages/gateway/services/`** — Existing Gateway adapter pattern (IMAP, SMTP, CalDAV)
- **`packages/gateway/ipc/validator.ts`** — Validation pipeline (for adding new ActionTypes)
- **`packages/desktop/src-tauri/`** — Existing Rust backend (sidecar bridge pattern)

---

## The Bar

After this step, Semblance is a consumer product. Not a developer tool. Not a project that requires a README with terminal commands. A product where someone downloads the app, opens it, and has a working AI.

The difference between "install Ollama, pull a model, then launch our app" and "open the app" is the difference between a project and a product. Step 9 crosses that line.

Build accordingly.
